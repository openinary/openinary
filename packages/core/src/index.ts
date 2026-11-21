// Transform engine
export { TransformService } from "./services/transform.service";
export type { TransformOutcome, TransformResult } from "./services/transform.service";

// Video job queue
export { VideoJobQueue, type VideoJob, type JobStatus } from "./utils/video-job-queue";
export type {
  VideoJobStore,
  VideoJob as VideoJobRecord,
  JobStats,
} from "./utils/video/queue-store";
export {
  THUMBNAIL_PRIORITY,
  TRANSFORMATION_PRIORITY,
  type VideoSettings,
} from "./utils/video/config";
export { enginePathsIn, type EnginePaths } from "./config/paths";

// Storage
export {
  CloudStorage,
  createStorageClient,
  type StorageConfig,
  type CacheEntry,
} from "./utils/storage/index";
export type { StorageClientOptions } from "./types";
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
export { transformOutcome } from "./routes/delivery";

// Shared utilities
export {
  validateApiSecret,
  generateUploadSignature,
  verifyUploadSignature,
} from "./utils/signature";
export {
  getUniqueFilePath,
  cleanStorageKey,
  parseParams,
  ALLOWED_UPLOAD_TYPES,
  stripUrlHostile,
  validateUploadFileType,
  validateUploadContent,
  contentTypeForExt,
  allowedUploadExtensions,
} from "./url/index";
export { deleteAssetCompletely, type DeleteAssetResult } from "./utils/asset-deletion";
export { clearAllCache } from "./utils/cache";
export { default as logger, serializeError } from "./utils/logger";
