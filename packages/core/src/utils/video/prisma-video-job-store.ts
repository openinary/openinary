import { randomUUID } from "crypto";
import type { parseParams } from "../parser";
import logger, { serializeError } from "../logger";
import type {
  VideoJob,
  JobStats,
  JobStatus,
  VideoJobStore,
} from "./queue-store";

/**
 * Milliseconds a claimed job may go without a heartbeat before it is
 * considered dead (crashed worker, lost process) and eligible for reclaim.
 * 5 minutes comfortably exceeds a typical WORKER_POLL_INTERVAL_MS tick plus
 * one progress callback.
 */
export const LEASE_TTL_MS = 300_000;

/**
 * Structural slice of PrismaClient this store needs. Keeping the dependency
 * structural (no import of the generated client) preserves core's standalone
 * package boundary: consumers pass the shared PrismaClient from
 * `getDb()` (packages/shared), and core's .d.ts stays self-contained for
 * embedders (e.g. apps/cloud) that don't use Prisma.
 */
export interface VideoJobDbClient {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<P>(fn: (tx: VideoJobRawClient) => Promise<P>): Promise<P>;
}

/** Raw-client surface available inside a $transaction callback. */
export interface VideoJobRawClient {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<number>;
}

/**
 * Normalize params to a consistent JSON string. Sorts keys alphabetically so
 * the same params always produce the same string regardless of key order.
 */
function normalizeParamsJson(params: unknown): string {
  if (!params || typeof params !== "object") {
    return JSON.stringify(params);
  }

  const sortedKeys = Object.keys(params).sort();
  const normalized: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    normalized[key] = (params as Record<string, unknown>)[key];
  }

  return JSON.stringify(normalized);
}

/** Raw snake_case row as returned by $queryRaw over the video_jobs table. */
interface VideoJobRow {
  id: string;
  file_path: string;
  params_json: string;
  cache_path: string;
  status: string;
  priority: number;
  progress: number;
  error: string | null;
  retry_count: number;
  max_retries: number;
  created_at: bigint;
  started_at: bigint | null;
  completed_at: bigint | null;
  claimed_by?: string | null;
  heartbeat_at?: bigint | null;
}

/**
 * Convert a raw DB row (snake_case columns, BigInt timestamps) to the
 * VideoJob interface (number timestamps) at the store boundary. Epoch-ms
 * values fit losslessly in a double, so Number() is safe.
 */
function toVideoJob(row: VideoJobRow): VideoJob {
  return {
    id: row.id,
    file_path: row.file_path,
    params_json: row.params_json,
    cache_path: row.cache_path,
    status: row.status as VideoJob["status"],
    priority: row.priority,
    progress: row.progress,
    error: row.error,
    retry_count: row.retry_count,
    max_retries: row.max_retries,
    created_at: Number(row.created_at),
    started_at: row.started_at === null ? null : Number(row.started_at),
    completed_at: row.completed_at === null ? null : Number(row.completed_at),
  };
}

/**
 * PostgreSQL-backed VideoJobStore for the self-hosted app, taking a Prisma
 * client (from packages/shared's getDb()) as a constructor argument rather
 * than importing a global, so callers control which database it operates
 * against.
 *
 * # Multi-node design
 *
 * The old SQLite store (sqlite-video-job-store.ts, now deleted) was
 * single-node by construction. This store is safe for multiple replicas
 * against one Postgres:
 *
 * - **Claiming** (`getNextPendingJob`) is a single atomic
 *   `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)
 *   RETURNING *` statement: two workers racing on the same pending set never
 *   claim the same row — `FOR UPDATE SKIP LOCKED` makes a concurrent claimer
 *   skip a row the winner holds, and the `status='pending'` filter inside
 *   the subquery re-checks eligibility under the lock. The statement runs
 *   inside `prisma.$transaction` for a clean interactive transaction
 *   boundary. The claimed row records `claimed_by` (this store instance's
 *   worker id) and `heartbeat_at` (claim time).
 * - **Leases**: a claimed job keeps its lease by refreshing `heartbeat_at`.
 *   The worker runs a per-job interval (60s in video-worker.ts) calling
 *   `updateJobStatus(jobId, "processing")`; each such update refreshes
 *   `heartbeat_at` and is FENCED — it only applies when `claimed_by` still
 *   matches this store's worker id (or is NULL), so a heartbeat from a worker
 *   whose lease was lost no-ops rather than resurrecting a stolen row.
 *   Jobs outliving one heartbeat interval therefore stay fresh through
 *   `resetOrphanedProcessingJobs`.
 * - **Stale reclaim** (`resetOrphanedProcessingJobs`) only resets
 *   `processing` rows whose heartbeat is older than `LEASE_TTL_MS` (or
 *   NULL — rows claimed before leases existed / reset paths). Fresh rows
 *   owned by a live worker on ANY node are never touched. This replaces the
 *   sqlite store's unconditional reset of ALL processing rows, which was
 *   only safe because exactly one process could hold the database file.
 *
 * # Shared processing budget
 *
 * `countProcessingJobs` returns the GLOBAL count of processing rows, not a
 * per-process one. On a multi-replica deployment every worker polls against
 * the same budget, so MAX_CONCURRENT_JOBS becomes a fleet-wide limit. That
 * matches the multi-node target: one shared queue, each job claimed exactly
 * once.
 *
 * # SQLite deprecation
 *
 * This store replaces sqlite-video-job-store.ts. Self-hosted Openinary is
 * Postgres-only (see the postgres-support plan); no conversion tooling.
 */
