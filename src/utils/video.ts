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
      command = command.size(`${w}x${h}`);
    }

    // Contrôle de la qualité vidéo via CRF (Constant Rate Factor)
    // CRF: 0 = lossless, 23 = défaut, 51 = qualité la plus basse
    // Pour simplifier, on convertit quality (0-100) vers CRF (51-0)
    if (params.quality) {
      const quality = parseInt(params.quality);
      // Convertir quality (0-100) vers CRF (51-0)
      // quality 100 = CRF 18 (très haute qualité)
      // quality 50 = CRF 28 (qualité moyenne)
      // quality 10 = CRF 45 (basse qualité)
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
