import { StorageConfig, StorageClientOptions } from './types';
import { CloudStorage } from './cloud-storage';
import logger from '../logger';

/** The storage client for a config, or null when it lacks credentials. */
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
