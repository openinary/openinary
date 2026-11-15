// Reads of an account's UsageMeter instance (worker/usage-meter.ts) that the
// dashboard and the admin panel share, so both show the same numbers. Every
// read degrades to the answer the page had before the meter existed: an
// unreachable meter must not take a settings dialog down with it.

import type { UsageSummary } from "./billing.js";
import { type DeliveryEvent, MAX_EVENTS } from "./delivery-log.js";
import type { Bindings } from "../bindings.js";

/** One instance per account, named by its user id. */
export function meterFor<Stub>(
  namespace: { idFromName(name: string): unknown; get(id: unknown): Stub },
  userId: string,
): Stub {
  return namespace.get(namespace.idFromName(userId));
}

export async function readDeliveries(
  env: Bindings,
  userId: string,
): Promise<DeliveryEvent[]> {
  try {
    const { events } = await meterFor(env.USAGE_METER, userId).recent();
    // Newest first: the tab is a feed, and the meter stores append order.
    return events.slice(-MAX_EVENTS).reverse();
  } catch (error) {
    console.error("%s", `Failed to read delivery log for ${userId}`, error);
    return [];
  }
}

export async function pendingCdnRequests(
  env: Bindings,
  userId: string,
): Promise<number> {
  try {
    return await meterFor(env.USAGE_METER, userId).pending();
  } catch (error) {
    console.error("%s", `Failed to read pending usage for ${userId}`, error);
    return 0;
  }
}

/**
 * CDN hits reach Autumn on a one-minute timer, so the balance alone always
 * trails live traffic. Folding in the meter's unflushed count makes the number
 * the customer reads match the traffic they just caused, without shortening
 * the flush window that keeps delivery cheap.
 */
export function withPendingCdn(summary: UsageSummary, pending: number): UsageSummary {
  if (pending <= 0) return summary;
  const cdn = summary.features.cdn_requests;
  return {
    ...summary,
    features: {
      ...summary.features,
      cdn_requests: {
        ...cdn,
        used: cdn.used + pending,
        remaining: cdn.unlimited
          ? cdn.remaining
          : Math.max(0, cdn.remaining - pending),
      },
    },
  };
}

export async function apiUploadSeen(
  env: Bindings,
  userId: string,
): Promise<boolean> {
  try {
    return await meterFor(env.USAGE_METER, userId).apiUploadSeen();
  } catch (error) {
    // False leaves the step unticked, which is what it looked like before the
    // upload happened.
    console.error("%s", `Failed to read onboarding state for ${userId}`, error);
    return false;
  }
}

export async function readOnboarded(
  env: Bindings,
  userId: string,
): Promise<boolean> {
  try {
    return await meterFor(env.USAGE_METER, userId).onboarded();
  } catch (error) {
    // True: an unreachable meter must not lock anyone out of their dashboard
    // behind the questionnaire.
    console.error("%s", `Failed to read onboarded flag for ${userId}`, error);
    return true;
  }
}
