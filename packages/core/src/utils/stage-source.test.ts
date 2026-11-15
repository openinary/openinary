import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "fs/promises";
import os from "os";
import path from "path";
import { stageSource } from "./stage-source";

test("a download that fails midway leaves no partial file in temp", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "stage-source-"));
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.error(new Error("connection reset"));
        },
      }),
    );

  await assert.rejects(
    stageSource(null, { public: temp, temp }, "clip.mp4", "https://example.test/clip.mp4"),
    /connection reset/,
  );
  assert.deepEqual(await readdir(temp), []);
});
