import { mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { VideoTransformParams } from 'shared';
import { determineOutputFormat } from './format';
import { applyThumbnailExtraction } from './thumbnail';
import { applyTrimming } from './trim';
import { applyResize } from './resize';
import { applyQuality } from './quality';
import { VideoCommandBuilder } from './command-builder';
import type { VideoContext } from './types';

// Re-export types for backward compatibility
export * from './types';
export * from './param-registry';

/**
 * Transform a video with the specified parameters
 * Similar pattern to transformImage for consistency
 * 
 * Supports:
 * - Video transformations (resize, quality, trim)
 * - Thumbnail extraction (single frame as image)
 * - Format conversion (mp4, mov, webm, jpg, png, etc.)
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
  // Order matters: thumbnail extraction or trimming first, then resize, then quality
  const builder = new VideoCommandBuilder(context);
  
  return await builder
    .apply(
      applyThumbnailExtraction,
      applyTrimming,
      applyResize,
      applyQuality
    )
    .execute();
};
