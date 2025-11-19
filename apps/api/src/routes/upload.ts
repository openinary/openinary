import { Hono } from "hono";
import { createStorageClient } from "../utils/storage/index";
import fs from "fs";
import path from "path";

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

      const filename = file.name;
      const mimeType = file.type;
      const fileSize = file.size;

      // Validate file size
      if (fileSize > MAX_FILE_SIZE) {
        failedUploads.push({
          filename,
          error: `File size exceeds limit of 50MB (size: ${(fileSize / 1024 / 1024).toFixed(2)}MB)`,
        });
        continue;
      }

      // Validate file type
      if (!validateFileType(filename, mimeType)) {
        failedUploads.push({
          filename,
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

        // Upload based on storage configuration
        if (storage) {
          // Upload to cloud storage
          const url = await storage.uploadOriginal(filename, buffer, contentType);
          console.log(`Uploaded to cloud: ${filename} -> ${url}`);
          
          successfulUploads.push({
            filename,
            path: filename,
            size: fileSize,
            url: `/t/${filename}`,
          });
        } else {
          // Save locally
          await saveFileLocally(filename, buffer);
          console.log(`Saved locally: ${filename}`);
          
          successfulUploads.push({
            filename,
            path: filename,
            size: fileSize,
            url: `/t/${filename}`,
          });
        }
      } catch (error) {
        console.error(`Failed to upload ${filename}:`, error);
        failedUploads.push({
          filename,
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
    console.error("Upload error:", error);
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



