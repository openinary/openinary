// /storage/*: the dashboard's file browser over one bucket's originals, and
// the client-generated dashboard thumbnails.

import { posix as path } from "node:path";
import {
  type FolderSummary,
  isTransformableImageExt,
  isVideoExt,
  extOf,
  normalizeLevelPath,
  stripUrlHostile,
} from "@openinary/core/url";
import { clearCacheStats, getStorageStats, setStorageStats } from "../lib/bucket.js";
import {
  copyFile,
  deleteFile,
  deleteFolder,
  moveAsset,
  uniquePath,
} from "../assets.js";
import {
  DASHBOARD_THUMB_FORMAT,
  thumbnailCacheKey,
} from "../cdn/dashboard-thumbs.js";
import * as r2 from "../r2-storage.js";
import { normalizeFolder, parseLevelList, parseList, storageFilePath } from "./params.js";
import { type App, type Ctx, meterStorage } from "./tenant.js";

// A real webp thumbnail is a few to tens of KB - this just caps how much
// unmetered R2 storage a single upload can claim (the /thumbnail route
// deliberately never meters, so this is the only guard on that path).
const THUMB_MAX_BLOB_BYTES = 200 * 1024;
// One R2 head per path, so this bounds the whole batch's subrequests.
// Mirrored client-side by the dashboard's MISSING_CHECK_BATCH_SIZE.
const THUMBNAILS_MISSING_MAX_PATHS = 100;
const FOLDER_SUMMARIES_MAX_PATHS = 200;

const defer = (c: Ctx) => (promise: Promise<unknown>) =>
  c.executionCtx.waitUntil(promise);

const badRequest = (c: Ctx, message: string) =>
  c.json({ error: "Bad request", message }, 400);
const notFound = (c: Ctx, message: string) =>
  c.json({ error: "Not found", message }, 404);

