import { randomUUID } from "node:crypto";
import type {
  JobStats,
  JobStatus,
  VideoJobRecord,
  VideoJobStore,
} from "@openinary/core";
import { and, eq, isNull } from "drizzle-orm";
import type { db as Db } from "../db/index.js";
import { videoJob } from "../db/schema/video-job.js";
import { trackFeature } from "./autumn.js";
import { billableJob } from "./video-metering.js";

/**
 * Verbatim `JSON.stringify`, and it has to stay that way: this string is not
 * just a lookup key, it is the R2 cache key.
 *
 * VideoWorker.processJob does `JSON.parse(job.params_json)` and hands the
 * result straight to `storage.upload`, whose key is
 * `md5(filePath + JSON.stringify(params))` - so whatever key *order* is
 * persisted here is the order the transform gets written under. Sorting the
 * keys (which this used to do, to make lookups order-insensitive) moved the
 * object to a key nobody computes: core's own cache check and the Worker's
 * tryServeFromR2Cache both build params in parseTransform's insertion order.
 * The encode landed somewhere unreadable, core's "completed but cache
 * missing" branch re-queued the job, and every single request re-ran the
 * transcode - forever, billed to the customer each time.
 *
 * Invisible with a single param (a one-key object sorts to itself), which is
 * why w_303 worked and w_303,h_100 looped.
 *
 * Order-insensitivity was never needed: parseTransform assigns width/height/
 * resize/crop in a fixed order regardless of how the URL spells them, so the
 * same transform always serializes the same way.
 */
function serializeParams(params: Record<string, string>): string {
  return JSON.stringify(params);
}

function toRow(job: VideoJobRecord) {
  return {
    id: job.id,
    filePath: job.file_path,
    paramsJson: job.params_json,
    cachePath: job.cache_path,
    status: job.status,
    priority: job.priority,
    progress: job.progress,
    error: job.error,
    retryCount: job.retry_count,
    maxRetries: job.max_retries,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  };
}

function fromRow(row: typeof videoJob.$inferSelect): VideoJobRecord {
  return {
    id: row.id,
    file_path: row.filePath,
    params_json: row.paramsJson,
    cache_path: row.cachePath,
    status: row.status as JobStatus,
    priority: row.priority,
    progress: row.progress,
    error: row.error,
    retry_count: row.retryCount,
    max_retries: row.maxRetries,
    created_at: row.createdAt,
    started_at: row.startedAt,
    completed_at: row.completedAt,
  };
}

/**
 * VideoJobStore backed by an in-memory Map, mirrored in the background to
 * the `video_job` Postgres table so jobs survive a restart/redeploy.
 *
 * @openinary/core calls every VideoJobStore method synchronously (see
 * VideoWorker's polling loop and VideoJobQueue.addJob/getJob/getJobByPath -
 * none of those call sites `await` the store), so a network-backed store
 * can't implement this interface directly: every read has to return
 * immediately. The Map is therefore the actual source of truth for every
 * method below; Postgres writes are fire-and-forget background mirrors.
 * Call `hydrate()` once at startup, before wiring this into
 * `new VideoJobQueue(store)`, to repopulate the Map from Postgres.
 *
 * This makes the queue durable across restarts of a single instance. It
 * does not coordinate multiple concurrent server instances - each keeps
 * its own in-memory Map, so `getNextPendingJob` can't dedupe claims across
 * instances the way `FOR UPDATE SKIP LOCKED` would.
 */
export class PgVideoJobStore implements VideoJobStore {
  private jobs = new Map<string, VideoJobRecord>();

  constructor(private db: typeof Db) {}

  async hydrate(): Promise<void> {
    const rows = await this.db.select().from(videoJob);
    for (const row of rows) {
      this.jobs.set(row.id, fromRow(row));
    }
  }

  private persistUpsert(job: VideoJobRecord): void {
    this.db
      .insert(videoJob)
      .values(toRow(job))
      .onConflictDoUpdate({ target: videoJob.id, set: toRow(job) })
      .catch((error: unknown) => {
        console.error(`Failed to persist video job ${job.id}`, error);
      });
  }

  private persistDelete(id: string): void {
    this.db
      .delete(videoJob)
      .where(eq(videoJob.id, id))
      .catch((error: unknown) => {
        console.error(`Failed to delete persisted video job ${id}`, error);
      });
  }

  createJob(
    filePath: string,
    params: Record<string, string>,
    cachePath: string,
    priority = 2,
  ): string {
    const paramsJson = serializeParams(params);
    const existing = [...this.jobs.values()].find(
      (job) =>
        job.file_path === filePath &&
        job.params_json === paramsJson &&
        (job.status === "pending" || job.status === "processing"),
    );
    if (existing) {
      return existing.id;
    }

    const job: VideoJobRecord = {
      id: randomUUID(),
      file_path: filePath,
      params_json: paramsJson,
      cache_path: cachePath,
      status: "pending",
      priority,
      progress: 0,
      error: null,
      retry_count: 0,
      max_retries: 3,
      created_at: Date.now(),
      started_at: null,
      completed_at: null,
    };
    this.jobs.set(job.id, job);
    this.persistUpsert(job);
    return job.id;
  }

