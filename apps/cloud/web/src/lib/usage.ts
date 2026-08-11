// Single source for how metered usage is labelled, formatted and priced in the
// UI - the sidebar menu and the plan settings tab must never disagree.
// Mirrors the Autumn catalog (plans "free" / "early_access" / "cloud"). Static
// pricing copy, so it lives here rather than costing a round-trip on every
// dialog open. `rate` is dollars per *one unit of what we meter* (MB,
// transformation, second, request) and must stay in sync with the `overage`
// string next to it. `early` is exactly double `free`, matching the included
// grants on the Autumn early_access plan.
export const FEATURES = [
  {
    id: "storage_mb",
    label: "Storage",
    short: "Storage",
    free: "1 GB",
    early: "2 GB",
    cloud: "100 GB",
    overage: "$0.03 / extra GB",
    rate: 0.03 / 1024,
    format: (n: number) => formatMb(n),
  },
  {
    id: "image_transformations",
    label: "Image transformations",
    short: "Images",
    free: "500 / mo",
    early: "1,000 / mo",
    cloud: "50,000 / mo",
    overage: "$0.40 / 1,000",
    rate: 0.4 / 1000,
    format: (n: number) => n.toLocaleString(),
  },
  {
    // Metered in seconds of container processing time, not source runtime -
    // the label says "Video processing" because that is literally what is
    // counted. Formatted as minutes since that's the unit the price is quoted
    // in; `rate` stays per-second to match what the balance holds.
    id: "video_processing_seconds",
    label: "Video processing",
    short: "Video",
    free: "15 min / mo",
    early: "30 min / mo",
    cloud: "500 min / mo",
    overage: "$0.01 / min",
    rate: 0.01 / 60,
    format: (n: number) => `${Math.round(n / 60).toLocaleString()} min`,
  },
  {
    id: "cdn_requests",
    label: "CDN requests",
    short: "CDN",
    free: "25,000 / mo",
    early: "50,000 / mo",
    cloud: "1,500,000 / mo",
    overage: "$0.50 / 100,000",
    rate: 0.5 / 100_000,
    format: (n: number) => n.toLocaleString(),
  },
] as const;

export const CLOUD_MONTHLY = 20;

/**
 * Whether Cloud is on sale. It is built and priced, but not offered yet: while
 * this is false the Cloud column is hidden everywhere and a Free account
 * upgrades into Alpha instead. Set it to true to put Cloud back on sale
 * - and flip UPGRADE_PLAN in apps/server/api/lib/autumn.ts with it, since that
 * is what checkout actually attaches. Typed `boolean` so the Cloud branches
 * stay live code rather than being narrowed away as dead.
 */
export const CLOUD_AVAILABLE: boolean = false;

/**
 * Alpha (plan id `early_access`, renamed in the Autumn catalog when Cloud went
 * to public alpha - the id is load-bearing here and in autumn.ts, so only the
 * display name changed) is a Cloud variant: double the Free allowance, no base
 * price, and the same pay-as-you-go past it. Every branch that used to ask "is
 * this Cloud?" was really asking "is usage metered rather than capped?" - which
 * is true of both - so it asks this instead. Keep it the only place the two
 * plan ids are listed together.
 */
export const isMeteredPlan = (planId: string | null | undefined) =>
  planId === "cloud" || planId === "early_access";

/** Base subscription price per month. Alpha is metered but costs $0. */
export const planMonthly = (planId: string | null | undefined) =>
  planId === "cloud" ? CLOUD_MONTHLY : 0;

export type Balance = { used: number; granted: number; unlimited: boolean };

function formatMb(mb: number) {
  return mb >= 1024
    ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`
    : `${Math.round(mb)} MB`;
}

export function formatUsd(n: number) {
  return n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}

// Units consumed past the included allowance. Zero on unlimited features and
// while a balance hasn't loaded, so callers can sum blindly.
export function overUnits(balance: Balance | undefined) {
  if (!balance || balance.unlimited || balance.granted <= 0) return 0;
  return Math.max(0, balance.used - balance.granted);
}

/** Dollars owed beyond the plan's included allowance, across every feature. */
export function usageCost(
  features: Partial<Record<string, Balance>> | undefined,
) {
  return FEATURES.reduce(
    (total, feature) =>
      total + overUnits(features?.[feature.id]) * feature.rate,
    0,
  );
}

/**
 * How far into its allowance this account is, as the single worst feature
 * rather than an average: what matters is the first limit they will hit, and
 * averaging four features hides one of them being nearly spent.
 *
 * Unlimited and ungranted features contribute nothing, so this is 0 on a plan
 * with no caps. Can exceed 1 on an overage.
 */
export function usageRatio(
  features: Partial<Record<string, Balance>> | undefined,
) {
  return FEATURES.reduce((worst, feature) => {
    const balance = features?.[feature.id];
    if (!balance || balance.unlimited || balance.granted <= 0) return worst;
    return Math.max(worst, balance.used / balance.granted);
  }, 0);
}
