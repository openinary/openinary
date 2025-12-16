import fs from 'fs';
import path from 'path';
import logger from './logger';
import { CloudStorage } from './storage/cloud-storage';
import { deleteCachedFiles } from './cache';
import { deleteJobsByFilePath } from './video/queue-db';

export interface DeleteAssetResult {
  success: boolean;
  originalFileDeleted: boolean;
  jobsDeleted: number;
  localCacheFilesDeleted: number;
  cloudCacheFilesDeleted: number;
  errors: string[];
}

/**
 * Deletes an asset and all its related cached files and jobs
 * This is the central function for complete asset deletion
 */
export async function deleteAssetCompletely(
  filePath: string,
  storage: CloudStorage | null
): Promise<DeleteAssetResult> {
  const result: DeleteAssetResult = {
    success: false,
    originalFileDeleted: false,
    jobsDeleted: 0,
    localCacheFilesDeleted: 0,
    cloudCacheFilesDeleted: 0,
    errors: [],
  };

  logger.info({ filePath }, 'Starting complete asset deletion');

  try {
    // Step 1: Verify that the file exists
    let fileExists = false;
    
    if (storage) {
      fileExists = await storage.existsOriginal(filePath);
    } else {
      const localPath = path.join('.', 'public', filePath);
      fileExists = fs.existsSync(localPath);
    }

    if (!fileExists) {
      const error = 'File not found';
      result.errors.push(error);
      logger.warn({ filePath }, error);
      return result;
    }

    // Step 2: Delete all video jobs associated with this file
    try {
      result.jobsDeleted = deleteJobsByFilePath(filePath);
      logger.debug({ filePath, count: result.jobsDeleted }, 'Deleted video jobs');
    } catch (error) {
      const errorMsg = `Failed to delete jobs: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error({ error, filePath }, 'Failed to delete video jobs');
    }

    // Step 3: Delete local cache files
    try {
      result.localCacheFilesDeleted = await deleteCachedFiles(filePath);
      logger.debug({ filePath, count: result.localCacheFilesDeleted }, 'Deleted local cache files');
    } catch (error) {
      const errorMsg = `Failed to delete local cache: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error({ error, filePath }, 'Failed to delete local cache files');
    }

    // Step 4: Delete original file and cloud cache (if using cloud storage)
    if (storage) {
      try {
        // Delete cloud cached transformations
        result.cloudCacheFilesDeleted = await storage.deleteAllCachedTransformations(filePath);
        logger.debug({ filePath, count: result.cloudCacheFilesDeleted }, 'Deleted cloud cache files');

        // Delete the original file from cloud storage
        await storage.deleteOriginal(filePath);
        result.originalFileDeleted = true;
        logger.debug({ filePath }, 'Deleted original file from cloud storage');

        // Invalidate in-memory cache entries
        storage.invalidateAllCacheEntries(filePath);
        logger.debug({ filePath }, 'Invalidated memory cache entries');
      } catch (error) {
        const errorMsg = `Failed to delete from cloud storage: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        logger.error({ error, filePath }, 'Failed to delete from cloud storage');
      }
    } else {
      // Delete from local storage
      try {
        const localPath = path.join('.', 'public', filePath);
        
        const stats = fs.statSync(localPath);
        if (stats.isDirectory()) {
          const errorMsg = 'Cannot delete directories';
          result.errors.push(errorMsg);
          logger.warn({ filePath }, errorMsg);
        } else {
          fs.unlinkSync(localPath);
          result.originalFileDeleted = true;
          logger.debug({ filePath }, 'Deleted original file from local storage');
        }
      } catch (error) {
        const errorMsg = `Failed to delete from local storage: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        logger.error({ error, filePath }, 'Failed to delete from local storage');
      }
    }

    // Determine overall success
    result.success = result.originalFileDeleted && result.errors.length === 0;

    logger.info(
      {
        filePath,
        success: result.success,
        originalFileDeleted: result.originalFileDeleted,
        jobsDeleted: result.jobsDeleted,
        localCacheFilesDeleted: result.localCacheFilesDeleted,
        cloudCacheFilesDeleted: result.cloudCacheFilesDeleted,
        errorCount: result.errors.length,
      },
      'Completed asset deletion'
    );

    return result;
  } catch (error) {
    const errorMsg = `Unexpected error during deletion: ${error instanceof Error ? error.message : 'Unknown error'}`;
    result.errors.push(errorMsg);
    logger.error({ error, filePath }, 'Unexpected error during asset deletion');
    return result;
  }
}




