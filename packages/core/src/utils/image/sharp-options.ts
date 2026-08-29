import sharp from 'sharp';

/**
 * Accept recoverable decoder warnings from camera and phone images. Browsers
 * commonly display these files, and libvips can usually decode them when its
 * failure threshold is lowered.
 */
export const SHARP_INPUT_OPTIONS: sharp.SharpOptions = { failOn: 'none' };
