// The BUCKET_OWNERS KV namespace: bucketId -> owning account, plus the two
// flags that stop it being served. The CDN path reads it on every delivery;
// this module is the only thing that writes it. Two writers own one field
// each and must never clobber the other's: UsageMeter's flush owns `blocked`,
// the admin panel owns `suspended`.
//
// Free of Worker globals and of the DB client: rpc/admin.ts imports it, and
// the routers are also type-checked by the dashboards (see bindings.ts).

/** The slice of a KV namespace this module needs. */
export type OwnerKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

type BucketOwner = {
  userId: string;
  /**
   * Out of CDN allowance. Owned by UsageMeter, recomputed from the Autumn
   * balance every flush.
   */
  blocked: boolean;
  /**
   * Cut off by an admin. Never derived from usage, and deliberately a separate
   * field rather than another reason to set `blocked`: the two produce
   * different answers to the customer (403 vs a 402 telling them to upgrade).
   */
  suspended?: boolean;
};

export function parseBucketOwner(raw: string | null): BucketOwner | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BucketOwner;
  } catch {
    // Pre-existing plain-userId value from before block tracking existed;
    // treated as unblocked until UsageMeter's alarm next writes for it.
    return { userId: raw, blocked: false };
  }
}

/**
 * What UsageMeter's flush should store: the `blocked` it just computed, and
 * whatever `suspended` was already there.
 *
 * The preservation is the whole point. A blind put of the flush result would
 * clear an admin suspension on the first flush of any account still inside its
 * quota - i.e. within a minute of it being applied, silently, for exactly the
 * accounts a suspension is most likely aimed at.
 */
export function mergeOwnerState(
  raw: string | null,
  next: { userId: string; blocked: boolean },
): BucketOwner {
  return { ...next, suspended: parseBucketOwner(raw)?.suspended ?? false };
}

/**
 * The mirror image, for the admin panel: set `suspended`, keep whatever
 * `blocked` the meter last computed. Un-suspending must not hand a free minute
 * of service to an account that was also out of quota, and re-suspending must
 * not pretend an over-quota account is back under its allowance.
 *
 * A bucket that has never served traffic has no stored value at all, which is
 * correctly not blocked.
 */
export function withSuspended(
  raw: string | null,
  next: { userId: string; suspended: boolean },
): BucketOwner {
  return { ...next, blocked: parseBucketOwner(raw)?.blocked ?? false };
}

// Per-isolate memo in front of KV. A hot bucket otherwise pays $0.50 per
// million reads to re-learn an answer that changes at most once a minute, so
// this is a straight cost cut on the cache-hit path - the isolate serving a
// burst for one bucket does one KV read instead of one per request.
//
// The TTL is what bounds how stale `blocked` can get, so it stays well under
// UsageMeter's 60s FLUSH_INTERVAL_MS: an over-quota account keeps being served
// for at most BUCKET_OWNER_TTL_MS past the flush that blocked it, on the
// isolates that had already cached it. Deliberately not a "clear on block"
// scheme - there's no channel from the DO to an arbitrary isolate, and 5s of
// slack on a limit that already lags a minute is not worth inventing one.
const BUCKET_OWNER_TTL_MS = 5_000;
const memo = new Map<string, { owner: BucketOwner; expiresAt: number }>();

/**
 * Who owns a bucket, without ever asking the container: isolate memo, then
 * KV, then `fromDb` (Postgres) on a miss, caching the answer in KV for next
 * time. `defer` keeps that KV write off the response path (ctx.waitUntil).
 */
export async function resolveBucketOwner(
  kv: OwnerKv,
  bucketId: string,
  fromDb: (bucketId: string) => Promise<string | null>,
  defer: (promise: Promise<unknown>) => void,
): Promise<BucketOwner | null> {
  const now = Date.now();
  const cached = memo.get(bucketId);
  if (cached && cached.expiresAt > now) return cached.owner;

  let owner = parseBucketOwner(await kv.get(bucketId));
  if (!owner) {
    const userId = await fromDb(bucketId);
    if (!userId) return null;
    owner = { userId, blocked: false };
    defer(kv.put(bucketId, JSON.stringify(owner)));
  }
  // Misses aren't memoized: a 404 here is either a bad bucket id (cheap to
  // re-resolve, and rare enough not to matter) or a bucket created seconds
  // ago, which must not stay invisible for the length of a TTL.
  memo.set(bucketId, { owner, expiresAt: now + BUCKET_OWNER_TTL_MS });
  return owner;
}

/**
 * UsageMeter's verdict, for every bucket the account served traffic through.
 * `buckets` is re-read before each write: a bucket deleted while the flush is
 * in flight drops out of the meter's list, and writing it anyway would put a
 * deleted bucket back into the owner cache.
 */
export async function writeBlocked(
  kv: OwnerKv,
  buckets: () => readonly string[],
  userId: string,
  blocked: boolean,
): Promise<void> {
  await Promise.all(
    [...buckets()].map(async (bucketId) => {
      const stored = await kv.get(bucketId);
      if (!buckets().includes(bucketId)) return;
      await kv.put(
        bucketId,
        JSON.stringify(mergeOwnerState(stored, { userId, blocked })),
      );
    }),
  );
}

/** The admin panel's switch, for every bucket of the account. */
export async function writeSuspended(
  kv: OwnerKv,
  bucketIds: readonly string[],
  userId: string,
  suspended: boolean,
): Promise<void> {
  await Promise.all(
    bucketIds.map(async (bucketId) => {
      const stored = await kv.get(bucketId);
      await kv.put(
        bucketId,
        JSON.stringify(withSuspended(stored, { userId, suspended })),
      );
    }),
  );
}

/** Deleted buckets. The cache has no TTL, so nothing else would drop them. */
export async function forgetBuckets(
  kv: OwnerKv,
  bucketIds: readonly string[],
): Promise<void> {
  for (const bucketId of bucketIds) memo.delete(bucketId);
  await Promise.all(bucketIds.map((bucketId) => kv.delete(bucketId)));
}
