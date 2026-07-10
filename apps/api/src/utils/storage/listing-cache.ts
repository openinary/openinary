type ListedObject = { key: string; size?: number; lastModified?: Date };

const LISTING_CACHE_TTL = 60 * 1000;

// Module-level singleton: storage.ts and upload.ts each create their own
// CloudStorage instance, so the shared listing cache cannot live on the class
let entry: { promise: Promise<ListedObject[]>; timestamp: number } | null =
  null;

/**
 * Returns the cached full bucket listing, fetching it at most once per TTL.
 * The promise itself is cached so concurrent callers (e.g. GET /storage and
 * GET /storage/stats firing together on dashboard load) share one S3 fan-out.
 */
export function getCachedFullListing(
  fetcher: () => Promise<ListedObject[]>,
): Promise<ListedObject[]> {
  if (entry && Date.now() - entry.timestamp < LISTING_CACHE_TTL) {
    return entry.promise;
  }

  const current: { promise: Promise<ListedObject[]>; timestamp: number } = {
    promise: fetcher(),
    timestamp: Date.now(),
  };
  entry = current;

  current.promise.catch(() => {
    if (entry === current) {
      entry = null;
    }
  });

  return current.promise;
}

export function invalidateListingCache(): void {
  entry = null;
}
