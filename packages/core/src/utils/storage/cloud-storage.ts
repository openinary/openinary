import { StorageConfig, StorageClientOptions } from "./types";
import { StorageCache } from "./cache";
import { KeyGenerator } from "./key-generator";
import { S3ClientWrapper } from "./s3-client";
import logger, { serializeError } from "../logger";
import {
  FOLDER_SUMMARY_MAX_KEYS,
  shapeFolderSummary,
  shapeLevel,
  type FolderSummary,
  type LevelFile,
} from "../storage-level";
import {
  adjustBucketStats,
  type AggregateStats,
  type BucketStats,
  type StatsBackend,
} from "./stats-tracker";

// Lives at the bucket root, outside public/ and cache/, so it never shows up
// in media listings or cache stats
const STATS_OBJECT_KEY = ".openinary/stats.json";

function isAggregateStats(value: unknown): value is AggregateStats {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AggregateStats).size === "number" &&
    typeof (value as AggregateStats).fileCount === "number"
  );
}

export class CloudStorage implements StatsBackend {
  private s3Client: S3ClientWrapper;
  private cache: StorageCache;

  constructor(config: StorageConfig, clientOptions?: StorageClientOptions) {
    this.s3Client = new S3ClientWrapper(config, clientOptions);
    this.cache = new StorageCache();
  }

  /**
   * Lists objects in storage (cloud only)
   */
  async list(
    prefix?: string,
  ): Promise<{ key: string; size?: number; lastModified?: Date }[]> {
    return await this.s3Client.listObjects(prefix);
  }

  /**
   * Lists one directory level (direct child prefixes + objects) using Delimiter: "/"
   */
  async listDelimited(prefix: string): Promise<{
    prefixes: string[];
    objects: { key: string; size?: number; lastModified?: Date }[];
  }> {
    return await this.s3Client.listDelimited(prefix);
  }

  /**
   * Lists a single page of one directory level (bounded by maxKeys)
   */
  async listDelimitedPage(
    prefix: string,
    maxKeys?: number,
  ): Promise<{
    prefixes: string[];
    objects: { key: string; size?: number; lastModified?: Date }[];
    isTruncated: boolean;
  }> {
    return await this.s3Client.listDelimitedPage(prefix, maxKeys);
  }

  /**
   * Lists all objects under a prefix by fanning out one recursive listing per
   * top-level folder in parallel, instead of a single sequential pagination
   */
  async listAllParallel(
    prefix: string,
  ): Promise<{ key: string; size?: number; lastModified?: Date }[]> {
    const topLevel = await this.s3Client.listDelimited(prefix);
    const results = [...topLevel.objects];

    const batchSize = 16;
    for (let i = 0; i < topLevel.prefixes.length; i += batchSize) {
      const batch = topLevel.prefixes.slice(i, i + batchSize);
      const nested = await Promise.all(
        batch.map((folderPrefix) => this.s3Client.listObjects(folderPrefix)),
      );
      for (const objects of nested) {
        results.push(...objects);
      }
    }

    return results;
  }

  /**
   * Lists one directory level of original files (under public/)
   */
  async listLevel(
    folderPath: string,
  ): Promise<{ folderNames: string[]; files: LevelFile[] }> {
    const storagePrefix = folderPath ? `public/${folderPath}/` : "public/";
    const delimited = await this.s3Client.listDelimited(storagePrefix);
    return shapeLevel(storagePrefix, folderPath, delimited);
  }

  /**
   * Gets a bounded summary of a folder (direct child count, truncation flag,
   * media preview items) from a single delimiter-listed page
   */
  async getFolderSummary(
    folderPath: string,
    maxKeys = FOLDER_SUMMARY_MAX_KEYS,
  ): Promise<FolderSummary> {
    const storagePrefix = `public/${folderPath}/`;
    const page = await this.s3Client.listDelimitedPage(storagePrefix, maxKeys);
    return shapeFolderSummary(storagePrefix, folderPath, page);
  }

  /**
   * Creates a folder marker object so empty folders are visible in S3-compatible storage
   */
  async createFolder(folderPath: string): Promise<void> {
    const normalized = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const storageKey = `public/${normalized}/`;

    await this.s3Client.createFolderMarker(storageKey);
  }

  /**
   * Checks whether a folder exists (marker or any object with the folder prefix)
   */
  async folderExists(folderPath: string): Promise<boolean> {
    const normalized = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const markerKey = `public/${normalized}/`;

    if (await this.s3Client.objectExists(markerKey)) {
      return true;
    }

    const prefixedObjects = await this.s3Client.listObjects(markerKey, 1);
    return prefixedObjects.length > 0;
  }

