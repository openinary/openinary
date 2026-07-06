import { Hono } from "hono";
import { createStorageClient } from "../utils/storage/index";
import { zipSync } from "fflate";
import fs from "fs";
import path from "path";
import logger, { serializeError } from "../utils/logger";

const downloadZip = new Hono();
const storage = createStorageClient();

const MAX_PATHS = 200;

function sanitizePath(raw: string): string {
  return decodeURIComponent(raw)
    .replace(/\.\./g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function collectLocalFiles(
  dir: string,
  base: string,
): { arcPath: string; fullPath: string }[] {
  const results: { arcPath: string; fullPath: string }[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectLocalFiles(full, rel));
    } else {
      results.push({ arcPath: rel.replace(/\\/g, "/"), fullPath: full });
    }
  }
  return results;
}

/**
 * POST /download-zip
 * body: { paths: string[] }
 * Bundles multiple files and/or folders (mixed) into a single ZIP archive.
 * Entries keep their full relative path so items with the same filename in
 * different folders don't collide inside the archive.
 */
downloadZip.post("/", async (c) => {
  let body: { paths?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Bad request", message: "Invalid JSON body" }, 400);
  }

  const rawPaths = Array.isArray(body.paths)
    ? body.paths.filter((p): p is string => typeof p === "string")
    : [];

  if (rawPaths.length === 0) {
    return c.json(
      { error: "Bad request", message: "A non-empty 'paths' array is required" },
      400,
    );
  }

  if (rawPaths.length > MAX_PATHS) {
    return c.json(
      { error: "Bad request", message: `Too many items requested (max ${MAX_PATHS})` },
      400,
    );
  }

  try {
    const zipFiles: Record<string, Uint8Array> = {};

    for (const raw of rawPaths) {
      const cleanPath = sanitizePath(raw);
      if (!cleanPath) continue;

      if (storage) {
        const isFolder = await storage.folderExists(cleanPath);
        if (isFolder) {
          const prefix = `public/${cleanPath}/`;
          const objects = await storage.list(prefix);
          for (const obj of objects) {
            const relPath = obj.key.replace(`public/${cleanPath}/`, "");
            if (!relPath || relPath.endsWith("/")) continue;
            const buffer = await storage.downloadOriginal(`${cleanPath}/${relPath}`);
            zipFiles[`${cleanPath}/${relPath}`] = new Uint8Array(buffer);
          }
        } else {
          try {
            const buffer = await storage.downloadOriginal(cleanPath);
            zipFiles[cleanPath] = new Uint8Array(buffer);
          } catch {
            // Skip missing files rather than failing the whole archive
          }
        }
      } else {
        const localPath = path.join("./public", cleanPath);
        if (!fs.existsSync(localPath)) continue;
        if (fs.statSync(localPath).isDirectory()) {
          for (const entry of collectLocalFiles(localPath, cleanPath)) {
            zipFiles[entry.arcPath] = new Uint8Array(fs.readFileSync(entry.fullPath));
          }
        } else {
          zipFiles[cleanPath] = new Uint8Array(fs.readFileSync(localPath));
        }
      }
    }

    if (Object.keys(zipFiles).length === 0) {
      return c.json(
        { error: "Not found", message: "No files found for the given paths" },
        404,
      );
    }

    const zipBuffer = zipSync(zipFiles);

    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="download.zip"`);
    c.header("Content-Length", zipBuffer.length.toString());
    c.header("Cache-Control", "private, no-store");
    return c.body(zipBuffer);
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Bulk zip download failed");
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default downloadZip;
