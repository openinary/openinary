// Self-check for the Cloudflare Email Sending request. No test runner in this
// repo:
//   pnpm -F server exec tsx api/lib/auth.check.ts
// Exits non-zero on the first failed assertion.
//
// It exists because nothing else exercises this path before production: local
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

console.log("auth-email: all checks passed");
