import { EventEmitter } from "events";
import { transformVideo } from "./index";
import { saveToCache } from "../cache";
import { stageSource, type StagedSource } from "../stage-source";
import type { CloudStorage } from "../storage/index";
import logger, { serializeError } from "../logger";
import type { VideoJob, VideoJobStore } from "./queue-store";
import type { detectVideoSettings } from "./config";
import type { EnginePaths } from "../../config/paths";
import { contentTypeForFormat, determineOutputFormat } from "../../url/media-types";
import {
  summarizeVideoSamples,
  videoCodecFamily,
  type VideoTimingSample,
  type VideoTimingStats,
} from "../../eta";

// Progress is a write per update (a Postgres upsert in the cloud store), so
// it is persisted at most this often - enough for a 202 or a status poll to
// extrapolate from, without turning an encode into a stream of writes.
const PROGRESS_WRITE_INTERVAL_MS = 2000;
// Finished jobs remembered for estimates. Recent ones are what predicts the
// next: same machine, same load.
const MAX_TIMING_SAMPLES = 50;

export interface WorkerEvents {
  "job:created": (job: VideoJob) => void;
  "job:started": (job: VideoJob) => void;
  "job:progress": (job: VideoJob, progress: number) => void;
  "job:completed": (job: VideoJob) => void;
  "job:error": (job: VideoJob, error: Error) => void;
}

