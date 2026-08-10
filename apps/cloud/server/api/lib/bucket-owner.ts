// The JSON value held in the BUCKET_OWNERS KV namespace, keyed by bucketId.
//
// Three places touch it and have to agree on the shape: the CDN path reads it
// on every delivery (worker/index.ts), UsageMeter's alarm rewrites `blocked`
// on every flush (worker/usage-meter.ts), and the admin panel writes
// `suspended` (api/routers/admin.ts). Free of Worker and DB imports so the
// merge rule below can be asserted under plain node - see
// worker/bucket-owner.test.ts.

export type BucketOwner = {
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
