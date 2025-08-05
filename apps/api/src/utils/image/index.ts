import sharp from 'sharp';
import { TransformParams } from './types';
import { applyAspectRatio } from './aspect-ratio';
import { applyResize } from './resize';
import { applyRotation } from './rotation';
import { applyQuality } from './quality';

// Re-export types for backward compatibility
export * from './types';

/**
 * Transform an image with the specified parameters
 */
export const transformImage = async (inputPath: string, params: TransformParams): Promise<Buffer> => {
  let image = sharp(inputPath);

  // Handle aspect ratio transformation first if specified
  if (params.aspect) {
    image = await applyAspectRatio(image, params.aspect, params.gravity);
  }

  // Handle resize transformation
  if (params.resize) {
    image = applyResize(image, params.resize, params.crop, params.gravity, params.background);
  }

  // Handle rotation if specified
  if (params.rotate) {
    image = applyRotation(image, params.rotate, params.background);
  }

  // Handle quality if specified
  if (params.quality) {
    image = applyQuality(image, params.quality);
  }

  return await image.toBuffer();
};