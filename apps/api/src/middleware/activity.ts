import type { Context, Next } from "hono";
import { logger, serializeError } from "@openinary/core";

import { activityLog } from "../config/activity";
import { isDashboardTraffic, isOpeningRange } from "../utils/activity-log";
import type { AuthVariables } from "./auth";

const viewerOf = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
  c.req.header("x-real-ip") ||
  "unknown";

/**
 * Writes a line to the delivery log once the response is known. Runs after the
 * route, so it records the status the caller actually received, and a failure
 * in here can never cost anyone their image.
 */
export function logDelivery(prefix: string) {
  return async (c: Context, next: Next) => {
    await next();
    try {
      if (c.req.method !== "GET") return;
      // Still transcoding: nothing was delivered yet.
      if (c.res.status === 202) return;
      if (!isOpeningRange(c.req.header("Range"))) return;
      if (isDashboardTraffic(c.req.header("Cookie"))) return;

      const path = decodeURIComponent(c.req.path.slice(prefix.length + 1));
      if (!path) return;
      // Deliberately not awaited — the surrounding try/catch is sync and
      // cannot see the promise, so failures are caught here instead.
      activityLog
        .recordDelivery({ p: path, s: c.res.status }, viewerOf(c))
        .catch((error) =>
          logger.error({ error: serializeError(error) }, "Failed to record delivery"),
        );
    } catch (error) {
      logger.error(
        { error: serializeError(error) },
        "Failed to record delivery",
      );
    }
  };
}

/**
 * Notes the first upload that came from an app rather than from the
 * dashboard: an API key or a presigned signature, never the session cookie.
 * presignedOrApiKeyAuth sets `user` to null for a signature, and a session
 * sets `user` without an `apiKey`.
 */
export async function noteApiUpload(c: Context<AuthVariables>, next: Next) {
  await next();
  try {
    if (c.req.method !== "POST" || c.req.path !== "/upload" || !c.res.ok) return;
    if (c.get("apiKey") || !c.get("user")) {
      activityLog.markApiUpload().catch((error) =>
        logger.error({ error: serializeError(error) }, "Failed to note upload"),
      );
    }
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Failed to note upload");
  }
}
