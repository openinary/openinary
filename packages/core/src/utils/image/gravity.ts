import { GravityMode } from './types';

/**
 * Map gravity to Sharp position values
 */
export const getSharpPosition = (gravity: GravityMode): string => {
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
    // Cloudinary's g_auto finds the subject. Sharp's attention strategy
    // (skin tones, saturation, luminance) is the closer match: entropy picks
    // the busiest region, so texture such as water or foliage wins at some
    // output sizes and the same image crops differently from size to size.
    case 'auto':
      return 'attention';
    default:
      return 'center';
  }
};