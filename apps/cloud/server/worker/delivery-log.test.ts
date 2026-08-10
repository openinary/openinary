// Run with: npx tsx worker/delivery-log.test.ts
//
// Every assertion here is a billing rule. The activity tab and Autumn are fed
// from the same numbers this module produces, so a regression shows up twice:
// as a wrong invoice and as a log that contradicts it.

import assert from "node:assert/strict";
import {
  appendCapped,
  deliveryEvent,
  isBillableRange,
  isDashboardTraffic,
  isDelivered,
  otlpLogsBody,
  seenRecently,
} from "../api/lib/delivery-log.js";

// One playback fans out into many range requests. Only the opening one counts,
// otherwise a single view bills six times and the log shows six lines for it.
assert.equal(isBillableRange(null), true);
assert.equal(isBillableRange("bytes=0-"), true);
assert.equal(isBillableRange("bytes=0-1023"), true);
assert.equal(isBillableRange("bytes=500000-"), false);
assert.equal(isBillableRange("bytes=1024-2047"), false);

// Ranges only collapse one open stream. Opening a video URL in a browser opens
// the stream twice - once for the video document, once for the element inside
// it - and both carry the opening range, which is what billed one viewing as
// two CDN requests.
const seen = new Map<string, number>();
const t0 = 1_700_000_000_000;
assert.equal(seenRecently(seen, "ip|bkt|clip.mp4", t0), false);
assert.equal(seenRecently(seen, "ip|bkt|clip.mp4", t0 + 1_000), true);
// A different viewer, or a different asset, is a different delivery.
assert.equal(seenRecently(seen, "ip2|bkt|clip.mp4", t0 + 1_000), false);
assert.equal(seenRecently(seen, "ip|bkt|other.mp4", t0 + 1_000), false);
// The window runs from the first delivery, not the last, so a client that
// re-requests forever pays once per window instead of never.
assert.equal(seenRecently(seen, "ip|bkt|clip.mp4", t0 + 14_000), true);
assert.equal(seenRecently(seen, "ip|bkt|clip.mp4", t0 + 16_000), false);

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
  transformed: false,
};

// A cache hit is one CDN request and no transformation.
const hit = deliveryEvent({ ...base, cache: "HIT", status: 200 });
assert.deepEqual(
  { cdn: hit.cdn, img: hit.img, c: hit.c },
  { cdn: 1, img: 0, c: "HIT" },
);

// A miss that produced a derivative is both.
const miss = deliveryEvent({
  ...base,
  cache: "MISS",
  status: 200,
  transformed: true,
});
assert.deepEqual({ cdn: miss.cdn, img: miss.img }, { cdn: 1, img: 1 });

// A transform that failed wakes the container on our dime, not the customer's.
const failed = deliveryEvent({
  ...base,
  cache: "MISS",
  status: 500,
  transformed: true,
});
assert.deepEqual({ cdn: failed.cdn, img: failed.img }, { cdn: 0, img: 0 });

// Quota refusals are logged so the customer can see them, and charged nothing.
for (const status of [402, 429, 404]) {
  const refused = deliveryEvent({ ...base, cache: "NONE", status });
  assert.equal(refused.cdn, 0, `status ${status} must not bill`);
  assert.equal(refused.img, 0, `status ${status} must not bill`);
}

// The degraded original still delivered bytes, so it costs one CDN request
// and no transformation - which is exactly why it is served instead of a 402.
const original = deliveryEvent({ ...base, cache: "ORIGINAL", status: 200 });
assert.deepEqual({ cdn: original.cdn, img: original.img }, { cdn: 1, img: 0 });

// Dashboard thumbnails are our own grid fetching itself. They must cost the
// customer nothing even on a plain cache hit, or the CDN count on the plan tab
// would exceed the sum of every line the activity tab can show.
const thumb = deliveryEvent({
  ...base,
  cache: "HIT",
  status: 200,
  quiet: true,
});
assert.deepEqual({ cdn: thumb.cdn, img: thumb.img }, { cdn: 0, img: 0 });
const thumbMiss = deliveryEvent({
  ...base,
  cache: "MISS",
  status: 200,
  transformed: true,
  quiet: true,
});
assert.deepEqual(
  { cdn: thumbMiss.cdn, img: thumbMiss.img },
  { cdn: 0, img: 0 },
);

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
assert.deepEqual(
  { cdn: encoding.cdn, img: encoding.img, c: encoding.c },
  { cdn: 0, img: 0, c: "ORIGINAL" },
);

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
