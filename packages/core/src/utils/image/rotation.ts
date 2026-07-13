import sharp from 'sharp';
import { parseBackgroundColor } from './background';

/**
 * Apply rotation transformation to an image
 */
export const applyRotation = (
  image: sharp.Sharp,
  rotateParam: string | number,
  background?: string
): sharp.Sharp => {
  const backgroundColor = parseBackgroundColor(background);

  if (rotateParam === 'auto') {
    // Auto-rotate based on EXIF orientation data
    return image.rotate(undefined, { background: backgroundColor });
  } else {
    // Custom angle rotation
    const angle = typeof rotateParam === 'string' ? parseInt(rotateParam) : rotateParam;
    if (!isNaN(angle)) {
      return image.rotate(angle, { background: backgroundColor });
    }
  }

  return image;
};