import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MEDIA_PREFIX,
  normalizeMediaPrefix,
} from "./cloud-storage";

// Kept to the pure normalizer rather than constructing a CloudStorage: the
// client opens a keep-alive HTTPS agent, which holds the event loop open and
// would hang the test run. All of the branching lives here anyway - the key
// itself is just this prefix concatenated with the delivery path.

const key = (prefix: string | undefined, path: string) =>
  `${normalizeMediaPrefix(prefix)}${path}`;

test("an unset prefix keeps the historical public/ layout", () => {
  // The default has to stay exactly where every existing deployment already
  // has its media, so this is the case worth pinning hardest.
  assert.equal(DEFAULT_MEDIA_PREFIX, "public");
  assert.equal(normalizeMediaPrefix(undefined), "public/");
  assert.equal(key(undefined, "photos/sunset.jpg"), "public/photos/sunset.jpg");
});

test("an empty prefix stores media at the bucket root", () => {
  // The point of making it configurable: serve a bucket that something else
  // already writes to, without moving a single object.
  assert.equal(normalizeMediaPrefix(""), "");
  assert.equal(key("", "photos/sunset.jpg"), "photos/sunset.jpg");
});

test("a custom prefix is normalized to exactly one trailing slash", () => {
  for (const input of ["media", "media/", "/media", "/media/", "  media  ", "//media//"]) {
    assert.equal(
      normalizeMediaPrefix(input),
      "media/",
      `input: ${JSON.stringify(input)}`,
    );
  }
  assert.equal(normalizeMediaPrefix("a/b"), "a/b/");
});

test("a whitespace-only prefix is empty, not a folder named ' '", () => {
  assert.equal(normalizeMediaPrefix("   "), "");
  assert.equal(normalizeMediaPrefix("/"), "");
});

test("keys never gain a doubled or leading slash", () => {
  for (const prefix of [undefined, "", "media", "/media/", "a/b"]) {
    const composed = key(prefix, "a/b.png");
    assert.ok(!composed.includes("//"), `doubled slash: ${composed}`);
    assert.ok(!composed.startsWith("/"), `leading slash: ${composed}`);
  }
});

test("a prefix inside a reserved namespace is rejected", () => {
  // cache/ is swept by cache cleanup, which lists and deletes everything under
  // it, so media configured in there would be deleted out from under itself.
  for (const bad of ["cache", "cache/media", "/cache/", "  cache  ", ".openinary", ".openinary/x"]) {
    assert.throws(
      () => normalizeMediaPrefix(bad),
      /reserved/,
      `expected ${JSON.stringify(bad)} to be rejected`,
    );
  }
});

test("a prefix that merely looks reserved is fine", () => {
  // Only the first whole segment counts, and S3 keys are case-sensitive.
  for (const ok of ["caches", "cache-media", "mycache", "Cache", "media/cache"]) {
    assert.equal(normalizeMediaPrefix(ok), `${ok}/`, `input: ${ok}`);
  }
});
