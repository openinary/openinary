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

  // Default quality if not specified: 60 (CRF 31 - faster encoding for 8K)
  // This prevents ffmpeg from re-encoding without compression
  // Lower quality = faster encoding, especially important for 8K videos
  const defaultQuality = 60;
  const qualityValue = quality !== undefined
    ? (typeof quality === 'string' ? parseInt(quality, 10) : quality)
    : defaultQuality;

  // Validate quality range (0-100)
  if (isNaN(qualityValue) || qualityValue < 0 || qualityValue > 100) {
    // Use default if invalid
    const crf = Math.round(51 - (defaultQuality / 100) * 33);
    return command
      .videoCodec('libx264')
      .addOption('-preset', 'ultrafast')  // Ultra fast preset for local dev
      .addOption('-crf', crf.toString())
      .audioCodec('copy');  // Copy audio without re-encoding
  }

  // Convert quality (0-100) to CRF (51-0)
  // Higher quality = lower CRF
  const crf = Math.round(51 - (qualityValue / 100) * 33);

  return command
    .videoCodec('libx264')
    .addOption('-preset', 'ultrafast')
    .addOption('-crf', crf.toString())
    .addOption('-tune', 'fastdecode')    // Optimize for fast decoding
    .addOption('-profile:v', 'baseline') // Use baseline profile for compatibility & speed
    .addOption('-level', '3.0')          // Lower level = simpler encoding
    .audioCodec('copy');  // Copy audio without re-encoding
};
