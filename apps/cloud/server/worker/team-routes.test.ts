// The team router behind oRPC: nothing reaches it without a session. Decided
// before any query, so it needs no database.

import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ??= "check-secret-long-enough-to-not-warn-xx";
process.env.BETTER_AUTH_URL ??= "http://localhost:3100";
process.env.CORS_ORIGIN ??= "https://app.openinary.dev";
process.env.DATABASE_URL ??= "postgresql://u:p@localhost/db";

const { app } = await import("./app.js");

const env = {} as unknown as Env;
const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

for (const procedure of [
  "overview",
  "members",
  "invite",
  "setRole",
  "remove",
  "cancelInvitation",
  "setActive",
]) {
  const res = await app.request(
    `/api/rpc/team/${procedure}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.openinary.dev",
      },
      body: JSON.stringify({ json: {} }),
    },
    env,
    ctx,
  );
  assert.equal(res.status, 401, `team.${procedure} without a session`);
}

console.log("team routes: ok");
