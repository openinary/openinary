import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import cdn from './routes/cdn';
import { createStorageClient } from './utils/storage';
import fs from 'fs';
import path from 'path';

const app = new Hono();

// Function to clean local cache in cloud mode
const cleanupLocalCacheIfCloudMode = () => {
  const storage = createStorageClient();
  if (storage) {
    const cacheDir = './cache';
    if (fs.existsSync(cacheDir)) {
      try {
        const files = fs.readdirSync(cacheDir);
        files.forEach(file => {
          const filePath = path.join(cacheDir, file);
          fs.unlinkSync(filePath);
        });
      } catch (error) {
        console.warn('Failed to cleanup local cache on startup:', error);
      }
    }
  }
};

app.get('/health', (c) => c.text('ok'));
app.route('/cdn', cdn);

const port = process.env.PORT || 3000;

console.log(`🚀 Server starting on port ${port}`);

// Clean local cache on startup if in cloud mode
cleanupLocalCacheIfCloudMode();

serve({
  fetch: app.fetch,
  port: Number(port),
});

console.log(`✅ Server running at http://localhost:${port}`);

export default app;
