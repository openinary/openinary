import type { FfmpegCommand } from 'fluent-ffmpeg';
import type { VideoContext } from './types';
import { applyResize } from './resize';
import { applyQuality } from './quality';
import { applyTrimming } from './trim';
import { applyThumbnailExtraction } from './thumbnail';

/**
 * Parameter processor function type for video transformations
 * Takes an FFmpeg command and context, returns modified command
 */
export type VideoParamProcessor = (
  command: FfmpegCommand,
  value: string,
  context: VideoContext
) => FfmpegCommand;

/**
 * Parameter definition interface for video transformations
 */
export interface VideoParamDefinition {
  /** Short parameter key used in URLs (e.g., 'w', 'h', 'so') */
  param: string;
  /** Human-readable name */
  name: string;
  /** Detailed description of the parameter */
  description: string;
  /** Example value for documentation */
  example: string;
  /** Default value if not specified */
  defaultValue?: string | number | boolean;
  /** Valid values or pattern description */
  validValues?: string[];
  /** Parameter aliases (alternative names) */
  aliases?: string[];
  /** The function that processes this parameter */
  processor?: VideoParamProcessor;
  /** Whether this parameter requires other parameters to work */
  dependencies?: string[];
  /** Processing order priority (lower = earlier) */
  priority: number;
}

/**
 * Complete parameter registry for video transformations
 * Single source of truth for all video transformation parameters
 */
