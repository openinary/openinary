import logger, { serializeError } from "../logger";

export type AggregateStats = { size: number; fileCount: number };

export type BucketStats = {
  storage: AggregateStats;
  cache: AggregateStats;
  updatedAt: string;
};

/**
 * Persistence and reconciliation operations the tracker delegates to the
 * storage layer (implemented by CloudStorage)
 */
export type StatsBackend = {
  loadPersistedStats(): Promise<BucketStats | null>;
  persistStats(stats: BucketStats): Promise<void>;
  computeBucketStats(): Promise<{
    storage: AggregateStats;
    cache: AggregateStats;
  }>;
};

const PERSIST_THROTTLE_MS = 5_000;

// Module-level singleton: storage.ts and upload.ts each create their own
// CloudStorage instance, so the shared aggregate cannot live on the class
let statsPromise: Promise<BucketStats> | null = null;
let persistTimer: NodeJS.Timeout | null = null;

async function recompute(backend: StatsBackend): Promise<BucketStats> {
  const { storage, cache } = await backend.computeBucketStats();
  const stats: BucketStats = {
    storage,
    cache,
    updatedAt: new Date().toISOString(),
  };
  await backend.persistStats(stats);
  return stats;
}

/**
 * Returns the tracked aggregate stats, loading them from the persisted
 * bucket object on first call. Falls back to a one-time full recomputation
 * (recursive listing) when no persisted stats exist yet.
 */
export function getBucketStats(backend: StatsBackend): Promise<BucketStats> {
  if (!statsPromise) {
    const promise = (async () => {
      const persisted = await backend.loadPersistedStats();
      return persisted ?? (await recompute(backend));
    })();
    promise.catch(() => {
      if (statsPromise === promise) {
        statsPromise = null;
      }
    });
    statsPromise = promise;
  }
  return statsPromise;
}

/**
 * Forces a full recomputation from bucket listings and persists the result.
 * Reconciles any drift accumulated by the incremental adjustments (e.g.
 * objects modified outside the app, or a crash before a persist flush).
 * Keeps the previous stats when the recomputation fails.
 */
export async function recalculateBucketStats(
  backend: StatsBackend,
): Promise<BucketStats> {
  const stats = await recompute(backend);
  statsPromise = Promise.resolve(stats);
  return stats;
}

/**
 * Applies an incremental delta to the tracked stats after a bucket mutation
 * (upload, delete, ...). Fire-and-forget: callers never wait on it and it
 * never throws, so stats tracking cannot break the mutation itself.
 */
export function adjustBucketStats(
  backend: StatsBackend,
  target: "storage" | "cache",
  delta: { size: number; fileCount: number },
): void {
  void getBucketStats(backend)
    .then((stats) => {
      const aggregate = stats[target];
      aggregate.size = Math.max(0, aggregate.size + delta.size);
      aggregate.fileCount = Math.max(0, aggregate.fileCount + delta.fileCount);
      stats.updatedAt = new Date().toISOString();
      schedulePersist(backend);
    })
    .catch((error) => {
      logger.warn(
        { error: serializeError(error), target, delta },
        "Failed to adjust bucket stats",
      );
    });
}

/**
 * Throttled persistence: bursts of mutations (bulk uploads/deletes) produce
 * at most one stats write per window instead of one per object
 */
function schedulePersist(backend: StatsBackend): void {
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const current = statsPromise;
    if (!current) {
      return;
    }
    void current
      .then((stats) => backend.persistStats(stats))
      .catch((error) => {
        logger.warn(
          { error: serializeError(error) },
          "Failed to persist bucket stats",
        );
      });
  }, PERSIST_THROTTLE_MS);
  // Don't keep the process alive just to flush stats; reconciliation
  // covers any write lost to a shutdown
  persistTimer.unref?.();
}

export function resetBucketStatsTracker(): void {
  statsPromise = null;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}