export class PrismaVideoJobStore implements VideoJobStore {
  /** Worker identity stamped on claimed rows (diagnostics + lease audit). */
  private readonly workerId: string;

  constructor(
    private db: VideoJobDbClient,
    workerId: string = randomUUID(),
  ) {
    this.workerId = workerId;
  }

  async createJob(
    filePath: string,
    params: ReturnType<typeof parseParams>,
    cachePath: string,
    priority: number = 2,
  ): Promise<string> {
    const jobId = randomUUID();
    const paramsJson = normalizeParamsJson(params);
    const now = Date.now();

    try {
      const existing = await this.db.$queryRaw<VideoJobRow[]>`
        SELECT * FROM video_jobs
        WHERE file_path = ${filePath} AND params_json = ${paramsJson}
          AND status IN ('pending', 'processing')
      `;

      if (existing.length > 0) {
        logger.debug(
          {
            existingJobId: existing[0].id,
            status: existing[0].status,
            filePath,
          },
          "Job already exists, returning existing job ID",
        );
        return existing[0].id;
      }

      await this.db.$executeRaw`
        INSERT INTO video_jobs (
          id, file_path, params_json, cache_path, status, priority,
          progress, retry_count, max_retries, created_at
        ) VALUES (
          ${jobId}, ${filePath}, ${paramsJson}, ${cachePath}, 'pending', ${priority},
          0, 0, 3, ${now}
        )
      `;

      logger.info({ jobId, filePath, priority }, "Created new video job");
      return jobId;
    } catch (error) {
      logger.error(
        { error: serializeError(error), filePath },
        "Failed to create job",
      );
      throw error;
    }
  }

