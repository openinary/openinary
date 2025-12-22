import { StorageConfig } from 'shared';
import { StorageCache } from './cache';
import { KeyGenerator } from './key-generator';
import { S3ClientWrapper } from './s3-client';
import logger from '../logger';

export class CloudStorage {
  private s3Client: S3ClientWrapper;
  private cache: StorageCache;

  constructor(config: StorageConfig) {
    this.s3Client = new S3ClientWrapper(config);
    this.cache = new StorageCache();
  }

  /**
   * Lists objects in storage (cloud only)
   */
  async list(prefix?: string): Promise<{ key: string; size?: number }[]> {
    return await this.s3Client.listObjects(prefix);
  }

  /**
   * Checks file existence with intelligent caching for transformed files
   */
  async exists(originalPath: string, params: any): Promise<boolean> {
    const key = KeyGenerator.generateKey(originalPath, params);
    const cacheKey = `exists:${key}`;
    const cached = this.cache.get(cacheKey);
    
    // OPTIMIZATION: Cache hit = 0 Class B operation
    if (cached) {
      return cached.exists;
    }
    
    // Only if not in cache
    const exists = await this.s3Client.objectExists(key);
    
    this.cache.set(cacheKey, {
      exists,
      timestamp: Date.now()
    });
    
    return exists;
  }

  /**
   * Checks the existence of an original file with cache (by original path)
   */
  async existsOriginal(originalPath: string): Promise<boolean> {
    return this.existsOriginalPath(originalPath);
  }

