// How long until a transformation that just answered 202 is ready.
//
// Pure on purpose, and exported on its own subpath (@openinary/core/eta):
// the self-hosted server calls it from TransformService, and the cloud
// Worker - which cannot afford the main entrypoint, see transform-cache.ts -
// calls the very same functions from its own 202. One contract for every
// integrator, whichever deployment answers them: the cloud only adds a
// "waking" phase that a self-hosted server never reports.
//
// Every figure here is in seconds. Estimates are a [typical, pessimistic]
// pair (roughly p50 and p90) rather than a single number: the client is told
// the first through Retry-After and can show the second as an upper bound.

export type ProcessingPhase = "waking" | "queued" | "processing";

/** [typical, pessimistic] duration, in seconds */
export type Span = [number, number];

export interface ProcessingEstimate {
  phase: ProcessingPhase;
  /** 0..1, only measured once the encoder reports it */
  progress: number;
  estimatedSeconds: number;
  estimatedRange: Span;
  /** What to put in Retry-After: when asking again is worth it */
  retryAfter: number;
}

export type VideoCodecFamily = "h264" | "vp9";

/**
 * A finished video job, as the estimator learns from it. wallSeconds is the
 * whole job - source download, encode and upload - since that is what the
 * next caller waits for.
 */
export interface VideoTimingSample {
  codec: VideoCodecFamily;
  wallSeconds: number;
  /** Duration of the produced video, when it was known */
  outputSeconds: number | null;
}

export interface VideoTimingStats {
  /** Wall seconds per second of output video, per codec */
  ratio: Partial<Record<VideoCodecFamily, Span>>;
  /** Whole-job wall seconds, for jobs whose duration is unknown */
  job: Span;
}

// Starting points until a deployment has finished enough jobs of its own.
// h264 matches the cloud quota gate's 0.5 (ultrafast, about 2x real time at
// 720p); VP9 realtime is markedly slower on the same CPU.
const DEFAULT_RATIO: Record<VideoCodecFamily, Span> = {
  h264: [0.5, 1.2],
  vp9: [1.5, 3],
};
const DEFAULT_JOB: Span = [20, 60];
// Download, probe and upload around the encode itself
const JOB_OVERHEAD_SECONDS = 2;
// Below this many samples a percentile says more about luck than speed
const MIN_SAMPLES = 3;
// Retry-After ceiling: past this the client asks again and gets a sharper
// figure, instead of sleeping through a pessimistic one
const MAX_RETRY_AFTER = 30;
// Progress below this is too noisy to extrapolate from (the first percent
// includes ffmpeg startup and the source probe)
const MIN_PROGRESS_TO_EXTRAPOLATE = 0.03;

export const DEFAULT_VIDEO_STATS: VideoTimingStats = {
  ratio: {},
  job: DEFAULT_JOB,
};

/** p50 and p90 of a sample set, or null when there are too few to trust */
export function percentiles(values: number[]): Span | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (sorted.length < MIN_SAMPLES) return null;
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return [at(0.5), at(0.9)];
}

/** Same rule as core's determineOutputFormat: no format means mp4 (h264) */
export function videoCodecFamily(params: { format?: unknown }): VideoCodecFamily {
  return String(params.format ?? "").toLowerCase() === "webm" ? "vp9" : "h264";
}

/**
 * Duration of the video a transform will produce, from the source's: trim
 * parameters shorten it, the same way applyTrimming reads them.
 */
