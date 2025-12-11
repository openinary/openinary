import { Hono } from "hono";
import { createStorageClient } from "../utils/storage/index";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";
import { getUniqueFilePath } from "../utils/get-unique-file-path";
import { transformVideo } from "../utils/video/index";
import { saveToCache, getCachePath } from "../utils/cache";
import type { VideoTransformParams } from "shared";

const upload = new Hono();
const storage = createStorageClient();

// File size limit: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 52,428,800 bytes

// Allowed file extensions and MIME types
const ALLOWED_TYPES = {
  // Images
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
  // Videos
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
};

interface UploadResult {
  filename: string;
  path: string;
  size: number;
  url: string;
}

interface UploadError {
  filename: string;
  error: string;
}

/**
 * Sanitizes file path to prevent directory traversal attacks
 */
function sanitizePath(filepath: string): string {
  // Remove leading slashes and any parent directory references
  let sanitized = filepath.replace(/^\/+/, '').replace(/\.\./g, '');
  
  // Normalize path separators to forward slashes
  sanitized = sanitized.replace(/\\/g, '/');
  
  // Remove any remaining dangerous patterns
  sanitized = sanitized.replace(/\/+/g, '/'); // Multiple slashes
  
  return sanitized;
}

/**
 * Validates file type based on MIME type and extension
 */
function validateFileType(filename: string, mimeType: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const allowedExtensions = ALLOWED_TYPES[mimeType as keyof typeof ALLOWED_TYPES];
  
  if (!allowedExtensions) {
    return false;
  }
  
  return allowedExtensions.includes(ext);
}

/**
 * Gets the content type from filename extension
 */
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  
  for (const [contentType, extensions] of Object.entries(ALLOWED_TYPES)) {
    if (extensions.includes(ext)) {
      return contentType;
    }
  }
  
  return "application/octet-stream";
}

/**
 * Saves file to local storage (./public/)
 */
async function saveFileLocally(filePath: string, buffer: Buffer): Promise<void> {
  const fullPath = path.join("./public", filePath);
  const dir = path.dirname(fullPath);
  
  // Create parent directories if they don't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(fullPath, buffer);
}

async function localFileExists(filePath: string): Promise<boolean> {
  const fullPath = path.join("./public", filePath);
  return fs.existsSync(fullPath);
}

/**
 * Pre-generate default thumbnail for a video
 * This ensures the thumbnail is available when the frontend requests it
 */
async function preGenerateThumbnail(filePath: string, storage: ReturnType<typeof createStorageClient>): Promise<void> {
  try {
    // Define default thumbnail parameters (matching frontend defaults)
    // t_true (thumbnail), tt_5 (time at 5s), f_webp, w_500, h_500, c_fill, q_80
    const thumbnailParams: VideoTransformParams = {
      thumbnail: true,
      thumbnailTime: 5,
      format: 'webp',
      width: 500,
      height: 500,
      crop: 'fill',
      quality: 80
    };

    // Build cache path for thumbnail (same as what frontend will request)
    const transformPath = `/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${filePath}`;
    const cachePath = getCachePath(transformPath);

    // Get source path
    let sourcePath: string;
    if (storage) {
      // Download from cloud to temp file
      const sourceBuffer = await storage.downloadOriginal(filePath);
      const tempDir = "./temp";
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      sourcePath = path.join(tempDir, path.basename(filePath));
      fs.writeFileSync(sourcePath, sourceBuffer);
    } else {
      // Use local file
      sourcePath = path.join("./public", filePath);
    }

    logger.debug({ filePath, cachePath }, "Pre-generating thumbnail");

    // Generate thumbnail
    const thumbnailBuffer = await transformVideo(sourcePath, thumbnailParams);

    // Save to cache
    await saveToCache(cachePath, thumbnailBuffer);

    // Upload to cloud cache if configured
    if (storage) {
      try {
        await storage.upload(filePath, thumbnailParams, thumbnailBuffer, 'image/webp');
        logger.debug({ filePath }, "Thumbnail uploaded to cloud cache");
      } catch (error) {
        logger.warn({ error, filePath }, "Failed to upload thumbnail to cloud cache");
      }

      // Clean up temp file
      try {
        fs.unlinkSync(sourcePath);
      } catch (error) {
        logger.warn({ error, sourcePath }, "Failed to cleanup temp file");
      }
    }

    logger.info({ filePath, cachePath }, "Thumbnail pre-generated successfully");
  } catch (error) {
    logger.error({ error, filePath }, "Failed to pre-generate thumbnail");
    // Don't throw - this is a background operation
  }
}

