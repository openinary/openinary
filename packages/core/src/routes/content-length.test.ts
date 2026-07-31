import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createTransformRoute } from "./transform";
import { TransformService } from "../services/transform.service";

// Whether /t/* forwards the transform's own Content-Length depends on how the
// body is delivered, and the two cases pull in opposite directions. Measured
// against @hono/node-server, which writes its own header only when it can
// measure the body:
//
//   buffer + our header  -> "content-length" AND "Content-Length" - a framing
//                           error (RFC 9110 8.6); undici rejects the response,
//                           and a caller proxying this instance over fetch can
//                           be left awaiting one that never settles
//   buffer, no header    -> Content-Length, correct
//   stream + our header  -> Content-Length, correct, no duplicate
//   stream, no header    -> Transfer-Encoding: chunked, length lost
//
// So it is dropped for a buffer and kept for a stream. Dropping it in both
// cases - the obvious simplification, and what this started as - silently
// turns a bare /t/<video> into a chunked response with no length at all.

const deps = (): any => ({
  storage: { existsOriginal: async () => true, exists: async () => false },
  queue: { getJobByPath: () => undefined, addJob: async () => "job-1" },
});

/**
 * Drives the real route with a forced service result. The service is built
 * inside the factory, so the only seam is its prototype - swapped for the
 * length of one request and put back, since node:test shares one process
 * across every test file.
 */
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

test("a buffered body does not forward Content-Length", async () => {
  const headers = await headersFor(
    {
      buffer: Buffer.from("image-bytes"),
      contentType: "image/webp",
      headers: { "Content-Length": "11", ETag: '"x"' },
    },
    "/t/w_100/photo.png",
  );

  assert.equal(
    headers.get("content-length"),
    null,
    "forwarding it makes the server emit the header twice",
  );
  assert.equal(headers.get("etag"), '"x"', "other headers still pass through");
});

test("a streamed body forwards Content-Length", async () => {
  const headers = await headersFor(
    {
      stream: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([0, 1, 2]));
          c.close();
        },
      }),
      contentType: "video/mp4",
      headers: { "Content-Length": "3", "X-Video-Status": "original" },
    },
    "/t/clip.mp4",
  );

  assert.equal(
    headers.get("content-length"),
    "3",
    "without it the original streams chunked, with no length for the player",
  );
  assert.equal(headers.get("x-video-status"), "original");
});
