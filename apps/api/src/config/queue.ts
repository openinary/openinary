import { db } from "shared";
import { VideoJobQueue, SqliteVideoJobStore } from "@openinary/core";

/**
 * Single shared queue instance for this process. Consumers (routes,
 * services) receive it via this module rather than importing
 * utils/video-job-queue's class directly, so swapping to a differently
 * scoped instance (e.g. per tenant, or a different VideoJobStore backend
 * such as Cloudflare D1) only touches this file.
 */
export const videoJobQueue = new VideoJobQueue(new SqliteVideoJobStore(db));
