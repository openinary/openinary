import sharp from 'sharp';

/**
 * Apply quality settings to an image.
 * Quality is deferred to the final format encoding step in the compression
 * pipeline to avoid stripping alpha channels via premature JPEG conversion.
 */
export const applyQuality = (
  image: sharp.Sharp,
  _qualityParam: string | number
): sharp.Sharp => {
  return image;
};