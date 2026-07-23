import path from "path";

/**
 * Single source of truth for what Openinary accepts at upload time.
 * Consumed by the OSS API and the SaaS so their whitelists cannot diverge.
 *
 * Deliberately excludes svg (stored-XSS vector when served inline) and every
 * format the transform pipeline cannot decode.
 */
export const ALLOWED_UPLOAD_TYPES: Readonly<Record<string, readonly string[]>> =
  {
    // Images
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/avif": [".avif"],
    "image/gif": [".gif"],
    "image/heic": [".heic", ".heif"],
    "image/heif": [".heic", ".heif"],
    "image/vnd.adobe.photoshop": [".psd"],
    "application/octet-stream": [".psd"],
    // Videos
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
    "video/webm": [".webm"],
  };

/**
 * Validates an upload's file type: the MIME type must be allowed and the
 * filename extension must match that MIME type.
 */
export function validateUploadFileType(
  filename: string,
  mimeType: string,
): boolean {
  const allowedExtensions = ALLOWED_UPLOAD_TYPES[mimeType];
  if (!allowedExtensions) {
    return false;
  }
  return allowedExtensions.includes(path.extname(filename).toLowerCase());
}
