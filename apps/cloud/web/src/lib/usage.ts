// The plan catalog in the shape the dashboard renders: the sidebar menu and
// the plan settings tab read it from here, so they never disagree.
import {
  FEATURES as CATALOG,
  formatAmount,
  formatGrant,
  formatOverage,
  PLANS,
  planOf,
  rateOf,
} from "@openinary/plans";

export {
  type Balance,
  CLOUD_AVAILABLE,
  formatUsd,
  overUnits,
  usageCost,
  usageRatio,
} from "@openinary/plans";

export const FEATURES = CATALOG.map((feature) => ({
  id: feature.id,
  label: feature.label,
  short: feature.short,
  free: formatGrant(feature, "free"),
  early: formatGrant(feature, "early_access"),
  cloud: formatGrant(feature, "cloud"),
  overage: formatOverage(feature),
  rate: rateOf(feature),
  format: (n: number) => formatAmount(feature, n),
}));

export const CLOUD_MONTHLY = PLANS.cloud.monthlyUsd;

/**
 * Every branch that used to ask "is this Cloud?" was really asking "is usage
 * metered rather than capped?", which is true of Alpha too.
 */
export const isMeteredPlan = (planId: string | null | undefined) =>
  planOf(planId).metered;

/** Base subscription price per month. Alpha is metered but costs $0. */
export const planMonthly = (planId: string | null | undefined) =>
  planOf(planId).monthlyUsd;
