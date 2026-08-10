// Self-check for the presigned upload token. No test runner in this repo:
//   pnpm -F server exec tsx worker/upload-token.check.ts
// Exits non-zero on the first failed assertion.

import assert from "node:assert/strict";

process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-anywhere-real";
const { signUploadToken, verifyUploadToken } = await import(
  "./upload-token.js"
);

const future = Math.floor(Date.now() / 1000) + 300;
const base = {
  userId: "user_1",
  bucketId: "bucket_a",
  folder: "avatars",
  expires: future,
};

// Round-trips, tenant intact.
assert.deepEqual(verifyUploadToken(signUploadToken(base)), base);

// Root folder is a valid scope, not a missing one.
const root = { ...base, folder: "" };
assert.deepEqual(verifyUploadToken(signUploadToken(root)), root);

// Expiry is enforced.
const stale = signUploadToken({
  ...base,
  expires: Math.floor(Date.now() / 1000) - 1,
});
assert.equal(verifyUploadToken(stale), null);

// The MAC covers the payload: repointing the token at another tenant's bucket
// (or another folder, or a later expiry) invalidates it. This is the property
// the whole scheme rests on - a self-hosted `folder:expires` signature would
// pass the bucket swap.
const token = signUploadToken(base);
const [payload, mac] = token.split(".");
for (const patch of [
  { b: "bucket_b" },
  { u: "user_2" },
  { f: "../etc" },
  { e: future + 86400 },
]) {
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
  const forged = Buffer.from(JSON.stringify({ ...decoded, ...patch })).toString(
    "base64url",
  );
  assert.equal(
    verifyUploadToken(`${forged}.${mac}`),
    null,
    `forged token accepted: ${JSON.stringify(patch)}`,
  );
}

// Malformed input is rejected, never thrown on - /upload feeds it raw form data.
for (const bad of [
  "",
  ".",
  "nodot",
  `${payload}.`,
  `${payload}.${"0".repeat(16)}`,
  `${payload}.${mac}extra`,
  "a.b.c",
]) {
  assert.equal(
    verifyUploadToken(bad),
    null,
    `malformed token accepted: ${JSON.stringify(bad)}`,
  );
}

// A token signed under a different secret must not verify.
const other = signUploadToken(base);
process.env.BETTER_AUTH_SECRET = "a-completely-different-secret";
assert.equal(verifyUploadToken(other), null);

console.log("upload-token: all checks passed");
