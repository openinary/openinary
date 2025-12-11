import { Context } from "hono";
import { existsSync } from "fs";
import { CloudStorage } from "../utils/storage/index";
import { parseParams } from "../utils/parser";
import { transformImage } from "../utils/image/index";
import { transformVideo } from "../utils/video/index";
import { Compression } from "../utils/image/compression";
import logger from "../utils/logger";
import {
  existsInCache,
  saveToCache,
  readFromCache,
  SmartCache,
} from "../utils/cache";

/**
 * Sets the Content-Type header based on file extension or content-type string
 * Accepts either an extension (e.g., "jpg", "png") or a full content-type (e.g., "image/avif")
 */
export function setContentTypeHeader(
  c: Context,
  extensionOrContentType: string | undefined
): void {
  if (!extensionOrContentType) return;

  // If it's already a content-type (starts with "image/" or "video/"), use it directly
  if (extensionOrContentType.startsWith("image/") || extensionOrContentType.startsWith("video/")) {
    c.header("Content-Type", extensionOrContentType);
    return;
  }

  // Otherwise, treat it as an extension
  const contentTypeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };

  const normalizedExt = extensionOrContentType.toLowerCase();
  const contentType = contentTypeMap[normalizedExt];

  if (contentType) {
    c.header("Content-Type", contentType);
  }
}

/**
 * Determines the content-type from transformation parameters or buffer
 * Priority: params.format > buffer detection > original extension
 */
export async function determineContentType(
  params: ReturnType<typeof parseParams>,
  buffer: Buffer | null,
  originalExtension: string | undefined
): Promise<string> {
  // 1. Check if format is explicitly specified in params
  if (params.format) {
    const format = params.format.toLowerCase();
    // Normalize jpg to jpeg
    const normalizedFormat = format === "jpg" ? "jpeg" : format;
    
    const formatMap: Record<string, string> = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      avif: "image/avif",
      gif: "image/gif",
    };
    
    const contentType = formatMap[normalizedFormat];
    if (contentType) {
      return contentType;
    }
  }

  // 2. Try to detect from buffer using sharp (if available and buffer is provided)
  // Skip Sharp detection for video files (Sharp only handles images)
  const isVideoFile = originalExtension && /mp4|mov|webm/i.test(originalExtension);
  
  if (buffer && !isVideoFile) {
    try {
      const sharp = await import("sharp");
      const metadata = await sharp.default(buffer).metadata();
      if (metadata.format) {
        const formatMap: Record<string, string> = {
          jpeg: "image/jpeg",
          jpg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
          avif: "image/avif",
          gif: "image/gif",
          tiff: "image/tiff",
          svg: "image/svg+xml",
        };
        const contentType = formatMap[metadata.format];
        if (contentType) {
          return contentType;
        }
      }
    } catch (error) {
      // If sharp detection fails, fall through to extension-based detection
      // This is expected for non-image files (e.g., videos, corrupted images, etc.)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("unsupported image format")) {
        // This is normal for video files or other non-image formats - skip logging
        // as it's expected behavior when Sharp tries to process non-image buffers
      } else {
        logger.debug({ error, originalExtension }, "Failed to detect format from buffer");
      }
    }
  }

  // 3. Fallback to extension-based detection
  if (originalExtension) {
    const ext = originalExtension.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      avif: "image/avif",
      gif: "image/gif",
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
    };
    return contentTypeMap[ext] || "image/jpeg"; // Default to jpeg
  }

  // Final fallback
  return "image/jpeg";
}

/**
 * Checks cloud cache and returns buffer if found
 */
export async function checkCloudCache(
  storage: CloudStorage | null,
  filePath: string,
  params: ReturnType<typeof parseParams>
): Promise<Buffer | null> {
  if (!storage) return null;

  try {
    if (await storage.exists(filePath, params)) {
      logger.debug({ filePath }, "Serving from cloud cache");
      return await storage.download(filePath, params);
    }
  } catch (error) {
    logger.warn({ error, filePath }, "Cloud cache error, falling back to local cache");
  }

  return null;
}

