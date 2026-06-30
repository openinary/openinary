import { Hono } from "hono";
import { createStorageClient } from "../utils/storage/index";
import { zipSync, strToU8 } from "fflate";
import fs from "fs";
import path from "path";
import logger, { serializeError } from "../utils/logger";

const downloadFolder = new Hono();
const storage = createStorageClient();

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
 * GET /download-folder/:path
 * Returns all files under the given folder path as a ZIP archive.
 */
downloadFolder.get("/*", async (c) => {
  const requestPath = c.req.path;
  const rawFolderPath = requestPath.replace(/^\/download-folder\/?/, "");

  if (!rawFolderPath) {
    return c.text("Folder path is required", 400);
  }

  let folderPath: string;
  try {
    folderPath = decodeURIComponent(rawFolderPath)
      .replace(/\.\./g, "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  } catch {
    return c.text("Invalid folder path", 400);
  }

  if (!folderPath) {
    return c.text("Invalid folder path", 400);
  }

  const folderName = folderPath.split("/").pop() ?? folderPath;

  try {
    const zipFiles: Record<string, Uint8Array> = {};

    if (storage) {
      // Cloud storage: list all objects under the prefix
      const prefix = `public/${folderPath}/`;
      const objects = await storage.list(prefix);

      if (objects.length === 0) {
        return c.text("Folder not found or empty", 404);
      }

      for (const obj of objects) {
        // obj.key looks like "public/videos/clip.mp4"
        const relPath = obj.key.replace(`public/${folderPath}/`, "");
        // Skip folder marker objects (empty keys or keys ending in /)
        if (!relPath || relPath.endsWith("/")) continue;

        const buffer = await storage.downloadOriginal(`${folderPath}/${relPath}`);
        zipFiles[relPath] = new Uint8Array(buffer);
      }
    } else {
      // Local storage
      const localDir = path.join("./public", folderPath);
      if (!fs.existsSync(localDir) || !fs.statSync(localDir).isDirectory()) {
        return c.text("Folder not found", 404);
      }

      const entries = collectLocalFiles(localDir, "");
      if (entries.length === 0) {
        return c.text("Folder is empty", 404);
      }

      for (const entry of entries) {
        zipFiles[entry.arcPath] = new Uint8Array(fs.readFileSync(entry.fullPath));
      }
    }

    if (Object.keys(zipFiles).length === 0) {
      return c.text("Folder is empty", 404);
    }

    const zipBuffer = zipSync(zipFiles);

    c.header("Content-Type", "application/zip");
    c.header(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(folderName)}.zip"`,
    );
    c.header("Content-Length", zipBuffer.length.toString());
    c.header("Cache-Control", "private, no-store");
    return c.body(zipBuffer);
  } catch (error) {
    logger.error({ error: serializeError(error), folderPath }, "Folder download failed");
    return c.text("Internal server error", 500);
  }
});

export default downloadFolder;
