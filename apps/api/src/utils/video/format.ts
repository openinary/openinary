/**
 * Supported image formats for video thumbnails
 */
export const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif", "psd"]);

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
 * MIME content type for a resolved output format.
 */
const CONTENT_TYPE_BY_FORMAT: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export const contentTypeForFormat = (format: string): string => {
  const normalized = normalizeFormat(format.toLowerCase());
  if (CONTENT_TYPE_BY_FORMAT[normalized]) {
    return CONTENT_TYPE_BY_FORMAT[normalized];
  }
  return IMAGE_FORMATS.has(normalized) ? `image/${normalized}` : "video/mp4";
};
