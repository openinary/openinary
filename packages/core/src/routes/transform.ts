import { Hono } from "hono";
import { TransformService } from "../services/transform.service";
import type { RouteDeps } from "../config/deps";
import { remoteSourceUrl } from "./transform-helpers";
import logger, { serializeError } from "../utils/logger";

export function createTransformRoute(deps: RouteDeps) {
  const transformService = new TransformService(deps.storage, deps.queue);
  const t = new Hono();

  t.get("/*", async (c) => {
    const path = c.req.path;
    const userAgent = c.req.header("User-Agent") ?? "";
    const acceptHeader = c.req.header("Accept");

    try {
      const result = await transformService.transform({
        path,
        userAgent,
        acceptHeader,
        context: c,
        sourceUrl: remoteSourceUrl(c),
      });

      // Set response headers.
      //
      // Content-Length is dropped for a buffered body and kept for a streamed
      // one, because @hono/node-server only writes its own when it can measure
      // the body:
      //
      //   buffer + our header  -> "content-length" AND "Content-Length", twice
      //   buffer, no header    -> Content-Length, correct
      //   stream + our header  -> Content-Length, correct, no duplicate
      //   stream, no header    -> Transfer-Encoding: chunked, length lost
      //
      // Two Content-Lengths is a framing error (RFC 9110 8.6): undici rejects
      // the response outright, and a caller proxying this instance over fetch
      // can be left awaiting one that never settles, with no status to report.
      // Dropping it unconditionally trades that for the last line above -
      // a bare /t/<video> would stream the original with no length at all.
      Object.entries(result.headers).forEach(([key, value]) => {
        if (key.toLowerCase() === "content-length" && !result.stream) return;
        c.header(key, value);
      });

      // Determine content type if not set in headers
      if (!result.contentType) {
        // Extract file extension from path
        const ext = path.split(".").pop()?.toLowerCase();
        const contentTypeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
          avif: "image/avif",
          gif: "image/gif",
          mp4: "video/mp4",
          mov: "video/quicktime",
          webm: "video/webm",
        };
        const contentType =
          contentTypeMap[ext || ""] || "application/octet-stream";
        c.header("Content-Type", contentType);
      } else {
        c.header("Content-Type", result.contentType);
      }

      // Large payloads (e.g. untransformed originals) are streamed
      if (result.stream) {
        return c.body(result.stream);
      }

      // Video transform still running: no content to serve yet
      if (result.status === 202) {
        return c.body(new Uint8Array(result.buffer!), 202);
      }

      // Check if this is an error response
      if (
        result.contentType === "text/plain" &&
        result.buffer!.toString().includes("failed")
      ) {
        const errorMessage = result.buffer!.toString();
        if (errorMessage.includes("File not found")) {
          return c.text(errorMessage, 404);
        }
        return c.text(errorMessage, 500);
      }

      return c.body(new Uint8Array(result.buffer!));
    } catch (error) {
      logger.error(
        { error: serializeError(error), path },
        "Transform route error",
      );
      return c.text("Internal server error", 500);
    }
  });

  return t;
}
