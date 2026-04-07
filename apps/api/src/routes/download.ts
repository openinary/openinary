import { Hono } from "hono";
import { createStorageClient } from "../utils/storage/index";
import fs from "fs";
import path from "path";
import logger, { serializeError } from "../utils/logger";

const download = new Hono();
const storage = createStorageClient();

/**
 * GET /download/:path
 * Serves the original stored file as an attachment (no transformation applied).
 * Public route — consistent with /t/* which is also public.
 */
download.get("/*", async (c) => {
  const requestPath = c.req.path;

  // Strip leading /download/ prefix
  const rawFilePath = requestPath.replace(/^\/download\/?/, "");

  if (!rawFilePath) {
    return c.text("File path is required", 400);
  }

  // Decode and sanitise path (prevent directory traversal)
  let filePath: string;
  try {
    filePath = decodeURIComponent(rawFilePath)
      .replace(/\.\./g, "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");
  } catch {
    return c.text("Invalid file path", 400);
  }

  if (!filePath) {
    return c.text("Invalid file path", 400);
  }

  const filename = path.basename(filePath);

  try {
    let buffer: Buffer;

    if (storage) {
      // Cloud storage
      try {
        buffer = await storage.downloadOriginal(filePath);
      } catch {
        return c.text("File not found", 404);
      }
    } else {
      // Local storage
      const localPath = path.join("./public", filePath);
      if (!fs.existsSync(localPath) || fs.statSync(localPath).isDirectory()) {
        return c.text("File not found", 404);
      }
      buffer = fs.readFileSync(localPath);
    }

    // Derive a safe Content-Type from the extension
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const contentTypeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      avif: "image/avif",
      gif: "image/gif",
      psd: "image/vnd.adobe.photoshop",
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
    };
    const contentType = contentTypeMap[ext] ?? "application/octet-stream";

    c.header("Content-Type", contentType);
    c.header("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    c.header("Content-Length", buffer.length.toString());
    c.header("Cache-Control", "private, no-store");
    return c.body(new Uint8Array(buffer));
  } catch (error) {
    logger.error({ error: serializeError(error), filePath }, "Download failed");
    return c.text("Internal server error", 500);
  }
});

export default download;
