import { Hono } from "hono";
import { auth } from "shared/auth";
import { apiKeyAuth, AuthVariables } from "../middleware/auth";
import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";
import logger from "../utils/logger";

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
health.get("/database", apiKeyAuth, (c) => {
  try {
    const db = auth.options.database as Database.Database;
    const dbPath = process.env.DB_PATH || path.join(process.cwd(), "../../data/auth.db");
    
    // Check database connection
    const connectionCheck = db.prepare("SELECT 1 as test").get() as { test: number };
    
    if (connectionCheck.test !== 1) {
      return c.json({
        status: "error",
        database: {
          connected: false,
          error: "Connection test failed",
        },
      }, 503);
    }
    
    // Get database statistics
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
    
    // Get file size and permissions
    try {
      if (fs.existsSync(dbPath)) {
        const fileStats = fs.statSync(dbPath);
        const sizeInMB = (fileStats.size / (1024 * 1024)).toFixed(2);
        stats.size = `${sizeInMB} MB`;
        
        // Get octal permissions
        const permissions = (fileStats.mode & parseInt('777', 8)).toString(8);
        stats.permissions = permissions;
        
        // Warn if database is getting large (> 1GB)
        if (fileStats.size > 1024 * 1024 * 1024) {
          stats["warning"] = "Database size exceeds 1GB, consider cleanup or migration";
        }
        
        // Warn if permissions are too permissive
        if (permissions !== "600") {
          stats["security_warning"] = `Permissions ${permissions} are not optimal. Should be 600 (owner read/write only)`;
        }
      }
    } catch (error) {
      stats["file_error"] = error instanceof Error ? error.message : "Unknown error";
    }
    
    // Count rows in each table
    try {
      const tables = ["user", "session", "account", "verification", "apiKey"];
      
      for (const table of tables) {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
        stats.tables[table] = count.count;
      }
    } catch (error) {
      stats["table_error"] = error instanceof Error ? error.message : "Unknown error";
    }
    
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: stats,
    });
    
  } catch (error) {
    logger.error({ error }, "Database health check failed");
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

