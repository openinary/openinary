import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudStorage } from "./cloud-storage";

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
