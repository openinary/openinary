import { Context } from 'hono';
import { getCachePath, existsInCache, deleteCachedFiles } from '../utils/cache';
import { parseParams } from '../utils/parser';
import { createStorageClient } from '../utils/storage/index';
import { Compression } from '../utils/image/compression';
import logger from '../utils/logger';
import { videoJobQueue } from '../utils/video-job-queue';
import { updateJobStatus } from '../utils/video/queue-db';
import { readFile } from 'fs/promises';
import {
  checkCloudCache,
  checkLocalCache,
  verifyFileExists,
  prepareSourceFile,
  processImage,
  processVideo,
  saveToCaches,
  cleanupTempFile,
  performPeriodicCacheCleanup,
} from '../routes/transform-helpers';
import { TRANSFORMATION_PRIORITY } from '../utils/video/config';

// Types for the service
export interface TransformRequest {
  path: string;
  userAgent: string;
  acceptHeader?: string;
  context: Context;
}

export interface TransformResult {
  buffer: Buffer;
  contentType: string;
  headers: Record<string, string>;
  isProcessing?: boolean;
  optimizationResult?: any;
}

export interface CacheCheckResult {
  cloudCacheBuffer?: Buffer;
  localCacheBuffer?: Buffer;
  cachePath?: string;
  effectiveParams: any;
}

export class TransformService {
  private storage: any;
  private compression: Compression;

  constructor() {
    this.storage = createStorageClient();
    this.compression = new Compression();
  }

  /**
   * Main transformation method that handles the complete flow
   */
  async transform(request: TransformRequest): Promise<TransformResult> {
    const { path, userAgent, acceptHeader } = request;

    try {
      // Parse path and parameters
      const segments = path.split('/').slice(2); // Remove '/t' prefix
      const params = parseParams(path);

      // Determine file path segments
      const hasTransform = this.hasTransformSegment(segments);
      const fileSegments = hasTransform ? segments.slice(1) : segments;
      const filePath = fileSegments.join('/');
      const localPath = `./public/${filePath}`;
      const ext = filePath.split('.').pop();

      // Get effective parameters with format optimization
      const { effectiveParams, cachePath } =
        await this.getEffectiveParamsAndCachePath(
          path,
          params,
          userAgent,
          acceptHeader
        );

      // Verify original file exists
      const fileCheck = await verifyFileExists(
        this.storage,
        filePath,
        localPath
      );
      if (!fileCheck.exists) {
        await this.handleFileNotFound(filePath);
        throw new Error(fileCheck.error || 'File not found');
      }

      // Check caches
      const cacheResult = await this.checkCaches(
        this.storage,
        filePath,
        effectiveParams,
        cachePath
      );

      if (cacheResult.cloudCacheBuffer) {
        return this.formatCacheResponse(
          cacheResult.cloudCacheBuffer,
          effectiveParams,
          ext,
          'cloud'
        );
      }

      if (cacheResult.localCacheBuffer) {
        return this.formatCacheResponse(
          cacheResult.localCacheBuffer,
          effectiveParams,
          ext,
          'local'
        );
      }

      // Process the file
      return await this.processFile(
        filePath,
        localPath,
        ext,
        effectiveParams,
        userAgent,
        acceptHeader,
        cachePath
      );
    } catch (error) {
      return this.handleTransformationError(error, request);
    }
  }

  /**
   * Check if the first segment is a transformation string
   */
  private hasTransformSegment(segments: string[]): boolean {
    return (
      segments.length > 0 &&
      !segments[0].includes('.') &&
      (segments[0].includes(',') || segments[0].includes('_'))
    );
  }

  /**
   * Get effective parameters with format optimization and cache path
   */
  private async getEffectiveParamsAndCachePath(
    path: string,
    params: any,
    userAgent?: string,
    acceptHeader?: string
  ): Promise<{ effectiveParams: any; cachePath: string }> {
    const ext = path.split('.').pop();
    let effectiveParams = { ...params };
    let cachePath = getCachePath(path);

    // Determine optimal format if not explicitly specified
    if (!params.format && ext?.match(/jpe?g|png|webp|avif|gif/)) {
      const optimalFormat = this.compression.determineOptimalFormatForCache(
        userAgent,
        acceptHeader,
        ext
      );
      effectiveParams = { ...params, format: optimalFormat };

      // Update cache path to include the optimal format
      const pathWithFormat = path.replace(
        /\/t\/(.*)$/,
        `/t/format:${optimalFormat}/$1`
      );
      cachePath = getCachePath(pathWithFormat);
    }

    return { effectiveParams, cachePath };
  }

