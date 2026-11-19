// The Openinary Cloud plan catalog, mirroring the Autumn catalog. Autumn is
// what actually meters and bills; this is what every surface (marketing,
// customer dashboard, admin, server copy) renders, so they cannot disagree.
// Re-transcribe from Autumn when a plan changes there.

export const PLAN_IDS = ["free", "early_access", "cloud"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Plan = {
  name: string;
  monthlyUsd: number;
  /** Usage past the grant is billed rather than blocked. */
  metered: boolean;
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

// `early_access` is displayed as Alpha (renamed in Autumn when Cloud went to
// public alpha); the id is load-bearing, only the name changed. Alpha is Cloud
// with no base price and double the Free allowance.
export const PLANS: Record<PlanId, Plan> = {
  free: { name: "Free", monthlyUsd: 0, metered: false, buckets: 1, seats: 1 },
  early_access: {
    name: "Alpha",
    monthlyUsd: 0,
    metered: true,
    buckets: 2,
    seats: 3,
  },
  cloud: { name: "Cloud", monthlyUsd: 20, metered: true, buckets: 10, seats: 3 },
};

/** Any account with no subscription, or on an unknown plan id. */
export const DEFAULT_PLAN: PlanId = "free";

export const planOf = (planId: string | null | undefined): Plan =>
  PLANS[(planId ?? DEFAULT_PLAN) as PlanId] ?? PLANS[DEFAULT_PLAN];

/**
 * Whether Cloud is on sale. It is built and priced but not offered yet: while
 * false the Cloud column is hidden everywhere and Free upgrades into Alpha.
 * Typed `boolean` so the Cloud branches stay live code.
 */
export const CLOUD_AVAILABLE: boolean = false;

/** The plan self-serve checkout attaches, and how the upgrade is worded. */
export const UPGRADE_PLAN: { id: PlanId; cta: string } = CLOUD_AVAILABLE
  ? { id: "cloud", cta: "Upgrade to Cloud" }
  : { id: "early_access", cta: "Enable pay as you go" };

type Feature = {
  id: string;
  label: string;
  short: string;
  /** Unit Autumn meters in; `format` renders it in the unit prices are quoted in. */
  unit: "mb" | "count" | "seconds";
  /** Storage is cumulative; every other allowance refills monthly. */
  resets: boolean;
  grants: Record<PlanId, number>;
  /** `usd` per `per` metered units; `perLabel` names that block in copy. */
  overage: { usd: number; per: number; perLabel?: string };
};

export const FEATURES = [
  {
    id: "storage_mb",
    label: "Storage",
    short: "Storage",
    unit: "mb",
    resets: false,
    grants: { free: 1024, early_access: 2048, cloud: 102_400 },
    overage: { usd: 0.03, per: 1024, perLabel: "extra GB" },
  },
  {
    id: "image_transformations",
    label: "Image transformations",
    short: "Images",
    unit: "count",
    resets: true,
    grants: { free: 500, early_access: 1000, cloud: 50_000 },
    overage: { usd: 0.4, per: 1000 },
  },
  {
    // Seconds of container processing time, not source runtime: that is
    // literally what is counted, hence "Video processing".
    id: "video_processing_seconds",
    label: "Video processing",
    short: "Video",
    unit: "seconds",
    resets: true,
    grants: { free: 900, early_access: 1800, cloud: 30_000 },
    overage: { usd: 0.01, per: 60, perLabel: "min" },
  },
  {
    id: "cdn_requests",
    label: "CDN requests",
    short: "CDN",
    unit: "count",
    resets: true,
    grants: { free: 25_000, early_access: 50_000, cloud: 1_500_000 },
    overage: { usd: 0.5, per: 100_000 },
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

/** "1 GB", "1,000 / mo", "30 min / mo". */
export function formatGrant(feature: Feature, planId: PlanId): string {
  const amount = formatAmount(feature, feature.grants[planId]);
  return feature.resets ? `${amount} / mo` : amount;
}

/** "$0.40 / 1,000", "$0.03 / extra GB". */
export function formatOverage(feature: Feature): string {
  const { usd, per, perLabel } = feature.overage;
  return `$${usd.toFixed(2)} / ${perLabel ?? per.toLocaleString("en-US")}`;
}

/** Dollars per one metered unit (MB, transformation, second, request). */
export const rateOf = (feature: Feature) =>
  feature.overage.usd / feature.overage.per;

export function formatUsd(n: number) {
  return n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}

export type Balance = { used: number; granted: number; unlimited: boolean };
type Balances = Partial<Record<string, Balance>> | undefined;

/**
 * Units consumed past the included allowance. Zero on unlimited features and
 * while a balance hasn't loaded, so callers can sum blindly.
 */
export function overUnits(balance: Balance | undefined) {
  if (!balance || balance.unlimited || balance.granted <= 0) return 0;
  return Math.max(0, balance.used - balance.granted);
}

/** Dollars owed beyond the plan's included allowance, across every feature. */
export function usageCost(features: Balances) {
  return FEATURES.reduce(
    (total, feature) =>
      total + overUnits(features?.[feature.id]) * rateOf(feature),
    0,
  );
}

/**
 * How far into its allowance this account is, as the single worst feature
 * rather than an average: what matters is the first limit they will hit.
 * Unlimited and ungranted features contribute nothing. Exceeds 1 on overage.
 */
export function usageRatio(features: Balances) {
  return FEATURES.reduce((worst, feature) => {
    const balance = features?.[feature.id];
    if (!balance || balance.unlimited || balance.granted <= 0) return worst;
    return Math.max(worst, balance.used / balance.granted);
  }, 0);
}
