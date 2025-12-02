import sharp from 'sharp';
import { TransformParams } from 'shared';
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

  if (params.rotate) {
    image = applyRotation(image, params.rotate, params.background);
  }

  if (params.aspect) {
    image = await applyAspectRatio(image, params.aspect, params.gravity);
  }

  if (params.resize || params.width || params.height) {
    image = applyResize(
      image,
      params.resize,
      params.crop,
      params.gravity,
      params.background,
      params.width,
      params.height
    );
  }

  if (params.quality) {
    image = applyQuality(image, params.quality);
  }

  return await image.toBuffer();
};