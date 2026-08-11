// The arithmetic that decides what a customer pays for a video transform.
// Kept in its own module, free of Worker/DB imports, so it can be asserted
// directly (see worker/video-metering.test.ts) - worker/index.ts pulls in
// cloudflare:workers and the Neon client, neither of which loads under plain
// node.
//
// Lives under api/lib rather than worker/ because both runtimes bill from it:
// the container calls it the moment a job closes (see video-job-store.ts's
// updateJobStatus) and the Worker's cron sweeps whatever that missed. Only
// api/** is in the container's tsconfig include, so a worker/ path would not
// compile into the image.
//
// Transcoding is billed on the container wall-clock a job consumed, not on
// how long the source video happens to be: the two correlate only loosely
// (a 720p remux runs several times faster than real time, a 1080p re-encode
// roughly at it), and container time is what Cloudflare bills us for.

export type MeterableJob = {
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
  const userId = job.filePath.split("/")[1];
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
