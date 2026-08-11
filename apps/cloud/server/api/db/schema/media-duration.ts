import { pgTable, real, text } from "drizzle-orm/pg-core";

/**
 * Source duration (seconds) of every uploaded video, parsed once at upload
 * time (see worker/video-duration.ts) since the Worker has no ffmpeg to
 * re-derive it later. `filePath` is the same "{tenantRoot}/{path}" key used
 * throughout worker/app.ts and video_job - one row per video, deleted
 * alongside the original.
 */
export const mediaDuration = pgTable("media_duration", {
  filePath: text("file_path").primaryKey(),
  seconds: real("seconds").notNull(),
});
