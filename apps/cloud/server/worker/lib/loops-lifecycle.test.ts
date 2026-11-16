// The three decisions the daily sync makes on its own, none of which anyone
// sees until an email either arrives when it shouldn't or never arrives at
// all. Sending is the whole failure mode here: a wrong answer below writes
// itself into somebody's inbox and cannot be taken back.

import assert from "node:assert/strict";
import type { FeatureId } from "@openinary/plans";
import type { FeatureUsage } from "./billing.js";
import {
  crossedInactivity,
  daysUntil,
  firstNameOf,
  nextResetAt,
} from "./lifecycle.js";

const DAY = 86_400_000;

// A greeting is the first thing in every one of these emails, so an address
// that leaked into `name` must not become "Hi flo.heysen@gmail.com".
assert.equal(firstNameOf("Florian Heysen"), "Florian");
assert.equal(firstNameOf("florian.heysen@gmail.com"), "florian");
assert.equal(firstNameOf("  Florian  "), "Florian");
assert.equal(firstNameOf("jean-luc@example.com"), "jean");
assert.equal(firstNameOf(""), "");

const feature = (over: Partial<FeatureUsage> = {}): FeatureUsage => ({
  granted: 100,
  used: 0,
  remaining: 100,
  unlimited: false,
  resetsAt: null,
  ...over,
});

const features = (
  over: Partial<Record<FeatureId, FeatureUsage>> = {},
): Record<FeatureId, FeatureUsage> => ({
  storage_mb: feature(),
  image_transformations: feature(),
  video_processing_seconds: feature(),
  cdn_requests: feature(),
  ...over,
});

// Fires on the day the account crosses fourteen, and on no other day. The
// daily cron re-asks this every 24h, so "greater than" here would mail the
// same person every morning until they came back.
const now = Date.UTC(2026, 7, 1);
assert.equal(crossedInactivity(new Date(now - 13 * DAY), now), false);
assert.equal(crossedInactivity(new Date(now - 14 * DAY), now), true);
// Still the same calendar day, a few hours later: floor keeps it at 14.
assert.equal(
  crossedInactivity(new Date(now - 14 * DAY - 3 * 3_600_000), now),
  true,
);
assert.equal(crossedInactivity(new Date(now - 15 * DAY), now), false);
assert.equal(crossedInactivity(new Date(now), now), false);

// The near-limit email promises a reset, so the date it quotes has to be one
// that exists. Storage is cumulative and never resets, so the account most
// likely to trigger that email is exactly the one whose worst feature has no
// date - taking the soonest monthly refill instead is what keeps the sentence
// true.
assert.equal(
  nextResetAt(
    features({
      storage_mb: feature({ used: 95, resetsAt: null }),
      cdn_requests: feature({ resetsAt: Date.UTC(2026, 7, 20) }),
      image_transformations: feature({ resetsAt: Date.UTC(2026, 7, 12) }),
    }),
  ),
  Date.UTC(2026, 7, 12),
);
// Nothing resets at all: the caller falls back rather than printing a date.
assert.equal(nextResetAt(features()), null);

// "Your limits reset in X days" - rounded up, because a reset 12 hours out is
// tomorrow, not today, and 0 would read as "already reset".
assert.equal(daysUntil(now + 3 * DAY, now), 3);
assert.equal(daysUntil(now + DAY / 2, now), 1);
assert.equal(daysUntil(now - DAY, now), 0);
// Storage never resets, so the near-limit email must not promise it will.
assert.equal(daysUntil(null, now), null);
assert.equal(daysUntil(Number.NaN, now), null);

console.log("loops-lifecycle.test.ts: ok");
