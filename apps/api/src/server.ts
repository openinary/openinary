import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./index";
import { getSharedStorage } from "./config/storage";
import { auth } from "shared/auth";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { logger, serializeError } from "@openinary/core";
import { videoJobQueue } from "./config/queue";
import { initTelemetry } from "./utils/telemetry";

// Function to clean local cache in cloud mode on startup
const cleanupLocalCacheIfCloudMode = () => {
  const storage = getSharedStorage();
  if (storage) {
    const cacheDir = "./cache";
    if (fs.existsSync(cacheDir)) {
      try {
        const files = fs.readdirSync(cacheDir);
        files.forEach((file) => {
          const filePath = path.join(cacheDir, file);
          fs.unlinkSync(filePath);
        });
      } catch (error) {
        logger.warn(
          { error: serializeError(error) },
          "Failed to cleanup local cache on startup",
        );
      }
    }
  }
};

// Clean local cache on startup if in cloud mode
cleanupLocalCacheIfCloudMode();

// Create necessary directories
const dirs = ["./cache", "./temp"];
dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info({ dir }, "Created directory");
  }
});

// Initialize video job queue with storage client
videoJobQueue.initialize(getSharedStorage());

// Initialize authentication and generate API key if needed (only in standalone mode)
async function initializeAuth() {
  try {
    const mode = process.env.MODE || "fullstack";
    const db = auth.options.database;
    const users = db.prepare("SELECT COUNT(*) as count FROM user").get() as {
      count: number;
    };

    if (users.count > 0)
      return logger.info(
        { userCount: users.count },
        `Database initialized (${mode === "api" ? "API STANDALONE mode" : "FULLSTACK mode"})`,
      );

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

    // Setup user and API key if configured
    logger.info("Creating admin user...");

    // Create a system user (because configured OR required for API key association)
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: accEmail || "system@openinary.local",
        password: accPassword || randomUUID() + randomUUID(),
        name: accName || "Admin",
      },
    });

    if (!signUpResult) throw new Error("Creating initial user failed.");

    logger.info("Initial user created successfully!");

    if (!generateApiKey)
      return logger.info(
        { userCount: users.count },
        `Database initialized (${mode === "api" ? "API STANDALONE mode" : "FULLSTACK mode"})`,
      );

    // Create an API key for this user
    const apiKeyResult = await auth.api.createApiKey({
      body: {
        name: "Initial API Key",
        userId: signUpResult.user.id,
        expiresIn: 365 * 24 * 60 * 60, // 1 year in seconds
      },
    });

    if (!apiKeyResult || !("key" in apiKeyResult)) {
      const deleteResult = db
        .prepare(`DELETE FROM user WHERE id=${signUpResult.user.id}`)
        .get() as {
        rowsAffected: number;
      };

      if (deleteResult.rowsAffected === 0)
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
    logger.info(
      { userCount: users.count },
      `Database initialized (${mode === "api" ? "API STANDALONE mode" : "FULLSTACK mode"})`,
    );
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Database setup failed.");
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
initializeAuth().catch((error) => {
  logger.error(
    { error: serializeError(error) },
    "Error during background auth initialization",
  );
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully...");
  videoJobQueue.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully...");
  videoJobQueue.stop();
  process.exit(0);
});