/**
 * Checks local cache and returns buffer if found
 */
export async function checkLocalCache(
  cachePath: string
): Promise<Buffer | null> {
  if (await existsInCache(cachePath)) {
    logger.debug({ cachePath }, "Serving from local cache");
    return await readFromCache(cachePath);
  }

  return null;
}

/**
 * Verifies that the original file exists (cloud or local)
 */
export async function verifyFileExists(
  storage: CloudStorage | null,
  filePath: string,
  localPath: string
): Promise<{ exists: boolean; isCloud: boolean; error?: string }> {
  if (storage) {
    try {
      const exists = await storage.existsOriginal(filePath);
      if (!exists) {
        return {
          exists: false,
          isCloud: true,
          error: `File not found: ${filePath}. Make sure the file exists in your cloud storage bucket.`,
        };
      }
      return { exists: true, isCloud: true };
    } catch (error) {
      logger.warn({ error, filePath }, "Error checking cloud storage for original file");
      return {
        exists: false,
        isCloud: true,
        error: "Error checking cloud storage",
      };
    }
  } else {
    const exists = existsSync(localPath);
    if (!exists) {
      return {
        exists: false,
        isCloud: false,
        error: `File not found: ${filePath}. Make sure the file exists in the public folder or configure cloud storage.`,
      };
    }
    return { exists: true, isCloud: false };
  }
}

/**
 * Prepares the source file for processing (downloads from cloud if needed)
 */
export async function prepareSourceFile(
  storage: CloudStorage | null,
  filePath: string,
  localPath: string
): Promise<string> {
  if (storage) {
    logger.debug({ filePath }, "Processing from cloud file");
    const sourceBuffer = await storage.downloadOriginal(filePath);

    // Temporarily save the file locally for processing
    const fs = await import("fs");
    const path = await import("path");
    const tempDir = "./temp";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, path.basename(filePath));
    fs.writeFileSync(tempPath, sourceBuffer);
    return tempPath;
  } else {
    logger.debug({ localPath }, "Processing from local file");
    return localPath;
  }
}

/**
 * Processes an image file with optimization
 */
export async function processImage(
  originalPath: string,
  params: ReturnType<typeof parseParams>,
  userAgent: string | undefined,
  acceptHeader: string | undefined,
  compression: Compression
): Promise<{ buffer: Buffer; contentType: string; optimizationResult?: any }> {
  // Basic processing with existing parameters
  const basicBuffer = await transformImage(originalPath, params);

  // Temporary save for advanced optimization
  const fs = await import("fs");
  const tempOptimPath = originalPath + ".temp";
  fs.writeFileSync(tempOptimPath, basicBuffer);

  try {
    // Advanced optimization
    const optimizationResult = await compression.optimizeForDelivery(
      tempOptimPath,
      params,
      userAgent,
      acceptHeader
    );

    const contentType = `image/${optimizationResult.format}`;

    // Cleanup temporary file
    fs.unlinkSync(tempOptimPath);

    return {
      buffer: optimizationResult.buffer,
      contentType,
      optimizationResult,
    };
  } catch (error) {
    logger.warn({ error, originalPath }, "Advanced compression failed, using basic");

    // Determine content type from extension
    const ext = originalPath.split(".").pop()?.toLowerCase();
    let contentType = "image/jpeg"; // default
    if (ext?.match(/png/)) {
      contentType = "image/png";
    } else if (ext?.match(/webp/)) {
      contentType = "image/webp";
    } else if (ext?.match(/avif/)) {
      contentType = "image/avif";
    } else if (ext?.match(/gif/)) {
      contentType = "image/gif";
    }

    // Cleanup in case of error
    try {
      fs.unlinkSync(tempOptimPath);
    } catch {
      // Ignore cleanup errors
    }

    return { buffer: basicBuffer, contentType };
  }
}

/**
 * Processes a video file
 */
