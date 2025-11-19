import { StorageConfig } from 'shared';
import { StorageCache } from './cache';
import { KeyGenerator } from './key-generator';
import { S3ClientWrapper } from './s3-client';

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
   * Checks file existence with intelligent caching
   */
  async exists(originalPath: string, params: any): Promise<boolean> {
    const key = KeyGenerator.generateKey(originalPath, params);
    const cacheKey = `exists:${key}`;
    const cached = this.cache.get(cacheKey);
    
    // OPTIMIZATION: Cache hit = 0 Class B operation
    if (cached) {
      console.log(`Cache hit for exists check: ${key}`);
      return cached.exists;
    }
    
    // Only if not in cache
    console.log(`Checking R2 for: ${key}`);
    const exists = await this.s3Client.objectExists(key);
    
    this.cache.set(cacheKey, {
      exists,
      timestamp: Date.now()
    });
    
    return exists;
  }

  /**
   * Checks the existence of an original file with cache
   */
  async existsOriginal(originalPath: string): Promise<boolean> {
    const cacheKey = `original:${originalPath}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      console.log(`Cache hit for original exists check: ${originalPath}`);
      return cached.exists;
    }
    
    // Add public/ prefix for storage
    const storageKey = `public/${originalPath}`;
    console.log(`Checking R2 for original: ${storageKey}`);
    try {
      const exists = await this.s3Client.objectExists(storageKey);
      
      this.cache.set(cacheKey, {
        exists,
        timestamp: Date.now()
      });
      
      return exists;
    } catch (error: any) {
      console.error(`Cloud storage error for ${originalPath}:`, error.message);
      if (error.$metadata) {
        console.error(`Error metadata:`, error.$metadata);
      }
      
      this.cache.set(cacheKey, {
        exists: false,
        timestamp: Date.now()
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
    
    console.log(`Uploaded original file to cloud: ${storageKey}`);

    // Returns the public URL (without public/ prefix since it's internal)
    return this.s3Client.getPublicUrl(storageKey);
  }

  /**
   * Upload with cache invalidation
   */
  async upload(originalPath: string, params: any, buffer: Buffer, contentType: string): Promise<string> {
    const key = KeyGenerator.generateKey(originalPath, params);
    
    await this.s3Client.uploadObject(key, buffer, contentType);

    // Mark the file as existing in the cache
    this.cache.set(`exists:${key}`, {
      exists: true,
      timestamp: Date.now()
    });
    
    console.log(`Cache updated after upload: ${key}`);

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
   * Invalidates the cache for a specific file
   */
  invalidateCache(originalPath: string, params?: any): void {
    if (params) {
      const key = KeyGenerator.generateKey(originalPath, params);
      this.cache.delete(`exists:${key}`);
    }
    this.cache.delete(`original:${originalPath}`);
    console.log(`Cache invalidated for: ${originalPath}`);
  }
}