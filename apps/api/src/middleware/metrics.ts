import type { Context, Next } from "hono";
import { logger, serializeError, transformOutcome } from "@openinary/core";

import { isDashboardTraffic } from "../utils/activity-log";
import { type DeliveryRoute, recordDelivery } from "../utils/otel";

/**
 * Hands every request to a delivery route to the OpenTelemetry export once the
 * response is known. Mounted ahead of the rate limiter, so a 429 is counted
 * too, and unlike the delivery log it keeps repeats and dashboard traffic:
 * those are real load on the server, labelled so they can be filtered out.
 *
 * Costs one branch per request while the export is off.
 */
export function measureDelivery(route: DeliveryRoute) {
  const prefix = `/${route}`;
  return async (c: Context, next: Next) => {
    const start = performance.now();
    await next();
    try {
      let path: string;
      try {
        path = decodeURIComponent(c.req.path.slice(prefix.length + 1));
      } catch {
        path = c.req.path.slice(prefix.length + 1);
      }
      if (!path) return;
      recordDelivery({
        route,
        path,
        method: c.req.method,
        status: c.res.status,
        outcome: transformOutcome(c),
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        dashboard: isDashboardTraffic(c.req.header("Cookie")),
      });
    } catch (error) {
      logger.error({ error: serializeError(error) }, "Failed to record delivery metrics");
    }
  };
}
