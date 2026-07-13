import type { CloudStorage } from "../utils/storage/index";
import type { VideoJobQueue } from "../utils/video-job-queue";

/**
 * Dependencies a route factory needs to build its Hono sub-app. Every route
 * factory takes this same shape, even if it only reads one field, so
 * index.ts can wire all routes uniformly and a future caller (e.g. a
 * per-tenant SaaS mount) only has to build one object per mount instead of
 * matching each factory's own parameter list.
 */
export interface RouteDeps {
  storage: CloudStorage | null;
  queue: VideoJobQueue;
}
