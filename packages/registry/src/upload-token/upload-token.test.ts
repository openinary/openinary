import assert from "node:assert/strict";
import test from "node:test";
import { signUpload } from "./upload-token";

/** Captures the single fetch signUpload makes and answers it with a valid signature. */
function stubFetch() {
  const calls: { headers: Record<string, string>; body: any }[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push({
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string),
    });
    return new Response(
      JSON.stringify({
        success: true,
        signature: "sig",
        expires: 1,
        folder: "f",
      }),
    );
  }) as typeof fetch;
  return calls;
}

test("sends a default User-Agent", async () => {
  const calls = stubFetch();
  await signUpload("https://media.example.com", "key");
  assert.match(calls[0].headers["User-Agent"], /^openinary-upload-token\//);
});

test("userAgent option overrides the default and stays out of the body", async () => {
  const calls = stubFetch();
  await signUpload("https://media.example.com", "key", {
    folder: "avatars",
    userAgent: "my-app/2.0",
  });
  assert.equal(calls[0].headers["User-Agent"], "my-app/2.0");
  assert.deepEqual(calls[0].body, { folder: "avatars" });
});
