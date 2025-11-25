import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../../../");
const dataDir = path.join(projectRoot, "data");

/**
 * Ensures the data directory exists
 */
export function ensureDataDirectory() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Checks if a table exists in the database
 */
function tableExists(db: Database.Database, tableName: string): boolean {
  try {
    const result = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      )
      .get(tableName);
    return !!result;
  } catch (error) {
    return false;
  }
}

/**
 * Initializes the database with all required tables
 * This function is idempotent - it can be called multiple times safely
 */
export function initializeDatabase(db: Database.Database) {
  // Ensure data directory exists
  ensureDataDirectory();

  // Check if tables already exist
  const requiredTables = ["user", "session", "account", "verification", "apiKey"];
  const missingTables = requiredTables.filter((table) => !tableExists(db, table));

  if (missingTables.length === 0) {
    return;
  }

  // User table
  if (!tableExists(db, "user")) {
    db.exec(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        image TEXT,
        twoFactorEnabled INTEGER DEFAULT 0
      );
    `);
  }

  // Session table
  if (!tableExists(db, "session")) {
    db.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      );
    `);
  }

  // Account table
  if (!tableExists(db, "account")) {
    db.exec(`
      CREATE TABLE account (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        accountId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        accessToken TEXT,
        refreshToken TEXT,
        idToken TEXT,
        accessTokenExpiresAt INTEGER,
        refreshTokenExpiresAt INTEGER,
        scope TEXT,
        password TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      );
    `);
  }

  // Verification table
  if (!tableExists(db, "verification")) {
    db.exec(`
      CREATE TABLE verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
    `);
  }

  // API Key table (for the apiKey plugin)
  if (!tableExists(db, "apiKey")) {
    db.exec(`
      CREATE TABLE apiKey (
        id TEXT PRIMARY KEY,
        name TEXT,
        start TEXT,
        prefix TEXT,
        key TEXT NOT NULL,
        userId TEXT NOT NULL,
        refillInterval INTEGER,
        refillAmount INTEGER,
        lastRefillAt INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        rateLimitEnabled INTEGER NOT NULL DEFAULT 1,
        rateLimitTimeWindow INTEGER,
        rateLimitMax INTEGER,
        requestCount INTEGER NOT NULL DEFAULT 0,
        remaining INTEGER,
        lastRequest INTEGER,
        expiresAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        permissions TEXT,
        metadata TEXT,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      );
    `);
  }
}





