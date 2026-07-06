import { Hono } from "hono";
import { createStorageClient } from "../utils/storage";
import fs from "fs";
import path from "path";
import logger, { serializeError } from "../utils/logger";
import { deleteAssetCompletely } from "../utils/asset-deletion";
import { getUniqueFilePath } from "../utils/get-unique-file-path";
import { deleteCachedFiles, getCacheSize, clearAllCache } from "../utils/cache";

type StorageNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  mtime?: string;
  children?: StorageNode[];
};

type TreeDataItem = {
  id: string;
  name: string;
  size?: number;
  mtime?: string;
  children?: TreeDataItem[];
  draggable?: boolean;
  droppable?: boolean;
  disabled?: boolean;
};

const storageRoute = new Hono();
const storageClient = createStorageClient();

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

function buildTreeFromKeys(
  keys: { key: string; size?: number; lastModified?: Date }[],
): StorageNode {
  const root: StorageNode = {
    name: "storage",
    path: "",
    type: "directory",
    children: [],
  };

  for (const { key, size, lastModified } of keys) {
    const normalizedKey = key.replace(/^\/+/, "");
    const isFolderMarker = normalizedKey.endsWith("/");
    const parts = normalizedKey.split("/").filter(Boolean);

    if (parts.length === 0) {
      continue;
    }

    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLastPart = i === parts.length - 1;
      const isFile = isLastPart && !isFolderMarker;

      if (isFile) {
        current.children = current.children || [];
        const existing = current.children.find(
          (child) => child.name === part && child.type === "file",
        );
        if (!existing) {
          current.children.push({
            name: part,
            path: currentPath,
            type: "file",
            size,
            mtime: lastModified?.toISOString(),
          });
        }
      } else {
        current.children = current.children || [];
        let dirNode = current.children.find(
          (child) => child.name === part && child.type === "directory",
        );
        if (!dirNode) {
          dirNode = {
            name: part,
            path: currentPath,
            type: "directory",
            children: [],
          };
          current.children.push(dirNode);
        }
        current = dirNode;
      }
    }
  }

  return root;
}

function storageTreeToTreeData(root: StorageNode): TreeDataItem[] {
  if (!root.children) return [];

  const mapNode = (node: StorageNode): TreeDataItem => {
    return {
      id: node.path || node.name,
      name: node.name || node.path,
      size: node.size,
      mtime: node.mtime,
      children: node.children?.map(mapNode),
    };
  };

  return root.children.map(mapNode);
}

storageRoute.get("/", async (c) => {
  try {
    let root: StorageNode;

    if (storageClient) {
      // List only objects in the public/ folder
      const objects = await storageClient.list("public/");

      // Remove the public/ prefix from all keys
      const publicObjects = objects
        .filter((obj) => obj.key.startsWith("public/"))
        .map((obj) => ({
          ...obj,
          key: obj.key.substring(7), // Remove "public/" prefix (7 characters)
        }));

      root = buildTreeFromKeys(publicObjects);
    } else {
      const publicDir = path.join(".", "public");
      root = buildLocalTree(publicDir);
    }

    const treeData = storageTreeToTreeData(root);

    return c.json(treeData);
  } catch (error) {
    logger.error(
      { error: serializeError(error) },
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

function sumTreeSize(node: StorageNode): { size: number; fileCount: number } {
  let size = node.size ?? 0;
  let fileCount = node.type === "file" ? 1 : 0;

  for (const child of node.children ?? []) {
    const childStats = sumTreeSize(child);
    size += childStats.size;
    fileCount += childStats.fileCount;
  }

  return { size, fileCount };
}

/**
 * Get aggregate storage and cache stats
 * GET /storage/stats
 * Note: This route must be registered before GET "/*"
 */
storageRoute.get("/stats", async (c) => {
  try {
    let root: StorageNode;

    if (storageClient) {
      const objects = await storageClient.list("public/");
      const publicObjects = objects
        .filter((obj) => obj.key.startsWith("public/"))
        .map((obj) => ({ ...obj, key: obj.key.substring(7) }));
      root = buildTreeFromKeys(publicObjects);
    } else {
      const publicDir = path.join(".", "public");
      root = buildLocalTree(publicDir);
    }

    const { size: storageSize, fileCount } = sumTreeSize(root);

    const localCache = await getCacheSize();
    const cloudCache = storageClient
      ? await storageClient.getCacheStats()
      : { size: 0, fileCount: 0 };

    return c.json({
      storage: {
        size: storageSize,
        fileCount,
      },
      cache: {
        size: localCache.size + cloudCache.size,
        fileCount: localCache.fileCount + cloudCache.fileCount,
      },
    });
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
