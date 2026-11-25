import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./index";
import { getSharedStorage } from "./config/storage";
import { getDb, hasAdmin } from "shared";
import { getAuth } from "shared/auth";
import { randomUUID } from "crypto";
import { clearAllCache, logger } from "@openinary/core";
import { enginePaths, videoJobQueue } from "./config/queue";
import { initTelemetry } from "./utils/telemetry";
import { initOtel, recordVideoTranscode, shutdownOtel } from "./utils/otel";
import { deploymentMode } from "./config/mode";

// In cloud mode the bucket is the cache: local files from a previous run go.
if (getSharedStorage()) await clearAllCache(enginePaths.cache);

videoJobQueue.start();

// Opt-in OpenTelemetry export (OTEL_EXPORTER_OTLP_ENDPOINT); a no-op otherwise.
await initOtel();
videoJobQueue.on("job:completed", recordVideoTranscode);

/**
 * First boot only: creates the admin from OPENINARY_ADMIN_* and, in API mode
 * or when asked, an initial API key printed once to the log (the CLI reads it
 * back from the "API Key: " line).
 */
async function initializeAuth() {
  try {
    const mode = deploymentMode();
    const modeLabel = mode === "api" ? "API STANDALONE mode" : "FULLSTACK mode";
    // Fails fast on a missing or changed BETTER_AUTH_SECRET.
    const auth = getAuth();
    if (hasAdmin()) return logger.info(`Database initialized (${modeLabel})`);

    const accName = process.env.OPENINARY_ADMIN_NAME?.trim();
    const accEmail = process.env.OPENINARY_ADMIN_EMAIL?.trim();
    const accPassword = process.env.OPENINARY_ADMIN_PASSWORD;
    const generateApiKey =
      process.env.OPENINARY_GENERATE_API_KEY?.trim() === "true";

    if (mode === "fullstack" && !generateApiKey && !accEmail && !accPassword)
      return logger.info(
        "No users found. Please visit /setup to create your first admin account.",
      );

    if ((!accEmail && accPassword) || (accEmail && !accPassword))
      throw new Error(
        "You have to configure both admin email and password or none.",
      );

    if (mode === "fullstack" && generateApiKey && !accEmail)
      throw new Error(
        "In fullstack mode you have to also configure admin credentials for generating an API key on initialization.",
      );

    logger.info("Creating admin user...");

    // API mode needs a user to own the key even without configured credentials.
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: accEmail || "system@openinary.local",
        password: accPassword || randomUUID() + randomUUID(),
        name: accName || "Admin",
      },
    });

    if (!signUpResult) throw new Error("Creating initial user failed.");

    logger.info("Initial user created successfully!");

    if (!generateApiKey && mode === "fullstack")
      return logger.info(`Database initialized (${modeLabel})`);

    const apiKeyResult = await auth.api.createApiKey({
      body: {
        name: "Initial API Key",
        userId: signUpResult.user.id,
        expiresIn: 365 * 24 * 60 * 60,
      },
    });

    if (!apiKeyResult || !("key" in apiKeyResult)) {
      // Removed so the next boot can try again with the same credentials.
      const { changes } = getDb()
        .prepare("DELETE FROM user WHERE id = ?")
        .run(signUpResult.user.id);

      if (changes === 0)
        throw new Error(
          "Initial API Key could not be generated. Deleting user for cleanup failed.",
        );

      throw new Error(
        "Initial API Key could not be generated. User was removed again.",
      );
    }

    logger.info(
      { apiKeyId: apiKeyResult.id },
      "┌─────────────────────────────────────────────────────────────────┐\n│                  Initial API Key Generated                      │\n├─────────────────────────────────────────────────────────────────┤\n│                                                                 │\n│  API Key: " +
        apiKeyResult.key +
        "                                   │\n│                                                                 │\n│  Save this key now! It will not be shown again.                 │\n│                                                                 │\n└─────────────────────────────────────────────────────────────────┘",
    );
    logger.info(`Database initialized (${modeLabel})`);
  } catch (error: any) {
    logger.error(error?.message || "Database setup failed.");
    process.exit(1);
  }
}

const port = Number(process.env.PORT) || 3000;

// Start server immediately so healthcheck can respond quickly
serve({
  fetch: app.fetch,
  port,
});

logger.info({ port }, "Server running");

// Anonymous usage telemetry (non-blocking, opt-out via OPENINARY_TELEMETRY=false)
initTelemetry();

// Initialize auth in background (non-blocking)
// This allows the server to respond to healthchecks immediately
initializeAuth();

// Graceful shutdown
// Flushes buffered metrics and delivery logs first, within a few seconds.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  videoJobQueue.stop();
  void shutdownOtel().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully...");
  videoJobQueue.stop();
  void shutdownOtel().finally(() => process.exit(0));
});
