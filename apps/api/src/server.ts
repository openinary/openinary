import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./index";
import { createStorageClient } from "./utils/storage/index";
import { auth } from "shared/auth";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

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
        console.warn("Failed to cleanup local cache on startup:", error);
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
    console.log(`Created directory: ${dir}`);
  }
});

// Initialize authentication and generate API key if needed (only in standalone mode)
async function initializeAuth() {
  try {
    const mode = process.env.MODE || "fullstack";
    const db = auth.options.database;
    const users = db.prepare("SELECT COUNT(*) as count FROM user").get() as { count: number };
    
    // In fullstack mode, never create users automatically
    if (mode === "fullstack") {
      if (users.count === 0) {
        console.log("No users found. Please visit /setup to create your first admin account.\n");
      } else {
        console.log(`Database initialized (FULLSTACK mode). Found ${users.count} user(s).`);
      }
      return;
    }
    
    // In API standalone mode, generate API key only (no exposed credentials)
    if (users.count === 0) {
      console.log("\nRunning in API STANDALONE mode");
      console.log("Generating initial API key...\n");
      
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
          console.log("┌─────────────────────────────────────────────────────────────────┐");
          console.log("│                  Initial API Key Generated                      │");
          console.log("├─────────────────────────────────────────────────────────────────┤");
          console.log("│                                                                 │");
          console.log(`│  API Key: ${apiKeyResult.key}                                   │`);
          console.log("│                                                                 │");
          console.log("│  Save this key now! It will not be shown again.                 │");
          console.log("│                                                                 │");
          console.log("└─────────────────────────────────────────────────────────────────┘\n");
        }
      }
    } else {
      console.log(`Database initialized (API STANDALONE mode). Found ${users.count} user(s).`);
    }
  } catch (error) {
    console.error("Error initializing authentication:", error);
  }
}

// Initialize auth before starting server
await initializeAuth();

const port = Number(process.env.PORT) || 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
