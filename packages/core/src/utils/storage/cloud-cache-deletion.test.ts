import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { CloudStorage } from "./cloud-storage";
import { KeyGenerator } from "./key-generator";
import { resetBucketStatsTracker } from "./stats-tracker";

beforeEach((t) => {
  resetBucketStatsTracker();
  // Keep aggregate bookkeeping from initiating an unrelated bucket scan.
  t.mock.method(CloudStorage.prototype, "loadPersistedStats", async () => ({
    storage: { size: 100, fileCount: 1 },
    cache: { size: 100000, fileCount: 10000 },
    updatedAt: new Date().toISOString(),
  }));
});
afterEach(() => resetBucketStatsTracker());

// Exercise the storage layer, replacing only network I/O and its cleanup timer.
test("asset cleanup ignores unrelated scoped derivatives and clears existence cache", async (t) => {
  t.mock.method(globalThis, "setInterval", () => ({ unref() {} }) as any);
  const target = KeyGenerator.generateKey("photos/a.jpg", { width: 100 });
  const other = KeyGenerator.generateKey("photos/b.jpg", { width: 100 });
  const objects = new Map([
    [target, 10],
    [other, 20],
    ["public/photos/a.jpg", 30],
    ["public/photos/b.jpg", 40],
  ]);
  for (let i = 0; i < 5000; i++) {
    objects.set(`cache/assets/unrelated-${i}/derivative.jpg`, 1);
  }
  let heads = 0;
  const listings: string[] = [];
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    if (command instanceof ListObjectsV2Command) {
      const { Prefix, Delimiter } = command.input;
      listings.push(Prefix!);
      const matching = [...objects].filter(([key]) => key.startsWith(Prefix!));
      const prefixes = Delimiter
        ? [
            ...new Set(
              matching
                .filter(([key]) =>
                  key.slice(Prefix!.length).includes(Delimiter),
                )
                .map(
                  ([key]) =>
                    Prefix +
                    key.slice(Prefix!.length).split(Delimiter)[0] +
                    Delimiter,
                ),
            ),
          ]
        : [];
      const contents = matching.filter(
        ([key]) => !Delimiter || !key.slice(Prefix!.length).includes(Delimiter),
      );
      assert.ok(
        contents.length + prefixes.length <= 1000,
        "unrelated scoped assets must fit in one legacy-discovery page",
      );
      return {
        Contents: contents.map(([Key, Size]) => ({ Key, Size })),
        CommonPrefixes: prefixes.map((Prefix) => ({ Prefix })),
        IsTruncated: false,
      };
    }
    if (command instanceof HeadObjectCommand) {
      heads++;
      if (!objects.has(command.input.Key!))
        throw Object.assign(new Error(), { name: "NotFound" });
      return {
        ContentLength: objects.get(command.input.Key!),
        Metadata: {
          "x-original-path":
            command.input.Key === target ? "photos%2Fa.jpg" : "photos%2Fb.jpg",
        },
      };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key!);
      return {};
    }
    if (command instanceof DeleteObjectsCommand) {
      for (const obj of command.input.Delete!.Objects!)
        objects.delete(obj.Key!);
      return {};
    }
    throw new Error(`Unexpected command ${command.constructor.name}`);
  });
  const storage = new CloudStorage({
    bucketName: "test",
    region: "us-east-1",
    accessKeyId: "test",
    secretAccessKey: "test",
  });
  assert.equal(await storage.exists("photos/a.jpg", { width: 100 }), true);
  heads = 0;
  assert.equal(await storage.deleteAllCachedTransformations("photos/a.jpg"), 1);
  assert.equal(heads, 0, "scoped cache deletion needs no metadata requests");
  assert.ok(listings.some((prefix) => prefix !== "cache/"));
  assert.equal(objects.has(target), false);
  assert.equal(objects.has(other), true);
  assert.equal(objects.has("public/photos/a.jpg"), true);
  assert.equal(await storage.exists("photos/a.jpg", { width: 100 }), false);
  await storage.deleteOriginal("photos/a.jpg");
  assert.equal(objects.has("public/photos/a.jpg"), false);
  assert.equal(objects.has("public/photos/b.jpg"), true);
});

