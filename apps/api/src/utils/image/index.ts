import sharp from 'sharp';
import { TransformParams } from 'shared';
import { applyAspectRatio } from './aspect-ratio';
import { applyResize } from './resize';
import { applyRotation } from './rotation';
import { applyQuality } from './quality';
import { applyResizeComposite } from './param-registry';

// Re-export types for backward compatibility
export * from './types';
export * from './param-registry';

/**
 * Transform an image with the specified parameters
 */
export const transformImage = async (inputPath: string, params: TransformParams): Promise<Buffer> => {
  let image = sharp(inputPath);

  // Convert TransformParams to a record for easier access
  const paramsRecord: Record<string, string> = {
    ...(params.rotate && { rotate: String(params.rotate) }),
    ...(params.aspect && { aspect: params.aspect }),
    ...(params.width && { width: params.width }),
    ...(params.height && { height: params.height }),
    ...(params.resize && { resize: params.resize }),
    ...(params.crop && { crop: params.crop }),
    ...(params.gravity && { gravity: params.gravity }),
    ...(params.background && { background: params.background }),
    ...(params.quality && { quality: String(params.quality) }),
    ...(params.format && { format: params.format }),
  };

  // 1. Apply rotation (if specified)
  if (params.rotate) {
    image = applyRotation(image, params.rotate, params.background);
  }

  // 2. Apply aspect ratio (if specified)
  if (params.aspect) {
    image = await applyAspectRatio(image, params.aspect, params.gravity);
  }

  // 3. Apply resize (if width or height specified)
  if (params.resize || params.width || params.height) {
    image = await applyResizeComposite(image, '', paramsRecord);
  }

  // 4. Apply quality (if specified)
  if (params.quality) {
    image = applyQuality(image, params.quality);
  }

  return await image.toBuffer();
};