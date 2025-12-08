import sharp from 'sharp';
import { CropMode, GravityMode, ImageFormat } from 'shared';
import { applyAspectRatio } from './aspect-ratio';
import { applyRotation } from './rotation';
import { applyQuality } from './quality';
import { applyResize } from './resize';

/**
 * Parameter processor function type
 * Takes a Sharp instance and parameter value, returns modified Sharp instance or Promise<Sharp>
 */
export type ParamProcessor = (
  image: sharp.Sharp,
  value: string,
  allParams: Record<string, string>
) => sharp.Sharp | Promise<sharp.Sharp>;

/**
 * Parameter definition interface
 */
export interface ParamDefinition {
  /** Short parameter key used in URLs (e.g., 'w', 'h', 'ar') */
  param: string;
  /** Human-readable name */
  name: string;
  /** Detailed description of the parameter */
  description: string;
  /** Example value for documentation */
  example: string;
  /** Default value if not specified */
  defaultValue?: string | number;
  /** Valid values or pattern description */
  validValues?: string[];
  /** Parameter aliases (alternative names) */
  aliases?: string[];
  /** The function that processes this parameter */
  processor?: ParamProcessor;
  /** Whether this parameter requires other parameters to work */
  dependencies?: string[];
  /** Processing order priority (lower = earlier) */
  priority: number;
}

/**
 * Complete parameter registry
 * Single source of truth for all image transformation parameters
 */
export const IMAGE_PARAMS: readonly ParamDefinition[] = [
  {
    param: 'a',
    name: 'Rotation Angle',
    description: 'Rotates the image by the specified angle in degrees, or use "auto" to auto-rotate based on EXIF orientation data.',
    example: 'a_90',
    validValues: ['auto', '90', '180', '270', 'any numeric angle'],
    processor: async (image, value, allParams) => {
      return applyRotation(image, value, allParams.background);
    },
    priority: 1, // Rotation should happen first
  },
  {
    param: 'ar',
    name: 'Aspect Ratio',
    description: 'Crops the image to a specific aspect ratio (e.g., 16:9, 4:3, 1:1). The image is cropped to match the target ratio while maintaining as much content as possible.',
    example: 'ar_16:9',
    validValues: ['16:9', '4:3', '1:1', '21:9', 'any ratio in W:H format'],
    processor: async (image, value, allParams) => {
      const gravity = (allParams.gravity || 'center') as GravityMode;
      return await applyAspectRatio(image, value, gravity);
    },
    dependencies: ['g'],
    priority: 2, // Aspect ratio before resize
  },
  {
    param: 'w',
    name: 'Width',
    description: 'Sets the width of the image in pixels. Can be used independently or with height.',
    example: 'w_300',
    validValues: ['any positive integer'],
    processor: async (image, value, allParams) => {
      // Width is processed together with height in the resize step
      return image;
    },
    priority: 3, // Resize operations
  },
  {
    param: 'h',
    name: 'Height',
    description: 'Sets the height of the image in pixels. Can be used independently or with width.',
    example: 'h_200',
    validValues: ['any positive integer'],
    processor: async (image, value, allParams) => {
      // Height is processed together with width in the resize step
      return image;
    },
    priority: 3, // Resize operations
  },
  {
    param: 'c',
    name: 'Crop Mode',
    description: 'Defines how the image should be resized and cropped. Options: fill (cover entire area with cropping), fit (fit within dimensions maintaining aspect ratio), scale (exact dimensions ignoring aspect ratio), crop (resize and crop to exact dimensions), pad (fit within dimensions and pad with background color).',
    example: 'c_fill',
    defaultValue: 'fill',
    validValues: ['fill', 'fit', 'scale', 'crop', 'pad'],
    aliases: ['lfill', 'fill_pad', 'limit', 'mfit', 'thumb', 'lpad'],
    dependencies: ['w', 'h'],
    processor: async (image, value, allParams) => {
      // Crop mode is applied together with width/height in applyResize
      return image;
    },
    priority: 3, // Resize operations
  },
  {
    param: 'g',
    name: 'Gravity',
    description: 'Defines the focal point when cropping. Options: center/c (center), north/n (top), south/s (bottom), east/e (right), west/w (left), face/faces (face detection), auto (entropy-based).',
    example: 'g_center',
    defaultValue: 'center',
    validValues: ['center', 'north', 'south', 'east', 'west', 'face', 'auto'],
    aliases: ['c', 'n', 's', 'e', 'w', 'faces', 'face_center'],
    processor: async (image, value, allParams) => {
      // Gravity is used by other operations (aspect ratio, resize)
      return image;
    },
    priority: 0, // Config parameter, not a direct operation
  },
  {
    param: 'q',
    name: 'Quality',
    description: 'Sets the quality of the output image (1-100). Lower values create smaller files with reduced quality. Works primarily with lossy formats like JPEG, WebP, and AVIF.',
    example: 'q_80',
    defaultValue: 80,
    validValues: ['1-100', 'auto'],
    processor: async (image, value, allParams) => {
      return applyQuality(image, value);
    },
    priority: 4, // Quality after transformations
  },
  {
    param: 'f',
    name: 'Format',
    description: 'Specifies the output format. Options: avif, webp, jpeg, jpg, png. If not specified, the system automatically selects the optimal format based on browser support and file size comparison.',
    example: 'f_webp',
    defaultValue: 'avif',
    validValues: ['avif', 'webp', 'jpeg', 'jpg', 'png'],
    processor: async (image, value, allParams) => {
      // Format is handled by the Compression class
      return image;
    },
    priority: 5, // Format conversion last
  },
  {
    param: 'b',
    name: 'Background',
    description: 'Sets the background color for padding (when using crop mode "pad") or rotation. Options: transparent, white, black, hex colors (with or without #), or rgb:RRGGBB format.',
    example: 'b_transparent',
    defaultValue: '#ffffff',
    validValues: ['transparent', 'white', 'black', 'hex colors', 'rgb:RRGGBB'],
    aliases: ['bg'],
    processor: async (image, value, allParams) => {
      // Background is used by other operations (rotation, pad)
      return image;
    },
    priority: 0, // Config parameter, not a direct operation
  },
  {
    param: 'bg',
    name: 'Background (Alias)',
    description: 'Alternative parameter name for background color. Identical functionality to "b" parameter.',
    example: 'bg_rgb:FF5733',
    defaultValue: '#ffffff',
    validValues: ['transparent', 'white', 'black', 'hex colors', 'rgb:RRGGBB'],
    processor: async (image, value, allParams) => {
      // Background is used by other operations (rotation, pad)
      return image;
    },
    priority: 0, // Config parameter, not a direct operation
  },
] as const;

