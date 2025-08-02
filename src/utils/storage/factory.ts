import { StorageConfig } from './types';
import { CloudStorage } from './cloud-storage';

/**
 * Consolidated factory function
 */
export function createStorageClient(): CloudStorage | null {
  const provider = process.env.STORAGE_PROVIDER as 'aws' | 'cloudflare';
  
  if (!provider) {
    return null;
  }

  const config: StorageConfig = {
    provider,
    region: process.env.STORAGE_REGION || 'us-east-1',
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