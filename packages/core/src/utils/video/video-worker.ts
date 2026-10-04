import { EventEmitter } from "events";
import { transformVideo } from "./index";
import { saveToCache } from "../cache";
import type { CloudStorage } from "../storage/index";
import logger, { serializeError } from "../logger";
import type { VideoJob, VideoJobStore } from "./queue-store";
import { MAX_CONCURRENT_JOBS, WORKER_POLL_INTERVAL_MS } from "./config";
import { contentTypeForFormat, determineOutputFormat } from "./format";
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

/**
 * Background worker for processing video jobs
 */
export class VideoWorker extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;
  private maxConcurrent: number;
  private pollInterval: number;
  private storage: CloudStorage | null;
  private store: VideoJobStore;
  private isAcquiring: boolean = false;
  private timingSamples: VideoTimingSample[] = [];

  constructor(storage: CloudStorage | null, store: VideoJobStore) {
    super();
    this.storage = storage;
    this.store = store;
    this.maxConcurrent = MAX_CONCURRENT_JOBS;
    this.pollInterval = WORKER_POLL_INTERVAL_MS;
  }

  /**
   * Start the worker
   */
  start(): void {
    if (this.intervalId) {
      logger.warn("Worker already started");
      return;
    }

    logger.info(
      {
        maxConcurrent: this.maxConcurrent,
        pollInterval: this.pollInterval,
      },
      "Starting video worker",
    );

    // Reset any orphaned "processing" jobs from previous crashes/restarts
    // These are jobs marked as "processing" but not actually being processed
    const resetCount = this.store.resetOrphanedProcessingJobs();
    if (resetCount > 0) {
      logger.info(
        { resetCount },
        "Reset orphaned processing jobs on worker start",
      );
    }

    this.seedTimingSamples();

    // Start polling for jobs
    this.intervalId = setInterval(() => {
      this.fillAvailableSlots().catch((error) => {
        logger.error(
          { error: serializeError(error) },
          "Error in worker polling loop",
        );
      });
    }, this.pollInterval);

    // Also process immediately on start
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

  /**
   * Stop the worker
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Video worker stopped");
    }
  }

  /**
   * Set maximum concurrent jobs
   */
  setMaxConcurrent(n: number): void {
    this.maxConcurrent = n;
    logger.info({ maxConcurrent: n }, "Updated max concurrent jobs");
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

        // Get next pending job (atomically marks it as processing)
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

  /**
   * Process a single video job (runs concurrently with other jobs)
   */
  private async processJob(job: VideoJob): Promise<void> {
    // Emit started event
    this.emit("job:started", job);

    try {
      // Parse params from JSON
      const params = JSON.parse(job.params_json);

      // Download source file if using cloud storage
      let sourcePath = `./public/${job.file_path}`;
      if (this.storage) {
        try {
          const fs = await import("fs/promises");
          const path = await import("path");

          // Download to temp directory
          const buffer = await this.storage.downloadOriginal(job.file_path);
          const tempDir = "./temp";
          sourcePath = path.join(tempDir, path.basename(job.file_path));
          await fs.writeFile(sourcePath, buffer);
        } catch (error) {
          logger.error(
            { error: serializeError(error), filePath: job.file_path },
            "Failed to download source file from cloud storage",
          );
          throw error;
        }
      }

      // Process video, persisting how far it has got so a 202 or a status
      // poll can tell the caller when it will be done
      let outputSeconds: number | null = null;
      let lastPercent = 0;
      let lastWriteAt = 0;
      const buffer = await transformVideo(sourcePath, params, (progress) => {
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

      // Save to cache
      await saveToCache(job.cache_path, buffer);

      // Upload to cloud storage if configured
      if (this.storage) {
        const sourceExt = job.file_path.split(".").pop()?.toLowerCase();
        const { format } = determineOutputFormat(sourceExt, params.format);
        const contentType = contentTypeForFormat(format);
        await this.storage.upload(job.file_path, params, buffer, contentType);
      }

      // Mark as completed
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

      // Emit completion event
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

      // Check if we should retry
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
        // Mark as error if max retries reached
        this.store.updateJobStatus(job.id, "error", job.progress, errorMessage);
        this.emit(
          "job:error",
          { ...job, status: "error", error: errorMessage },
          error as Error,
        );
      }
    }
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return {
      maxConcurrent: this.maxConcurrent,
      pollInterval: this.pollInterval,
      isRunning: !!this.intervalId,
      processingCount: this.store.countProcessingJobs(),
    };
  }
}