/**
 * Helper function to apply resize with all related parameters
 * This is a composite operation that uses w, h, c, g, and b parameters
 */
export const applyResizeComposite: ParamProcessor = (image, _value, allParams) => {
  if (!allParams.width && !allParams.height && !allParams.resize) {
    return image;
  }
  
  return applyResize(
    image,
    allParams.resize,
    (allParams.crop || 'fill') as CropMode,
    (allParams.gravity || 'center') as GravityMode,
    allParams.background,
    allParams.width,
    allParams.height
  );
};

/**
 * Get parameter definition by param key
 */
export const getParamDefinition = (param: string): ParamDefinition | undefined => {
  return IMAGE_PARAMS.find(p => p.param === param || p.aliases?.includes(param));
};

/**
 * Get all parameter definitions sorted by priority
 */
export const getParamsByPriority = (): readonly ParamDefinition[] => {
  return [...IMAGE_PARAMS].sort((a, b) => a.priority - b.priority);
};

/**
 * Get default value for a parameter
 */
export const getParamDefault = (param: string): string | number | undefined => {
  const def = getParamDefinition(param);
  return def?.defaultValue;
};

/**
 * Validate if a parameter value is valid
 */
export const isValidParamValue = (param: string, value: string): boolean => {
  const def = getParamDefinition(param);
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
export type ImageParamKey = typeof IMAGE_PARAMS[number]['param'];
export type ParamRegistry = typeof IMAGE_PARAMS;
