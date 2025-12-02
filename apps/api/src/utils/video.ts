import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { mkdtemp, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const transformVideo = async (inputPath: string, params: any): Promise<Buffer> => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'video-'));
  const outputPath = join(tmpDir, `${randomUUID()}.mp4`);

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath).output(outputPath);

    if (params.resize) {
      const [w, h] = params.resize.split('x');
      const width = parseInt(w, 10);
      const height = parseInt(h, 10);

      if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
        if (params.crop === 'fill' || params.crop === 'crop') {
          // Cover behavior (no stretching):
          // 1) scale until the smallest side reaches the target, preserving aspect ratio
          // 2) crop to exact WxH from the center
          const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
          command = command.videoFilters(filter);
        } else {
          // Backwards-compatible behavior: simple resize to exact dimensions,
          // which may stretch to fit
          command = command.size(`${width}x${height}`);
        }
      }
    }

    // Video quality control via CRF (Constant Rate Factor)
    // CRF: 0 = lossless, 23 = default, 51 = lowest quality
    // For simplicity, we convert quality (0-100) to CRF (51-0)
    if (params.quality) {
      const quality = parseInt(params.quality);
      // Convert quality (0-100) to CRF (51-0)
      // quality 100 = CRF 18 (very high quality)
      // quality 50 = CRF 28 (medium quality)
      // quality 10 = CRF 45 (low quality)
      const crf = Math.round(51 - (quality / 100) * 33);
      command = command.videoCodec('libx264').addOption('-crf', crf.toString());
    }

    command
      .on('end', async () => {
        try {
          const buffer = await readFile(outputPath);
          await unlink(outputPath);
          resolve(buffer);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        reject(new Error(`Video processing failed: ${error.message}`));
      })
      .run();
  });
};
