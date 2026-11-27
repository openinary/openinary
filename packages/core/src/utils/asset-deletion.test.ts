import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteAssetCompletely } from "./asset-deletion";

// Regression: a local folder's files were recursed into as
// "<public>/<folder>/<file>" and resolved under <public> again, so they were
// "not found" and their video jobs outlived them.
test("deleting a local folder clears the jobs of the files inside it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "asset-deletion-"));
  try {
    const paths = { public: join(dir, "public"), cache: join(dir, "cache"), temp: join(dir, "temp") };
    await mkdir(join(paths.public, "clips"), { recursive: true });
    await writeFile(join(paths.public, "clips", "a.mp4"), "x");
    const cleared: string[] = [];
    const jobStore = {
      deleteJobsByFilePath: async (filePath: string) => (cleared.push(filePath), 0),
    } as any;

    await deleteAssetCompletely("clips", null, jobStore, paths);

    assert.deepEqual(cleared.sort(), ["clips", "clips/a.mp4"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
