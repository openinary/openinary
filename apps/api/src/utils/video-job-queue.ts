import { EventEmitter } from 'events';
import { parseParams } from './parser';
import { CloudStorage } from './storage/index';
import logger from './logger';
import { VideoWorker } from './video/video-worker';
import {
  createJob,
  getJobByFileAndParams,
  getJobById,
  getJobStats,
  cleanupOldJobs,
  type VideoJob as DBVideoJob,
  type JobStatus,
} from './video/queue-db';
import { JOB_CLEANUP_HOURS, TRANSFORMATION_PRIORITY } from './video/config';

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

class VideoJobQueue extends EventEmitter {
  private worker: VideoWorker;
  private storage: CloudStorage | null = null;

  constructor() {
    super();
    // Worker will be initialized when storage is set
    this.worker = new VideoWorker(null);
    
    // Forward worker events
    this.worker.on('job:created', (job) => this.emit('job:created', convertDBJob(job)));
    this.worker.on('job:started', (job) => this.emit('job:started', convertDBJob(job)));
    this.worker.on('job:progress', (job, progress) => this.emit('job:progress', convertDBJob(job), progress));
    this.worker.on('job:completed', (job) => this.emit('job:completed', convertDBJob(job)));
    this.worker.on('job:error', (job, error) => this.emit('job:error', convertDBJob(job), error));
  }

  /**
   * Initialize the queue with storage client
   */
  initialize(storage: CloudStorage | null): void {
    this.storage = storage;
    this.worker = new VideoWorker(storage);
    
    // Forward worker events
    this.worker.on('job:created', (job) => this.emit('job:created', convertDBJob(job)));
    this.worker.on('job:started', (job) => this.emit('job:started', convertDBJob(job)));
    this.worker.on('job:progress', (job, progress) => this.emit('job:progress', convertDBJob(job), progress));
    this.worker.on('job:completed', (job) => this.emit('job:completed', convertDBJob(job)));
    this.worker.on('job:error', (job, error) => this.emit('job:error', convertDBJob(job), error));
    
    // Start the worker
    this.worker.start();
    
    logger.info('Video job queue initialized with background worker');
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
    priority: number = TRANSFORMATION_PRIORITY
  ): Promise<string> {
    // Create job in database
    const jobId = createJob(filePath, params, cachePath, priority);
    
    // Emit created event
    const job = getJobById(jobId);
    if (job) {
      this.emit('job:created', convertDBJob(job));
    }
    
    return jobId;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): VideoJob | null {
    const dbJob = getJobById(jobId);
    return dbJob ? convertDBJob(dbJob) : null;
  }

  /**
   * Get job by file path and params
   */
  getJobByPath(filePath: string, params: ReturnType<typeof parseParams>): VideoJob | null {
    const dbJob = getJobByFileAndParams(filePath, params);
    return dbJob ? convertDBJob(dbJob) : null;
  }

  /**
   * Clean up old completed/error jobs
   */
  cleanup(): void {
    cleanupOldJobs(JOB_CLEANUP_HOURS);
  }

  /**
   * Get queue stats
   */
  getStats() {
    return getJobStats();
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
  }
}

// Singleton instance
export const videoJobQueue = new VideoJobQueue();

// Periodic cleanup (every 10 minutes)
setInterval(() => {
  videoJobQueue.cleanup();
}, 10 * 60 * 1000);

