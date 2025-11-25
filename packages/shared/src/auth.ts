import { betterAuth } from "better-auth";
import { apiKey } from "better-auth/plugins";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

// Get the project root directory (3 levels up from this file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../../");

// Configurable database path via environment variable
const dataDir = process.env.DB_PATH 
  ? path.dirname(process.env.DB_PATH)
  : path.join(projectRoot, "data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "auth.db");

// Security validation for production
const secret = process.env.BETTER_AUTH_SECRET;
const isProduction = process.env.NODE_ENV === "production";
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || 
                    process.env.npm_lifecycle_event === "build";

// Only validate secrets at runtime, not during build
if (isProduction && !isBuildTime) {
  // Critical: Secret must be defined in production
  if (!secret) {
    throw new Error(
      "🚨 SECURITY ERROR: BETTER_AUTH_SECRET must be set in production!\n" +
      "Generate one with: openssl rand -hex 32"
    );
  }
  
  // Critical: Secret must not be the build-time placeholder
  if (secret === "build-time-secret-will-be-replaced") {
    throw new Error(
      "🚨 SECURITY ERROR: BETTER_AUTH_SECRET is still set to the build-time placeholder!\n" +
      "You must set a unique secret in production."
    );
  }
  
  // Warning: Secret should be strong (at least 32 characters)
  if (secret.length < 32) {
    console.warn(
      "WARNING: BETTER_AUTH_SECRET is shorter than 32 characters.\n" +
      "For better security, use: openssl rand -hex 32"
    );
  }
} else if (isBuildTime && secret === "build-time-secret-will-be-replaced") {
  console.warn("Build phase detected - using placeholder secret (will be validated at runtime)");
}

// Ensure data directory exists before creating database
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}

// Create database instance
const db = new Database(dbPath);

// Initialize database tables automatically
function initializeTables() {
  const tableExists = (tableName: string): boolean => {
    try {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName);
      return !!result;
    } catch {
      return false;
    }
  };

  const requiredTables = ["user", "session", "account", "verification", "apiKey"];
  const missingTables = requiredTables.filter((table) => !tableExists(table));

  if (missingTables.length === 0) {
    return; // Tables already exist
  }

  console.log(`Initializing database tables: ${missingTables.join(", ")}...`);

  // User table
  if (!tableExists("user")) {
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
  if (!tableExists("session")) {
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
  if (!tableExists("account")) {
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
  if (!tableExists("verification")) {
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

  // API Key table
  if (!tableExists("apiKey")) {
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

  console.log("Database tables initialized!\n");
}

// Initialize tables before creating Better Auth instance
initializeTables();

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
    disableSignUp: false, // Allow signup (will be checked manually in the setup page)
  },
  secret: secret,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  session: {
    // Enforce secure cookies in production (HTTPS only)
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache for 5 minutes
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update every 24 hours
  },
  plugins: [
    apiKey({
      // Enable API key functionality
      permissions: {
        // Default permissions for newly created API keys
        defaultPermissions: {
          api: ["read", "write"],
        },
      },
      // Rate limiting configuration
      rateLimit: {
        enabled: true,
        timeWindow: 60000, // 1 minute
        maxRequests: 100,
      },
    }),
  ],
});

// Helper function to check if any admin account exists
export function hasAdminAccount(): boolean {
  try {
    const result = db.prepare("SELECT COUNT(*) as count FROM user").get() as { count: number };
    return result.count > 0;
  } catch (error) {
    return false;
  }
}

export type AuthSession = typeof auth.$Infer.Session.session;
export type AuthUser = typeof auth.$Infer.Session.user;

