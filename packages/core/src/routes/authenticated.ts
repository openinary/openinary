import { Hono } from "hono";
import { TransformService } from "../services/transform.service";
import type { RouteDeps } from "../config/deps";
import logger, { serializeError } from "../utils/logger";
import { verifySignature, sanitizeFilePath } from "../utils/signature";
import { SIGNATURE_LENGTH } from "../url/hmac";
import { splitTransformPath } from "../url/grammar";
import { pathBelowMount, respond } from "./delivery";

export function createAuthenticatedRoute(deps: RouteDeps) {
  const transformService = new TransformService(deps.storage, deps.queue, deps.paths);
  const t = new Hono();

  t.get("/*", async (c) => {
    const path = pathBelowMount(c);

    try {
      // s--{signature}/{transformations}/{file}
      const segments = path.split("/");
      if (segments.length < 2) {
        return c.text(
          "Invalid authenticated URL format. Expected: /s--{signature}/{transformations}/{route}",
          400,
        );
      }
      if (!segments[0].startsWith("s--")) {
        return c.text("Invalid signature format. Expected: s--{signature}", 400);
      }
      const signature = segments[0].slice(3);
      if (signature.length !== SIGNATURE_LENGTH) {
        return c.text(
          `Invalid signature length. Expected ${SIGNATURE_LENGTH} characters.`,
          400,
        );
      }

      const { transform, filePath } = splitTransformPath(segments.slice(1).join("/"));
      if (!filePath) {
        return c.text("No file path specified.", 400);
      }

      let sanitizedFilePath: string;
      try {
        sanitizedFilePath = sanitizeFilePath(filePath);
      } catch (error) {
        logger.warn(
          { path, filePath, error },
          "Path traversal attempt detected in authenticated request",
        );
        return c.text("Invalid file path", 400);
      }

      if (!deps.apiSecret) {
        return c.text("API_SECRET not configured on server.", 500);
      }
      if (!verifySignature(signature, transform, sanitizedFilePath, deps.apiSecret)) {
        logger.warn(
          { path, signature, transformations: transform, filePath: sanitizedFilePath },
          "Invalid signature for authenticated request",
        );
        return c.text("Invalid signature", 401);
      }

      const result = await transformService.transform({
        path: `/t/${transform ? `${transform}/` : ""}${sanitizedFilePath}`,
        userAgent: c.req.header("User-Agent") ?? "",
        acceptHeader: c.req.header("Accept"),
      });
      // The signature gates who can request a URL, not what the stored bytes
      // are: respond() applies the same nosniff and content-type rules as /t.
      return respond(c, result, sanitizedFilePath);
    } catch (error) {
      logger.error(
        { error: serializeError(error), path },
        "Authenticated transform route error",
      );
      return c.text("Internal server error", 500);
    }
  });

  return t;
}
