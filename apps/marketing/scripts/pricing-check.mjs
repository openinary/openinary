// Self-check for the homepage cost comparison.
// Run: pnpm --filter marketing pricing:check
//
// Guards the arithmetic the marketing claim rests on: a workload inside the
// free quotas costs nothing, plan selection picks the cheapest covering tier,
// going past the top tier adds overage rather than silently capping, and cost
// never falls as usage rises. Imports lib/pricing.ts directly, so it tests the
// code the page actually runs.
import assert from "node:assert/strict";

import {
  cloudinaryCost,
  freeQuotas,
  openinaryCloudCost,
  plans,
  selfHostedCost,
  usageForPlan,
} from "../lib/pricing.ts";

const sorted = [...plans].sort((a, b) => a.credits - b.credits);
const top = sorted[sorted.length - 1];

// A workload sitting exactly on the free quotas is free. The boundary is
// inclusive: charging at the quota would contradict the FAQ copy.
const atQuota = {
  storageGb: freeQuotas.storageGb,
  transformations: freeQuotas.transformations,
  videoMinutes: freeQuotas.videoMinutes,
  cdnRequests: freeQuotas.cdnRequests,
};
assert.equal(
  openinaryCloudCost(atQuota).monthlyUsd,
  0,
  "usage exactly at the free quotas must cost nothing",
);
assert.equal(openinaryCloudCost(atQuota).planName, "Free plan");

// Past a quota it must actually bill, on each dimension independently.
for (const [key, bump] of [
  ["storageGb", 10],
  ["transformations", 10000],
  ["videoMinutes", 60],
  ["cdnRequests", 100000],
]) {
  assert.ok(
    openinaryCloudCost({ ...atQuota, [key]: atQuota[key] + bump }).monthlyUsd > 0,
    `${key} past its quota must be billed`,
  );
}

// A tiny workload lands on Cloudinary's free tier, not a paid one.
assert.equal(
  cloudinaryCost({
    storageGb: 1,
    transformations: 1000,
    videoMinutes: 5,
    cdnRequests: 1000,
  }).monthlyUsd,
  0,
  "a tiny workload is Cloudinary Free",
);

// Each plan's own preset usage must quote that plan, not a dearer one. This is
// what makes the plan picker honest: pick Plus, see $89.
for (const plan of plans) {
  assert.equal(
    cloudinaryCost(usageForPlan(plan.id)).monthlyUsd,
    plan.monthlyUsd,
    `${plan.name}'s preset usage must quote ${plan.name}`,
  );
}

// Past the top plan the cost keeps climbing instead of flattening out.
const huge = {
  storageGb: 2000,
  transformations: 5_000_000,
  videoMinutes: 5000,
  cdnRequests: 50_000_000,
};
assert.ok(
  cloudinaryCost(huge).monthlyUsd > top.monthlyUsd,
  "workloads past the top plan must add overage",
);

// The claim the whole section exists to make.
assert.ok(
  selfHostedCost(huge).monthlyUsd < cloudinaryCost(huge).monthlyUsd,
  "self-hosting must undercut Cloudinary at scale, or the section has no point",
);

// Monotonic: more usage never costs less. Catches sign errors in the overage maths.
let previous = -1;
for (const factor of [1, 2, 10, 100, 1000, 10000]) {
  const usage = {
    storageGb: factor,
    transformations: factor * 1000,
    videoMinutes: factor,
    cdnRequests: factor * 1000,
  };
  for (const [name, cost] of [
    ["cloudinary", cloudinaryCost(usage).monthlyUsd],
    ["openinary", openinaryCloudCost(usage).monthlyUsd],
    ["self-hosted", selfHostedCost(usage).monthlyUsd],
  ]) {
    assert.ok(
      Number.isFinite(cost) && cost >= 0,
      `${name} cost must be a non-negative number (factor ${factor})`,
    );
  }
  const cost = cloudinaryCost(usage).monthlyUsd;
  assert.ok(cost >= previous, `cost must not fall as usage rises (factor ${factor})`);
  previous = cost;
}

console.log("pricing-check: ok");
