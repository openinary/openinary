import ffmpeg from 'fluent-ffmpeg';

/**
 * Video information extracted from ffprobe
 */
export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  bitrate: number;
  codec: string;
  size: number;
}

/**
 * Get video metadata using ffprobe
 * Useful for detecting resolution before processing
 */
export async function getVideoInfo(filePath: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`Failed to read video metadata: ${err.message}`));
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found in file'));
        return;
      }

      resolve({
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        duration: metadata.format.duration || 0,
        bitrate: metadata.format.bit_rate 
          ? (typeof metadata.format.bit_rate === 'string' 
              ? parseInt(metadata.format.bit_rate) 
              : metadata.format.bit_rate)
          : 0,
        codec: videoStream.codec_name || 'unknown',
        size: metadata.format.size || 0,
      });
    });
  });
}

/**
 * Check if video resolution is considered "large" (4K or higher)
 */
export function isLargeResolution(info: VideoInfo): boolean {
  // 4K is 3840x2160, we'll consider anything >= 3000 pixels wide as large
  return info.width >= 3000 || info.height >= 2000;
}

/**
 * Get human-readable resolution label
 */
export function getResolutionLabel(info: VideoInfo): string {
  if (info.width >= 7000) return '8K';
  if (info.width >= 5000) return '5K';
  if (info.width >= 3000) return '4K';
  if (info.width >= 2500) return '2.5K';
  if (info.width >= 1900) return '1080p';
  if (info.width >= 1200) return '720p';
  return `${info.width}x${info.height}`;
}

