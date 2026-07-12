#!/usr/bin/env -S npx tsx
/**
 * Deletes everything uploaded by seed-stress-test.ts under
 * public/stress-test-50k/. The prefix is hardcoded (never taken from argv)
 * so this can never be pointed at an unrelated part of the bucket.
 *
 * Usage: pnpm --filter api exec tsx scripts/cleanup-stress-test.ts --yes
 */
import "dotenv/config";
import { createStorageClient } from "../src/utils/storage/factory";

// Passed to CloudStorage#deleteFolder, which itself scopes deletion to
// public/<ROOT_FOLDER>/, never taken from argv so this can't be pointed
// at an unrelated part of the bucket.
const ROOT_FOLDER = "stress-test-50k";

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error(
      `This will permanently delete every object under "public/${ROOT_FOLDER}/" in the configured bucket.\nRe-run with --yes to confirm.`,
    );
    process.exit(1);
  }

  const storage = createStorageClient();
  if (!storage) {
    console.error("Storage configuration incomplete. Aborting.");
    process.exit(1);
  }

  const bucket = process.env.STORAGE_BUCKET_NAME || "";
  console.log(`Bucket: ${bucket}`);
  console.log(`Deleting objects under public/${ROOT_FOLDER}/ ...`);

  const deleted = await storage.deleteFolder(ROOT_FOLDER);
  console.log(`Deleted ${deleted} objects.`);
}

main()
  .then(() => process.exit(0)) // the S3 client's keep-alive HTTPS agent would otherwise hold the process open
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
