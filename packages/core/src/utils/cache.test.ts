import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { deleteCachedFiles, derivativeCachePath } from "./cache";
import { saveToCaches } from "../services/transform-steps";

// Deleting photos/cat.jpg used to match every cache file containing "cat",
// taking catalog.jpg's and concat.png's derivatives with it.
test("deleteCachedFiles removes the original's derivatives, not its namesakes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cache-test-"));
  try {
    const kept = [
      derivativeCachePath(dir, "photos/catalog.jpg", { width: 100 }),
      derivativeCachePath(dir, "photos/concat.png", { width: 100 }),
    ];
    for (const p of [
      derivativeCachePath(dir, "photos/cat.jpg", { width: 100 }),
      derivativeCachePath(dir, "photos/cat.jpg", { width: 200, format: "avif" }),
      ...kept,
    ]) {
      await writeFile(p, "x");
    }

    assert.equal(await deleteCachedFiles(dir, "photos/cat.jpg"), 2);
    assert.deepEqual((await readdir(dir)).sort(), kept.map((p) => basename(p)).sort());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// The worker writes where enqueueTransform derived, lookups derive again from
// the URL's params: key order differing between the two must not matter.
test("derivativeCachePath ignores param order", () => {
  assert.equal(
    derivativeCachePath("/c", "v.mp4", { width: 640, quality: 80 }),
    derivativeCachePath("/c", "v.mp4", { quality: 80, width: 640 }),
  );
  assert.notEqual(
    derivativeCachePath("/c", "v.mp4", { width: 640 }),
    derivativeCachePath("/c", "v.mp4", { width: 320 }),
  );
});

// A derivative not (or no longer) popular lives in the cloud cache only: a
// local copy left from before would be served stale ahead of it.
test("a cloud upload removes the local copy of a derivative not kept local", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cache-test-"));
  try {
    const cachePath = derivativeCachePath(dir, "unpopular.jpg", { width: 1 });
    await writeFile(cachePath, "stale");
    const storage = { upload: async () => {} } as any;
    await saveToCaches(storage, "unpopular.jpg", { width: 1 }, cachePath, Buffer.from("x"), "image/jpeg");
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
