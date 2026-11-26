import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { VideoWorker } from "./video-worker";
import { detectVideoSettings } from "./config";
import type { VideoJob, VideoJobStore } from "./queue-store";
import { enginePathsIn } from "../../config/paths";

const paths = enginePathsIn(tmpdir());

const job = (id: string): VideoJob => ({
  id,
  file_path: `${id}.mp4`,
  params_json: "{}",
  cache_path: `/cache/${id}`,
  status: "processing",
  priority: 2,
  progress: 0,
  error: null,
  retry_count: 0,
  max_retries: 3,
  created_at: 0,
  started_at: Date.now(),
  completed_at: null,
});

/**
 * A store with `pending` jobs to hand out, reporting `processingRows` jobs
 * in "processing" on top of what it handed out: other nodes' jobs on a
 * shared Postgres, or orphans of a crashed run awaiting their reset.
 */
function fakeStore(pending: number, processingRows: number) {
  let next = 0;
  const claimed: string[] = [];
  const store = {
    getNextPendingJob: async () => {
      if (next >= pending) return null;
      const claimedJob = job(`job-${next++}`);
      claimed.push(claimedJob.id);
      return claimedJob;
    },
    countProcessingJobs: async () => processingRows + claimed.length,
    resetOrphanedProcessingJobs: async () => 0,
    getJobsByStatus: async () => [],
  } as unknown as VideoJobStore;
  return { store, claimed };
}

/** A worker whose jobs run until the test finishes them, in place of ffmpeg. */
function workerWith(store: VideoJobStore, maxConcurrent: number) {
  const worker = new VideoWorker(null, store, paths, detectVideoSettings({ maxConcurrent, pollIntervalMs: 60_000 }));
  const running = new Map<string, () => void>();
  let peak = 0;
  (worker as unknown as { processJob: (job: VideoJob) => Promise<void> }).processJob = (j) =>
    new Promise<void>((resolve) => {
      running.set(j.id, () => {
        running.delete(j.id);
        resolve();
      });
      peak = Math.max(peak, running.size);
    });
  return {
    worker,
    running,
    peak: () => peak,
    finish: async (id: string) => {
      running.get(id)?.();
      // Let the slot's .finally() run
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("processing rows the worker didn't claim don't take its slots", async () => {
  // 50 rows in "processing" that aren't this worker's: the old store-wide
  // gate would have claimed nothing until they were reset (2 h on Postgres).
  const { store, claimed } = fakeStore(5, 50);
  const { worker } = workerWith(store, 2);
  await worker.fillAvailableSlots();
  assert.deepEqual(claimed, ["job-0", "job-1"]);
  assert.equal(worker.getInFlightCount(), 2);
});

test("the worker never runs more than its own maximum", async () => {
  const { store, claimed } = fakeStore(6, 0);
  const { worker, running, peak, finish } = workerWith(store, 2);

  await worker.fillAvailableSlots();
  await worker.fillAvailableSlots(); // a second tick while both slots are taken
  assert.equal(claimed.length, 2);
  assert.equal(worker.getInFlightCount(), 2);

  // Finishing one frees exactly one slot
  await finish("job-0");
  assert.equal(worker.getInFlightCount(), 1);
  await worker.fillAvailableSlots();
  assert.deepEqual(claimed, ["job-0", "job-1", "job-2"]);
  assert.equal(worker.getInFlightCount(), 2);

  // Drain the rest
  while (running.size > 0) {
    await finish([...running.keys()][0]!);
    await worker.fillAvailableSlots();
  }
  assert.equal(claimed.length, 6);
  assert.equal(worker.getInFlightCount(), 0);
  assert.equal(peak(), 2);
});

test("a job that throws still frees its slot", async () => {
  const { store, claimed } = fakeStore(2, 0);
  const worker = new VideoWorker(null, store, paths, detectVideoSettings({ maxConcurrent: 1, pollIntervalMs: 60_000 }));
  (worker as unknown as { processJob: () => Promise<void> }).processJob = async () => {
    throw new Error("boom");
  };
  await worker.fillAvailableSlots();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(worker.getInFlightCount(), 0);
  await worker.fillAvailableSlots();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(claimed, ["job-0", "job-1"]);
});

test("stats keep the store-wide processing count next to the worker's own", async () => {
  const { store } = fakeStore(1, 4);
  const { worker } = workerWith(store, 3);
  await worker.fillAvailableSlots();
  const stats = await worker.getStats();
  assert.equal(stats.processingCount, 5);
  assert.equal(stats.inFlightCount, 1);
});

test("start() rejects, without polling, when the store's orphan reset rejects", async () => {
  const { store } = fakeStore(1, 0);
  store.resetOrphanedProcessingJobs = async () => {
    throw new Error("database unavailable");
  };
  const worker = new VideoWorker(null, store, paths, detectVideoSettings({ maxConcurrent: 1, pollIntervalMs: 60_000 }));
  await assert.rejects(worker.start(), /database unavailable/);
  assert.equal((await worker.getStats()).isRunning, false);
});