  async getNextPendingJob(): Promise<VideoJob | null> {
    try {
      const now = Date.now();

      const rows = await this.db.$transaction((tx) =>
        tx.$queryRaw<VideoJobRow[]>`
          UPDATE video_jobs
          SET status = 'processing',
              started_at = ${now},
              claimed_by = ${this.workerId},
              heartbeat_at = ${now}
          WHERE id = (
            SELECT id FROM video_jobs
            WHERE status = 'pending'
            ORDER BY priority ASC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING *
        `,
      );

      const job = rows[0];
      if (job) {
        logger.debug(
          { jobId: job.id, filePath: job.file_path },
          "Retrieved next pending job",
        );
        return toVideoJob(job);
      }

      return null;
    } catch (error) {
      logger.error(
        { error: serializeError(error) },
        "Failed to get next pending job",
      );
      return null;
    }
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress?: number,
    error?: string,
  ): Promise<void> {
    try {
      const now = Date.now();
      // SET fragments are fixed strings; all values are bound placeholders,
      // so nothing user-controlled ever joins the SQL text.
      const sets: string[] = ["status = $1"];
      const values: unknown[] = [status];

      if (progress !== undefined) {
        sets.push(`progress = $${values.length + 1}`);
        values.push(progress);
      }

      if (error !== undefined) {
        sets.push(`error = $${values.length + 1}`);
        values.push(error);
      }

      if (
        status === "completed" ||
        status === "error" ||
        status === "cancelled"
      ) {
        sets.push(`completed_at = $${values.length + 1}`);
        values.push(now);
      }

      if (status === "processing") {
        sets.push(`heartbeat_at = $${values.length + 1}`);
        values.push(now);
        sets.push(`claimed_by = $${values.length + 1}`);
        values.push(this.workerId);
      } else {
        sets.push(`claimed_by = $${values.length + 1}`);
        values.push(null);
      }

      values.push(jobId);
      let query = `UPDATE video_jobs SET ${sets.join(", ")} WHERE id = $${values.length}`;

      // Lease fencing for heartbeats: a "processing" update may only refresh
      // a row this store's worker still holds (or one no one holds). A
      // heartbeat arriving after the lease was lost (row reclaimed by another
      // worker) no-ops instead of resurrecting the stolen row. Terminal and
      // pending transitions stay unfenced — external routes (retry/cancel)
      // and convergence depend on them.
      if (status === "processing") {
        query += ` AND (claimed_by = $${values.length + 1} OR claimed_by IS NULL)`;
        values.push(this.workerId);
      }

      await this.db.$executeRawUnsafe(query, ...values);

      logger.debug({ jobId, status, progress }, "Updated job status");
    } catch (error) {
      logger.error(
        { error: serializeError(error), jobId, status },
        "Failed to update job status",
      );
      throw error;
    }
  }

  async getJobByFileAndParams(
    filePath: string,
    params: ReturnType<typeof parseParams>,
  ): Promise<VideoJob | null> {
    try {
      const paramsJson = normalizeParamsJson(params);
      const rows = await this.db.$queryRaw<VideoJobRow[]>`
        SELECT * FROM video_jobs
        WHERE file_path = ${filePath} AND params_json = ${paramsJson}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      return rows[0] ? toVideoJob(rows[0]) : null;
    } catch (error) {
      logger.error(
        { error: serializeError(error), filePath },
        "Failed to get job by file and params",
      );
      return null;
    }
  }

  async getJobById(jobId: string): Promise<VideoJob | null> {
    try {
      const rows = await this.db.$queryRaw<VideoJobRow[]>`
        SELECT * FROM video_jobs WHERE id = ${jobId}
      `;

      return rows[0] ? toVideoJob(rows[0]) : null;
    } catch (error) {
      logger.error(
        { error: serializeError(error), jobId },
        "Failed to get job by ID",
      );
      return null;
    }
  }

  async getJobStats(): Promise<JobStats> {
    try {
      const rows = await this.db.$queryRaw<JobStats[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'error')::int AS error
        FROM video_jobs
      `;

      return (
        rows[0] ?? { total: 0, pending: 0, processing: 0, completed: 0, error: 0 }
      );
    } catch (error) {
      logger.error({ error: serializeError(error) }, "Failed to get job stats");
      return { total: 0, pending: 0, processing: 0, completed: 0, error: 0 };
    }
  }

  async getRecentJobs(
    limit: number = 50,
    offset: number = 0,
  ): Promise<VideoJob[]> {
    try {
      const rows = await this.db.$queryRaw<VideoJobRow[]>`
        SELECT * FROM video_jobs
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return rows.map(toVideoJob);
    } catch (error) {
      logger.error(
        { error: serializeError(error), limit, offset },
        "Failed to get recent jobs",
      );
      return [];
    }
  }

  async getJobsByStatus(
    status: JobStatus,
    limit: number = 50,
  ): Promise<VideoJob[]> {
    try {
      const rows = await this.db.$queryRaw<VideoJobRow[]>`
        SELECT * FROM video_jobs
        WHERE status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      return rows.map(toVideoJob);
    } catch (error) {
      logger.error(
        { error: serializeError(error), status, limit },
        "Failed to get jobs by status",
      );
      return [];
    }
  }

