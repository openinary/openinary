import { Hono } from "hono";
import { videoJobQueue } from "../utils/video-job-queue";
import {
  getRecentJobs,
  getJobStats,
  getJobsByStatus,
  retryFailedJob,
  cancelJob,
  deleteJob,
  type JobStatus,
} from "../utils/video/queue-db";
import logger from "../utils/logger";

const queue = new Hono();

/**
 * GET /queue/stats - Get queue statistics
 */
queue.get("/stats", (c) => {
  try {
    const stats = getJobStats();
    return c.json(stats);
  } catch (error) {
    logger.error({ error }, "Failed to get queue stats");
    return c.json({ error: "Failed to get queue stats" }, 500);
  }
});

/**
 * GET /queue/jobs - Get recent jobs with pagination
 * Query params:
 *   - limit: number (default: 50)
 *   - offset: number (default: 0)
 *   - status: JobStatus (optional filter)
 */
queue.get("/jobs", (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);
    const status = c.req.query("status") as JobStatus | undefined;

    let jobs;
    if (status) {
      jobs = getJobsByStatus(status, limit);
    } else {
      jobs = getRecentJobs(limit, offset);
    }

    return c.json({
      jobs,
      limit,
      offset,
      count: jobs.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get jobs");
    return c.json({ error: "Failed to get jobs" }, 500);
  }
});

/**
 * POST /queue/jobs/:id/retry - Retry a failed job
 */
queue.post("/jobs/:id/retry", (c) => {
  try {
    const jobId = c.req.param("id");
    
    if (!jobId) {
      return c.json({ error: "Job ID is required" }, 400);
    }

    const success = retryFailedJob(jobId);
    
    if (!success) {
      return c.json({ error: "Failed to retry job" }, 400);
    }

    logger.info({ jobId }, "Job retry requested");
    return c.json({ success: true, message: "Job scheduled for retry" });
  } catch (error) {
    logger.error({ error }, "Failed to retry job");
    return c.json({ error: "Failed to retry job" }, 500);
  }
});

/**
 * POST /queue/jobs/:id/cancel - Cancel a pending job
 */
queue.post("/jobs/:id/cancel", (c) => {
  try {
    const jobId = c.req.param("id");
    
    if (!jobId) {
      return c.json({ error: "Job ID is required" }, 400);
    }

    const success = cancelJob(jobId);
    
    if (!success) {
      return c.json({ error: "Failed to cancel job" }, 400);
    }

    logger.info({ jobId }, "Job cancelled");
    return c.json({ success: true, message: "Job cancelled" });
  } catch (error) {
    logger.error({ error }, "Failed to cancel job");
    return c.json({ error: "Failed to cancel job" }, 500);
  }
});

/**
 * DELETE /queue/jobs/:id - Delete a job
 */
queue.delete("/jobs/:id", (c) => {
  try {
    const jobId = c.req.param("id");
    
    if (!jobId) {
      return c.json({ error: "Job ID is required" }, 400);
    }

    const success = deleteJob(jobId);
    
    if (!success) {
      return c.json({ error: "Failed to delete job" }, 400);
    }

    logger.info({ jobId }, "Job deleted");
    return c.json({ success: true, message: "Job deleted" });
  } catch (error) {
    logger.error({ error }, "Failed to delete job");
    return c.json({ error: "Failed to delete job" }, 500);
  }
});

/**
 * GET /queue/worker/stats - Get worker statistics
 */
queue.get("/worker/stats", (c) => {
  try {
    const worker = videoJobQueue.getWorker();
    const stats = worker.getStats();
    return c.json(stats);
  } catch (error) {
    logger.error({ error }, "Failed to get worker stats");
    return c.json({ error: "Failed to get worker stats" }, 500);
  }
});

export default queue;

