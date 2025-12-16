import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { CacheStats } from 'shared';
import logger from './logger';

// Cache directory
const CACHE_DIR = './cache';

export class SmartCache {
  private static stats: CacheStats = {
    requests: new Map(),
    totalCacheSize: 0,
    maxCacheSize: 1024 * 1024 * 1024 // 1GB default
  };

  static async trackRequest(filePath: string, fileSize: number): Promise<void> {
    const existing = this.stats.requests.get(filePath);
    if (existing) {
      existing.count++;
      existing.lastAccess = Date.now();
      existing.totalSize = fileSize;
    } else {
      this.stats.requests.set(filePath, {
        count: 1,
        lastAccess: Date.now(),
        totalSize: fileSize
      });
    }
  }

  static async shouldKeepLocal(filePath: string, _fileSize: number): Promise<boolean> {
    const stats = this.stats.requests.get(filePath);
    if (!stats) return false;

    // Keep if accessed more than once in the last hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return stats.count > 1 && stats.lastAccess > oneHourAgo;
  }

  static async shouldCleanupCache(): Promise<boolean> {
    return this.stats.totalCacheSize > this.stats.maxCacheSize * 0.8;
  }

  static async performCleanup(): Promise<void> {
    logger.info('Performing cache cleanup...');
    
    // Get all cache entries sorted by last access time
    const entries = Array.from(this.stats.requests.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    // Remove oldest 20% of entries
    const toRemove = entries.slice(0, Math.floor(entries.length * 0.2));
    
    for (const [filePath] of toRemove) {
      const cachePath = getCachePath(filePath);
      try {
        if (existsSync(cachePath)) {
          await fs.unlink(cachePath);
          const stats = this.stats.requests.get(filePath);
          if (stats) {
            this.stats.totalCacheSize -= stats.totalSize;
          }
        }
        this.stats.requests.delete(filePath);
      } catch (error) {
        logger.warn({ error, cachePath }, 'Failed to cleanup cache file');
      }
    }
    
    logger.info({ removedCount: toRemove.length }, 'Cache cleanup completed');
  }
}

/**
 * Generate cache path for a given request path
 */
export function getCachePath(requestPath: string): string {
  // Create a safe filename from the request path
  const safePath = requestPath
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  return join(CACHE_DIR, safePath);
}

/**
 * Check if a file exists in cache
 */
export async function existsInCache(cachePath: string): Promise<boolean> {
  try {
    await fs.access(cachePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save buffer to cache
 */
export async function saveToCache(cachePath: string, buffer: Buffer): Promise<void> {
  try {
    // Ensure cache directory exists
    const cacheDir = dirname(cachePath);
    if (!existsSync(cacheDir)) {
      await fs.mkdir(cacheDir, { recursive: true });
    }
    
    await fs.writeFile(cachePath, buffer);
    
    // Update cache size tracking
    SmartCache['stats'].totalCacheSize += buffer.length;
    
    logger.debug({ cachePath, size: buffer.length }, 'Saved to cache');
  } catch (error) {
    logger.warn({ error, cachePath }, 'Failed to save to cache');
  }
}

/**
 * Read buffer from cache
 */
export async function readFromCache(cachePath: string): Promise<Buffer> {
  try {
    return await fs.readFile(cachePath);
  } catch (error) {
    logger.warn({ error, cachePath }, 'Failed to read from cache');
    throw error;
  }
}

/**
 * Initialize cache directory
 */
export async function initializeCache(): Promise<void> {
  try {
    if (!existsSync(CACHE_DIR)) {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      logger.info({ cacheDir: CACHE_DIR }, 'Created cache directory');
    }
  } catch (error) {
    logger.warn({ error, cacheDir: CACHE_DIR }, 'Failed to initialize cache directory');
  }
}

/**
 * Delete all cached files related to an original file path
 * This scans the cache directory and removes files that contain the original path in their name
 */
export async function deleteCachedFiles(originalPath: string): Promise<number> {
  try {
    if (!existsSync(CACHE_DIR)) {
      logger.debug({ originalPath }, 'Cache directory does not exist');
      return 0;
    }

    const files = await fs.readdir(CACHE_DIR);
    let deletedCount = 0;

    // Create a safe pattern to match files related to this original path
    // The cache path is generated from the request path which includes the original file
    const pathSegments = originalPath.split('/');
    const fileName = pathSegments[pathSegments.length - 1];
    const fileNameWithoutExt = fileName.split('.')[0];

    for (const file of files) {
      const filePath = join(CACHE_DIR, file);
      
      try {
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          // Check if this file is related to our original path
          // Cache files contain the original filename in their name
          if (file.includes(fileNameWithoutExt) || file.includes(originalPath.replace(/[^a-zA-Z0-9.-]/g, '_'))) {
            await fs.unlink(filePath);
            
            // Update cache stats
            const cachedStats = SmartCache['stats'].requests.get(originalPath);
            if (cachedStats) {
              SmartCache['stats'].totalCacheSize -= cachedStats.totalSize;
              SmartCache['stats'].requests.delete(originalPath);
            }
            
            deletedCount++;
            logger.debug({ file, originalPath }, 'Deleted cache file');
          }
        }
      } catch (error) {
        logger.warn({ error, file }, 'Failed to delete cache file');
      }
    }

    logger.info({ originalPath, deletedCount }, 'Deleted local cache files');
    return deletedCount;
  } catch (error) {
    logger.error({ error, originalPath }, 'Failed to delete cached files');
    return 0;
  }
}

// Initialize cache on module load
initializeCache();