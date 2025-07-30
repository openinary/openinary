import sharp from 'sharp';

export type CropMode = 'fill' | 'fit' | 'scale' | 'crop' | 'pad';
export type GravityMode = 'center' | 'north' | 'south' | 'east' | 'west' | 'face' | 'auto';

// Map gravity to Sharp position values
const getSharpPosition = (gravity: GravityMode): string => {
  switch (gravity) {
    case 'center':
      return 'center';
    case 'north':
      return 'top';
    case 'south':
      return 'bottom';
    case 'east':
      return 'right';
    case 'west':
      return 'left';
    case 'face':
      return 'attention'; // Sharp's attention strategy focuses on interesting features
    case 'auto':
      return 'entropy'; // Sharp's entropy strategy focuses on high-contrast areas
    default:
      return 'center';
  }
};

export const transformImage = async (inputPath: string, params: any) => {  
  let image = sharp(inputPath);

  // Handle aspect ratio transformation first if specified
  if (params.aspect) {
    const aspectRatio = params.aspect.split(':');
    if (aspectRatio.length === 2) {
      const targetRatio = parseFloat(aspectRatio[0]) / parseFloat(aspectRatio[1]);
      
      // Get current image metadata
      const metadata = await image.metadata();
      const currentWidth = metadata.width || 0;
      const currentHeight = metadata.height || 0;
      const currentRatio = currentWidth / currentHeight;
      
      if (Math.abs(currentRatio - targetRatio) > 0.01) { // Only transform if ratios differ significantly
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
        
        
        // Apply aspect ratio crop with center gravity by default
        const gravity: GravityMode = params.gravity || 'center';        
        image = image.resize({
          width: newWidth,
          height: newHeight,
          fit: 'cover',
          position: getSharpPosition(gravity)
        });
      } else {
        // Image already has correct aspect ratio
      }
    }
  }

  if (params.resize) {
    const [w, h] = params.resize.split('x');
    const width = parseInt(w);
    const height = parseInt(h);
    
    // Default crop mode is 'fill' if not specified
    const cropMode: CropMode = params.crop || 'fill';
    
    // Parse gravity/focus parameter
    const gravity: GravityMode = params.gravity || 'center';
    
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
        
        // Parse background color from hex format (e.g., "ffffff" or "ff0000")
        let backgroundColor = { r: 255, g: 255, b: 255, alpha: 1 }; // Default white
        if (params.background) {
          const hex = params.background.replace('#', '');
          if (hex.length === 6) {
            backgroundColor = {
              r: parseInt(hex.substr(0, 2), 16),
              g: parseInt(hex.substr(2, 2), 16),
              b: parseInt(hex.substr(4, 2), 16),
              alpha: 1
            };
          }
        }
        resizeOptions.background = backgroundColor;
        break;
      
      default:
        // Default to fill mode
        resizeOptions.fit = 'cover';
        resizeOptions.position = getSharpPosition(gravity);
    }

    image.resize(resizeOptions);
  }

  if (params.quality) {
    image.jpeg({ quality: parseInt(params.quality) });
  }

  return await image.toBuffer();
};
