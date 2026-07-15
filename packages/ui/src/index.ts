// Types & pure utilities (also available from "@openinary/ui/server" for RSC)
// The "use client" directive on this bundle is stamped by tsup.config.ts's
// banner, not written here — see the build tooling decision in the plan.
export type { MediaType, MediaFile, StorageFolder, StorageFile, StorageLevel } from "./types";
export { getMediaType } from "./media-type";
export { cn, isMac, toAbsoluteUrl } from "./lib/utils";
export { Spinner } from "./ui/spinner";

// Provider
export {
  OpeninaryProvider,
  useOpeninary,
  type OpeninaryConfig,
  type OpeninaryFetch,
  type OpeninaryProviderProps,
} from "./provider/openinary-provider";

// Leaf components
export { CopyInput } from "./ui/copy-input";
export { DefaultDialog } from "./components/default-dialog";
export { DeleteConfirmDialog } from "./components/delete-confirm-dialog";
export { RenameSection } from "./components/rename-section";
export { ColumnCountSlider, MIN_COLUMNS, MAX_COLUMNS } from "./components/column-count-slider";
export { VideoThumbnail } from "./components/video-thumbnail";
export { UserAvatar } from "./components/user-avatar";

// Queue widgets
export { JobStatusBadge, type JobStatus } from "./queue/job-status-badge";
export { JobProgressBar } from "./queue/job-progress-bar";
export { QueueStatsCards } from "./queue/queue-stats-cards";
export { QueueTable, type QueueJob as QueueTableJob } from "./queue/queue-table";

// Asset details tabs
export { formatFileSize, formatDate, getFileType } from "./details-sidebar/utils";
export { AssetMetadataTab } from "./details-sidebar/asset-metadata-tab";
export { AssetTransformationsTab } from "./details-sidebar/asset-transformations-tab";
export { AssetPreview } from "./details-sidebar/asset-preview";
export { AssetDetailsTab } from "./details-sidebar/asset-details-tab";
export { AssetDetailsSidebar } from "./details-sidebar/asset-details-sidebar";
export { useAssetDetails } from "./details-sidebar/use-asset-details";

// Storage/upload components
export { MoveToNavigator } from "./components/move-to-navigator";
export { BulkActionBarContent } from "./components/bulk-action-bar";
export { UploadSection } from "./components/upload-section";
export { CreateFolderSection } from "./components/create-folder-section";
export { DeleteFolderButton } from "./components/delete-folder-button";
export { UploadButtonWithDialog } from "./components/upload-button-with-dialog";
export { CreateFolderButtonWithDialog } from "./components/create-folder-button-with-dialog";

// Data hooks
export { useStorageLevel, useStorageFolders, invalidateStorage } from "./hooks/use-storage-tree";
export { useStorageStats, useRecalculateStorageStats, useClearCache } from "./hooks/use-storage-stats";
export { useFolderSummaries, type FolderSummary } from "./hooks/use-folder-summaries";
export {
  useQueueEvents,
  type QueueJob,
  type QueueJobStatus,
  type QueueEventData,
} from "./hooks/use-queue-events";
export { useVideoStatus, type VideoStatus } from "./hooks/use-video-status";
export { usePreloadMedia, preloadMedia } from "./hooks/use-preload-media";
export { useHideThumbnails } from "./hooks/use-hide-thumbnails";

// Media grid
export { MediaGrid, type MediaGridProps } from "./media-grid";

// File uploader (presigned direct upload)
export { FileUploader, type FileUploaderProps } from "./file-uploader/file-uploader";
export {
  useFileUpload,
  validateFile,
  DEFAULT_ACCEPT,
  DEFAULT_MAX_SIZE,
  type SignedUpload,
  type UploadedFile,
  type FileUploadStatus,
  type FileUploadState,
  type UploadFileError,
  type UseFileUploadOptions,
} from "./file-uploader/use-file-upload";
