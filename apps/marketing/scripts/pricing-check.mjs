// Self-check for the homepage cost comparison.
// Run: pnpm --filter marketing test
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
  paidPlan,
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

// One unit past Free moves to Pay as you go, which never costs less than its
// minimum: a small workload pays exactly the minimum.
for (const key of Object.keys(atQuota)) {
  assert.equal(
    openinaryCloudCost({ ...atQuota, [key]: atQuota[key] + 1 }).monthlyUsd,
    paidPlan.monthlyUsd,
    `${key} just past Free must cost the minimum`,
  );
}

// Railway's rule, max(minimum, usage): once usage passes the included credit,
// the bill is the usage itself, on each resource independently.
// 50,000 transformations at $0.40 / 1,000 = $20.
const busy = { storageGb: 0, transformations: 50_000, videoMinutes: 0, cdnRequests: 0 };
assert.ok(
  Math.abs(openinaryCloudCost(busy).monthlyUsd - 20) < 1e-9,
  "usage past the credit is billed at the unit price",
);
for (const [key, value] of [
  ["storageGb", 200],
  ["transformations", 20_000],
  ["videoMinutes", 600],
  ["cdnRequests", 2_000_000],
]) {
  assert.ok(
    openinaryCloudCost({ ...atQuota, [key]: value }).monthlyUsd > paidPlan.monthlyUsd,
    `${key} past the included credit must be billed`,
  );
}

// The breakdown adds up to the bill, the unused minimum included.
for (const usage of [busy, { ...atQuota, storageGb: 2 }]) {
  const cost = openinaryCloudCost(usage);
  const sum = cost.lines.reduce((total, line) => total + line.usd, 0);
  assert.ok(Math.abs(sum - cost.monthlyUsd) < 1e-9, "line items must sum to the bill");
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

// Cloudinary Free's preset is our own Free allowance, so it must be free on
// both sides: if either free tier changes without the other, this fails.
assert.equal(
  openinaryCloudCost(usageForPlan("free")).monthlyUsd,
  0,
  "the Cloudinary Free preset must fit Openinary's Free plan",
);

// The presets are what the calculator opens on, so they have to look like
// numbers a person would type: leading digit, then zeros (0.5 GB included).
for (const plan of plans) {
  for (const [key, value] of Object.entries(usageForPlan(plan.id))) {
    const digits = `${value}`;
    assert.match(
      digits,
      /^0$|^0\.5$|^[1-9]5?0*$/,
      `${plan.name}'s ${key} preset is not a round number (${digits})`,
    );
  }
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

// Self-hosting has to answer to the work. Costing a flat server made these two
// dimensions free, so a million transformations quoted the same as none, which
// is the kind of number that reads as a sales pitch rather than a figure.
const idle = {
  storageGb: 10,
  transformations: 0,
  videoMinutes: 0,
  cdnRequests: 0,
};
for (const [key, busy] of [
  ["transformations", 5_000_000],
  ["videoMinutes", 20_000],
]) {
  assert.ok(
    selfHostedCost({ ...idle, [key]: busy }).monthlyUsd >
      selfHostedCost(idle).monthlyUsd,
    `self-hosted cost must rise with ${key}`,
  );
}

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
