// Run with: npx tsx worker/signup-attribution.test.ts
//
// This parses a cookie posthog-js writes and we do not own. Every assertion
// below is either the shape we read from it or the promise that a surprise in
// it costs analytics, never a signup.

import assert from "node:assert/strict";
import { signupAttribution } from "../api/lib/analytics.js";

const cookie = (info: unknown, name = "ph_phc_test_posthog") =>
  `${name}=${encodeURIComponent(JSON.stringify({ distinct_id: "0198", $initial_person_info: info }))}`;

// The whole point: a visitor who landed on the marketing site from Product
// Hunt signs up on app.openinary.dev, and the event says so.
const launch = signupAttribution(
  cookie({
    r: "https://www.producthunt.com/posts/openinary",
    u: "https://www.openinary.dev/?utm_source=producthunt&utm_medium=launch",
  }),
);
assert.equal(launch.$referring_domain, "www.producthunt.com");
assert.equal(launch.$referrer, "https://www.producthunt.com/posts/openinary");
assert.equal(launch.utm_source, "producthunt");
assert.equal(launch.utm_medium, "launch");
// Same values on the person, under PostHog's $initial_ names, so the origin
// survives a client that never gets to call identify().
assert.deepEqual(launch.$set_once, {
  $initial_referrer: "https://www.producthunt.com/posts/openinary",
  $initial_referring_domain: "www.producthunt.com",
  $initial_utm_source: "producthunt",
  $initial_utm_medium: "launch",
});

// "$direct" is posthog-js's sentinel, not a URL. It has to survive as-is:
// "typed the address in" is an answer, and new URL() would throw on it.
assert.equal(
  signupAttribution(cookie({ r: "$direct", u: "https://app.openinary.dev/" }))
    .$referring_domain,
  "$direct",
);

// The cookie sits among the session cookies, never alone, and a cookie whose
// name merely ends the same way is not it.
assert.equal(
  signupAttribution(
    `better-auth.session_token=abc; ${cookie({ r: "https://news.ycombinator.com/", u: "https://www.openinary.dev/" })}; other=1`,
  ).$referring_domain,
  "news.ycombinator.com",
);
assert.deepEqual(
  signupAttribution(cookie({ r: "https://x.com/" }, "not_ph_phc_test_posthog")),
  {},
);

// No cookie, no PostHog cookie, a cookie that predates $initial_person_info,
// and outright garbage all mean the same thing: no attribution, no throw.
// This runs inside the signup path - it may never be the reason one fails.
assert.deepEqual(signupAttribution(undefined), {});
assert.deepEqual(signupAttribution("better-auth.session_token=abc"), {});
assert.deepEqual(signupAttribution(cookie(undefined)), {});
assert.deepEqual(signupAttribution("ph_phc_test_posthog=%7Bnot-json"), {});
assert.deepEqual(signupAttribution(cookie({ r: "not a url" })), {});
assert.deepEqual(signupAttribution(cookie({ r: { evil: true } })), {});

// A forged cookie is still a request header. posthog-js caps both fields at
// 1000 chars; so do we, rather than forwarding whatever was sent.
const long = signupAttribution(
  cookie({ r: `https://spam.example/${"a".repeat(5000)}` }),
);
assert.equal((long.$referrer as string).length, 1000);
assert.equal(long.$referring_domain, "spam.example");

console.log("signup-attribution: ok");
