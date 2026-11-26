import { randomUUID } from "crypto";
import { type Database, type Kysely, type Schema, type Updateable, type VideoJobsTable, sql } from "shared";
import {
  logger,
  serializeError,
  type VideoJobRecord as VideoJob,
  type JobStats,
  type JobStatus,
  type VideoJobStore,
} from "@openinary/core";

type VideoTransformParams = Parameters<VideoJobStore["createJob"]>[1];

/**
 * How long a job may sit in "processing" on Postgres before a node treats it
 * as orphaned (its node died) and puts it back to pending. See
 * {@link DbVideoJobStore.resetOrphanedProcessingJobs}.
 */
export const POSTGRES_ORPHAN_AFTER_MS = 2 * 60 * 60 * 1000;

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

/**
 * VideoJobStore over the instance's database (the video_jobs table, see
 * shared's db/index.ts), on SQLite or Postgres alike.
 *
 * Several processes, or several nodes sharing one Postgres, may run a worker
 * against the same table, so:
 * - {@link getNextPendingJob} claims in one UPDATE ... RETURNING, so two
 *   workers never get the same job (with `FOR UPDATE SKIP LOCKED` on
 *   Postgres, so concurrent claims pick different jobs instead of waiting).
 * - {@link createJob} inserts only when no pending or processing job exists
 *   for the same file and params, in one statement (atomic on SQLite), and
 *   on Postgres in a transaction holding an advisory lock per file+params,
 *   so two requests for the same transform queue one job.
 * - {@link resetOrphanedProcessingJobs} differs per dialect, see there.
 */
export class DbVideoJobStore implements VideoJobStore {
  private readonly resolveDb: () => Promise<Database>;

  /**
   * `db` is a database, or a function returning one (e.g. shared's
   * getDatabase), so the store can be built at import time before the
   * database is open.
   */
  constructor(
    db: Database | (() => Promise<Database>),
    private maxRetries = 3,
    private orphanAfterMs = POSTGRES_ORPHAN_AFTER_MS,
  ) {
    this.resolveDb = typeof db === "function" ? db : () => Promise.resolve(db);
  }

