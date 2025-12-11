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
    this.command = ffmpeg(context.inputPath)
      .output(context.outputPath)
      .addOption('-threads', '4')           // Increased to 4 threads for better performance
      .addOption('-movflags', '+faststart') // Optimize for web streaming
      .addOption('-max_muxing_queue_size', '1024'); // Prevent buffer issues
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
   * Includes a 5-minute timeout to handle large videos (4K, 8K)
   */
  async execute(): Promise<Buffer> {
    const TIMEOUT_MS = 300000; // 5 minutes (increased for 8K videos)
    
    return new Promise((resolve, reject) => {
      // Set timeout to kill ffmpeg if it takes too long
      const timeoutId = setTimeout(() => {
        this.command.kill('SIGKILL');
        reject(new Error('Video processing timeout: exceeded 5 minutes. Try reducing video resolution or duration.'));
      }, TIMEOUT_MS);
      
      this.command
        .on('end', async () => {
          clearTimeout(timeoutId);
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
          clearTimeout(timeoutId);
          reject(new Error(`Video processing failed: ${error.message}`));
        })
        .run();
    });
  }
}
