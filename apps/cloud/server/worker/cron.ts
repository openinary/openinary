import { and, eq, isNull } from "drizzle-orm";
import { db } from "../shared/db/index.js";
import { videoJob } from "../shared/db/schema/video-job.js";
import { meterJob } from "../shared/video-metering.js";
import { app } from "./app.js";
import { AUTH_URL, DASHBOARD_ORIGIN } from "./config.js";
import { syncLifecycle } from "./lib/loops.js";
import { notify } from "./lib/push.js";
import { probeSignIn } from "./lib/sign-in-probe.js";

// Must match the daily entry in wrangler.jsonc's triggers.crons verbatim -
// `controller.cron` is the raw expression, so a typo here silently turns the
// lifecycle sync off and runs video metering twice a day instead.
const DAILY_CRON = "0 7 * * *";

/**
 * Bills every completed video job the container did not already bill when it
 * closed (see container/video-job-store.ts). Deferred to completion rather
 * than done at enqueue time so a job that errors out is never billed.
 *
 * One meterJob per row rather than a batch: autumn-js 1.2.43's batchTrack
 * throws on the 200 the API actually answers, and a per-row claim means a
 * mid-pass failure costs one row instead of the whole pass.
 */
async function meterCompletedVideoJobs(): Promise<void> {
  const rows = await db
    .select({
      id: videoJob.id,
      filePath: videoJob.filePath,
      startedAt: videoJob.startedAt,
      completedAt: videoJob.completedAt,
    })
    .from(videoJob)
    // status, not completedAt: updateJobStatus stamps completedAt for
    // "error" and "cancelled" too, and neither produced a transform.
    .where(and(eq(videoJob.status, "completed"), isNull(videoJob.meteredAt)))
    .limit(1000);
  for (const row of rows) {
    try {
      await meterJob(db, row);
    } catch (error) {
      console.error("%s", `Failed to meter video job ${row.id}`, error);
    }
  }
}

/**
 * Hourly canary on the one request that matters most: the exact call the
 * dashboard's Google button makes (see lib/sign-in-probe.ts).
 *
 * Dispatched into this Worker's own app in-process, not with fetch() to
 * BETTER_AUTH_URL: a Worker's subrequest to a hostname on its own zone skips
 * the Worker and goes straight to the DNS origin, which for cdn.openinary.dev
 * doesn't answer - so that fetch came back 522 on every tick while real
 * browsers, which do reach the Worker, signed in fine. Edge reachability of
 * the hostname is left to an external monitor, which sees what users see.
 *
 * Costs one verification row per attempt, expired ten minutes later and never
 * read again. Cheaper than hearing about an outage from a customer.
 */
async function checkSignIn(env: Env, ctx: ExecutionContext): Promise<void> {
  const failure = await probeSignIn(
    async (request) => app.fetch(request, env, ctx),
    { authUrl: AUTH_URL, origin: DASHBOARD_ORIGIN },
  );
  if (failure) await notify("Openinary Cloud sign-in is down", failure);
}

/**
 * Two schedules, one handler (see wrangler.jsonc's triggers.crons). The
 * lifecycle sync scans every account and talks to Autumn and Loops once per
 * account, so it runs daily and never on the hourly tick - and
 * syncLifecycle's own "crossed the inactivity threshold today" test assumes
 * exactly one run per day.
 */
export function scheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): void {
  // ctx.waitUntil discards a rejection, so both jobs could fail forever in
  // silence - meterCompletedVideoJobs threw on every tick for two days once
  // Neon's compute allowance ran out, and the first report was a customer
  // who couldn't sign in. The hourly tick queries Postgres unconditionally,
  // which makes it a database health check that already exists; this just
  // gives it a mouth, in the Telegram chat already watched for signups.
  //
  // ponytail: one message per failed tick, no dedup and no cooldown - a
  // real outage is 24 a day, which is noise worth having at this size. Add
  // a cooldown (last-alert timestamp in USAGE_METER) if it grates.
  const alert = (job: string) => (error: unknown) =>
    notify("Openinary Cloud cron failed", `${job}: ${error}`);

  if (controller.cron === DAILY_CRON) {
    ctx.waitUntil(syncLifecycle().catch(alert("syncLifecycle")));
    return;
  }
  ctx.waitUntil(
    meterCompletedVideoJobs().catch(alert("meterCompletedVideoJobs")),
  );
  ctx.waitUntil(checkSignIn(env, ctx).catch(alert("checkSignIn")));
}