export function storageRoutes(app: App): void {
  // GET /storage?path= - one directory level.
  app.get("/storage", async (c) => {
    const levelPath = normalizeLevelPath(c.req.query("path") ?? "");
    if (levelPath === null) return badRequest(c, "Invalid path");
    try {
      return c.json(
        await r2.listLevel(c.env.MEDIA_BUCKET, c.get("tenantRoot"), levelPath),
      );
    } catch (error) {
      console.error("Failed to list storage contents", error);
      return c.json({ error: "Failed to list storage contents" }, 500);
    }
  });

  // Fixed sub-paths, registered before the generic "/storage/*" routes below.
  app.get("/storage/folder-summaries", async (c) => {
    const paths = parseLevelList(c.req.query("paths"), FOLDER_SUMMARIES_MAX_PATHS);
    if (typeof paths === "string") return badRequest(c, paths);
    if (paths.length === 0) return c.json({ summaries: {} });
    try {
      const tenantRoot = c.get("tenantRoot");
      const summaries: Record<string, FolderSummary> = {};
      const batchSize = 16;
      for (let i = 0; i < paths.length; i += batchSize) {
        const results = await Promise.all(
          paths.slice(i, i + batchSize).map(
            async (folderPath) =>
              [
                folderPath,
                await r2.folderSummary(c.env.MEDIA_BUCKET, tenantRoot, folderPath),
              ] as const,
          ),
        );
        for (const [folderPath, summary] of results)
          summaries[folderPath] = summary;
      }
      return c.json({ summaries });
    } catch (error) {
      console.error("Failed to get folder summaries", error);
      return c.json({ error: "Failed to get folder summaries" }, 500);
    }
  });

  // GET /storage/thumbnails-missing?paths=a,b,c - batched check backing the
  // dashboard's client-side thumbnail generator: for each image/video path, is
  // the key its dashboard previews ask for already in the transform cache?
  // Nothing else would ever backfill it.
  app.get("/storage/thumbnails-missing", async (c) => {
    const requested = parseList(c.req.query("paths"), THUMBNAILS_MISSING_MAX_PATHS);
    if (typeof requested === "string") return badRequest(c, requested);
    if (requested.length === 0) return c.json({ missing: [] });
    const tenantRoot = c.get("tenantRoot");
    try {
      const results = await Promise.all(
        requested.map(async (filePath) => {
          const ext = extOf(filePath);
          const isImage = isTransformableImageExt(ext);
          if (!isImage && !isVideoExt(ext)) return null;
          const head = await c.env.MEDIA_BUCKET.head(
            thumbnailCacheKey(`${tenantRoot}/${filePath}`, isImage),
          );
          return head ? null : filePath;
        }),
      );
      return c.json({ missing: results.filter((p): p is string => p !== null) });
    } catch (error) {
      console.error("Failed to check missing thumbnails", error);
      return c.json({ error: "Failed to check missing thumbnails" }, 500);
    }
  });

  // A cached snapshot (see shared/db/schema/bucket.ts for why it isn't
  // live-scanned on every read), scoped to the caller's active bucket.
  app.get("/storage/stats", async (c) => {
    try {
      return c.json(await getStorageStats(c.get("bucketId")));
    } catch (error) {
      console.error("Failed to get storage stats", error);
      return c.json({ error: "Failed to get storage stats" }, 500);
    }
  });

  app.post("/storage/stats/recalculate", async (c) => {
    const tenantRoot = c.get("tenantRoot");
    try {
      const originals = await r2.listOriginals(c.env.MEDIA_BUCKET, tenantRoot);
      const cacheObjects = await r2.listCacheForTenant(c.env.MEDIA_BUCKET, tenantRoot);
      const stats = {
        storage: {
          size: originals.reduce((sum, o) => sum + o.size, 0),
          fileCount: originals.length,
        },
        cache: {
          size: cacheObjects.reduce((sum, o) => sum + o.size, 0),
          fileCount: cacheObjects.length,
        },
      };
      const updatedAt = await setStorageStats(c.get("bucketId"), stats);
      return c.json({ ...stats, updatedAt });
    } catch (error) {
      console.error("Failed to recalculate storage stats", error);
      return c.json({ error: "Failed to recalculate storage stats" }, 500);
    }
  });

  app.post("/storage/cache/clear", async (c) => {
    try {
      await r2.deleteCacheForTenant(c.env.MEDIA_BUCKET, c.get("tenantRoot"));
      await clearCacheStats(c.get("bucketId"));
      return c.body(null, 204);
    } catch (error) {
      console.error("Failed to clear cache", error);
      return c.json({ error: "Failed to clear cache" }, 500);
    }
  });

  app.get("/storage/folders", async (c) => {
    try {
      return c.json({
        folders: await r2.listFolderPaths(c.env.MEDIA_BUCKET, c.get("tenantRoot")),
      });
    } catch (error) {
      console.error("Failed to list storage folders", error);
      return c.json({ error: "Failed to list storage folders" }, 500);
    }
  });

  // GET /storage/{path}/metadata
  app.get("/storage/*", async (c) => {
    const requestPath = new URL(c.req.url).pathname;
    if (!requestPath.endsWith("/metadata")) return c.notFound();
    const filePath = storageFilePath(requestPath, /\/metadata$/);
    if (!filePath) return badRequest(c, "File path is required");
    const metadata = await r2.getOriginalMetadata(
      c.env.MEDIA_BUCKET,
      c.get("tenantRoot"),
      filePath,
    );
    if (!metadata) return notFound(c, "File not found");
    return c.json(metadata);
  });

  // DELETE /storage/* - a file (with everything derived from it) or a whole
  // folder, recursively.
  app.delete("/storage/*", async (c) => {
    const filePath = storageFilePath(new URL(c.req.url).pathname);
    if (!filePath) return badRequest(c, "File path is required");
    const bucket = c.env.MEDIA_BUCKET;
    const tenantRoot = c.get("tenantRoot");
    // File first: null means no such object, which is the only case where the
    // path might name a folder instead.
    const deleted = await deleteFile(bucket, tenantRoot, filePath);
    if (deleted) {
      meterStorage(c, -deleted.bytes);
      return c.json({
        success: true,
        message: "Asset deleted successfully",
        details: {
          jobsDeleted: deleted.jobsDeleted,
          cloudCacheFilesDeleted: deleted.cloudCacheFilesDeleted,
          localCacheFilesDeleted: 0,
        },
      });
    }
    if (!(await r2.folderExists(bucket, tenantRoot, filePath)))
      return notFound(c, "File not found");
    meterStorage(c, -(await deleteFolder(bucket, tenantRoot, filePath, defer(c))));
    // Same shape as self-hosted's folder delete, which reports no counters.
    return c.json({
      success: true,
      message: "Asset deleted successfully",
      details: {
        jobsDeleted: 0,
        localCacheFilesDeleted: 0,
        cloudCacheFilesDeleted: 0,
      },
    });
  });

  // PATCH /storage/* { name } - rename in place.
  app.patch("/storage/*", async (c) => {
    const filePath = storageFilePath(new URL(c.req.url).pathname);
    if (!filePath) return badRequest(c, "File path is required");
    let body: { name?: unknown } = {};
    try {
      body = await c.req.json();
    } catch {
      return badRequest(c, "Invalid JSON body");
    }
    const newName =
      typeof body.name === "string"
        ? stripUrlHostile(body.name.trim()).normalize("NFC")
        : "";
    if (!newName || newName.includes("/") || newName.includes("\\"))
      return badRequest(c, "A valid name is required");
    const dir = path.dirname(filePath);
    const newPath = dir === "." ? newName : `${dir}/${newName}`;
    const bucket = c.env.MEDIA_BUCKET;
    const tenantRoot = c.get("tenantRoot");
    const isFile = await r2.existsOriginal(bucket, tenantRoot, filePath);
    const isFolder =
      !isFile && (await r2.folderExists(bucket, tenantRoot, filePath));
    if (!isFile && !isFolder) return notFound(c, "File or folder not found");
    if (newPath !== filePath) {
      const taken =
        (await r2.existsOriginal(bucket, tenantRoot, newPath)) ||
        (await r2.folderExists(bucket, tenantRoot, newPath));
      if (taken) {
        return c.json(
          {
            error: "Conflict",
            message: "A file or folder with that name already exists",
          },
          409,
        );
      }
    }
    await moveAsset(bucket, tenantRoot, filePath, newPath, { folder: isFolder }, defer(c));
    return c.json({ success: true, path: newPath });
  });

  // POST /storage/*/copy, /storage/*/move { destination? }, and
  // /storage/*/thumbnail - endsWith branches on one wildcard route, because
  // Hono's "*" only matches at the end of a pattern, so "/storage/*/thumbnail"
  // wouldn't reliably match a nested path.
  app.post("/storage/*", async (c) => {
    const requestPath = new URL(c.req.url).pathname;
    if (requestPath.endsWith("/thumbnail")) return uploadThumbnail(c, requestPath);
    const isCopy = requestPath.endsWith("/copy");
    const isMove = requestPath.endsWith("/move");
    if (!isCopy && !isMove) return c.notFound();
    const filePath = storageFilePath(requestPath, /\/(copy|move)$/);
    if (!filePath) return badRequest(c, "File path is required");
    const bucket = c.env.MEDIA_BUCKET;
    const tenantRoot = c.get("tenantRoot");
    const isFile = await r2.existsOriginal(bucket, tenantRoot, filePath);
    const isFolder =
      !isFile && isMove && (await r2.folderExists(bucket, tenantRoot, filePath));
    if (!isFile && !isFolder) return notFound(c, "File not found");

    const dir = path.dirname(filePath);
    const sourceDir = dir === "." ? "" : dir;
    if (isCopy) {
      const copied = await copyFile(bucket, tenantRoot, filePath, sourceDir);
      meterStorage(c, copied.bytes);
      return c.json({ success: true, path: copied.path });
    }

    // No body means move to root.
    const body = await c.req
      .json<{ destination?: unknown }>()
      .catch(() => ({}) as { destination?: unknown });
    const targetDir = normalizeFolder(body.destination);
    if (targetDir === sourceDir)
      return badRequest(c, "File is already in that folder");
    // Stripped even though it comes from a key that already exists: a move
    // heals a hostile name instead of carrying the breakage across, which only
    // ever renames a file that was unreachable anyway.
    const baseName = stripUrlHostile(path.basename(filePath));
    const candidate = targetDir ? `${targetDir}/${baseName}` : baseName;
    const newPath = isFolder
      ? candidate
      : await uniquePath(bucket, tenantRoot, candidate);
    await moveAsset(bucket, tenantRoot, filePath, newPath, { folder: isFolder }, defer(c));
    return c.json({ success: true, path: newPath });
  });
}

