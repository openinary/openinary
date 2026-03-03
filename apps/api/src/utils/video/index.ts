import { mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { VideoTransformParams } from 'shared';
import { determineOutputFormat, IMAGE_FORMATS, normalizeFormat } from './format';
import { applyThumbnailExtraction } from './thumbnail';
import { applyTrimming } from './trim';
import { applyAutoDownscale } from './auto-downscale';
import { applyResize } from './resize';
import { applyQuality } from './quality';
import { VideoCommandBuilder } from './command-builder';
import type { VideoContext } from './types';

// Re-export types for backward compatibility
export * from './types';
export * from './param-registry';
export * from './video-info';

/**
 * Image formats that ffmpeg cannot encode natively in all builds.
 * For these we extract a JPEG frame via ffmpeg, then convert with sharp.
 * This decouples thumbnail quality from ffmpeg's build flags (e.g. libwebp).
 */
const SHARP_CONVERTED_FORMATS = new Set(['webp', 'avif', 'png', 'gif']);

/**
 * Convert an image buffer to the target format using sharp.
 * Falls back to the original buffer on any sharp error.
 */
async function convertWithSharp(
  buffer: Buffer,
  targetFormat: string,
  quality?: number
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const q = quality !== undefined ? Math.round(quality) : 80;

  switch (targetFormat) {
    case 'webp':
      return sharp(buffer).webp({ quality: q }).toBuffer();
    case 'avif':
      return sharp(buffer).avif({ quality: q }).toBuffer();
    case 'png':
      return sharp(buffer).png().toBuffer();
    case 'gif':
      // sharp doesn't encode animated GIF well; best effort single frame
      return sharp(buffer).gif().toBuffer();
    default:
      return buffer;
  }
}

/**
 * Transform a video with the specified parameters.
 *
 * Supports:
 * - Video transformations (resize, quality, trim)
 * - Thumbnail extraction (single frame as image)
 * - Format conversion (mp4, mov, webm, jpg, png, webp, avif, …)
 * - Auto-downscales to 720p max (unless explicit resize specified)
 * - Default compression quality of 60/100 (CRF 31) — optimised for 8K
 * - Ultra-fast encoding preset with baseline profile for minimal CPU usage
 * - Audio copied without re-encoding
 * - 5-minute timeout protection (accommodates 8K videos)
 *
 * Thumbnail pipeline detail:
 *   1. ffmpeg seeks to tt_N and extracts one JPEG frame (universal support).
 *   2. If the requested format needs sharp (webp, avif, png, gif), the JPEG
 *      buffer is post-processed by sharp — this avoids relying on optional
 *      ffmpeg build flags such as libwebp.
 */
export const transformVideo = async (
  inputPath: string,
  params: VideoTransformParams
): Promise<Buffer> => {
  // Create temporary directory for output
  const tmpDir = await mkdtemp(join(tmpdir(), 'video-'));

  // Get source file extension
  const sourceExt = inputPath.split('.').pop()?.toLowerCase();

  // Determine output format and flags
  const { format, isImageOutput, isThumbnail } = determineOutputFormat(
    sourceExt,
    params.format
  );

  // For thumbnails, always let ffmpeg output JPEG — it is universally supported
  // regardless of ffmpeg build flags (no libwebp required).
  // We post-process with sharp afterwards if the requested format differs.
  const ffmpegFormat = isThumbnail ? 'jpg' : format;
  const needsSharpConversion =
    isThumbnail &&
    IMAGE_FORMATS.has(normalizeFormat(format)) &&
    SHARP_CONVERTED_FORMATS.has(normalizeFormat(format));

  // Generate output path using the ffmpeg-friendly format
  const outputPath = join(tmpDir, `${randomUUID()}.${ffmpegFormat}`);

  // Build context object
  const context: VideoContext = {
    inputPath,
    outputPath,
    tmpDir,
    params,
    isImageOutput,
    isThumbnail,
  };

  // Apply transformations pipeline and execute
  // Order matters: thumbnail extraction or trimming first, auto-downscale, resize, then quality
  const builder = new VideoCommandBuilder(context);

  let buffer = await builder
    .apply(
      applyThumbnailExtraction,
      applyTrimming,
      applyAutoDownscale,
      applyResize,
      applyQuality
    )
    .execute();

  // Post-process with sharp if needed (e.g. JPEG → WebP/AVIF/PNG)
  if (needsSharpConversion) {
    const qualityValue =
      params.quality !== undefined
        ? typeof params.quality === 'string'
          ? parseInt(params.quality, 10)
          : params.quality
        : 80;
    buffer = await convertWithSharp(buffer, normalizeFormat(format), qualityValue);
  }

  return buffer;
};
