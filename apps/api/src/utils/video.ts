import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { mkdtemp, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const transformVideo = async (inputPath: string, params: any): Promise<Buffer> => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'video-'));
  const sourceExt = inputPath.split(".").pop()?.toLowerCase();

  const requestedFormat = (params.format as string | undefined)?.toLowerCase();
  const imageFormats = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);
  const videoFormats = new Set(["mp4", "mov", "webm"]);

  const isImageFormat =
    !!requestedFormat && imageFormats.has(requestedFormat === "jpeg" ? "jpg" : requestedFormat);
  const isVideoSource = !!sourceExt && videoFormats.has(sourceExt);
  const isThumbnail = isVideoSource && isImageFormat;

  // Decide output extension:
  // - Thumbnail => image format (default jpg)
  // - Video transform => requested video format or fall back to mp4
  let outputExt: string;
  if (isThumbnail) {
    const baseImageExt = requestedFormat === "jpeg" ? "jpg" : requestedFormat;
    outputExt = baseImageExt && imageFormats.has(baseImageExt) ? baseImageExt : "jpg";
  } else {
    const baseVideoExt =
      requestedFormat && videoFormats.has(requestedFormat) ? requestedFormat : "mp4";
    outputExt = baseVideoExt;
  }

  const outputPath = join(tmpDir, `${randomUUID()}.${outputExt}`);

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    const hasStartOffset = params.startOffset !== undefined && params.startOffset !== null;
    const offsetSeconds = hasStartOffset ? parseFloat(String(params.startOffset)) : undefined;

    const hasEndOffset = params.endOffset !== undefined && params.endOffset !== null;
    const endSeconds = hasEndOffset ? parseFloat(String(params.endOffset)) : undefined;

    let durationSeconds: number | undefined;
    if (!isNaN(endSeconds as number) && (endSeconds as number) >= 0) {
      if (!isNaN(offsetSeconds as number) && (offsetSeconds as number) >= 0) {
        // Duration = eo - so (trim between start and end)
        const diff = (endSeconds as number) - (offsetSeconds as number);
        if (diff > 0) {
          durationSeconds = diff;
        }
      } else {
        // Only eo specified → interpret as "play first eo seconds"
        durationSeconds = endSeconds as number;
      }
    }

    if (!isNaN(offsetSeconds as number) && (offsetSeconds as number) >= 0) {
      // For both thumbnail and trimmed video, seek to the start offset
      command = command.seekInput(offsetSeconds as number);
    }

    // For video (non-thumbnail) transformations, honor end offset / duration
    if (!isThumbnail && durationSeconds && durationSeconds > 0) {
      command = command.duration(durationSeconds);
    }

    // Thumbnail mode: seek to offset (if any) and grab a single frame as image
    if (isThumbnail) {
      command = command.frames(1).outputOptions(["-f", "image2"]);
    }

    command = command.output(outputPath);

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
    if (!isThumbnail && params.quality) {
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
