import { BackgroundColor } from 'shared';

/**
 * Parse background color from hex format or "transparent" keyword
 */
export const parseBackgroundColor = (background?: string): BackgroundColor => {
  if (!background) {
    return { r: 255, g: 255, b: 255, alpha: 1 }; // Default white
  }
  
  if (background.toLowerCase() === 'transparent') {
    return { r: 0, g: 0, b: 0, alpha: 0 }; // Transparent
  }
  
  const hex = background.replace('#', '');
  if (hex.length === 6) {
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16),
      alpha: 1
    };
  }
  
  return { r: 255, g: 255, b: 255, alpha: 1 }; // Default white if invalid
};