export function expectedOutputSeconds(
  sourceSeconds: number | null | undefined,
  params: { startOffset?: unknown; endOffset?: unknown },
): number | null {
  if (!sourceSeconds || sourceSeconds <= 0) return null;
  const offset = (value: unknown) => {
    const n = value === undefined || value === null || value === "" ? NaN : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const start = offset(params.startOffset);
  const end = offset(params.endOffset);
  let length = sourceSeconds - Math.min(start ?? 0, sourceSeconds);
  if (end !== undefined) {
    // endOffset alone means "the first N seconds", same as applyTrimming
    const duration = start !== undefined ? end - start : end;
    if (duration > 0) length = Math.min(length, duration);
  }
  return length > 0 ? length : null;
}

export function summarizeVideoSamples(samples: VideoTimingSample[]): VideoTimingStats {
  const ratio: VideoTimingStats["ratio"] = {};
  for (const codec of ["h264", "vp9"] as const) {
    const span = percentiles(
      samples
        .filter((s) => s.codec === codec && s.outputSeconds && s.outputSeconds > 0)
        .map((s) => Math.max(0, s.wallSeconds - JOB_OVERHEAD_SECONDS) / s.outputSeconds!),
    );
    if (span) ratio[codec] = span;
  }
  return { ratio, job: percentiles(samples.map((s) => s.wallSeconds)) ?? DEFAULT_JOB };
}

/** Whole-job duration for a video that has not started yet */
export function expectedVideoJob(
  stats: VideoTimingStats,
  codec: VideoCodecFamily,
  outputSeconds: number | null,
): Span {
  if (!outputSeconds) return stats.job;
  const [r50, r90] = stats.ratio[codec] ?? DEFAULT_RATIO[codec];
  return [
    JOB_OVERHEAD_SECONDS + r50 * outputSeconds,
    JOB_OVERHEAD_SECONDS + r90 * outputSeconds,
  ];
}

/**
 * Time a pending job spends waiting for a slot. jobsAhead counts the pending
 * jobs that will be claimed first; running, the jobs holding a slot now.
 */
export function queueWait(input: {
  jobsAhead: number;
  running: number;
  concurrency: number;
  typicalJob: Span;
}): Span {
  const concurrency = Math.max(1, input.concurrency);
  const freeSlots = Math.max(0, concurrency - input.running);
  const blocking = input.jobsAhead - freeSlots;
  // A free slot is claimed on the worker's next poll
  if (blocking < 0) return [1, 2];
  // Running jobs are on average half done; every full round of jobs ahead
  // costs one more job duration
  const rounds = 0.5 + blocking / concurrency;
  return [rounds * input.typicalJob[0], (rounds + 0.5) * input.typicalJob[1]];
}

function add(...spans: Span[]): Span {
  return spans.reduce<Span>((sum, s) => [sum[0] + s[0], sum[1] + s[1]], [0, 0]);
}

function finish(phase: ProcessingPhase, progress: number, span: Span): ProcessingEstimate {
  const typical = Math.max(1, Math.ceil(span[0]));
  const pessimistic = Math.max(typical, Math.ceil(span[1]));
  return {
    phase,
    progress: Math.round(Math.min(1, Math.max(0, progress)) * 100) / 100,
    estimatedSeconds: typical,
    estimatedRange: [typical, pessimistic],
    // The typical figure, not the pessimistic one: a retry that comes too
    // early costs one cheap 202 with a sharper estimate, one that comes too
    // late costs the caller the whole difference
    retryAfter: Math.min(MAX_RETRY_AFTER, typical),
  };
}

export interface VideoJobSnapshot {
  status: string;
  /** 0..100, as the job stores persist it */
  progress: number;
  startedAt: number | null;
}

/**
 * Remaining time for a video transform. `job` is null when the request that
 * creates it has not reached the queue yet; `wake` is what bringing the
 * processing server up still costs (always [0, 0] self-hosted).
 */
export function estimateVideo(input: {
  now: number;
  job: VideoJobSnapshot | null;
  expectedJob: Span;
  queue: Span;
  wake?: Span;
}): ProcessingEstimate {
  const wake = input.wake ?? [0, 0];
  const job = input.job;

  if (job?.status === "processing" && job.startedAt) {
    const elapsed = Math.max(0, (input.now - job.startedAt) / 1000);
    const progress = Math.min(0.99, Math.max(0, job.progress / 100));
    if (progress >= MIN_PROGRESS_TO_EXTRAPOLATE) {
      // Measured speed beats any history: the rest of the encode runs at the
      // pace the first part did. The spread narrows as the sample grows.
      const remaining = (elapsed * (1 - progress)) / progress;
      const spread = 1 + 0.5 * (1 - progress);
      return finish("processing", progress, [remaining, remaining * spread]);
    }
    return finish("processing", progress, [
      Math.max(1, input.expectedJob[0] - elapsed),
      Math.max(2, input.expectedJob[1] - elapsed),
    ]);
  }

  const phase: ProcessingPhase = wake[0] > 0 ? "waking" : "queued";
  return finish(phase, 0, add(wake, input.queue, input.expectedJob));
}

/** Remaining time for a synchronous transform (an image, a video thumbnail) */
export function estimateImage(input: {
  /** How long a transform of this kind takes once the server is up */
  transform: Span;
  /** Seconds this same transform has already been running, if it has */
  elapsed?: number;
  wake?: Span;
}): ProcessingEstimate {
  const wake = input.wake ?? [0, 0];
  const elapsed = input.elapsed ?? 0;
  const transform: Span = [
    Math.max(0.5, input.transform[0] - elapsed),
    Math.max(1, input.transform[1] - elapsed),
  ];
  return finish(wake[0] > 0 ? "waking" : "processing", 0, add(wake, transform));
}

/** JSON body of a 202, identical across deployments */
export function processingBody(
  estimate: ProcessingEstimate,
  extra: { message: string; statusUrl?: string },
): Record<string, unknown> {
  return {
    status: "processing",
    message: extra.message,
    phase: estimate.phase,
    progress: estimate.progress,
    estimatedSeconds: estimate.estimatedSeconds,
    estimatedRange: estimate.estimatedRange,
    retryAfter: estimate.retryAfter,
    ...(extra.statusUrl ? { statusUrl: extra.statusUrl } : {}),
  };
}

/** Headers of a 202, for clients that never read the body */
export function processingHeaders(estimate: ProcessingEstimate): Record<string, string> {
  return {
    "Retry-After": String(estimate.retryAfter),
    "X-Processing-Phase": estimate.phase,
    "X-Processing-Eta": String(estimate.estimatedSeconds),
  };
}