// POST /storage/*/thumbnail { thumb } - a dashboard thumbnail the browser
// generated. Written straight into the transform cache under the key
// cdn/serve.ts looks up for this asset, which is the only way a dashboard
// preview renders at all: that path 404s dashboard segments rather than
// waking the container. Never metered: this cost is ours, not the account's.
async function uploadThumbnail(c: Ctx, requestPath: string): Promise<Response> {
  const filePath = storageFilePath(requestPath, /\/thumbnail$/);
  if (!filePath) return badRequest(c, "File path is required");
  const bucket = c.env.MEDIA_BUCKET;
  const tenantRoot = c.get("tenantRoot");
  const ext = extOf(filePath);
  const isImage = isTransformableImageExt(ext);
  if (!isImage && !isVideoExt(ext)) return badRequest(c, "Unsupported file type");
  if (!(await r2.existsOriginal(bucket, tenantRoot, filePath)))
    return notFound(c, "File not found");
  const blob = (await c.req.formData()).get("thumb");
  if (!(blob instanceof File)) return badRequest(c, 'Missing "thumb" thumbnail');
  if (blob.size === 0 || blob.size > THUMB_MAX_BLOB_BYTES)
    return badRequest(c, `Thumbnail must be under ${THUMB_MAX_BLOB_BYTES} bytes`);
  const fullPath = `${tenantRoot}/${filePath}`;
  await bucket.put(thumbnailCacheKey(fullPath, isImage), await blob.arrayBuffer(), {
    httpMetadata: { contentType: `image/${DASHBOARD_THUMB_FORMAT}` },
    customMetadata: { "x-original-path": encodeURIComponent(fullPath) },
  });
  return c.json({ success: true });
}
