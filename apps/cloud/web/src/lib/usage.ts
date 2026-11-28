// The plan catalog in the shape the dashboard renders: the sidebar menu and
// the plan settings tab read it from here, so they never disagree.
import {
  type Balance,
  FEATURES as CATALOG,
  type Credits,
  DAYS_PER_MONTH,
  formatAmount,
  formatGrant,
  formatPrice,
  planOf,
  rateOf,
  STORAGE_DAYS_FEATURE_ID,
} from "@openinary/plans";

export {
  type Balance,
  billedUsd,
  type Credits,
  formatUsd,
  usageRatio,
} from "@openinary/plans";

export const FEATURES = CATALOG.map((feature) => ({
  id: feature.id,
  label: feature.label,
  short: feature.short,
  /** Free's allowance, "100 / mo". */
  free: formatGrant(feature),
  /** The unit price on Pay as you go, "$0.40 / 1,000". */
  price: formatPrice(feature),
  rate: rateOf(feature),
  format: (n: number) => formatAmount(feature, n),
}));

/** Whether usage past what is included is billed rather than blocked. */
export const isMeteredPlan = (planId: string | null | undefined) =>
  planOf(planId).metered;

/** Base subscription price per month, from the catalog. */
export const planMonthly = (planId: string | null | undefined) =>
  planOf(planId).monthlyUsd;

/**
 * Units consumed past a per-feature grant. Only older plan versions still
 * have those on a paid plan (the $0 Alpha); zero everywhere else.
 */
export function overUnits(balance: Balance | undefined) {
  if (!balance || balance.unlimited || balance.granted <= 0) return 0;
  return Math.max(0, balance.used - balance.granted);
}

/**
 * Dollars of usage in a set of unit counts, keyed like Autumn's event bins:
 * the four features, plus storage_mb_days (MB held per day) for storage.
 */
export function usageUsd(used: Partial<Record<string, number>>) {
  return FEATURES.reduce((total, feature) => {
    const units =
      feature.id === "storage_mb"
        ? (used[STORAGE_DAYS_FEATURE_ID] ?? 0) / DAYS_PER_MONTH
        : (used[feature.id] ?? 0);
    return total + units * feature.rate;
  }, 0);
}

/**
 * Dollars owed on top of the base price: past the credit on Pay as you go,
 * past each grant on an older per-feature plan, nothing on Free.
 */
export function overageUsd(summary: {
  credits: Credits | null;
  features: Partial<Record<string, Balance>>;
}) {
  if (summary.credits) {
    return Math.max(0, summary.credits.usedUsd - summary.credits.grantedUsd);
  }
  return FEATURES.reduce(
    (total, feature) =>
      total + overUnits(summary.features[feature.id]) * feature.rate,
    0,
  );
}
