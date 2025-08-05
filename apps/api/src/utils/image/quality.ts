import sharp from 'sharp';

/**
 * Apply quality settings to an image
 */
export const applyQuality = (
  image: sharp.Sharp,
  qualityParam: string | number
): sharp.Sharp => {
  const quality = typeof qualityParam === 'string' ? parseInt(qualityParam) : qualityParam;
  
  if (!isNaN(quality) && quality >= 1 && quality <= 100) {
    return image.jpeg({ quality });
  }
  
  return image;
};