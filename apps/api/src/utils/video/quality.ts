import type { TransformFunction } from './types';

/**
 * Apply quality settings to a video using CRF (Constant Rate Factor)
 * CRF range: 0 (lossless) to 51 (lowest quality)
 * 
 * Quality mapping:
 * - quality 100 → CRF 18 (very high quality)
 * - quality 50 → CRF 28 (medium quality)
 * - quality 10 → CRF 45 (low quality)
 */
export const applyQuality: TransformFunction = (
  command,
  context
) => {
  // Skip quality settings for thumbnail extraction
  if (context.isThumbnail) {
    return command;
  }

  const { quality } = context.params;

  // Skip if quality is not specified
  if (quality === undefined) {
    return command;
  }

  // Parse quality value
  const qualityValue = typeof quality === 'string' ? parseInt(quality, 10) : quality;

  // Validate quality range (0-100)
  if (isNaN(qualityValue) || qualityValue < 0 || qualityValue > 100) {
    return command;
  }

  // Convert quality (0-100) to CRF (51-0)
  // Higher quality = lower CRF
  const crf = Math.round(51 - (qualityValue / 100) * 33);

  return command
    .videoCodec('libx264')
    .addOption('-crf', crf.toString());
};
