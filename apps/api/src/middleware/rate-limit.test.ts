import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";

import { publicRateLimit } from "./rate-limit";

// Regression: with no proxy header the limiter used to let everything through.
test("a caller without forwarding headers is still limited", async () => {
  const app = new Hono().get("/", publicRateLimit, (c) => c.text("ok"));
  let last = 0;
  for (let i = 0; i <= 100; i++) last = (await app.request("/")).status;
  assert.equal(last, 429);
});
