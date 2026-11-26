import { randomUUID } from "node:crypto";
import type {
  JobStats,
  JobStatus,
  VideoJobRecord,
  VideoJobStore,
} from "@openinary/core";
import { eq } from "drizzle-orm";
import type { db as Db } from "../shared/db/index.js";
import { videoJob } from "../shared/db/schema/video-job.js";
import { meterJob } from "../shared/video-metering.js";

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
 * The VideoJobStore interface is async, but this store still answers from
 * the Map: the container's VideoWorker polls the store every few seconds and
 * every video request looks its job up, and over neon-http each of those
 * would be an HTTPS round trip to Neon (and would keep Neon's compute from
 * ever suspending). The Map is therefore the actual source of truth for
 * every method below (each one resolves without awaiting anything, so its
 * read-modify-write stays atomic); Postgres writes are fire-and-forget
 * background mirrors, so a slow or failing write never fails a job.
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
        console.error("%s", `Failed to persist video job ${job.id}`, error);
      });
  }

  private persistDelete(id: string): void {
    this.db
      .delete(videoJob)
      .where(eq(videoJob.id, id))
      .catch((error: unknown) => {
        console.error("%s", `Failed to delete persisted video job ${id}`, error);
      });
  }

  async createJob(
    filePath: string,
    params: Record<string, string>,
    cachePath: string,
    priority = 2,
  ): Promise<string> {
    // Verbatim JSON.stringify of core's params, in the parser's insertion
    // order: the Worker finds this row for /video-status and the 202 estimate
    // by serializing its own deliveryTarget parse of the same URL the same way
    // (worker/video-jobs.ts), so sorting or reshaping it here loses the job.
    // The R2 key is separate (container/cache-params.ts).
    const paramsJson = JSON.stringify(params);
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

  async getNextPendingJob(): Promise<VideoJobRecord | null> {
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

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress?: number,
    error?: string,
  ): Promise<void> {
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
   * Bills the container time this job consumed now, instead of leaving it to
   * the Worker's hourly cron. The cron still sweeps anything this misses (a
   * crash before the claim, a job closed by an older build); meterJob's claim
   * is what keeps the two from billing the same job twice.
   *
   * Fire-and-forget like every other write in this class, so billing never
   * delays or fails the job's own status update.
   */
  private meter(job: VideoJobRecord): void {
    meterJob(this.db, {
      id: job.id,
      filePath: job.file_path,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    }).catch((error: unknown) => {
      console.error("%s", `Failed to meter video job ${job.id}`, error);
    });
  }

  async getJobByFileAndParams(
    filePath: string,
    params: Record<string, string>,
  ): Promise<VideoJobRecord | null> {
    const paramsJson = JSON.stringify(params);
    const matches = [...this.jobs.values()]
      .filter(
        (job) => job.file_path === filePath && job.params_json === paramsJson,
      )
      .sort((a, b) => b.created_at - a.created_at);
    return matches[0] ? { ...matches[0] } : null;
  }

  async getJobById(jobId: string): Promise<VideoJobRecord | null> {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  async getJobStats(): Promise<JobStats> {
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

  async getRecentJobs(limit = 50, offset = 0): Promise<VideoJobRecord[]> {
    return [...this.jobs.values()]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(offset, offset + limit);
  }

  async getJobsByStatus(status: JobStatus, limit = 50): Promise<VideoJobRecord[]> {
    return [...this.jobs.values()]
      .filter((job) => job.status === status)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }

  async countProcessingJobs(): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "processing") count++;
    }
    return count;
  }

  async cleanupOldJobs(olderThanHours = 24): Promise<number> {
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

  async retryFailedJob(jobId: string): Promise<boolean> {
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

  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "pending") {
      return false;
    }
    job.status = "cancelled";
    job.completed_at = Date.now();
    this.persistUpsert(job);
    return true;
  }

  async deleteJob(jobId: string): Promise<boolean> {
    if (!this.jobs.has(jobId)) {
      return false;
    }
    this.jobs.delete(jobId);
    this.persistDelete(jobId);
    return true;
  }

  async resetOrphanedProcessingJobs(): Promise<number> {
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

  async deleteJobsByFilePath(filePath: string): Promise<number> {
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
