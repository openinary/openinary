// Self-check for /upload's middleware wiring. No test runner in this repo:
//   pnpm -F server exec tsx worker/upload-routes.check.ts
//
// This exists because Hono's "/upload/*" also matches the bare "/upload",
// which silently put requireTenant (and mediaCors) back in front of the
// presigned path - a 401 that looked identical to a genuine auth failure.
// It needs no DB: every case is decided before the first query.

import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ??= "check-secret-long-enough-to-not-warn-xx";
process.env.BETTER_AUTH_URL ??= "http://localhost:3100";
process.env.CORS_ORIGIN ??= "https://app.openinary.dev";
process.env.DATABASE_URL ??= "postgresql://u:p@localhost/db";

const { app } = await import("./app.js");
const { signUploadToken } = await import("./upload-token.js");

const now = () => Math.floor(Date.now() / 1000);
const token = (
  over: Partial<{
    userId: string;
    bucketId: string;
    folder: string;
    expires: number;
  }> = {},
) =>
  signUploadToken({
    userId: "u",
    bucketId: "b",
    folder: "",
    expires: now() + 300,
    ...over,
  });

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

async function post(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const res = await app.request(
    new Request("http://x/upload", {
      method: "POST",
      body: form(fields),
      headers,
    }),
  );
  return { res, body: (await res.json()) as { error?: string } };
}

// Reaching the handler at all is the property under test: requireTenant answers
// {error} with no `success` key, the handler always sets `success: false`.
{
  const { res, body } = await post({ signature: "abc.def" });
  assert.equal(res.status, 401);
  assert.equal(
    body.error,
    "Invalid or expired upload signature",
    "bare /upload is behind a tenant middleware again",
  );
}
{
  const { body } = await post({ signature: token({ expires: now() - 5 }) });
  assert.equal(body.error, "Invalid or expired upload signature");
}
// A valid token authenticates on its own - no session, no API key. 400 (not
// 401) is the proof: it got past auth and failed on an empty file list.
{
  const { res, body } = await post({ signature: token() });
  assert.equal(
    res.status,
    400,
    "a valid presigned token no longer authenticates",
  );
  assert.equal(body.error, "No files uploaded");
}
// Unauthenticated requests still stop at the handler's own check.
{
  const { res, body } = await post({ folder: "x" });
  assert.equal(res.status, 401);
  assert.equal(body.error, "Unauthorized");
}

// CORS: cookieless uploads come from arbitrary customer domains and are
// authorized by the token, so their origin is reflected. Cookie-bearing ones
// stay pinned to CORS_ORIGIN so no third-party page can ride a session.
{
  const { res } = await post(
    { folder: "x" },
    { Origin: "http://localhost:3101" },
  );
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "http://localhost:3101",
  );
}
{
  const { res } = await post(
    { folder: "x" },
    { Origin: "http://evil.test", Cookie: "session=1" },
  );
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    process.env.CORS_ORIGIN,
  );
}

// /upload/sign must stay backend-only.
{
  const res = await app.request(
    new Request("http://x/upload/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(res.status, 401);
}

console.log("upload-routes: all checks passed");
