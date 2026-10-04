import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VIDEO_STATS,
  estimateImage,
  estimateVideo,
  expectedOutputSeconds,
  expectedVideoJob,
  queueWait,
  summarizeVideoSamples,
  videoCodecFamily,
} from "./eta";

test("trim parameters shorten the expected output like applyTrimming does", () => {
  assert.equal(expectedOutputSeconds(60, {}), 60);
  assert.equal(expectedOutputSeconds(60, { startOffset: "10" }), 50);
  assert.equal(expectedOutputSeconds(60, { endOffset: "15" }), 15);
  assert.equal(expectedOutputSeconds(60, { startOffset: "10", endOffset: "25" }), 15);
  // end before start: applyTrimming ignores the duration and plays to the end
  assert.equal(expectedOutputSeconds(60, { startOffset: "10", endOffset: "5" }), 50);
  assert.equal(expectedOutputSeconds(null, {}), null);
});

test("webm is the only VP9 output", () => {
  assert.equal(videoCodecFamily({ format: "webm" }), "vp9");
  assert.equal(videoCodecFamily({ format: "mp4" }), "h264");
  assert.equal(videoCodecFamily({}), "h264");
});

test("learned speed replaces the defaults once there are enough jobs", () => {
  const stats = summarizeVideoSamples([
    { codec: "h264", wallSeconds: 12, outputSeconds: 10 },
    { codec: "h264", wallSeconds: 22, outputSeconds: 20 },
    { codec: "h264", wallSeconds: 32, outputSeconds: 30 },
  ]);
  // (wall - 2s overhead) / output = 1x real time for every sample
  assert.deepEqual(stats.ratio.h264, [1, 1]);
  assert.equal(stats.ratio.vp9, undefined, "too few vp9 jobs to learn from");
  assert.deepEqual(expectedVideoJob(stats, "h264", 40), [42, 42]);
});

test("unknown duration falls back to how long jobs usually take", () => {
  assert.deepEqual(expectedVideoJob(DEFAULT_VIDEO_STATS, "h264", null), DEFAULT_VIDEO_STATS.job);
});

test("a free slot means the job starts on the next poll", () => {
  assert.deepEqual(queueWait({ jobsAhead: 0, running: 0, concurrency: 1, typicalJob: [10, 20] }), [1, 2]);
});

test("each round of jobs ahead costs one job duration", () => {
  const [one] = queueWait({ jobsAhead: 0, running: 1, concurrency: 1, typicalJob: [10, 20] });
  const [three] = queueWait({ jobsAhead: 2, running: 1, concurrency: 1, typicalJob: [10, 20] });
  assert.equal(one, 5);
  assert.equal(three, 25);
});

test("a running encode extrapolates from its own measured speed", () => {
  const now = 100_000;
  const estimate = estimateVideo({
    now,
    job: { status: "processing", progress: 25, startedAt: now - 10_000 },
    expectedJob: [999, 999],
    queue: [0, 0],
  });
  // 10s for 25% -> 30s left, whatever history said
  assert.equal(estimate.phase, "processing");
  assert.equal(estimate.progress, 0.25);
  assert.equal(estimate.estimatedSeconds, 30);
  assert.ok(estimate.estimatedRange[1] > 30);
  assert.equal(estimate.retryAfter, 30);
});

test("a job not yet in the queue on a sleeping server reports waking", () => {
  const estimate = estimateVideo({
    now: 0,
    job: null,
    expectedJob: [10, 20],
    queue: [1, 2],
    wake: [5, 12],
  });
  assert.equal(estimate.phase, "waking");
  assert.deepEqual(estimate.estimatedRange, [16, 34]);
  assert.equal(estimate.retryAfter, 16);
});

test("Retry-After is capped so long jobs keep getting sharper estimates", () => {
  const estimate = estimateVideo({ now: 0, job: null, expectedJob: [300, 600], queue: [0, 0] });
  assert.equal(estimate.phase, "queued");
  assert.equal(estimate.estimatedSeconds, 300);
  assert.equal(estimate.retryAfter, 30);
});

test("an image already in flight only waits for what is left", () => {
  const fresh = estimateImage({ transform: [3, 6] });
  const halfway = estimateImage({ transform: [3, 6], elapsed: 2 });
  assert.equal(fresh.phase, "processing");
  assert.equal(fresh.estimatedSeconds, 3);
  assert.equal(halfway.estimatedSeconds, 1);
  assert.equal(estimateImage({ transform: [1, 2], wake: [5, 10] }).phase, "waking");
});
