import { createStorageClient, enginePathsIn, VideoJobQueue } from "@openinary/core";
import { db } from "../shared/db/index.js";
import { cloudKeyFor } from "./cache-params.js";
import { PgVideoJobStore } from "./video-job-store.js";

export const storage = createStorageClient({
  region: "auto",
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  bucketName: process.env.R2_BUCKET_NAME ?? "",
  endpoint: process.env.R2_ENDPOINT,
  keyFor: cloudKeyFor,
});

// TransformService needs a video job queue even for image-only usage.
// PgVideoJobStore mirrors jobs to Neon in the background so they survive a
// restart while the hot path stays in memory (see video-job-store.ts).
// The Worker (worker/routes/video.ts) reads these same video_job rows to serve
// status/SSE without ever waking this container.
const videoJobStore = new PgVideoJobStore(db);
await videoJobStore.hydrate();
// public/ goes unused: storage is always configured here.
export const paths = enginePathsIn(process.cwd());
export const queue = new VideoJobQueue(videoJobStore, storage, { paths });
// Resets orphans, then polls. A failure here is a failed in-memory reset,
// which can't happen short of a bug: log it rather than take the container
// down with image transforms.
queue.start().catch((error: unknown) => {
  console.error("%s", "Failed to start the video job queue", error);
});
