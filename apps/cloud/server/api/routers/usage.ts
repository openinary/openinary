import { desc, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { captureEvent } from "../lib/analytics.js";
import { videoJob } from "../db/schema/video-job.js";
import {
  getPaymentMethod,
  getUsage,
  getUsageHistory,
  openBillingPortal,
  startUpgradeCheckout,
} from "../lib/autumn.js";
import type { Bindings } from "../lib/context.js";
import type { DeliveryEvent } from "../lib/delivery-log.js";
import { protectedProcedure } from "../lib/orpc.js";
import { billableJob } from "../lib/video-metering.js";

const planSettingsUrl = () =>
  process.env.CORS_ORIGIN
    ? `${process.env.CORS_ORIGIN}/?settings=plan`
    : undefined;

/** Option ids from the onboarding form, never free text. */
const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);

/**
 * Accounts that existed before the questionnaire shipped never see it: they
 * set themselves up long ago, and a form between them and their library would
 * be a toll, not an onboarding.
 */
const ONBOARDING_SHIPPED_AT = Date.parse("2026-10-01T00:00:00Z");

/** Matches UsageMeter's own MAX_EVENTS - there is never more than this to show. */
const MAX_DELIVERIES = 500;
// Video jobs are far rarer than deliveries and stored permanently, so the tab
// shows a fixed recent slice rather than interleaving a month of them.
const MAX_VIDEO_JOBS = 100;

export const usageRouter = {
  get: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;
    const summary = await getUsage(userId, {
      name: context.session.user.name,
      email: context.session.user.email,
    });
    // CDN hits reach Autumn on a one-minute timer (see worker/usage-meter.ts),
    // so the balance alone always trails live traffic. Folding in the meter's
    // unflushed count costs one Durable Object read per settings page view and
    // makes the number the customer reads match the traffic they just caused,
    // without shortening the flush window that keeps delivery cheap.
    const pendingCdn = await pendingCdnRequests(context.env, userId);
    if (pendingCdn > 0) {
      const cdn = summary.features.cdn_requests;
      summary.features.cdn_requests = {
        ...cdn,
        used: cdn.used + pendingCdn,
        remaining: cdn.unlimited
          ? cdn.remaining
          : Math.max(0, cdn.remaining - pendingCdn),
      };
    }
    return summary;
  }),

  /**
   * Daily usage since the start of the current period, for the spend curve.
   * The client sends the start it already derives from usage.get, rather than
   * this costing a second customer lookup; it is clamped to the last 35 days,
   * which is all a monthly period can span.
   */
  history: protectedProcedure
    .input(z.object({ start: z.number().int() }))
    .handler(async ({ context, input }) => {
      const earliest = Date.now() - 35 * 24 * 60 * 60 * 1000;
      try {
        return await getUsageHistory(
          context.session.user.id,
          Math.max(input.start, earliest),
        );
      } catch (error) {
        // The curve is a nicety: without it the page still has every figure.
        console.error("Failed to read usage history", error);
        return [];
      }
    }),

  /**
   * The one Get started step nothing else can answer: has this account's own
   * app ever uploaded, as opposed to the customer dropping a file into our
   * dashboard? One Durable Object read and no Autumn call - the checklist's
   * other signal, cdn_requests, comes off the usage.get it already runs.
   */
  onboarding: protectedProcedure.handler(async ({ context }) => {
    const { id: userId, createdAt } = context.session.user;
    const predatesOnboarding =
      new Date(createdAt).getTime() < ONBOARDING_SHIPPED_AT;
    const [uploaded, onboarded] = await Promise.all([
      apiUploadSeen(context.env, userId),
      predatesOnboarding || readOnboarded(context.env, userId),
    ]);
    return { uploaded, onboarded };
  }),

  /**
   * The first-run questionnaire's answers. Name, picture and bucket name are
   * saved by the client through the endpoints that already own them; this
   * records the rest in PostHog, from the server so an ad blocker can't drop
   * it, and as person properties so every later event can be broken down by
   * them. Then it stops the questionnaire from showing again.
   */
  completeOnboarding: protectedProcedure
    .input(
      z.object({
        role: slug,
        useCases: z.array(slug).max(20),
        source: slug.nullable(),
        bucketDescription: z.string().trim().max(280),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      const answers = {
        role: input.role,
        use_cases: input.useCases,
        source: input.source ?? "skipped",
      };
      await captureEvent("onboarding_completed", userId, {
        ...answers,
        bucket_description: input.bucketDescription || undefined,
        $set: answers,
      });
      await meterFor(context.env, userId).markOnboarded();
      return { success: true };
    }),

  /**
   * Every publicly served asset this account delivered recently, and every
   * video job it paid container time for. Two sources because they are billed
   * by two different mechanisms and held in two different places: deliveries
   * live in the account's UsageMeter instance, video jobs in Postgres, where
   * they are durable and where the timestamps that were billed already sit.
   */
  activity: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;
    const [deliveries, videoJobs] = await Promise.all([
      readDeliveries(context.env, userId),
      recentVideoJobs(userId),
    ]);
    return { deliveries, videoJobs };
  }),
};

