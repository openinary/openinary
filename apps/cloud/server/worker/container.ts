import { Container } from "@cloudflare/containers";
import { percentiles, type Span } from "@openinary/core/eta";
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

// What a 202 needs to know about this instance to say when a transform will
// be ready - see getProcessingEstimate. Measured here because this object is
// the only one that sees a start begin and end, and every synchronous
// transform go in and come out.
const TIMING_KEY = "processing-timing";
const MAX_TIMING_SAMPLES = 30;
// Until this instance has woken up and transformed a few times itself
const DEFAULT_WAKE: Span = [5, 12];
const DEFAULT_IMAGE: Span = [1, 3];
const IMAGE_PATH = /\.(jpe?g|png|webp|avif|gif|psd)$/i;

type TimingSamples = {
  /** Seconds from a stopped instance to one answering on its port */
  wake: number[];
  /** Seconds per image transform on a running instance, by output format */
  image: Record<string, number[]>;
};

export type ProcessingTiming = {
  /** What bringing the instance up still costs: [0, 0] when it is up */
  wake: Span;
  /** How long a transform to this format takes once the instance is up */
  image: Span;
  /** Seconds this exact transform has already been running, 0 if it is not */
  elapsed: number;
};

/** jpg and jpeg are one encoder; the key must not split their samples */
function formatKey(format: string): string {
  const f = format.toLowerCase().replace(/^image\//, "");
  return f === "jpg" ? "jpeg" : f;
}

export class MediaContainer extends Container<Env> {
  defaultPort = 3000;
  // 2m, not the old 10m: every stray request that reaches the container
  // buys it this much standard-2 runtime, so keep the window short. Raise
  // only if legitimate traffic shows cold-start pain between requests.
  sleepAfter = "2m";
  enableInternet = true;

  private timing?: TimingSamples;
  /** When the start in progress began, while one is */
  private wakeStartedAt: number | null = null;
  /** When the last start finished, to keep it out of the image samples */
  private lastWakeEndedAt = 0;
  /** Synchronous transforms in flight, by path, since their first request */
  private inflight = new Map<string, number>();

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    // The container now only serves /t/* (sharp/ffmpeg transforms) - auth,
    // CORS, and everything else moved into the Worker itself (see
    // worker/app.ts), so BETTER_AUTH_*/CORS_ORIGIN no longer need to reach
    // it. DATABASE_URL is still needed for PgVideoJobStore's job mirroring
    // (see api/lib/video-job-store.ts), and AUTUMN_SECRET_KEY because that
    // same store now bills a video job the moment it closes rather than
    // waiting for the Worker's hourly cron to notice.
    this.envVars = {
      DATABASE_URL: env.DATABASE_URL,
      AUTUMN_SECRET_KEY: env.AUTUMN_SECRET_KEY,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: env.R2_BUCKET_NAME,
      R2_ENDPOINT: env.R2_ENDPOINT,
    };
  }

  private async timingSamples(): Promise<TimingSamples> {
    this.timing ??= (await this.ctx.storage.get<TimingSamples>(TIMING_KEY)) ?? {
      wake: [],
      image: {},
    };
    return this.timing;
  }

  // Never awaited by the request it measures, and never throws into it: a
  // sample is worth less than the response it was taken from.
  private recordTiming(kind: "wake" | { image: string }, seconds: number): void {
    this.timingSamples()
      .then((samples) => {
        if (kind !== "wake") samples.image[kind.image] ??= [];
        const list = kind === "wake" ? samples.wake : samples.image[kind.image];
        list.unshift(seconds);
        list.length = Math.min(list.length, MAX_TIMING_SAMPLES);
        return this.ctx.storage.put(TIMING_KEY, samples);
      })
      .catch((error: unknown) => {
        console.error("Failed to record processing timing", error);
      });
  }

  // Measures cold starts. containerFetch calls this whenever the instance is
  // not known healthy, which includes a running one it merely has to re-ping;
  // only a start from nothing is a wake worth timing.
  override async startAndWaitForPorts(
    ...args: Parameters<Container<Env>["startAndWaitForPorts"]>
  ): Promise<void> {
    if (this.ctx.container?.running) {
      return super.startAndWaitForPorts(...args);
    }
    const startedAt = Date.now();
    this.wakeStartedAt = startedAt;
    try {
      await super.startAndWaitForPorts(...args);
      this.lastWakeEndedAt = Date.now();
      this.recordTiming("wake", (this.lastWakeEndedAt - startedAt) / 1000);
    } finally {
      this.wakeStartedAt = null;
    }
  }

  // Measures image transforms. The Worker answers their 202 without waiting
  // (see serveCdnRequest), so this is the only place that sees one finish.
  override async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!IMAGE_PATH.test(path)) return super.fetch(request);

    const startedAt = Date.now();
    const first = !this.inflight.has(path);
    if (first) this.inflight.set(path, startedAt);
    try {
      const response = await super.fetch(request);
      const type = response.headers.get("Content-Type") ?? "";
      if (first && response.ok && type.startsWith("image/")) {
        // A wake this request sat through is not the transform's time
        const seconds = (Date.now() - Math.max(startedAt, this.lastWakeEndedAt)) / 1000;
        this.recordTiming({ image: formatKey(type) }, seconds);
      }
      return response;
    } finally {
      if (first) this.inflight.delete(path);
    }
  }

  /**
   * Everything the Worker's 202 needs from this instance, in one RPC. Reading
   * it does not count as activity, so asking a sleeping instance leaves it
   * asleep.
   */
  async getProcessingEstimate(
    path: string | null,
    format: string | null,
  ): Promise<ProcessingTiming> {
    const samples = await this.timingSamples();
    const now = Date.now();
    const wakeSpan = percentiles(samples.wake) ?? DEFAULT_WAKE;

    let wake: Span = [0, 0];
    if (this.wakeStartedAt !== null) {
      const spent = (now - this.wakeStartedAt) / 1000;
      wake = [Math.max(1, wakeSpan[0] - spent), Math.max(2, wakeSpan[1] - spent)];
    } else if (!this.ctx.container?.running) {
      // Running but not yet marked healthy only costs containerFetch a
      // re-ping, not a start: that is not worth reporting as waking
      wake = wakeSpan;
    }

    const all = Object.values(samples.image).flat();
    const image =
      (format ? percentiles(samples.image[formatKey(format)] ?? []) : null) ??
      percentiles(all) ??
      DEFAULT_IMAGE;

    const since = path ? this.inflight.get(path) : undefined;
    return {
      wake,
      image,
      elapsed: since === undefined ? 0 : (now - since) / 1000,
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
