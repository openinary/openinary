// The Openinary Cloud plan catalog, mirroring the Autumn catalog. Autumn is
// what actually meters and bills; this is what every surface (marketing,
// customer dashboard, admin, server copy) renders, so they cannot disagree.
// Re-transcribe from Autumn when a plan changes there (AUTUMN.md has the
// exact configuration this file describes).

export const PLAN_IDS = ["free", "early_access"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Plan = {
  name: string;
  monthlyUsd: number;
  /** Usage past what is included is billed rather than blocked. */
  metered: boolean;
  /**
   * Usage credit included each month, in dollars, spent at the unit prices
   * below from the first unit. Zero on Free, which has per-feature allowances
   * instead (`Feature.free`).
   */
  creditUsd: number;
  /**
   * Buckets are a hard cap enforced from Postgres, not an Autumn balance: a
   * count derivable exactly at any moment would only drift if metered.
   */
  buckets: number;
  /**
   * People on the account, owner included. Same hard cap as buckets, counted
   * from the team's members plus pending invitations (worker/lib/auth.ts).
   */
  seats: number;
};

// `early_access` is displayed as Pay as you go (it was Early Access, then
// Alpha); the id is load-bearing, only the name changed. Railway's model: a
// $5 minimum that includes $5 of usage credit, then usage at the same prices.
// Volume deals go on custom plans, added here when one exists.
export const PLANS: Record<PlanId, Plan> = {
  free: {
    name: "Free",
    monthlyUsd: 0,
    metered: false,
    creditUsd: 0,
    buckets: 1,
    seats: 1,
  },
  early_access: {
    name: "Pay as you go",
    monthlyUsd: 5,
    metered: true,
    creditUsd: 5,
    buckets: 5,
    seats: 5,
  },
};

/** Any account with no subscription, or on an unknown plan id. */
export const DEFAULT_PLAN: PlanId = "free";

export const planOf = (planId: string | null | undefined): Plan =>
  PLANS[(planId ?? DEFAULT_PLAN) as PlanId] ?? PLANS[DEFAULT_PLAN];

/** The plan self-serve checkout attaches, and how the upgrade is worded. */
export const UPGRADE_PLAN: { id: PlanId; cta: string } = {
  id: "early_access",
  cta: "Enable pay as you go",
};

/**
 * The Autumn credit system Pay as you go spends from. One credit is one US
 * cent, so usage past the included credit is invoiced to the cent rather than
 * rounded to a dollar.
 */
export const CREDIT_FEATURE_ID = "usage_credits";
export const CREDITS_PER_USD = 100;

/**
 * Storage is held, not consumed, so it can only draw on a monthly credit as
 * time stored: the daily cron records each paid account's footprint in MB
 * under this consumable feature, one day at a time (worker/cron.ts).
 */
export const STORAGE_DAYS_FEATURE_ID = "storage_mb_days";
/** The month a storage price is quoted per, in days. */
export const DAYS_PER_MONTH = 30;

type Feature = {
  id: string;
  label: string;
  short: string;
  /** Unit Autumn meters in; `format` renders it in the unit prices are quoted in. */
  unit: "mb" | "count" | "seconds";
  /** Storage is cumulative; every other allowance refills monthly. */
  resets: boolean;
  /** Included on Free, which stops at it. */
  free: number;
  /**
   * `usd` per `per` metered units, from the first unit on Pay as you go;
   * `perLabel` names that block in copy. Storage is per GB held for a month.
   */
  price: { usd: number; per: number; perLabel?: string };
};

export const FEATURES = [
  {
    id: "storage_mb",
    label: "Storage",
    short: "Storage",
    unit: "mb",
    resets: false,
    free: 512,
    price: { usd: 0.05, per: 1024, perLabel: "GB / month" },
  },
  {
    id: "image_transformations",
    label: "Image transformations",
    short: "Images",
    unit: "count",
    resets: true,
    free: 100,
    price: { usd: 0.4, per: 1000 },
  },
  {
    // Seconds of container processing time, not source runtime: that is
    // literally what is counted, hence "Video processing".
    id: "video_processing_seconds",
    label: "Video processing",
    short: "Video",
    unit: "seconds",
    resets: true,
    free: 300,
    price: { usd: 0.01, per: 60, perLabel: "min" },
  },
  {
    id: "cdn_requests",
    label: "CDN requests",
    short: "CDN",
    unit: "count",
    resets: true,
    free: 5000,
    price: { usd: 0.5, per: 100_000 },
  },
] as const satisfies readonly Feature[];

export type FeatureId = (typeof FEATURES)[number]["id"];
export const FEATURE_IDS: FeatureId[] = FEATURES.map((feature) => feature.id);

const count = (n: number) => Math.round(n).toLocaleString("en-US");

function formatMb(mb: number) {
  return mb >= 1024
    ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`
    : `${Math.round(mb)} MB`;
}

/** An amount in the feature's metered unit, as customers read it. */
export function formatAmount(feature: Feature, n: number): string {
  if (feature.unit === "mb") return formatMb(n);
  if (feature.unit === "seconds") return `${count(n / 60)} min`;
  return count(n);
}

/** Free's allowance: "512 MB", "100 / mo", "5 min / mo". */
export function formatGrant(feature: Feature): string {
  const amount = formatAmount(feature, feature.free);
  return feature.resets ? `${amount} / mo` : amount;
}

/** "$0.40 / 1,000", "$0.05 / GB / month". */
export function formatPrice(feature: Feature): string {
  const { usd, per, perLabel } = feature.price;
  return `$${usd.toFixed(2)} / ${perLabel ?? per.toLocaleString("en-US")}`;
}

/**
 * Dollars per one metered unit (transformation, second, request). For storage
 * it is per MB held for a whole month: divide by DAYS_PER_MONTH per MB-day.
 */
export const rateOf = (feature: Feature) =>
  feature.price.usd / feature.price.per;

/**
 * What one metered unit costs in Autumn credits: the `credit_cost` each
 * feature gets in the usage_credits credit schema. Storage's entry is for
 * storage_mb_days, one MB held for one day.
 */
export const creditCostOf = (feature: Feature) =>
  (rateOf(feature) * CREDITS_PER_USD) /
  (feature.unit === "mb" ? DAYS_PER_MONTH : 1);

/** How many units the included credit buys if spent on this feature alone. */
export const creditBuys = (feature: Feature, planId: PlanId = "early_access") =>
  PLANS[planId].creditUsd / rateOf(feature);

export function formatUsd(n: number) {
  return n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}

/** The credit balance, in dollars. Null on plans without one (Free). */
export type Credits = { grantedUsd: number; usedUsd: number };

/** What the period bills: the base price, plus usage past the credit. */
export function billedUsd(monthlyUsd: number, credits: Credits | null) {
  return (
    monthlyUsd + (credits ? Math.max(0, credits.usedUsd - credits.grantedUsd) : 0)
  );
}

export type Balance = { used: number; granted: number; unlimited: boolean };
type Balances = Partial<Record<string, Balance>> | undefined;

/**
 * How far into its allowance this account is, as the single worst feature
 * rather than an average: what matters is the first limit they will hit.
 * Unlimited and ungranted features contribute nothing. Exceeds 1 past it.
 */
export function usageRatio(features: Balances) {
  return FEATURES.reduce((worst, feature) => {
    const balance = features?.[feature.id];
    if (!balance || balance.unlimited || balance.granted <= 0) return worst;
    return Math.max(worst, balance.used / balance.granted);
  }, 0);
}