export async function processVideo(
  originalPath: string,
  params: ReturnType<typeof parseParams>
): Promise<{ buffer: Buffer; contentType: string }> {
  // Check file size before processing to prevent server crashes
  const fs = await import("fs");
  const stats = fs.statSync(originalPath);
  const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB (increased for 8K videos)
  
  if (stats.size > MAX_VIDEO_SIZE) {
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(1);
    throw new Error(`Video file too large: ${fileSizeMB} MB (maximum allowed: 200 MB)`);
  }
  
  // Get video information for better diagnostics
  try {
    const { getVideoInfo, getResolutionLabel } = await import("../utils/video/video-info");
    const videoInfo = await getVideoInfo(originalPath);
    const resLabel = getResolutionLabel(videoInfo);
    
    logger.info({ 
      resolution: `${videoInfo.width}x${videoInfo.height}`,
      label: resLabel,
      duration: videoInfo.duration.toFixed(1),
      size: (stats.size / 1024 / 1024).toFixed(1) + ' MB',
      codec: videoInfo.codec
    }, "Processing video");
    
    // Warn about large resolutions
    if (videoInfo.width >= 3000) {
      logger.warn({ resolution: resLabel }, 
        "Processing large resolution video - this may take several minutes and use significant memory");
    }
  } catch (error) {
    logger.warn({ error }, "Failed to get video info, proceeding with processing");
  }
  
  const buffer = await transformVideo(originalPath, params);
  const ext = originalPath.split(".").pop()?.toLowerCase();

  const requestedFormat = params.format?.toLowerCase();
  const imageFormats = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);

  // If an image format is explicitly requested, treat output as an image (thumbnail)
  if (requestedFormat && imageFormats.has(requestedFormat)) {
    const normalizedFormat = requestedFormat === "jpg" ? "jpeg" : requestedFormat;

    const imageTypeMap: Record<string, string> = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      avif: "image/avif",
      gif: "image/gif",
    };

    const imageContentType =
      (normalizedFormat && imageTypeMap[normalizedFormat]) || "image/jpeg";

    return { buffer, contentType: imageContentType };
  }

  let contentType = "video/mp4"; // default
  if (ext?.match(/mov/)) {
    contentType = "video/quicktime";
  } else if (ext?.match(/webm/)) {
    contentType = "video/webm";
  }

  return { buffer, contentType };
}

/**
 * Saves processed file to cache (local and/or cloud)
 */
export async function saveToCaches(
  storage: CloudStorage | null,
  filePath: string,
  params: ReturnType<typeof parseParams>,
  cachePath: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const fileSize = buffer.length;
  await SmartCache.trackRequest(filePath, fileSize);
  const shouldKeepLocal = await SmartCache.shouldKeepLocal(filePath, fileSize);

  // Save to local cache (conditionally)
  if (shouldKeepLocal) {
    await saveToCache(cachePath, buffer);
    logger.debug({ filePath }, "Keeping in local cache");
  } else {
    logger.debug({ filePath }, "Skipping local cache");
  }

  // Save to cloud cache (if configured)
  if (storage) {
    try {
      await storage.upload(filePath, params, buffer, contentType);

      if (!shouldKeepLocal) {
        try {
          const fs = await import("fs");
          if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
            logger.debug({ filePath }, "Removed from local cache");
          }
        } catch (error) {
          logger.warn({ error, filePath }, "Failed to cleanup local cache");
        }
      }
    } catch (error) {
      logger.warn({ error, filePath }, "Failed to upload to cloud cache");
    }
  }
}

/**
 * Cleans up temporary files
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    const fs = await import("fs");
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    logger.warn({ error, filePath }, "Failed to cleanup temp file");
  }
}

/**
 * Performs periodic cache cleanup (1% chance)
 */
export async function performPeriodicCacheCleanup(): Promise<void> {
  if (Math.random() < 0.01) {
    // 1% chance of cache cleanup
    if (await SmartCache.shouldCleanupCache()) {
      logger.info("Starting cache cleanup...");
      await SmartCache.performCleanup();
    }
  }
}

