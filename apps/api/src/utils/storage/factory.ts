import { StorageConfig, StorageClientOptions } from 'shared';
import { CloudStorage } from './cloud-storage';
import logger from '../logger';

/**
 * Pure factory: builds a storage client from an explicit config, with no
 * knowledge of where that config came from (env vars, a database row, a
 * per-tenant resolver, ...). Callers own resolving the config.
 */
export function createStorageClient(
  config: StorageConfig,
  clientOptions?: StorageClientOptions,
): CloudStorage | null {
  if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    logger.warn('Storage configuration incomplete. Cloud storage disabled.');
    return null;
  }

  return new CloudStorage(config, clientOptions);
}

// Alias for compatibility
export const createOptimizedStorageClient = createStorageClient;
