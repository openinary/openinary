// Pushes the plan catalog in @openinary/plans to Autumn: the two new features
// (storage_mb_days, usage_credits) and both plans. Idempotent: creates what is
// missing, updates what exists. Editing a plan that has customers makes a new
// version; existing customers stay on theirs until migrated.
//
//   node --env-file=.env --import tsx scripts/autumn-catalog.ts          (sandbox)
//   node --env-file=.env --import tsx scripts/autumn-catalog.ts --live   (production)
//
// Refuses a live key without --live, so a sandbox run can never touch prod.

import {
  CREDIT_FEATURE_ID,
  CREDITS_PER_USD,
  creditCostOf,
  FEATURES,
  PLANS,
  STORAGE_DAYS_FEATURE_ID,
} from "@openinary/plans";
import { Autumn } from "autumn-js";

const key = process.env.AUTUMN_SECRET_KEY ?? "";
const live = process.argv.includes("--live");
if (!key.startsWith(live ? "am_sk_live" : "am_sk_test")) {
  console.error(
    live
      ? "--live needs a live key (am_sk_live_...)."
      : "Not a sandbox key (am_sk_test_...). Pass --live to configure production.",
  );
  process.exit(1);
}
const autumn = new Autumn({ secretKey: key });

const { list: features } = await autumn.features.list();
const has = (id: string) => features.some((f) => f.id === id);

async function upsertFeature(
  featureId: string,
  body: Omit<Parameters<typeof autumn.features.create>[0], "featureId">,
) {
  if (has(featureId)) {
    await autumn.features.update({ featureId, ...body });
    console.log("updated feature", featureId);
  } else {
    await autumn.features.create({ featureId, ...body });
    console.log("created feature", featureId);
  }
}

await upsertFeature(STORAGE_DAYS_FEATURE_ID, {
  name: "Storage (MB-days)",
  type: "metered",
  consumable: true,
});

await upsertFeature(CREDIT_FEATURE_ID, {
  name: "Usage",
  type: "credit_system",
  creditSchema: FEATURES.map((feature) => ({
    meteredFeatureId:
      feature.id === "storage_mb" ? STORAGE_DAYS_FEATURE_ID : feature.id,
    creditCost: creditCostOf(feature),
  })),
});

const { list: plans } = await autumn.plans.list();
async function upsertPlan(
  planId: string,
  body: Omit<Parameters<typeof autumn.plans.create>[0], "planId">,
) {
  if (plans.some((p) => p.id === planId)) {
    await autumn.plans.update({ planId, ...body });
    console.log("updated plan", planId);
  } else {
    await autumn.plans.create({ planId, ...body });
    console.log("created plan", planId);
  }
}

// Free: hard caps, no price anywhere, so it stops at them.
await upsertPlan("free", {
  name: PLANS.free.name,
  autoEnable: true,
  items: FEATURES.map((feature) => ({
    featureId: feature.id,
    included: feature.free,
    ...(feature.resets && { reset: { interval: "month" as const } }),
  })),
});

// Pay as you go: a $5 minimum that is also $5 of credits, then a cent per
// credit. Storage is counted but never capped: it bills through
// storage_mb_days, which draws on the credits.
const paid = PLANS.early_access;
await upsertPlan("early_access", {
  name: paid.name,
  // No longer a variant of the old Cloud plan, which is not sold any more.
  basePlanId: null,
  price: { amount: paid.monthlyUsd, interval: "month" },
  items: [
    {
      featureId: CREDIT_FEATURE_ID,
      included: paid.creditUsd * CREDITS_PER_USD,
      reset: { interval: "month" },
      price: {
        amount: 1 / CREDITS_PER_USD,
        billingUnits: 1,
        billingMethod: "usage_based",
        interval: "month",
      },
    },
    { featureId: "storage_mb", unlimited: true },
  ],
});

// Pay as you go still bills under the Stripe product of the old Cloud plan it
// was first made from, and Stripe prints that product's name on the invoice
// ("Cloud"). Autumn pushes a plan's name to its Stripe product, so naming the
// retired Cloud plan after Pay as you go is what fixes the invoice line.
if (plans.some((p) => p.id === "cloud")) {
  await autumn.plans.update({ planId: "cloud", name: paid.name });
  console.log(`renamed plan cloud to "${paid.name}" (invoice line name)`);
}

console.log(`Autumn ${live ? "PRODUCTION" : "sandbox"} catalog is in sync.`);
