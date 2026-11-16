import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseEnv } from "util";
import { type Db, getDb, kvInit, resolveDbPath } from "./db";
import { allowedOrigins, isPlaceholderSecret } from "./env";

const BUILD_TIME_SECRET = "build-time-secret-will-be-replaced";

const rootEnvPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.env",
);

/** BETTER_AUTH_SECRET from the environment, else from the repo root .env (dev). */
function resolveSecret(): string | undefined {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  if (!fs.existsSync(rootEnvPath)) return undefined;
  return parseEnv(fs.readFileSync(rootEnvPath, "utf-8")).BETTER_AUTH_SECRET?.trim() || undefined;
}

export function requireSecret(): string {
  const secret = resolveSecret();
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set.\n" +
        "Set it in the environment or the root .env file. Generate one with: openssl rand -hex 32",
    );
  }
  // Template placeholders only warn: instances already running on one would
  // otherwise stop starting after an upgrade. The build-time value never ran.
  if (secret === BUILD_TIME_SECRET && process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET is still the build-time placeholder.\n" +
        "Set a unique one in production: openssl rand -hex 32",
    );
  }
  if (isPlaceholderSecret(secret) || secret.length < 32) {
    console.warn(
      "WARNING: BETTER_AUTH_SECRET is a template placeholder or shorter than 32 characters.\n" +
        "Replace it with: openssl rand -hex 32",
    );
  }
  return secret;
}

/**
 * Refuses a secret that differs from the one the database was first used
 * with: every existing session would silently stop working.
 */
function assertSameSecret(db: Db, secret: string): void {
  const hash = crypto.createHash("sha256").update(secret).digest("hex");
  if (kvInit(db, "secret_hash", hash) !== hash) {
    throw new Error(
      "BETTER_AUTH_SECRET mismatch: the secret has changed since the database was created.\n" +
        "All existing sessions will be invalid. If this is intentional, delete the app_state row with key='secret_hash' and restart.",
    );
  }
}

export function createAuth(db: Db, secret: string) {
  const publicAuthUrl = process.env.BETTER_AUTH_URL;
  const baseURL =
    process.env.BETTER_AUTH_INTERNAL_URL || publicAuthUrl || "http://localhost:3000";

  return betterAuth({
    database: db,
    emailAndPassword: { enabled: true },
    secret,
    baseURL,
    // Behind Coolify/Docker nginx terminates TLS, so trust forwarded headers.
    trustHost: true,
    trustedOrigins: allowedOrigins(),
    advanced: {
      defaultCookieAttributes: {
        // The internal URL is plain http even when the public one is https.
        secure: (publicAuthUrl || baseURL).startsWith("https://"),
        httpOnly: true,
        sameSite: "lax",
      },
    },
    session: {
      // Validate against the database every time, so a deleted user's cookie
      // stops working at once.
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      apiKey({
        references: "user",
        // The table predates the plugin's lowercase default. SQLite matched it
        // either way, but Better Auth 1.7's startup schema check is case-sensitive.
        schema: { apikey: { modelName: "apiKey" } },
        permissions: { defaultPermissions: { api: ["read", "write"] } },
        keyExpiration: { maxExpiresIn: 3650 },
        rateLimit: { enabled: true, timeWindow: 60000, maxRequests: 100 },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"]["session"];
export type AuthUser = Auth["$Infer"]["Session"]["user"];

let shared: Auth | undefined;

/** The process-wide Better Auth instance, built on first use. */
export function getAuth(): Auth {
  if (shared) return shared;
  const secret = requireSecret();
  const db = getDb();
  assertSameSecret(db, secret);
  shared = createAuth(db, secret);

  console.log("Better Auth configuration:");
  console.log(`  - Public URL: ${process.env.BETTER_AUTH_URL || "(not set)"}`);
  console.log(`  - Internal URL: ${process.env.BETTER_AUTH_INTERNAL_URL || "(not set)"}`);
  console.log(`  - Trusted origins: ${allowedOrigins().join(", ")}`);
  console.log(`  - Database: ${resolveDbPath()}`);
  if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_URL) {
    console.warn(
      "WARNING: BETTER_AUTH_URL is not set in production. Set it to your app's URL or sign-in and CORS may fail.",
    );
  }
  return shared;
}
