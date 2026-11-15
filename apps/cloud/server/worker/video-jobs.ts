// The Worker's reads and deletes of video_job. The container is the only
// writer of a job's progress (container/video-job-store.ts); the Worker only
// reads rows to answer status and estimates, and removes them along with the
// file they belong to.

import { and, desc, eq, gt, inArray, like } from "drizzle-orm";
import { db } from "../shared/db/index.js";
import { videoJob } from "../shared/db/schema/video-job.js";
import { accountRootFor, parseTenantPath } from "../shared/tenant.js";
import { billableJob } from "../shared/video-metering.js";

// How far back a pending/processing row is still believed to be a live job.
// A row can outlive its container (crash, eviction, deploy), and such a
// zombie must not hold the instance awake forever - after this it is treated
// as stale. The next request wakes a fresh container, whose
// VideoWorker.start() resets the orphan to pending and re-runs it.
const ACTIVE_JOB_MAX_AGE_MS = 30 * 60_000;

/** Jobs still pending or processing, newest rows only (see ACTIVE_JOB_MAX_AGE_MS). */
export function activeVideoJobs(limit?: number) {
  const query = db
    .select({
      id: videoJob.id,
      filePath: videoJob.filePath,
      paramsJson: videoJob.paramsJson,
      status: videoJob.status,
      priority: videoJob.priority,
      progress: videoJob.progress,
      createdAt: videoJob.createdAt,
      startedAt: videoJob.startedAt,
    })
    .from(videoJob)
    .where(
      and(
        inArray(videoJob.status, ["pending", "processing"]),
        gt(videoJob.createdAt, Date.now() - ACTIVE_JOB_MAX_AGE_MS),
      ),
    );
  return limit === undefined ? query : query.limit(limit);
}

/**
 * The job for these params on this file, if any. `params` are core's, from
 * deliveryTarget: the container keys the row on the same parse of the same
 * transform segment, serialized verbatim (see container/video-job-store.ts).
 */
export async function findVideoJob(filePath: string, params: object) {
  const [row] = await db
    .select()
    .from(videoJob)
    .where(
      and(
        eq(videoJob.filePath, filePath),
        eq(videoJob.paramsJson, JSON.stringify(params)),
      ),
    )
    .orderBy(desc(videoJob.createdAt))
    .limit(1);
  return row;
}

/** This tenant's most recent jobs, for the queue events stream. */
export function tenantVideoJobs(tenantRoot: string) {
  return db
    .select()
    .from(videoJob)
    .where(like(videoJob.filePath, `${tenantRoot}/%`))
    .orderBy(desc(videoJob.createdAt))
    .limit(200);
}

/** Every job for one file, returning how many there were. */
export async function deleteVideoJobs(fullPath: string): Promise<number> {
  const deleted = await db
    .delete(videoJob)
    .where(eq(videoJob.filePath, fullPath))
    .returning({ id: videoJob.id });
  return deleted.length;
}

/** Every job under a folder, bucket or account prefix. */
export async function deleteVideoJobsUnder(prefix: string): Promise<void> {
  await db.delete(videoJob).where(like(videoJob.filePath, `${prefix}/%`));
}

// Video jobs are far rarer than deliveries and stored permanently, so the tab
// shows a fixed recent slice rather than interleaving a month of them.
const MAX_VIDEO_JOBS = 100;

/**
 * The billed side of video, read straight off the rows the charge was
 * computed from. `seconds` is recomputed through the same billableJob the
 * meter uses, so the figure in the tab cannot drift from the figure sent to
 * Autumn, and `metered` says whether it has been sent yet.
 */
export async function recentVideoJobs(userId: string) {
  const rows = await db
    .select({
      id: videoJob.id,
      filePath: videoJob.filePath,
      paramsJson: videoJob.paramsJson,
      status: videoJob.status,
      createdAt: videoJob.createdAt,
      startedAt: videoJob.startedAt,
      completedAt: videoJob.completedAt,
      meteredAt: videoJob.meteredAt,
    })
    .from(videoJob)
    .where(like(videoJob.filePath, `${accountRootFor(userId)}/%`))
    .orderBy(desc(videoJob.createdAt))
    .limit(MAX_VIDEO_JOBS);

  return rows.map((row) => {
    const owner = parseTenantPath(row.filePath);
    return {
      id: row.id,
      bucket: owner?.bucketId ?? "",
      path: owner?.path ?? "",
      params: row.paramsJson,
      status: row.status,
      createdAt: row.createdAt,
      /** Container wall-clock billed, or null when the job is not billable. */
      seconds: billableJob(row)?.seconds ?? null,
      metered: row.meteredAt !== null,
    };
  });
}