  /**
   * Renames/moves all objects under a folder prefix to a new prefix (copy + delete each)
   */
  async renameFolder(oldFolderPath: string, newFolderPath: string): Promise<void> {
    const normalizedOld = oldFolderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const normalizedNew = newFolderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const prefix = `public/${normalizedOld}/`;

    const objects = await this.s3Client.listObjects(prefix);

    for (const obj of objects) {
      const relativeKey = obj.key.slice(prefix.length);
      const destKey = `public/${normalizedNew}/${relativeKey}`;
      await this.s3Client.copyObject(obj.key, destKey);
      await this.s3Client.deleteObject(obj.key);
    }

    this.cache.delete(`original:${normalizedOld}`);
  }

  /**
   * Deletes all objects under a folder prefix (marker + contents)
   */
  async deleteFolder(folderPath: string): Promise<number> {
    const normalized = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const prefix = `public/${normalized}/`;

    const objects = await this.s3Client.listObjects(prefix);
    if (objects.length === 0) {
      return 0;
    }

    const keys = objects.map((obj) => obj.key);
    const deleted = await this.s3Client.deleteObjects(keys);

    // Folder markers are excluded from stats, so only count real files
    let deletedSize = 0;
    let deletedFiles = 0;
    for (const obj of objects) {
      if (obj.key.endsWith("/")) continue;
      deletedSize += obj.size ?? 0;
      deletedFiles += 1;
    }
    if (deletedFiles > 0) {
      adjustBucketStats(this, "storage", {
        size: -deletedSize,
        fileCount: -deletedFiles,
      });
    }

    // Invalidate in-memory cache for all deleted keys
    this.cache.delete(`original:${normalized}`);

    return deleted;
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
      timestamp: Date.now(),
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
        "Cloud storage error while checking original path (no cache)",
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
        "Cloud storage error while checking original path",
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
   * Retrieves an original (unprocessed) file as a stream, without buffering
   * it in memory. Used to serve large originals (e.g. videos still being
   * optimized) directly to clients.
   */
  async downloadOriginalStream(originalPath: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    contentLength?: number;
    contentType?: string;
  }> {
    const storageKey = `public/${originalPath}`;
    return await this.s3Client.downloadObjectStream(storageKey);
  }

  /**
   * Uploads an original (unprocessed) file to the bucket
   */
  async uploadOriginal(
    filePath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    // Add public/ prefix for storage
    const storageKey = `public/${filePath}`;
    await this.s3Client.uploadObject(storageKey, buffer, contentType);

    adjustBucketStats(this, "storage", { size: buffer.length, fileCount: 1 });

    // Mark the file as existing in the cache
    this.cache.set(`original:${filePath}`, {
      exists: true,
      timestamp: Date.now(),
    });

    // Returns the public URL (without public/ prefix since it's internal)
    return this.s3Client.getPublicUrl(storageKey);
  }

  /**
   * Upload with cache invalidation
   */
  async upload(
    originalPath: string,
    params: any,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const key = KeyGenerator.generateKey(originalPath, params);

    // Add metadata for easy cleanup later
    // Encoded because x-amz-meta-* header values must be ASCII-safe;
    // some S3-compatible providers reject non-ASCII bytes outright.
    const metadata = {
      "x-original-path": encodeURIComponent(originalPath),
    };

    await this.s3Client.uploadObject(key, buffer, contentType, metadata);

    adjustBucketStats(this, "cache", { size: buffer.length, fileCount: 1 });

    // Mark the file as existing in the cache
    this.cache.set(`exists:${key}`, {
      exists: true,
      timestamp: Date.now(),
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
  async getSignedUrl(
    originalPath: string,
    params: any,
    expiresIn: number = 3600,
  ): Promise<string> {
    const key = KeyGenerator.generateKey(originalPath, params);
    return await this.s3Client.getSignedUrl(key, expiresIn);
  }

  /**
   * Deletes an original file from storage
   */
  async deleteOriginal(originalPath: string): Promise<void> {
    // Add public/ prefix for storage
    const storageKey = `public/${originalPath}`;
    // HEAD first: the deleted object's size is needed for stats tracking,
    // and a delete on a missing key succeeds silently
    const metadata = await this.s3Client.getObjectMetadata(storageKey);
    await this.s3Client.deleteObject(storageKey);

    if (metadata) {
      adjustBucketStats(this, "storage", {
        size: -metadata.size,
        fileCount: -1,
      });
    }

    // Invalidate cache
    this.cache.delete(`original:${originalPath}`);
  }

  /**
   * Copies an original file to a new path within storage
   */
  async copyOriginal(sourcePath: string, destPath: string): Promise<void> {
    const sourceKey = `public/${sourcePath}`;
    const destKey = `public/${destPath}`;
    await this.s3Client.copyObject(sourceKey, destKey);

    const metadata = await this.s3Client.getObjectMetadata(destKey);
    if (metadata) {
      adjustBucketStats(this, "storage", {
        size: metadata.size,
        fileCount: 1,
      });
    }

    // Mark the new file as existing in the cache
    this.cache.set(`original:${destPath}`, {
      exists: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Renames/moves an original file to a new path (copy + delete)
   */
  async renameOriginal(sourcePath: string, destPath: string): Promise<void> {
    await this.copyOriginal(sourcePath, destPath);
    await this.deleteOriginal(sourcePath);
  }

  /**
   * Gets metadata for an original file (size, dates)
   */
  async getOriginalMetadata(
    originalPath: string,
  ): Promise<{ size: number; createdAt: Date; updatedAt: Date } | null> {
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
  async getOptimizedMetadata(
    originalPath: string,
    params: any,
  ): Promise<{ size: number } | null> {
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
      const cacheObjects = await this.s3Client.listObjects("cache/");

      const keysToDelete: string[] = [];
      let sizeToDelete = 0;

      // Check each object's metadata to see if it belongs to this original path
      for (const obj of cacheObjects) {
        try {
          const metadata = await this.s3Client.getObjectMetadata(obj.key);
          if (
            metadata?.metadata?.["x-original-path"] ===
            encodeURIComponent(originalPath)
          ) {
            keysToDelete.push(obj.key);
            sizeToDelete += obj.size ?? 0;
          }
        } catch (error) {
          // If we can't get metadata, skip this object
          logger.warn(
            { error: serializeError(error), key: obj.key },
            "Failed to get metadata for cache object",
          );
        }
      }

      if (keysToDelete.length === 0) {
        logger.debug(
          { originalPath },
          "No cached transformations found in cloud storage",
        );
        return 0;
      }

      // Delete all identified objects
      const deletedCount = await this.s3Client.deleteObjects(keysToDelete);

      adjustBucketStats(this, "cache", {
        size: -sizeToDelete,
        fileCount: -keysToDelete.length,
      });

      logger.info(
        { originalPath, deletedCount, totalFound: keysToDelete.length },
        "Deleted cached transformations from cloud storage",
      );

      return deletedCount;
    } catch (error) {
      logger.error(
        { error: serializeError(error), originalPath },
        "Failed to delete cached transformations",
      );
      throw error;
    }
  }

  /**
   * Loads the persisted aggregate stats object, or null when it doesn't
   * exist yet or is unreadable (triggering a recomputation)
   */
  async loadPersistedStats(): Promise<BucketStats | null> {
    if (!(await this.s3Client.objectExists(STATS_OBJECT_KEY))) {
      return null;
    }

    try {
      const buffer = await this.s3Client.downloadObject(STATS_OBJECT_KEY);
      const parsed = JSON.parse(buffer.toString("utf-8"));
      if (
        isAggregateStats(parsed?.storage) &&
        isAggregateStats(parsed?.cache) &&
        typeof parsed.updatedAt === "string"
      ) {
        return parsed as BucketStats;
      }
      logger.warn("Persisted bucket stats have an unexpected shape, recomputing");
      return null;
    } catch (error) {
      logger.warn(
        { error: serializeError(error) },
        "Failed to load persisted bucket stats, recomputing",
      );
      return null;
    }
  }

  /**
   * Persists the aggregate stats object to the bucket
   */
  async persistStats(stats: BucketStats): Promise<void> {
    await this.s3Client.uploadObject(
      STATS_OBJECT_KEY,
      Buffer.from(JSON.stringify(stats)),
      "application/json",
    );
  }

  /**
   * Recomputes aggregate stats from full bucket listings. O(n) in object
   * count - only used to seed the tracker and for explicit reconciliation,
   * never on the /storage/stats read path.
   */
  async computeBucketStats(): Promise<{
    storage: AggregateStats;
    cache: AggregateStats;
  }> {
    const [publicObjects, cacheObjects] = await Promise.all([
      this.listAllParallel("public/"),
      this.s3Client.listObjects("cache/"),
    ]);

    const storage: AggregateStats = { size: 0, fileCount: 0 };
    for (const obj of publicObjects) {
      if (obj.key.endsWith("/")) continue; // folder markers
      storage.size += obj.size ?? 0;
      storage.fileCount += 1;
    }

    const cache: AggregateStats = { size: 0, fileCount: 0 };
    for (const obj of cacheObjects) {
      cache.size += obj.size ?? 0;
      cache.fileCount += 1;
    }

    return { storage, cache };
  }

  /**
   * Deletes all cached transformations from cloud storage and clears the in-memory cache
   */
  async clearAllCache(): Promise<number> {
    const cacheObjects = await this.s3Client.listObjects("cache/");
    const deletedCount =
      cacheObjects.length === 0
        ? 0
        : await this.s3Client.deleteObjects(cacheObjects.map((obj) => obj.key));

    if (cacheObjects.length > 0) {
      adjustBucketStats(this, "cache", {
        size: -cacheObjects.reduce((sum, obj) => sum + (obj.size ?? 0), 0),
        fileCount: -cacheObjects.length,
      });
    }

    this.cache.clear();

    return deletedCount;
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
      if (
        key.includes(originalPath) ||
        key.startsWith(`exists:cache/${originalPath}`)
      ) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    logger.debug(
      { originalPath, deletedCount },
      "Invalidated cache entries for original path",
    );
  }
}
