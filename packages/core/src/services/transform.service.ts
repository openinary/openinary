import { Context } from "hono";
import { getCachePath, existsInCache, deleteCachedFiles } from "../utils/cache";
import { parseParams, isTransformSegment } from "../utils/parser";
import { CloudStorage } from "../utils/storage/index";
import { Compression } from "../utils/image/compression";
import logger, { serializeError } from "../utils/logger";
import type { VideoJobQueue } from "../utils/video-job-queue";
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
import {
  VIDEO_FORMATS,
  contentTypeForFormat,
  determineOutputFormat,
} from "../utils/video/format";

const isVideo = (ext: string | undefined): ext is string =>
  !!ext && VIDEO_FORMATS.has(ext);

// Types for the service
export interface TransformRequest {
  path: string;
  userAgent: string;
  acceptHeader?: string;
  context: Context;
  /**
   * Read the original from here rather than from this instance's storage. Only
   * ever set on an instance that opted in - see remoteSourceUrl in
   * routes/transform-helpers. Changes where the source bytes come from and
   * nothing else: the cache, on both sides, stays this instance's own.
   */
  sourceUrl?: string;
}

export interface TransformResult {
  buffer?: Buffer;
  /** Set instead of buffer for large payloads served without in-memory buffering */
  stream?: ReadableStream<Uint8Array>;
  contentType: string;
  headers: Record<string, string>;
  isProcessing?: boolean;
  optimizationResult?: any;
  /** Non-200 status the route handler must apply (e.g. 202 while transcoding) */
  status?: number;
}

export interface CacheCheckResult {
  cloudCacheBuffer?: Buffer;
  localCacheBuffer?: Buffer;
  cachePath?: string;
  effectiveParams: any;
}

export class TransformService {
  private storage: CloudStorage | null;
  private compression: Compression;
  private queue: VideoJobQueue;

  constructor(storage: CloudStorage | null, queue: VideoJobQueue) {
    this.storage = storage;
    this.queue = queue;
    this.compression = new Compression();
  }

