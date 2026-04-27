import { Context, Hono } from "hono";
import { createStorageClient } from "../utils/storage/index";
import fs from "fs";
import path from "path";
import logger, { serializeError } from "../utils/logger";
import { getUniqueFilePath } from "../utils/get-unique-file-path";
import { getCachePath } from "../utils/cache";
import { videoJobQueue } from "../utils/video-job-queue";
import { parseParams } from "../utils/parser";
import {
  THUMBNAIL_PRIORITY,
  TRANSFORMATION_PRIORITY,
} from "../utils/video/config";
import { TransformService } from "../services/transform.service";
import heicConvert from 'heic-convert';

const upload = new Hono();
const storage = createStorageClient();
const transformService = new TransformService();

// File size limit: configurable via MAX_FILE_SIZE_MB env var, defaults to 50MB
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB ?? "50", 10) || 50) * 1024 * 1024;
const MAX_PREWARM_TRANSFORMATIONS = 20;

// Allowed file extensions and MIME types
const ALLOWED_TYPES = {
  // Images
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
  "image/heic" : ['.heic', '.heif'],
  "image/heif" : ['.heic', '.heif'],
  "image/vnd.adobe.photoshop": [".psd"],
  "application/octet-stream": [".psd"],
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
  prewarmedUrls?: string[];
  prewarmErrors?: string[];
  queuedTransformationUrls?: string[];
  queueErrors?: string[];
}

interface UploadError {
  filename: string;
  error: string;
}

/**
 * Parse and validate optional upload-time transformation prewarm definitions.
 *
 * Supported input formats:
 * - multiple `transformations` fields (one transform segment per field)
 * - a single JSON array string in `transformations`
 * - a single string with transforms separated by newlines or semicolons
 */
