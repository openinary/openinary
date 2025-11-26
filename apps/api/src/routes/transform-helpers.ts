import { Context } from "hono";
import { existsSync } from "fs";
import { CloudStorage } from "../utils/storage/index";
import { parseParams } from "../utils/parser";
import { transformImage } from "../utils/image/index";
import { transformVideo } from "../utils/video";
import { Compression } from "../utils/image/compression";
import logger from "../utils/logger";
import {
  existsInCache,
  saveToCache,
  readFromCache,
  SmartCache,
} from "../utils/cache";

/**
 * Sets the Content-Type header based on file extension
 */
export function setContentTypeHeader(
  c: Context,
  extension: string | undefined
): void {
  if (!extension) return;

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

  const normalizedExt = extension.toLowerCase();
  const contentType = contentTypeMap[normalizedExt];

  if (contentType) {
    c.header("Content-Type", contentType);
  }
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
  const buffer = await transformVideo(originalPath, params);
  const ext = originalPath.split(".").pop()?.toLowerCase();

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

