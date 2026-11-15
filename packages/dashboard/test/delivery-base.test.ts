import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveDeliveryBase } from "../src/hooks/use-delivery-base";

const origin = "https://media.example.com";

test("an empty base (same-origin Docker) is the page's origin", () => {
  assert.equal(resolveDeliveryBase("", origin), origin);
});

test("a path base resolves against the origin", () => {
  assert.equal(resolveDeliveryBase("/api", origin), `${origin}/api`);
});

test("an absolute base is kept, without its trailing slash", () => {
  assert.equal(resolveDeliveryBase("https://cdn.example.com/", origin), "https://cdn.example.com");
  assert.equal(resolveDeliveryBase("https://cdn.example.com/b/123", undefined), "https://cdn.example.com/b/123");
});

test("null while the base, or the origin a relative one needs, is unknown", () => {
  assert.equal(resolveDeliveryBase(null, origin), null);
  assert.equal(resolveDeliveryBase("", undefined), null);
});
