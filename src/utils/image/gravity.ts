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
    case 'auto':
      return 'entropy'; // Sharp's entropy strategy focuses on high-contrast areas
    default:
      return 'center';
  }
};