/**
 * Video processing queue configuration
 * These values can be overridden via environment variables
 */

import * as os from "os";

/**
 * Detect optimal number of concurrent video jobs based on available RAM
 * Formula: 1 worker per 2GB of RAM (minimum 1, maximum 16)
 */
function detectOptimalConcurrency(): number {
  const totalMemoryGB = os.totalmem() / (1024 ** 3);
  const optimal = Math.max(1, Math.floor(totalMemoryGB / 2));
  // Cap at 16 workers to prevent excessive resource usage
  return Math.min(optimal, 16);
}

/**
 * Maximum number of concurrent video jobs
 * Auto-detected based on system RAM, or configured via VIDEO_MAX_CONCURRENT env variable
 */
export const MAX_CONCURRENT_JOBS = process.env.VIDEO_MAX_CONCURRENT
  ? parseInt(process.env.VIDEO_MAX_CONCURRENT, 10)
  : detectOptimalConcurrency();

// Log detected configuration on module load
const totalMemoryGB = (os.totalmem() / (1024 ** 3)).toFixed(2);
const configSource = process.env.VIDEO_MAX_CONCURRENT ? "env variable" : "auto-detected";
console.log(`[Video Config] RAM: ${totalMemoryGB}GB | Max concurrent jobs: ${MAX_CONCURRENT_JOBS} (${configSource})`);

/**
 * Maximum number of retry attempts for failed jobs
 */
export const JOB_RETRY_MAX = parseInt(
  process.env.VIDEO_JOB_RETRY_MAX || "3",
  10
);

/**
 * Hours after which completed/error jobs are cleaned up
 */
export const JOB_CLEANUP_HOURS = parseInt(
  process.env.VIDEO_JOB_CLEANUP_HOURS || "24",
  10
);

/**
 * Worker polling interval in milliseconds
 */
export const WORKER_POLL_INTERVAL_MS = parseInt(
  process.env.VIDEO_WORKER_POLL_INTERVAL_MS || "1000",
  10
);

/**
 * Priority for thumbnail extraction jobs (lower = higher priority)
 */
export const THUMBNAIL_PRIORITY = 1;

/**
 * Priority for video transformation jobs
 */
export const TRANSFORMATION_PRIORITY = 2;

/**
 * Priority for other video jobs
 */
export const LOW_PRIORITY = 3;

