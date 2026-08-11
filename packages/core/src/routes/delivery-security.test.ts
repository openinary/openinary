import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createTransformRoute } from "./transform";
import { TransformService } from "../services/transform.service";
import { generateSignature } from "../utils/signature";

// /t/* serves stored originals back untouched, so the bytes it returns are
// whatever was uploaded. Content-sniffing is what turns that into a stored-XSS
// problem: a browser that ignores the declared type and reads <html> in the
// body will run it as a page, on our origin. nosniff is the header that stops
// it, and it has to be on every response - the vulnerable one is precisely the
// pass-through path that does no re-encoding.

const deps = (): any => ({
  storage: { existsOriginal: async () => true, exists: async () => false },
  queue: { getJobByPath: () => undefined, addJob: async () => "job-1" },
});

async function headersFor(result: unknown, path: string): Promise<Headers> {
  const app = new Hono();
  app.route("/t", createTransformRoute(deps()));
  const original = TransformService.prototype.transform;
  TransformService.prototype.transform = async () => result as any;
  try {
    return (await app.request(path)).headers;
  } finally {
    TransformService.prototype.transform = original;
  }
}

test("a streamed original is served with nosniff", async () => {
  const headers = await headersFor(
    {
      stream: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([0, 1, 2]));
          c.close();
        },
      }),
      contentType: "model/gltf-binary",
      headers: {},
    },
    "/t/models/duck.glb",
  );

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("content-type"), "model/gltf-binary");
});

test("a transformed response is served with nosniff too", async () => {
  const headers = await headersFor(
    {
      buffer: Buffer.from("image-bytes"),
      contentType: "image/webp",
      headers: {},
    },
    "/t/w_100/photo.png",
  );

  assert.equal(headers.get("x-content-type-options"), "nosniff");
});

test("the content-type fallback uses the shared media table", async () => {
  // No contentType from the service: the route fills it in. It has to reach the
  // same table upload validation uses, or a stored .glb gets labelled as
  // something else on the way out.
  const glb = await headersFor(
    { buffer: Buffer.from("glTF"), contentType: "", headers: {} },
    "/t/models/duck.glb",
  );
  assert.equal(glb.get("content-type"), "model/gltf-binary");

  const wav = await headersFor(
    { buffer: Buffer.from("RIFF"), contentType: "", headers: {} },
    "/t/audio/sfx.wav",
  );
  assert.equal(wav.get("content-type"), "audio/wav");

  const unknown = await headersFor(
    { buffer: Buffer.from("?"), contentType: "", headers: {} },
    "/t/notes.xyz",
  );
  assert.equal(unknown.get("content-type"), "application/octet-stream");
});

// The authenticated route serves the same TransformService results as /t/,
// just gated by a signature. The gate decides who can request a URL, not what
// the stored bytes are, so it needs the exact same nosniff + shared-table
// labelling - it must not be the one delivery path left uncovered.

process.env.API_SECRET = "test-secret";
const { createAuthenticatedRoute } = await import("./authenticated");

async function authenticatedHeadersFor(
  result: unknown,
  filePath: string,
): Promise<Headers> {
  const app = new Hono();
  app.route("/authenticated", createAuthenticatedRoute(deps()));
  const signature = generateSignature("", filePath, "test-secret");
  const original = TransformService.prototype.transform;
  TransformService.prototype.transform = async () => result as any;
  try {
    return (await app.request(`/authenticated/s--${signature}/${filePath}`))
      .headers;
  } finally {
    TransformService.prototype.transform = original;
  }
}

test("an authenticated streamed original is served with nosniff", async () => {
  const headers = await authenticatedHeadersFor(
    {
      stream: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([0, 1, 2]));
          c.close();
        },
      }),
      contentType: "model/gltf-binary",
      headers: {},
    },
    "models/duck.glb",
  );

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("content-type"), "model/gltf-binary");
});

test("the authenticated content-type fallback uses the shared media table", async () => {
  const headers = await authenticatedHeadersFor(
    { buffer: Buffer.from("RIFF"), contentType: "", headers: {} },
    "audio/sfx.wav",
  );
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("content-type"), "audio/wav");
});

// Transform params on a stored type that can't be transformed are a 400 on /t/.
// A signature only decides who may request a URL, so the same request has to
// fail the same way once signed. Without the status check the error text falls
// through as a 200 body labelled with the file extension's own content type,
// i.e. an error string served as audio/wav.

const NOT_TRANSFORMABLE = {
  buffer: Buffer.from(
    "audio/sfx.wav can't be transformed. Request /t/audio/sfx.wav for the original.",
  ),
  contentType: "text/plain",
  status: 400,
  headers: {},
};

test("transform params on a non-transformable type are a 400 on both routes", async () => {
  const original = TransformService.prototype.transform;
  TransformService.prototype.transform = async () => NOT_TRANSFORMABLE as any;
  try {
    const plain = new Hono();
    plain.route("/t", createTransformRoute(deps()));
    assert.equal((await plain.request("/t/w_500/audio/sfx.wav")).status, 400);

    const signed = new Hono();
    signed.route("/authenticated", createAuthenticatedRoute(deps()));
    const signature = generateSignature("w_500", "audio/sfx.wav", "test-secret");
    const response = await signed.request(
      `/authenticated/s--${signature}/w_500/audio/sfx.wav`,
    );
    assert.equal(response.status, 400);
  } finally {
    TransformService.prototype.transform = original;
  }
});
