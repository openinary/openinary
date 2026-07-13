// Transform engine
export {
  TransformService,
  type TransformRequest,
  type TransformResult,
  type CacheCheckResult,
} from "./services/transform.service";

// Video job queue
export { VideoJobQueue, type VideoJob, type JobStatus } from "./utils/video-job-queue";
export type {
  VideoJobStore,
  VideoJob as VideoJobRecord,
  JobStats,
} from "./utils/video/queue-store";
export { SqliteVideoJobStore } from "./utils/video/sqlite-video-job-store";
export {
  THUMBNAIL_PRIORITY,
  TRANSFORMATION_PRIORITY,
  LOW_PRIORITY,
} from "./utils/video/config";

// Storage
export {
  CloudStorage,
  StorageCache,
  S3ClientWrapper,
  KeyGenerator,
  createStorageClient,
  createOptimizedStorageClient,
  type StorageConfig,
  type CacheEntry,
} from "./utils/storage/index";
export type { StorageClientOptions } from "shared";
export { invalidateListingCache } from "./utils/storage/listing-cache";

// Routes (Hono sub-apps, each takes a RouteDeps and returns a mountable app)
export type { RouteDeps } from "./config/deps";
export { createTransformRoute } from "./routes/transform";
export { createAuthenticatedRoute } from "./routes/authenticated";
export { createStorageRoute } from "./routes/storage";
export { createDownloadRoute } from "./routes/download";
export { createDownloadFolderRoute } from "./routes/download-folder";
export { createDownloadZipRoute } from "./routes/download-zip";
export { createVideoStatusRoute } from "./routes/video-status";
export { createQueueEventsRoute } from "./routes/queue-events";
export { createQueueRoute } from "./routes/queue";
export { createInvalidateRoute } from "./routes/invalidate";

// Shared utilities
export { getUniqueFilePath } from "./utils/get-unique-file-path";
export { getCachePath } from "./utils/cache";
export { parseParams } from "./utils/parser";
export { validateApiSecret } from "./utils/signature";
export { generateUploadSignature, verifyUploadSignature } from "./utils/upload-signature";
export { deleteAssetCompletely, type DeleteAssetResult } from "./utils/asset-deletion";
export { default as logger, serializeError } from "./utils/logger";
