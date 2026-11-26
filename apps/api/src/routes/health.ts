import { Hono } from "hono";
import fs from "fs";
import { type Dialect, getDatabase, resolveDbPath, sql } from "shared";
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

health.get("/database", apiKeyAuth, async (c) => {
  try {
    const db = await getDatabase();

    const stats: {
      connected: boolean;
      /** "sqlite" or "postgres". Never the URL: it can carry credentials. */
      dialect: Dialect;
      /** SQLite only: the file. */
      path?: string;
      size?: string;
      permissions?: string;
      tables: Record<string, number>;
      warning?: string;
      security_warning?: string;
      file_error?: string;
      table_error?: string;
    } = {
      connected: true,
      dialect: db.dialect,
      tables: {},
    };

    if (db.dialect === "sqlite") {
      const dbPath = resolveDbPath();
      stats.path = dbPath;
      stats.size = "unknown";
      stats.permissions = "unknown";
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
    }

    try {
      const { rows: tables } =
        db.dialect === "sqlite"
          ? await sql<{ name: string }>`
              SELECT name FROM sqlite_master
              WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name
            `.execute(db)
          : await sql<{ name: string }>`
              SELECT table_name AS name FROM information_schema.tables
              WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
              ORDER BY table_name
            `.execute(db);
      for (const { name } of tables) {
        const { rows } = await sql<{ count: number }>`
          SELECT COUNT(*) AS count FROM ${sql.table(name)}
        `.execute(db);
        stats.tables[name] = Number(rows[0]?.count ?? 0);
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
