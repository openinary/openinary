import { mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { VideoTransformParams } from 'shared';
import { determineOutputFormat } from './format';
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
 * Transform a video with the specified parameters
 * Similar pattern to transformImage for consistency
 * 
 * Supports:
 * - Video transformations (resize, quality, trim)
 * - Thumbnail extraction (single frame as image)
 * - Format conversion (mp4, mov, webm, jpg, png, etc.)
 * - Auto-downscales to 720p max (unless explicit resize specified)
 *   - Chosen for ~50% faster processing vs 1080p on very large videos (8K, 5K)
 * - Default compression quality of 60/100 (CRF 31) - optimized for 8K
 * - Ultra-fast encoding preset with baseline profile for minimal CPU usage
 * - Audio copied without re-encoding
 * - 5-minute timeout protection (accommodates 8K videos)
 */
export const transformVideo = async (
  inputPath: string,
  params: VideoTransformParams
): Promise<Buffer> => {
  // Create temporary directory for output
  const tmpDir = await mkdtemp(join(tmpdir(), 'video-'));
  
  // Get source file extension
  const sourceExt = inputPath.split(".").pop()?.toLowerCase();
  
  // Determine output format and flags
  const { format, isImageOutput, isThumbnail } = determineOutputFormat(
    sourceExt,
    params.format
  );
  
  // Generate output path
  const outputPath = join(tmpDir, `${randomUUID()}.${format}`);
  
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
  
  return await builder
    .apply(
      applyThumbnailExtraction,
      applyTrimming,
      applyAutoDownscale,  // Auto-downscale to 1080p max before other transforms
      applyResize,
      applyQuality
    )
    .execute();
};
