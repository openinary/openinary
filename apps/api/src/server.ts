import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./index";
import { createStorageClient } from "./utils/storage/index";
import fs from "fs";
import path from "path";

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

const port = Number(process.env.PORT) || 3000;

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
