import { contentTypeForExt } from "../upload-validation";

/**
 * Supported image formats for video thumbnails
 */
export const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);

/**
 * Supported video formats
 */
export const VIDEO_FORMATS = new Set(["mp4", "mov", "webm"]);

/**
 * Normalize format name (jpeg -> jpg)
 */
export const normalizeFormat = (format: string): string => {
  return format === "jpeg" ? "jpg" : format;
};

/**
 * Determine output format and whether it's an image or thumbnail
 */
export const determineOutputFormat = (
  sourceExt: string | undefined,
  requestedFormat: string | undefined
): { format: string; isImageOutput: boolean; isThumbnail: boolean } => {
  const requestedFormatLower = requestedFormat?.toLowerCase();
  
  const isImageFormat =
    !!requestedFormatLower && 
    IMAGE_FORMATS.has(normalizeFormat(requestedFormatLower));
  
  const isVideoSource = !!sourceExt && VIDEO_FORMATS.has(sourceExt);
  const isThumbnail = isVideoSource && isImageFormat;

  // Decide output extension:
  // - Thumbnail => image format (default jpg)
  // - Video transform => requested video format or fall back to mp4
  let format: string;
  if (isThumbnail) {
    const normalizedFormat = normalizeFormat(requestedFormatLower!);
    format = IMAGE_FORMATS.has(normalizedFormat) ? normalizedFormat : "jpg";
  } else {
    const baseVideoExt =
      requestedFormatLower && VIDEO_FORMATS.has(requestedFormatLower)
        ? requestedFormatLower
        : "mp4";
    format = baseVideoExt;
  }

  return {
    format,
    isImageOutput: isImageFormat,
    isThumbnail,
  };
};

/**
 * MIME content type for a resolved output format or a stored original's
 * extension. Backed by the single media-type table in upload-validation so the
 * accepted-types whitelist and the content-type map cannot drift, and so audio /
 * 3D originals get their real type instead of the old video/mp4 fallback.
 */
export const contentTypeForFormat = (format: string): string =>
  contentTypeForExt(normalizeFormat(format.toLowerCase()));
