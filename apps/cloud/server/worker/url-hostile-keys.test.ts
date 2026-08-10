// Run with: pnpm -F server test
//
// Reported as "one of the videos isn't working": an asset uploaded as
// "The #1 Most ... [wfGghA2NQUg].mp4" delivered a CDN URL that every browser
// truncated at the "#", so the request that actually reached the Worker was
// for "…/VAULT/The%20" - a 404 on a file that exists.
//
// The readers are the ones that interpolate a key into a URL (@openinary/ui's
// copy button and grid thumbnails, the playground, the customer's own
// <video src>), and most of them are outside this repo, so the guard lives on
// the write side instead: stripUrlHostile runs on every name that becomes an
// R2 key. What this pins is the property that made the bug possible - a key
// this function returns must survive the encode/deliver/decode round trip
// unchanged - plus the fact that it only removes what it has to.

import assert from "node:assert/strict";
import { stripUrlHostile } from "./r2-storage.js";

// How a delivery URL is built and then read back: callers encode per segment
// (apps/web/src/lib/thumbnails, the /upload echo), the browser parses, and
// worker/index.ts's parseCdnRequest decodes per segment.
const roundTrip = (key: string): string => {
  const url = new URL(
    `https://cdn.openinary.dev/b/buck_1/t/${key
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  );
  return url.pathname
    .slice("/b/buck_1/t/".length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
};

// The reported file. "#" is what broke it; the brackets never did.
assert.equal(
  stripUrlHostile("The #1 Most sland [wfGghA2NQUg].mp4"),
  "The 1 Most sland [wfGghA2NQUg].mp4",
);

// "?" would start a query string, "%" would decode into a different key
// ("50%20off" read back as "50 off") - both as unaddressable as "#".
assert.equal(stripUrlHostile("50% off? maybe.mp4"), "50 off maybe.mp4");
assert.equal(stripUrlHostile("a\u0000b\u001fc.png"), "abc.png");

// Kept: spaces, accents, brackets, "+", "&", "'" all survive a URL fine, and
// mangling them would rename files for no reason.
for (const name of [
  "La Marée.png",
  "clip [final].mp4",
  "a+b & c's.jpg",
  "Vidéos/Été 2026/plage.mov",
]) {
  assert.equal(stripUrlHostile(name), name);
}

// The property the bug violated: whatever survives the strip must come back
// out of a real URL byte-identical.
for (const raw of [
  "The #1 Most sland [wfGghA2NQUg].mp4",
  "OPTIMIZED/VAULT/50% off? maybe.mp4",
  "Vidéos/Été 2026/plage.mov",
]) {
  const key = stripUrlHostile(raw);
  assert.equal(roundTrip(key), key, `round trip changed "${key}"`);
}

// And the pre-fix behaviour, so this stays a regression test rather than a
// tautology: the raw name does NOT survive - everything past "#" is a
// fragment the CDN never receives.
assert.notEqual(
  new URL(
    "https://cdn.openinary.dev/b/buck_1/t/VAULT/The #1 Most sland.mp4",
  ).pathname.endsWith(".mp4"),
  true,
);

console.log("url-hostile-keys tests passed");
