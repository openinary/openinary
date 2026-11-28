// The 402 quota copy, and the storage rounding behind storage_mb.

import assert from "node:assert/strict";

process.env.CORS_ORIGIN ??= "https://app.openinary.dev";
const { quotaErrorBody, storageMbDelta, UPGRADE_PLAN } = await import(
  "./billing.js"
);

// Free is hard-blocked: point it at whatever is currently on sale. Asserted
// against UPGRADE_PLAN so flipping Cloud back on doesn't need this edited.
const free = quotaErrorBody("image_transformations", "free", "Free");
assert.ok(free.error.includes(UPGRADE_PLAN.cta));
assert.match(free.error, /monthly allowance to reset/);
assert.equal(free.planUrl, "https://app.openinary.dev/?settings=plan");

// A metered account must never be sold the plan it already has, whichever plan
// that is - the Free call-to-action must never appear on a paid body.
for (const paid of [
  quotaErrorBody("cdn_requests", "early_access", "Pay as you go"),
  quotaErrorBody("video_processing_seconds", "enterprise", "Enterprise"),
]) {
  assert.doesNotMatch(paid.error, /Upgrade|Free/);
  assert.ok(!paid.error.includes(UPGRADE_PLAN.cta));
}
assert.match(
  quotaErrorBody("image_transformations", "early_access", "Pay as you go").error,
  /on the Pay as you go plan/,
);

// Storage never resets, so it must not promise it will.
assert.doesNotMatch(
  quotaErrorBody("storage_mb", "free", "Free").error,
  /reset/,
);

// Unknown plan (Autumn lookup failed) degrades to the Free wording.
assert.match(quotaErrorBody("cdn_requests", null, null).error, /Free plan/);

// Storage is billed in whole megabytes from a running byte total. Uploading
// files in one batch and deleting them one by one has to come back to zero:
// rounding each call on its own is what used to drift.
{
  const MB = 1024 * 1024;
  const files = [0.4 * MB, 0.4 * MB, 0.4 * MB];
  let total = 0;
  let billed = 0;
  const change = (bytes: number) => {
    billed += storageMbDelta(total, bytes);
    total += bytes;
  };
  change(files.reduce((a, b) => a + b, 0));
  assert.equal(billed, 1);
  for (const size of files) change(-size);
  assert.equal(billed, 0, "per-batch upload and per-file delete drifted");
}

console.log("billing: ok");