/**
 * POST /upload - Upload single or multiple files
 */
upload.post("/", async (c) => {
  try {
    const formData = await c.req.formData();
    const files = formData.getAll("files");

    if (files.length === 0) {
      return c.json({ success: false, error: "No files provided" }, 400);
    }

    const successfulUploads: UploadResult[] = [];
    const failedUploads: UploadError[] = [];

    for (const file of files) {
      if (!(file instanceof File)) {
        failedUploads.push({
          filename: "unknown",
          error: "Invalid file object",
        });
        continue;
      }

      // Get relative path if available (for folder uploads), otherwise use filename
      const rawPath = (file as any).webkitRelativePath || file.name;
      const rawSanitizedPath = sanitizePath(rawPath);
      const filename = path.basename(rawSanitizedPath);
      const mimeType = file.type;
      const fileSize = file.size;

      // Validate file size
      if (fileSize > MAX_FILE_SIZE) {
        failedUploads.push({
          filename: rawSanitizedPath,
          error: `File size exceeds limit of 50MB (size: ${(fileSize / 1024 / 1024).toFixed(2)}MB)`,
        });
        continue;
      }

      // Validate file type
      if (!validateFileType(filename, mimeType)) {
        failedUploads.push({
          filename: rawSanitizedPath,
          error: `Invalid file type: ${mimeType}. Allowed types: images (jpg, png, webp, avif, gif) and videos (mp4, mov, webm)`,
        });
        continue;
      }

      try {
        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Get content type
        const contentType = getContentType(filename);

        // Compute a unique file path to avoid overwriting existing files
        let finalPath = rawSanitizedPath;

        if (storage) {
          finalPath = await getUniqueFilePath(rawSanitizedPath, async (p) =>
            storage.existsOriginalPath(p)
          );
        } else {
          finalPath = await getUniqueFilePath(rawSanitizedPath, localFileExists);
        }

        // Upload based on storage configuration
        if (storage) {
          // Upload to cloud storage with full (unique) path
          const url = await storage.uploadOriginal(finalPath, buffer, contentType);
          logger.info({ originalPath: rawSanitizedPath, finalPath, url }, "Uploaded to cloud");
          
          successfulUploads.push({
            filename,
            path: finalPath,
            size: fileSize,
            url: `/t/${finalPath}`,
          });

          // Pre-generate thumbnail for videos (non-blocking)
          if (contentType.startsWith('video/')) {
            preGenerateThumbnail(finalPath, storage).catch((error) => {
              logger.error({ error, finalPath }, "Background thumbnail generation failed");
            });
          }
        } else {
          // Save locally with full path
          await saveFileLocally(finalPath, buffer);
          logger.info({ originalPath: rawSanitizedPath, finalPath }, "Saved locally");
          
          successfulUploads.push({
            filename,
            path: finalPath,
            size: fileSize,
            url: `/t/${finalPath}`,
          });

          // Pre-generate thumbnail for videos (non-blocking)
          if (contentType.startsWith('video/')) {
            preGenerateThumbnail(finalPath, storage).catch((error) => {
              logger.error({ error, finalPath }, "Background thumbnail generation failed");
            });
          }
        }
      } catch (error) {
        logger.error({ error, originalPath: rawSanitizedPath }, "Failed to upload");
        failedUploads.push({
          filename: rawSanitizedPath,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Determine response status
    const allSuccessful = failedUploads.length === 0;
    const someSuccessful = successfulUploads.length > 0;

    if (allSuccessful) {
      return c.json({
        success: true,
        files: successfulUploads,
      });
    } else if (someSuccessful) {
      return c.json({
        success: true,
        files: successfulUploads,
        errors: failedUploads,
      }, 207); // Multi-Status
    } else {
      return c.json({
        success: false,
        errors: failedUploads,
      }, 400);
    }
  } catch (error) {
    logger.error({ error }, "Upload error");
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default upload;




