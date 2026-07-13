import { VideoJobQueue } from "../utils/video-job-queue";

/**
 * Single shared queue instance for this process. Consumers (routes,
 * services) receive it via this module rather than importing
 * utils/video-job-queue's class directly, so swapping to a differently
 * scoped instance (e.g. per tenant) only touches this file.
 */
export const videoJobQueue = new VideoJobQueue();
