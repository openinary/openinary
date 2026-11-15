import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remoteSourceUrl } from "./delivery";
import { stageSource } from "../utils/stage-source";
import { findSource } from "../services/transform-steps";

const ctx = (headers: Record<string, string>): any => ({
  req: { header: (name: string) => headers[name.toLowerCase()] },
});

const SIGNED =
  "https://s3.example.com/bucket/photo.png?X-Amz-Signature=deadbeef";

// --- the gate -----------------------------------------------------------

// /t/* is a public route. Honouring a URL out of a request header on an
// instance that did not ask for it turns it into a fetch proxy for anything it
// can reach, so "off" has to be what happens when nobody decided otherwise.
test("a source URL is ignored unless the instance opted in", () => {
  const c = ctx({ "x-openinary-source-url": SIGNED });
  assert.equal(remoteSourceUrl(c, false), undefined);
  assert.equal(remoteSourceUrl(c, true), SIGNED);
});

test("only https is accepted, and malformed URLs are refused", () => {
  // The URL carries its authorization in the query string; plaintext would put
  // a working signature on the wire.
  assert.equal(
    remoteSourceUrl(ctx({ "x-openinary-source-url": "http://s3.example.com/a" }), true),
    undefined,
  );
  // Anything that isn't a URL at all, including the shapes that would name a
  // local resource rather than a remote one.
  for (const bad of ["file:///etc/passwd", "not a url", "/etc/passwd", ""]) {
    assert.equal(
      remoteSourceUrl(ctx({ "x-openinary-source-url": bad }), true),
      undefined,
      `refused: ${bad}`,
    );
  }
  assert.equal(remoteSourceUrl(ctx({}), true), undefined, "no header, no source");
});

// --- fetching the source ------------------------------------------------

test("a source URL is staged to a temp file, ahead of storage", async () => {
  const realFetch = globalThis.fetch;
  let asked: string | undefined;
  globalThis.fetch = (async (input: any) => {
    asked = String(input);
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
  }) as typeof fetch;

  // Storage is present and would answer - the URL has to win, or a tenant on
  // their own bucket silently gets whichever file sits at the same key in ours.
  const storage: any = {
    downloadOriginal: async () => {
      throw new Error("storage must not be read when a source URL is given");
    },
  };

  const temp = await mkdtemp(join(tmpdir(), "stage-"));
  try {
    const staged = await stageSource(storage, { public: "unused", temp }, "photos/a.png", SIGNED);
    assert.equal(asked, SIGNED);
    assert.ok(staged.path.startsWith(temp), "staged in the temp folder");
    assert.deepEqual([...(await readFile(staged.path))], [1, 2, 3, 4]);
    await staged.cleanup();
    await assert.rejects(readFile(staged.path), "cleanup removes the copy");
  } finally {
    globalThis.fetch = realFetch;
    await rm(temp, { recursive: true, force: true });
  }
});

// --- checking the source exists ----------------------------------------

// The regression this exists for. A presigned URL authorizes one method:
// SigV4 signs the verb, so a URL issued for GET answers 403 to a HEAD. Probing
// with HEAD reported every existing object as missing, and the transform never
// ran - against real S3-compatible storage, where a HEAD-signed URL would then
// have broken the download instead.
test("existence is probed with GET, never HEAD", async () => {
  const realFetch = globalThis.fetch;
  const seen: { method: string; range: string | null }[] = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    seen.push({
      method: init?.method ?? "GET",
      range: new Headers(init?.headers).get("range"),
    });
    // What Filebase, R2 and S3 all answer to a signed GET carrying a range.
    return new Response(new Uint8Array([1]), { status: 206 });
  }) as typeof fetch;

  try {
    assert.equal(await findSource(null, "unused", "photos/a.png", SIGNED), null);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "GET", "HEAD is refused by a GET-signed URL");
    assert.equal(seen[0].range, "bytes=0-0", "one byte, not the whole object");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an absent object still reads as not found", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("", { status: 404 })) as typeof fetch;
  try {
    assert.match((await findSource(null, "unused", "photos/gone.png", SIGNED)) ?? "", /404/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a source URL that fails throws instead of yielding an empty file", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("expired", { status: 403 })) as typeof fetch;
  try {
    // Silently writing a zero-byte temp file here would reach sharp as an
    // unreadable image, and the error would name the wrong thing entirely.
    await assert.rejects(
      () => stageSource(null, { public: "unused", temp: tmpdir() }, "photos/a.png", SIGNED),
      /403/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
