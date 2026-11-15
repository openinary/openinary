// What a customer pays for a video transform, and the one path that charges
// it. Both runtimes bill through meterJob: the container the moment a job
// closes (container/video-job-store.ts), the Worker's hourly cron for whatever
// that missed (worker/cron.ts).
//
// Transcoding is billed on the container wall-clock a job consumed, not on
// how long the source video happens to be: the two correlate only loosely
// (a 720p remux runs several times faster than real time, a 1080p re-encode
// roughly at it), and container time is what Cloudflare bills us for.

import { and, eq, isNull } from "drizzle-orm";
import { trackFeature } from "./autumn.js";
import type { db as Db } from "./db/index.js";
import { videoJob } from "./db/schema/video-job.js";
import { parseTenantPath } from "./tenant.js";

type MeterableJob = {
  /** "ugc/{userId}/{bucketId}/..." - the owning account is recovered from it. */
  filePath: string;
  /** Stamped by PgVideoJobStore.getNextPendingJob when the worker claims it. */
  startedAt: number | null;
  /** Stamped by PgVideoJobStore.updateJobStatus when the job closes. */
  completedAt: number | null;
};

/**
 * The billed quantity for one completed job, or null if it cannot be
 * established - in which case the job must not be charged at all. Every
 * rejection here errs toward not billing, which is the correct side to fail
 * on for money.
 *
 * retryFailedJob clears startedAt, so a retried job reports only its final
 * attempt: our retries are not the customer's to pay for.
 */
export function billableJob(
  job: MeterableJob,
): { userId: string; seconds: number } | null {
  const userId = parseTenantPath(job.filePath)?.userId;
  if (!userId) return null;
  if (job.startedAt === null || job.completedAt === null) return null;
  const elapsedMs = job.completedAt - job.startedAt;
  // Zero or negative means the stamps are unusable (clock skew, or a row
  // written by an older code path); don't invent a charge out of them.
  if (elapsedMs <= 0) return null;
  // Round up: a sub-second job still woke the container, which is the
  // expensive part.
  return { userId, seconds: Math.ceil(elapsedMs / 1000) };
}

/**
 * Bills one completed job at most once, whichever runtime gets there first.
 *
 * Claimed before the charge, never after: Autumn's track is not idempotent,
 * so the claim (meteredAt, set only where it is still null) is what decides
 * who bills. A crash or a failed track after the claim leaves the job
 * unbilled rather than charged twice. An unbillable job is claimed too, so the
 * cron stops rescanning it.
 */
export async function meterJob(
  db: typeof Db,
  job: MeterableJob & { id: string },
  track = trackFeature,
): Promise<void> {
  const claimed = await db
    .update(videoJob)
    .set({ meteredAt: Date.now() })
    .where(and(eq(videoJob.id, job.id), isNull(videoJob.meteredAt)))
    .returning({ id: videoJob.id });
  if (claimed.length === 0) return;
  const billable = billableJob(job);
  if (billable) {
    await track(billable.userId, "video_processing_seconds", billable.seconds);
  }
}
