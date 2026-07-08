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

const CGROUP_V2_CPU_MAX_PATH = "/sys/fs/cgroup/cpu.max";
const CGROUP_V1_CPU_QUOTA_PATH = "/sys/fs/cgroup/cpu/cpu.cfs_quota_us";
const CGROUP_V1_CPU_PERIOD_PATH = "/sys/fs/cgroup/cpu/cpu.cfs_period_us";

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
 * Read the container CPU limit from cgroup v2 or v1, if present.
 * Returns the number of CPUs as a float (e.g. 0.5, 2), or null when
 * no cgroup file is found or the limit is "unlimited".
 */
function readCgroupCpuLimit(): number | null {
  try {
    // cgroup v2 format: "<quota> <period>" or "max <period>"
    const raw = fs.readFileSync(CGROUP_V2_CPU_MAX_PATH, "utf8").trim();
    const [quotaRaw, periodRaw] = raw.split(/\s+/);
    if (quotaRaw === "max") return null;
    const quota = parseInt(quotaRaw, 10);
    const period = parseInt(periodRaw, 10);
    if (Number.isFinite(quota) && Number.isFinite(period) && quota > 0 && period > 0) {
      return quota / period;
    }
    return null;
  } catch {
    // cgroup v2 file not present, fall through to v1
  }

  try {
    // cgroup v1 reports quota -1 when no limit is set
    const quota = parseInt(fs.readFileSync(CGROUP_V1_CPU_QUOTA_PATH, "utf8").trim(), 10);
    const period = parseInt(fs.readFileSync(CGROUP_V1_CPU_PERIOD_PATH, "utf8").trim(), 10);
    if (Number.isFinite(quota) && Number.isFinite(period) && quota > 0 && period > 0) {
      return quota / period;
    }
  } catch {
    // cgroup v1 file not present either
  }

  return null;
}

/**
 * Effective CPU count available to the process: the lower of the host CPUs
 * and the container's cgroup CPU quota (if one is set), floored to at least 1.
 */
function getEffectiveCpuCount(): { count: number; source: "cgroup limit" | "host CPUs" } {
  const cgroupLimit = readCgroupCpuLimit();
  const hostCpus = os.cpus().length;
  if (cgroupLimit !== null && cgroupLimit < hostCpus) {
    return { count: Math.max(1, Math.floor(cgroupLimit)), source: "cgroup limit" };
  }
  return { count: hostCpus, source: "host CPUs" };
}

/**
 * Detect optimal number of concurrent video jobs based on available resources.
 * Memory: 1 worker per 2GB. CPU: at most 1 worker per effective CPU, so
 * concurrent ffmpeg processes can never oversubscribe the container.
 * Minimum 1, maximum 16.
 */
function detectOptimalConcurrency(memoryBytes: number, cpuCount: number): number {
  const memoryGB = memoryBytes / (1024 ** 3);
  const byMemory = Math.max(1, Math.floor(memoryGB / 2));
  // Cap at 16 workers to prevent excessive resource usage
  return Math.max(1, Math.min(byMemory, cpuCount, 16));
}

const { bytes: effectiveMemoryBytes, source: memorySource } = getEffectiveMemoryBytes();
const { count: effectiveCpuCount, source: cpuSource } = getEffectiveCpuCount();

/**
 * Effective CPU count (host CPUs or cgroup quota, whichever is lower)
 */
export const EFFECTIVE_CPU_COUNT = effectiveCpuCount;

/**
 * Number of threads each ffmpeg process may use.
 * Leaves one CPU free for the HTTP serving event loop so video jobs never
 * starve the API, or configured via VIDEO_FFMPEG_THREADS env variable.
 */
export const FFMPEG_THREADS = process.env.VIDEO_FFMPEG_THREADS
  ? Math.max(1, parseInt(process.env.VIDEO_FFMPEG_THREADS, 10) || 1)
  : Math.max(1, effectiveCpuCount - 1);

/**
 * Niceness applied to spawned ffmpeg processes (0-19, higher = lower priority).
 * Keeps the Node event loop responsive even when ffmpeg saturates the CPU.
 * Configurable via VIDEO_FFMPEG_NICENESS env variable.
 */
export const FFMPEG_NICENESS = process.env.VIDEO_FFMPEG_NICENESS
  ? parseInt(process.env.VIDEO_FFMPEG_NICENESS, 10)
  : 15;

/**
 * Maximum number of concurrent video jobs
 * Auto-detected based on available memory and CPU (host or cgroup limit,
 * whichever is lower), or configured via VIDEO_MAX_CONCURRENT env variable
 */
export const MAX_CONCURRENT_JOBS = process.env.VIDEO_MAX_CONCURRENT
  ? parseInt(process.env.VIDEO_MAX_CONCURRENT, 10)
  : detectOptimalConcurrency(effectiveMemoryBytes, effectiveCpuCount);

// Log detected configuration on module load
const effectiveMemoryGB = (effectiveMemoryBytes / (1024 ** 3)).toFixed(2);
const configSource = process.env.VIDEO_MAX_CONCURRENT ? "env variable" : `${memorySource}, ${cpuSource}`;
console.log(`[Video Config] Memory: ${effectiveMemoryGB}GB (${memorySource}) | CPUs: ${effectiveCpuCount} (${cpuSource}) | Max concurrent jobs: ${MAX_CONCURRENT_JOBS} (${configSource}) | ffmpeg threads: ${FFMPEG_THREADS}, niceness: ${FFMPEG_NICENESS}`);

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

