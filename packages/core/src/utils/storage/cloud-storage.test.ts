import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudStorage } from "./cloud-storage";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StorageConfig } from "./types";
import type { BucketStats } from "./stats-tracker";

const storageWith = (exists: () => boolean) => {
  const storage = new CloudStorage({
    region: "auto",
    accessKeyId: "k",
    secretAccessKey: "s",
    bucketName: "b",
  });
  (storage as any).s3Client = { objectExists: async () => exists() };
  return storage;
};

// Existence answers are memoized per instance. Deleting or replacing a file
// has to drop the memo for its derivatives, or a deleted file's transform
// keeps answering "exists" until the TTL runs out.
test("invalidateAllCacheEntries forgets an original's derivatives, and only those", async () => {
  let present = true;
  const storage = storageWith(() => present);
  assert.equal(await storage.exists("photos/cat.jpg", { width: 100 }), true);
  assert.equal(await storage.exists("photos/catalog.jpg", { width: 100 }), true);

  present = false;
  storage.invalidateAllCacheEntries("photos/cat.jpg");

  assert.equal(await storage.exists("photos/cat.jpg", { width: 100 }), false);
  assert.equal(await storage.exists("photos/catalog.jpg", { width: 100 }), true, "still memoized");
});

test("derivative keys come from the injected keyFor", async () => {
  const keys: string[] = [];
  const storage = new CloudStorage({
    region: "auto",
    accessKeyId: "k",
    secretAccessKey: "s",
    bucketName: "b",
    keyFor: (path, params) => `cache/${path}:${JSON.stringify(params)}`,
  });
  (storage as any).s3Client = {
    objectExists: async (key: string) => {
      keys.push(key);
      return false;
    },
  };
  await storage.exists("a.jpg", { width: 1 });
  assert.deepEqual(keys, ['cache/a.jpg:{"width":1}']);
});

// A transient S3 error used to come back as false, which the transform
// pipeline treats as a missing original: a 404 and forgotten derivatives.
test("existsOriginal is false only on a 404; other storage errors throw", async () => {
  const notFound = Object.assign(new Error("NotFound"), { $metadata: { httpStatusCode: 404 } });
  const throttled = Object.assign(new Error("SlowDown"), { $metadata: { httpStatusCode: 503 } });
  let error: Error = notFound;
  const storage = new CloudStorage({ region: "auto", accessKeyId: "k", secretAccessKey: "s", bucketName: "b" });
  (storage as any).s3Client.s3Client = { send: async () => { throw error; } };

  assert.equal(await storage.existsOriginal("gone.jpg"), false);
  error = throttled;
  await assert.rejects(storage.existsOriginal("flaky.jpg"), /SlowDown/);
});

// #184: deleting one asset HEADs every cached object. Serially, a big cache
// pushed single-asset deletion past client timeouts.
const cacheBucket = (
  send: (command: any) => Promise<any>,
) => {
  const storage = new CloudStorage({ region: "auto", accessKeyId: "k", secretAccessKey: "s", bucketName: "b" });
  (storage as any).s3Client.s3Client = { send };
  (storage as any).loadPersistedStats = async () => null;
  return storage;
};
const listing = (n: number) => ({
  Contents: Array.from({ length: n }, (_, i) => ({ Key: `cache/${i}.jpg`, Size: 1 })),
  IsTruncated: false,
});
const kind = (command: any) => command.constructor.name;

test("asset cache cleanup reads metadata concurrently, bounded, and deletes only that asset's derivatives", async () => {
  let active = 0;
  let peak = 0;
  const deleted: string[] = [];
  const storage = cacheBucket(async (command) => {
    if (kind(command) === "ListObjectsV2Command") return listing(40);
    if (kind(command) === "HeadObjectCommand") {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setImmediate(r));
      active--;
      const mine = command.input.Key === "cache/7.jpg";
      return { ContentLength: 1, Metadata: { "x-original-path": mine ? "a.jpg" : "b.jpg" } };
    }
    if (kind(command) === "DeleteObjectsCommand") {
      deleted.push(...command.input.Delete.Objects.map((o: any) => o.Key));
      return {};
    }
    return {};
  });
  assert.equal(await storage.deleteAllCachedTransformations("a.jpg"), 1);
  assert.deepEqual(deleted, ["cache/7.jpg"]);
  assert.ok(peak > 1 && peak <= 16, `peak ${peak}`);
});

