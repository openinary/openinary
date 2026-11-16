// Every assertion here is a billing rule. The activity tab and Autumn are fed
// from the same numbers this module produces, so a regression shows up twice:
// as a wrong invoice and as a log that contradicts it.

import assert from "node:assert/strict";
import {
  appendCapped,
  deliveryEvent,
  isDashboardTraffic,
  isDelivered,
  otlpLogsBody,
} from "./delivery-log.js";

// Bytes delivered, or nothing charged.
assert.equal(isDelivered(200), true);
assert.equal(isDelivered(206), true);
assert.equal(isDelivered(304), true);
assert.equal(isDelivered(402), false);
assert.equal(isDelivered(404), false);
assert.equal(isDelivered(429), false);
assert.equal(isDelivered(500), false);

const base = {
  now: 1_700_000_000_000,
  bucketId: "bkt",
  path: "photos/cat.png",
  kind: "image" as const,
};

// A cache hit is one CDN request.
const hit = deliveryEvent({ ...base, cache: "HIT", status: 200 });
assert.deepEqual({ cdn: hit.cdn, c: hit.c }, { cdn: 1, c: "HIT" });

// A container that failed delivered nothing, so it costs the customer nothing.
const failed = deliveryEvent({ ...base, cache: "MISS", status: 500 });
assert.equal(failed.cdn, 0);

// Quota refusals are logged so the customer can see them, and charged nothing.
for (const status of [402, 429, 404]) {
  const refused = deliveryEvent({ ...base, cache: "NONE", status });
  assert.equal(refused.cdn, 0, `status ${status} must not bill`);
}

// The degraded original still delivered bytes, so it costs one CDN request -
// which is exactly why it is served instead of a 402.
assert.equal(deliveryEvent({ ...base, cache: "ORIGINAL", status: 200 }).cdn, 1);

// Dashboard thumbnails are our own grid fetching itself. They must cost the
// customer nothing even on a plain cache hit, or the CDN count on the plan tab
// would exceed the sum of every line the activity tab can show.
const thumb = deliveryEvent({
  ...base,
  cache: "HIT",
  status: 200,
  quiet: true,
});
assert.equal(thumb.cdn, 0);

// While a transcode runs, core streams the untransformed original. Nobody
// asked for those - the dashboard's preload triggers them, and a fresh ETag
// per response defeats revalidation - so they are quiet: PostHog keeps them,
// the customer's tab never shows them, and they cost nothing.
const encoding = deliveryEvent({
  ...base,
  kind: "video",
  cache: "ORIGINAL",
  status: 200,
  quiet: true,
});
assert.deepEqual({ cdn: encoding.cdn, c: encoding.c }, { cdn: 0, c: "ORIGINAL" });

// Paths are truncated so 500 rows stay inside one storage value.
const long = deliveryEvent({
  ...base,
  path: "a".repeat(400),
  cache: "HIT",
  status: 200,
});
assert.equal(long.p.length, 120);

// The ring drops from the front, keeping the newest.
let ring: number[] = [];
for (let i = 0; i < 5; i++) ring = appendCapped(ring, i, 3);
assert.deepEqual(ring, [2, 3, 4]);

// OTLP: int64 fields are strings in proto3's JSON mapping, and a receiver that
// gets a bare number drops the attribute.
const body = otlpLogsBody("user_1", [hit, failed]);
const records = body.resourceLogs[0].scopeLogs[0].logRecords;
assert.equal(records.length, 2);
assert.equal(records[0].timeUnixNano, "1700000000000000000");
assert.equal(records[0].severityText, "INFO");
assert.equal(records[1].severityText, "ERROR");
const userAttr = records[0].attributes.find((a) => a.key === "user_id");
assert.deepEqual(userAttr?.value, { stringValue: "user_1" });
const cdnAttr = records[0].attributes.find((a) => a.key === "cdn_requests");
assert.deepEqual(cdnAttr?.value, { intValue: "1" });

// Our own dashboard looking at an asset is not a public delivery. Origin comes
// from @openinary/ui's fetches, Referer from the <img> the details panel
// renders - and the Referer is a full page URL, so only its origin may be
// compared.
const DASH = "https://app.openinary.dev";
assert.equal(isDashboardTraffic(DASH, null, DASH), true);
assert.equal(isDashboardTraffic(null, `${DASH}/?asset=hero.jpg`, DASH), true);
// A customer's site is what this must never catch: their traffic is the
// traffic they are billed for, and the one thing "serve your first request"
// is waiting to see.
assert.equal(isDashboardTraffic("https://shop.example.com", null, DASH), false);
// A prefix of our origin is a different origin - app.openinary.dev.evil.com
// must not buy free delivery.
assert.equal(
  isDashboardTraffic("https://app.openinary.dev.evil.com", null, DASH),
  false,
);
// Nothing to compare against, or nothing comparable: bill it, which is what
// happened before any of this existed.
assert.equal(isDashboardTraffic(null, null, DASH), false);
assert.equal(isDashboardTraffic(DASH, null, undefined), false);
assert.equal(isDashboardTraffic("null", null, DASH), false);

console.log("delivery-log: ok");
