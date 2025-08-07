import sharp from 'sharp';
import { CropMode, GravityMode } from 'shared';
import { getSharpPosition } from './gravity';
import { parseBackgroundColor } from './background';

/**
 * Apply resize transformation to an image
 */
export const applyResize = (
  image: sharp.Sharp,
  resizeParam: string,
  cropMode: CropMode = 'fill',
  gravity: GravityMode = 'center',
  background?: string
): sharp.Sharp => {
  const [w, h] = resizeParam.split('x');
  const width = parseInt(w);
  const height = parseInt(h);
  
  const resizeOptions: sharp.ResizeOptions = {
    width,
    height,
  };

  switch (cropMode) {
    case 'fill':
      // Resize to fill the entire area, cropping if necessary
      resizeOptions.fit = 'cover';
      resizeOptions.position = getSharpPosition(gravity);
      break;
    
    case 'fit':
      // Resize to fit within the dimensions, maintaining aspect ratio
      resizeOptions.fit = 'inside';
      resizeOptions.withoutEnlargement = true;
      break;
    
    case 'scale':
      // Scale to exact dimensions, ignoring aspect ratio
      resizeOptions.fit = 'fill';
      break;
    
    case 'crop':
      // Resize and crop to exact dimensions, maintaining aspect ratio
      resizeOptions.fit = 'cover';
      resizeOptions.position = getSharpPosition(gravity);
      break;
    
    case 'pad':
      // Resize to fit within dimensions and pad with background color
      resizeOptions.fit = 'contain';
      resizeOptions.background = parseBackgroundColor(background);
      break;
    
    default:
      // Default to fill mode
      resizeOptions.fit = 'cover';
      resizeOptions.position = getSharpPosition(gravity);
  }

  return image.resize(resizeOptions);
};