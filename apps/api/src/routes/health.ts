import { Hono } from "hono";
import fs from "fs";
import { getDb, resolveDbPath } from "shared";
import { apiKeyAuth, AuthVariables } from "../middleware/auth";
import { logger, serializeError } from "@openinary/core";

const health = new Hono<AuthVariables>();

health.get("/", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "openinary-api",
  });
});

health.get("/database", apiKeyAuth, (c) => {
  try {
    const db = getDb();
    const dbPath = resolveDbPath();

    const stats: {
      connected: boolean;
      path: string;
      size: string;
      permissions: string;
      tables: Record<string, number>;
      warning?: string;
      security_warning?: string;
      file_error?: string;
      table_error?: string;
    } = {
      connected: true,
      path: dbPath,
      size: "unknown",
      permissions: "unknown",
      tables: {},
    };

    try {
      const fileStats = fs.statSync(dbPath);
      stats.size = `${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`;
      stats.permissions = (fileStats.mode & 0o777).toString(8);
      if (fileStats.size > 1024 * 1024 * 1024) {
        stats.warning = "Database size exceeds 1GB, consider cleanup or migration";
      }
      // scripts/secure-db.js sets 600 at container start.
      if (stats.permissions !== "600") {
        stats.security_warning = `Permissions ${stats.permissions} are not optimal. Should be 600 (owner read/write only)`;
      }
    } catch (error) {
      stats.file_error = error instanceof Error ? error.message : "Unknown error";
    }

    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[];
      for (const { name } of tables) {
        const row = db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get() as {
          count: number;
        };
        stats.tables[name] = row.count;
      }
    } catch (error) {
      stats.table_error = error instanceof Error ? error.message : "Unknown error";
    }

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: stats,
    });
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Database health check failed");
    return c.json(
      {
        status: "error",
        database: {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      },
      503,
    );
  }
});

export default health;
