import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePath } from "../src/lib/utils";

const BASE = "https://cdn.example.com/b/buck_1/t";

test("a path with # survives the URL it is interpolated into", () => {
  // The bug this guards: a video uploaded as "The #1 clip.mp4" produced a
  // delivery URL the browser cut at the "#", so the request that reached the
  // CDN was for "…/VAULT/The%20" and 404'd on an asset that existed.
  const path = "VAULT/The #1 clip.mp4";

  const broken = new URL(`${BASE}/${path}`);
  assert.equal(broken.pathname.endsWith(".mp4"), false);
  assert.notEqual(broken.hash, "");

  const fixed = new URL(`${BASE}/${encodePath(path)}`);
  assert.equal(fixed.hash, "");
  assert.equal(
    decodeURIComponent(fixed.pathname.slice("/b/buck_1/t/".length)),
    path,
  );
});

test("? does not start a query string", () => {
  const url = new URL(`${BASE}/${encodePath("what now?.png")}`);
  assert.equal(url.search, "");
  assert.equal(decodeURIComponent(url.pathname), "/b/buck_1/t/what now?.png");
});

test("separators are kept, everything else in a segment is encoded", () => {
  assert.equal(encodePath("a/b/c.png"), "a/b/c.png");
  assert.equal(encodePath("Vidéos/Été 2026/plage.mov"), "Vid%C3%A9os/%C3%89t%C3%A9%202026/plage.mov");
  // A literal "%" has to become "%25", or the server's decode turns
  // "50%20off.mp4" into a lookup for "50 off.mp4".
  assert.equal(encodePath("50%20off.mp4"), "50%2520off.mp4");
  assert.equal(encodePath(""), "");
});
