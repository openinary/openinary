import { Hono } from "hono";
import { apiKeyAuth, AuthVariables } from "../middleware/auth";
import { getDb } from "shared/db";
import { logger, serializeError } from "@openinary/core";

const health = new Hono<AuthVariables>();

// Public health check - no authentication required
health.get("/", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "openinary-api",
  });
});

// Database health check - protected endpoint
health.get("/database", apiKeyAuth, async (c) => {
  try {
    const start = Date.now();
    await getDb().$queryRaw`SELECT 1 as test`;
    const latencyMs = Date.now() - start;

    const db = getDb();
    const [userCount, sessionCount, accountCount, verificationCount, apiKeyCount] =
      await Promise.all([
        db.user.count(),
        db.session.count(),
        db.account.count(),
        db.verification.count(),
        db.apiKey.count(),
      ]);

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        latencyMs,
        tables: {
          user: userCount,
          session: sessionCount,
          account: accountCount,
          verification: verificationCount,
          apiKey: apiKeyCount,
        },
      },
    });

  } catch (error) {
    logger.error({ error: serializeError(error) }, "Database health check failed");
    return c.json({
      status: "error",
      database: {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    }, 503);
  }
});

export default health;

