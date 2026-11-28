// End-to-end check of the credit pricing against the Autumn SANDBOX, through
// the same functions the Worker calls. Never runs on a live key.
//
//
//   node --env-file=.env --import tsx scripts/autumn-pricing-smoke.ts
//
// Creates a throwaway customer, checks Free, turns Pay as you go on with a
// sent invoice it never pays (no card), spends credits, goes past them, then deletes it.

import assert from "node:assert/strict";

if (!process.env.AUTUMN_SECRET_KEY?.startsWith("am_sk_test")) {
  console.error("Sandbox key only (am_sk_test_...).");
  process.exit(1);
}
process.env.CORS_ORIGIN ??= "https://app.openinary.dev";

const { autumn, trackFeature } = await import("../shared/autumn.js");
const billing = await import("../worker/lib/billing.js");

type Usage = Awaited<ReturnType<typeof billing.getUsage>>;
const show = (label: string, u: Usage) =>
  console.log(
    label,
    JSON.stringify({
      plan: u.planId,
      monthlyUsd: u.monthlyUsd,
      credits: u.credits,
      used: Object.fromEntries(
        Object.entries(u.features).map(([k, f]) => [k, f.used]),
      ),
    }),
  );
const settle = () => new Promise((r) => setTimeout(r, 4000));

const id = `pricing-smoke-${Date.now()}`;
try {
  let usage = await billing.getUsage(id, { name: "Pricing smoke", email: `${id}@example.com` });
  show("free:", usage);
  assert.equal(usage.credits, null);
  assert.equal(usage.features.image_transformations.granted, 100);
  assert.equal(usage.features.storage_mb.granted, 512);
  assert.equal(
    await billing.checkFeature(id, "image_transformations", 101),
    false,
    "Free must stop at its cap",
  );
  await autumn.billing.attach({
    customerId: id,
    planId: "early_access",
    invoiceMode: { enabled: true, enablePlanImmediately: true, finalize: true },
  });

  usage = await billing.getUsage(id);
  show("paid:", usage);
  assert.equal(usage.planId, "early_access");
  assert.equal(usage.monthlyUsd, 5);
  assert.deepEqual([usage.credits?.grantedUsd, usage.credits?.usedUsd], [5, 0]);
  assert.equal(usage.features.cdn_requests.unlimited, true);
  assert.equal(
    (await billing.getFeatureBalance(id, "cdn_requests")).unlimited,
    true,
    "the usage meter must never block a paid account",
  );

  // Usage draws on the credit at the unit prices.
  await trackFeature(id, "image_transformations", 1000); // $0.40
  await trackFeature(id, "cdn_requests", 100_000); // $0.50
  await trackFeature(id, "video_processing_seconds", 600); // $0.10
  await trackFeature(id, "storage_mb", 2048);
  await billing.meterStorageDay([id]); // 2 GB for a day: ~$0.0033
  await settle();
  usage = await billing.getUsage(id);
  show("used:", usage);
  const expected = 0.4 + 0.5 + 0.1 + (2 * 0.05) / 30;
  const used = usage.credits?.usedUsd ?? 0;
  assert.ok(Math.abs(used - expected) < 0.01, `credits used ${used}, expected ${expected}`);

  // Past the credit: still allowed, billed on top of the $5.
  await trackFeature(id, "image_transformations", 20_000); // +$8
  await settle();
  usage = await billing.getUsage(id);
  show("over:", usage);
  assert.ok(
    await billing.checkFeature(id, "image_transformations", 1),
    "a paid account keeps going past its credit",
  );
  assert.ok((usage.credits?.usedUsd ?? 0) > 5);

  const history = await billing.getUsageHistory(id, Date.now() - 86_400_000);
  console.log("history:", JSON.stringify(history));
  console.log("OK: credit pricing behaves as designed in the sandbox.");
} finally {
  await autumn.customers.delete({ customerId: id, deleteInStripe: true }).catch(() => {});
  console.log("deleted test customer", id);
}

// An admin comp: Pay as you go with its credits, no $5 and no invoice.
const comp = `${id}-comp`;
try {
  await billing.grantPlan(comp, "early_access");
  const usage = await billing.getUsage(comp);
  show("comp:", usage);
  assert.equal(usage.planId, "early_access", "a comp must start without payment");
  assert.equal(usage.monthlyUsd, 0);
  assert.equal(usage.credits?.grantedUsd, 5);
  console.log("OK: admin comp starts Pay as you go for free.");
} finally {
  await autumn.customers.delete({ customerId: comp, deleteInStripe: true }).catch(() => {});
}
