import { Hono } from "hono";
import {
  getCachePath,
  existsInCache,
  saveToCache,
  readFromCache,
  SmartCache,
} from "../utils/cache";
import { parseParams } from "../utils/parser";
import { transformImage } from "../utils/image/index";
import { transformVideo } from "../utils/video";
import { createStorageClient } from "../utils/storage";
import { Compression } from "../utils/image/compression";
import { existsSync } from "fs";

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
  let originalPath = `./public/${filePath}`;
  const ext = filePath.split(".").pop();

  // Function to set Content-Type
  const setContentType = (extension: string) => {
    if (extension?.match(/jpe?g|jpeg/)) {
      c.header("Content-Type", "image/jpeg");
    } else if (extension?.match(/png/)) {
      c.header("Content-Type", "image/png");
    } else if (extension?.match(/webp/)) {
      c.header("Content-Type", "image/webp");
    } else if (extension?.match(/avif/)) {
      c.header("Content-Type", "image/avif");
    } else if (extension?.match(/gif/)) {
      c.header("Content-Type", "image/gif");
    } else if (extension?.match(/mp4/)) {
      c.header("Content-Type", "video/mp4");
    } else if (extension?.match(/mov/)) {
      c.header("Content-Type", "video/quicktime");
    } else if (extension?.match(/webm/)) {
      c.header("Content-Type", "video/webm");
    }
  };

  // 1. Check cloud cache first (if configured)
  if (storage) {
    try {
      if (await storage.exists(filePath, params)) {
        console.log(`📦 Serving from cloud cache: ${filePath}`);
        const buffer = await storage.download(filePath, params);
        setContentType(ext || "");
        return c.body(buffer);
      }
    } catch (error) {
      console.warn("Cloud cache error, falling back to local cache:", error);
    }
  }

  // 2. Check local cache
  if (await existsInCache(cachePath)) {
    console.log(`💾 Serving from local cache: ${filePath}`);
    const cachedBuffer = await readFromCache(cachePath);
    setContentType(ext || "");
    return c.body(cachedBuffer);
  }

  // 3. Check if original file exists
  let fileExistsLocally = false;
  let fileExistsInCloud = false;

  if (storage) {
    // If a cloud provider is configured, use EXCLUSIVELY the cloud
    try {
      // Checking cloud for original file
      fileExistsInCloud = await storage.existsOriginal(filePath);
    } catch (error) {
      console.warn("Error checking cloud storage for original file:", error);
    }

    if (!fileExistsInCloud) {
      console.error(`❌ File not found in cloud storage: ${filePath}`);
      return c.text(
        `File not found: ${filePath}. Make sure the file exists in your cloud storage bucket.`,
        404
      );
    }
  } else {
    // If no cloud provider is configured, use local files
    fileExistsLocally = existsSync(originalPath);

    if (!fileExistsLocally) {
      console.error(`❌ File not found locally: ${filePath}`);
      return c.text(
        `File not found: ${filePath}. Make sure the file exists in the public folder or configure cloud storage.`,
        404
      );
    }
  }

  // 4. Processing and storage
  try {
    let buffer;
    let contentType = "";
    let optimizationResult;

    // Determine file source
    if (storage) {
      // Cloud provider configured: use EXCLUSIVELY the cloud
      console.log(`☁️ Processing from cloud file: ${filePath}`);
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
      originalPath = tempPath;
    } else {
      // No cloud provider: use local files
      console.log(`📁 Processing from local file: ${originalPath}`);
    }

    if (ext?.match(/jpe?g|png|webp|avif|gif/)) {
      const userAgent = c.req.header("User-Agent");
      const acceptHeader = c.req.header("Accept");

      // Basic processing with existing parameters
      const basicBuffer = await transformImage(originalPath, params);

      // Temporary save for advanced optimization
      const fs = await import("fs");
      const tempOptimPath = originalPath + ".temp";
      fs.writeFileSync(tempOptimPath, basicBuffer);

      try {
        // Advanced optimization
        optimizationResult = await compression.optimizeForDelivery(
          tempOptimPath,
          params,
          userAgent,
          acceptHeader
        );

        buffer = optimizationResult.buffer;
        contentType = `image/${optimizationResult.format}`;

        // Cleanup temporary file
        fs.unlinkSync(tempOptimPath);
      } catch (error) {
        console.warn("Advanced compression failed, using basic:", error);
        buffer = basicBuffer;
        if (ext?.match(/jpe?g|jpeg/)) {
          contentType = "image/jpeg";
        } else if (ext?.match(/png/)) {
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
        } catch {}
      }
    } else if (ext?.match(/mp4|mov|webm/)) {
      buffer = await transformVideo(originalPath, params);
      if (ext?.match(/mp4/)) {
        contentType = "video/mp4";
      } else if (ext?.match(/mov/)) {
        contentType = "video/quicktime";
      } else if (ext?.match(/webm/)) {
        contentType = "video/webm";
      }
    } else {
      return c.text("Unsupported file type", 400);
    }

    // Clean up temporary file if used (when cloud provider configured)
    if (storage) {
      try {
        const fs = await import("fs");
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }
      } catch (error) {
        console.warn("Failed to cleanup temp file:", error);
      }
    }

    const fileSize = buffer.length;
    await SmartCache.trackRequest(filePath, fileSize);
    const shouldKeepLocal = await SmartCache.shouldKeepLocal(
      filePath,
      fileSize
    );

    // Save to local cache (conditionally)
    if (shouldKeepLocal) {
      await saveToCache(cachePath, buffer);
      console.log(`💾 Keeping in local cache: ${filePath}`);
    } else {
      console.log(`🗑️ Skipping local cache: ${filePath}`);
    }

    // Save to cloud cache (if configured)
    if (storage) {
      try {
        const cloudUrl = await storage.upload(
          filePath,
          params,
          buffer,
          contentType
        );

        if (!shouldKeepLocal) {
          try {
            const fs = await import("fs");
            if (fs.existsSync(cachePath)) {
              fs.unlinkSync(cachePath);
              console.log(`🧹 Removed from local cache: ${filePath}`);
            }
          } catch (error) {
            console.warn("Failed to cleanup local cache:", error);
          }
        }
      } catch (error) {
        console.warn("Failed to upload to cloud cache:", error);
      }
    }

    if (Math.random() < 0.01) {
      // 1% chance of cache cleanup
      if (await SmartCache.shouldCleanupCache()) {
        console.log("🧹 Starting cache cleanup...");
        await SmartCache.performCleanup();
      }
    }

    setContentType(ext || "");

    if (optimizationResult) {
      c.header("X-Original-Size", optimizationResult.originalSize.toString());
      c.header("X-Optimized-Size", optimizationResult.optimizedSize.toString());
      c.header(
        "X-Compression-Ratio",
        optimizationResult.compressionRatio.toFixed(2)
      );
      c.header("X-Savings-Percent", optimizationResult.savings.toFixed(1));
    }

    return c.body(buffer);
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