  /**
   * Check both cloud and local caches
   */
  private async checkCaches(
    storage: any,
    filePath: string,
    effectiveParams: any,
    cachePath: string
  ): Promise<CacheCheckResult> {
    const result: CacheCheckResult = {
      effectiveParams,
      cachePath,
    };

    // Check cloud cache first
    const cloudCacheBuffer = await checkCloudCache(
      storage,
      filePath,
      effectiveParams
    );
    if (cloudCacheBuffer) {
      result.cloudCacheBuffer = cloudCacheBuffer;
      return result;
    }

    // Check local cache
    const localCacheBuffer = await checkLocalCache(cachePath);
    if (localCacheBuffer) {
      result.localCacheBuffer = localCacheBuffer;
    }

    return result;
  }

  /**
   * Format response for cached content
   */
  private formatCacheResponse(
    buffer: Buffer,
    effectiveParams: any,
    ext: string | undefined,
    _cacheType: 'cloud' | 'local'
  ): TransformResult {
    const headers: Record<string, string> = {
      'Cache-Control': 'public, max-age=31536000, must-revalidate',
      ETag: `"${JSON.stringify(effectiveParams)}"`,
      'Content-Length': buffer.length.toString(),
    };

    // For videos, add video-specific headers
    if (ext?.match(/mp4|mov|webm/)) {
      headers['X-Video-Status'] = 'ready';
    }

    return {
      buffer,
      contentType: '', // Will be determined by the route handler
      headers,
      isProcessing: false,
    };
  }

  /**
   * Process the file (images and videos)
   */
  private async processFile(
    filePath: string,
    localPath: string,
    ext: string | undefined,
    effectiveParams: any,
    cachePath: string,
    userAgent?: string,
    acceptHeader?: string
  ): Promise<TransformResult> {
    // Prepare source file
    const sourcePath = await prepareSourceFile(
      this.storage,
      filePath,
      localPath
    );
    const isTempFile = !!this.storage;

    try {
      let buffer: Buffer;
      let contentType: string;
      let optimizationResult: any;

      // Process based on file type
      if (ext?.match(/jpe?g|png|webp|avif|gif/)) {
        const result = await this.processImageFile(
          sourcePath,
          effectiveParams,
          userAgent,
          acceptHeader
        );
        buffer = result.buffer;
        contentType = result.contentType;
        optimizationResult = result.optimizationResult;
      } else if (ext?.match(/mp4|mov|webm/)) {
        const result = await this.processVideoFile(
          sourcePath,
          effectiveParams,
          filePath,
          cachePath,
          sourcePath !== localPath
        );
        return result; // Video processing returns immediately
      } else {
        throw new Error('Unsupported file type');
      }

      // Save to caches
      if (cachePath) {
        await saveToCaches(
          this.storage,
          filePath,
          effectiveParams,
          cachePath,
          buffer,
          contentType
        );
      }

      // Periodic cache cleanup
      await performPeriodicCacheCleanup();

      // Format response
      const headers: Record<string, string> = {
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, must-revalidate',
        ETag: `"${filePath}-${JSON.stringify(effectiveParams)}"`,
      };

      // Add optimization headers if available
      if (optimizationResult) {
        headers['X-Original-Size'] = optimizationResult.originalSize.toString();
        headers['X-Optimized-Size'] =
          optimizationResult.optimizedSize.toString();
        headers['X-Compression-Ratio'] =
          optimizationResult.compressionRatio.toFixed(2);
        headers['X-Savings-Percent'] = optimizationResult.savings.toFixed(1);
      }

      // For videos, indicate this is the optimized version
      if (ext?.match(/mp4|mov|webm/)) {
        headers['X-Video-Status'] = 'ready';
      }

      return {
        buffer,
        contentType,
        headers,
        optimizationResult,
      };
    } finally {
      // Clean up temporary source file if used
      if (isTempFile) {
        await cleanupTempFile(sourcePath);
      }
    }
  }

  /**
   * Process image file
   */
  private async processImageFile(
    sourcePath: string,
    effectiveParams: any,
    userAgent?: string,
    acceptHeader?: string
  ): Promise<{
    buffer: Buffer;
    contentType: string;
    optimizationResult?: any;
  }> {
    return await processImage(
      sourcePath,
      effectiveParams,
      userAgent,
      acceptHeader,
      this.compression
    );
  }

  /**
   * Process video file (including job queue management)
   */
  private async processVideoFile(
    sourcePath: string,
    params: any,
    filePath: string,
    cachePath: string,
    isTempFile?: boolean
  ): Promise<TransformResult> {
    // Check if this is a thumbnail extraction
    const isThumbnailRequest =
      params.thumbnail === 'true' || params.thumbnail === '1';

    // For thumbnail extraction: process synchronously
    if (isThumbnailRequest) {
      const result = await processVideo(sourcePath, params);

      return {
        buffer: result.buffer,
        contentType: result.contentType,
        headers: {
          'Content-Length': result.buffer.length.toString(),
          'Cache-Control': 'public, max-age=31536000, must-revalidate',
        },
      };
    }

    // For video transformations: handle job queue
    return await this.handleVideoJobQueue(
      sourcePath,
      params,
      filePath,
      cachePath,
      isTempFile
    );
  }

