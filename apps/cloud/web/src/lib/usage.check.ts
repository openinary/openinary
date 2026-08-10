// Self-check for usageRatio, which decides whether the sidebar shows a quiet
// button or the full upsell. No test runner in this repo, and tsx is only
// installed in the server workspace - run from the repo root:
//   ./apps/server/node_modules/.bin/tsx apps/web/src/lib/usage.check.ts
// Exits non-zero on the first failed assertion.

import assert from "node:assert/strict";

import { type Balance, usageRatio } from "./usage.js";

const balance = (
  used: number,
  granted: number,
  unlimited = false,
): Balance => ({
  used,
  granted,
  unlimited,
});

// Nothing to measure yet.
assert.equal(usageRatio(undefined), 0);
assert.equal(usageRatio({}), 0);

// The worst feature wins, not the average - a nearly-spent allowance must not
// be hidden by three idle ones.
assert.equal(
  usageRatio({
    storage_mb: balance(10, 100),
    image_transformations: balance(90, 100),
    video_processing_seconds: balance(0, 100),
    cdn_requests: balance(5, 100),
  }),
  0.9,
);

// Unlimited features contribute nothing rather than dividing.
assert.equal(usageRatio({ cdn_requests: balance(500, 0, true) }), 0);

// granted 0 must not divide - Infinity here would pin the upsell on forever.
assert.equal(usageRatio({ cdn_requests: balance(5, 0) }), 0);
assert.equal(usageRatio({ cdn_requests: balance(0, 0) }), 0);

// An overage reads above 1 rather than clamping, so callers can tell "at the
// limit" from "well past it".
assert.equal(usageRatio({ storage_mb: balance(150, 100) }), 1.5);

// Keys outside the known feature list are ignored.
assert.equal(usageRatio({ not_a_feature: balance(99, 100) }), 0);

// The threshold the sidebar uses sits where expected either side of it.
assert.ok(usageRatio({ cdn_requests: balance(34, 100) }) < 0.35);
assert.ok(usageRatio({ cdn_requests: balance(36, 100) }) >= 0.35);

console.log("usage.check.ts: all assertions passed");
