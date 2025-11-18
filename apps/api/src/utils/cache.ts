import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { CacheStats } from 'shared';

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

  static async shouldKeepLocal(filePath: string, fileSize: number): Promise<boolean> {
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
    console.log('Performing cache cleanup...');
    
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
        console.warn(`Failed to cleanup cache file ${cachePath}:`, error);
      }
    }
    
    console.log(`Cache cleanup completed. Removed ${toRemove.length} entries.`);
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
    
    console.log(`Saved to cache: ${cachePath} (${buffer.length} bytes)`);
  } catch (error) {
    console.warn(`Failed to save to cache ${cachePath}:`, error);
  }
}

/**
 * Read buffer from cache
 */
export async function readFromCache(cachePath: string): Promise<Buffer> {
  try {
    return await fs.readFile(cachePath);
  } catch (error) {
    console.warn(`Failed to read from cache ${cachePath}:`, error);
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
      console.log(`Created cache directory: ${CACHE_DIR}`);
    }
  } catch (error) {
    console.warn('Failed to initialize cache directory:', error);
  }
}

// Initialize cache on module load
initializeCache();