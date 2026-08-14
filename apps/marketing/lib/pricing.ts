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

const { cloudinary, openinaryCloud, selfHosted, assumptions } = pricing;

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
  const { included, rates } = openinaryCloud;
  const over = (used: number, free: number) => Math.max(0, used - free);

  const lines = [
    {
      label: "Storage",
      usd: over(usage.storageGb, included.storageGb) * rates.storageGbMonthUsd,
    },
    {
      label: "Transformations",
      usd:
        (over(usage.transformations, included.transformations) / 1000) *
        rates.per1kTransformationsUsd,
    },
    {
      label: "Video processing",
      usd:
        over(usage.videoMinutes, included.videoMinutes) *
        rates.perVideoMinuteUsd,
    },
    {
      label: "CDN requests",
      usd:
        (over(usage.cdnRequests, included.cdnRequests) / 10000) *
        rates.per10kRequestsUsd,
    },
  ];

  return {
    monthlyUsd: lines.reduce((total, line) => total + line.usd, 0),
    planName: lines.every((line) => line.usd === 0) ? "Free plan" : "Pay as you go",
    lines: lines.filter((line) => line.usd > 0),
  };
}

export function selfHostedCost(usage: Usage): Cost {
  const lines = [
    { label: "Server", usd: selfHosted.serverUsdMonth },
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
 * Usage a Cloudinary plan's credits buy, split evenly across the four
 * dimensions. Always rounds down: rounding up puts the preset a fraction of a
 * credit over the plan it came from, so picking a plan would quote that plan
 * "+ overage" instead of its own price.
 */
export function usageForPlan(planId: string): Usage {
  const plan = cloudinary.plans.find((p) => p.id === planId) ?? cloudinary.plans[0];
  const perDimension = plan.credits / 4;
  const buys = cloudinary.creditBuys;
  const gb = perDimension * buys.bandwidthGb;

  return {
    storageGb: Math.floor(perDimension * buys.storageGb),
    transformations: Math.floor(perDimension * buys.transformations),
    videoMinutes: Math.floor(perDimension * buys.videoMinutes),
    cdnRequests: Math.floor((gb * 1024 * 1024) / assumptions.avgDeliveredAssetKb),
  };
}

export const plans = cloudinary.plans;
export const lastCheckedOn = pricing.lastCheckedOn;
export const freeQuotas = openinaryCloud.included;
export const avgDeliveredAssetKb = assumptions.avgDeliveredAssetKb;
