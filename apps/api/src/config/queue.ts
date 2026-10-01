import {
  VideoJobQueue,
  PrismaVideoJobStore,
  type VideoJobStore,
} from "@openinary/core";
import { getDb } from "shared/db";

/**
 * Single shared queue instance for this process. Consumers (routes,
 * services) receive it via this module rather than importing
 * utils/video-job-queue's class directly, so swapping to a differently
 * scoped instance (e.g. per tenant, or a different VideoJobStore backend
 * such as Cloudflare D1) only touches this file.
 *
 * The store resolves the Prisma client lazily on first method call: this
 * module is imported at load time (server.ts imports `videoJobQueue`
 * before initDb() has run), but the client only exists after initDb()
 * succeeds. Deferring getDb() keeps module-import order from crashing
 * boot; server.ts awaits initDb() before serving traffic, and a worker
 * poll that races ahead of init fails soft and retries on the next tick
 * (getNextPendingJob et al. catch + log, per VideoJobStore contract).
 */
function createLazyStore(): VideoJobStore {
  let inner: PrismaVideoJobStore | undefined;
  return new Proxy({} as VideoJobStore, {
    get(_target, prop: string) {
      inner ??= new PrismaVideoJobStore(getDb());
      const value = (inner as unknown as Record<string, unknown>)[prop];
      return typeof value === "function" ? value.bind(inner) : value;
    },
  });
}

export const videoJobQueue = new VideoJobQueue(createLazyStore());
