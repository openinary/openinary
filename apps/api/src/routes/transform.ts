import { Hono } from "hono";
import { getCachePath } from "../utils/cache";
import { parseParams } from "../utils/parser";
import { createStorageClient } from "../utils/storage/index";
import { Compression } from "../utils/image/compression";
import logger from "../utils/logger";
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

const t = new Hono();
const storage = createStorageClient();
const compression = new Compression();

t.get("/*", async (c) => {
  const path = c.req.path;
  const segments = path.split("/").slice(2); // Remove '/t' prefix
  const params = parseParams(path);

  // Filter out parameter segments to get the actual file path
  const fileSegments = segments.filter((segment) => !segment.includes(":"));
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
  
  // 1. Check cloud cache first (if configured)
  const cloudCacheBuffer = await checkCloudCache(storage, filePath, effectiveParams);
  if (cloudCacheBuffer) {
    // For cloud cache, we trust it has the right format since it's based on params
    const contentType = await determineContentType(effectiveParams, cloudCacheBuffer, ext);
    setContentTypeHeader(c, contentType);
    return c.body(new Uint8Array(cloudCacheBuffer));
  }

  // 2. Check local cache (now includes format in key when format is auto-determined)
  const localCacheBuffer = await checkLocalCache(cachePath);
  if (localCacheBuffer) {
    const contentType = await determineContentType(effectiveParams, localCacheBuffer, ext);
    setContentTypeHeader(c, contentType);
    return c.body(new Uint8Array(localCacheBuffer));
  }

  // 3. Verify original file exists
  const fileCheck = await verifyFileExists(storage, filePath, localPath);
  if (!fileCheck.exists) {
    logger.error({ filePath }, "File not found");
    return c.text(fileCheck.error || "File not found", 404);
  }

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
      const result = await processVideo(sourcePath, params);
      buffer = result.buffer;
      contentType = result.contentType;
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
    return c.text(
      `Processing failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      500
    );
  }
});

export default t;
