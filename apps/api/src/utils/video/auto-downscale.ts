import type { TransformFunction } from './types';

/**
 * Automatically downscale videos larger than 720p to reduce processing load
 * This prevents high-resolution videos (4K, 5K, 8K) from overwhelming the system
 * Only applies if no explicit resize parameters are provided
 * 
 * Uses 720p instead of 1080p for faster processing of very large videos (8K, 5K)
 * - 8K (7680x4320) -> 720p = 98% pixel reduction (vs 94% to 1080p)
 * - Processing time reduced by ~50% compared to 1080p output
 */
export const applyAutoDownscale: TransformFunction = (
  command,
  context
) => {
  // Skip for thumbnail extraction
  if (context.isThumbnail) {
    return command;
  }

  const { resize, width, height } = context.params;

  // Skip if user has explicitly specified dimensions
  if (resize || width !== undefined || height !== undefined) {
    return command;
  }

  // Auto-downscale to 720p max to reduce CPU/memory usage
  // Using 720p instead of 1080p significantly speeds up processing of 8K/5K videos
  // scale="min(1280\,iw):min(720\,ih)" means:
  // - Width: minimum of 1280 or original width
  // - Height: minimum of 720 or original height
  // - Force even dimensions (required for h264 encoding)
  const filter = "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";
  
  return command.videoFilters(filter);
};