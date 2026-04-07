import sharp from 'sharp';
import { readFile } from 'fs/promises';
import Psd from '@webtoon/psd';
import { TransformParams } from 'shared';
import { applyAspectRatio } from './aspect-ratio';
import { applyResize } from './resize';
import { applyRotation } from './rotation';
import { applyQuality } from './quality';
import { applyResizeComposite } from './param-registry';

/**
 * Decode a PSD file into a Sharp instance via raw RGBA pixel data.
 * Sharp cannot read PSD natively; @webtoon/psd composites all layers first.
 * The output is encoded as PNG so the temp-file step in processImage can read it.
 */
async function decodePsd(inputPath: string): Promise<sharp.Sharp> {
  const fileBuffer = await readFile(inputPath);
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  ) as ArrayBuffer;
  const psd = Psd.parse(arrayBuffer);
  const pixelData = await psd.composite();
  return sharp(Buffer.from(pixelData), {
    raw: { width: psd.width, height: psd.height, channels: 4 },
  }).png();
}

// Re-export types for backward compatibility
export * from './types';
export * from './param-registry';

/**
 * Transform an image with the specified parameters
 */
export const transformImage = async (inputPath: string, params: TransformParams): Promise<Buffer> => {
  let image = inputPath.toLowerCase().endsWith('.psd')
    ? await decodePsd(inputPath)
    : sharp(inputPath);

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