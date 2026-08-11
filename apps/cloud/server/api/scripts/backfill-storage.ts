// One-off: reports each existing account's current R2 footprint to Autumn
// as its starting storage_mb usage, run once after the catalog is created
// (accounts created afterwards are metered incrementally by
// worker/app.ts's upload/delete handlers, so this never needs to run
// again). `storage.list` (from api/lib/media.ts, already configured with
// this project's R2 credentials) paginates through every object under the
// prefix on its own.
//
// Run with: pnpm tsx api/scripts/backfill-storage.ts

import "dotenv/config";
import { db } from "../db/index.js";
import { user } from "../db/schema/auth.js";
import { trackFeature } from "../lib/autumn.js";
import { storage } from "../lib/media.js";

const BYTES_PER_MB = 1024 * 1024;

async function main() {
  if (!storage)
    throw new Error("R2 storage client not configured (missing R2_* env vars)");
  const users = await db.select({ id: user.id }).from(user);
  console.log(`Backfilling storage_mb for ${users.length} account(s)...`);

  for (const { id: userId } of users) {
    const objects = await storage.list(`public/ugc/${userId}/`);
    const totalBytes = objects.reduce((sum, obj) => sum + (obj.size ?? 0), 0);
    const mb = Math.round(totalBytes / BYTES_PER_MB);
    if (mb === 0) continue;
    await trackFeature(userId, "storage_mb", mb);
    console.log(`  ${userId}: ${mb} MB (${objects.length} objects)`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
