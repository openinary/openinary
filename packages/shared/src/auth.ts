// Auth layer on Prisma + better-auth's official Prisma adapter (todo 4).
//
// No import-time side effects: the module only defines configuration and
// helpers. Call `initAuth()` (from `initDb()` in ./db) before touching `auth`
// or `db` — both are exposed via lazy accessors that throw a clear pre-init
// error instead of silently opening a database at import time.
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { apiKey } from "@better-auth/api-key";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { PrismaClient } from "./generated/prisma/client.js";
import { getDb } from "./db/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// projectRoot = packages/shared/{src|dist} -> repo root (used only for the root .env fallback)
const projectRoot = path.resolve(__dirname, "../../..");

// Load BETTER_AUTH_SECRET from root .env if not already in process.env.
// This avoids duplicating the secret in each app's individual .env file.
if (!process.env.BETTER_AUTH_SECRET) {
  const rootEnvPath = path.join(projectRoot, ".env");
  if (fs.existsSync(rootEnvPath)) {
    const lines = fs.readFileSync(rootEnvPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("BETTER_AUTH_SECRET=") && !trimmed.startsWith("#")) {
        process.env.BETTER_AUTH_SECRET = trimmed.slice("BETTER_AUTH_SECRET=".length).trim();
        break;
      }
    }
  }
}

// Security validation for production
const isProduction = process.env.NODE_ENV === "production";
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" ||
                    process.env.npm_lifecycle_event === "build";

function validateSecret(secret: string | undefined) {
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
  } else if (!isProduction && !isBuildTime && !secret) {
    throw new Error(
      "🚨 BETTER_AUTH_SECRET is not set.\n" +
      "Add it to your root .env file: BETTER_AUTH_SECRET=<your-secret>\n" +
      "Generate one with: openssl rand -hex 32"
    );
  } else if (isBuildTime && secret === "build-time-secret-will-be-replaced") {
    console.warn("Build phase detected - using placeholder secret (will be validated at runtime)");
  }
}

const publicAuthUrl = process.env.BETTER_AUTH_URL;
const internalAuthUrl = process.env.BETTER_AUTH_INTERNAL_URL;
const baseURL = internalAuthUrl || publicAuthUrl || "http://localhost:3000";
const cookieOriginUrl = publicAuthUrl || baseURL;

const trustedOrigins = [
  // Local development
  "http://localhost:3000",
  "http://localhost:3001",
  // Production / custom origins
  publicAuthUrl,
].filter(Boolean) as string[];

// Warn if URLs are not configured in production
function warnIfUrlMissingInProduction() {
  if (isProduction && !isBuildTime && !process.env.BETTER_AUTH_URL) {
    console.warn(
      "⚠️  WARNING: BETTER_AUTH_URL is not set in production!\n" +
      "   This may cause authentication and CORS issues. Set it to your app's URL."
    );
  }
}

/**
 * Validate that the secret hasn't changed between processes or restarts.
 * Stores a SHA-256 hash of the secret in the AuthConfig table on first use;
 * throws if it differs on subsequent startups (would invalidate all
 * existing sessions). Same semantics as the old sqlite `_auth_config` check.
 */
async function validateSecretConsistency(db: PrismaClient, secret: string) {
  if (!secret || isBuildTime) return;

  const hash = crypto.createHash("sha256").update(secret).digest("hex");
  const row = await db.authConfig.findUnique({ where: { key: "secret_hash" } });

  if (!row) {
    await db.authConfig.create({ data: { key: "secret_hash", value: hash } });
  } else if (row.value !== hash) {
    throw new Error(
      "🚨 BETTER_AUTH_SECRET mismatch: the secret has changed since the database was created.\n" +
      "All existing sessions will be invalid. If this is intentional, delete the auth_config table row with key='secret_hash' and restart."
    );
  }
}

