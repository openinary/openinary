import { existsSync, statSync } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import type { CloudStorage } from "../utils/storage/index";
import { transformImage } from "../utils/image/index";
import { transformVideo } from "../utils/video/index";
import type { Compression } from "../utils/image/compression";
import logger, { serializeError } from "../utils/logger";
import { existsInCache, saveToCache, readFromCache, SmartCache } from "../utils/cache";
import type { CombindedTransformParams, ImageTransformParams, VideoTransformParams } from "../types";
import { contentTypeForFormat, determineOutputFormat } from "../url/media-types";
import type { EnginePaths } from "../config/paths";
import type { VideoSettings } from "../utils/video/config";

/** The cloud-cached derivative, or null (a storage error is a miss). */
export async function checkCloudCache(
  storage: CloudStorage | null,
  filePath: string,
  params: CombindedTransformParams,
): Promise<Buffer | null> {
  if (!storage) return null;
  try {
    if (await storage.exists(filePath, params)) {
      return await storage.download(filePath, params);
    }
  } catch (error) {
    logger.warn(
      { error: serializeError(error), filePath },
      "Cloud cache error, falling back to local cache",
    );
  }
  return null;
}

export async function checkLocalCache(cachePath: string): Promise<Buffer | null> {
  return (await existsInCache(cachePath)) ? readFromCache(cachePath) : null;
}

/**
 * Null when the original exists, else the not-found message. Throws when the
 * answer is unknown (storage or network error), which must not read as
 * "missing".
 */
export async function findSource(
  storage: CloudStorage | null,
  publicDir: string,
  filePath: string,
  sourceUrl?: string,
): Promise<string | null> {
  if (sourceUrl) {
    // Checked rather than trusted: a URL that has expired, or names an object
    // since deleted, has to read as "not found" right here. Left unchecked it
    // surfaces much later as a truncated download inside sharp or ffmpeg,
    // where the error says nothing about the real cause.
    //
    // One byte over GET, never HEAD. A presigned URL authorizes exactly one
    // method - SigV4 signs the verb into the string it signs - so a URL issued
    // for GET answers 403 to a HEAD, which would read as "missing" for every
    // object that exists. A range still 404s on an absent key.
    let response: Response;
    try {
      response = await fetch(sourceUrl, { headers: { Range: "bytes=0-0" } });
    } catch (error) {
      logger.warn({ error: serializeError(error), filePath }, "Error checking remote source URL");
      throw new Error("Error checking source URL");
    }
    // Nothing reads the byte; releasing it keeps the connection reusable.
    await response.body?.cancel();
    return response.ok
      ? null
      : `File not found: ${filePath}. The source URL answered ${response.status}.`;
  }
  if (storage) {
    let exists: boolean;
    try {
      exists = await storage.existsOriginal(filePath);
    } catch (error) {
      logger.warn(
        { error: serializeError(error), filePath },
        "Error checking cloud storage for original file",
      );
      throw new Error("Error checking cloud storage");
    }
    return exists
      ? null
      : `File not found: ${filePath}. Make sure the file exists in your cloud storage bucket.`;
  }
  return existsSync(path.join(publicDir, filePath))
    ? null
    : `File not found: ${filePath}. Make sure the file exists in the public folder or configure cloud storage.`;
}

export async function processImage(
  originalPath: string,
  params: CombindedTransformParams,
  userAgent: string | undefined,
  acceptHeader: string | undefined,
  compression: Compression,
  tempDir: string,
): Promise<{ buffer: Buffer; contentType: string; optimizationResult?: any }> {
  const basicBuffer = await transformImage(originalPath, params as ImageTransformParams);

  // Compression reads from a path. In temp, not next to the original: without
  // a bucket the original sits in the public folder.
  await mkdir(tempDir, { recursive: true });
  const tempOptimPath = path.join(tempDir, `${crypto.randomUUID()}-${path.basename(originalPath)}.temp`);
  await writeFile(tempOptimPath, basicBuffer);
  try {
    const optimizationResult = await compression.optimizeForDelivery(
      tempOptimPath,
      params as ImageTransformParams,
      userAgent,
      acceptHeader,
    );
    return {
      buffer: optimizationResult.buffer,
      contentType: `image/${optimizationResult.format}`,
      optimizationResult,
    };
  } catch (error) {
    logger.warn(
      { error: serializeError(error), originalPath },
      "Advanced compression failed, using basic",
    );
    const ext = originalPath.split(".").pop()?.toLowerCase();
    // psd is decoded to png before sharp sees it
    const format = ext === "psd" ? "png" : ext ?? "jpg";
    const contentType = contentTypeForFormat(format);
    return {
      buffer: basicBuffer,
      contentType: contentType.startsWith("image/") ? contentType : "image/jpeg",
    };
  } finally {
    await unlink(tempOptimPath).catch(() => {});
  }
}

const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

/** A video thumbnail, extracted synchronously like an image transform. */
export async function processVideo(
  originalPath: string,
  params: VideoTransformParams,
  run: { storage: CloudStorage | null; paths: EnginePaths; settings: VideoSettings },
): Promise<{ buffer: Buffer; contentType: string }> {
  const { size } = statSync(originalPath);
  if (size > MAX_VIDEO_SIZE) {
    throw new Error(
      `Video file too large: ${(size / 1024 / 1024).toFixed(1)} MB (maximum allowed: 200 MB)`,
    );
  }

  try {
    const { getVideoInfo, getResolutionLabel } = await import("../utils/video/video-info.js");
    const videoInfo = await getVideoInfo(originalPath);
    const resLabel = getResolutionLabel(videoInfo);
    logger.info(
      {
        resolution: `${videoInfo.width}x${videoInfo.height}`,
        label: resLabel,
        duration: videoInfo.duration.toFixed(1),
        size: `${(size / 1024 / 1024).toFixed(1)} MB`,
        codec: videoInfo.codec,
      },
      "Processing video",
    );
    if (videoInfo.width >= 3000) {
      logger.warn(
        { resolution: resLabel },
        "Processing large resolution video - this may take several minutes and use significant memory",
      );
    }
  } catch (error) {
    logger.warn({ error: serializeError(error) }, "Failed to get video info, proceeding with processing");
  }

  const buffer = await transformVideo(originalPath, params, run);
  const sourceExt = originalPath.split(".").pop()?.toLowerCase();
  const { format } = determineOutputFormat(sourceExt, params.format);
  return { buffer, contentType: contentTypeForFormat(format) };
}

/**
 * Stores a derivative in the cloud cache and, when it is popular, on local
 * disk. Once the cloud holds it, a local copy of one no longer popular goes.
 */
export async function saveToCaches(
  storage: CloudStorage | null,
  filePath: string,
  params: CombindedTransformParams,
  cachePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  SmartCache.trackRequest(filePath);
  const keepLocal = SmartCache.shouldKeepLocal(filePath);
  if (keepLocal) await saveToCache(cachePath, buffer);
  if (!storage) return;
  try {
    await storage.upload(filePath, params, buffer, contentType);
  } catch (error) {
    logger.warn({ error: serializeError(error), filePath }, "Failed to upload to cloud cache");
    return;
  }
  if (!keepLocal) await unlink(cachePath).catch(() => {});
}
