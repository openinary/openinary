// Self-check for the 402 quota copy. No test runner in this repo:
//   pnpm -F server exec tsx api/lib/autumn.check.ts
// Exits non-zero on the first failed assertion.

import assert from "node:assert/strict";

process.env.CORS_ORIGIN ??= "https://app.openinary.dev";
const { quotaErrorBody, UPGRADE_PLAN } = await import("./autumn.js");

// Free is hard-blocked: point it at whatever is currently on sale. Asserted
// against UPGRADE_PLAN so flipping Cloud back on doesn't need this edited.
const free = quotaErrorBody("image_transformations", "free", "Free");
assert.ok(free.error.includes(UPGRADE_PLAN.cta));
assert.match(free.error, /monthly allowance to reset/);
assert.equal(free.planUrl, "https://app.openinary.dev/?settings=plan");

// A metered account must never be sold the plan it already has, whichever plan
// that is - the Free call-to-action must never appear on a paid body.
for (const paid of [
  quotaErrorBody("image_transformations", "cloud", "Cloud"),
  quotaErrorBody("cdn_requests", "early_access", "Alpha"),
  quotaErrorBody("video_processing_seconds", "enterprise", "Enterprise"),
]) {
  assert.doesNotMatch(paid.error, /Upgrade|Free/);
  assert.ok(!paid.error.includes(UPGRADE_PLAN.cta));
}
assert.match(
  quotaErrorBody("image_transformations", "cloud", "Cloud").error,
  /on the Cloud plan/,
);

// Storage never resets, so it must not promise it will.
assert.doesNotMatch(
  quotaErrorBody("storage_mb", "free", "Free").error,
  /reset/,
);

// Unknown plan (Autumn lookup failed) degrades to the Free wording.
assert.match(quotaErrorBody("cdn_requests", null, null).error, /Free plan/);

console.log("autumn: quota copy ok");
