import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { remoteSourceUrl, prepareSourceFile } from "./transform-helpers";

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
  delete process.env.ALLOW_REMOTE_SOURCE;
  assert.equal(
    remoteSourceUrl(ctx({ "x-openinary-source-url": SIGNED })),
    undefined,
  );

  process.env.ALLOW_REMOTE_SOURCE = "false";
  assert.equal(
    remoteSourceUrl(ctx({ "x-openinary-source-url": SIGNED })),
    undefined,
  );

  process.env.ALLOW_REMOTE_SOURCE = "true";
  assert.equal(remoteSourceUrl(ctx({ "x-openinary-source-url": SIGNED })), SIGNED);
});

test("only https is accepted, and malformed URLs are refused", () => {
  process.env.ALLOW_REMOTE_SOURCE = "true";
  // The URL carries its authorization in the query string; plaintext would put
  // a working signature on the wire.
  assert.equal(
    remoteSourceUrl(ctx({ "x-openinary-source-url": "http://s3.example.com/a" })),
    undefined,
  );
  // Anything that isn't a URL at all, including the shapes that would name a
  // local resource rather than a remote one.
  for (const bad of ["file:///etc/passwd", "not a url", "/etc/passwd", ""]) {
    assert.equal(
      remoteSourceUrl(ctx({ "x-openinary-source-url": bad })),
      undefined,
      `refused: ${bad}`,
    );
  }
  assert.equal(remoteSourceUrl(ctx({})), undefined, "no header, no source");
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

  try {
    const staged = await prepareSourceFile(
      storage,
      "photos/a.png",
      "./public/photos/a.png",
      SIGNED,
    );
    assert.equal(asked, SIGNED);
    assert.match(staged, /^\.?\/?temp\//, "staged under ./temp");
    assert.deepEqual([...(await readFile(staged))], [1, 2, 3, 4]);
    await rm(staged, { force: true });
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
      () => prepareSourceFile(null, "photos/a.png", "./public/a.png", SIGNED),
      /403/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
