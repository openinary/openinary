import { EventEmitter } from "events";
import path from "path";
import type { CloudStorage } from "./storage/index";
import logger, { serializeError } from "./logger";
import { VideoWorker } from "./video/video-worker";
import type {
  VideoJob as DBVideoJob,
  JobStatus,
  VideoJobStore,
} from "./video/queue-store";
import {
  detectVideoSettings,
  TRANSFORMATION_PRIORITY,
  type VideoSettings,
} from "./video/config";
import type { EnginePaths } from "../config/paths";
import { derivativeCachePath } from "./cache";
import type { CombindedTransformParams, VideoTransformParams } from "../types";
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

export type { JobStatus };

export interface VideoJob {
  id: string;
  filePath: string;
  params: CombindedTransformParams;
  cachePath: string;
  status: JobStatus;
  progress?: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

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

const FORWARDED_EVENTS = [
  "job:created",
  "job:started",
  "job:progress",
  "job:completed",
  "job:error",
] as const;

/**
 * Video transformation jobs: persisted in `store`, processed in the
 * background by one VideoWorker once start() is called.
 */
export class VideoJobQueue extends EventEmitter {
  private worker: VideoWorker;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private probedDurations = new Map<string, number | null>();

  private paths: EnginePaths;
  readonly videoSettings: VideoSettings;

  /** `video` overrides what is otherwise sized to the host or container. */
  constructor(
    readonly store: VideoJobStore,
    private storage: CloudStorage | null,
    config: { paths: EnginePaths; video?: Partial<VideoSettings> },
  ) {
    super();
    this.paths = config.paths;
    const video = detectVideoSettings(config.video);
    this.videoSettings = video.settings;
    this.worker = new VideoWorker(storage, store, this.paths, video);
    for (const event of FORWARDED_EVENTS) {
      this.worker.on(event, (job: DBVideoJob, ...rest: unknown[]) =>
        this.emit(event, convertDBJob(job), ...rest),
      );
    }
  }

  /**
   * Starts the worker (after resetting orphaned jobs) and the periodic
   * cleanup. Rejects when the store can't be reached for the orphan reset.
   */
  async start(): Promise<void> {
    await this.worker.start();
    this.cleanupInterval ??= setInterval(() => {
      this.cleanup().catch((error) => {
        logger.error(
          { error: serializeError(error) },
          "Failed to clean up old video jobs",
        );
      });
    }, 10 * 60 * 1000);
    logger.info("Video job queue started");
  }

  /** Queues a transform of `filePath`; throws when the store cannot. */
  async enqueueTransform(
    filePath: string,
    params: VideoTransformParams,
    priority: number = TRANSFORMATION_PRIORITY,
  ): Promise<string> {
    const cachePath = derivativeCachePath(this.paths.cache, filePath, params);
    const jobId = await this.store.createJob(filePath, params, cachePath, priority);
    const job = await this.store.getJobById(jobId);
    if (job) this.emit("job:created", convertDBJob(job));
    return jobId;
  }

  /** Puts a job back to pending, e.g. completed but its output is gone. */
  async resetJob(jobId: string): Promise<void> {
    await this.store.updateJobStatus(jobId, "pending", 0);
  }

  async getJobByPath(
    filePath: string,
    params: VideoTransformParams,
  ): Promise<VideoJob | null> {
    const dbJob = await this.store.getJobByFileAndParams(filePath, params);
    return dbJob ? convertDBJob(dbJob) : null;
  }

  /**
   * When the job for this transform will be done. A local original is probed
   * for its duration; with cloud storage the original only reaches this
   * machine once the job starts, so the estimate falls back to how long
   * recent jobs took.
   */
  async estimate(
    filePath: string,
    params: CombindedTransformParams,
  ): Promise<ProcessingEstimate> {
    const job = await this.store.getJobByFileAndParams(filePath, params);
    const sourceSeconds = this.storage
      ? null
      : await this.probeDuration(path.join(this.paths.public, filePath));
    const expectedJob = expectedVideoJob(
      this.worker.getTimingStats(),
      videoCodecFamily(params),
      expectedOutputSeconds(sourceSeconds, params),
    );

    // Same order getNextPendingJob claims in
    const pending = await this.store.getJobsByStatus("pending", 1000);
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
        running: await this.store.countProcessingJobs(),
        concurrency: this.worker.getMaxConcurrent(),
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

  async cleanup(): Promise<void> {
    await this.store.cleanupOldJobs(this.videoSettings.cleanupHours);
  }

  getStats() {
    return this.store.getJobStats();
  }

  workerStats() {
    return this.worker.getStats();
  }

  stop(): void {
    this.worker.stop();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
