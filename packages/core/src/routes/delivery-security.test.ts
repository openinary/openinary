import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createTransformRoute } from "./transform";
import { TransformService } from "../services/transform.service";

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
