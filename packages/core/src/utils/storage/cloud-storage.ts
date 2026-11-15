import { StorageConfig, StorageClientOptions } from "./types";
import { StorageCache } from "./cache";
import { sortedKey, type CacheKeyFn } from "../../url/cache-key";
import { S3ClientWrapper } from "./s3-client";
import logger, { serializeError } from "../logger";
import {
  FOLDER_SUMMARY_MAX_KEYS,
  isReservedMediaPath,
  normalizeMediaPrefix,
  shapeFolderSummary,
  shapeLevel,
  type FolderSummary,
  type LevelFile,
} from "../../url/storage-layout";
import {
  adjustBucketStats,
  type AggregateStats,
  type BucketStats,
  type StatsBackend,
} from "./stats-tracker";

// Lives at the bucket root, outside the media prefix and cache/, so it never
// shows up in media listings or cache stats
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
  /** Normalized media prefix, e.g. "public/" or "" for the bucket root. */
  readonly mediaPrefix: string;
  private keyFor: CacheKeyFn;

  constructor(config: StorageConfig, clientOptions?: StorageClientOptions) {
    this.s3Client = new S3ClientWrapper(config, clientOptions);
    this.cache = new StorageCache();
    this.mediaPrefix = normalizeMediaPrefix(config.prefix);
    this.keyFor = config.keyFor ?? sortedKey;
  }

  /** In-memory existence entry of a derivative, grouped by its original. */
  private derivativeEntry(originalPath: string, key: string): string {
    return `exists:${originalPath}\0${key}`;
  }

  /**
   * Storage key for a delivery path. The delivery path is what appears in a
   * /t/ URL; the key is where the bytes actually live.
   */
  mediaKey(path: string): string {
    if (isReservedMediaPath(this.mediaPrefix, path)) {
      throw new Error(
        `Path ${JSON.stringify(path)} is reserved for Openinary's own use`,
      );
    }
    return `${this.mediaPrefix}${path}`;
  }

  /**
   * Every media object, recursively. At the bucket root this skips cache/ and
   * .openinary/ before fanning out, so they are neither counted nor listed.
   */
  listAllMedia(): Promise<{ key: string; size?: number; lastModified?: Date }[]> {
    return this.listAllParallel(
      this.mediaPrefix,
      (key) => !isReservedMediaPath(this.mediaPrefix, key),
    );
  }

  async list(
    prefix?: string,
  ): Promise<{ key: string; size?: number; lastModified?: Date }[]> {
    return await this.s3Client.listObjects(prefix);
  }

  async listDelimited(prefix: string): Promise<{
    prefixes: string[];
    objects: { key: string; size?: number; lastModified?: Date }[];
  }> {
    return await this.s3Client.listDelimited(prefix);
  }

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
    keep: (key: string) => boolean = () => true,
  ): Promise<{ key: string; size?: number; lastModified?: Date }[]> {
    const topLevel = await this.s3Client.listDelimited(prefix);
    const results = topLevel.objects.filter((obj) => keep(obj.key));
    const prefixes = topLevel.prefixes.filter(keep);

    const batchSize = 16;
    for (let i = 0; i < prefixes.length; i += batchSize) {
      const batch = prefixes.slice(i, i + batchSize);
      const nested = await Promise.all(
        batch.map((folderPrefix) => this.s3Client.listObjects(folderPrefix)),
      );
      for (const objects of nested) {
        results.push(...objects);
      }
    }

    return results;
  }

  async listLevel(
    folderPath: string,
  ): Promise<{ folderNames: string[]; files: LevelFile[] }> {
    const storagePrefix = folderPath ? this.mediaKey(`${folderPath}/`) : this.mediaPrefix;
    const delimited = await this.s3Client.listDelimited(storagePrefix);
    const level = shapeLevel(storagePrefix, folderPath, delimited);
    return folderPath
      ? level
      : {
          ...level,
          folderNames: level.folderNames.filter(
            (name) => !isReservedMediaPath(this.mediaPrefix, name),
          ),
        };
  }

  /**
   * Gets a bounded summary of a folder (direct child count, truncation flag,
   * media preview items) from a single delimiter-listed page
   */
  async getFolderSummary(
    folderPath: string,
    maxKeys = FOLDER_SUMMARY_MAX_KEYS,
  ): Promise<FolderSummary> {
    const storagePrefix = this.mediaKey(`${folderPath}/`);
    const page = await this.s3Client.listDelimitedPage(storagePrefix, maxKeys);
    return shapeFolderSummary(storagePrefix, folderPath, page);
  }

  /**
   * Creates a folder marker object so empty folders are visible in S3-compatible storage
   */
  async createFolder(folderPath: string): Promise<void> {
    const normalized = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const storageKey = this.mediaKey(`${normalized}/`);

    await this.s3Client.createFolderMarker(storageKey);
  }

  async folderExists(folderPath: string): Promise<boolean> {
    const normalized = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const markerKey = this.mediaKey(`${normalized}/`);

    if (await this.s3Client.objectExists(markerKey)) {
      return true;
    }

    const prefixedObjects = await this.s3Client.listObjects(markerKey, 1);
    return prefixedObjects.length > 0;
  }

  async renameFolder(oldFolderPath: string, newFolderPath: string): Promise<void> {
    const normalizedOld = oldFolderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const normalizedNew = newFolderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const prefix = this.mediaKey(`${normalizedOld}/`);

    const objects = await this.s3Client.listObjects(prefix);

    for (const obj of objects) {
      const relativeKey = obj.key.slice(prefix.length);
      const destKey = this.mediaKey(`${normalizedNew}/${relativeKey}`);
      await this.s3Client.copyObject(obj.key, destKey);
      await this.s3Client.deleteObject(obj.key);
    }

    this.cache.delete(`original:${normalizedOld}`);
  }

  async deleteFolder(folderPath: string): Promise<number> {
    const normalized = folderPath.replace(/^\/+/, "").replace(/\/+$/, "");
    const prefix = this.mediaKey(`${normalized}/`);

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

    this.cache.delete(`original:${normalized}`);

    return deleted;
  }

  async exists(originalPath: string, params: object): Promise<boolean> {
    const key = this.keyFor(originalPath, params);
    const cacheKey = this.derivativeEntry(originalPath, key);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached.exists;
    }

    let exists: boolean;
    try {
      exists = await this.s3Client.objectExists(key);
    } catch (error: any) {
      // Transient storage error: report "not found" for this request
      // but don't cache the verdict - the next request re-checks.
      logger.error(
        { error: error.message, originalPath },
        "Cloud storage error while checking transformed file",
      );
      return false;
    }

    this.cache.set(cacheKey, {
      exists,
      timestamp: Date.now(),
    });

    return exists;
  }

  /** Whether an original exists, cached briefly per instance. */
  async existsOriginal(filePath: string): Promise<boolean> {
    const cacheKey = `original:${filePath}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached.exists;
    }

    // Only a 404 answers false; any other storage error throws (objectExists),
    // and is never cached, so a transient failure cannot read as "missing".
    const exists = await this.s3Client.objectExists(this.mediaKey(filePath));
    this.cache.set(cacheKey, { exists, timestamp: Date.now() });
    return exists;
  }

  async downloadOriginal(originalPath: string): Promise<Buffer> {
    const storageKey = this.mediaKey(originalPath);
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
    const storageKey = this.mediaKey(originalPath);
    return await this.s3Client.downloadObjectStream(storageKey);
  }

  async uploadOriginal(
    filePath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const storageKey = this.mediaKey(filePath);
    await this.s3Client.uploadObject(storageKey, buffer, contentType);

    adjustBucketStats(this, "storage", { size: buffer.length, fileCount: 1 });

    this.cache.set(`original:${filePath}`, {
      exists: true,
      timestamp: Date.now(),
    });

    // Returns the public URL (delivery path, without the storage prefix)
    return this.s3Client.getPublicUrl(storageKey);
  }

  async upload(
    originalPath: string,
    params: object,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const key = this.keyFor(originalPath, params);

    // Encoded because x-amz-meta-* header values must be ASCII-safe;
    // some S3-compatible providers reject non-ASCII bytes outright.
    const metadata = {
      "x-original-path": encodeURIComponent(originalPath),
    };

    await this.s3Client.uploadObject(key, buffer, contentType, metadata);

    adjustBucketStats(this, "cache", { size: buffer.length, fileCount: 1 });

    this.cache.set(this.derivativeEntry(originalPath, key), {
      exists: true,
      timestamp: Date.now(),
    });
    return this.s3Client.getPublicUrl(key);
  }

  async download(originalPath: string, params: object): Promise<Buffer> {
    const key = this.keyFor(originalPath, params);
    return await this.s3Client.downloadObject(key);
  }

  async deleteOriginal(originalPath: string): Promise<void> {
    const storageKey = this.mediaKey(originalPath);
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

    this.cache.delete(`original:${originalPath}`);
  }

  async copyOriginal(sourcePath: string, destPath: string): Promise<void> {
    const sourceKey = this.mediaKey(sourcePath);
    const destKey = this.mediaKey(destPath);
    await this.s3Client.copyObject(sourceKey, destKey);

    const metadata = await this.s3Client.getObjectMetadata(destKey);
    if (metadata) {
      adjustBucketStats(this, "storage", {
        size: metadata.size,
        fileCount: 1,
      });
    }

    this.cache.set(`original:${destPath}`, {
      exists: true,
      timestamp: Date.now(),
    });
  }

  async renameOriginal(sourcePath: string, destPath: string): Promise<void> {
    await this.copyOriginal(sourcePath, destPath);
    await this.deleteOriginal(sourcePath);
  }

  async getOriginalMetadata(
    originalPath: string,
  ): Promise<{ size: number; createdAt: Date; updatedAt: Date } | null> {
    const storageKey = this.mediaKey(originalPath);
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

  async getOptimizedMetadata(
    originalPath: string,
    params: object,
  ): Promise<{ size: number } | null> {
    const key = this.keyFor(originalPath, params);
    const metadata = await this.s3Client.getObjectMetadata(key);

    if (!metadata) {
      return null;
    }

    return {
      size: metadata.size,
    };
  }

  /**
   * Deletes all cached transformations for an original file from cloud storage
   * Uses metadata to identify files belonging to the original path
   */
  async deleteAllCachedTransformations(originalPath: string): Promise<number> {
    try {
      const cacheObjects = await this.s3Client.listObjects("cache/");

      const keysToDelete: string[] = [];
      let sizeToDelete = 0;

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
      this.listAllMedia(),
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

  /** Forgets the in-memory existence of an original and of its derivatives. */
  invalidateAllCacheEntries(originalPath: string): void {
    this.cache.delete(`original:${originalPath}`);
    const prefix = this.derivativeEntry(originalPath, "");
    for (const key of this.cache.getAllKeys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }
}