  async countProcessingJobs(): Promise<number> {
    try {
      const rows = await this.db.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM video_jobs
        WHERE status = 'processing'
      `;

      return rows[0]?.count ?? 0;
    } catch (error) {
      logger.error(
        { error: serializeError(error) },
        "Failed to count processing jobs",
      );
      return 0;
    }
  }

  async cleanupOldJobs(olderThanHours: number = 24): Promise<number> {
    try {
      const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;

      const deleted = await this.db.$executeRaw`
        DELETE FROM video_jobs
        WHERE status IN ('completed', 'error', 'cancelled')
          AND completed_at < ${cutoffTime}
      `;

      if (deleted > 0) {
        logger.info(
          { deletedCount: deleted, olderThanHours },
          "Cleaned up old jobs",
        );
      }

      return deleted;
    } catch (error) {
      logger.error(
        { error: serializeError(error), olderThanHours },
        "Failed to cleanup old jobs",
      );
      return 0;
    }
  }

  async retryFailedJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.getJobById(jobId);

      if (!job) {
        logger.warn({ jobId }, "Cannot retry: job not found");
        return false;
      }

      if (job.status !== "error") {
        logger.warn(
          { jobId, status: job.status },
          "Cannot retry: job is not in error state",
        );
        return false;
      }

      if (job.retry_count >= job.max_retries) {
        logger.warn(
          { jobId, retry_count: job.retry_count },
          "Cannot retry: max retries reached",
        );
        return false;
      }

      await this.db.$executeRaw`
        UPDATE video_jobs
        SET status = 'pending',
            retry_count = retry_count + 1,
            error = NULL,
            started_at = NULL,
            completed_at = NULL,
            claimed_by = NULL,
            heartbeat_at = NULL
        WHERE id = ${jobId}
      `;

      logger.info(
        { jobId, retry_count: job.retry_count + 1 },
        "Job scheduled for retry",
      );
      return true;
    } catch (error) {
      logger.error(
        { error: serializeError(error), jobId },
        "Failed to retry job",
      );
      return false;
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.getJobById(jobId);

      if (!job) {
        logger.warn({ jobId }, "Cannot cancel: job not found");
        return false;
      }

      if (job.status !== "pending") {
        logger.warn(
          { jobId, status: job.status },
          "Cannot cancel: job is not pending",
        );
        return false;
      }

      const now = Date.now();
      await this.db.$executeRaw`
        UPDATE video_jobs
        SET status = 'cancelled', completed_at = ${now}
        WHERE id = ${jobId}
      `;

      logger.info({ jobId }, "Job cancelled");
      return true;
    } catch (error) {
      logger.error(
        { error: serializeError(error), jobId },
        "Failed to cancel job",
      );
      return false;
    }
  }

  async deleteJob(jobId: string): Promise<boolean> {
    try {
      const deleted = await this.db.$executeRaw`
        DELETE FROM video_jobs WHERE id = ${jobId}
      `;

      if (deleted > 0) {
        logger.info({ jobId }, "Job deleted");
        return true;
      }

      logger.warn({ jobId }, "Job not found for deletion");
      return false;
    } catch (error) {
      logger.error(
        { error: serializeError(error), jobId },
        "Failed to delete job",
      );
      return false;
    }
  }

  async resetOrphanedProcessingJobs(): Promise<number> {
    try {
      const cutoff = Date.now() - LEASE_TTL_MS;

      const reset = await this.db.$executeRaw`
        UPDATE video_jobs
        SET status = 'pending',
            started_at = NULL,
            claimed_by = NULL,
            heartbeat_at = NULL
        WHERE status = 'processing'
          AND (heartbeat_at IS NULL OR heartbeat_at < ${cutoff})
      `;

      if (reset > 0) {
        logger.warn({ resetCount: reset }, "Reset stale leased jobs to pending");
      }

      return reset;
    } catch (error) {
      logger.error(
        { error: serializeError(error) },
        "Failed to reset orphaned processing jobs",
      );
      return 0;
    }
  }

  async deleteJobsByFilePath(filePath: string): Promise<number> {
    try {
      const deleted = await this.db.$executeRaw`
        DELETE FROM video_jobs WHERE file_path = ${filePath}
      `;

      if (deleted > 0) {
        logger.info(
          { filePath, deletedCount: deleted },
          "Deleted jobs for file path",
        );
      } else {
        logger.debug({ filePath }, "No jobs found for file path");
      }

      return deleted;
    } catch (error) {
      logger.error(
        { error: serializeError(error), filePath },
        "Failed to delete jobs by file path",
      );
      return 0;
    }
  }
}
