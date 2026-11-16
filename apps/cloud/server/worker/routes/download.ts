// GET /download/*: an original as an attachment, for the dashboard.

import { contentTypeForExt, extOf } from "@openinary/core/url";
import * as r2 from "../r2-storage.js";
import {
  objectResponse,
  parseRangeHeader,
  RANGE_EXPOSE_HEADERS,
} from "../responses.js";
import type { App } from "./tenant.js";

export function downloadRoutes(app: App): void {
  app.get("/download/*", async (c) => {
    const requestPath = new URL(c.req.url).pathname;
    const rawFilePath = requestPath.replace(/^\/download\/?/, "");
    if (!rawFilePath) return c.text("File path is required", 400);
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
    if (!filePath) return c.text("Invalid file path", 400);
    const filename = filePath.split("/").pop() || filePath;
    const bucket = c.env.MEDIA_BUCKET;
    const tenantRoot = c.get("tenantRoot");
    try {
      // Range support exists for mediabunny's client-side video-thumbnail
      // reads (the dashboard's thumbnail generator), not for the attachment
      // download UI, which never sends one.
      const rangeHeader = c.req.header("Range") ?? null;
      const meta = rangeHeader
        ? await r2.getOriginalMetadata(bucket, tenantRoot, filePath)
        : null;
      if (rangeHeader && !meta) return c.text("File not found", 404);
      const range = meta ? parseRangeHeader(rangeHeader, meta.size) : null;
      if (rangeHeader && !range) return c.text("Range Not Satisfiable", 416);

      const object = await r2.downloadOriginal(
        bucket,
        tenantRoot,
        filePath,
        range ? { range } : undefined,
      );
      if (!object) return c.text("File not found", 404);

      const headers = new Headers({
        "Content-Type": contentTypeForExt(extOf(filename)),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "Access-Control-Expose-Headers": RANGE_EXPOSE_HEADERS,
      });
      return objectResponse(object, headers, range);
    } catch (error) {
      console.error("Download failed", error);
      return c.text("Internal server error", 500);
    }
  });
}