export const VIDEO_PARAMS: readonly VideoParamDefinition[] = [
  {
    param: 't',
    name: 'Thumbnail',
    description: 'Extracts a single frame as an image thumbnail. When enabled, the output will be an image format (jpg, png, webp, etc.) instead of a video.',
    example: 't_true',
    defaultValue: false,
    validValues: ['true', 'false', '1', '0'],
    processor: (command, _value, context) => {
      return applyThumbnailExtraction(command, context);
    },
    priority: 1, // Thumbnail extraction should happen first
  },
  {
    param: 'tt',
    name: 'Thumbnail Time',
    description: 'Specifies the time (in seconds) from which to extract the thumbnail. Works in conjunction with the thumbnail parameter.',
    example: 'tt_5.5',
    defaultValue: 0,
    validValues: ['any positive number (seconds)'],
    aliases: ['thumbnail_time'],
    dependencies: ['t'],
    processor: (command, _value, context) => {
      // Thumbnail time is used by thumbnail extraction
      return command;
    },
    priority: 0, // Config parameter
  },
  {
    param: 'so',
    name: 'Start Offset',
    description: 'Trims the video by starting from the specified time in seconds. Can be used alone or with end offset.',
    example: 'so_10',
    validValues: ['any positive number (seconds)'],
    aliases: ['start_offset', 'start'],
    processor: (command, _value, context) => {
      return applyTrimming(command, context);
    },
    priority: 2, // Trimming before resize
  },
  {
    param: 'eo',
    name: 'End Offset',
    description: 'Trims the video by ending at the specified time in seconds. If used with start offset, creates a segment between the two times.',
    example: 'eo_30',
    validValues: ['any positive number (seconds)'],
    aliases: ['end_offset', 'end'],
    processor: (command, _value, context) => {
      // End offset is processed together with start offset in trim
      return command;
    },
    priority: 2, // Trimming before resize
  },
  {
    param: 'w',
    name: 'Width',
    description: 'Sets the width of the video in pixels. Should be used with height for proper scaling.',
    example: 'w_1280',
    validValues: ['any positive integer'],
    processor: (command, _value, context) => {
      // Width is processed together with height in the resize step
      return command;
    },
    priority: 3, // Resize operations
  },
  {
    param: 'h',
    name: 'Height',
    description: 'Sets the height of the video in pixels. Should be used with width for proper scaling.',
    example: 'h_720',
    validValues: ['any positive integer'],
    processor: (command, _value, context) => {
      // Height is processed together with width in the resize step
      return command;
    },
    priority: 3, // Resize operations
  },
  {
    param: 'r',
    name: 'Resize',
    description: 'Specifies dimensions in WxH format (e.g., 1280x720). Alternative to using separate width and height parameters.',
    example: 'r_1920x1080',
    validValues: ['WxH format (e.g., 1920x1080)'],
    aliases: ['resize', 'size'],
    processor: (command, _value, context) => {
      return applyResize(command, context);
    },
    priority: 3, // Resize operations
  },
  {
    param: 'c',
    name: 'Crop Mode',
    description: 'Defines how the video should be resized. Options: fill/crop (cover entire area with cropping, no stretching), fit (fit within dimensions maintaining aspect ratio), scale (exact dimensions, may stretch), pad (fit within dimensions and pad with background).',
    example: 'c_fill',
    defaultValue: 'fill',
    validValues: ['fill', 'fit', 'scale', 'crop', 'pad'],
    aliases: ['crop_mode'],
    dependencies: ['w', 'h'],
    processor: (command, _value, context) => {
      // Crop mode is applied together with width/height in applyResize
      return command;
    },
    priority: 3, // Resize operations
  },
  {
    param: 'g',
    name: 'Gravity',
    description: 'Defines the focal point when cropping (future support). Options: center (center), north (top), south (bottom), east (right), west (left), auto (entropy-based).',
    example: 'g_center',
    defaultValue: 'center',
    validValues: ['center', 'north', 'south', 'east', 'west', 'auto'],
    aliases: ['gravity'],
    processor: (command, _value, context) => {
      // Gravity will be used by resize operations (not yet fully implemented)
      return command;
    },
    priority: 0, // Config parameter
  },
  {
    param: 'q',
    name: 'Quality',
    description: 'Sets the quality of the output video (0-100). Uses CRF (Constant Rate Factor) encoding. Higher values produce better quality and larger files. Quality 100 ≈ CRF 18, Quality 50 ≈ CRF 28.',
    example: 'q_80',
    defaultValue: undefined,
    validValues: ['0-100'],
    processor: (command, _value, context) => {
      return applyQuality(command, context);
    },
    priority: 4, // Quality after transformations
  },
  {
    param: 'f',
    name: 'Format',
    description: 'Specifies the output format. Video formats: mp4, mov, webm. Image formats (for thumbnails): jpg, jpeg, png, webp, avif, gif. If not specified, defaults to mp4 for videos or jpg for thumbnails.',
    example: 'f_webm',
    defaultValue: 'mp4',
    validValues: ['mp4', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'],
    aliases: ['format'],
    processor: (command, _value, context) => {
      // Format is handled by the determineOutputFormat function
      return command;
    },
    priority: 5, // Format conversion last
  },
] as const;

/**
 * Helper function to apply resize with all related parameters
 * This is a composite operation that uses w, h, r, c, and g parameters
 */
export const applyResizeComposite = (
  command: FfmpegCommand,
  context: VideoContext
): FfmpegCommand => {
  const { resize, width, height } = context.params;
  
  if (!width && !height && !resize) {
    return command;
  }
  
  return applyResize(command, context);
};

/**
 * Get parameter definition by param key
 */
export const getVideoParamDefinition = (param: string): VideoParamDefinition | undefined => {
  return VIDEO_PARAMS.find(p => p.param === param || p.aliases?.includes(param));
};

/**
 * Get all parameter definitions sorted by priority
 */
export const getVideoParamsByPriority = (): readonly VideoParamDefinition[] => {
  return [...VIDEO_PARAMS].sort((a, b) => a.priority - b.priority);
};

/**
 * Get default value for a parameter
 */
export const getVideoParamDefault = (param: string): string | number | boolean | undefined => {
  const def = getVideoParamDefinition(param);
  return def?.defaultValue;
};

/**
 * Validate if a parameter value is valid
 */
export const isValidVideoParamValue = (param: string, value: string): boolean => {
  const def = getVideoParamDefinition(param);
  if (!def) return false;
  
  // If no validValues specified, assume any value is valid
  if (!def.validValues || def.validValues.length === 0) return true;
  
  // Check if value matches any valid value or pattern
  return def.validValues.some(valid => {
    if (valid.includes('any')) return true; // Pattern like "any positive integer"
    return value === valid || value.startsWith(valid);
  });
};

/**
 * Export types for external use
 */
export type VideoParamKey = typeof VIDEO_PARAMS[number]['param'];
export type VideoParamRegistry = typeof VIDEO_PARAMS;
