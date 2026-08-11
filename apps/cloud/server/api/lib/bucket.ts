import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { bucket } from "../db/schema/bucket.js";

export type Bucket = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  /** Cached footprint, refreshed only by POST /storage/stats/recalculate - see schema/bucket.ts. */
  storageBytes: number;
  storageFileCount: number;
};

/** The columns listBuckets exposes; kept in one place so insert and select can't drift. */
const bucketColumns = {
  id: bucket.id,
  name: bucket.name,
  active: bucket.active,
  createdAt: bucket.createdAt,
  storageBytes: bucket.storageBytes,
  storageFileCount: bucket.storageFileCount,
};

function shape(row: {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  storageBytes: number;
  storageFileCount: number;
}): Bucket {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Storage prefix every media route scopes to - "ugc/{userId}/{bucketId}". */
export function tenantRootFor(userId: string, bucketId: string): string {
  return `ugc/${userId}/${bucketId}`;
}

/** Throws NOT_FOUND unless the bucket exists *and* belongs to this account. */
export async function assertOwnsBucket(
  userId: string,
  bucketId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: bucket.id })
    .from(bucket)
    .where(and(eq(bucket.id, bucketId), eq(bucket.userId, userId)));
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Bucket not found" });
  }
}

async function insertBucket(
  userId: string,
  name: string,
  active: boolean,
): Promise<Bucket> {
  const id = randomUUID();
  const [row] = await db
    .insert(bucket)
    .values({ id, userId, name, active })
    .returning(bucketColumns);
  return shape(row);
}

/** Every bucket for a user, oldest first. Lazily creates a default "Main" bucket the first time a user is seen. */
export async function listBuckets(userId: string): Promise<Bucket[]> {
  const rows = await db
    .select(bucketColumns)
    .from(bucket)
    .where(eq(bucket.userId, userId))
    .orderBy(asc(bucket.createdAt));

  if (rows.length === 0) {
    return [await insertBucket(userId, "Main", true)];
  }
  return rows.map(shape);
}

export async function createBucket(
  userId: string,
  name: string,
): Promise<Bucket> {
  return insertBucket(userId, name, false);
}

export async function renameBucket(
  userId: string,
  bucketId: string,
  name: string,
): Promise<void> {
  await assertOwnsBucket(userId, bucketId);
  await db
    .update(bucket)
    .set({ name })
    .where(and(eq(bucket.id, bucketId), eq(bucket.userId, userId)));
}

/**
 * Drops the row and hands `active` to the oldest survivor if the deleted
 * bucket held it. Callers own the R2/cache sweep - this is DB only (see the
 * DELETE /buckets/:bucketId route in worker/app.ts, which has the bindings).
 */
export async function deleteBucket(
  userId: string,
  bucketId: string,
): Promise<void> {
  await db
    .delete(bucket)
    .where(and(eq(bucket.id, bucketId), eq(bucket.userId, userId)));
  const remaining = await listBuckets(userId);
  if (!remaining.some((b) => b.active)) {
    await selectBucket(userId, remaining[0].id);
  }
}

/** The bucket the account is currently viewing - falls back to the oldest bucket if none is marked active. */
export async function getActiveBucketId(userId: string): Promise<string> {
  const buckets = await listBuckets(userId);
  return (buckets.find((b) => b.active) ?? buckets[0]).id;
}

/** Resolves the account that owns a bucket, given only the bucket id - used by the public CDN route, which has no session to scope by. */
export async function getBucketOwner(bucketId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: bucket.userId })
    .from(bucket)
    .where(eq(bucket.id, bucketId));
  return row?.userId ?? null;
}

export async function selectBucket(
  userId: string,
  bucketId: string,
): Promise<void> {
  await assertOwnsBucket(userId, bucketId);
  await db
    .update(bucket)
    .set({ active: false })
    .where(eq(bucket.userId, userId));
  await db.update(bucket).set({ active: true }).where(eq(bucket.id, bucketId));
}

export type BucketStorageStats = {
  storage: { size: number; fileCount: number };
  cache: { size: number; fileCount: number };
  updatedAt?: string;
};

/** Last-computed footprint for one bucket - cheap read, see the schema comment for why this isn't live-computed. */
export async function getStorageStats(
  bucketId: string,
): Promise<BucketStorageStats> {
  const [row] = await db
    .select({
      storageBytes: bucket.storageBytes,
      storageFileCount: bucket.storageFileCount,
      cacheBytes: bucket.cacheBytes,
      cacheFileCount: bucket.cacheFileCount,
      statsUpdatedAt: bucket.statsUpdatedAt,
    })
    .from(bucket)
    .where(eq(bucket.id, bucketId));
  return {
    storage: {
      size: row?.storageBytes ?? 0,
      fileCount: row?.storageFileCount ?? 0,
    },
    cache: { size: row?.cacheBytes ?? 0, fileCount: row?.cacheFileCount ?? 0 },
    updatedAt: row?.statsUpdatedAt?.toISOString(),
  };
}

/** Persists a freshly recomputed footprint, returning the new updatedAt. */
export async function setStorageStats(
  bucketId: string,
  stats: {
    storage: { size: number; fileCount: number };
    cache: { size: number; fileCount: number };
  },
): Promise<string> {
  const updatedAt = new Date();
  await db
    .update(bucket)
    .set({
      storageBytes: stats.storage.size,
      storageFileCount: stats.storage.fileCount,
      cacheBytes: stats.cache.size,
      cacheFileCount: stats.cache.fileCount,
      statsUpdatedAt: updatedAt,
    })
    .where(eq(bucket.id, bucketId));
  return updatedAt.toISOString();
}

export async function clearCacheStats(bucketId: string): Promise<void> {
  await db
    .update(bucket)
    .set({ cacheBytes: 0, cacheFileCount: 0, statsUpdatedAt: new Date() })
    .where(eq(bucket.id, bucketId));
}
