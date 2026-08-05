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

  // One dimension is enough - see the scale filter below. Requiring both
  // meant w_303 alone fell through untouched: the video was still fully
  // re-encoded (minutes of container time, billed to the customer) and came
  // back at its original size, so the transform silently did nothing.
  const valid = (n: number | undefined): n is number =>
    n !== undefined && !isNaN(n) && n > 0;
  if (!valid(w) && !valid(h)) {
    return command;
  }

  // setsar=1 on every branch: ffmpeg's scale filter keeps the *display*
  // aspect ratio by rewriting the sample aspect ratio, so a source with a
  // non-square SAR came out with the requested pixel dimensions but was
  // still displayed at the original shape (w_300,h_300 on a 16:9 source
  // encoded 300x300 with SAR 16:9, i.e. a 533x300 picture in every player).
  // Cropping needs a box to crop to, so it still takes both dimensions;
  // with only one given, fall through to the plain scale below.
  if ((crop === 'fill' || crop === 'crop') && valid(w) && valid(h)) {
    // Cover behavior (no stretching):
    // 1) scale until the smallest side reaches the target, preserving aspect ratio
    // 2) crop to exact WxH from the center
    const filter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
    return command.videoFilters(filter);
  } else {
    // Backwards-compatible behavior: simple resize to exact dimensions,
    // which may stretch to fit. Emitted as a filter rather than .size()
    // because fluent-ffmpeg appends its size filters *after* videoFilters,
    // so setsar=1 could not be chained behind that scale.
    // Dimensions rounded to multiples of 2, as .size() did - h264 refuses
    // odd ones. -2 for a side that wasn't asked for: ffmpeg derives it
    // from the source aspect ratio, already rounded to an even number.
    const even = (n: number): number => Math.round(n / 2) * 2;
    const sw = valid(w) ? even(w) : -2;
    const sh = valid(h) ? even(h) : -2;
    return command.videoFilters(`scale=${sw}:${sh},setsar=1`);
  }
};