export class VideoWorker extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private maxConcurrent: number;
  private pollInterval: number;
  private isAcquiring: boolean = false;
  private timingSamples: VideoTimingSample[] = [];

  constructor(
    private storage: CloudStorage | null,
    private store: VideoJobStore,
    private paths: EnginePaths,
    private video: ReturnType<typeof detectVideoSettings>,
  ) {
    super();
    this.maxConcurrent = video.settings.maxConcurrent;
    this.pollInterval = video.settings.pollIntervalMs;
  }

  start(): void {
    if (this.intervalId) {
      logger.warn("Worker already started");
      return;
    }

    logger.info(
      {
        maxConcurrent: this.maxConcurrent,
        pollInterval: this.pollInterval,
        ...this.video.source,
        ffmpegThreads: this.video.settings.ffmpegThreads,
        ffmpegNiceness: this.video.settings.ffmpegNiceness,
      },
      "Starting video worker",
    );

    // Jobs left "processing" by a crash or restart, which nothing is running.
    const resetCount = this.store.resetOrphanedProcessingJobs();
    if (resetCount > 0) {
      logger.info(
        { resetCount },
        "Reset orphaned processing jobs on worker start",
      );
    }

    this.seedTimingSamples();

    this.intervalId = setInterval(() => {
      this.fillAvailableSlots().catch((error) => {
        logger.error(
          { error: serializeError(error) },
          "Error in worker polling loop",
        );
      });
    }, this.pollInterval);

    this.fillAvailableSlots().catch((error) => {
      logger.error(
        { error: serializeError(error) },
        "Error in initial job processing",
      );
    });
  }

  /**
   * Jobs the store still remembers from before this process started. Their
   * output duration was never recorded, so they only inform the whole-job
   * figure; the per-codec speed is relearned from the first jobs this run.
   */
  private seedTimingSamples(): void {
    try {
      for (const job of this.store.getJobsByStatus("completed", MAX_TIMING_SAMPLES)) {
        if (!job.started_at || !job.completed_at) continue;
        this.timingSamples.push({
          codec: videoCodecFamily(JSON.parse(job.params_json)),
          wallSeconds: (job.completed_at - job.started_at) / 1000,
          outputSeconds: null,
        });
      }
    } catch (error) {
      logger.warn(
        { error: serializeError(error) },
        "Could not seed video timing samples",
      );
    }
  }

  private recordTimingSample(sample: VideoTimingSample): void {
    this.timingSamples.unshift(sample);
    this.timingSamples.length = Math.min(
      this.timingSamples.length,
      MAX_TIMING_SAMPLES,
    );
  }

  /** How long recent jobs took, for processing-time estimates */
  getTimingStats(): VideoTimingStats {
    return summarizeVideoSamples(this.timingSamples);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Video worker stopped");
    }
  }

  /**
   * Fill every free concurrency slot with pending jobs (runs on each poll tick)
   */
  async fillAvailableSlots(): Promise<void> {
    // Serialize acquisition so overlapping ticks don't grab the same job
    if (this.isAcquiring) {
      return;
    }

    try {
      this.isAcquiring = true;

      while (true) {
        const processingCount = this.store.countProcessingJobs();
        if (processingCount >= this.maxConcurrent) {
          logger.debug(
            { processingCount, maxConcurrent: this.maxConcurrent },
            "Max concurrent jobs reached, waiting...",
          );
          break;
        }

        // Atomically marks it as processing
        const job = this.store.getNextPendingJob();
        if (!job) {
          break; // No more pending jobs
        }

        logger.info(
          {
            jobId: job.id,
            filePath: job.file_path,
            priority: job.priority,
            processingCount: processingCount + 1,
            maxConcurrent: this.maxConcurrent,
          },
          "Dispatching video job",
        );

        // Fire and forget; errors are handled inside processJob
        this.processJob(job).catch((error) => {
          logger.error(
            { error: serializeError(error), jobId: job.id },
            "Unhandled error in job processing",
          );
        });
      }
    } finally {
      this.isAcquiring = false;
    }
  }

  private async processJob(job: VideoJob): Promise<void> {
    this.emit("job:started", job);

    let source: StagedSource | undefined;
    try {
      const params = JSON.parse(job.params_json);
      source = await stageSource(this.storage, this.paths, job.file_path);

      // Process video, persisting how far it has got so a 202 or a status
      // poll can tell the caller when it will be done
      let outputSeconds: number | null = null;
      let lastPercent = 0;
      let lastWriteAt = 0;
      const buffer = await transformVideo(source.path, params, {
        storage: this.storage,
        paths: this.paths,
        settings: this.video.settings,
      }, (progress) => {
        outputSeconds = progress.outputSeconds;
        // 100 is the store's "done" and only completion may write it
        const percent = Math.min(99, Math.floor(progress.fraction * 100));
        const now = Date.now();
        if (
          percent <= lastPercent ||
          now - lastWriteAt < PROGRESS_WRITE_INTERVAL_MS
        ) {
          return;
        }
        lastPercent = percent;
        lastWriteAt = now;
        try {
          this.store.updateJobStatus(job.id, "processing", percent);
          this.emit("job:progress", { ...job, progress: percent }, percent);
        } catch (error) {
          // Progress is advisory: losing one update must not fail the encode
          logger.warn(
            { error: serializeError(error), jobId: job.id },
            "Failed to record video job progress",
          );
        }
      });

      await saveToCache(job.cache_path, buffer);

      if (this.storage) {
        const sourceExt = job.file_path.split(".").pop()?.toLowerCase();
        const { format } = determineOutputFormat(sourceExt, params.format);
        const contentType = contentTypeForFormat(format);
        await this.storage.upload(job.file_path, params, buffer, contentType);
      }

      this.store.updateJobStatus(job.id, "completed", 100);

      if (job.started_at) {
        this.recordTimingSample({
          codec: videoCodecFamily(params),
          wallSeconds: (Date.now() - job.started_at) / 1000,
          outputSeconds,
        });
      }

      logger.info(
        { jobId: job.id, filePath: job.file_path },
        "Video job completed successfully",
      );

      this.emit("job:completed", {
        ...job,
        status: "completed",
        progress: 100,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error(
        {
          error: serializeError(error),
          jobId: job.id,
          filePath: job.file_path,
        },
        "Video job processing failed",
      );

      if (job.retry_count < job.max_retries) {
        logger.info(
          {
            jobId: job.id,
            retryCount: job.retry_count + 1,
            maxRetries: job.max_retries,
          },
          "Scheduling job for retry",
        );

        // IMPORTANT: Mark as error first, then retry will reset it to pending
        this.store.updateJobStatus(job.id, "error", job.progress, errorMessage);
        this.store.retryFailedJob(job.id);
      } else {
        this.store.updateJobStatus(job.id, "error", job.progress, errorMessage);
        this.emit(
          "job:error",
          { ...job, status: "error", error: errorMessage },
          error as Error,
        );
      }
    } finally {
      await source?.cleanup();
    }
  }

  getStats() {
    return {
      maxConcurrent: this.maxConcurrent,
      pollInterval: this.pollInterval,
      isRunning: !!this.intervalId,
      processingCount: this.store.countProcessingJobs(),
    };
  }
}
