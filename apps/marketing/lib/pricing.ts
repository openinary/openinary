import {
  creditBuys,
  FEATURES,
  formatAmount,
  PLANS,
  rateOf,
  type FeatureId,
  type PlanId,
} from "@openinary/plans";

import pricing from "@/data/pricing.json";

/**
 * Monthly cost of the same workload on Cloudinary, Openinary Cloud and a
 * self-hosted box.
 *
 * Usage is the single source of truth: the Cloudinary plan picker in the UI
 * only presets these four numbers, it never feeds the cost directly. That
 * keeps one direction of data flow and no state to reconcile.
 */
export interface Usage {
  storageGb: number;
  transformations: number;
  videoMinutes: number;
  cdnRequests: number;
}

export interface Cost {
  monthlyUsd: number;
  /** Line items, largest first, for the breakdown table. */
  lines: { label: string; usd: number }[];
  /** Plan the workload lands on, when the provider sells plans. */
  planName?: string;
}

const { cloudinary, selfHosted, assumptions } = pricing;

// A workload that fits Free costs nothing; anything past it lands on Pay as
// you go: every unit at its price, and never less than the $5 minimum.
const PAID_PLAN: PlanId = "early_access";

// Each calculator dimension in the unit Autumn meters that feature in.
const METERED: Record<FeatureId, (usage: Usage) => number> = {
  storage_mb: (usage) => usage.storageGb * 1024,
  image_transformations: (usage) => usage.transformations,
  video_processing_seconds: (usage) => usage.videoMinutes * 60,
  cdn_requests: (usage) => usage.cdnRequests,
};
const feature = (id: FeatureId) => FEATURES.find((f) => f.id === id)!;

/** Free's allowances in the calculator's units, read off the catalog. */
export const freeQuotas: Usage = {
  storageGb: feature("storage_mb").free / 1024,
  transformations: feature("image_transformations").free,
  videoMinutes: feature("video_processing_seconds").free / 60,
  cdnRequests: feature("cdn_requests").free,
};
export const paidPlan = PLANS[PAID_PLAN];

/** "512 MB": the catalog's own formatting, so copy and dashboard agree. */
export const freeStorageLabel = formatAmount(
  feature("storage_mb"),
  feature("storage_mb").free,
);

/** Unit prices on Pay as you go, as the cards and table quote them. */
export const rateLines = [
  { label: "Storage", value: `$${feature("storage_mb").price.usd.toFixed(2)} per GB a month` },
  { label: "Transformations", value: `$${feature("image_transformations").price.usd.toFixed(2)} per 1,000` },
  { label: "Video processing", value: `$${feature("video_processing_seconds").price.usd.toFixed(2)} per minute` },
  { label: "CDN requests", value: `$${feature("cdn_requests").price.usd.toFixed(2)} per 100,000` },
];

/** How Pay as you go is sold, on every surface (Railway's framing). */
export const paidPitch = [
  `$${paidPlan.monthlyUsd} minimum usage`,
  `Includes $${paidPlan.creditUsd} of usage every month`,
  "After that, you only pay for extra usage",
];

/** What the included credit buys on one resource alone, for the examples. */
export const creditBuysLines = [
  `${Math.round(creditBuys(feature("storage_mb")) / 1024)} GB stored for a month`,
  `${Math.round(creditBuys(feature("image_transformations"))).toLocaleString("en-US")} image transformations`,
  `${Math.round(creditBuys(feature("video_processing_seconds")) / 60)} minutes of video processing`,
  `${Math.round(creditBuys(feature("cdn_requests"))).toLocaleString("en-US")} CDN requests`,
];

/** Delivery converted to GB, since Cloudinary meters bandwidth and we meter requests. */
export function bandwidthGb(cdnRequests: number): number {
  return (cdnRequests * assumptions.avgDeliveredAssetKb) / (1024 * 1024);
}

export function cloudinaryCost(usage: Usage): Cost {
  const buys = cloudinary.creditBuys;
  const credits =
    usage.storageGb / buys.storageGb +
    usage.transformations / buys.transformations +
    usage.videoMinutes / buys.videoMinutes +
    bandwidthGb(usage.cdnRequests) / buys.bandwidthGb;

  // Cheapest plan that covers the workload; above the top plan, that plan plus
  // extra credits, which is how Cloudinary quotes overage.
  const plans = [...cloudinary.plans].sort((a, b) => a.credits - b.credits);
  const covering = plans.find((plan) => credits <= plan.credits);
  const top = plans[plans.length - 1];

  const plan = covering ?? top;
  const overage = covering ? 0 : (credits - top.credits) * cloudinary.extraCreditUsd;

  return {
    monthlyUsd: plan.monthlyUsd + overage,
    planName: covering ? plan.name : `${top.name} + overage`,
    lines: [
      { label: `${plan.name} plan`, usd: plan.monthlyUsd },
      ...(overage > 0
        ? [
            {
              label: `${Math.ceil(credits - top.credits)} extra credits`,
              usd: overage,
            },
          ]
        : []),
    ],
  };
}

