// The Cloudflare Email Sending request. It exists because nothing else exercises this path before production: local
// dev never sends (no CLOUDFLARE_EMAIL_TOKEN, the code is logged instead), so
// a wrong field name would first show up as sign-in codes that never arrive.
// The REST API and the Workers binding disagree on the sender field -
// `from.address` here, `from.email` there - and only one of them is right.

import assert from "node:assert/strict";

process.env.BETTER_AUTH_URL ??= "http://localhost:3100";
process.env.DATABASE_URL ??= "postgresql://u:p@localhost/db";
process.env.CLOUDFLARE_ACCOUNT_ID = "acct-123";
process.env.CLOUDFLARE_EMAIL_TOKEN = "token-abc";

const { sendEmail } = await import("./auth.js");

let call: { url: string; init: RequestInit } | undefined;
let reply = new Response("{}", { status: 200 });
globalThis.fetch = (async (url: string, init: RequestInit) => {
  call = { url, init };
  return reply;
}) as unknown as typeof fetch;

await sendEmail({
  to: "user@example.com",
  subject: "123456 is your Openinary sign-in code",
  text: "code: 123456",
  html: "<p>code: 123456</p>",
});

assert.ok(call, "no request was made");
assert.equal(
  call.url,
  "https://api.cloudflare.com/client/v4/accounts/acct-123/email/sending/send",
);
assert.equal(call.init.method, "POST");
assert.equal(
  (call.init.headers as Record<string, string>).Authorization,
  "Bearer token-abc",
);

const body = JSON.parse(call.init.body as string);
assert.deepEqual(body.from, {
  address: "login@openinary.dev",
  name: "Openinary",
});
assert.equal(body.to, "user@example.com");
// Both bodies, always: text-only clients render nothing otherwise, and a
// missing plain-text part costs deliverability.
assert.ok(body.text && body.html, "both text and html must be sent");

// A rejected send has to reach the caller - Better Auth turns it into a
// failed /send-verification-otp, instead of a UI that says "check your inbox"
// for an email that was never sent.
reply = new Response("sender domain not verified", { status: 403 });
await assert.rejects(
  sendEmail({ to: "user@example.com", subject: "s", text: "t", html: "h" }),
  /403/,
);

// Session store: unbound (tests, scripts) every read misses, so better-auth
// falls back to Postgres; bound, a sub-minute TTL is rounded up to KV's 60s
// floor instead of failing the write.
const { auth, bindSessionKv } = await import("./auth.js");
const store = auth.options.secondaryStorage!;
assert.equal(await store.get("token"), null);
const puts: { key: string; ttl?: number }[] = [];
bindSessionKv({
  get: async () => "cached",
  put: async (key, _value, options) => {
    puts.push({ key, ttl: options?.expirationTtl });
  },
  delete: async () => {},
});
assert.equal(await store.get("token"), "cached");
await store.set("a", "v", 5);
await store.set("b", "v", 3600);
await store.set("c", "v", undefined);
assert.deepEqual(puts, [
  { key: "a", ttl: 60 },
  { key: "b", ttl: 3600 },
  { key: "c", ttl: undefined },
]);
bindSessionKv(undefined);

console.log("auth-email: all checks passed");
