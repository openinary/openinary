import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { TransformService } from "./transform.service";
import { createVideoStatusRoute } from "../routes/video-status";

const fakeStorage = (): any => ({
  existsOriginal: async () => true,
  exists: async () => false, // cloud cache always misses
  downloadOriginalStream: async () => ({
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0, 1, 2]));
        controller.close();
      },
    }),
    contentLength: 3,
  }),
});

const fakeQueue = (job?: unknown): any => ({
  getJobByPath: () => job,
  addJob: async () => "job-1",
  getStore: () => ({ updateJobStatus: () => {} }),
});

test("a bare video URL serves the original and queues nothing", async () => {
  const queue = fakeQueue();
  let queued = false;
  queue.addJob = async () => {
    queued = true;
    return "job-1";
  };
  const service = new TransformService(fakeStorage(), queue);

  const result = await service.transform({
    path: "/t/clip.mp4",
    userAgent: "",
    context: {} as any,
  });

  assert.equal(queued, false);
  assert.ok(result.stream, "original should be streamed");
  assert.equal(result.status, undefined);
  assert.equal(result.contentType, "video/mp4");
});

test("a pending video transform answers 202 instead of the original", async () => {
  const service = new TransformService(
    fakeStorage(),
    fakeQueue({ id: "j1", status: "processing" }),
  );

  const result = await service.transform({
    path: "/t/w_640,q_80/clip.mp4",
    userAgent: "",
    context: {} as any,
  });

  assert.equal(result.status, 202);
  assert.equal(result.stream, undefined, "must not fall back to the original");
  assert.equal(JSON.parse(result.buffer!.toString()).status, "processing");
});

test("the 202 status URL resolves to the job the transform queued", async () => {
  const lookups: Array<{ filePath: string; params: any }> = [];
  const queue = fakeQueue({ id: "j1", status: "processing" });
  queue.getJobByPath = (filePath: string, params: any) => {
    lookups.push({ filePath, params });
    return { id: "j1", status: "processing", progress: 42 };
  };

  const service = new TransformService(fakeStorage(), queue);
  const { statusUrl } = JSON.parse(
    (
      await service.transform({
        path: "/t/w_640,q_80/videos/clip.mp4",
        userAgent: "",
        context: {} as any,
      })
    ).buffer!.toString(),
  );

  const app = new Hono().route(
    "/video-status",
    createVideoStatusRoute({ storage: null, queue } as any),
  );
  const response = await app.request(statusUrl);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "processing",
    progress: 42,
  });
  // Same key the transform used: the transformation segment is params, not path
  assert.deepEqual(lookups.at(-1), {
    filePath: "videos/clip.mp4",
    params: { width: "640", quality: "80" },
  });
});

test("q_auto opts a video into transformation", async () => {
  const service = new TransformService(fakeStorage(), fakeQueue());

  const result = await service.transform({
    path: "/t/q_auto/clip.mp4",
    userAgent: "",
    context: {} as any,
  });

  assert.equal(result.status, 202);
  assert.equal(result.stream, undefined);
});
