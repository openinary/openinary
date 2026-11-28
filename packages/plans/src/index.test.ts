import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Balance,
  billedUsd,
  creditBuys,
  creditCostOf,
  FEATURES,
  formatGrant,
  formatPrice,
  PLANS,
  usageRatio,
} from "./index.ts";

const balance = (used: number, granted: number, unlimited = false): Balance => ({
  used,
  granted,
  unlimited,
});
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// usageRatio decides whether the dashboard sidebar shows a quiet button or the
// full upsell.
test("usageRatio is the worst feature, never an average", () => {
  assert.equal(usageRatio(undefined), 0);
  assert.equal(usageRatio({}), 0);
  assert.equal(
    usageRatio({
      storage_mb: balance(10, 100),
      image_transformations: balance(90, 100),
      video_processing_seconds: balance(0, 100),
      cdn_requests: balance(5, 100),
    }),
    0.9,
  );
});

test("usageRatio ignores unlimited, ungranted and unknown features", () => {
  assert.equal(usageRatio({ cdn_requests: balance(500, 0, true) }), 0);
  // Infinity here would pin the upsell on forever.
  assert.equal(usageRatio({ cdn_requests: balance(5, 0) }), 0);
  assert.equal(usageRatio({ not_a_feature: balance(99, 100) }), 0);
});

// Railway's rule: the base price covers usage up to the credit, then usage
// past it is billed on top. Never less than the base, never double-counted.
test("billedUsd is the minimum until the credit runs out", () => {
  assert.equal(billedUsd(0, null), 0);
  assert.equal(billedUsd(5, { grantedUsd: 5, usedUsd: 0 }), 5);
  assert.equal(billedUsd(5, { grantedUsd: 5, usedUsd: 4.99 }), 5);
  assert.ok(close(billedUsd(5, { grantedUsd: 5, usedUsd: 7.8 }), 7.8));
});

// The credit_cost each feature gets in Autumn's usage_credits schema, one
// credit being one cent. Asserted so AUTUMN.md and the catalog cannot drift.
test("credit costs match the Autumn credit schema", () => {
  const costs = Object.fromEntries(
    FEATURES.map((feature) => [feature.id, creditCostOf(feature)]),
  );
  assert.ok(close(costs.image_transformations, 0.04));
  assert.ok(close(costs.video_processing_seconds, 1 / 60));
  assert.ok(close(costs.cdn_requests, 0.0005));
  // Per MB held for one day: 5 cents per GB per 30-day month.
  assert.ok(close(costs.storage_mb, 5 / 1024 / 30));
});

test("what the $5 credit buys on one feature alone", () => {
  const [storage, images, video, cdn] = FEATURES;
  assert.equal(Math.round(creditBuys(storage) / 1024), 100); // GB for a month
  assert.equal(Math.round(creditBuys(images)), 12_500);
  assert.equal(Math.round(creditBuys(video) / 60), 500); // minutes
  assert.equal(Math.round(creditBuys(cdn)), 1_000_000);
});

// What the dashboard and marketing show today; a catalog edit that changes one
// of these is a visible pricing change and should be deliberate.
test("Free allowances and unit prices render as the plan tab shows them", () => {
  const rendered = FEATURES.map((feature) => [
    formatGrant(feature),
    formatPrice(feature),
  ]);
  assert.deepEqual(rendered, [
    ["512 MB", "$0.05 / GB / month"],
    ["100 / mo", "$0.40 / 1,000"],
    ["5 min / mo", "$0.01 / min"],
    ["5,000 / mo", "$0.50 / 100,000"],
  ]);
});

test("plans", () => {
  assert.deepEqual(
    [PLANS.free.seats, PLANS.free.buckets, PLANS.free.creditUsd],
    [1, 1, 0],
  );
  const paid = PLANS.early_access;
  assert.deepEqual(
    [paid.monthlyUsd, paid.creditUsd, paid.seats, paid.buckets],
    [5, 5, 5, 5],
  );
});
