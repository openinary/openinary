import type { parseParams } from "../parser";

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "error"
  | "cancelled";

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
 * Persistence contract for the video transformation queue. The self-hosted
 * app backs this with SQLite (see sqlite-video-job-store.ts); a multi-tenant
 * deployment can implement the same contract against a different backend
 * (e.g. Cloudflare D1) without touching VideoJobQueue, VideoWorker, or any
 * route that depends on this interface instead of a concrete database.
 */
export interface VideoJobStore {
  createJob(
    filePath: string,
    params: ReturnType<typeof parseParams>,
    cachePath: string,
    priority?: number,
  ): string;

  /** Atomically claims and returns the next pending job, or null if none. */
  getNextPendingJob(): VideoJob | null;

  updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress?: number,
    error?: string,
  ): void;

  getJobByFileAndParams(
    filePath: string,
    params: ReturnType<typeof parseParams>,
  ): VideoJob | null;

  getJobById(jobId: string): VideoJob | null;

  getJobStats(): JobStats;

  getRecentJobs(limit?: number, offset?: number): VideoJob[];

  getJobsByStatus(status: JobStatus, limit?: number): VideoJob[];

  countProcessingJobs(): number;

  cleanupOldJobs(olderThanHours?: number): number;

  retryFailedJob(jobId: string): boolean;

  cancelJob(jobId: string): boolean;

  deleteJob(jobId: string): boolean;

  /** Resets jobs orphaned by a crash/restart (stuck in "processing") back to "pending". */
  resetOrphanedProcessingJobs(): number;

  deleteJobsByFilePath(filePath: string): number;
}
