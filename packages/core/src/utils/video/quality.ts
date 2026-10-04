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

  const isValid = !isNaN(qualityValue) && qualityValue >= 0 && qualityValue <= 100;

  // Convert quality (0-100) to CRF (51-0)
  // Higher quality = lower CRF
  const crf = Math.round(51 - ((isValid ? qualityValue : defaultQuality) / 100) * 33);

  // WebM only muxes VP8/VP9/AV1 video and Vorbis/Opus audio: libx264 with a
  // copied AAC track fails at header write ("Only VP8 or VP9 or AV1 video and
  // Vorbis or Opus audio ... are supported for WebM"), so every f_webm job
  // errored within a second and was re-queued by the next request.
  if (context.outputPath.toLowerCase().endsWith('.webm')) {
    return command
      .videoCodec('libvpx-vp9')
      .addOption('-crf', crf.toString())
      .addOption('-b:v', '0')               // Constant-quality mode, CRF alone drives the rate
      .addOption('-deadline', 'realtime')   // VP9's ultrafast equivalent
      .addOption('-cpu-used', '8')
      .addOption('-row-mt', '1')
      .audioCodec('libopus');
  }

  // Validate quality range (0-100)
  if (!isValid) {
    // Use default if invalid
    return command
      .videoCodec('libx264')
      .addOption('-preset', 'ultrafast')  // Ultra fast preset for local dev
      .addOption('-crf', crf.toString())
      .audioCodec('copy');  // Copy audio without re-encoding
  }

  return command
    .videoCodec('libx264')
    .addOption('-preset', 'ultrafast')
    .addOption('-crf', crf.toString())
    .addOption('-tune', 'fastdecode')    // Optimize for fast decoding
    .addOption('-profile:v', 'baseline') // Use baseline profile for compatibility & speed
    .addOption('-level', '3.0')          // Lower level = simpler encoding
    .audioCodec('copy');  // Copy audio without re-encoding
};
