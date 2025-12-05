import type { TransformFunction } from './types';

/**
 * Apply temporal trimming transformation
 * Cuts the video based on startOffset and endOffset parameters
 */
export const applyTrimming: TransformFunction = (
  command,
  context
) => {
  // Skip trimming for thumbnail extraction
  if (context.isThumbnail) {
    return command;
  }

  const { startOffset, endOffset } = context.params;

  // Apply start offset if specified
  if (startOffset !== undefined && startOffset >= 0) {
    command = command.seekInput(startOffset);
  }

  // Calculate and apply duration if end offset is specified
  let durationSeconds: number | undefined;
  if (endOffset !== undefined && endOffset >= 0) {
    if (startOffset !== undefined && startOffset >= 0) {
      // Duration = endOffset - startOffset (trim between start and end)
      const diff = endOffset - startOffset;
      if (diff > 0) {
        durationSeconds = diff;
      }
    } else {
      // Only endOffset specified → interpret as "play first endOffset seconds"
      durationSeconds = endOffset;
    }
  }

  // Apply duration if calculated
  if (durationSeconds !== undefined && durationSeconds > 0) {
    command = command.duration(durationSeconds);
  }

  return command;
};
