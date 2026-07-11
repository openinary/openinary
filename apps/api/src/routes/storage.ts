import { Hono } from "hono";
import { createStorageClient } from "../utils/storage";
import fs from "fs";
import path from "path";
import logger, { serializeError } from "../utils/logger";
import { deleteAssetCompletely } from "../utils/asset-deletion";
import { getUniqueFilePath } from "../utils/get-unique-file-path";
import { deleteCachedFiles, getCacheSize, clearAllCache } from "../utils/cache";
import { sumTreeSize, type StorageNode } from "../utils/storage-tree";
import {
  getBucketStats,
  recalculateBucketStats,
  type BucketStats,
} from "../utils/storage/stats-tracker";
import {
  FOLDER_PREVIEW_LIMIT,
  FOLDER_SUMMARY_MAX_KEYS,
  deriveFolderPaths,
  getMediaType,
  normalizeLevelPath,
  type FolderPreviewItem,
  type FolderSummary,
  type LevelFile,
  type LevelFolder,
} from "../utils/storage-level";
import {
  getCachedFullListing,
  invalidateListingCache,
} from "../utils/storage/listing-cache";

const storageRoute = new Hono();
const storageClient = createStorageClient();

type StorageClient = NonNullable<typeof storageClient>;

/**
 * Full recursive listing of public/ objects (keys relative, prefix stripped),
 * shared between /stats and /folders through a short-lived TTL cache
 */
async function getPublicObjects(client: StorageClient) {
  const objects = await getCachedFullListing(() =>
    client.listAllParallel("public/"),
  );
  return objects
    .filter((obj) => obj.key.startsWith("public/"))
    .map((obj) => ({ ...obj, key: obj.key.substring(7) }));
}

function buildLocalTree(rootDir: string): StorageNode {
  const root: StorageNode = {
    name: "storage",
    path: "",
    type: "directory",
    children: [],
  };

  if (!fs.existsSync(rootDir)) {
    return root;
  }

  const walk = (
    absoluteDir: string,
    relativeDir: string,
    parent: StorageNode,
  ) => {
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });

    for (const entry of entries) {
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const fullPath = path.join(absoluteDir, entry.name);

      if (entry.isDirectory()) {
        const dirNode: StorageNode = {
          name: entry.name,
          path: relPath,
          type: "directory",
          children: [],
        };
        parent.children = parent.children || [];
        parent.children.push(dirNode);
        walk(fullPath, relPath, dirNode);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        const fileNode: StorageNode = {
          name: entry.name,
          path: relPath,
          type: "file",
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        };
        parent.children = parent.children || [];
        parent.children.push(fileNode);
      }
    }
  };

  walk(rootDir, "", root);
  return root;
}

function localFolderSummary(dirAbs: string, relPath: string): FolderSummary {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return { itemCount: 0, truncated: false, previewItems: [] };
  }

  const truncated = entries.length > FOLDER_SUMMARY_MAX_KEYS;
  const limited = entries.slice(0, FOLDER_SUMMARY_MAX_KEYS);

  const previewItems: FolderPreviewItem[] = [];
  for (const entry of limited) {
    if (previewItems.length >= FOLDER_PREVIEW_LIMIT) break;
    if (!entry.isFile()) continue;
    const type = getMediaType(entry.name);
    if (type) {
      previewItems.push({ path: `${relPath}/${entry.name}`, type });
    }
  }

  return { itemCount: limited.length, truncated, previewItems };
}

