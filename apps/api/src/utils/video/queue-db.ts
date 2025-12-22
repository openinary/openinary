import { db } from "shared";
import { randomUUID } from "crypto";
import type { parseParams } from "../parser";
import logger from "../logger";

export type JobStatus = "pending" | "processing" | "completed" | "error" | "cancelled";

export interface VideoJob {
  id: string;
  file_path: string;
  params_json: string;
  cache_path: string;
  status: JobStatus;
  priority: number;
  progress: number;
  error: string | null;
  retry_count: number;
  max_retries: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

export interface JobStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  error: number;
}

/**
 * Normalize params to a consistent JSON string
 * Sorts keys alphabetically to ensure same params always produce same string
 * This fixes the bug where params with different key orders would not match
 */
function normalizeParamsJson(params: any): string {
  if (!params || typeof params !== 'object') {
    return JSON.stringify(params);
  }
  
  const sortedKeys = Object.keys(params).sort();
  const normalized: any = {};
  
  for (const key of sortedKeys) {
    normalized[key] = params[key];
  }
  
  return JSON.stringify(normalized);
}

/**
 * Create a new job in the queue
 */
export function createJob(
  filePath: string,
  params: ReturnType<typeof parseParams>,
  cachePath: string,
  priority: number = 2
): string {
  const jobId = randomUUID();
  const paramsJson = normalizeParamsJson(params);
  // #region agent log
  logger.info({filePath,cachePath,params,paramsNormalized:paramsJson},'[DEBUG] Creating video job');
  // #endregion
  const now = Date.now();

  try {
    // Check if a job with the same file_path and params already exists
    const existingJob = db
      .prepare(
        "SELECT id, status FROM video_jobs WHERE file_path = ? AND params_json = ? AND status IN ('pending', 'processing')"
      )
      .get(filePath, paramsJson) as { id: string; status: string } | undefined;

    if (existingJob) {
      logger.debug(
        { existingJobId: existingJob.id, status: existingJob.status, filePath },
        "Job already exists, returning existing job ID"
      );
      return existingJob.id;
    }

    // Create new job
    db.prepare(
      `INSERT INTO video_jobs (
        id, file_path, params_json, cache_path, status, priority, 
        progress, retry_count, max_retries, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      jobId,
      filePath,
      paramsJson,
      cachePath,
      "pending",
      priority,
      0,
      0,
      3,
      now
    );

    logger.info({ jobId, filePath, priority }, "Created new video job");
    return jobId;
  } catch (error) {
    logger.error({ error, filePath }, "Failed to create job");
    throw error;
  }
}

/**
 * Get the next pending job with highest priority
 * Uses a transaction to atomically mark it as processing
 */
export function getNextPendingJob(): VideoJob | null {
  try {
    // Start transaction
    const getAndUpdate = db.transaction(() => {
      // Get the next pending job
      const job = db
        .prepare(
          `SELECT * FROM video_jobs 
           WHERE status = 'pending' 
           ORDER BY priority ASC, created_at ASC 
           LIMIT 1`
        )
        .get() as VideoJob | undefined;

      if (!job) {
        return null;
      }

      // Mark it as processing
      const now = Date.now();
      db.prepare(
        "UPDATE video_jobs SET status = 'processing', started_at = ? WHERE id = ?"
      ).run(now, job.id);

      // Return updated job
      return { ...job, status: "processing" as JobStatus, started_at: now };
    });

    const job = getAndUpdate();
    
    if (job) {
      logger.debug({ jobId: job.id, filePath: job.file_path }, "Retrieved next pending job");
    }
    
    return job;
  } catch (error) {
    logger.error({ error }, "Failed to get next pending job");
    return null;
  }
}

/**
 * Update job status and optional fields
 */
export function updateJobStatus(
  jobId: string,
  status: JobStatus,
  progress?: number,
  error?: string
): void {
  try {
    const updates: string[] = ["status = ?"];
    const values: any[] = [status];

    if (progress !== undefined) {
      updates.push("progress = ?");
      values.push(progress);
    }

    if (error !== undefined) {
      updates.push("error = ?");
      values.push(error);
    }

    if (status === "completed" || status === "error" || status === "cancelled") {
      updates.push("completed_at = ?");
      values.push(Date.now());
    }

    values.push(jobId);

    const query = `UPDATE video_jobs SET ${updates.join(", ")} WHERE id = ?`;
    db.prepare(query).run(...values);

    logger.debug({ jobId, status, progress }, "Updated job status");
  } catch (error) {
    logger.error({ error, jobId, status }, "Failed to update job status");
    throw error;
  }
}

/**
 * Get a job by file path and params
 */
export function getJobByFileAndParams(
  filePath: string,
  params: ReturnType<typeof parseParams>
): VideoJob | null {
  try {
    const paramsJson = normalizeParamsJson(params);
    // #region agent log
    logger.info({filePath,params,paramsNormalized:paramsJson},'[DEBUG] Searching for job in DB');
    // #endregion
    const job = db
      .prepare(
        "SELECT * FROM video_jobs WHERE file_path = ? AND params_json = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(filePath, paramsJson) as VideoJob | undefined;

    // #region agent log
    logger.info({filePath,found:!!job,jobId:job?.id,jobStatus:job?.status,jobParamsJson:job?.params_json,searchedParamsJson:paramsJson,paramsMatch:job?.params_json===paramsJson},'[DEBUG] Job search result from DB');
    // #endregion

    return job || null;
  } catch (error) {
    logger.error({ error, filePath }, "Failed to get job by file and params");
    return null;
  }
}

/**
 * Get a job by ID
 */
export function getJobById(jobId: string): VideoJob | null {
  try {
    const job = db
      .prepare("SELECT * FROM video_jobs WHERE id = ?")
      .get(jobId) as VideoJob | undefined;

    return job || null;
  } catch (error) {
    logger.error({ error, jobId }, "Failed to get job by ID");
    return null;
  }
}

/**
 * Get queue statistics
 */
export function getJobStats(): JobStats {
  try {
    const stats = db
      .prepare(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
         FROM video_jobs`
      )
      .get() as JobStats;

    return stats;
  } catch (error) {
    logger.error({ error }, "Failed to get job stats");
    return {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      error: 0,
    };
  }
}

