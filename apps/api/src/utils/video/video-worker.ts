import { EventEmitter } from "events";
import { transformVideo } from "./index";
import { saveToCache } from "../cache";
import type { CloudStorage } from "../storage/index";
import logger from "../logger";
import {
  getNextPendingJob,
  updateJobStatus,
  countProcessingJobs,
  retryFailedJob,
  resetOrphanedProcessingJobs,
  type VideoJob,
} from "./queue-db";
import { MAX_CONCURRENT_JOBS, WORKER_POLL_INTERVAL_MS } from "./config";

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
  private isProcessing: boolean = false;

  constructor(storage: CloudStorage | null) {
    super();
    this.storage = storage;
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
      "Starting video worker"
    );

    // Reset any orphaned "processing" jobs from previous crashes/restarts
    // These are jobs marked as "processing" but not actually being processed
    const resetCount = resetOrphanedProcessingJobs();
    if (resetCount > 0) {
      logger.info({ resetCount }, "Reset orphaned processing jobs on worker start");
    }

    // Start polling for jobs
    this.intervalId = setInterval(() => {
      this.processNextJob().catch((error) => {
        logger.error({ error }, "Error in worker polling loop");
      });
    }, this.pollInterval);

    // Also process immediately on start
    this.processNextJob().catch((error) => {
      logger.error({ error }, "Error in initial job processing");
    });
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
   * Process the next job in the queue
   */
  async processNextJob(): Promise<void> {
    // Prevent concurrent execution of this method
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;

      // Check if we can process more jobs
      const processingCount = countProcessingJobs();
      if (processingCount >= this.maxConcurrent) {
        logger.debug(
          { processingCount, maxConcurrent: this.maxConcurrent },
          "Max concurrent jobs reached, waiting..."
        );
        return;
      }

      // Get next pending job (atomically marks it as processing)
      const job = getNextPendingJob();
      if (!job) {
        return; // No jobs to process
      }

      logger.info(
        {
          jobId: job.id,
          filePath: job.file_path,
          priority: job.priority,
        },
        "Starting video job processing"
      );

      // Emit started event
      this.emit("job:started", job);

      try {
        // Parse params from JSON
        const params = JSON.parse(job.params_json);

        // Download source file if using cloud storage
        let sourcePath = `./public/${job.file_path}`;
        if (this.storage) {
          try {
            const fs = await import('fs/promises');
            const path = await import('path');
            
            // Download to temp directory
            const buffer = await this.storage.downloadOriginal(job.file_path);
            const tempDir = './temp';
            sourcePath = path.join(tempDir, path.basename(job.file_path));
            await fs.writeFile(sourcePath, buffer);
          } catch (error) {
            logger.error(
              { error, filePath: job.file_path },
              "Failed to download source file from cloud storage"
            );
            throw error;
          }
        }

        // Process video
        const buffer = await transformVideo(sourcePath, params);

        // #region agent log
        logger.info({cachePath:job.cache_path,filePath:job.file_path,bufferSize:buffer.length,params},'[DEBUG] Saving transformed video to cache');
        // #endregion
        // Save to cache
        await saveToCache(job.cache_path, buffer);
        // #region agent log
        logger.info({cachePath:job.cache_path},'[DEBUG] Cache saved successfully');
        // #endregion

        // Upload to cloud storage if configured
        if (this.storage) {
          const contentType = params.format === "jpg" || params.format === "png"
            ? `image/${params.format}`
            : "video/mp4";
          await this.storage.upload(job.file_path, params, buffer, contentType);
        }

        // Mark as completed
        updateJobStatus(job.id, "completed", 100);

        logger.info(
          { jobId: job.id, filePath: job.file_path },
          "Video job completed successfully"
        );

        // Emit completion event
        this.emit("job:completed", { ...job, status: "completed", progress: 100 });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        logger.error(
          { error, jobId: job.id, filePath: job.file_path },
          "Video job processing failed"
        );

        // Check if we should retry
        if (job.retry_count < job.max_retries) {
          logger.info(
            {
              jobId: job.id,
              retryCount: job.retry_count + 1,
              maxRetries: job.max_retries,
            },
            "Scheduling job for retry"
          );
          
          // IMPORTANT: Mark as error first, then retry will reset it to pending
          updateJobStatus(job.id, "error", job.progress, errorMessage);
          retryFailedJob(job.id);
        } else {
          // Mark as error if max retries reached
          updateJobStatus(job.id, "error", job.progress, errorMessage);
          this.emit("job:error", { ...job, status: "error", error: errorMessage }, error as Error);
        }
      }
    } finally {
      this.isProcessing = false;
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
      processingCount: countProcessingJobs(),
    };
  }
}

