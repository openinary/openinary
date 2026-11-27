import { z } from "zod";
import { DASHBOARD_ORIGIN, planSettingsUrl } from "../config.js";
import { captureEvent } from "../lib/analytics.js";
import {
  getPaymentMethod,
  getUsage,
  getUsageHistory,
  openBillingPortal,
  startUpgradeCheckout,
} from "../lib/billing.js";
import {
  apiUploadSeen,
  meterFor,
  pendingCdnRequests,
  readDeliveries,
  readOnboarded,
  withPendingCdn,
} from "../lib/meter.js";
import { MAX_EVENTS } from "../lib/delivery-log.js";
import { recentVideoJobs } from "../video-jobs.js";
import { customerDataOf } from "./customer.js";
import { accountProcedure, protectedProcedure } from "./orpc.js";

/** Option ids from the onboarding form, never free text. */
const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);

/**
 * Accounts that existed before the questionnaire shipped never see it: they
 * set themselves up long ago, and a form between them and their library would
 * be a toll, not an onboarding.
 */
const ONBOARDING_SHIPPED_AT = Date.parse("2026-10-01T00:00:00Z");

export const usageRouter = {
  get: protectedProcedure.handler(async ({ context }) => {
    const userId = context.account.accountId;
    const [summary, pendingCdn] = await Promise.all([
      getUsage(userId, customerDataOf(context)),
      pendingCdnRequests(context.env, userId),
    ]);
    return withPendingCdn(summary, pendingCdn);
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
          context.account.accountId,
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
        team: z.boolean().optional(),
        // Older clients still send it; the questionnaire no longer asks.
        bucketDescription: z.string().trim().max(280).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      const answers = {
        role: input.role,
        use_cases: input.useCases,
        source: input.source ?? "skipped",
        ...(input.team !== undefined && { team: input.team }),
      };
      await captureEvent("onboarding_completed", userId, {
        ...answers,
        bucket_description: input.bucketDescription || undefined,
        $set: answers,
      });
      await meterFor(context.env.USAGE_METER, userId).markOnboarded();
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
    const userId = context.account.accountId;
    const [deliveries, videoJobs] = await Promise.all([
      readDeliveries(context.env, userId),
      recentVideoJobs(userId),
    ]);
    return { deliveries, videoJobs, limit: MAX_EVENTS };
  }),
};

export const billingRouter = {
  /**
   * `returnTo: "get-started"` brings the onboarding's checkout back to the
   * dashboard, where an unfinished questionnaire picks up again; a fixed
   * choice rather than a URL, so this can't be made into an open redirect.
   */
  checkout: accountProcedure("billing")
    .input(z.object({ returnTo: z.enum(["get-started"]).optional() }).optional())
    .handler(async ({ context, input }) => {
      const paymentUrl = await startUpgradeCheckout(
        context.account.accountId,
        input?.returnTo && DASHBOARD_ORIGIN ? `${DASHBOARD_ORIGIN}/get-started` : planSettingsUrl,
      );
      return { paymentUrl };
    }),

  /** Card brand and last four, or null without one on file. */
  paymentMethod: accountProcedure("billing").handler(({ context }) =>
    getPaymentMethod(context.account.accountId),
  ),

  portal: accountProcedure("billing").handler(async ({ context }) => {
    const url = await openBillingPortal(
      context.account.accountId,
      planSettingsUrl,
    );
    return { url };
  }),
};
