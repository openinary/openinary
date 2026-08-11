import {
  bigint,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * A user-facing "bucket" - really just a named prefix inside the single
 * real R2 bucket (see worker/app.ts's tenantRootFor: storage paths become
 * "ugc/{userId}/{bucketId}/..."). `active` marks which bucket the account
 * is currently viewing; exactly one row per user should have it set (see
 * lib/bucket.ts for the invariant, enforced in application code rather than
 * a DB constraint since Neon HTTP driver calls aren't transactional here).
 *
 * `userId` intentionally isn't a `.references(() => user.id)` FK: doing so
 * requires importing schema/auth.ts from this file, and drizzle-kit's push
 * command can't resolve that cross-file ".js" specifier back to its ".ts"
 * source (unlike the app's own tsx/tsc build). Ownership is enforced in
 * application code instead - every query in lib/bucket.ts filters by
 * `eq(bucket.userId, userId)`.
 */
export const bucket = pgTable("bucket", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Cached storage/cache footprint for this bucket alone - "cache/" has no
  // per-tenant R2 prefix (see r2-storage.ts's listCacheForTenant), so
  // recomputing this on every /storage/stats read would mean scanning the
  // entire cache/ directory across all tenants. Populated only by the
  // explicit POST /storage/stats/recalculate and cache/clear routes.
  storageBytes: bigint("storage_bytes", { mode: "number" })
    .notNull()
    .default(0),
  storageFileCount: integer("storage_file_count").notNull().default(0),
  cacheBytes: bigint("cache_bytes", { mode: "number" }).notNull().default(0),
  cacheFileCount: integer("cache_file_count").notNull().default(0),
  statsUpdatedAt: timestamp("stats_updated_at"),
});
