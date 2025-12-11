import { Hono } from 'hono';
import { videoJobQueue } from '../utils/video-job-queue';
import { parseParams } from '../utils/parser';
import { getCachePath, existsInCache } from '../utils/cache';
import { createStorageClient } from '../utils/storage/index';
import logger from '../utils/logger';

const videoStatus = new Hono();
const storage = createStorageClient();

/**
 * GET /video-status/:path/size
 * Get optimized video size
 * This must be before the /* route to be matched first
 */
videoStatus.get('/*/size', async (c) => {
  const path = c.req.path;
  // Remove '/video-status' prefix and '/size' suffix
  const segments = path.split('/').slice(2, -1); // Remove 'video-status' and 'size'
  const filePath = segments.join('/');

  // Parse params from query string or path
  // Use the same path format as transform.ts: /t/{filePath}
  const fullPath = `/t/${filePath}`;
  const params = parseParams(fullPath);

  // Get job status first - if job is completed, we know the cache exists
  const job = videoJobQueue.getJobByPath(filePath, params);
  
  logger.info({ 
    requestPath: path, 
    filePath, 
    fullPath, 
    params: JSON.stringify(params),
    jobStatus: job?.status,
    jobId: job?.id
  }, 'Fetching optimized video size');
  
  // Check cloud storage first (most reliable for optimized videos)
  if (storage) {
    try {
      const existsInCloud = await storage.exists(filePath, params);
      if (existsInCloud) {
        // Get the size from cloud storage
        const metadata = await storage.getOptimizedMetadata(filePath, params);
        if (metadata) {
          logger.info({ 
            filePath, 
            size: metadata.size,
            source: 'cloud_storage'
          }, 'Got optimized size from cloud storage');
          return c.json({
            size: metadata.size,
            status: 'ready',
          });
        } else {
          logger.warn({ filePath }, 'Optimized video exists in cloud but metadata unavailable');
        }
      }
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to get optimized size from cloud storage');
    }
  }
  
  // Fallback: Check if optimized video exists in local cache
  // Use the same path format as transform.ts uses for getCachePath
  const cachePath = getCachePath(fullPath);
  
  const existsLocally = await existsInCache(cachePath);
  
  logger.info({ 
    cachePath, 
    existsLocally,
    jobStatus: job?.status,
    jobCompleted: job?.status === 'completed'
  }, 'Local cache check result');
  
  if (existsLocally || job?.status === 'completed') {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.stat(cachePath);
      const fileAge = Date.now() - stats.mtime.getTime();
      const minAge = 5000; // 5 seconds minimum age
      
      logger.info({ 
        cachePath, 
        size: stats.size, 
        fileAge, 
        minAge,
        isValid: fileAge >= minAge || job?.status === 'completed'
      }, 'Local cache file stats');
      
      // If job is completed, trust the cache file even if it's new
      // Otherwise, check file age
      if (job?.status === 'completed' || fileAge >= minAge) {
        // File is old enough to be considered valid or job is completed
        return c.json({
          size: stats.size,
          status: 'ready',
        });
      } else {
        logger.debug({ filePath, fileAge, jobStatus: job?.status }, 'Cache file too new and job not completed');
      }
    } catch (error) {
      logger.error({ error, cachePath, jobStatus: job?.status }, 'Failed to get cache file stats');
      // If job is completed but we can't read the file, something is wrong
      if (job?.status === 'completed') {
        return c.json({
          error: 'Cache file exists but cannot be read',
          status: 'error',
        }, 500);
      }
    }
  } else {
    logger.warn({ 
      cachePath, 
      filePath, 
      jobStatus: job?.status,
      jobExists: !!job
    }, 'Cache file does not exist and job not completed');
  }

  // No optimized video found
  return c.json({
    status: 'not_found',
    message: 'Optimized video not found',
  }, 404);
});

/**
 * GET /video-status/:path
 * Check video processing status
 */
videoStatus.get('/*', async (c) => {
  const path = c.req.path;
  const segments = path.split('/').slice(2); // Remove '/video-status' prefix
  const filePath = segments.join('/');

  // Parse params from query string or path
  const fullPath = `/t/${filePath}`;
  const params = parseParams(fullPath);

  // Get job status
  const job = videoJobQueue.getJobByPath(filePath, params);

  if (!job) {
    // Job doesn't exist - check if optimized video exists in cache/storage
    // BUT: Only return "completed" if the file is recent enough to be valid
    // This prevents false positives for newly uploaded videos
    
    const cachePath = getCachePath(fullPath);
    const existsLocally = await existsInCache(cachePath);
    
    if (existsLocally) {
      // Check file age to ensure it's not a stale cache entry
      // If file was created less than 5 seconds ago, it might be incomplete
      try {
        const fs = await import('fs/promises');
        const stats = await fs.stat(cachePath);
        const fileAge = Date.now() - stats.mtime.getTime();
        const minAge = 5000; // 5 seconds minimum age
        
        if (fileAge >= minAge) {
          // File is old enough to be considered valid
          return c.json({
            status: 'completed',
            progress: 100,
          });
        } else {
          // File is too new - might be incomplete, return not_found to trigger job creation
          logger.debug({ filePath, fileAge }, 'Cache file too new, treating as not found');
        }
      } catch (error) {
        // If we can't check file stats, don't assume it's ready
        logger.warn({ error, cachePath }, 'Failed to check cache file stats');
      }
    }

    // Check cloud storage if configured
    if (storage) {
      try {
        const existsInCloud = await storage.exists(filePath, params);
        if (existsInCloud) {
          // For cloud storage, we trust the exists check
          // Cloud storage typically handles this correctly
          return c.json({
            status: 'completed',
            progress: 100,
          });
        }
      } catch (error) {
        logger.warn({ error, filePath }, 'Failed to check cloud storage for video status');
      }
    }

    // No job and no valid cached video found
    return c.json({
      status: 'not_found',
      message: 'No processing job found for this video',
    }, 404);
  }

  // Return job status
  // Only return error status if the job has actually failed (not just if error field exists)
  const status = job.status === 'error' && job.error ? 'error' : job.status;
  
  return c.json({
    status,
    progress: job.progress || 0,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
  });
});

/**
 * GET /video-status-stats
 * Get queue statistics (for debugging)
 */
videoStatus.get('/stats', (c) => {
  const stats = videoJobQueue.getStats();
  return c.json(stats);
});

export default videoStatus;





