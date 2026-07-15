import { Context } from "hono";
import { getCachePath, existsInCache, deleteCachedFiles } from "../utils/cache";
import { parseParams, isTransformSegment } from "../utils/parser";
import { createStorageClient } from "../utils/storage/index";
import { Compression } from "../utils/image/compression";
import logger, { serializeError } from "../utils/logger";
import { videoJobQueue } from "../utils/video-job-queue";
import { updateJobStatus } from "../utils/video/queue-db";
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
} from "../routes/transform-helpers";
import { TRANSFORMATION_PRIORITY } from "../utils/video/config";
import path from "path";
import { CombindedTransformParams, VideoTransformParams } from "shared/types";

// Types for the service
export interface TransformRequest {
  path: string;
  userAgent: string;
  acceptHeader?: string;
  context: Context;
}

export interface TransformResult {
  buffer?: Buffer;
  /** Set instead of buffer for large payloads served without in-memory buffering */
  stream?: ReadableStream<Uint8Array>;
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
    const { path: pathname, userAgent, acceptHeader } = request;

    try {
      // Parse path and parameters
      const segments = pathname.split("/").slice(2); // Remove '/t' prefix
      const params = parseParams(pathname);

      // Determine file path segments
      const hasTransform = this.hasTransformSegment(segments);
      const fileSegments = hasTransform ? segments.slice(1) : segments;
      const filePath = fileSegments.join("/");
      const localPath = `./public/${filePath}`;
      const ext = filePath.split(".").pop()?.toLowerCase();

      // Get effective parameters with format optimization
      const { effectiveParams, cachePath } =
        await this.getEffectiveParamsAndCachePath(
          pathname,
          params,
          userAgent,
          acceptHeader,
        );

      // Verify original file exists
      const fileCheck = await verifyFileExists(
        this.storage,
        filePath,
        localPath,
      );
      if (!fileCheck.exists) {
        await this.handleFileNotFound(filePath);
        throw new Error(fileCheck.error || "File not found");
      }

      if (effectiveParams.overlayPath) {
        // Verify original overlay file exists
        const overlayFileCheck = await verifyFileExists(
          this.storage,
          effectiveParams.overlayPath,
          path.join("./public", effectiveParams.overlayPath),
        );
        if (!overlayFileCheck.exists) {
          await this.handleFileNotFound(effectiveParams.overlayPath);
          throw new Error(overlayFileCheck.error || "Overlay File not found");
        }
      }

      // Check caches
      const cacheResult = await this.checkCaches(
        this.storage,
        filePath,
        effectiveParams,
        cachePath,
      );

      if (cacheResult.cloudCacheBuffer) {
        return this.formatCacheResponse(
          cacheResult.cloudCacheBuffer,
          effectiveParams,
          ext,
          "cloud",
        );
      }

      if (cacheResult.localCacheBuffer) {
        return this.formatCacheResponse(
          cacheResult.localCacheBuffer,
          effectiveParams,
          ext,
          "local",
        );
      }

      // Process the file
      return await this.processFile(
        filePath,
        localPath,
        ext,
        effectiveParams,
        cachePath,
        userAgent,
        acceptHeader,
      );
    } catch (error) {
      return this.handleTransformationError(error, request);
    }
  }

  /**
   * Check if the first segment is a transformation string
   */
  private hasTransformSegment(segments: string[]): boolean {
    return segments.length > 0 && isTransformSegment(segments[0]);
  }

  /**
   * Get effective parameters with format optimization and cache path
   */
  private async getEffectiveParamsAndCachePath(
    path: string,
    params: any,
    userAgent?: string,
    acceptHeader?: string,
  ): Promise<{ effectiveParams: CombindedTransformParams; cachePath: string }> {
    const ext = path.split(".").pop()?.toLowerCase();
    let effectiveParams = { ...params };
    let cachePath = getCachePath(path);

    // Determine optimal format if not explicitly specified
    if (!params.format && ext?.match(/jpe?g|png|webp|avif|gif|psd/)) {
      const optimalFormat = this.compression.determineOptimalFormatForCache(
        userAgent,
        acceptHeader,
        ext,
      );
      effectiveParams = { ...params, format: optimalFormat };

      // Update cache path to include the optimal format
      const pathWithFormat = path.replace(
        /\/t\/(.*)$/,
        `/t/format:${optimalFormat}/$1`,
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
    cachePath: string,
  ): Promise<CacheCheckResult> {
    const result: CacheCheckResult = {
      effectiveParams,
      cachePath,
    };

    // Check cloud cache first
    const cloudCacheBuffer = await checkCloudCache(
      storage,
      filePath,
      effectiveParams,
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
    _cacheType: "cloud" | "local",
  ): TransformResult {
    const headers: Record<string, string> = {
      "Cache-Control": "public, max-age=31536000, must-revalidate",
      ETag: `"${JSON.stringify(effectiveParams)}"`,
      "Content-Length": buffer.length.toString(),
    };

    // For videos, add video-specific headers
    if (ext?.match(/mp4|mov|webm/)) {
      headers["X-Video-Status"] = "ready";
    }

    return {
      buffer,
      contentType: "", // Will be determined by the route handler
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
    effectiveParams: CombindedTransformParams,
    cachePath: string,
    userAgent?: string,
    acceptHeader?: string,
  ): Promise<TransformResult> {
    // Video transformations (non-thumbnail) are processed by the background
    // job queue, which downloads its own source copy. Skip prepareSourceFile
    // entirely: downloading the full original here would only delay the
    // response and waste memory/bandwidth.
    const isThumbnailRequest = effectiveParams.thumbnail;
    if (ext?.match(/mp4|mov|webm/) && !isThumbnailRequest) {
      return await this.handleVideoJobQueue(
        filePath,
        localPath,
        effectiveParams,
        cachePath,
      );
    }

    // Prepare source file
    const sourcePath = await prepareSourceFile(
      this.storage,
      filePath,
      localPath,
    );

    if (effectiveParams.overlayPath) {
      effectiveParams.overlayPath = await prepareSourceFile(
        this.storage,
        effectiveParams.overlayPath,
        path.join("./public", effectiveParams.overlayPath),
      );
    }

    const isTempFile = !!this.storage;

    try {
      let buffer: Buffer;
      let contentType: string;
      let optimizationResult: any;

      // Process based on file type
      if (ext?.match(/jpe?g|png|webp|avif|gif|psd/)) {
        const result = await this.processImageFile(
          sourcePath,
          effectiveParams,
          userAgent,
          acceptHeader,
        );
        buffer = result.buffer;
        contentType = result.contentType;
        optimizationResult = result.optimizationResult;
      } else if (ext?.match(/mp4|mov|webm/)) {
        // Only thumbnail requests reach this point (non-thumbnail video
        // transformations are intercepted before prepareSourceFile above);
        // thumbnails are extracted synchronously like images
        const result = await processVideo(sourcePath, effectiveParams);
        return {
          buffer: result.buffer,
          contentType: result.contentType,
          headers: {
            "Content-Length": result.buffer.length.toString(),
            "Cache-Control": "public, max-age=31536000, must-revalidate",
          },
        };
      } else {
        throw new Error("Unsupported file type");
      }

      // Save to caches
      if (cachePath) {
        await saveToCaches(
          this.storage,
          filePath,
          effectiveParams,
          cachePath,
          buffer,
          contentType,
        );
      }

      // Periodic cache cleanup
      await performPeriodicCacheCleanup();

      // Format response
      // encodeURIComponent keeps ETag ASCII-only: HTTP header values must be a
      // ByteString, and raw file paths can contain non-ASCII or NFD-decomposed
      // accented characters (e.g. a combining accent has a code point > 255)
      const headers: Record<string, string> = {
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, must-revalidate",
        ETag: `"${encodeURIComponent(filePath)}-${JSON.stringify(effectiveParams)}"`,
      };

      // Add optimization headers if available
      if (optimizationResult) {
        headers["X-Original-Size"] = optimizationResult.originalSize.toString();
        headers["X-Optimized-Size"] =
          optimizationResult.optimizedSize.toString();
        headers["X-Compression-Ratio"] =
          optimizationResult.compressionRatio.toFixed(2);
        headers["X-Savings-Percent"] = optimizationResult.savings.toFixed(1);
      }

      // For videos, indicate this is the optimized version
      if (ext?.match(/mp4|mov|webm/)) {
        headers["X-Video-Status"] = "ready";
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

        if (effectiveParams.overlayPath)
          await cleanupTempFile(effectiveParams.overlayPath);
      }
    }
  }

  /**
   * Process image file
   */
  private async processImageFile(
    sourcePath: string,
    effectiveParams: CombindedTransformParams,
    userAgent?: string,
    acceptHeader?: string,
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
      this.compression,
    );
  }

  /**
   * Handle video job queue management
   */
  private async handleVideoJobQueue(
    filePath: string,
    localPath: string,
    params: VideoTransformParams,
    cachePath: string,
  ): Promise<TransformResult> {
    // Check if already being processed
    let existingJob = videoJobQueue.getJobByPath(filePath, params);
    let shouldRequeue = false;

    if (existingJob) {
      logger.debug(
        { jobId: existingJob.id, status: existingJob.status },
        "Video job exists",
      );

      // If completed, verify cache actually exists before serving
      if (existingJob.status === "completed" && cachePath) {
        const localCacheExists = await existsInCache(cachePath);
        const cloudCacheExists = this.storage
          ? await this.storage.exists(filePath, params)
          : false;

        if (localCacheExists || cloudCacheExists) {
          // Cache exists, try to serve from local cache first
          const cachedBuffer = await checkLocalCache(cachePath);
          if (cachedBuffer) {
            console.log("return cache");
            return {
              buffer: cachedBuffer,
              contentType: `video/${filePath.split(".").pop()}`,
              headers: {
                "X-Video-Status": "ready",
                "Content-Length": cachedBuffer.length.toString(),
                "Cache-Control": "public, max-age=31536000, must-revalidate",
              },
            };
          }
        } else {
          // Job is marked as completed but cache doesn't exist
          logger.warn(
            { jobId: existingJob.id, filePath, cachePath },
            "Job marked as completed but cache missing - resetting to pending",
          );
          try {
            updateJobStatus(existingJob.id, "pending", 0);
            shouldRequeue = true;
            existingJob = { ...existingJob, status: "pending" as const };
          } catch (error) {
            logger.error(
              { error: serializeError(error), jobId: existingJob.id },
              "Failed to reset job status",
            );
            shouldRequeue = true;
          }
        }
      }
    }

    // Add to background processing queue
    if (
      !existingJob ||
      existingJob.status === "error" ||
      existingJob.status === "pending" ||
      shouldRequeue
    ) {
      videoJobQueue
        .addJob(
          filePath,
          params,
          cachePath,
          localPath,
          this.storage,
          TRANSFORMATION_PRIORITY,
        )
        .catch((error) => {
          logger.error(
            { error: serializeError(error), filePath },
            "Failed to add video job",
          );
        });
    }

    // don't stream the original video when the content rights should be preserved
    // using a watermark
    if (params.overlayPath)
      throw new TransformationIncompleteError(
        "Can't ship video with missing watermark",
      );

    // Stream the original video immediately, without buffering it in memory:
    // originals can weigh hundreds of MB and buffering both delays the first
    // byte and pressures the container memory while ffmpeg jobs are running
    // encodeURIComponent keeps ETag ASCII-only: HTTP header values must be a
    // ByteString, and raw file paths can contain non-ASCII or NFD-decomposed
    // accented characters (e.g. a combining accent has a code point > 255)
    const processingHeaders: Record<string, string> = {
      "X-Video-Status": "processing",
      "X-Original-Video": "true",
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: `"${encodeURIComponent(filePath)}-processing-${Date.now()}"`,
      Vary: "Accept",
    };

    try {
      if (this.storage) {
        const { stream, contentLength } =
          await this.storage.downloadOriginalStream(filePath);
        if (contentLength) {
          processingHeaders["Content-Length"] = contentLength.toString();
        }

        return {
          stream,
          contentType: `video/${filePath.split(".").pop()}`,
          headers: processingHeaders,
          isProcessing: true,
        };
      }

      const { createReadStream } = await import("fs");
      const { stat } = await import("fs/promises");
      const stats = await stat(localPath);
      processingHeaders["Content-Length"] = stats.size.toString();
      const { Readable } = await import("stream");

      return {
        stream: Readable.toWeb(
          createReadStream(localPath),
        ) as ReadableStream<Uint8Array>,
        contentType: `video/${filePath.split(".").pop()}`,
        headers: processingHeaders,
        isProcessing: true,
      };
    } catch (error) {
      logger.error(
        { error: serializeError(error), filePath },
        "Failed to serve original video",
      );
      throw new Error("Failed to load video");
    }
  }

  /**
   * Handle file not found scenario
   */
  private async handleFileNotFound(filePath: string): Promise<void> {
    try {
      await deleteCachedFiles(filePath);
    } catch (error) {
      logger.warn(
        { error: serializeError(error), filePath },
        "Failed to delete cached files",
      );
    }
  }

  /**
   * Handle transformation errors
   */
  private async handleTransformationError(
    error: any,
    request: TransformRequest,
  ): Promise<TransformResult> {
    if (error instanceof TransformationIncompleteError) {
      logger.error(
        {
          error: error.message,
          path: request.path,
        },
        error.name,
      );

      return {
        buffer: Buffer.from(`Processing is ongoing`),
        contentType: "text/plain",
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        error: serializeError(error),
        path: request.path,
      },
      "Processing error",
    );

    // Check if this is a "file not found" error from cloud storage
    const isNotFoundError =
      errorMessage.includes("NoSuchKey") ||
      errorMessage.includes("NotFound") ||
      errorMessage.includes("404") ||
      errorMessage.includes("does not exist") ||
      errorMessage.includes("not found");

    if (isNotFoundError && this.storage) {
      // Invalidate cache since the file doesn't exist
      const pathSegments = request.path.split("/").slice(2);
      const hasTransform =
        pathSegments.length > 0 && isTransformSegment(pathSegments[0]);
      const filePath = hasTransform
        ? pathSegments.slice(1).join("/")
        : pathSegments.join("/");

      this.storage.invalidateAllCacheEntries(filePath);

      // Delete local cache files
      try {
        await deleteCachedFiles(filePath);
      } catch (cleanupError) {
        logger.warn(
          { error: serializeError(cleanupError), filePath },
          "Failed to cleanup cache after not found error",
        );
      }
    }

    // Return error result (route handler will convert to appropriate HTTP response)
    return {
      buffer: Buffer.from(`Processing failed: ${errorMessage}`),
      contentType: "text/plain",
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    };
  }
}
