import type { CloudStorage } from "../utils/storage/index";
import type { VideoJobQueue } from "../utils/video-job-queue";
import type { EnginePaths } from "./paths";

/** What every route factory is built from. */
export interface RouteDeps {
  storage: CloudStorage | null;
  queue: VideoJobQueue;
  paths: EnginePaths;
  /** Signs /authenticated URLs; that route answers 500 without it. */
  apiSecret?: string;
  /**
   * Honour the x-openinary-source-url header on /t. Only for instances whose
   * transform route is not public and whose every caller is trusted.
   */
  allowRemoteSource?: boolean;
}
