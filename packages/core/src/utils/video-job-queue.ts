import { EventEmitter } from "events";
import { parseParams } from "./parser";
import { CloudStorage } from "./storage/index";
import logger from "./logger";
import { VideoWorker } from "./video/video-worker";
import type {
  VideoJob as DBVideoJob,
  JobStatus,
  VideoJobStore,
} from "./video/queue-store";
import { JOB_CLEANUP_HOURS, TRANSFORMATION_PRIORITY } from "./video/config";
import { getVideoInfo } from "./video/video-info";
import {
  estimateVideo,
  expectedOutputSeconds,
  expectedVideoJob,
  queueWait,
  videoCodecFamily,
  type ProcessingEstimate,
} from "../eta";

// ffprobe results per source, so a client polling every few seconds probes
// each video once. Bounded: oldest entries go first.
const MAX_PROBED_DURATIONS = 200;

// Re-export types for backward compatibility
export type { JobStatus };

export interface VideoJob {
  id: string;
  filePath: string;
  params: ReturnType<typeof parseParams>;
  cachePath: string;
  status: JobStatus;
  progress?: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Convert database job to legacy format for backward compatibility
 */
function convertDBJob(dbJob: DBVideoJob): VideoJob {
  return {
    id: dbJob.id,
    filePath: dbJob.file_path,
    params: JSON.parse(dbJob.params_json),
    cachePath: dbJob.cache_path,
    status: dbJob.status,
    progress: dbJob.progress,
    error: dbJob.error || undefined,
    startedAt: dbJob.started_at ? new Date(dbJob.started_at) : undefined,
    completedAt: dbJob.completed_at ? new Date(dbJob.completed_at) : undefined,
  };
}

export class VideoJobQueue extends EventEmitter {
  private worker: VideoWorker;
  private storage: CloudStorage | null = null;
  private store: VideoJobStore;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private probedDurations = new Map<string, number | null>();

  constructor(store: VideoJobStore) {
    super();
    this.store = store;
    // Worker will be re-created with real storage once initialize() runs
    this.worker = new VideoWorker(null, store);

    // Forward worker events
    this.worker.on("job:created", (job) =>
      this.emit("job:created", convertDBJob(job)),
    );
    this.worker.on("job:started", (job) =>
      this.emit("job:started", convertDBJob(job)),
    );
    this.worker.on("job:progress", (job, progress) =>
      this.emit("job:progress", convertDBJob(job), progress),
    );
    this.worker.on("job:completed", (job) =>
      this.emit("job:completed", convertDBJob(job)),
    );
    this.worker.on("job:error", (job, error) =>
      this.emit("job:error", convertDBJob(job), error),
    );
  }

  /**
   * Initialize the queue with storage client
   */
  initialize(storage: CloudStorage | null): void {
    this.storage = storage;
    this.worker = new VideoWorker(storage, this.store);

    // Forward worker events
    this.worker.on("job:created", (job) =>
      this.emit("job:created", convertDBJob(job)),
    );
    this.worker.on("job:started", (job) =>
      this.emit("job:started", convertDBJob(job)),
    );
    this.worker.on("job:progress", (job, progress) =>
      this.emit("job:progress", convertDBJob(job), progress),
    );
    this.worker.on("job:completed", (job) =>
      this.emit("job:completed", convertDBJob(job)),
    );
    this.worker.on("job:error", (job, error) =>
      this.emit("job:error", convertDBJob(job), error),
    );

    // Start the worker
    this.worker.start();

    // Periodic cleanup (every 10 minutes). Started here rather than at
    // module load so it never runs against a not-yet-initialized worker.
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    }

    logger.info("Video job queue initialized with background worker");
  }

  /**
   * Add a video to the processing queue
   */
  async addJob(
    filePath: string,
    params: ReturnType<typeof parseParams>,
    cachePath: string,
    sourcePath: string,
    storage: CloudStorage | null,
    priority: number = TRANSFORMATION_PRIORITY,
  ): Promise<string> {
    // Create job in database
    const jobId = this.store.createJob(filePath, params, cachePath, priority);

    // Emit created event
    const job = this.store.getJobById(jobId);
    if (job) {
      this.emit("job:created", convertDBJob(job));
    }

    return jobId;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): VideoJob | null {
    const dbJob = this.store.getJobById(jobId);
    return dbJob ? convertDBJob(dbJob) : null;
  }

  /**
   * Get job by file path and params
   */
  getJobByPath(
    filePath: string,
    params: ReturnType<typeof parseParams>,
  ): VideoJob | null {
    const dbJob = this.store.getJobByFileAndParams(filePath, params);
    return dbJob ? convertDBJob(dbJob) : null;
  }

  /**
   * When the job for this transform will be done. sourcePath is the local
   * original, probed for its duration when there is one on disk; with cloud
   * storage the original only reaches this machine once the job starts, so
   * the estimate falls back to how long recent jobs took.
   */
  async estimate(
    filePath: string,
    params: ReturnType<typeof parseParams>,
    sourcePath?: string,
  ): Promise<ProcessingEstimate> {
    const job = this.store.getJobByFileAndParams(filePath, params);
    const sourceSeconds =
      !this.storage && sourcePath ? await this.probeDuration(sourcePath) : null;
    const expectedJob = expectedVideoJob(
      this.worker.getTimingStats(),
      videoCodecFamily(params),
      expectedOutputSeconds(sourceSeconds, params),
    );

    // Same order getNextPendingJob claims in
    const pending = this.store.getJobsByStatus("pending", 1000);
    const jobsAhead = job
      ? pending.filter(
          (other) =>
            other.id !== job.id &&
            (other.priority < job.priority ||
              (other.priority === job.priority &&
                other.created_at <= job.created_at)),
        ).length
      : pending.length;

    return estimateVideo({
      now: Date.now(),
      job: job
        ? {
            status: job.status,
            progress: job.progress,
            startedAt: job.started_at,
          }
        : null,
      expectedJob,
      queue: queueWait({
        jobsAhead,
        running: this.store.countProcessingJobs(),
        concurrency: this.worker.getStats().maxConcurrent,
        typicalJob: this.worker.getTimingStats().job,
      }),
    });
  }

  private async probeDuration(sourcePath: string): Promise<number | null> {
    if (this.probedDurations.has(sourcePath)) {
      return this.probedDurations.get(sourcePath) ?? null;
    }
    let seconds: number | null = null;
    try {
      seconds = (await getVideoInfo(sourcePath)).duration || null;
    } catch {
      // Unreadable or missing: estimate without it
    }
    if (this.probedDurations.size >= MAX_PROBED_DURATIONS) {
      const oldest = this.probedDurations.keys().next().value;
      if (oldest !== undefined) this.probedDurations.delete(oldest);
    }
    this.probedDurations.set(sourcePath, seconds);
    return seconds;
  }

  /**
   * Clean up old completed/error jobs
   */
  cleanup(): void {
    this.store.cleanupOldJobs(JOB_CLEANUP_HOURS);
  }

  /**
   * Get queue stats
   */
  getStats() {
    return this.store.getJobStats();
  }

  /**
   * Get the underlying job store (for admin/CRUD operations not exposed
   * directly by this queue facade, e.g. listing or cancelling jobs).
   */
  getStore(): VideoJobStore {
    return this.store;
  }

  /**
   * Get worker instance (for advanced usage)
   */
  getWorker(): VideoWorker {
    return this.worker;
  }

  /**
   * Stop the worker (for graceful shutdown)
   */
  stop(): void {
    this.worker.stop();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
