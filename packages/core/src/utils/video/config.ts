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

/** How the video worker and its ffmpeg processes run. */
export interface VideoSettings {
  /** Jobs processed at once. */
  maxConcurrent: number;
  /** Threads per ffmpeg process. */
  ffmpegThreads: number;
  /** ffmpeg scheduling priority, 0 to 19 (higher = lower priority). */
  ffmpegNiceness: number;
  /** Age at which finished jobs are purged. */
  cleanupHours: number;
  /** How often the worker looks for queued jobs. */
  pollIntervalMs: number;
}

/**
 * Settings sized to the host or container (whichever is smaller), with any
 * `overrides` the app read from its own configuration taking precedence.
 * `source` says what the limits were derived from, for the startup log.
 */
export function detectVideoSettings(overrides: Partial<VideoSettings> = {}) {
  const memory = getEffectiveMemoryBytes();
  const cpu = getEffectiveCpuCount();
  const settings: VideoSettings = {
    maxConcurrent: detectOptimalConcurrency(memory.bytes, cpu.count),
    // Leaves one CPU free for the HTTP event loop so encoding never starves the API.
    ffmpegThreads: Math.max(1, cpu.count - 1),
    ffmpegNiceness: 15,
    cleanupHours: 24,
    pollIntervalMs: 1000,
    ...definedOnly(overrides),
  };
  settings.ffmpegThreads = Math.max(1, settings.ffmpegThreads);
  return {
    settings,
    source: {
      memoryGB: Number((memory.bytes / 1024 ** 3).toFixed(2)),
      memorySource: memory.source,
      cpus: cpu.count,
      cpuSource: cpu.source,
      concurrencySource: overrides.maxConcurrent === undefined ? "detected" : "configured",
    },
  };
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Priority for thumbnail extraction jobs (lower = higher priority). */
export const THUMBNAIL_PRIORITY = 1;

/** Priority for video transformation jobs. */
export const TRANSFORMATION_PRIORITY = 2;
