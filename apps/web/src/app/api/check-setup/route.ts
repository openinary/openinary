import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Use the same database path as the API server / Better Auth
    // In Docker, the database lives at /app/data/auth.db (controlled by DB_PATH)
    // In development, fall back to the previous relative path behaviour
    const isDocker = process.env.DOCKER_CONTAINER === "true";
    const defaultDbPath = isDocker
      ? "/app/data/auth.db"
      : path.join(process.cwd(), "../../data/auth.db");
    const dbPath = process.env.DB_PATH || defaultDbPath;
    
    // Check if database file exists and has users
    try {
      const db = new Database(dbPath, { readonly: true });
      const result = db.prepare("SELECT COUNT(*) as count FROM user").get() as { count: number };
      db.close();

      return NextResponse.json({
        setupComplete: result.count > 0,
      });
    } catch (error) {
      // Database doesn't exist or table doesn't exist - setup not complete
      return NextResponse.json({
        setupComplete: false,
      });
    }
  } catch (error) {
    logger.error("Error checking setup status", { error });
    return NextResponse.json(
      { error: "Failed to check setup status" },
      { status: 500 }
    );
  }
}

