import { StorageConfig } from 'shared';
import { CloudStorage } from './cloud-storage';

/**
 * Consolidated factory function
 */
export function createStorageClient(): CloudStorage | null {
  const config: StorageConfig = {
    region: process.env.STORAGE_REGION || 'auto',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || '',
    bucketName: process.env.STORAGE_BUCKET_NAME || '',
    endpoint: process.env.STORAGE_ENDPOINT,
    publicUrl: process.env.STORAGE_PUBLIC_URL,
  };

  if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    console.warn('Storage configuration incomplete. Cloud storage disabled.');
    return null;
  }

  return new CloudStorage(config);
}

// Alias for compatibility
export const createOptimizedStorageClient = createStorageClient;