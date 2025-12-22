import { Hono } from "hono";
import { getCachePath } from "../utils/cache";
import { parseParams } from "../utils/parser";
import { createStorageClient } from "../utils/storage/index";
import { Compression } from "../utils/image/compression";
import logger from "../utils/logger";
import { videoJobQueue } from "../utils/video-job-queue";
import { readFile } from "fs/promises";
import {
  setContentTypeHeader,
  checkCloudCache,
  checkLocalCache,
  verifyFileExists,
  prepareSourceFile,
  processImage,
  processVideo,
  saveToCaches,
  cleanupTempFile,
  performPeriodicCacheCleanup,
  determineContentType,
} from "./transform-helpers";
import { THUMBNAIL_PRIORITY, TRANSFORMATION_PRIORITY } from "../utils/video/config";

const t = new Hono();
const storage = createStorageClient();
const compression = new Compression();

t.get("/*", async (c) => {
  const path = c.req.path;
  const segments = path.split("/").slice(2); // Remove '/t' prefix
  const params = parseParams(path);

  // Determine file path segments.
  // The first segment after "/t" is the transformation string
  // (e.g. "w_300,h_300,c_fill") and should not be part of the file path.
  const hasTransform =
    segments.length > 0 &&
    !segments[0].includes(".") &&
    (segments[0].includes(",") || segments[0].includes("_"));

  const fileSegments = hasTransform
    ? segments.slice(1)
    : segments;
  const filePath = fileSegments.join("/");

  let cachePath = getCachePath(path);
  const localPath = `./public/${filePath}`;
  const ext = filePath.split(".").pop();

  // Get browser support info for format optimization
  const userAgent = c.req.header("User-Agent");
  const acceptHeader = c.req.header("Accept");
  
  // Determine optimal format if not explicitly specified
  // This ensures cache keys include the format for proper cache hits
  let effectiveParams = { ...params };
  if (!params.format && ext?.match(/jpe?g|png|webp|avif|gif/)) {
    const optimalFormat = compression.determineOptimalFormatForCache(
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
  
  // 1. FIRST: Verify original file exists (before serving cache)
  // This prevents serving cached files when the original has been deleted
  const fileCheck = await verifyFileExists(storage, filePath, localPath);
  if (!fileCheck.exists) {
    logger.error({ filePath }, "File not found - invalidating cache");
    
    // Delete cached versions since original is gone
    try {
      const { deleteCachedFiles } = await import("../utils/cache");
      await deleteCachedFiles(filePath);
    } catch (error) {
      logger.warn({ error, filePath }, "Failed to delete cached files");
    }
    
    // Prevent caching of 404 responses
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    
    return c.text(fileCheck.error || "File not found", 404);
  }

  // 2. Check cloud cache (if configured)
  const cloudCacheBuffer = await checkCloudCache(storage, filePath, effectiveParams);
  if (cloudCacheBuffer) {
    // For cloud cache, we trust it has the right format since it's based on params
    const contentType = await determineContentType(effectiveParams, cloudCacheBuffer, ext);
    setContentTypeHeader(c, contentType);
    // Add cache control headers - allow caching but require revalidation
    c.header('Cache-Control', 'public, max-age=31536000, must-revalidate');
    c.header('ETag', `"${filePath}-${JSON.stringify(effectiveParams)}"`);
    // For videos, indicate this is the optimized version
    if (ext?.match(/mp4|mov|webm/)) {
      c.header('X-Video-Status', 'ready');
      c.header('Content-Length', cloudCacheBuffer.length.toString());
    }
    return c.body(new Uint8Array(cloudCacheBuffer));
  }

  // 3. Check local cache (now includes format in key when format is auto-determined)
  const localCacheBuffer = await checkLocalCache(cachePath);
  if (localCacheBuffer) {
    const contentType = await determineContentType(effectiveParams, localCacheBuffer, ext);
    setContentTypeHeader(c, contentType);
    // Add cache control headers - allow caching but require revalidation
    c.header('Cache-Control', 'public, max-age=31536000, must-revalidate');
    c.header('ETag', `"${filePath}-${JSON.stringify(effectiveParams)}"`);
    // For videos, indicate this is the optimized version
    if (ext?.match(/mp4|mov|webm/)) {
      c.header('X-Video-Status', 'ready');
      c.header('Content-Length', localCacheBuffer.length.toString());
    }
    return c.body(new Uint8Array(localCacheBuffer));
  }

  // 4. File exists but not in cache - process it

  // 4. Processing and storage
  try {
    // Prepare source file (download from cloud if needed)
    const sourcePath = await prepareSourceFile(storage, filePath, localPath);
    const isTempFile = !!storage;

    let buffer: Buffer;
    let contentType: string;
    let optimizationResult: any;

    // Process based on file type
    if (ext?.match(/jpe?g|png|webp|avif|gif/)) {
      const result = await processImage(
        sourcePath,
        effectiveParams, // Use effectiveParams which includes auto-determined format
        userAgent,
        acceptHeader,
        compression
      );
      buffer = result.buffer;
      contentType = result.contentType;
      optimizationResult = result.optimizationResult;
    } else if (ext?.match(/mp4|mov|webm/)) {
      // Check if this is a thumbnail extraction (produces image, not video)
      // Support both string 'true' and '1' (params are always strings from parseParams)
      const isThumbnailRequest = params.thumbnail === 'true' || params.thumbnail === '1';
      
      // For thumbnail extraction: process synchronously (fast, produces image)
      if (isThumbnailRequest) {
        const result = await processVideo(sourcePath, params);
        buffer = result.buffer;
        contentType = result.contentType;
      } else {
        // For video transformations: check if we should process in background
        // Check if already being processed
        const existingJob = videoJobQueue.getJobByPath(filePath, params);
        
        if (existingJob) {
          logger.debug({ jobId: existingJob.id, status: existingJob.status }, 'Video job exists');
          
          // If completed, serve from cache
          if (existingJob.status === 'completed') {
            const cachedBuffer = await checkLocalCache(cachePath);
            if (cachedBuffer) {
              if (isTempFile) {
                await cleanupTempFile(sourcePath);
              }
              const cachedContentType = await determineContentType(params, cachedBuffer, ext);
              setContentTypeHeader(c, cachedContentType);
              c.header('X-Video-Status', 'ready');
              c.header('Content-Length', cachedBuffer.length.toString());
              return c.body(new Uint8Array(cachedBuffer));
            }
          }
        }
        
        // Add to background processing queue (non-blocking)
        // Use normal priority for video transformations
        if (!existingJob || existingJob.status === 'error') {
          videoJobQueue.addJob(filePath, params, cachePath, sourcePath, storage, TRANSFORMATION_PRIORITY).catch((error) => {
            logger.error({ error, filePath }, 'Failed to add video job');
          });
        }

        // Return original video immediately
        try {
          const originalBuffer = storage 
            ? await storage.downloadOriginal(filePath)
            : await readFile(localPath);

          // Clean up temp file if needed
          if (isTempFile && sourcePath !== localPath) {
            await cleanupTempFile(sourcePath);
          }

          setContentTypeHeader(c, `video/${ext}`);
          c.header('X-Video-Status', 'processing');
          c.header('X-Original-Video', 'true');
          // DO NOT cache original video while processing - CDN must revalidate
          c.header('Cache-Control', 'public, max-age=0, must-revalidate');
          c.header('ETag', `"${filePath}-processing-${Date.now()}"`);
          c.header('Vary', 'Accept');
          
          return c.body(new Uint8Array(originalBuffer));
        } catch (error) {
          logger.error({ error, filePath }, 'Failed to serve original video');
          if (isTempFile) {
            await cleanupTempFile(sourcePath);
          }
          return c.text('Failed to load video', 500);
        }
      }
    } else {
      // Cleanup temp file if needed
      if (isTempFile) {
        await cleanupTempFile(sourcePath);
      }
      return c.text("Unsupported file type", 400);
    }

    // Clean up temporary source file if used (when cloud provider configured)
    if (isTempFile) {
      await cleanupTempFile(sourcePath);
    }

    // Save to caches (use effectiveParams to ensure format is included in cache key)
    await saveToCaches(storage, filePath, effectiveParams, cachePath, buffer, contentType);

    // Periodic cache cleanup
    await performPeriodicCacheCleanup();

    // Set response headers (use the actual content-type from processing, not the original extension)
    setContentTypeHeader(c, contentType);
    c.header('Content-Length', buffer.length.toString());
    // Add cache control headers - allow caching but require revalidation
    c.header('Cache-Control', 'public, max-age=31536000, must-revalidate');
    c.header('ETag', `"${filePath}-${JSON.stringify(effectiveParams)}"`);

    // For videos, indicate this is the optimized version
    if (ext?.match(/mp4|mov|webm/)) {
      c.header('X-Video-Status', 'ready');
    }

    if (optimizationResult) {
      c.header("X-Original-Size", optimizationResult.originalSize.toString());
      c.header("X-Optimized-Size", optimizationResult.optimizedSize.toString());
      c.header(
        "X-Compression-Ratio",
        optimizationResult.compressionRatio.toFixed(2)
      );
      c.header("X-Savings-Percent", optimizationResult.savings.toFixed(1));
    }

    return c.body(new Uint8Array(buffer));
  } catch (error) {
    logger.error({ error, filePath }, "Processing error");
    
    // Check if this is a "file not found" error from cloud storage
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isNotFoundError = 
      errorMessage.includes('NoSuchKey') || 
      errorMessage.includes('NotFound') || 
      errorMessage.includes('404') ||
      errorMessage.includes('does not exist') ||
      errorMessage.includes('not found');
    
    if (isNotFoundError && storage) {
      // Invalidate cache since the file doesn't exist
      storage.invalidateAllCacheEntries(filePath);
      
      // Delete local cache files
      try {
        const { deleteCachedFiles } = await import("../utils/cache");
        await deleteCachedFiles(filePath);
      } catch (cleanupError) {
        logger.warn({ error: cleanupError, filePath }, "Failed to cleanup cache after not found error");
      }
      
      // Prevent caching of 404 responses
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
      
      return c.text(
        `File not found: ${filePath}. Make sure the file exists in your cloud storage bucket.`,
        404
      );
    }
    
    return c.text(
      `Processing failed: ${errorMessage}`,
      500
    );
  }
});

export default t;
