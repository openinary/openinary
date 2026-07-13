import type { FfmpegCommand } from 'fluent-ffmpeg';
import type { VideoTransformParams } from 'shared';

/**
 * Context object containing all information needed for video transformation
 */
export interface VideoContext {
  inputPath: string;
  outputPath: string;
  tmpDir: string;
  params: VideoTransformParams;
  isImageOutput: boolean;
  isThumbnail: boolean;
}

/**
 * Transform function type that takes an ffmpeg command and context,
 * applies a transformation, and returns the modified command
 */
export type TransformFunction = (
  command: FfmpegCommand,
  context: VideoContext
) => FfmpegCommand;
