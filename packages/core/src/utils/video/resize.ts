import type { TransformFunction } from './types';

/**
 * Apply resize transformation to a video
 * Supports multiple crop modes: fill, crop, fit, scale, pad
 */
export const applyResize: TransformFunction = (
  command,
  context
) => {
  const { resize, width, height, crop } = context.params;

  let w: number | undefined;
  let h: number | undefined;

  // Parse dimensions from resize parameter
  if (resize) {
    const [wStr, hStr] = resize.split('x');
    w = wStr ? parseInt(wStr, 10) : undefined;
    h = hStr ? parseInt(hStr, 10) : undefined;
  }

  // Individual width/height parameters take precedence
  if (width !== undefined) {
    w = typeof width === 'string' ? parseInt(width, 10) : width;
  }
  if (height !== undefined) {
    h = typeof height === 'string' ? parseInt(height, 10) : height;
  }

  // Skip if no valid dimensions
  if (!w || !h || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
    return command;
  }

  // Apply resize based on crop mode
  if (crop === 'fill' || crop === 'crop') {
    // Cover behavior (no stretching):
    // 1) scale until the smallest side reaches the target, preserving aspect ratio
    // 2) crop to exact WxH from the center
    const filter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    return command.videoFilters(filter);
  } else {
    // Backwards-compatible behavior: simple resize to exact dimensions,
    // which may stretch to fit
    return command.size(`${w}x${h}`);
  }
};
