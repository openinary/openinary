#!/usr/bin/env -S npx tsx
/**
 * Times the exact sequence GET /storage?path=stress-test-50k/many-subfolders
 * performs server-side: one listLevel() call, then a getFolderSummary() call
 * per subfolder batched 16 at a time - to quantify why that folder is slow.
 * Diagnostic only, not wired into any app code.
 */
import "dotenv/config";
import { createStorageClient } from "../src/utils/storage/factory";

async function main() {
  const storage = createStorageClient();
  if (!storage) {
    console.error("Storage configuration incomplete.");
    process.exit(1);
  }

  const levelPath = "stress-test-50k/many-subfolders";

  const t0 = Date.now();
  const { folderNames, files } = await storage.listLevel(levelPath);
  const t1 = Date.now();
  console.log(`listLevel: ${folderNames.length} folders, ${files.length} files in ${t1 - t0}ms`);

  const batchSize = 16;
  let done = 0;
  const batchTimes: number[] = [];
  for (let i = 0; i < folderNames.length; i += batchSize) {
    const batch = folderNames.slice(i, i + batchSize);
    const bStart = Date.now();
    await Promise.all(
      batch.map((name) => storage.getFolderSummary(`${levelPath}/${name}`)),
    );
    batchTimes.push(Date.now() - bStart);
    done += batch.length;
  }
  const t2 = Date.now();

  const avgBatch = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
  const maxBatch = Math.max(...batchTimes);
  console.log(
    `getFolderSummary: ${done} folders, ${batchTimes.length} batches of ${batchSize}, ${t2 - t1}ms total`,
  );
  console.log(`avg batch: ${avgBatch.toFixed(0)}ms, max batch: ${maxBatch}ms`);
  console.log(`TOTAL /storage?path=... server time: ${t2 - t0}ms`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