const meterFor = (env: Bindings, userId: string) =>
  env.USAGE_METER.get(env.USAGE_METER.idFromName(userId));

async function readOnboarded(env: Bindings, userId: string): Promise<boolean> {
  try {
    return await meterFor(env, userId).onboarded();
  } catch (error) {
    // True is the safe direction here: an unreachable meter must not lock
    // anyone out of their dashboard behind the questionnaire.
    console.error(`Failed to read onboarded flag for ${userId}`, error);
    return true;
  }
}

// The four below take a userId rather than reading it off the session, so the
// admin panel answers with the same code path - and therefore the same
// numbers - the customer sees (see routers/admin.ts).
export async function readDeliveries(
  env: Bindings,
  userId: string,
): Promise<DeliveryEvent[]> {
  try {
    const { events } = await meterFor(env, userId).recent();
    // Newest first: the tab is a feed, and the meter stores append order.
    return events.slice(-MAX_DELIVERIES).reverse();
  } catch (error) {
    // An unreachable meter must not take down the settings dialog.
    console.error(`Failed to read delivery log for ${userId}`, error);
    return [];
  }
}

export async function pendingCdnRequests(
  env: Bindings,
  userId: string,
): Promise<number> {
  try {
    return await meterFor(env, userId).pending();
  } catch (error) {
    // Zero is the safe direction: usage.get then shows the Autumn balance
    // alone, which is exactly what it showed before this existed.
    console.error(`Failed to read pending usage for ${userId}`, error);
    return 0;
  }
}

export async function apiUploadSeen(
  env: Bindings,
  userId: string,
): Promise<boolean> {
  try {
    return await meterFor(env, userId).apiUploadSeen();
  } catch (error) {
    // False is the safe direction: an unreachable meter leaves the step
    // unticked, which is what it looked like before the upload happened.
    console.error(`Failed to read onboarding state for ${userId}`, error);
    return false;
  }
}

/**
 * The billed side of video, read straight off the rows the charge was
 * computed from. `seconds` is recomputed through the same billableJob both
 * meters use, so the figure in the tab cannot drift from the figure sent to
 * Autumn, and `metered` says whether it has been sent yet.
 */
export async function recentVideoJobs(userId: string) {
  const rows = await db
    .select({
      id: videoJob.id,
      filePath: videoJob.filePath,
      paramsJson: videoJob.paramsJson,
      status: videoJob.status,
      createdAt: videoJob.createdAt,
      startedAt: videoJob.startedAt,
      completedAt: videoJob.completedAt,
      meteredAt: videoJob.meteredAt,
    })
    .from(videoJob)
    // filePath is "ugc/{userId}/{bucketId}/...", the same shape billableJob
    // recovers the owner from, so a prefix match is the tenant scope here.
    .where(like(videoJob.filePath, `ugc/${userId}/%`))
    .orderBy(desc(videoJob.createdAt))
    .limit(MAX_VIDEO_JOBS);

  return rows.map((row) => {
    const segments = row.filePath.split("/");
    return {
      id: row.id,
      bucket: segments[2] ?? "",
      path: segments.slice(3).join("/"),
      params: row.paramsJson,
      status: row.status,
      createdAt: row.createdAt,
      /** Container wall-clock billed, or null when the job is not billable. */
      seconds: billableJob(row)?.seconds ?? null,
      metered: row.meteredAt !== null,
    };
  });
}

export const billingRouter = {
  checkout: protectedProcedure.handler(async ({ context }) => {
    const paymentUrl = await startUpgradeCheckout(
      context.session.user.id,
      planSettingsUrl(),
    );
    return { paymentUrl };
  }),

  /** Card brand and last four, or null without one on file. */
  paymentMethod: protectedProcedure.handler(({ context }) =>
    getPaymentMethod(context.session.user.id),
  ),

  portal: protectedProcedure.handler(async ({ context }) => {
    const url = await openBillingPortal(
      context.session.user.id,
      planSettingsUrl(),
    );
    return { url };
  }),
};
