import ffmpeg, { FfmpegCommand, FilterSpecification } from "fluent-ffmpeg";
import { readFile, unlink, rmdir } from "fs/promises";
import type { VideoContext, TransformFunction } from "./types";
import { FFMPEG_THREADS, FFMPEG_NICENESS } from "./config";
import { expectedOutputSeconds } from "../../eta";

/**
 * How far an encode has got. outputSeconds is the duration of the video being
 * produced (the source's, trimmed), which is what the fraction is measured
 * against.
 */
export interface EncodeProgress {
  fraction: number;
  outputSeconds: number;
}

/** "HH:MM:SS.xx", as ffmpeg prints durations and timemarks, in seconds */
function parseTimemark(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/**
 * Builder class for constructing and executing ffmpeg commands
 * Provides a fluent interface for applying multiple transformations
 */
export class VideoCommandBuilder {
  private command: FfmpegCommand;
  private complexFilter: FilterSpecification[];
  private outputVideoStream: string;
  private context: VideoContext;
  private cleanupFunctions: ((() => void) | (() => Promise<void>))[];

  constructor(context: VideoContext) {
    this.context = context;
    this.complexFilter = [];
    this.outputVideoStream = "0:v";
    this.cleanupFunctions = [];
    // niceness lowers ffmpeg's scheduling priority so encoding never starves
    // the HTTP event loop; threads are capped to the container's effective
    // CPUs (leaving one for serving) instead of a hardcoded value
    this.command = ffmpeg(context.inputPath, { niceness: FFMPEG_NICENESS })
      .output(context.outputPath)
      .addOption("-threads", String(FFMPEG_THREADS));

    // -movflags and -max_muxing_queue_size are MOV/MP4 container options and are
    // incompatible with image output formats (image2 muxer used for thumbnails).
    // Only apply them for video output.
    if (!context.isImageOutput) {
      this.command = this.command
        .addOption("-movflags", "+faststart") // Optimize for web streaming
        .addOption("-max_muxing_queue_size", "1024"); // Prevent buffer issues
    }
  }

  /**
   * Apply one or more transformation functions to the ffmpeg command
   * Returns this for method chaining
   */
  async apply(...transforms: TransformFunction[]): Promise<this> {
    for (const transform of transforms) {
      const response = await transform(
        this.command,
        this.outputVideoStream,
        this.context,
      );

      if (!response) continue;

      const { command, complexFilters, outputVideoStream, cleanupFunc } =
        response;

      if (command) this.command = command;
      if (complexFilters) this.complexFilter.push(...complexFilters);
      if (outputVideoStream) this.outputVideoStream = outputVideoStream;
      if (cleanupFunc) this.cleanupFunctions.push(cleanupFunc);
    }
    return this;
  }

  /**
   * Execute the ffmpeg command and return the output buffer
   * Handles cleanup of temporary files
   * Includes a 5-minute timeout to handle large videos (4K, 8K)
   *
   * onProgress is measured against the output's own duration rather than
   * fluent-ffmpeg's `percent`, which divides by the *input* duration and so
   * never gets past a fraction of the way on a trimmed video.
   */
  async execute(onProgress?: (progress: EncodeProgress) => void): Promise<Buffer> {
    const TIMEOUT_MS = 300000; // 5 minutes (increased for 8K videos)

    if (this.complexFilter.length > 0) {
      this.command
        .complexFilter(this.complexFilter)
        .outputOptions(["-map", `[${this.outputVideoStream}]`, "-map", "0:a?"]);
    }

    return new Promise((resolve, reject) => {
      // Set timeout to kill ffmpeg if it takes too long
      const timeoutId = setTimeout(() => {
        this.command.kill("SIGKILL");
        reject(
          new Error(
            "Video processing timeout: exceeded 5 minutes. Try reducing video resolution or duration.",
          ),
        );
      }, TIMEOUT_MS);

      this.command.on("start", (cmd) => {
        console.log(cmd);
      });
      
      if (onProgress) {
        let outputSeconds: number | null = null;
        this.command
          .on('codecData', (data: { duration?: string }) => {
            outputSeconds = expectedOutputSeconds(
              parseTimemark(data.duration),
              this.context.params,
            );
          })
          .on('progress', (progress: { timemark?: string }) => {
            const done = parseTimemark(progress.timemark);
            if (!outputSeconds || done === null) return;
            onProgress({
              fraction: Math.min(1, Math.max(0, done / outputSeconds)),
              outputSeconds,
            });
          });
      }

      this.command
        .on("end", async () => {
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
          } finally {
            try {
              this.cleanup();
            } catch (error) {
              reject(error);
            }
          }
        })
        .on("error", (error) => {
          clearTimeout(timeoutId);
          this.cleanup();
          reject(new Error(`Video processing failed: ${error.message}`));
        })
        .run();
    });
  }

  async cleanup(): Promise<void> {
    for (const func of this.cleanupFunctions) {
      await func();
    }
  }
}
