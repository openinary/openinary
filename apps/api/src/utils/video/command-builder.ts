import ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg';
import { readFile, unlink, rmdir } from 'fs/promises';
import type { VideoContext, TransformFunction } from './types';

/**
 * Builder class for constructing and executing ffmpeg commands
 * Provides a fluent interface for applying multiple transformations
 */
export class VideoCommandBuilder {
  private command: FfmpegCommand;
  private context: VideoContext;

  constructor(context: VideoContext) {
    this.context = context;
    this.command = ffmpeg(context.inputPath).output(context.outputPath);
  }

  /**
   * Apply one or more transformation functions to the ffmpeg command
   * Returns this for method chaining
   */
  apply(...transforms: TransformFunction[]): this {
    for (const transform of transforms) {
      this.command = transform(this.command, this.context);
    }
    return this;
  }

  /**
   * Execute the ffmpeg command and return the output buffer
   * Handles cleanup of temporary files
   */
  async execute(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.command
        .on('end', async () => {
          try {
            // Read the output file
            const buffer = await readFile(this.context.outputPath);
            
            // Cleanup: remove output file and temp directory
            await unlink(this.context.outputPath);
            try {
              await rmdir(this.context.tmpDir);
            } catch {
              // Ignore if directory is not empty or already removed
            }
            
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
  }
}