// Derive from the instance (not better-auth's generic `Auth`) so apiKey
// plugin endpoints stay visible on auth.api.
function createAuthBody(secret: string) {
  const db = getDb();
  return betterAuth({
    database: prismaAdapter(db, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false, // Allow signup (will be checked manually in the setup page)
    },
    secret: secret,
    baseURL: baseURL,
    // Trust proxy headers for HTTPS detection behind reverse proxies
    // This is important for Coolify/Docker deployments where nginx terminates SSL
    trustHost: true,
    // Origins allowed to perform authenticated operations (sign-in, sign-out, etc.)
    // In production, this should be configured via environment variables so it
    // matches the real frontend / API origins.
    trustedOrigins: trustedOrigins,
    // Configure secure cookies only when explicitly using HTTPS
    advanced: {
      defaultCookieAttributes: {
        secure: cookieOriginUrl.startsWith("https://"), // Use the public origin when deciding cookie security
        httpOnly: true, // Prevent client-side JavaScript access
        sameSite: "lax", // CSRF protection
      },
    },
    session: {
      // SECURITY: Disable cookie cache to force database validation on every request
      // This prevents deleted users from accessing the system via cached session data
      cookieCache: {
        enabled: false, // Must verify against DB every time
      },
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update every 24 hours
    },
    plugins: [
      apiKey({
        references: "user", // Associate API keys with user accounts
        // Map the plugin's `apikey` model onto our Prisma models:
        // - modelName "apiKey" = Prisma model/property ApiKey (adapter does db[model])
        // - referenceId -> userId column (apps/api queries WHERE userId = ?)
        schema: {
          apikey: {
            modelName: "apiKey",
            fields: {
              referenceId: "userId",
            },
          },
        },
        // Enable API key functionality
        permissions: {
          // Default permissions for newly created API keys
          defaultPermissions: {
            api: ["read", "write"],
          },
        },
        // Key expiration configuration
        keyExpiration: {
          maxExpiresIn: 3650, // 10 years maximum
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
}

let authInstance: ReturnType<typeof createAuthBody> | undefined;

/**
 * Construct the better-auth instance bound to the shared PrismaClient via
 * the official Prisma adapter, and run the secret-consistency check.
 * Idempotent: a second call no-ops. Called from initDb() after the client
 * exists and migrations are applied.
 */
export async function initAuth(): Promise<void> {
  if (authInstance) return;

  const secret = process.env.BETTER_AUTH_SECRET;
  validateSecret(secret);

  console.log("🔐 Better Auth Configuration:");
  console.log(`  - Base URL: ${baseURL}`);
  console.log(`  - Public URL: ${publicAuthUrl || "(not set)"}`);
  console.log(`  - Internal URL: ${internalAuthUrl || "(not set)"}`);
  console.log(`  - Trusted Origins: ${trustedOrigins.join(", ")}`);
  console.log(`  - Environment: ${process.env.NODE_ENV}`);
  warnIfUrlMissingInProduction();

  const db = getDb();
  // Reject a changed BETTER_AUTH_SECRET before serving any auth traffic.
  await validateSecretConsistency(db, secret as string);

  authInstance = createAuthBody(secret as string);
}

type Auth = ReturnType<typeof createAuthBody>;

function requireAuth(): Auth {
  if (!authInstance) {
    throw new Error(
      "Auth not initialized. Call and await initDb() (from @openinary/shared/db) before accessing auth."
    );
  }
  return authInstance;
}

/**
 * The better-auth instance. Lazy accessor — throws until initDb()/initAuth()
 * has run (keeps the historical `import { auth } from "shared/auth"` surface).
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop, receiver) {
    return Reflect.get(requireAuth(), prop, receiver);
  },
  has(_target, prop) {
    return prop in requireAuth();
  },
  ownKeys() {
    return Reflect.ownKeys(requireAuth());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const desc = Reflect.getOwnPropertyDescriptor(requireAuth(), prop);
    return desc ? { ...desc, configurable: true } : undefined;
  },
});

/**
 * Check if any admin account exists (single-admin product constraint).
 * Prisma count on the user table. Errors surface as false, matching the old
 * sqlite behavior.
 */
export async function hasAdminAccount(): Promise<boolean> {
  try {
    const count = await getDb().user.count();
    return count > 0;
  } catch {
    return false;
  }
}

export type AuthSession = Auth["$Infer"]["Session"]["session"];
export type AuthUser = Auth["$Infer"]["Session"]["user"];

/**
 * The shared PrismaClient. Lazy accessor over the db singleton — throws
 * until initDb() has run. Same historical surface as the old sqlite export.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
  has(_target, prop) {
    return prop in getDb();
  },
}) as PrismaClient;
