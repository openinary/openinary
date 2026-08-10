// The decisions behind the lifecycle emails, with nothing to reach: who counts
// as gone quiet, which limit is the one worth warning about, what to call
// someone. Split from lib/loops.ts (which holds the HTTP and the scan) for the
// same reason bucket-owner.ts is split from bucket.ts - these are the parts
// worth asserting, and worker/loops-lifecycle.test.ts can only import a module
// that doesn't open a database connection to load.
//
// Every rule here decides whether an email is sent. A wrong answer writes
// itself into someone's inbox and cannot be taken back.

import type { FeatureUsage, UsageFeatureId } from "./autumn.js";
import { USAGE_FEATURE_IDS } from "./autumn.js";

const DAY_MS = 86_400_000;

/** Days without a sign-in before the win-back sequence starts. */
export const INACTIVE_DAYS = 14;

/** Share of the worst feature's allowance that counts as "approaching". */
export const APPROACHING_LIMIT = 0.8;

/**
 * The half of a name an email can open with. Google hands over a full name,
 * the OTP flow often only ever sees an address, and "Hi flo.heysen@gmail.com"
 * is worse than no greeting - so an address degrades to its local part rather
 * than being used whole.
 */
export function firstNameOf(name: string): string {
  const local = name.includes("@") ? name.split("@")[0] : name;
  return local.trim().split(/[\s._-]+/)[0] ?? "";
}

/**
 * How far into its allowance the account is, as the single worst feature
 * rather than an average: the first limit they will hit is the one worth
 * emailing about, and averaging four features hides one of them being spent.
 *
 * Mirrors usageRatio in apps/web/src/lib/usage.ts on purpose - the customer
 * reads that number in their own dashboard, so the email must not quote a
 * different one. Kept as a copy because the web app is a separate workspace
 * with no import path into the Worker.
 *
 * Returns the resetsAt of that same feature, so "resets in X days" describes
 * the limit being warned about rather than whichever one reset first.
 */
export function worstFeature(features: Record<UsageFeatureId, FeatureUsage>): {
  ratio: number;
  resetsAt: number | null;
} {
  let worst: { ratio: number; resetsAt: number | null } = {
    ratio: 0,
    resetsAt: null,
  };
  for (const featureId of USAGE_FEATURE_IDS) {
    const balance = features[featureId];
    // Unlimited and ungranted features have no wall to approach. Counting them
    // would either divide by zero or read as fully spent.
    if (!balance || balance.unlimited || balance.granted <= 0) continue;
    const ratio = balance.used / balance.granted;
    if (ratio > worst.ratio) worst = { ratio, resetsAt: balance.resetsAt };
  }
  return worst;
}

/**
 * Whole days from now until `at` (epoch ms, as FeatureUsage.resetsAt carries
 * it), rounded up: a reset twelve hours out is tomorrow, not today, and 0
 * would read as "already reset". Null when there is no date to count to.
 */
export function daysUntil(at: number | null, now = Date.now()): number | null {
  if (at === null || Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / DAY_MS));
}

/**
 * The soonest monthly allowance to refill, across every feature that has one.
 *
 * Deliberately not worstFeature().resetsAt. Storage is cumulative and never
 * resets, so an account that is at 90% of its gigabyte has a worst feature
 * with no date at all - and the near-limit email would then tell them their
 * limits reset in zero days, which is both false and alarming. This answers
 * the question the email actually asks ("when do my monthly allowances come
 * back"), which is a different feature's business than "what runs out first".
 *
 * Null only when nothing resets, which on the metered plans means the email
 * this feeds was never going to be sent anyway.
 */
export function nextResetAt(
  features: Record<UsageFeatureId, FeatureUsage>,
): number | null {
  let soonest: number | null = null;
  for (const featureId of USAGE_FEATURE_IDS) {
    const at = features[featureId]?.resetsAt;
    if (at === null || at === undefined) continue;
    if (soonest === null || at < soonest) soonest = at;
  }
  return soonest;
}

/**
 * True on the day an account crosses the inactivity threshold, and on no other
 * day. Deliberately an equality rather than "at least": the caller runs once
 * every 24 hours, so "greater than" would re-fire the event every morning
 * until the person came back, and the workflow's own re-eligibility would stop
 * being the thing that decides whether they can be nudged twice.
 *
 * The flip side is that this depends on the daily cron in wrangler.jsonc
 * actually running daily. Run it twice a day and episodes fire twice; skip a
 * day and one is missed silently.
 */
export function crossedInactivity(
  lastActiveAt: Date,
  now = Date.now(),
): boolean {
  return Math.floor((now - lastActiveAt.getTime()) / DAY_MS) === INACTIVE_DAYS;
}