/**
 * Get recent jobs with pagination
 */
export function getRecentJobs(limit: number = 50, offset: number = 0): VideoJob[] {
  try {
    const jobs = db
      .prepare(
        "SELECT * FROM video_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?"
      )
      .all(limit, offset) as VideoJob[];

    return jobs;
  } catch (error) {
    logger.error({ error, limit, offset }, "Failed to get recent jobs");
    return [];
  }
}

/**
 * Get jobs by status
 */
export function getJobsByStatus(status: JobStatus, limit: number = 50): VideoJob[] {
  try {
    const jobs = db
      .prepare(
        "SELECT * FROM video_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(status, limit) as VideoJob[];

    return jobs;
  } catch (error) {
    logger.error({ error, status, limit }, "Failed to get jobs by status");
    return [];
  }
}

/**
 * Count jobs currently processing
 */
export function countProcessingJobs(): number {
  try {
    const result = db
      .prepare("SELECT COUNT(*) as count FROM video_jobs WHERE status = 'processing'")
      .get() as { count: number };

    return result.count;
  } catch (error) {
    logger.error({ error }, "Failed to count processing jobs");
    return 0;
  }
}

/**
 * Cleanup old completed/error jobs
 */
export function cleanupOldJobs(olderThanHours: number = 24): number {
  try {
    const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;
    
    const result = db
      .prepare(
        `DELETE FROM video_jobs 
         WHERE status IN ('completed', 'error', 'cancelled') 
         AND completed_at < ?`
      )
      .run(cutoffTime);

    if (result.changes > 0) {
      logger.info({ deletedCount: result.changes, olderThanHours }, "Cleaned up old jobs");
    }

    return result.changes;
  } catch (error) {
    logger.error({ error, olderThanHours }, "Failed to cleanup old jobs");
    return 0;
  }
}

/**
 * Retry a failed job
 */
export function retryFailedJob(jobId: string): boolean {
  try {
    const job = getJobById(jobId);
    
    if (!job) {
      logger.warn({ jobId }, "Cannot retry: job not found");
      return false;
    }

    if (job.status !== "error") {
      logger.warn({ jobId, status: job.status }, "Cannot retry: job is not in error state");
      return false;
    }

    if (job.retry_count >= job.max_retries) {
      logger.warn({ jobId, retry_count: job.retry_count }, "Cannot retry: max retries reached");
      return false;
    }

    // Reset job to pending with incremented retry count
    db.prepare(
      `UPDATE video_jobs 
       SET status = 'pending', 
           retry_count = retry_count + 1,
           error = NULL,
           started_at = NULL,
           completed_at = NULL
       WHERE id = ?`
    ).run(jobId);

    logger.info({ jobId, retry_count: job.retry_count + 1 }, "Job scheduled for retry");
    return true;
  } catch (error) {
    logger.error({ error, jobId }, "Failed to retry job");
    return false;
  }
}

/**
 * Cancel a pending job
 */
export function cancelJob(jobId: string): boolean {
  try {
    const job = getJobById(jobId);
    
    if (!job) {
      logger.warn({ jobId }, "Cannot cancel: job not found");
      return false;
    }

    if (job.status !== "pending") {
      logger.warn({ jobId, status: job.status }, "Cannot cancel: job is not pending");
      return false;
    }

    db.prepare(
      "UPDATE video_jobs SET status = 'cancelled', completed_at = ? WHERE id = ?"
    ).run(Date.now(), jobId);

    logger.info({ jobId }, "Job cancelled");
    return true;
  } catch (error) {
    logger.error({ error, jobId }, "Failed to cancel job");
    return false;
  }
}

/**
 * Delete a job
 */
export function deleteJob(jobId: string): boolean {
  try {
    const result = db.prepare("DELETE FROM video_jobs WHERE id = ?").run(jobId);
    
    if (result.changes > 0) {
      logger.info({ jobId }, "Job deleted");
      return true;
    }
    
    logger.warn({ jobId }, "Job not found for deletion");
    return false;
  } catch (error) {
    logger.error({ error, jobId }, "Failed to delete job");
    return false;
  }
}

/**
 * Reset orphaned "processing" jobs to "pending"
 * This handles jobs that were marked as processing but never actually started
 * (e.g., due to server crash/restart)
 */
export function resetOrphanedProcessingJobs(): number {
  try {
    const result = db
      .prepare(
        `UPDATE video_jobs 
         SET status = 'pending', started_at = NULL 
         WHERE status = 'processing'`
      )
      .run();

    if (result.changes > 0) {
      logger.warn({ resetCount: result.changes }, "Reset orphaned processing jobs to pending");
    }

    return result.changes;
  } catch (error) {
    logger.error({ error }, "Failed to reset orphaned processing jobs");
    return 0;
  }
}

/**
 * Delete all jobs (pending, processing, completed, error, cancelled) for a file path
 * This is used when an asset is deleted to clean up all associated jobs
 */
export function deleteJobsByFilePath(filePath: string): number {
  try {
    const result = db
      .prepare("DELETE FROM video_jobs WHERE file_path = ?")
      .run(filePath);

    if (result.changes > 0) {
      logger.info({ filePath, deletedCount: result.changes }, "Deleted jobs for file path");
    } else {
      logger.debug({ filePath }, "No jobs found for file path");
    }

    return result.changes;
  } catch (error) {
    logger.error({ error, filePath }, "Failed to delete jobs by file path");
    return 0;
  }
}

