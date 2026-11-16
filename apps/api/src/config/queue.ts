import { getDb } from "shared";
import { VideoJobQueue, enginePathsIn } from "@openinary/core";
import { getSharedStorage } from "./storage";
import { SqliteVideoJobStore } from "./video-job-store";

const intEnv = (name: string): number | undefined => {
  const value = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : undefined;
};

/** public/, cache/ and temp/ in the working directory (apps/api in the images). */
export const enginePaths = enginePathsIn(process.cwd());

export const videoJobQueue = new VideoJobQueue(
  new SqliteVideoJobStore(getDb(), intEnv("VIDEO_JOB_RETRY_MAX")),
  getSharedStorage(),
  {
    paths: enginePaths,
    video: {
      maxConcurrent: intEnv("VIDEO_MAX_CONCURRENT"),
      ffmpegThreads: intEnv("VIDEO_FFMPEG_THREADS"),
      ffmpegNiceness: intEnv("VIDEO_FFMPEG_NICENESS"),
      cleanupHours: intEnv("VIDEO_JOB_CLEANUP_HOURS"),
      pollIntervalMs: intEnv("VIDEO_WORKER_POLL_INTERVAL_MS"),
    },
  },
);
