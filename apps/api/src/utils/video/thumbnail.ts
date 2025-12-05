import type { TransformFunction } from './types';

/**
 * Apply thumbnail extraction transformation
 * Extracts a single frame from the video at the specified time
 */
export const applyThumbnailExtraction: TransformFunction = (
  command,
  context
) => {
  if (!context.isThumbnail) {
    return command;
  }

  // Determine the time to extract the thumbnail from
  // Priority: thumbnailTime > startOffset > 0
  const time = 
    context.params.thumbnailTime ?? 
    context.params.startOffset ?? 
    0;

  // Seek to the specified time and extract a single frame
  return command
    .seekInput(time)
    .frames(1)
    .outputOptions(["-f", "image2"]);
};
