import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { respond, transformOutcome } from "./delivery";
import type { TransformResult } from "../services/transform.service";
import { createAuthenticatedRoute } from "./authenticated";
import { generateSignature } from "../utils/signature";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enginePathsIn } from "../config/paths";
import { createTransformRoute } from "./transform";
import { createDownloadRoute } from "./download";
import { createDownloadFolderRoute } from "./download-folder";
import { TransformService } from "../services/transform.service";

const stream = () =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([0, 1, 2]));
      c.close();
    },
  });

async function responseFor(result: TransformResult, filePath: string): Promise<Response> {
  const app = new Hono().get("/*", (c) => respond(c, result, filePath));
  return app.request(`/t/${filePath}`);
}

// @hono/node-server writes its own Content-Length only when it can measure the
// body, so forwarding ours on a buffer sends it twice (a framing error undici
// rejects), and dropping it on a stream sends the original chunked.
test("Content-Length is dropped for a buffer and kept for a stream", async () => {
  const buffered = await responseFor(
    { buffer: Buffer.from("image-bytes"), contentType: "image/webp", headers: { "Content-Length": "11", ETag: '"x"' } },
    "w_100/photo.png",
  );
  assert.equal(buffered.headers.get("content-length"), null);
  assert.equal(buffered.headers.get("etag"), '"x"');

  const streamed = await responseFor(
    { stream: stream(), contentType: "video/mp4", headers: { "Content-Length": "3" } },
    "clip.mp4",
  );
  assert.equal(streamed.headers.get("content-length"), "3");
});

// Stored originals come back untouched; without nosniff a file whose bytes are
// markup would run as a page on our origin.
test("every response is nosniff", async () => {
  for (const result of [
    { stream: stream(), contentType: "model/gltf-binary", headers: {} },
    { buffer: Buffer.from("x"), contentType: "image/webp", headers: {} },
  ]) {
    const response = await responseFor(result, "models/duck.glb");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
});

test("the content-type fallback uses the shared media table", async () => {
  for (const [file, type] of [
    ["models/duck.glb", "model/gltf-binary"],
    ["audio/sfx.wav", "audio/wav"],
    ["notes.xyz", "application/octet-stream"],
  ]) {
    const response = await responseFor({ buffer: Buffer.from("?"), contentType: "", headers: {} }, file);
    assert.equal(response.headers.get("content-type"), type);
  }
});

test("an error result keeps its status instead of passing as a 200 body", async () => {
  const response = await responseFor(
    { buffer: Buffer.from("Processing failed: File not found: a.png"), contentType: "text/plain", status: 404, headers: {} },
    "w_100/a.png",
  );
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Processing failed: File not found: a.png");
});

// The signature used to be checked against the undecoded path, so a signed
// URL for "a, b.png" (sent as a%2C%20b.png) was refused.
test("/authenticated verifies and looks up the decoded path", async () => {
  let asked: string | undefined;
  const app = new Hono().route(
    "/authenticated",
    createAuthenticatedRoute({
      storage: {
        existsOriginal: async (path: string) => {
          asked = path;
          return false;
        },
        invalidateAllCacheEntries: () => {},
      },
      queue: {},
      paths: enginePathsIn(tmpdir()),
      apiSecret: "test-secret",
    } as any),
  );
  const signature = generateSignature("w_300", "photos/a, b.png", "test-secret");
  const response = await app.request(`/authenticated/s--${signature}/w_300/photos/a%2C%20b.png`);
  assert.equal(response.status, 404);
  assert.equal(asked, "photos/a, b.png");
});

test("routes read the path below their own mount, not a hard-coded one", async () => {
  const asked: string[] = [];
  const deps = {
    storage: {
      existsOriginal: async (path: string) => {
        asked.push(path);
        return false;
      },
      invalidateAllCacheEntries: () => {},
    },
    queue: {},
    paths: enginePathsIn(tmpdir()),
    apiSecret: "test-secret",
  } as any;
  const app = new Hono()
    .route("/b/:bucket/t", createTransformRoute(deps))
    .route("/signed", createAuthenticatedRoute(deps));

  await app.request("/b/acme/t/w_300/t/photo.png");
  const signature = generateSignature("w_300", "t/photo.png", "test-secret");
  await app.request(`/signed/s--${signature}/w_300/t/photo.png`);

  assert.deepEqual(asked, ["t/photo.png", "t/photo.png"]);
});

// Transform params on a type that can't be transformed are a 400 on /t/. A
// signature only decides who may request a URL, so the same request has to
// fail the same way once signed instead of passing as a 200 audio/wav body.
test("a 400 from the service is a 400 on both /t and /authenticated", async () => {
  const original = TransformService.prototype.transform;
  TransformService.prototype.transform = async () => ({
    buffer: Buffer.from("audio/sfx.wav can't be transformed."),
    contentType: "text/plain",
    status: 400,
    headers: {},
  });
  try {
    const deps = { storage: null, queue: {}, paths: enginePathsIn(tmpdir()), apiSecret: "test-secret" } as any;
    const app = new Hono()
      .route("/t", createTransformRoute(deps))
      .route("/authenticated", createAuthenticatedRoute(deps));
    assert.equal((await app.request("/t/w_500/audio/sfx.wav")).status, 400);
    const signature = generateSignature("w_500", "audio/sfx.wav", "test-secret");
    assert.equal((await app.request(`/authenticated/s--${signature}/w_500/audio/sfx.wav`)).status, 400);
  } finally {
    TransformService.prototype.transform = original;
  }
});

// Without a bucket, request paths are joined onto the public folder. Hono only
// decodeURI's, so "..%2F" reached that join as "../" and read any file the
// process could.
test("no delivery route reads outside the public folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "traversal-"));
  try {
    const paths = enginePathsIn(dir);
    await mkdir(paths.public, { recursive: true });
    await writeFile(join(dir, "secret.txt"), "secret");
    await writeFile(join(paths.public, "ok.txt"), "ok");
    const deps = { storage: null, queue: {}, paths, apiSecret: "test-secret" } as any;
    const app = new Hono()
      .route("/t", createTransformRoute(deps))
      .route("/authenticated", createAuthenticatedRoute(deps))
      .route("/download", createDownloadRoute(deps))
      .route("/download-folder", createDownloadFolderRoute(deps));

    assert.equal(await (await app.request("/download/ok.txt")).text(), "ok", "a normal path still works");
    const signature = generateSignature("", "secret.txt", "test-secret");
    for (const url of [
      "/t/..%2Fsecret.txt",
      "/t/w_10/..%2F..%2Fsecret.txt",
      "/t/%2E%2E/secret.txt",
      "/t/..%5Csecret.txt",
      "/t/a%00.txt",
      `/authenticated/s--${signature}/..%2Fsecret.txt`,
      "/download/..%2Fsecret.txt",
      "/download/sub%2F..%2F..%2Fsecret.txt",
      "/download-folder/..%2F",
    ]) {
      const response = await app.request(url);
      assert.ok([400, 404].includes(response.status), `${url} answered ${response.status}`);
      assert.doesNotMatch(await response.text(), /secret/, url);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("respond() leaves the outcome where middleware after the route can read it", async () => {
  let seen: string | undefined = "unset";
  const app = new Hono();
  app.use("/*", async (c, next) => {
    await next();
    seen = transformOutcome(c);
  });
  app.get("/*", (c) =>
    respond(c, { buffer: Buffer.from("x"), contentType: "image/webp", headers: {}, outcome: "cache" }, "a.png"),
  );
  await app.request("/t/w_1/a.png");
  assert.equal(seen, "cache");
});