test("legacy cache cleanup preserves unrelated objects and surfaces metadata failures", async (t) => {
  t.mock.method(globalThis, "setInterval", () => ({ unref() {} }) as any);
  const objects = new Map([
    ["cache/legacy-a.jpg", "photos/a.jpg"],
    ["cache/legacy-b.jpg", "photos/b.jpg"],
  ]);
  let failMetadata = true;
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    if (command instanceof ListObjectsV2Command)
      return {
        Contents:
          command.input.Prefix === "cache/"
            ? [...objects.keys()].map((Key) => ({ Key, Size: 10 }))
            : [],
      };
    if (command instanceof HeadObjectCommand) {
      if (failMetadata) throw new Error("metadata unavailable");
      return {
        Metadata: {
          "x-original-path": encodeURIComponent(
            objects.get(command.input.Key!)!,
          ),
        },
      };
    }
    if (command instanceof DeleteObjectsCommand) {
      for (const obj of command.input.Delete!.Objects!)
        objects.delete(obj.Key!);
      return {};
    }
    throw new Error(`Unexpected command ${command.constructor.name}`);
  });
  const storage = new CloudStorage({
    bucketName: "test",
    region: "us-east-1",
    accessKeyId: "test",
    secretAccessKey: "test",
  });
  await assert.rejects(
    storage.deleteAllCachedTransformations("photos/a.jpg"),
    /metadata unavailable/,
  );
  assert.equal(objects.size, 2);
  failMetadata = false;
  assert.equal(await storage.deleteAllCachedTransformations("photos/a.jpg"), 1);
  assert.deepEqual([...objects.keys()], ["cache/legacy-b.jpg"]);
});

test("partial bulk deletion is reported as a cleanup failure", async (t) => {
  t.mock.method(globalThis, "setInterval", () => ({ unref() {} }) as any);
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    if (command instanceof ListObjectsV2Command)
      return {
        Contents:
          command.input.Prefix === "cache/"
            ? []
            : [{ Key: `${command.input.Prefix}a.jpg`, Size: 10 }],
      };
    if (command instanceof DeleteObjectsCommand)
      return {
        Errors: [
          { Key: command.input.Delete!.Objects![0].Key, Code: "AccessDenied" },
        ],
      };
    throw new Error(`Unexpected command ${command.constructor.name}`);
  });
  const storage = new CloudStorage({
    bucketName: "test",
    region: "us-east-1",
    accessKeyId: "test",
    secretAccessKey: "test",
  });
  await assert.rejects(
    storage.deleteAllCachedTransformations("photos/a.jpg"),
    /AccessDenied/,
  );
});

test("legacy metadata lookups run concurrently with a bounded fan-out", async (t) => {
  t.mock.method(globalThis, "setInterval", () => ({ unref() {} }) as any);
  let active = 0;
  let peak = 0;
  let inspected = 0;
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    if (command instanceof ListObjectsV2Command)
      return {
        Contents:
          command.input.Prefix === "cache/"
            ? Array.from({ length: 40 }, (_, i) => ({
                Key: `cache/legacy-${i}.jpg`,
                Size: 10,
              }))
            : [],
      };
    if (command instanceof HeadObjectCommand) {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      inspected++;
      return { Metadata: { "x-original-path": "unrelated.jpg" } };
    }
    throw new Error(`Unexpected command ${command.constructor.name}`);
  });
  const storage = new CloudStorage({
    bucketName: "test",
    region: "us-east-1",
    accessKeyId: "test",
    secretAccessKey: "test",
  });
  assert.equal(await storage.deleteAllCachedTransformations("photos/a.jpg"), 0);
  assert.equal(inspected, 40);
  assert.ok(
    peak > 1 && peak <= 16,
    `expected concurrent, bounded requests; got ${peak}`,
  );
});

test("later bulk-delete failures invalidate existence cache for clear-all retries", async (t) => {
  t.mock.method(globalThis, "setInterval", () => ({ unref() {} }) as any);
  let batches = 0;
  const target = KeyGenerator.generateKey("photos/a.jpg", { width: 100 });
  let targetExists = true;
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    if (command instanceof HeadObjectCommand) {
      if (!targetExists) throw Object.assign(new Error(), { name: "NotFound" });
      return {};
    }
    if (command instanceof ListObjectsV2Command) {
      if (command.input.ContinuationToken)
        return { Contents: [{ Key: "cache/last.jpg", Size: 10 }] };
      return {
        Contents: [
          { Key: target, Size: 10 },
          ...Array.from({ length: 999 }, (_, i) => ({
            Key: `cache/${i}.jpg`,
            Size: 10,
          })),
        ],
        IsTruncated: true,
        NextContinuationToken: "second-page",
      };
    }
    if (command instanceof DeleteObjectsCommand) {
      batches++;
      assert.ok(command.input.Delete!.Objects!.length <= 1000);
      if (batches === 1) {
        targetExists = false;
        return {};
      }
      return { Errors: [{ Key: "cache/last.jpg", Code: "AccessDenied" }] };
    }
    throw new Error(`Unexpected command ${command.constructor.name}`);
  });
  const storage = new CloudStorage({
    bucketName: "test",
    region: "us-east-1",
    accessKeyId: "test",
    secretAccessKey: "test",
  });
  assert.equal(await storage.exists("photos/a.jpg", { width: 100 }), true);
  await assert.rejects(storage.clearAllCache(), /AccessDenied/);
  assert.equal(batches, 2);
  assert.equal(await storage.exists("photos/a.jpg", { width: 100 }), false);
});
