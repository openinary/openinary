// Gathers what the Worker's 202s need to tell an integrator when a
// transformation will be ready, and hands it to @openinary/core/eta - the
// same estimator the self-hosted server answers with, so both deployments
// speak one contract. What the cloud adds is the "waking" phase: the
// container sleeps after two idle minutes, and on a cold start bringing it
// back is most of the wait.
//
// Everything here is read without waking the container: video jobs from
// Postgres (the same rows routes/video.ts serves /video-status from), the
// container's state and timings from its Durable Object, which answers for a
// sleeping instance too.

import {
  DEFAULT_VIDEO_STATS,
  estimateImage,
  estimateVideo,
  expectedOutputSeconds,
  expectedVideoJob,
  type ProcessingEstimate,
  queueWait,
  summarizeVideoSamples,
  type VideoTimingStats,
  videoCodecFamily,
} from "@openinary/core/eta";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "../shared/db/index.js";
import { mediaDuration } from "../shared/db/schema/media-duration.js";
import { videoJob } from "../shared/db/schema/video-job.js";
import type { ProcessingTiming } from "./container.js";
import { mediaContainer } from "./media-container.js";
import { durationOf } from "./media-duration.js";
import { activeVideoJobs } from "./video-jobs.js";

// The container's MAX_CONCURRENT_JOBS on its instance type (1 vCPU, 3 GiB:
// see detectOptimalConcurrency in core's video config), with CdnAssets'
// singleton keeping it to one instance. Revisit both together.
const VIDEO_CONCURRENCY = 1;
const STATS_WINDOW_MS = 14 * 24 * 60 * 60_000;
const STATS_MAX_JOBS = 200;
// Per isolate: speed drifts over days, not seconds, and this keeps the
// aggregate off the request path almost every time
const STATS_TTL_MS = 10 * 60_000;

let cachedStats: { at: number; stats: VideoTimingStats } | null = null;

/** Speed learned from recently completed jobs, joined to their source's duration */
async function videoTimingStats(): Promise<VideoTimingStats> {
  if (cachedStats && Date.now() - cachedStats.at < STATS_TTL_MS) {
    return cachedStats.stats;
  }
  try {
    const rows = await db
      .select({
        paramsJson: videoJob.paramsJson,
        startedAt: videoJob.startedAt,
        completedAt: videoJob.completedAt,
        sourceSeconds: mediaDuration.seconds,
      })
      .from(videoJob)
      .leftJoin(mediaDuration, eq(mediaDuration.filePath, videoJob.filePath))
      .where(
        and(
          eq(videoJob.status, "completed"),
          gt(videoJob.completedAt, Date.now() - STATS_WINDOW_MS),
        ),
      )
      .orderBy(desc(videoJob.completedAt))
      .limit(STATS_MAX_JOBS);
    const stats = summarizeVideoSamples(
      rows.flatMap((row) => {
        if (row.startedAt == null || row.completedAt == null) return [];
        const params = JSON.parse(row.paramsJson);
        return [
          {
            codec: videoCodecFamily(params),
            wallSeconds: (row.completedAt - row.startedAt) / 1000,
            outputSeconds: expectedOutputSeconds(row.sourceSeconds, params),
          },
        ];
      }),
    );
    cachedStats = { at: Date.now(), stats };
    return stats;
  } catch (error) {
    console.error("Failed to load video timing stats", error);
    return DEFAULT_VIDEO_STATS;
  }
}

/**
 * The container's side of the estimate. A failed RPC must never fail the 202
 * it decorates, so it degrades to "awake, typical speed".
 */
async function containerTiming(
  env: Env,
  path: string | null,
  format: string | null,
): Promise<ProcessingTiming> {
  try {
    // RPC widens the tuples to number[]; rebuild them
    const timing = await mediaContainer(env).getProcessingEstimate(
      path,
      format,
    );
    return {
      wake: [timing.wake[0], timing.wake[1]],
      image: [timing.image[0], timing.image[1]],
      elapsed: timing.elapsed,
    };
  } catch (error) {
    console.error("Failed to read container timing", error);
    return { wake: [0, 0], image: [1, 3], elapsed: 0 };
  }
}

/**
 * A video transform. filePath and params (core's, from deliveryTarget) are
 * the job's own key, as PgVideoJobStore writes it.
 */
export async function videoProcessingEstimate(
  env: Env,
  filePath: string,
  params: object,
): Promise<ProcessingEstimate> {
  const [active, duration, stats, timing] = await Promise.all([
    activeVideoJobs(),
    durationOf(filePath),
    videoTimingStats(),
    containerTiming(env, null, null),
  ]);

  const paramsJson = JSON.stringify(params);
  const job =
    active.find((j) => j.filePath === filePath && j.paramsJson === paramsJson) ??
    null;
  // Same order PgVideoJobStore.getNextPendingJob claims in. Without a job
  // yet (its first request is still reaching the queue), everything pending
  // is ahead of it.
  const jobsAhead = active.filter(
    (other) =>
      other.status === "pending" &&
      other !== job &&
      (!job ||
        other.priority < job.priority ||
        (other.priority === job.priority && other.createdAt <= job.createdAt)),
  ).length;

  return estimateVideo({
    now: Date.now(),
    job,
    expectedJob: expectedVideoJob(
      stats,
      videoCodecFamily(params),
      expectedOutputSeconds(duration, params),
    ),
    queue: queueWait({
      jobsAhead,
      running: active.filter((j) => j.status === "processing").length,
      concurrency: VIDEO_CONCURRENCY,
      typicalJob: stats.job,
    }),
    // A running job means a running container, whatever its state says
    wake: job?.status === "processing" ? [0, 0] : timing.wake,
  });
}

/**
 * An image transform. containerPath is the exact path the container is
 * asked for, which is how it recognises a transform already in flight.
 */
export async function imageProcessingEstimate(
  env: Env,
  containerPath: string,
  format: string,
): Promise<ProcessingEstimate> {
  const timing = await containerTiming(env, containerPath, format);
  return estimateImage({
    transform: timing.image,
    elapsed: timing.elapsed,
    wake: timing.wake,
  });
}
