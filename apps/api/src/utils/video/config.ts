/**
 * Video processing queue configuration
 * These values can be overridden via environment variables
 */

import * as fs from "fs";
import * as os from "os";

const CGROUP_V2_MAX_PATH = "/sys/fs/cgroup/memory.max";
const CGROUP_V1_LIMIT_PATH = "/sys/fs/cgroup/memory/memory.limit_in_bytes";
// cgroup v1 reports this (or similar huge values) when no limit is set
const CGROUP_V1_UNLIMITED_THRESHOLD = 1e18;

/**
 * Read the container memory limit from cgroup v2 or v1, if present.
 * Returns null when no cgroup file is found or the limit is "unlimited".
 */
function readCgroupMemoryLimit(): number | null {
  try {
    const raw = fs.readFileSync(CGROUP_V2_MAX_PATH, "utf8").trim();
    if (raw === "max") return null;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    // cgroup v2 file not present, fall through to v1
  }

  try {
    const raw = fs.readFileSync(CGROUP_V1_LIMIT_PATH, "utf8").trim();
    const value = parseInt(raw, 10);
    if (!Number.isFinite(value) || value >= CGROUP_V1_UNLIMITED_THRESHOLD) return null;
    return value;
  } catch {
    // cgroup v1 file not present either
  }

  return null;
}

/**
 * Effective memory available to the process: the lower of the host RAM
 * and the container's cgroup memory limit (if one is set).
 */
function getEffectiveMemoryBytes(): { bytes: number; source: "cgroup limit" | "host RAM" } {
  const cgroupLimit = readCgroupMemoryLimit();
  const hostMemory = os.totalmem();
  if (cgroupLimit !== null && cgroupLimit < hostMemory) {
    return { bytes: cgroupLimit, source: "cgroup limit" };
  }
  return { bytes: hostMemory, source: "host RAM" };
}

/**
 * Detect optimal number of concurrent video jobs based on available memory
 * Formula: 1 worker per 2GB of memory (minimum 1, maximum 16)
 */
function detectOptimalConcurrency(memoryBytes: number): number {
  const memoryGB = memoryBytes / (1024 ** 3);
  const optimal = Math.max(1, Math.floor(memoryGB / 2));
  // Cap at 16 workers to prevent excessive resource usage
  return Math.min(optimal, 16);
}

const { bytes: effectiveMemoryBytes, source: memorySource } = getEffectiveMemoryBytes();

/**
 * Maximum number of concurrent video jobs
 * Auto-detected based on available memory (host RAM or cgroup limit, whichever is
 * lower), or configured via VIDEO_MAX_CONCURRENT env variable
 */
export const MAX_CONCURRENT_JOBS = process.env.VIDEO_MAX_CONCURRENT
  ? parseInt(process.env.VIDEO_MAX_CONCURRENT, 10)
  : detectOptimalConcurrency(effectiveMemoryBytes);

// Log detected configuration on module load
const effectiveMemoryGB = (effectiveMemoryBytes / (1024 ** 3)).toFixed(2);
const configSource = process.env.VIDEO_MAX_CONCURRENT ? "env variable" : memorySource;
console.log(`[Video Config] Memory: ${effectiveMemoryGB}GB (${memorySource}) | Max concurrent jobs: ${MAX_CONCURRENT_JOBS} (${configSource})`);

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

