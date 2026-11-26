import { Hono } from "hono";
import type { RouteDeps } from "../config/deps";
import { deliveryTarget } from "../url/grammar";
import { derivativeCachePath, existsInCache } from "../utils/cache";
import logger, { serializeError } from "../utils/logger";
import { pathBelowMount } from "./delivery";

export function createVideoStatusRoute(deps: RouteDeps) {
  const { storage, queue: videoJobQueue, paths } = deps;
  const videoStatus = new Hono();

  /**
   * GET /video-status/:path/size
   * Get optimized video size
   * This must be before the /* route to be matched first
   */
  videoStatus.get("/*/size", async (c) => {
    const path = c.req.path;
    const { filePath, params } = deliveryTarget(pathBelowMount(c).replace(/\/size$/, ""));

    // Get job status first - if job is completed, we know the cache exists
    const job = await videoJobQueue.getJobByPath(filePath, params);
    const cachePath = job?.cachePath ?? derivativeCachePath(paths.cache, filePath, params);

    logger.info(
      {
        requestPath: path,
        filePath,
        params: JSON.stringify(params),
        jobStatus: job?.status,
        jobId: job?.id,
      },
      "Fetching optimized video size",
    );

    // Check cloud storage first (most reliable for optimized videos)
    if (storage) {
      try {
        const existsInCloud = await storage.exists(filePath, params);
        if (existsInCloud) {
          // Get the size from cloud storage
          const metadata = await storage.getOptimizedMetadata(filePath, params);
          if (metadata) {
            logger.info(
              {
                filePath,
                size: metadata.size,
                source: "cloud_storage",
              },
              "Got optimized size from cloud storage",
            );
            return c.json({
              size: metadata.size,
              status: "ready",
            });
          } else {
            logger.warn(
              { filePath },
              "Optimized video exists in cloud but metadata unavailable",
            );
          }
        }
      } catch (error) {
        logger.error(
          { error: serializeError(error), filePath },
          "Failed to get optimized size from cloud storage",
        );
      }
    }

    // Fallback: Check if optimized video exists in local cache
    const existsLocally = await existsInCache(cachePath);

    logger.info(
      {
        cachePath,
        existsLocally,
        jobStatus: job?.status,
        jobCompleted: job?.status === "completed",
      },
      "Local cache check result",
    );

    // saveToCache writes atomically, so a cache file that exists is complete.
    if (existsLocally || job?.status === "completed") {
      try {
        const fs = await import("fs/promises");
        const stats = await fs.stat(cachePath);
        return c.json({ size: stats.size, status: "ready" });
      } catch (error) {
        logger.error(
          { error: serializeError(error), cachePath, jobStatus: job?.status },
          "Failed to get cache file stats",
        );
        // If job is completed but we can't read the file, something is wrong
        if (job?.status === "completed") {
          return c.json(
            {
              error: "Cache file exists but cannot be read",
              status: "error",
            },
            500,
          );
        }
      }
    }

    // No optimized video found
    return c.json(
      {
        status: "not_found",
        message: "Optimized video not found",
      },
      404,
    );
  });

  /**
   * GET /video-status/:path
   * Check video processing status
   */
  videoStatus.get("/*", async (c) => {
    const { filePath, params } = deliveryTarget(pathBelowMount(c));

    // Get job status
    const job = await videoJobQueue.getJobByPath(filePath, params);

    if (!job) {
      if (await existsInCache(derivativeCachePath(paths.cache, filePath, params))) {
        return c.json({ status: "completed", progress: 100 });
      }

      // Check cloud storage if configured
      if (storage) {
        try {
          const existsInCloud = await storage.exists(filePath, params);
          if (existsInCloud) {
            // For cloud storage, we trust the exists check
            // Cloud storage typically handles this correctly
            return c.json({
              status: "completed",
              progress: 100,
            });
          }
        } catch (error) {
          logger.warn(
            { error: serializeError(error), filePath },
            "Failed to check cloud storage for video status",
          );
        }
      }

      // No job and no valid cached video found
      return c.json(
        {
          status: "not_found",
          message: "No processing job found for this video",
        },
        404,
      );
    }

    // Return job status
    // Only return error status if the job has actually failed (not just if error field exists)
    const status = job.status === "error" && job.error ? "error" : job.status;

    // Same estimate the transform URL's 202 carries, so a client following
    // statusUrl learns when to look again too
    const estimate =
      status === "pending" || status === "processing"
        ? await videoJobQueue.estimate(filePath, params)
        : null;

    return c.json({
      status,
      progress: job.progress || 0,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      ...(estimate
        ? {
            phase: estimate.phase,
            estimatedSeconds: estimate.estimatedSeconds,
            estimatedRange: estimate.estimatedRange,
            retryAfter: estimate.retryAfter,
          }
        : {}),
    });
  });

  return videoStatus;
}
