import { Hono } from "hono";
import { TransformService } from "../services/transform.service";
import type { RouteDeps } from "../config/deps";
import { pathBelowMount, remoteSourceUrl, respond } from "./delivery";
import logger, { serializeError } from "../utils/logger";

export function createTransformRoute(deps: RouteDeps) {
  const transformService = new TransformService(deps.storage, deps.queue, deps.paths);
  const t = new Hono();

  t.get("/*", async (c) => {
    const path = `/t/${pathBelowMount(c)}`;
    try {
      const result = await transformService.transform({
        path,
        userAgent: c.req.header("User-Agent") ?? "",
        acceptHeader: c.req.header("Accept"),
        sourceUrl: remoteSourceUrl(c, deps.allowRemoteSource ?? false),
      });
      return respond(c, result, path);
    } catch (error) {
      logger.error({ error: serializeError(error), path }, "Transform route error");
      return c.text("Internal server error", 500);
    }
  });

  return t;
}
