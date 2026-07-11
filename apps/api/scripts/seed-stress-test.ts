#!/usr/bin/env -S npx tsx
/**
 * Seeds ~50,000 synthetic objects (~3GB) into the configured storage bucket
 * under public/stress-test-50k/, to reproduce the scenario fixed by PR #92
 * (lazy per-folder storage listing). See the plan for the full rationale.
 *
 * Usage: pnpm --filter api exec tsx scripts/seed-stress-test.ts
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { createStorageClient } from "../src/utils/storage/factory";

// Relative to the storage root; CloudStorage#uploadOriginal adds the
// "public/" prefix itself, so the real S3 key ends up as public/<ROOT_PREFIX>/...
const ROOT_PREFIX = "stress-test-50k";
const EXPECTED_BUCKET = process.env.STRESS_TEST_EXPECTED_BUCKET;
const CONCURRENCY = 50;
const MIN_SIZE = 20_000;
const MAX_SIZE = 100_000;

const CONTENT_TYPES: { ext: string; type: string }[] = [
  { ext: "jpg", type: "image/jpeg" },
  { ext: "png", type: "image/png" },
  { ext: "webp", type: "image/webp" },
];

type UploadJob = { key: string; contentType: string };

function randomSize(): number {
  return MIN_SIZE + Math.floor(Math.random() * (MAX_SIZE - MIN_SIZE));
}

function pickContentType(i: number): { ext: string; type: string } {
  return CONTENT_TYPES[i % CONTENT_TYPES.length];
}

/** ~20 top folders x ~25 subfolders x ~90 files ≈ 45,000 files, depth 2-3. */
function buildNestedJobs(): UploadJob[] {
  const jobs: UploadJob[] = [];
  let i = 0;
  for (let top = 0; top < 20; top++) {
    for (let sub = 0; sub < 25; sub++) {
      for (let file = 0; file < 90; file++) {
        const { ext, type } = pickContentType(i);
        jobs.push({
          key: `${ROOT_PREFIX}/nested/folder-${top}/sub-${sub}/img-${file}.${ext}`,
          contentType: type,
        });
        i++;
      }
    }
  }
  return jobs;
}

/** A single flat folder with ~4,000 files and no subfolders. */
function buildFlatFolderJobs(): UploadJob[] {
  const jobs: UploadJob[] = [];
  for (let i = 0; i < 4000; i++) {
    const { ext, type } = pickContentType(i);
    jobs.push({
      key: `${ROOT_PREFIX}/flat-folder/img-${i}.${ext}`,
      contentType: type,
    });
  }
  return jobs;
}

/** ~1,000 direct subfolders, one file each. */
function buildManySubfoldersJobs(): UploadJob[] {
  const jobs: UploadJob[] = [];
  for (let i = 0; i < 1000; i++) {
    const { ext, type } = pickContentType(i);
    jobs.push({
      key: `${ROOT_PREFIX}/many-subfolders/folder-${i}/img.${ext}`,
      contentType: type,
    });
  }
  return jobs;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function runNext(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runNext),
  );
}

async function main() {
  const storage = createStorageClient();
  if (!storage) {
    console.error(
      "Storage configuration incomplete (STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY / STORAGE_BUCKET_NAME). Aborting.",
    );
    process.exit(1);
  }

  const bucket = process.env.STORAGE_BUCKET_NAME || "";
  if (EXPECTED_BUCKET && bucket !== EXPECTED_BUCKET) {
    console.error(
      `Refusing to seed: STORAGE_BUCKET_NAME="${bucket}" does not match STRESS_TEST_EXPECTED_BUCKET="${EXPECTED_BUCKET}".`,
    );
    process.exit(1);
  }

  const jobs = [
    ...buildNestedJobs(),
    ...buildFlatFolderJobs(),
    ...buildManySubfoldersJobs(),
  ];

  console.log(`Bucket: ${bucket}`);
  console.log(`Prefix: public/${ROOT_PREFIX}/`);
  console.log(`Objects to upload: ${jobs.length}`);

  let uploaded = 0;
  let bytesUploaded = 0;
  const start = Date.now();

  await runPool(jobs, CONCURRENCY, async (job) => {
    const size = randomSize();
    const buffer = randomBytes(size);
    await storage.uploadOriginal(job.key, buffer, job.contentType);
    uploaded++;
    bytesUploaded += size;
    if (uploaded % 1000 === 0 || uploaded === jobs.length) {
      const elapsedSec = (Date.now() - start) / 1000;
      const mb = (bytesUploaded / 1_000_000).toFixed(1);
      const rate = (uploaded / elapsedSec).toFixed(1);
      console.log(
        `${uploaded}/${jobs.length} uploaded, ${mb}MB, ${rate} obj/s, ${elapsedSec.toFixed(0)}s elapsed`,
      );
    }
  });

  const totalSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `Done: ${uploaded} objects, ${(bytesUploaded / 1_000_000_000).toFixed(2)}GB, ${totalSec}s`,
  );
}

main()
  .then(() => process.exit(0)) // the S3 client's keep-alive HTTPS agent would otherwise hold the process open
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
