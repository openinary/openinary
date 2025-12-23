import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./index";
import { createStorageClient } from "./utils/storage/index";
import { auth } from "shared/auth";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import logger from "./utils/logger";
import { videoJobQueue } from "./utils/video-job-queue";

// Function to clean local cache in cloud mode on startup
const cleanupLocalCacheIfCloudMode = () => {
  const storage = createStorageClient();
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
        logger.warn({ error }, "Failed to cleanup local cache on startup");
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
const storageClient = createStorageClient();
videoJobQueue.initialize(storageClient);

// Initialize authentication and generate API key if needed (only in standalone mode)
async function initializeAuth() {
  try {
    const mode = process.env.MODE || "fullstack";
    const db = auth.options.database;
    const users = db.prepare("SELECT COUNT(*) as count FROM user").get() as { count: number };
    
    // In fullstack mode, never create users automatically
    if (mode === "fullstack") {
      if (users.count === 0) {
        logger.info("No users found. Please visit /setup to create your first admin account.");
      } else {
        logger.info({ userCount: users.count }, "Database initialized (FULLSTACK mode)");
      }
      return;
    }
    
    // In API standalone mode, generate API key only (no exposed credentials)
    if (users.count === 0) {
      logger.info("Running in API STANDALONE mode");
      logger.info("Generating initial API key...");
      
      // Create a system user (required for API key association)
      // This user is internal only - credentials are never exposed or used
      const systemPassword = randomUUID() + randomUUID(); // Random, never shown
      const signUpResult = await auth.api.signUpEmail({
        body: {
          email: "system@openinary.local",
          password: systemPassword,
          name: "System",
        },
      });
      
      if (signUpResult) {
        const userId = signUpResult.user.id;
        
        // Create an API key for this user
        const apiKeyResult = await auth.api.createApiKey({
          body: {
            name: "Initial API Key",
            userId: userId,
            expiresIn: 365 * 24 * 60 * 60, // 1 year in seconds
          },
        });
        
        if (apiKeyResult && "key" in apiKeyResult) {
          logger.info(
            { apiKeyId: apiKeyResult.id },
            "┌─────────────────────────────────────────────────────────────────┐\n│                  Initial API Key Generated                      │\n├─────────────────────────────────────────────────────────────────┤\n│                                                                 │\n│  API Key: " + apiKeyResult.key + "                                   │\n│                                                                 │\n│  Save this key now! It will not be shown again.                 │\n│                                                                 │\n└─────────────────────────────────────────────────────────────────┘"
          );
        }
      }
    } else {
      logger.info({ userCount: users.count }, "Database initialized (API STANDALONE mode)");
    }
  } catch (error) {
    logger.error({ error }, "Error initializing authentication");
  }
}

const port = Number(process.env.PORT) || 3000;

// Start server immediately so healthcheck can respond quickly
serve({
  fetch: app.fetch,
  port,
});

logger.info({ port }, "Server running");

// Initialize auth in background (non-blocking)
// This allows the server to respond to healthchecks immediately
initializeAuth().catch((error) => {
  logger.error({ error }, "Error during background auth initialization");
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