function listLocalLevel(folderPath: string): {
  folders: LevelFolder[];
  files: LevelFile[];
} {
  const dirAbs = path.join(".", "public", folderPath);

  if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) {
    return { folders: [], files: [] };
  }

  const folders: LevelFolder[] = [];
  const files: LevelFile[] = [];

  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const relPath = folderPath ? `${folderPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      folders.push({ name: entry.name, path: relPath });
    } else if (entry.isFile()) {
      const stats = fs.statSync(path.join(dirAbs, entry.name));
      files.push({
        name: entry.name,
        path: relPath,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return { folders, files };
}

/**
 * List one directory level
 * GET /storage?path=<folder> (empty or missing path = root)
 * Returns the level's files plus each subfolder's name/path only - no
 * per-folder summary (item count, preview thumbnails), which the client
 * fetches separately via GET /storage/folder-summaries for the folders it
 * actually renders. Keeps this endpoint's latency independent of how many
 * subfolders a level has.
 */
storageRoute.get("/", async (c) => {
  const levelPath = normalizeLevelPath(c.req.query("path") ?? "");

  if (levelPath === null) {
    return c.json(
      { error: "Bad request", message: "Invalid path" },
      400,
    );
  }

  try {
    if (!storageClient) {
      return c.json({ path: levelPath, ...listLocalLevel(levelPath) });
    }

    const { folderNames, files } = await storageClient.listLevel(levelPath);
    const folders: LevelFolder[] = folderNames.map((name) => ({
      name,
      path: levelPath ? `${levelPath}/${name}` : name,
    }));

    return c.json({ path: levelPath, folders, files });
  } catch (error) {
    logger.error(
      { error: serializeError(error), levelPath },
      "Failed to list storage contents",
    );
    return c.json(
      {
        error: "Failed to list storage contents",
      },
      500,
    );
  }
});

const FOLDER_SUMMARIES_MAX_PATHS = 200;

/**
 * Bounded per-folder summaries (item count, truncation flag, preview
 * thumbnails) for an explicit set of folder paths.
 * GET /storage/folder-summaries?paths=<comma-separated folder paths>
 * Meant to be called only for folders the client is actually rendering
 * (e.g. the currently virtualized rows), so a level with many subfolders
 * doesn't pay for every summary up front - see GET /storage/.
 * Note: This route must be registered before GET "/*"
 */
storageRoute.get("/folder-summaries", async (c) => {
  const raw = c.req.query("paths") ?? "";
  const requested = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return c.json({ summaries: {} });
  }
  if (requested.length > FOLDER_SUMMARIES_MAX_PATHS) {
    return c.json(
      {
        error: "Bad request",
        message: `Too many paths (max ${FOLDER_SUMMARIES_MAX_PATHS})`,
      },
      400,
    );
  }

  const paths: string[] = [];
  for (const p of requested) {
    const normalized = normalizeLevelPath(p);
    if (normalized === null) {
      return c.json({ error: "Bad request", message: "Invalid path" }, 400);
    }
    paths.push(normalized);
  }

  try {
    const summaries: Record<string, FolderSummary> = {};
    const batchSize = 16;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (folderPath) => {
          if (storageClient) {
            return [folderPath, await storageClient.getFolderSummary(folderPath)] as const;
          }
          const dirAbs = path.join(".", "public", folderPath);
          return [folderPath, localFolderSummary(dirAbs, folderPath)] as const;
        }),
      );
      for (const [folderPath, summary] of results) {
        summaries[folderPath] = summary;
      }
    }

    return c.json({ summaries });
  } catch (error) {
    logger.error(
      { error: serializeError(error), paths },
      "Failed to get folder summaries",
    );
    return c.json({ error: "Failed to get folder summaries" }, 500);
  }
});

/**
 * Builds the stats response body from tracked cloud aggregates (O(1) read,
 * no bucket listing) or a local filesystem walk when running without cloud
 * storage. Local disk cache is always live-computed (cheap readdir).
 */
async function buildStatsResponse(cloudStats: BucketStats | null) {
  const localCache = await getCacheSize();

  if (cloudStats) {
    return {
      storage: cloudStats.storage,
      cache: {
        size: localCache.size + cloudStats.cache.size,
        fileCount: localCache.fileCount + cloudStats.cache.fileCount,
      },
      updatedAt: cloudStats.updatedAt,
    };
  }

  const root = buildLocalTree(path.join(".", "public"));
  const { size, fileCount } = sumTreeSize(root);
  return {
    storage: { size, fileCount },
    cache: localCache,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get aggregate storage and cache stats
 * GET /storage/stats
 * Cloud stats come from incrementally-tracked counters persisted in the
 * bucket - no full listing on the read path (see stats-tracker.ts). The
 * first-ever call seeds them with one full recomputation.
 * Note: This route must be registered before GET "/*"
 */
storageRoute.get("/stats", async (c) => {
  try {
    const cloudStats = storageClient
      ? await getBucketStats(storageClient)
      : null;
    return c.json(await buildStatsResponse(cloudStats));
  } catch (error) {
    logger.error(
      { error: serializeError(error) },
      "Failed to get storage stats",
    );
    return c.json(
      {
        error: "Failed to get storage stats",
      },
      500,
    );
  }
});

/**
 * Recompute aggregate stats from full bucket listings, reconciling any
 * drift in the incremental counters (external bucket changes, lost flush)
 * POST /storage/stats/recalculate
 * Note: This route must be registered before POST "/*"
 */
storageRoute.post("/stats/recalculate", async (c) => {
  try {
    const cloudStats = storageClient
      ? await recalculateBucketStats(storageClient)
      : null;
    return c.json(await buildStatsResponse(cloudStats));
  } catch (error) {
    logger.error(
      { error: serializeError(error) },
      "Failed to recalculate storage stats",
    );
    return c.json(
      {
        error: "Failed to recalculate storage stats",
      },
      500,
    );
  }
});

/**
 * List every folder path in storage (for "Move to" pickers)
 * GET /storage/folders
 * Note: This route must be registered before GET "/*"
 */
storageRoute.get("/folders", async (c) => {
  try {
    if (storageClient) {
      const publicObjects = await getPublicObjects(storageClient);
      return c.json({
        folders: deriveFolderPaths(publicObjects.map((obj) => obj.key)),
      });
    }

    const folders: string[] = [];
    const walk = (absoluteDir: string, relativeDir: string) => {
      if (!fs.existsSync(absoluteDir)) return;
      for (const entry of fs.readdirSync(absoluteDir, {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory()) continue;
        const relPath = relativeDir
          ? `${relativeDir}/${entry.name}`
          : entry.name;
        folders.push(relPath);
        walk(path.join(absoluteDir, entry.name), relPath);
      }
    };
    walk(path.join(".", "public"), "");

    return c.json({ folders: folders.sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    logger.error(
      { error: serializeError(error) },
      "Failed to list storage folders",
    );
    return c.json(
      {
        error: "Failed to list storage folders",
      },
      500,
    );
  }
});

/**
 * Clear all cached (transformed) files, local and cloud
 * POST /storage/cache/clear
 * Note: This route must be registered before POST "/*"
 */
storageRoute.post("/cache/clear", async (c) => {
  try {
    const localDeleted = await clearAllCache();
    const cloudDeleted = storageClient
      ? await storageClient.clearAllCache()
      : 0;

    return c.json({
      success: true,
      message: "Cache cleared successfully",
      details: {
        localCacheFilesDeleted: localDeleted,
        cloudCacheFilesDeleted: cloudDeleted,
      },
    });
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Failed to clear cache");
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Get file metadata (size, dates)
 * GET /storage/{path}/metadata
 * Note: This route must be placed after GET "/" but before DELETE "/*"
 */
storageRoute.get("/*", async (c) => {
  const requestPath = c.req.path;

  // Only handle requests that end with /metadata
  if (!requestPath.endsWith("/metadata")) {
    // Let other routes handle this request
    return c.notFound();
  }

  // Remove '/storage' prefix and '/metadata' suffix
  // requestPath will be something like '/storage/cows/black.png/metadata'
  // We need to extract 'cows/black.png'
  const pathWithoutPrefix = requestPath
    .replace(/^\/storage\/?/, "")
    .replace(/\/metadata$/, "");

  if (!pathWithoutPrefix) {
    return c.json(
      {
        error: "Bad request",
        message: "File path is required",
      },
      400,
    );
  }

  let filePath = pathWithoutPrefix.replace(/^\/+/, "").replace(/\/+$/, "");

  try {
    filePath = decodeURIComponent(filePath);
  } catch (error) {
    // If decoding fails, use the original path
  }

  try {
    if (storageClient) {
      const metadata = await storageClient.getOriginalMetadata(filePath);
      if (!metadata) {
        return c.json(
          {
            error: "Not found",
            message: "File not found",
          },
          404,
        );
      }

      return c.json({
        size: metadata.size,
        createdAt: metadata.createdAt.toISOString(),
        updatedAt: metadata.updatedAt.toISOString(),
      });
    } else {
      const localPath = path.join(".", "public", filePath);

      if (!fs.existsSync(localPath)) {
        return c.json(
          {
            error: "Not found",
            message: "File not found",
          },
          404,
        );
      }

      const stats = fs.statSync(localPath);
      if (stats.isDirectory()) {
        return c.json(
          {
            error: "Bad request",
            message: "Cannot get metadata for directories",
          },
          400,
        );
      }

      return c.json({
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
      });
    }
  } catch (error) {
    logger.error(
      { error: serializeError(error), filePath },
      "Failed to get file metadata",
    );
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Delete a file from storage
 * DELETE /storage/*
 * This now performs a complete deletion including cache and jobs
 */
storageRoute.delete("/*", async (c) => {
  const requestPath = c.req.path;

  // Remove '/storage' prefix from the path
  // requestPath will be something like '/storage/cows/black.png'
  // We need to extract 'cows/black.png'
  const pathWithoutPrefix = requestPath.replace(/^\/storage\/?/, "");

  if (!pathWithoutPrefix) {
    return c.json(
      {
        error: "Bad request",
        message: "File path is required",
      },
      400,
    );
  }

  let filePath = pathWithoutPrefix.replace(/^\/+/, "").replace(/\/+$/, "");

  try {
    filePath = decodeURIComponent(filePath);
  } catch (error) {
    // If decoding fails, use the original path
  }

  try {
    // Use the complete asset deletion function
    const result = await deleteAssetCompletely(filePath, storageClient);

    if (result.success || result.originalFileDeleted) {
      invalidateListingCache();
    }

    if (!result.success) {
      // Check if the file was not found
      if (result.errors.some((err) => err.includes("not found"))) {
        return c.json(
          {
            error: "Not found",
            message: "File not found",
          },
          404,
        );
      }

      // Check if trying to delete a directory
      if (
        result.errors.some((err) => err.includes("Cannot delete directories"))
      ) {
        return c.json(
          {
            error: "Bad request",
            message: "Cannot delete directories",
          },
          400,
        );
      }

      // Other errors
      return c.json(
        {
          error: "Partial deletion",
          message: "Asset deleted but some cleanup operations failed",
          details: {
            originalFileDeleted: result.originalFileDeleted,
            jobsDeleted: result.jobsDeleted,
            localCacheFilesDeleted: result.localCacheFilesDeleted,
            cloudCacheFilesDeleted: result.cloudCacheFilesDeleted,
            errors: result.errors,
          },
        },
        result.originalFileDeleted ? 200 : 500,
      );
    }

    return c.json({
      success: true,
      message: "Asset deleted successfully",
      details: {
        jobsDeleted: result.jobsDeleted,
        localCacheFilesDeleted: result.localCacheFilesDeleted,
        cloudCacheFilesDeleted: result.cloudCacheFilesDeleted,
      },
    });
  } catch (error) {
    logger.error(
      { error: serializeError(error), filePath },
      "Failed to delete asset",
    );
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

async function pathExists(filePath: string): Promise<boolean> {
  if (storageClient) {
    return storageClient.existsOriginalPath(filePath);
  }
  return fs.existsSync(path.join(".", "public", filePath));
}

async function isDirectoryPath(filePath: string): Promise<boolean> {
  if (storageClient) {
    return storageClient.folderExists(filePath);
  }
  const localPath = path.join(".", "public", filePath);
  return fs.existsSync(localPath) && fs.statSync(localPath).isDirectory();
}

function extractFilePath(requestPath: string, suffix?: RegExp): string {
  let pathWithoutPrefix = requestPath.replace(/^\/storage\/?/, "");
  if (suffix) {
    pathWithoutPrefix = pathWithoutPrefix.replace(suffix, "");
  }
  let filePath = pathWithoutPrefix.replace(/^\/+/, "").replace(/\/+$/, "");
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // If decoding fails, use the original path
  }
  return filePath;
}

/**
 * Rename a file in place
 * PATCH /storage/* with body { name: string }
 */
storageRoute.patch("/*", async (c) => {
  const filePath = extractFilePath(c.req.path);

  if (!filePath) {
    return c.json(
      { error: "Bad request", message: "File path is required" },
      400,
    );
  }

  let body: { name?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: "Bad request", message: "Invalid JSON body" },
      400,
    );
  }

  const newName = typeof body.name === "string" ? body.name.trim() : "";
  if (!newName || newName.includes("/") || newName.includes("\\")) {
    return c.json(
      { error: "Bad request", message: "A valid name is required" },
      400,
    );
  }

  const dir = path.posix.dirname(filePath);
  const newPath = dir === "." ? newName : `${dir}/${newName}`;

  try {
    const isFile = await pathExists(filePath);
    const isFolder = !isFile && (await isDirectoryPath(filePath));

    if (!isFile && !isFolder) {
      return c.json(
        { error: "Not found", message: "File or folder not found" },
        404,
      );
    }

    if (newPath !== filePath) {
      const targetIsFile = await pathExists(newPath);
      const targetIsFolder = !targetIsFile && (await isDirectoryPath(newPath));
      if (targetIsFile || targetIsFolder) {
        return c.json(
          {
            error: "Conflict",
            message: "A file or folder with that name already exists",
          },
          409,
        );
      }
    }

    if (isFolder && storageClient) {
      await storageClient.renameFolder(filePath, newPath);
      storageClient.invalidateAllCacheEntries(filePath);
    } else if (storageClient) {
      await storageClient.renameOriginal(filePath, newPath);
      storageClient.invalidateAllCacheEntries(filePath);
    } else {
      const sourceAbs = path.join(".", "public", filePath);
      const destAbs = path.join(".", "public", newPath);
      fs.renameSync(sourceAbs, destAbs);
    }

    await deleteCachedFiles(filePath);
    invalidateListingCache();

    return c.json({ success: true, path: newPath });
  } catch (error) {
    logger.error(
      { error: serializeError(error), filePath, newPath },
      "Failed to rename asset",
    );
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Copy or move a file
 * POST /storage/*\/copy
 * POST /storage/*\/move with body { destination?: string }
 */
storageRoute.post("/*", async (c) => {
  const requestPath = c.req.path;
  const isCopy = requestPath.endsWith("/copy");
  const isMove = requestPath.endsWith("/move");

  if (!isCopy && !isMove) {
    return c.notFound();
  }

  const filePath = extractFilePath(requestPath, /\/(copy|move)$/);

  if (!filePath) {
    return c.json(
      { error: "Bad request", message: "File path is required" },
      400,
    );
  }

  try {
    const isFile = await pathExists(filePath);
    const isFolder = !isFile && isMove && (await isDirectoryPath(filePath));

    if (!isFile && !isFolder) {
      return c.json({ error: "Not found", message: "File not found" }, 404);
    }

    const dir = path.posix.dirname(filePath);
    const normalizedDir = dir === "." ? "" : dir;
    const baseName = path.posix.basename(filePath);

    let targetDir = normalizedDir;
    if (isMove) {
      let body: { destination?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {
        // No body means move to root
      }
      targetDir =
        typeof body.destination === "string"
          ? body.destination.trim().replace(/^\/+|\/+$/g, "")
          : "";

      if (targetDir === normalizedDir) {
        return c.json(
          { error: "Bad request", message: "File is already in that folder" },
          400,
        );
      }
    }

    if (isFolder) {
      const newPath = targetDir ? `${targetDir}/${baseName}` : baseName;

      if (storageClient) {
        await storageClient.renameFolder(filePath, newPath);
        storageClient.invalidateAllCacheEntries(filePath);
      } else {
        const sourceAbs = path.join(".", "public", filePath);
        const destAbs = path.join(".", "public", newPath);
        fs.mkdirSync(path.dirname(destAbs), { recursive: true });
        fs.renameSync(sourceAbs, destAbs);
      }

      await deleteCachedFiles(filePath);
      invalidateListingCache();

      return c.json({ success: true, path: newPath });
    }

    let candidatePath: string;
    if (isCopy) {
      const ext = path.posix.extname(baseName);
      const nameWithoutExt = ext ? baseName.slice(0, -ext.length) : baseName;
      const copyName = `${nameWithoutExt} copy${ext}`;
      candidatePath = targetDir ? `${targetDir}/${copyName}` : copyName;
    } else {
      candidatePath = targetDir ? `${targetDir}/${baseName}` : baseName;
    }

    const newPath = await getUniqueFilePath(candidatePath, pathExists);

    if (storageClient) {
      if (isCopy) {
        await storageClient.copyOriginal(filePath, newPath);
      } else {
        await storageClient.renameOriginal(filePath, newPath);
        storageClient.invalidateAllCacheEntries(filePath);
      }
    } else {
      const sourceAbs = path.join(".", "public", filePath);
      const destAbs = path.join(".", "public", newPath);
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      if (isCopy) {
        fs.copyFileSync(sourceAbs, destAbs);
      } else {
        fs.renameSync(sourceAbs, destAbs);
      }
    }

    if (isMove) {
      await deleteCachedFiles(filePath);
    }
    invalidateListingCache();

    return c.json({ success: true, path: newPath });
  } catch (error) {
    logger.error(
      { error: serializeError(error), filePath },
      `Failed to ${isCopy ? "copy" : "move"} asset`,
    );
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default storageRoute;