function parsePrewarmTransformations(formData: FormData): string[] {
  const rawFields = formData
    .getAll("transformations")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  if (rawFields.length === 0) {
    return [];
  }

  const parsed: string[] = [];

  for (const rawField of rawFields) {
    if (rawField.startsWith("[")) {
      let jsonValues: unknown;
      try {
        jsonValues = JSON.parse(rawField);
      } catch {
        throw new Error(
          "Invalid transformations JSON. Expected an array of transformation strings.",
        );
      }

      if (!Array.isArray(jsonValues)) {
        throw new Error(
          "Invalid transformations field. JSON value must be an array.",
        );
      }

      for (const value of jsonValues) {
        if (typeof value !== "string") {
          throw new Error(
            "Invalid transformations entry. Each transformation must be a string.",
          );
        }
        parsed.push(value.trim());
      }
      continue;
    }

    const splitValues = rawField
      .split(/\r?\n|;/g)
      .map((value) => value.trim())
      .filter(Boolean);

    parsed.push(...splitValues);
  }

  const normalized = parsed
    .map((value) =>
      value
        .replace(/^\/+/, "")
        .replace(/^t\//, "")
        .replace(/^\/t\//, ""),
    )
    .map((value) => value.replace(/^,+|,+$/g, "").trim())
    .filter(Boolean);

  if (normalized.length > MAX_PREWARM_TRANSFORMATIONS) {
    throw new Error(
      `Too many transformations requested for prewarm. Maximum is ${MAX_PREWARM_TRANSFORMATIONS}.`,
    );
  }

  const unique = Array.from(new Set(normalized));

  for (const transformSegment of unique) {
    if (transformSegment.includes("/")) {
      throw new Error(
        `Invalid transformation "${transformSegment}". Use only the transformation segment (e.g. "w_800,h_600,f_webp").`,
      );
    }

    const params = parseParams(`/t/${transformSegment}/validation.jpg`);
    if (Object.keys(params).length === 0) {
      throw new Error(
        `Invalid transformation "${transformSegment}". No valid transformation parameters found.`,
      );
    }
  }

  return unique;
}

async function prewarmImageTransformations(
  c: Context,
  filePath: string,
  transformations: string[],
): Promise<{ prewarmedUrls: string[]; prewarmErrors: string[] }> {
  const prewarmedUrls: string[] = [];
  const prewarmErrors: string[] = [];

  for (const transformSegment of transformations) {
    const transformPath = `/t/${transformSegment}/${filePath}`;

    try {
      const result = await transformService.transform({
        path: transformPath,
        userAgent: c.req.header("User-Agent") ?? "",
        acceptHeader: c.req.header("Accept"),
        context: c,
      });

      const errorText = result.buffer.toString();
      const failed =
        result.contentType === "text/plain" && errorText.includes("failed");

      if (failed) {
        const message = errorText.replace(/^Processing failed:\s*/i, "");
        prewarmErrors.push(`${transformSegment}: ${message}`);
        continue;
      }

      prewarmedUrls.push(transformPath);
    } catch (error) {
      prewarmErrors.push(
        `${transformSegment}: ${error instanceof Error ? error.message : "Unknown prewarm error"}`,
      );
    }
  }

  return { prewarmedUrls, prewarmErrors };
}

/**
 * Sanitizes file path to prevent directory traversal attacks
 */
function sanitizePath(filepath: string): string {
  // Remove leading slashes and any parent directory references
  let sanitized = filepath.replace(/^\/+/, "").replace(/\.\./g, "");

  // Normalize path separators to forward slashes
  sanitized = sanitized.replace(/\\/g, "/");

  // Remove any remaining dangerous patterns
  sanitized = sanitized.replace(/\/+/g, "/"); // Multiple slashes

  return sanitized;
}

/**
 * Validates file type based on MIME type and extension
 */
function validateFileType(filename: string, mimeType: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const allowedExtensions =
    ALLOWED_TYPES[mimeType as keyof typeof ALLOWED_TYPES];

  if (!allowedExtensions) {
    return false;
  }

  return allowedExtensions.includes(ext);
}

/**
 * Saves file to local storage (./public/)
 */
async function saveFileLocally(
  filePath: string,
  buffer: Buffer,
): Promise<void> {
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
 * Queue thumbnail generation for a video
 * Uses high priority to ensure thumbnails are generated first
 */
async function queueThumbnailGeneration(
  filePath: string,
  storage: ReturnType<typeof createStorageClient>,
): Promise<void> {
  try {
    // Define default thumbnail parameters (matching frontend defaults)
    // t_true (thumbnail), tt_5 (time at 5s), f_webp, w_500, h_500, c_fill, q_80
    const transformPath = `/t/t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80/${filePath}`;
    const params = parseParams(transformPath);
    const cachePath = getCachePath(transformPath);

    // Get source path
    const sourcePath = storage
      ? `./temp/${path.basename(filePath)}`
      : path.join("./public", filePath);

    // Add to queue with HIGH priority for thumbnails
    const jobId = await videoJobQueue.addJob(
      filePath,
      params,
      cachePath,
      sourcePath,
      storage,
      THUMBNAIL_PRIORITY,
    );

    logger.info(
      { filePath, jobId, priority: THUMBNAIL_PRIORITY },
      "Thumbnail generation queued",
    );
  } catch (error) {
    logger.error(
      { error: serializeError(error), filePath },
      "Failed to queue thumbnail generation",
    );
    // Don't throw - this is a background operation
  }
}

async function queueVideoTransformations(
  filePath: string,
  transformations: string[],
  storage: ReturnType<typeof createStorageClient>,
): Promise<{ queuedTransformationUrls: string[]; queueErrors: string[] }> {
  const queuedTransformationUrls: string[] = [];
  const queueErrors: string[] = [];

  for (const transformSegment of transformations) {
    const transformPath = `/t/${transformSegment}/${filePath}`;
    const params = parseParams(transformPath);

    if (Object.keys(params).length === 0) {
      queueErrors.push(
        `${transformSegment}: no valid transformation parameters found`,
      );
      continue;
    }

    const cachePath = getCachePath(transformPath);
    const sourcePath = storage
      ? `./temp/${path.basename(filePath)}`
      : path.join("./public", filePath);
    const isThumbnailRequest =
      params.thumbnail === "true" || params.thumbnail === "1";
    const priority = isThumbnailRequest
      ? THUMBNAIL_PRIORITY
      : TRANSFORMATION_PRIORITY;

    try {
      const jobId = await videoJobQueue.addJob(
        filePath,
        params,
        cachePath,
        sourcePath,
        storage,
        priority,
      );

      queuedTransformationUrls.push(transformPath);
      logger.info(
        { filePath, transformSegment, jobId, priority },
        "Video transformation queued",
      );
    } catch (error) {
      queueErrors.push(
        `${transformSegment}: ${error instanceof Error ? error.message : "Unknown queue error"}`,
      );
      logger.error(
        { error: serializeError(error), filePath, transformSegment },
        "Failed to queue video transformation",
      );
    }
  }

  return { queuedTransformationUrls, queueErrors };
}

async function normalizeUploadFormat(
  buffer: Buffer,
  mimeType: string,
  filePath: string,
): Promise<{ buffer: Buffer; mimeType: string; path: string, fileName: string }>{
  let normalizedBuffer;
  let normalizedMimeType;
  let normalizedPath;
  if (mimeType === "image/heic" || mimeType === "image/heif"){
    try{
      normalizedBuffer = await heicConvert({
                buffer: buffer as any,
                format: 'JPEG',
                quality: 1
      });

      normalizedMimeType = "image/jpeg";
      normalizedPath = filePath.replace(/\.(heic|heif)$/i, '.jpg');
    }catch {
      throw new Error(`Failed to convert file from ${mimeType} to image/jpeg`);
    }

  } else {
    normalizedBuffer = buffer;
    normalizedMimeType = mimeType;
    normalizedPath = filePath;
  }
  return {
      buffer: normalizedBuffer as any,
      mimeType : normalizedMimeType,
      path : normalizedPath,
      fileName : path.basename(normalizedPath)
  }
}

/**
 * POST /upload - Upload single or multiple files
 */
upload.post("/", async (c) => {
  try {
    const formData = await c.req.formData();
    const uploadFolder = formData.get("folder") as string | null;
    const files = formData.getAll("files");
    const customNames = formData.getAll("names");
    let prewarmTransformations: string[] = [];
    try {
      prewarmTransformations = parsePrewarmTransformations(formData);
    } catch (error) {
      return c.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Invalid transformations field",
        },
        400,
      );
    }

    if (files.length === 0) {
      return c.json({ success: false, error: "No files provided" }, 400);
    }

    const successfulUploads: UploadResult[] = [];
    const failedUploads: UploadError[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!(file instanceof File)) {
        failedUploads.push({
          filename: "unknown",
          error: "Invalid file object",
        });
        continue;
      }

      // Get relative path if available (for folder uploads), otherwise use filename
      const customName = customNames[i] as string | undefined;
      const rawPath =
        (uploadFolder || "") +
        "/" +
        (customName || (file as any).webkitRelativePath || file.name);
      const rawSanitizedPath = sanitizePath(rawPath);
      const filename = path.basename(rawSanitizedPath);
      const mimeType = file.type;
      const fileSize = file.size;

      // Validate file size
      if (fileSize > MAX_FILE_SIZE) {
        failedUploads.push({
          filename: rawSanitizedPath,
          error: `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB (size: ${(fileSize / 1024 / 1024).toFixed(2)}MB)`,
        });
        continue;
      }

      // Validate file type
      if (!validateFileType(filename, mimeType)) {
        failedUploads.push({
          filename: rawSanitizedPath,
          error: `Invalid file type: ${mimeType}. Allowed types: images (jpg, jpeg, png, webp, avif, gif, heic, heif, psd) and videos (mp4, mov, webm)`,
        });
        continue;
      }

      try {
        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const {
          buffer: normalizedBuffer, 
          mimeType: normalizedContentType, 
          path: normalizedPath, 
          fileName: normalizedFileName
        } = await normalizeUploadFormat(buffer, mimeType, rawSanitizedPath)

        // Compute a unique file path to avoid overwriting existing files
        let finalPath = normalizedPath;

        if (storage) {
          finalPath = await getUniqueFilePath(normalizedPath, async (p) =>
            storage.existsOriginalPath(p),
          );
        } else {
          finalPath = await getUniqueFilePath(
            normalizedPath,
            localFileExists,
          );
        }

        // Upload based on storage configuration
        if (storage) {
          // Upload to cloud storage with full (unique) path
          const url = await storage.uploadOriginal(
            finalPath,
            normalizedBuffer,
            normalizedContentType,
          );
          logger.info(
            { originalPath: rawSanitizedPath, finalPath, url },
            "Uploaded to cloud",
          );

          const uploadResult: UploadResult = {
            filename : normalizedFileName,
            path: finalPath,
            size: normalizedBuffer.length,
            url: `/t/${finalPath}`,
          };

          if (
            normalizedContentType.startsWith("image/") &&
            prewarmTransformations.length > 0
          ) {
            const prewarmResult = await prewarmImageTransformations(
              c,
              finalPath,
              prewarmTransformations,
            );
            if (prewarmResult.prewarmedUrls.length > 0) {
              uploadResult.prewarmedUrls = prewarmResult.prewarmedUrls;
            }
            if (prewarmResult.prewarmErrors.length > 0) {
              uploadResult.prewarmErrors = prewarmResult.prewarmErrors;
            }

            logger.info(
              {
                finalPath,
                requested: prewarmTransformations.length,
                prewarmed: prewarmResult.prewarmedUrls.length,
                failed: prewarmResult.prewarmErrors.length,
              },
              "Image transformation prewarm finished",
            );
          }

          // Queue thumbnail generation for videos (non-blocking, high priority)
          if (normalizedContentType.startsWith("video/")) {
            queueThumbnailGeneration(finalPath, storage).catch((error) => {
              logger.error(
                { error: serializeError(error), finalPath },
                "Failed to queue thumbnail generation",
              );
            });

            if (prewarmTransformations.length > 0) {
              const queueResult = await queueVideoTransformations(
                finalPath,
                prewarmTransformations,
                storage,
              );
              if (queueResult.queuedTransformationUrls.length > 0) {
                uploadResult.queuedTransformationUrls =
                  queueResult.queuedTransformationUrls;
              }
              if (queueResult.queueErrors.length > 0) {
                uploadResult.queueErrors = queueResult.queueErrors;
              }
            }
          }

          successfulUploads.push(uploadResult);
        } else {
          // Save locally with full path
          await saveFileLocally(finalPath, normalizedBuffer);
          logger.info(
            { originalPath: rawSanitizedPath, finalPath },
            "Saved locally",
          );

          const uploadResult: UploadResult = {
            filename : normalizedFileName,
            path: finalPath,
            size: normalizedBuffer.length,
            url: `/t/${finalPath}`,
          };

          if (
            normalizedContentType.startsWith("image/") &&
            prewarmTransformations.length > 0
          ) {
            const prewarmResult = await prewarmImageTransformations(
              c,
              finalPath,
              prewarmTransformations,
            );
            if (prewarmResult.prewarmedUrls.length > 0) {
              uploadResult.prewarmedUrls = prewarmResult.prewarmedUrls;
            }
            if (prewarmResult.prewarmErrors.length > 0) {
              uploadResult.prewarmErrors = prewarmResult.prewarmErrors;
            }

            logger.info(
              {
                finalPath,
                requested: prewarmTransformations.length,
                prewarmed: prewarmResult.prewarmedUrls.length,
                failed: prewarmResult.prewarmErrors.length,
              },
              "Image transformation prewarm finished",
            );
          }

          // Queue thumbnail generation for videos (non-blocking, high priority)
          if (normalizedContentType.startsWith("video/")) {
            queueThumbnailGeneration(finalPath, storage).catch((error) => {
              logger.error(
                { error: serializeError(error), finalPath },
                "Failed to queue thumbnail generation",
              );
            });

            if (prewarmTransformations.length > 0) {
              const queueResult = await queueVideoTransformations(
                finalPath,
                prewarmTransformations,
                storage,
              );
              if (queueResult.queuedTransformationUrls.length > 0) {
                uploadResult.queuedTransformationUrls =
                  queueResult.queuedTransformationUrls;
              }
              if (queueResult.queueErrors.length > 0) {
                uploadResult.queueErrors = queueResult.queueErrors;
              }
            }
          }

          successfulUploads.push(uploadResult);
        }
      } catch (error) {
        logger.error(
          { error: serializeError(error), originalPath: rawSanitizedPath },
          "Failed to upload",
        );
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
      return c.json(
        {
          success: true,
          files: successfulUploads,
          errors: failedUploads,
        },
        207,
      ); // Multi-Status
    } else {
      return c.json(
        {
          success: false,
          errors: failedUploads,
        },
        400,
      );
    }
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Upload error");
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * POST /upload/createfolder - create folder
 */
upload.post("/createfolder", async (c) => {
  try {
    const formData = await c.req.formData();
    const folder = formData.get("folder") as string | null;

    if (!folder || typeof folder !== "string") {
      logger.error({ folder }, "Invalid folder data provided");
      return c.json(
        {
          success: false,
          folder: null,
          error: "Invalid folder data provided",
        },
        400,
      );
    }

    const rawSanitizedPath = sanitizePath(folder.replaceAll(" ", "_")).replace(
      /\/+$/,
      "",
    );

    if (!rawSanitizedPath) {
      logger.error({ folder }, "Invalid folder data provided");
      return c.json(
        {
          success: false,
          folder: null,
          error: "Invalid folder data provided",
        },
        400,
      );
    }

    if (storage) {
      const alreadyExists = await storage.folderExists(rawSanitizedPath);

      if (alreadyExists) {
        logger.warn({ folder: rawSanitizedPath }, "Folder already exists");
        return c.json(
          {
            success: false,
            folder: null,
            error: "Folder already exists",
          },
          409,
        );
      }

      await storage.createFolder(rawSanitizedPath);
      logger.info({ folder: rawSanitizedPath }, "Folder marker created");

      return c.json(
        {
          success: true,
          folder: rawSanitizedPath,
          error: null,
        },
        201,
      );
    }

    const localBasePath = path.join(".", "public");
    const localPath = path.join(".", "public", rawSanitizedPath);

    if (!fs.existsSync(localBasePath)) {
      logger.error({ folder }, "Local storage path does not exist");
      return c.json(
        {
          success: false,
          folder: null,
          error: "Local storage path does not exist",
        },
        500,
      );
    }

    if (fs.existsSync(localPath)) {
      logger.warn({ folder: localPath }, "Folder already exists");
      return c.json(
        {
          success: false,
          folder: null,
          error: "Folder already exists",
        },
        409,
      );
    }

    fs.mkdirSync(localPath, { recursive: true });
    logger.info({ folder: localPath }, "Folder created");
    return c.json(
      {
        success: true,
        folder: rawSanitizedPath,
        error: null,
      },
      201,
    );
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Folder creation error");
    return c.json(
      {
        success: false,
        folder: null,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default upload;
