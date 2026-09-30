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
 * Persistence contract for the video transformation queue. Every method is
 * async so a network-backed store (Postgres, Cloudflare D1, ...) can
 * implement it. The self-hosted app backs this with SQLite (see
 * sqlite-video-job-store.ts) without touching VideoJobQueue, VideoWorker, or
 * any route that depends on this interface instead of a concrete database.
 */
export interface VideoJobStore {
  createJob(
    filePath: string,
    params: ReturnType<typeof parseParams>,
    cachePath: string,
    priority?: number,
  ): Promise<string>;

  /** Atomically claims and returns the next pending job, or null if none. */
  getNextPendingJob(): Promise<VideoJob | null>;

  updateJobStatus(
    jobId: string,
    status: JobStatus,
    progress?: number,
    error?: string,
  ): Promise<void>;

  getJobByFileAndParams(
    filePath: string,
    params: ReturnType<typeof parseParams>,
  ): Promise<VideoJob | null>;

  getJobById(jobId: string): Promise<VideoJob | null>;

  getJobStats(): Promise<JobStats>;

  getRecentJobs(limit?: number, offset?: number): Promise<VideoJob[]>;

  getJobsByStatus(status: JobStatus, limit?: number): Promise<VideoJob[]>;

  countProcessingJobs(): Promise<number>;

  cleanupOldJobs(olderThanHours?: number): Promise<number>;

  retryFailedJob(jobId: string): Promise<boolean>;

  cancelJob(jobId: string): Promise<boolean>;

  deleteJob(jobId: string): Promise<boolean>;

  /** Resets jobs orphaned by a crash/restart (stuck in "processing") back to "pending". */
  resetOrphanedProcessingJobs(): Promise<number>;

  deleteJobsByFilePath(filePath: string): Promise<number>;
}
