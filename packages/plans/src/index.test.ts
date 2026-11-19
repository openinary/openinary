import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type Balance,
  FEATURES,
  PLANS,
  formatGrant,
  formatOverage,
  usageCost,
  usageRatio,
} from "./index.ts";

const balance = (used: number, granted: number, unlimited = false): Balance => ({
  used,
  granted,
  unlimited,
});

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

test("usageRatio reads above 1 on an overage instead of clamping", () => {
  assert.equal(usageRatio({ storage_mb: balance(150, 100) }), 1.5);
});

test("usageCost bills only past the grant, at the quoted rate", () => {
  assert.equal(usageCost({ image_transformations: balance(1000, 1000) }), 0);
  assert.ok(
    Math.abs(usageCost({ image_transformations: balance(2000, 1000) }) - 0.4) <
      1e-9,
  );
});

// What the dashboard and marketing show today; a catalog edit that changes one
// of these is a visible pricing change and should be deliberate.
test("allowances and overage render as the plan tab shows them", () => {
  const rendered = FEATURES.map((feature) => [
    formatGrant(feature, "free"),
    formatGrant(feature, "early_access"),
    formatGrant(feature, "cloud"),
    formatOverage(feature),
  ]);
  assert.deepEqual(rendered, [
    ["1 GB", "2 GB", "100 GB", "$0.03 / extra GB"],
    ["500 / mo", "1,000 / mo", "50,000 / mo", "$0.40 / 1,000"],
    ["15 min / mo", "30 min / mo", "500 min / mo", "$0.01 / min"],
    ["25,000 / mo", "50,000 / mo", "1,500,000 / mo", "$0.50 / 100,000"],
  ]);
});

// Seats are owner included: Free stays solo, paid plans get a small team.
test("seats per plan", () => {
  assert.equal(PLANS.free.seats, 1);
  assert.equal(PLANS.early_access.seats, 3);
  assert.equal(PLANS.cloud.seats, 3);
});
