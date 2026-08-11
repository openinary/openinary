import { bigint, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Durable mirror of the video transformation job queue. @openinary/core's
 * VideoJobQueue/VideoWorker call every VideoJobStore method synchronously
 * (no `await`), so this table is never queried directly on the request
 * path - PgVideoJobStore (see lib/video-job-store.ts) keeps an in-memory
 * Map as the source of truth and mirrors every mutation here in the
 * background, purely so jobs survive a server restart/redeploy.
 */
export const videoJob = pgTable("video_job", {
  id: text("id").primaryKey(),
  filePath: text("file_path").notNull(),
  paramsJson: text("params_json").notNull(),
  cachePath: text("cache_path").notNull(),
  status: text("status").notNull(),
  priority: integer("priority").notNull().default(2),
  progress: integer("progress").notNull().default(0),
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  // These two are the billing quantity, not just diagnostics: their
  // difference is the container wall-clock a job consumed, which is what
  // video_processing_seconds meters (see worker/index.ts's scheduled
  // handler). Anything that writes them has to keep that meaning intact.
  startedAt: bigint("started_at", { mode: "number" }),
  completedAt: bigint("completed_at", { mode: "number" }),
  // Set once the completed job's video_processing_seconds usage has been
  // reported to Autumn - null means pending.
  meteredAt: bigint("metered_at", { mode: "number" }),
});
