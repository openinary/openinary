import sharp from 'sharp';
import { GravityMode } from 'shared';
import { getSharpPosition } from './gravity';

/**
 * Apply aspect ratio transformation to an image
 */
export const applyAspectRatio = async (
  image: sharp.Sharp,
  aspectParam: string,
  gravity: GravityMode = 'center'
): Promise<sharp.Sharp> => {
  const aspectRatio = aspectParam.split(':');
  if (aspectRatio.length !== 2) {
    return image;
  }

  const targetRatio = parseFloat(aspectRatio[0]) / parseFloat(aspectRatio[1]);
  
  // Get current image metadata
  const metadata = await image.metadata();
  const currentWidth = metadata.width || 0;
  const currentHeight = metadata.height || 0;
  const currentRatio = currentWidth / currentHeight;
  
  // Only transform if ratios differ significantly
  if (Math.abs(currentRatio - targetRatio) <= 0.01) {
    return image; // Image already has correct aspect ratio
  }

  let newWidth: number;
  let newHeight: number;
  
  if (currentRatio > targetRatio) {
    // Current image is wider, crop width
    newHeight = currentHeight;
    newWidth = Math.round(newHeight * targetRatio);
  } else {
    // Current image is taller, crop height
    newWidth = currentWidth;
    newHeight = Math.round(newWidth / targetRatio);
  }
  
  // Apply aspect ratio crop with specified gravity
  return image.resize({
    width: newWidth,
    height: newHeight,
    fit: 'cover',
    position: getSharpPosition(gravity)
  });
};