  /**
   * Handle video job queue management
   */
  private async handleVideoJobQueue(
    sourcePath: string,
    params: any,
    filePath: string,
    cachePath: string,
    isTempFile?: boolean
  ): Promise<TransformResult> {
    // Check if already being processed
    let existingJob = videoJobQueue.getJobByPath(filePath, params);
    let shouldRequeue = false;

    if (existingJob) {
      logger.debug(
        { jobId: existingJob.id, status: existingJob.status },
        'Video job exists'
      );

      // If completed, verify cache actually exists before serving
      if (existingJob.status === 'completed' && cachePath) {
        const localCacheExists = await existsInCache(cachePath);
        const cloudCacheExists = this.storage
          ? await this.storage.exists(filePath, params)
          : false;

        if (localCacheExists || cloudCacheExists) {
          // Cache exists, try to serve from local cache first
          const cachedBuffer = await checkLocalCache(cachePath);
          if (cachedBuffer) {
            if (isTempFile) {
              await cleanupTempFile(sourcePath);
            }

            return {
              buffer: cachedBuffer,
              contentType: `video/${filePath.split('.').pop()}`,
              headers: {
                'X-Video-Status': 'ready',
                'Content-Length': cachedBuffer.length.toString(),
                'Cache-Control': 'public, max-age=31536000, must-revalidate',
              },
            };
          }
        } else {
          // Job is marked as completed but cache doesn't exist
          logger.warn(
            { jobId: existingJob.id, filePath, cachePath },
            'Job marked as completed but cache missing - resetting to pending'
          );
          try {
            updateJobStatus(existingJob.id, 'pending', 0);
            shouldRequeue = true;
            existingJob = { ...existingJob, status: 'pending' as const };
          } catch (error) {
            logger.error(
              { error, jobId: existingJob.id },
              'Failed to reset job status'
            );
            shouldRequeue = true;
          }
        }
      }
    }

    // Add to background processing queue
    if (
      !existingJob ||
      existingJob.status === 'error' ||
      existingJob.status === 'pending' ||
      shouldRequeue
    ) {
      videoJobQueue
        .addJob(
          filePath,
          params,
          cachePath,
          sourcePath,
          this.storage,
          TRANSFORMATION_PRIORITY
        )
        .catch((error) => {
          logger.error({ error, filePath }, 'Failed to add video job');
        });
    }

    // Return original video immediately
    try {
      const originalBuffer = this.storage
        ? await this.storage.downloadOriginal(filePath)
        : await readFile(`./public/${filePath}`);

      // Clean up temp file if needed
      if (isTempFile && sourcePath !== `./public/${filePath}`) {
        await cleanupTempFile(sourcePath);
      }

      return {
        buffer: originalBuffer,
        contentType: `video/${filePath.split('.').pop()}`,
        headers: {
          'X-Video-Status': 'processing',
          'X-Original-Video': 'true',
          'Cache-Control': 'public, max-age=0, must-revalidate',
          ETag: `"${filePath}-processing-${Date.now()}"`,
          Vary: 'Accept',
        },
        isProcessing: true,
      };
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to serve original video');
      if (isTempFile) {
        await cleanupTempFile(sourcePath);
      }
      throw new Error('Failed to load video');
    }
  }

  /**
   * Handle file not found scenario
   */
  private async handleFileNotFound(filePath: string): Promise<void> {
    try {
      await deleteCachedFiles(filePath);
    } catch (error) {
      logger.warn({ error, filePath }, 'Failed to delete cached files');
    }
  }

  /**
   * Handle transformation errors
   */
  private async handleTransformationError(
    error: any,
    request: TransformRequest
  ): Promise<TransformResult> {
    logger.error({ error, path: request.path }, 'Processing error');

    // Check if this is a "file not found" error from cloud storage
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isNotFoundError =
      errorMessage.includes('NoSuchKey') ||
      errorMessage.includes('NotFound') ||
      errorMessage.includes('404') ||
      errorMessage.includes('does not exist') ||
      errorMessage.includes('not found');

    if (isNotFoundError && this.storage) {
      // Invalidate cache since the file doesn't exist
      const pathSegments = request.path.split('/').slice(2);
      const hasTransform =
        pathSegments.length > 0 &&
        !pathSegments[0].includes('.') &&
        (pathSegments[0].includes(',') || pathSegments[0].includes('_'));
      const filePath = hasTransform
        ? pathSegments.slice(1).join('/')
        : pathSegments.join('/');

      this.storage.invalidateAllCacheEntries(filePath);

      // Delete local cache files
      try {
        await deleteCachedFiles(filePath);
      } catch (cleanupError) {
        logger.warn(
          { error: cleanupError, filePath },
          'Failed to cleanup cache after not found error'
        );
      }
    }

    // Return error result (route handler will convert to appropriate HTTP response)
    return {
      buffer: Buffer.from(`Processing failed: ${errorMessage}`),
      contentType: 'text/plain',
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    };
  }
}