export function openinaryCloudCost(usage: Usage): Cost {
  const fitsFree = FEATURES.every((f) => METERED[f.id](usage) <= f.free);
  if (fitsFree) return { monthlyUsd: 0, planName: "Free plan", lines: [] };

  // Every unit at its price from the first one; storage as held for a month.
  const lines = FEATURES.map((f) => ({
    label: f.label,
    usd: METERED[f.id](usage) * rateOf(f),
  }));
  const usageUsd = lines.reduce((total, line) => total + line.usd, 0);
  const unused = Math.max(0, paidPlan.creditUsd - usageUsd);

  return {
    monthlyUsd: Math.max(paidPlan.monthlyUsd, usageUsd),
    planName: paidPlan.name,
    lines: [
      ...lines.filter((line) => line.usd > 0),
      // The minimum, shown as what it is: included usage this workload leaves unspent.
      ...(unused > 0 ? [{ label: "Included usage left unused", usd: unused }] : []),
    ].sort((a, b) => b.usd - a.usd),
  };
}

/**
 * Running it yourself.
 *
 * The server has to be sized by the work, not fixed: resizing images and
 * encoding video are CPU-bound, so a box that serves a small site does not
 * serve a large one. Costing a flat server made this figure independent of
 * transformations and video minutes entirely, which quoted the same price for
 * doing nothing and for half a million transformations a month.
 *
 * Storage and egress are metered, and the number still excludes the hours
 * spent running the thing.
 */
export function selfHostedCost(usage: Usage): Cost {
  const vcpus = Math.max(
    selfHosted.minVcpu,
    Math.ceil(
      usage.transformations / selfHosted.transformationsPerVcpuMonth +
        usage.videoMinutes / selfHosted.videoMinutesPerVcpuMonth,
    ),
  );

  const lines = [
    { label: `Server, ${vcpus} vCPU`, usd: vcpus * selfHosted.vcpuUsdMonth },
    { label: "Bucket storage", usd: usage.storageGb * selfHosted.storageGbMonthUsd },
    {
      label: "Egress",
      usd: bandwidthGb(usage.cdnRequests) * selfHosted.egressGbUsd,
    },
  ];

  return {
    monthlyUsd: lines.reduce((total, line) => total + line.usd, 0),
    lines: lines.filter((line) => line.usd > 0),
  };
}

/**
 * Down to a round number: the leading digit kept, the rest cut to a 1/2/5 step.
 * 56 -> 50, 281 -> 250, 235,929 -> 200,000.
 *
 * Down and never up, because these numbers seed a Cloudinary plan's own usage.
 * Rounding up puts the preset a fraction of a credit over the plan it came
 * from, and picking a plan would then quote that plan "+ overage" instead of
 * its own price.
 */
function roundDown(value: number): number {
  if (value <= 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const leading = value / magnitude;
  const step =
    leading >= 5 ? magnitude : leading >= 2 ? magnitude / 2 : magnitude / 10;

  return Math.round(Math.floor(value / step) * step);
}

/**
 * Usage a Cloudinary plan's credits buy, split evenly across the four
 * dimensions, then rounded to something a visitor would recognise as a number
 * rather than the output of a division.
 *
 * Free is the exception: its preset is our own Free allowance, read off the
 * catalog, so the two free tiers can never drift apart. It reads "a project
 * that fits our Free is free on both", not "everything Cloudinary Free covers":
 * their 25 credits buy far more than our Free, and the preset must not imply
 * otherwise. pricing-check asserts it costs nothing on either side.
 */
export function usageForPlan(planId: string): Usage {
  const plan = cloudinary.plans.find((p) => p.id === planId) ?? cloudinary.plans[0];
  if (plan.id === "free") return { ...freeQuotas };

  const perDimension = plan.credits / 4;
  const buys = cloudinary.creditBuys;
  const gb = perDimension * buys.bandwidthGb;

  return {
    storageGb: roundDown(perDimension * buys.storageGb),
    transformations: roundDown(perDimension * buys.transformations),
    videoMinutes: roundDown(perDimension * buys.videoMinutes),
    cdnRequests: roundDown(
      (gb * 1024 * 1024) / assumptions.avgDeliveredAssetKb,
    ),
  };
}

export const plans = cloudinary.plans;
export const lastCheckedOn = pricing.lastCheckedOn;
