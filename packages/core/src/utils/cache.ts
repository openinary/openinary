import { promises as fs } from "fs";
import { basename, dirname, join } from "path";
import { sortedKey } from "../url/cache-key";
import logger, { serializeError } from "./logger";

// Per process: which originals were requested more than once lately, the
// ones whose derivatives are worth a copy on local disk.
const requests = new Map<string, { count: number; lastAccess: number }>();
// ponytail: insertion-order eviction, not LRU; fine as a popularity hint.
const MAX_TRACKED = 10_000;

export const SmartCache = {
  trackRequest(filePath: string): void {
    const existing = requests.get(filePath);
    if (existing) {
      existing.count++;
      existing.lastAccess = Date.now();
      return;
    }
    if (requests.size >= MAX_TRACKED) requests.delete(requests.keys().next().value!);
    requests.set(filePath, { count: 1, lastAccess: Date.now() });
  },

  /** Kept when requested more than once in the last hour. */
  shouldKeepLocal(filePath: string): boolean {
    const stats = requests.get(filePath);
    return !!stats && stats.count > 1 && stats.lastAccess > Date.now() - 60 * 60 * 1000;
  },
};

const safeName = (path: string) =>
  path
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

/**
 * Local cache file of the derivative of `filePath` under `params`. Keyed like
 * the bucket (param order does not matter) and ending with the flattened
 * original path, which is how deleteCachedFiles finds it.
 */
export function derivativeCachePath(cacheDir: string, filePath: string, params: object): string {
  return join(cacheDir, safeName(`${basename(sortedKey(filePath, params))}/${filePath}`));
}

export async function existsInCache(cachePath: string): Promise<boolean> {
  try {
    await fs.access(cachePath);
    return true;
  } catch {
    return false;
  }
}

export async function saveToCache(cachePath: string, buffer: Buffer): Promise<void> {
  try {
    await fs.mkdir(dirname(cachePath), { recursive: true });
    // Written to a temp file and renamed rather than written in place: rename
    // is atomic, so a concurrent existsInCache/readFromCache never observes a
    // half-written entry and hands back a truncated image.
    const tmpPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmpPath, buffer);
    await fs.rename(tmpPath, cachePath);
    logger.debug({ cachePath, size: buffer.length }, "Saved to cache");
  } catch (error) {
    logger.warn({ error: serializeError(error), cachePath }, "Failed to save to cache");
  }
}

export async function readFromCache(cachePath: string): Promise<Buffer> {
  return fs.readFile(cachePath);
}

async function cacheFiles(cacheDir: string): Promise<{ name: string; size: number }[]> {
  let names: string[];
  try {
    names = await fs.readdir(cacheDir);
  } catch {
    return [];
  }
  const files: { name: string; size: number }[] = [];
  for (const name of names) {
    try {
      const stats = await fs.stat(join(cacheDir, name));
      if (stats.isFile()) files.push({ name, size: stats.size });
    } catch (error) {
      logger.warn({ error: serializeError(error), file: name }, "Failed to stat cache file");
    }
  }
  return files;
}

async function deleteFiles(cacheDir: string, names: string[]): Promise<number> {
  let deleted = 0;
  for (const name of names) {
    try {
      await fs.unlink(join(cacheDir, name));
      deleted++;
    } catch (error) {
      logger.warn({ error: serializeError(error), file: name }, "Failed to delete cache file");
    }
  }
  return deleted;
}

/**
 * Deletes the local derivatives of one original: the cache files ending with
 * its flattened path (see derivativeCachePath).
 */
// ponytail: the flattening is lossy, so "q/photos/cat.jpg"'s derivatives go
// too. Harmless (they regenerate); key files by original if it ever matters.
export async function deleteCachedFiles(
  cacheDir: string,
  originalPath: string,
): Promise<number> {
  const suffix = `_${safeName(originalPath)}`;
  const matching = (await cacheFiles(cacheDir)).filter((f) => f.name.endsWith(suffix));
  const deleted = await deleteFiles(cacheDir, matching.map((f) => f.name));
  requests.delete(originalPath);
  logger.info({ originalPath, deletedCount: deleted }, "Deleted local cache files");
  return deleted;
}

export async function getCacheSize(
  cacheDir: string,
): Promise<{ size: number; fileCount: number }> {
  const files = await cacheFiles(cacheDir);
  return { size: files.reduce((sum, f) => sum + f.size, 0), fileCount: files.length };
}

export async function clearAllCache(cacheDir: string): Promise<number> {
  const files = await cacheFiles(cacheDir);
  const deleted = await deleteFiles(cacheDir, files.map((f) => f.name));
  requests.clear();
  logger.info({ deletedCount: deleted }, "Cleared all local cache files");
  return deleted;
}
