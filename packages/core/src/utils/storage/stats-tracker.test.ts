import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustBucketStats,
  getBucketStats,
  recalculateBucketStats,
  resetBucketStatsTracker,
  type BucketStats,
  type StatsBackend,
} from "./stats-tracker";

function makeBackend(
  overrides: Partial<StatsBackend> & {
    persisted?: BucketStats | null;
  } = {},
) {
  const calls = { load: 0, persist: 0, compute: 0 };
  const persistedWrites: BucketStats[] = [];

  const backend: StatsBackend = {
    async loadPersistedStats() {
      calls.load++;
      return overrides.persisted ?? null;
    },
    async persistStats(stats) {
      calls.persist++;
      persistedWrites.push(structuredClone(stats));
    },
    async computeBucketStats() {
      calls.compute++;
      return {
        storage: { size: 1000, fileCount: 10 },
        cache: { size: 200, fileCount: 2 },
      };
    },
    ...overrides,
  };

  return { backend, calls, persistedWrites };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("loads persisted stats without recomputing", async () => {
  resetBucketStatsTracker();
  const persisted: BucketStats = {
    storage: { size: 500, fileCount: 5 },
    cache: { size: 50, fileCount: 1 },
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const { backend, calls } = makeBackend({ persisted });

  const stats = await getBucketStats(backend);

  assert.deepEqual(stats.storage, { size: 500, fileCount: 5 });
  assert.equal(calls.compute, 0);
});

test("seeds stats with a recomputation when nothing is persisted", async () => {
  resetBucketStatsTracker();
  const { backend, calls } = makeBackend();

  const stats = await getBucketStats(backend);

  assert.deepEqual(stats.storage, { size: 1000, fileCount: 10 });
  assert.deepEqual(stats.cache, { size: 200, fileCount: 2 });
  assert.equal(calls.compute, 1);
  assert.equal(calls.persist, 1);
});

test("caches stats across calls", async () => {
  resetBucketStatsTracker();
  const { backend, calls } = makeBackend();

  await getBucketStats(backend);
  await getBucketStats(backend);

  assert.equal(calls.load, 1);
});

test("a failed load is retried on the next call", async () => {
  resetBucketStatsTracker();
  let attempts = 0;
  const { backend } = makeBackend({
    async loadPersistedStats() {
      attempts++;
      if (attempts === 1) throw new Error("boom");
      return null;
    },
  });

  await assert.rejects(getBucketStats(backend));
  await flushMicrotasks();

  const stats = await getBucketStats(backend);
  assert.equal(attempts, 2);
  assert.deepEqual(stats.storage, { size: 1000, fileCount: 10 });
});

test("adjustBucketStats applies deltas to the tracked aggregate", async () => {
  resetBucketStatsTracker();
  const { backend } = makeBackend();
  await getBucketStats(backend);

  adjustBucketStats(backend, "storage", { size: 100, fileCount: 1 });
  adjustBucketStats(backend, "cache", { size: -150, fileCount: -1 });
  await flushMicrotasks();

  const stats = await getBucketStats(backend);
  assert.deepEqual(stats.storage, { size: 1100, fileCount: 11 });
  assert.deepEqual(stats.cache, { size: 50, fileCount: 1 });
});

test("adjustBucketStats clamps aggregates at zero", async () => {
  resetBucketStatsTracker();
  const { backend } = makeBackend();
  await getBucketStats(backend);

  adjustBucketStats(backend, "cache", { size: -10_000, fileCount: -100 });
  await flushMicrotasks();

  const stats = await getBucketStats(backend);
  assert.deepEqual(stats.cache, { size: 0, fileCount: 0 });
});

test("recalculateBucketStats replaces drifted counters", async () => {
  resetBucketStatsTracker();
  const { backend, calls } = makeBackend();
  await getBucketStats(backend);

  adjustBucketStats(backend, "storage", { size: 999, fileCount: 9 });
  await flushMicrotasks();

  const stats = await recalculateBucketStats(backend);
  assert.deepEqual(stats.storage, { size: 1000, fileCount: 10 });
  assert.equal(calls.compute, 2);

  const cached = await getBucketStats(backend);
  assert.deepEqual(cached.storage, { size: 1000, fileCount: 10 });
});

test("a failed recalculation keeps the previous stats", async () => {
  resetBucketStatsTracker();
  const { backend } = makeBackend();
  await getBucketStats(backend);

  const failing: StatsBackend = {
    ...backend,
    async computeBucketStats() {
      throw new Error("listing failed");
    },
  };

  await assert.rejects(recalculateBucketStats(failing));

  const stats = await getBucketStats(backend);
  assert.deepEqual(stats.storage, { size: 1000, fileCount: 10 });
});
