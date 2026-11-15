import { createWriteStream } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { CloudStorage } from "./storage/index";
import logger, { serializeError } from "./logger";
import type { EnginePaths } from "../config/paths";

export interface StagedSource {
  /** A local file sharp/ffmpeg can read. */
  path: string;
  /** Removes the file when it is a staged copy; a no-op for a local original. */
  cleanup(): Promise<void>;
}

async function tempPathFor(tempDir: string, filePath: string): Promise<string> {
  await mkdir(tempDir, { recursive: true });
  // Unique per call: two jobs on files with the same name must not share one.
  return path.join(tempDir, `${crypto.randomUUID()}-${path.basename(filePath)}`);
}

/** Deletes a temp file; one already gone is fine. */
export async function removeTempFile(tempPath: string): Promise<void> {
  try {
    await unlink(tempPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    logger.warn({ error: serializeError(error), tempPath }, "Failed to clean up temp file");
  }
}

/** Runs `write` into a fresh temp file, removing what it left if it fails. */
async function stagedCopy(
  tempDir: string,
  filePath: string,
  write: (tempPath: string) => Promise<void>,
): Promise<StagedSource> {
  const tempPath = await tempPathFor(tempDir, filePath);
  try {
    await write(tempPath);
  } catch (error) {
    await removeTempFile(tempPath);
    throw error;
  }
  return { path: tempPath, cleanup: () => removeTempFile(tempPath) };
}

/**
 * Puts the original of `filePath` on local disk: downloaded from `sourceUrl`
 * or the bucket into a unique temp file, or read in place from the public
 * folder when there is no storage.
 */
export async function stageSource(
  storage: CloudStorage | null,
  paths: Pick<EnginePaths, "public" | "temp">,
  filePath: string,
  sourceUrl?: string,
): Promise<StagedSource> {
  if (sourceUrl) {
    const response = await fetch(sourceUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch source (${response.status}) for ${filePath}`);
    }
    const body = response.body as import("stream/web").ReadableStream;
    // Streamed rather than buffered: an original can weigh hundreds of MB,
    // and this runs alongside whatever ffmpeg jobs are already resident.
    return stagedCopy(paths.temp, filePath, (tempPath) =>
      pipeline(Readable.fromWeb(body), createWriteStream(tempPath)),
    );
  }
  if (storage) {
    const buffer = await storage.downloadOriginal(filePath);
    return stagedCopy(paths.temp, filePath, (tempPath) => writeFile(tempPath, buffer));
  }
  return { path: path.join(paths.public, filePath), cleanup: async () => {} };
}