  /**
   * Main transformation method that handles the complete flow
   */
  async transform(request: TransformRequest): Promise<TransformResult> {
    const { path, userAgent, acceptHeader, sourceUrl } = request;

    try {
      // Parse path and parameters
      const segments = path.split("/").slice(2); // Remove '/t' prefix
      const params = parseParams(path);

      // Determine file path segments
      const hasTransform = this.hasTransformSegment(segments);
      const fileSegments = hasTransform ? segments.slice(1) : segments;
      const filePath = fileSegments.join("/");
      const localPath = `./public/${filePath}`;
      const ext = filePath.split(".").pop()?.toLowerCase();

      // Get effective parameters with format optimization
      const { effectiveParams, cachePath } =
        await this.getEffectiveParamsAndCachePath(
          path,
          params,
          userAgent,
          acceptHeader,
        );

      // Verify original file exists
      const fileCheck = await verifyFileExists(
        this.storage,
        filePath,
        localPath,
        sourceUrl,
      );
      if (!fileCheck.exists) {
        await this.handleFileNotFound(filePath);
        throw new Error(fileCheck.error || "File not found");
      }

      // A bare /t/<video> URL delivers the untouched original. Transcoding only
      // happens when the URL asks for it, either with explicit parameters or
      // with q_auto for the default optimization.
      if (isVideo(ext) && Object.keys(effectiveParams).length === 0) {
        return await this.streamOriginalVideo(
          filePath,
          localPath,
          ext,
          sourceUrl,
        );
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
        path,
        filePath,
        localPath,
        ext,
        effectiveParams,
        cachePath,
        userAgent,
        acceptHeader,
        sourceUrl,
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
  ): Promise<{ effectiveParams: any; cachePath: string }> {
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
    if (isVideo(ext)) {
      headers["X-Video-Status"] = "ready";
    }

    // Video sources must derive the type from the requested output format:
    // f_avif on a .mp4 caches an image, and the route's path-extension
    // fallback would mislabel it video/mp4 (browsers then render an empty
    // player). Mirrors the contentType the worker uploads to cloud cache.
    const contentType = isVideo(ext)
      ? contentTypeForFormat(
          determineOutputFormat(ext, effectiveParams.format).format,
        )
      : ""; // Images: route handler falls back to path extension

    return {
      buffer,
      contentType,
      headers,
      isProcessing: false,
    };
  }

  /**
   * Process the file (images and videos)
   */
  private async processFile(
    requestPath: string,
    filePath: string,
    localPath: string,
    ext: string | undefined,
    effectiveParams: any,
    cachePath: string,
    userAgent?: string,
    acceptHeader?: string,
    sourceUrl?: string,
  ): Promise<TransformResult> {
    // Video transformations (non-thumbnail) are processed by the background
    // job queue, which downloads its own source copy. Skip prepareSourceFile
    // entirely: downloading the full original here would only delay the
    // response and waste memory/bandwidth.
    //
    // That own copy is why sourceUrl stops here: the worker reads the original
    // through this instance's storage when it picks the job up, which may be
    // minutes later and long after any signed URL would have expired. A remote
    // source therefore covers images and video thumbnails, not transcodes.
    const isThumbnailRequest =
      effectiveParams.thumbnail === "true" || effectiveParams.thumbnail === "1";
    if (isVideo(ext) && !isThumbnailRequest) {
      return await this.handleVideoJobQueue(
        requestPath,
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
      sourceUrl,
    );
    // A remote source is staged to ./temp the same way a cloud download is, so
    // it has to be cleaned up the same way. Only the no-storage, no-URL case
    // reads a file in ./public that must survive the request.
    const isTempFile = !!this.storage || !!sourceUrl;

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
      } else if (isVideo(ext)) {
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
      if (isVideo(ext)) {
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
    requestPath: string,
    filePath: string,
    localPath: string,
    params: any,
    cachePath: string,
  ): Promise<TransformResult> {
    // Check if already being processed
    let existingJob = this.queue.getJobByPath(filePath, params);
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
            return {
              buffer: cachedBuffer,
              contentType: contentTypeForFormat(
                determineOutputFormat(
                  filePath.split(".").pop()?.toLowerCase(),
                  params.format,
                ).format,
              ),
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
            this.queue.getStore().updateJobStatus(existingJob.id, "pending", 0);
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
      this.queue
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

    // Never fall back to the original while the transform is pending: it would
    // ship content whose transformations (watermark, crop, trim) have not been
    // applied yet. Answer 202 and let the client poll /video-status.
    return {
      buffer: Buffer.from(
        JSON.stringify({
          status: "processing",
          message: "Video transformation is being processed",
          // Keeps the transformation segment: /video-status resolves the job
          // from the same path + params the transform URL carries
          statusUrl: requestPath.replace(/^\/t\//, "/video-status/"),
        }),
      ),
      contentType: "application/json",
      status: 202,
      headers: {
        "X-Video-Status": "processing",
        "Cache-Control": "no-store",
        "Retry-After": "5",
      },
      isProcessing: true,
    };
  }

  /**
   * Stream the untouched original without buffering it in memory: originals can
   * weigh hundreds of MB and buffering both delays the first byte and pressures
   * the container memory while ffmpeg jobs are running.
   */
  private async streamOriginalVideo(
    filePath: string,
    localPath: string,
    ext: string,
    sourceUrl?: string,
  ): Promise<TransformResult> {
    // encodeURIComponent keeps ETag ASCII-only: HTTP header values must be a
    // ByteString, and raw file paths can contain non-ASCII or NFD-decomposed
    // accented characters (e.g. a combining accent has a code point > 255)
    const headers: Record<string, string> = {
      "X-Video-Status": "original",
      "Cache-Control": "public, max-age=31536000, must-revalidate",
      ETag: `"${encodeURIComponent(filePath)}-original"`,
    };

    try {
      let stream: ReadableStream<Uint8Array>;

      if (sourceUrl) {
        // Passed straight through rather than staged to disk - this route
        // hands back the untouched original, so there is nothing to process.
        const response = await fetch(sourceUrl);
        if (!response.ok || !response.body) {
          throw new Error(`Source URL answered ${response.status}`);
        }
        const length = response.headers.get("content-length");
        if (length) headers["Content-Length"] = length;
        stream = response.body;
      } else if (this.storage) {
        const original = await this.storage.downloadOriginalStream(filePath);
        if (original.contentLength) {
          headers["Content-Length"] = original.contentLength.toString();
        }
        stream = original.stream;
      } else {
        const { createReadStream } = await import("fs");
        const { stat } = await import("fs/promises");
        const { Readable } = await import("stream");
        const stats = await stat(localPath);
        headers["Content-Length"] = stats.size.toString();
        stream = Readable.toWeb(
          createReadStream(localPath),
        ) as ReadableStream<Uint8Array>;
      }

      return { stream, contentType: contentTypeForFormat(ext), headers };
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
