import { createStorageClient, VideoJobQueue } from "@openinary/core";
import { db } from "../db/index.js";
import { PgVideoJobStore } from "./video-job-store.js";

export const storage = createStorageClient({
  region: "auto",
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  bucketName: process.env.R2_BUCKET_NAME ?? "",
  endpoint: process.env.R2_ENDPOINT,
});

// Openinary's TransformService needs a video job queue even for image-only
// usage. PgVideoJobStore mirrors jobs to Neon in the background so they
// survive a restart, while staying synchronous on the hot path (required by
// VideoJobQueue/VideoWorker - see video-job-store.ts for why). The Worker
// (worker/video.ts) reads these same video_job rows to serve status/SSE
// without ever waking this container.
const videoJobStore = new PgVideoJobStore(db);
await videoJobStore.hydrate();
export const queue = new VideoJobQueue(videoJobStore);
queue.initialize(storage);