  /**
   * Checks the existence of an original file WITHOUT using cache
   * Used after deletion to ensure we don't serve stale cache data
   */
  async existsOriginalNoCache(originalPath: string): Promise<boolean> {
    const storageKey = `public/${originalPath}`;
    try {
      const exists = await this.s3Client.objectExists(storageKey);
      
      // Update cache with the fresh result
      this.cache.set(`original:${originalPath}`, {
        exists,
        timestamp: Date.now(),
      });
      
      return exists;
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          filePath: originalPath,
          metadata: error.$metadata,
        },
        "Cloud storage error while checking original path (no cache)"
      );
      return false;
    }
  }

  /**
   * Checks existence of an arbitrary original-path key (without params),
   * using the same semantics as uploadOriginal/downloadOriginal.
   * This is useful for detecting duplicate uploads by full path.
   */
  async existsOriginalPath(filePath: string): Promise<boolean> {
    const cacheKey = `original:${filePath}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached.exists;
    }

    const storageKey = `public/${filePath}`;
    try {
      const exists = await this.s3Client.objectExists(storageKey);

      this.cache.set(cacheKey, {
        exists,
        timestamp: Date.now(),
      });

      return exists;
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          filePath,
          metadata: error.$metadata,
        },
        "Cloud storage error while checking original path"
      );

      this.cache.set(cacheKey, {
        exists: false,
        timestamp: Date.now(),
      });
      return false;
    }
  }

  /**
   * Retrieves an original (unprocessed) file from the bucket
   */
  async downloadOriginal(originalPath: string): Promise<Buffer> {
    // Add public/ prefix for storage
    const storageKey = `public/${originalPath}`;
    return await this.s3Client.downloadObject(storageKey);
  }

  /**
   * Uploads an original (unprocessed) file to the bucket
   */
  async uploadOriginal(filePath: string, buffer: Buffer, contentType: string): Promise<string> {
    // Add public/ prefix for storage
    const storageKey = `public/${filePath}`;
    await this.s3Client.uploadObject(storageKey, buffer, contentType);

    // Mark the file as existing in the cache
    this.cache.set(`original:${filePath}`, {
      exists: true,
      timestamp: Date.now()
    });

    // Returns the public URL (without public/ prefix since it's internal)
    return this.s3Client.getPublicUrl(storageKey);
  }

  /**
   * Upload with cache invalidation
   */
  async upload(originalPath: string, params: any, buffer: Buffer, contentType: string): Promise<string> {
    const key = KeyGenerator.generateKey(originalPath, params);
    
    // Add metadata for easy cleanup later
    const metadata = {
      'x-original-path': originalPath
    };
    
    await this.s3Client.uploadObject(key, buffer, contentType, metadata);

    // Mark the file as existing in the cache
    this.cache.set(`exists:${key}`, {
      exists: true,
      timestamp: Date.now()
    });
    // Returns the public URL
    return this.s3Client.getPublicUrl(key);
  }

  /**
   * Retrieves a file from the bucket
   */
  async download(originalPath: string, params: any): Promise<Buffer> {
    const key = KeyGenerator.generateKey(originalPath, params);
    return await this.s3Client.downloadObject(key);
  }

  /**
   * Generates a signed URL for temporary access (optional)
   */
  async getSignedUrl(originalPath: string, params: any, expiresIn: number = 3600): Promise<string> {
    const key = KeyGenerator.generateKey(originalPath, params);
    return await this.s3Client.getSignedUrl(key, expiresIn);
  }

  /**
   * Deletes an original file from storage
   */
  async deleteOriginal(originalPath: string): Promise<void> {
    // Add public/ prefix for storage
    const storageKey = `public/${originalPath}`;
    await this.s3Client.deleteObject(storageKey);
    
    // Invalidate cache
    this.cache.delete(`original:${originalPath}`);
  }

  /**
   * Gets metadata for an original file (size, dates)
   */
  async getOriginalMetadata(originalPath: string): Promise<{ size: number; createdAt: Date; updatedAt: Date } | null> {
    const storageKey = `public/${originalPath}`;
    const metadata = await this.s3Client.getObjectMetadata(storageKey);
    
    if (!metadata) {
      return null;
    }

    // For S3, we use lastModified for both dates since S3 doesn't track creation time separately
    return {
      size: metadata.size,
      createdAt: metadata.lastModified,
      updatedAt: metadata.lastModified,
    };
  }

  /**
   * Gets metadata for an optimized/transformed file (size only)
   */
  async getOptimizedMetadata(originalPath: string, params: any): Promise<{ size: number } | null> {
    const key = KeyGenerator.generateKey(originalPath, params);
    const metadata = await this.s3Client.getObjectMetadata(key);
    
    if (!metadata) {
      return null;
    }

    return {
      size: metadata.size,
    };
  }

  /**
   * Invalidates the cache for a specific file
   */
  invalidateCache(originalPath: string, params?: any): void {
    if (params) {
      const key = KeyGenerator.generateKey(originalPath, params);
      this.cache.delete(`exists:${key}`);
    }
    this.cache.delete(`original:${originalPath}`);
  }

  /**
   * Deletes all cached transformations for an original file from cloud storage
   * Uses metadata to identify files belonging to the original path
   */
  async deleteAllCachedTransformations(originalPath: string): Promise<number> {
    try {
      // List all objects with cache/ prefix
      const cacheObjects = await this.s3Client.listObjects('cache/');
      
      const keysToDelete: string[] = [];
      
      // Check each object's metadata to see if it belongs to this original path
      for (const obj of cacheObjects) {
        try {
          const metadata = await this.s3Client.getObjectMetadata(obj.key);
          if (metadata?.metadata?.['x-original-path'] === originalPath) {
            keysToDelete.push(obj.key);
          }
        } catch (error) {
          // If we can't get metadata, skip this object
          logger.warn({ error, key: obj.key }, 'Failed to get metadata for cache object');
        }
      }
      
      if (keysToDelete.length === 0) {
        logger.debug({ originalPath }, 'No cached transformations found in cloud storage');
        return 0;
      }
      
      // Delete all identified objects
      const deletedCount = await this.s3Client.deleteObjects(keysToDelete);
      
      logger.info(
        { originalPath, deletedCount, totalFound: keysToDelete.length },
        'Deleted cached transformations from cloud storage'
      );
      
      return deletedCount;
    } catch (error) {
      logger.error({ error, originalPath }, 'Failed to delete cached transformations');
      throw error;
    }
  }

  /**
   * Invalidates all cache entries for a given original path
   * This clears the in-memory cache for both the original file and all its transformations
   */
  invalidateAllCacheEntries(originalPath: string): void {
    // Clear the original file cache
    this.cache.delete(`original:${originalPath}`);
    
    // Clear all transformation caches that might exist
    // We need to iterate through all cache keys and remove those related to this original path
    const allKeys = this.cache.getAllKeys();
    let deletedCount = 0;
    
    for (const key of allKeys) {
      // Keys for transformations contain the original path in their storage key
      // Format: exists:cache/${originalPath}-${hash}.ext
      if (key.includes(originalPath) || key.startsWith(`exists:cache/${originalPath}`)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    logger.debug({ originalPath, deletedCount }, 'Invalidated cache entries for original path');
  }
}