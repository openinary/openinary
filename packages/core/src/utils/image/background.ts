import { BackgroundColor } from './types';

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
  
  let hex = background.replace('#', '');
  // 3/4-digit shorthand (f00, f008) expands like CSS; 8 digits carry alpha.
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((c) => c + c).join('');
  }
  if ((hex.length === 6 || hex.length === 8) && /^[0-9a-fA-F]+$/.test(hex)) {
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
      alpha: hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1,
    };
  }

  return { r: 255, g: 255, b: 255, alpha: 1 }; // Default white if invalid
};
