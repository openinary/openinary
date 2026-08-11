import { Container } from "@cloudflare/containers";
import { and, gt, inArray } from "drizzle-orm";
import { db } from "../api/db/index.js";
import { videoJob } from "../api/db/schema/video-job.js";

// How far back a pending/processing row is still believed to be a live job.
// A row can outlive its container (crash, eviction, deploy), and such a
// zombie must not hold the instance awake forever - after this it is treated
// as stale and the container is allowed to sleep. The next request wakes a
// fresh one, whose VideoWorker.start() resets the orphan to pending and
// re-runs it.
const ACTIVE_JOB_MAX_AGE_MS = 30 * 60_000;

export class MediaContainer extends Container<Env> {
  defaultPort = 3000;
  // 2m, not the old 10m: every stray request that reaches the container
  // buys it this much standard-2 runtime, so keep the window short. Raise
  // only if legitimate traffic shows cold-start pain between requests.
  sleepAfter = "2m";
  enableInternet = true;

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    // The container now only serves /t/* (sharp/ffmpeg transforms) - auth,
    // CORS, and everything else moved into the Worker itself (see
    // worker/app.ts), so BETTER_AUTH_*/CORS_ORIGIN no longer need to reach
    // it. DATABASE_URL is still needed for PgVideoJobStore's job mirroring
    // (see api/lib/video-job-store.ts), and AUTUMN_SECRET_KEY because that
    // same store now bills a video job the moment it closes rather than
    // waiting for the Worker's five-minute cron to notice.
    this.envVars = {
      DATABASE_URL: env.DATABASE_URL,
      AUTUMN_SECRET_KEY: env.AUTUMN_SECRET_KEY,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: env.R2_BUCKET_NAME,
      R2_ENDPOINT: env.R2_ENDPOINT,
    };
  }

  // sleepAfter counts *requests*, and a transcode makes none: status polling
  // and the dashboard's SSE both read Postgres from the Worker (see
  // worker/video.ts) precisely so they never wake this container. So a job
  // longer than sleepAfter was killed mid-ffmpeg with nothing to show for it,
  // left "processing" in the dashboard until an unrelated request happened to
  // wake a new instance, and only then restarted from zero - a video needing
  // more than one full window could never finish at all.
  //
  // The library re-arms and calls this again a full window later (it renews
  // the timeout for us after we return), so this is a poll, not a lock: the
  // instance sleeps within one window of the last job closing.
  async onActivityExpired(): Promise<void> {
    try {
      const [active] = await db
        .select({ id: videoJob.id })
        .from(videoJob)
        .where(
          and(
            inArray(videoJob.status, ["pending", "processing"]),
            gt(videoJob.createdAt, Date.now() - ACTIVE_JOB_MAX_AGE_MS),
          ),
        )
        .limit(1);
      if (active) return;
    } catch (error) {
      // Sleeping is the safe side of a DB failure: worst case a job restarts,
      // where staying awake on every error would bill idle container time.
      console.error("Failed to check for active video jobs", error);
    }
    await super.onActivityExpired();
  }
}