  async createJob(
    filePath: string,
    params: VideoTransformParams,
    cachePath: string,
    priority: number = 2,
  ): Promise<string> {
    const jobId = randomUUID();
    const paramsJson = normalizeParamsJson(params);
    const now = Date.now();

    try {
      const db = await this.resolveDb();
      // One statement: inserts unless a pending or processing job exists for
      // the same file and params. Atomic on SQLite, where a write statement
      // takes the write lock before it reads (a read-then-insert transaction
      // could fail with SQLITE_BUSY against another connection instead).
      const insertIfAbsent = async (executor: Kysely<Schema>) => {
        const inserted = await sql`
          INSERT INTO video_jobs (
            id, file_path, params_json, cache_path, status, priority,
            progress, retry_count, max_retries, created_at
          )
          SELECT
            CAST(${jobId} AS TEXT), CAST(${filePath} AS TEXT), CAST(${paramsJson} AS TEXT),
            CAST(${cachePath} AS TEXT), 'pending', CAST(${priority} AS INTEGER),
            0, 0, CAST(${this.maxRetries} AS INTEGER), CAST(${now} AS BIGINT)
          WHERE NOT EXISTS (
            SELECT 1 FROM video_jobs
            WHERE file_path = ${filePath} AND params_json = ${paramsJson}
              AND status IN ('pending', 'processing')
          )
        `.execute(executor);
        if (Number(inserted.numAffectedRows) === 1) return { inserted: true, existingJob: undefined };
        // An existing job for the same file and params is reused
        const existingJob = await executor
          .selectFrom("video_jobs")
          .select(["id", "status"])
          .where("file_path", "=", filePath)
          .where("params_json", "=", paramsJson)
          .where("status", "in", ["pending", "processing"])
          .orderBy("created_at", "desc")
          .executeTakeFirst();
        return { inserted: false, existingJob };
      };

      let result: Awaited<ReturnType<typeof insertIfAbsent>> | undefined;
      // Twice at most: the job that blocked the insert may finish before the
      // lookup sees it, and then a new one is due.
      for (let attempt = 0; attempt < 2 && !result; attempt++) {
        const outcome =
          db.dialect === "postgres"
            ? await db.transaction().execute(async (trx) => {
                // Under READ COMMITTED two such inserts could both find no job
                // and both insert; this lock (released at commit) makes the
                // second wait for the first and then see its job.
                await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`video_job:${filePath}\n${paramsJson}`}, 0))`.execute(trx);
                return insertIfAbsent(trx);
              })
            : await insertIfAbsent(db);
        if (outcome.inserted || outcome.existingJob) result = outcome;
      }
      if (!result) throw new Error("Could not create or find a job for this transform");

      if (result.existingJob) {
        logger.debug(
          {
            existingJobId: result.existingJob.id,
            status: result.existingJob.status,
            filePath,
          },
          "Job already exists, returning existing job ID",
        );
        return result.existingJob.id;
      }

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
      const db = await this.resolveDb();
      const now = Date.now();
      // One statement, so the claim is atomic across processes and nodes:
      // the subquery picks the next job, the outer UPDATE takes it only if it
      // is still pending. On Postgres, SKIP LOCKED makes a concurrent claim
      // skip the row another transaction is taking and pick the next one.
      const next = db
        .selectFrom("video_jobs")
        .select("id")
        .where("status", "=", "pending")
        .orderBy("priority", "asc")
        .orderBy("created_at", "asc")
        .limit(1)
        .$if(db.dialect === "postgres", (qb) => qb.forUpdate().skipLocked());
      const job = await db
        .updateTable("video_jobs")
        .set({ status: "processing", started_at: now })
        .where("id", "=", next)
        .where("status", "=", "pending")
        .returningAll()
        .executeTakeFirst();

      if (!job) return null;

      logger.debug(
        { jobId: job.id, filePath: job.file_path },
        "Retrieved next pending job",
      );
      return job;
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
      const updates: Updateable<VideoJobsTable> = { status };
      if (progress !== undefined) updates.progress = progress;
      if (error !== undefined) updates.error = error;
      if (
        status === "completed" ||
        status === "error" ||
        status === "cancelled"
      ) {
        updates.completed_at = Date.now();
      }

      const db = await this.resolveDb();
      await db
        .updateTable("video_jobs")
        .set(updates)
        .where("id", "=", jobId)
        .execute();

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
    params: VideoTransformParams,
  ): Promise<VideoJob | null> {
    try {
      const db = await this.resolveDb();
      const job = await db
        .selectFrom("video_jobs")
        .selectAll()
        .where("file_path", "=", filePath)
        .where("params_json", "=", normalizeParamsJson(params))
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst();
      return job ?? null;
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
      const db = await this.resolveDb();
      const job = await db
        .selectFrom("video_jobs")
        .selectAll()
        .where("id", "=", jobId)
        .executeTakeFirst();
      return job ?? null;
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
      const db = await this.resolveDb();
      const { rows } = await sql<JobStats>`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END), 0) AS processing,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
          COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS error
        FROM video_jobs
      `.execute(db);
      return rows[0];
    } catch (error) {
      logger.error({ error: serializeError(error) }, "Failed to get job stats");
      return { total: 0, pending: 0, processing: 0, completed: 0, error: 0 };
    }
  }

  async getRecentJobs(limit: number = 50, offset: number = 0): Promise<VideoJob[]> {
    try {
      const db = await this.resolveDb();
      return await db
        .selectFrom("video_jobs")
        .selectAll()
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
    } catch (error) {
      logger.error(
        { error: serializeError(error), limit, offset },
        "Failed to get recent jobs",
      );
      return [];
    }
  }

  async getJobsByStatus(status: JobStatus, limit: number = 50): Promise<VideoJob[]> {
    try {
      const db = await this.resolveDb();
      return await db
        .selectFrom("video_jobs")
        .selectAll()
        .where("status", "=", status)
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute();
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
      const db = await this.resolveDb();
      const result = await db
        .selectFrom("video_jobs")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("status", "=", "processing")
        .executeTakeFirstOrThrow();
      return Number(result.count);
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
      const db = await this.resolveDb();
      const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;
      const result = await db
        .deleteFrom("video_jobs")
        .where("status", "in", ["completed", "error", "cancelled"])
        .where("completed_at", "<", cutoffTime)
        .executeTakeFirst();
      const deleted = Number(result.numDeletedRows);

      if (deleted > 0) {
        logger.info(
          { deletedCount: deleted, olderThanHours },
          "Cleaned up old jobs",
        );
      }
      // On Postgres the boot-time reset only takes stale jobs, so a job
      // orphaned while this node kept running would otherwise wait for the
      // next boot; this is that reset's periodic half.
      if (db.dialect === "postgres") await this.resetOrphanedProcessingJobs();
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

      const db = await this.resolveDb();
      // Still in error: two retries of one job can't both count
      const result = await db
        .updateTable("video_jobs")
        .set((eb) => ({
          status: "pending",
          retry_count: eb("retry_count", "+", 1),
          error: null,
          started_at: null,
          completed_at: null,
        }))
        .where("id", "=", jobId)
        .where("status", "=", "error")
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        logger.warn({ jobId }, "Cannot retry: job changed state meanwhile");
        return false;
      }

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

      const db = await this.resolveDb();
      // Still pending: a worker may have claimed it since the read above
      const result = await db
        .updateTable("video_jobs")
        .set({ status: "cancelled", completed_at: Date.now() })
        .where("id", "=", jobId)
        .where("status", "=", "pending")
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) {
        logger.warn({ jobId }, "Cannot cancel: job is no longer pending");
        return false;
      }

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
      const db = await this.resolveDb();
      const result = await db
        .deleteFrom("video_jobs")
        .where("id", "=", jobId)
        .executeTakeFirst();

      if (Number(result.numDeletedRows) > 0) {
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

  /**
   * Puts jobs left "processing" by a crash or restart back to pending. Runs
   * when the worker starts.
   *
   * - SQLite: every processing job. One instance owns the file, and at boot
   *   nothing is running yet, so all of them are orphans.
   * - Postgres: only jobs that started more than `orphanAfterMs` (2 h by
   *   default) ago. Other nodes sharing the database may be encoding the
   *   rest right now; resetting them would make a second node run the same
   *   job on every boot or rolling deploy. The cost: a job orphaned by a
   *   crash waits up to that long before it is picked up again (also by
   *   cleanupOldJobs, which reclaims stale jobs every run on Postgres), and
   *   an encode running longer than that may be run twice.
   *   TODO(stage 3): leases with heartbeats (claimed_by, lease_expires_at
   *   renewed with progress) so a dead node's jobs are reclaimed in seconds
   *   and live ones never are.
   */
  async resetOrphanedProcessingJobs(): Promise<number> {
    try {
      const db = await this.resolveDb();
      const staleBefore =
        db.dialect === "postgres" ? Date.now() - this.orphanAfterMs : undefined;
      const result = await db
        .updateTable("video_jobs")
        .set({ status: "pending", started_at: null })
        .where("status", "=", "processing")
        .$if(staleBefore !== undefined, (qb) =>
          qb.where((eb) =>
            eb.or([
              eb("started_at", "is", null),
              eb("started_at", "<", staleBefore!),
            ]),
          ),
        )
        .executeTakeFirst();
      const reset = Number(result.numUpdatedRows);

      if (reset > 0) {
        logger.warn(
          staleBefore === undefined
            ? { resetCount: reset }
            : { resetCount: reset, orphanAfterMs: this.orphanAfterMs },
          staleBefore === undefined
            ? "Reset orphaned processing jobs to pending"
            : "Reset processing jobs older than the orphan threshold to pending (shared Postgres: younger ones may be running on another node)",
        );
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
      const db = await this.resolveDb();
      const result = await db
        .deleteFrom("video_jobs")
        .where("file_path", "=", filePath)
        .executeTakeFirst();
      const deleted = Number(result.numDeletedRows);

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
