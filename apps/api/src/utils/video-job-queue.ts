import { EventEmitter } from 'events';
import { transformVideo } from './video/index';
import { parseParams } from './parser';
import { saveToCache } from './cache';
import { CloudStorage } from './storage/index';
import logger from './logger';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'error';

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

class VideoJobQueue extends EventEmitter {
  private jobs: Map<string, VideoJob> = new Map();
  private processing: Set<string> = new Set();
  private readonly MAX_CONCURRENT = 2; // Maximum 2 vidéos en parallèle

  /**
   * Create a unique job ID from file path and params
   */
  private createJobId(filePath: string, params: ReturnType<typeof parseParams>): string {
    const paramStr = JSON.stringify(params);
    return `${filePath}:${Buffer.from(paramStr).toString('base64')}`;
  }

  /**
   * Add a video to the processing queue
   */
  async addJob(
    filePath: string,
    params: ReturnType<typeof parseParams>,
    cachePath: string,
    sourcePath: string,
    storage: CloudStorage | null
  ): Promise<string> {
    const jobId = this.createJobId(filePath, params);

    // Check if already exists
    if (this.jobs.has(jobId)) {
      const existingJob = this.jobs.get(jobId)!;
      logger.debug({ jobId, status: existingJob.status }, 'Job already exists');
      return jobId;
    }

    // Create new job
    const job: VideoJob = {
      id: jobId,
      filePath,
      params,
      cachePath,
      status: 'pending',
    };

    this.jobs.set(jobId, job);
    logger.info({ jobId, filePath }, 'Video job added to queue');

    // Start processing if capacity available
    this.processNext(sourcePath, storage);

    return jobId;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): VideoJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get job by file path and params
   */
  getJobByPath(filePath: string, params: ReturnType<typeof parseParams>): VideoJob | null {
    const jobId = this.createJobId(filePath, params);
    return this.getJob(jobId);
  }

  /**
   * Process next job in queue
   */
  private async processNext(sourcePath: string, storage: CloudStorage | null): Promise<void> {
    // Check if we can process more jobs
    if (this.processing.size >= this.MAX_CONCURRENT) {
      logger.debug('Max concurrent jobs reached, waiting...');
      return;
    }

    // Find next pending job
    const pendingJob = Array.from(this.jobs.values()).find(
      (job) => job.status === 'pending'
    );

    if (!pendingJob) {
      return; // No jobs to process
    }

    // Mark as processing
    pendingJob.status = 'processing';
    pendingJob.startedAt = new Date();
    this.processing.add(pendingJob.id);

    logger.info({ jobId: pendingJob.id, filePath: pendingJob.filePath }, 'Starting video processing');

    try {
      // Process video
      const buffer = await transformVideo(sourcePath, pendingJob.params);

      // Save to cache (use the cachePath from the job which includes transformation params)
      await saveToCache(pendingJob.cachePath, buffer);

      // Upload to cloud if configured
      if (storage) {
        const contentType = 'video/mp4'; // Adjust based on format
        await storage.upload(pendingJob.filePath, pendingJob.params, buffer, contentType);
      }

      // Mark as completed
      pendingJob.status = 'completed';
      pendingJob.completedAt = new Date();
      pendingJob.progress = 100;

      logger.info({ jobId: pendingJob.id, filePath: pendingJob.filePath }, 'Video processing completed');

      // Emit completion event
      this.emit('job:completed', pendingJob);
    } catch (error) {
      // Mark as error
      pendingJob.status = 'error';
      pendingJob.error = error instanceof Error ? error.message : 'Unknown error';
      pendingJob.completedAt = new Date();

      logger.error({ error, jobId: pendingJob.id, filePath: pendingJob.filePath }, 'Video processing failed');

      // Emit error event
      this.emit('job:error', pendingJob, error);
    } finally {
      // Remove from processing set
      this.processing.delete(pendingJob.id);

      // Process next job
      setTimeout(() => this.processNext(sourcePath, storage), 100);
    }
  }

  /**
   * Clean up old completed/error jobs (older than 1 hour)
   */
  cleanup(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'error') &&
        job.completedAt &&
        job.completedAt < oneHourAgo
      ) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info({ cleanedCount }, 'Cleaned up old video jobs');
    }
  }

  /**
   * Get queue stats
   */
  getStats() {
    const stats = {
      total: this.jobs.size,
      pending: 0,
      processing: 0,
      completed: 0,
      error: 0,
    };

    for (const job of this.jobs.values()) {
      stats[job.status]++;
    }

    return stats;
  }
}

// Singleton instance
export const videoJobQueue = new VideoJobQueue();

// Periodic cleanup (every 10 minutes)
setInterval(() => {
  videoJobQueue.cleanup();
}, 10 * 60 * 1000);

