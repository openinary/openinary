import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";

import { clientIp } from "./client-ip";

const app = new Hono().get("/", (c) => c.text(clientIp(c)));
const ipFor = async (peer: string, headers: Record<string, string>) =>
  (await app.request("/", { headers }, { incoming: { socket: { remoteAddress: peer } } })).text();

test("forwarding headers are ignored from a public peer (an exposed API)", async () => {
  // Rotating X-Forwarded-For used to buy a fresh rate-limit window per request.
  assert.equal(await ipFor("203.0.113.7", { "x-forwarded-for": "1.2.3.4" }), "203.0.113.7");
  assert.equal(await ipFor("203.0.113.7", { "x-real-ip": "1.2.3.4" }), "203.0.113.7");
});

test("forwarding headers are believed from a private peer (the bundled nginx)", async () => {
  assert.equal(await ipFor("127.0.0.1", { "x-forwarded-for": "1.2.3.4, 10.0.0.2" }), "1.2.3.4");
  assert.equal(await ipFor("::ffff:172.18.0.3", { "x-real-ip": "1.2.3.4" }), "1.2.3.4");
  assert.equal(await ipFor("127.0.0.1", {}), "127.0.0.1");
});
