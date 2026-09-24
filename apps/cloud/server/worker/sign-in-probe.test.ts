// Run with: npx tsx worker/sign-in-probe.test.ts
//
// The hourly sign-in canary pages a human, so both directions matter: a blip
// must not alert, and an outage must.

import assert from "node:assert/strict";
import { probeSignIn } from "../api/lib/sign-in-probe.js";

const options = {
  authUrl: "https://cdn.example.dev",
  origin: "https://app.example.dev",
  sleep: async () => {},
};

function sender(...answers: (Response | Error)[]) {
  const seen: Request[] = [];
  const send = async (request: Request) => {
    seen.push(request);
    const answer = answers[seen.length - 1];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { send, seen };
}

// Healthy: one request, no alert, and it is the dashboard's exact call.
{
  const { send, seen } = sender(Response.json({ url: "https://accounts" }));
  assert.equal(await probeSignIn(send, options), null);
  assert.equal(seen.length, 1);
  const [request] = seen;
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://cdn.example.dev/api/auth/sign-in/social");
  assert.equal(request.headers.get("origin"), "https://app.example.dev");
  assert.deepEqual(await request.json(), {
    provider: "google",
    callbackURL: "https://app.example.dev",
    disableRedirect: true,
  });
}

// One failed attempt followed by a good one is a blip, not an outage.
{
  const { send, seen } = sender(
    new Response("error code: 522", { status: 522 }),
    Response.json({ url: "https://accounts" }),
  );
  assert.equal(await probeSignIn(send, options), null);
  assert.equal(seen.length, 2);
}

// A throw counts as a failure and is retried too.
{
  const { send } = sender(new Error("neon cold"), Response.json({}));
  assert.equal(await probeSignIn(send, options), null);
}

// Every attempt failing still alerts, with the last status and body.
{
  const { send, seen } = sender(
    new Response("", { status: 500 }),
    new Response("boom", { status: 500 }),
  );
  assert.equal(
    await probeSignIn(send, options),
    "POST /api/auth/sign-in/social -> 500 boom (2 attempts)",
  );
  assert.equal(seen.length, 2);
}

{
  const { send } = sender(new Error("x"), new Error("db down"));
  assert.equal(
    await probeSignIn(send, options),
    "POST /api/auth/sign-in/social -> threw Error: db down (2 attempts)",
  );
}

console.log("sign-in-probe: ok");
