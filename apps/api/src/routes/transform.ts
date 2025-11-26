import { Hono } from "hono";
import { getCachePath } from "../utils/cache";
import { parseParams } from "../utils/parser";
import { createStorageClient } from "../utils/storage/index";
import { Compression } from "../utils/image/compression";
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

  const cachePath = getCachePath(path);
  const localPath = `./public/${filePath}`;
  const ext = filePath.split(".").pop();

  // 1. Check cloud cache first (if configured)
  const cloudCacheBuffer = await checkCloudCache(storage, filePath, params);
  if (cloudCacheBuffer) {
    setContentTypeHeader(c, ext);
    return c.body(new Uint8Array(cloudCacheBuffer));
  }

  // 2. Check local cache
  const localCacheBuffer = await checkLocalCache(cachePath);
  if (localCacheBuffer) {
    setContentTypeHeader(c, ext);
    return c.body(new Uint8Array(localCacheBuffer));
  }

  // 3. Verify original file exists
  const fileCheck = await verifyFileExists(storage, filePath, localPath);
  if (!fileCheck.exists) {
    console.error(`File not found: ${filePath}`);
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
      const userAgent = c.req.header("User-Agent");
      const acceptHeader = c.req.header("Accept");
      const result = await processImage(
        sourcePath,
        params,
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

    // Save to caches
    await saveToCaches(storage, filePath, params, cachePath, buffer, contentType);

    // Periodic cache cleanup
    await performPeriodicCacheCleanup();

    // Set response headers
    setContentTypeHeader(c, ext);

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
    console.error("Processing error:", error);
    return c.text(
      `Processing failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      500
    );
  }
});

export default t;