  getNextPendingJob(): VideoJobRecord | null {
    const pending = [...this.jobs.values()]
      .filter((job) => job.status === "pending")
      .sort((a, b) => a.priority - b.priority || a.created_at - b.created_at);
    const job = pending[0];
    if (!job) {
      return null;
    }
    job.status = "processing";
    job.started_at = Date.now();
    this.persistUpsert(job);
    return { ...job };
  }

  updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress?: number,
    error?: string,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    job.status = status;
    if (progress !== undefined) {
      job.progress = progress;
    }
    if (error !== undefined) {
      job.error = error;
    }
    if (
      status === "completed" ||
      status === "error" ||
      status === "cancelled"
    ) {
      job.completed_at = Date.now();
    }
    this.persistUpsert(job);
    // status, not completed_at: "error" and "cancelled" stamp it too, and
    // neither produced a transform the customer should pay for.
    if (status === "completed") this.meter(job);
  }

  /**
   * Bills the container time this job consumed, now, instead of leaving it to
   * the Worker's five-minute cron. That cron still runs and still catches
   * anything this misses (a crash between the two writes below, a job closed
   * by an older build), so this is a latency fix rather than a second billing
   * path: both read the same two timestamps through billableJob, and both
   * claim the row through meteredAt.
   *
   * Fire-and-forget like every other write in this class - @openinary/core
   * calls updateJobStatus synchronously and never awaits it.
   */
  private meter(job: VideoJobRecord): void {
    const billable = billableJob({
      filePath: job.file_path,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    });
    if (!billable) return;
    // Claimed before the charge, not after: Autumn's track is not idempotent,
    // so a crash between the two must leave the job unbilled rather than let
    // the cron bill it a second time. The conditional keeps this a no-op if
    // the cron got there first.
    this.db
      .update(videoJob)
      .set({ meteredAt: Date.now() })
      .where(and(eq(videoJob.id, job.id), isNull(videoJob.meteredAt)))
      .returning({ id: videoJob.id })
      .then((claimed) => {
        if (claimed.length === 0) return;
        return trackFeature(
          billable.userId,
          "video_processing_seconds",
          billable.seconds,
        );
      })
      .catch((error: unknown) => {
        console.error(`Failed to meter video job ${job.id}`, error);
      });
  }

  getJobByFileAndParams(
    filePath: string,
    params: Record<string, string>,
  ): VideoJobRecord | null {
    const paramsJson = serializeParams(params);
    const matches = [...this.jobs.values()]
      .filter(
        (job) => job.file_path === filePath && job.params_json === paramsJson,
      )
      .sort((a, b) => b.created_at - a.created_at);
    return matches[0] ? { ...matches[0] } : null;
  }

  getJobById(jobId: string): VideoJobRecord | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  getJobStats(): JobStats {
    const stats: JobStats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      error: 0,
    };
    for (const job of this.jobs.values()) {
      stats.total++;
      if (job.status === "pending") stats.pending++;
      else if (job.status === "processing") stats.processing++;
      else if (job.status === "completed") stats.completed++;
      else if (job.status === "error") stats.error++;
    }
    return stats;
  }

  getRecentJobs(limit = 50, offset = 0): VideoJobRecord[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(offset, offset + limit);
  }

  getJobsByStatus(status: JobStatus, limit = 50): VideoJobRecord[] {
    return [...this.jobs.values()]
      .filter((job) => job.status === status)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }

  countProcessingJobs(): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "processing") count++;
    }
    return count;
  }

  cleanupOldJobs(olderThanHours = 24): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    let count = 0;
    for (const job of [...this.jobs.values()]) {
      const isTerminal =
        job.status === "completed" ||
        job.status === "error" ||
        job.status === "cancelled";
      if (
        isTerminal &&
        job.completed_at !== null &&
        job.completed_at < cutoff
      ) {
        this.jobs.delete(job.id);
        this.persistDelete(job.id);
        count++;
      }
    }
    return count;
  }

  retryFailedJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "error" || job.retry_count >= job.max_retries) {
      return false;
    }
    job.status = "pending";
    job.retry_count += 1;
    job.error = null;
    job.started_at = null;
    job.completed_at = null;
    this.persistUpsert(job);
    return true;
  }

  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "pending") {
      return false;
    }
    job.status = "cancelled";
    job.completed_at = Date.now();
    this.persistUpsert(job);
    return true;
  }

  deleteJob(jobId: string): boolean {
    if (!this.jobs.has(jobId)) {
      return false;
    }
    this.jobs.delete(jobId);
    this.persistDelete(jobId);
    return true;
  }

  resetOrphanedProcessingJobs(): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "processing") {
        job.status = "pending";
        job.started_at = null;
        this.persistUpsert(job);
        count++;
      }
    }
    return count;
  }

  deleteJobsByFilePath(filePath: string): number {
    let count = 0;
    for (const job of [...this.jobs.values()]) {
      if (job.file_path === filePath) {
        this.jobs.delete(job.id);
        this.persistDelete(job.id);
        count++;
      }
    }
    return count;
  }
}
