import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import cdn from './routes/cdn';
import { createStorageClient } from './utils/storage';
import fs from 'fs';
import path from 'path';

const app = new Hono();

// Fonction de nettoyage du cache local en mode cloud
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
        console.log(`🧹 Cleaned ${files.length} local cache files (cloud mode active)`);
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

// Nettoyer le cache local au démarrage si en mode cloud
cleanupLocalCacheIfCloudMode();

serve({
  fetch: app.fetch,
  port: Number(port),
});

console.log(`✅ Server running at http://localhost:${port}`);

export default app;
