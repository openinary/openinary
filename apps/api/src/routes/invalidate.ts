import { Hono } from "hono";
import { createStorageClient } from "../utils/storage";
import { deleteCachedFiles } from "../utils/cache";
import { apiKeyAuth, AuthVariables } from "../middleware/auth";
import logger from "../utils/logger";

const invalidateRoute = new Hono<AuthVariables>();

// Apply authentication middleware to all routes
invalidateRoute.use("/*", apiKeyAuth);

/**
 * Invalidate all caches for a specific image
 * DELETE /invalidate/*
 * 
 * This endpoint invalidates:
 * - Local cache files
 * - Cloud storage cached transformations (if using cloud storage)
 * - In-memory cache entries (if using cloud storage)
 * 
 * Example usage:
 * DELETE /invalidate/folder/image.png
 * Authorization: Bearer <API_KEY>
 */
invalidateRoute.delete("/*", async (c) => {
  const requestPath = c.req.path;
  
  // Remove '/invalidate' prefix from the path
  // requestPath will be something like '/invalidate/folder/image.png'
  // We need to extract 'folder/image.png'
  const pathWithoutPrefix = requestPath.replace(/^\/invalidate\/?/, "");
  
  if (!pathWithoutPrefix) {
    return c.json(
      {
        error: "Bad request",
        message: "File path is required",
      },
      400
    );
  }

  let filePath = pathWithoutPrefix.replace(/^\/+/, "").replace(/\/+$/, "");
  
  try {
    filePath = decodeURIComponent(filePath);
  } catch (error) {
    // If decoding fails, use the original path
    logger.warn({ error, filePath }, "Failed to decode file path");
  }

  const storageClient = createStorageClient();
  const result = {
    success: true,
    localCacheFilesDeleted: 0,
    cloudCacheFilesDeleted: 0,
    errors: [] as string[],
  };

  try {
    // Step 1: Delete local cache files
    try {
      result.localCacheFilesDeleted = await deleteCachedFiles(filePath);
      logger.debug(
        { filePath, count: result.localCacheFilesDeleted },
        "Deleted local cache files"
      );
    } catch (error) {
      const errorMsg = `Failed to delete local cache: ${error instanceof Error ? error.message : "Unknown error"}`;
      result.errors.push(errorMsg);
      logger.error({ error, filePath }, "Failed to delete local cache files");
    }

    // Step 2: Delete cloud cache and invalidate in-memory cache (if using cloud storage)
    if (storageClient) {
      try {
        // Delete cloud cached transformations
        result.cloudCacheFilesDeleted =
          await storageClient.deleteAllCachedTransformations(filePath);
        logger.debug(
          { filePath, count: result.cloudCacheFilesDeleted },
          "Deleted cloud cache files"
        );

        // Invalidate in-memory cache entries
        storageClient.invalidateAllCacheEntries(filePath);
        logger.debug({ filePath }, "Invalidated memory cache entries");
      } catch (error) {
        const errorMsg = `Failed to invalidate cloud cache: ${error instanceof Error ? error.message : "Unknown error"}`;
        result.errors.push(errorMsg);
        logger.error({ error, filePath }, "Failed to invalidate cloud cache");
      }
    }

    // Determine overall success
    result.success = result.errors.length === 0;

    logger.info(
      {
        filePath,
        success: result.success,
        localCacheFilesDeleted: result.localCacheFilesDeleted,
        cloudCacheFilesDeleted: result.cloudCacheFilesDeleted,
        errorCount: result.errors.length,
      },
      "Cache invalidation completed"
    );

    if (result.errors.length > 0) {
      return c.json(
        {
          success: result.success,
          message: "Cache invalidation completed with some errors",
          details: {
            localCacheFilesDeleted: result.localCacheFilesDeleted,
            cloudCacheFilesDeleted: result.cloudCacheFilesDeleted,
            errors: result.errors,
          },
        },
        200
      );
    }

    return c.json({
      success: true,
      message: "Cache invalidated successfully",
      details: {
        localCacheFilesDeleted: result.localCacheFilesDeleted,
        cloudCacheFilesDeleted: result.cloudCacheFilesDeleted,
      },
    });
  } catch (error) {
    logger.error({ error, filePath }, "Failed to invalidate cache");
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default invalidateRoute;