test("asset cache cleanup fails on a metadata error instead of reporting success", async () => {
  let deletes = 0;
  const storage = cacheBucket(async (command) => {
    if (kind(command) === "ListObjectsV2Command") return listing(3);
    if (kind(command) === "HeadObjectCommand") {
      if (command.input.Key === "cache/1.jpg")
        throw Object.assign(new Error("SlowDown"), { $metadata: { httpStatusCode: 503 } });
      throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    }
    if (kind(command) === "DeleteObjectsCommand") deletes++;
    return {};
  });
  await assert.rejects(storage.deleteAllCachedTransformations("a.jpg"), /SlowDown/);
  assert.equal(deletes, 0);
});

test("a partially failed bulk delete is an error, not a success", async () => {
  const storage = cacheBucket(async (command) => {
    if (kind(command) === "ListObjectsV2Command") return listing(2);
    if (kind(command) === "DeleteObjectsCommand")
      return { Errors: [{ Key: "cache/1.jpg", Code: "AccessDenied" }] };
    return {};
  });
  await assert.rejects(storage.clearAllCache(), /cache\/1\.jpg: AccessDenied/);
});


const sampleStats: BucketStats = {
  storage: { size: 100, fileCount: 2 },
  cache: { size: 20, fileCount: 1 },
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const statsStorage = (overrides: Partial<StorageConfig> = {}) =>
  new CloudStorage({
    region: "us-east-1",
    accessKeyId: "k",
    secretAccessKey: "s",
    bucketName: "b",
    ...overrides,
  });

test("local stats persist across storage instances without S3 stats operations", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "openinary-stats-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const statsPath = join(dir, "nested", "stats.json");
  const local = (overrides: Partial<StorageConfig> = {}) => {
    const storage = statsStorage({ statsPath, ...overrides });
    (storage as any).s3Client = {
      objectExists: async () => assert.fail("unexpected S3 HEAD"),
      downloadObject: async () => assert.fail("unexpected S3 GET"),
      uploadObject: async () => assert.fail("unexpected S3 PUT"),
    };
    return storage;
  };

  const storage = local();
  assert.equal(await storage.loadPersistedStats(), null);
  await storage.persistStats(sampleStats);
  assert.deepEqual(await local().loadPersistedStats(), sampleStats);
  assert.equal(JSON.parse(await readFile(statsPath, "utf8")).storage.size, 100);

  const updated = { ...sampleStats, storage: { size: 200, fileCount: 3 } };
  await Promise.all([storage.persistStats(sampleStats), storage.persistStats(updated)]);
  assert.deepEqual(await local().loadPersistedStats(), updated);

  assert.equal(await local({ bucketName: "other" }).loadPersistedStats(), null);
  assert.equal(await local({ endpoint: "https://example.com" }).loadPersistedStats(), null);
  assert.equal(await local({ region: "us-west-2" }).loadPersistedStats(), null);
  assert.equal(await local({ prefix: "" }).loadPersistedStats(), null);
  assert.deepEqual(await local({ prefix: "public/" }).loadPersistedStats(), updated);

  await writeFile(statsPath, "{broken");
  assert.equal(await storage.loadPersistedStats(), null);
  await storage.persistStats(sampleStats);
  assert.deepEqual(await storage.loadPersistedStats(), sampleStats);
});

test("S3 stats persistence remains the default", async () => {
  const storage = statsStorage();
  let persisted: Buffer | undefined;
  (storage as any).s3Client = {
    objectExists: async (key: string) => {
      assert.equal(key, ".openinary/stats.json");
      return persisted !== undefined;
    },
    downloadObject: async (key: string) => {
      assert.equal(key, ".openinary/stats.json");
      return persisted;
    },
    uploadObject: async (key: string, body: Buffer, contentType: string) => {
      assert.equal(key, ".openinary/stats.json");
      assert.equal(contentType, "application/json");
      persisted = body;
    },
  };
  assert.equal(await storage.loadPersistedStats(), null);
  await storage.persistStats(sampleStats);
  assert.deepEqual(await storage.loadPersistedStats(), sampleStats);
});
