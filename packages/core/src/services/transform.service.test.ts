import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import sharp from "sharp";
import { TransformService } from "./transform.service";
import { createVideoStatusRoute } from "../routes/video-status";
import { enginePathsIn } from "../config/paths";

const paths = enginePathsIn(tmpdir());

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

const fakeEstimate = {
  phase: "processing",
  progress: 0.42,
  estimatedSeconds: 6,
  estimatedRange: [6, 9],
  retryAfter: 6,
};

const fakeQueue = (job?: unknown): any => ({
  getJobByPath: () => job,
  estimate: async () => fakeEstimate,
  enqueueTransform: () => "job-1",
  resetJob: () => {},
});

test("a bare video URL serves the original and queues nothing", async () => {
  const queue = fakeQueue();
  let queued = false;
  queue.enqueueTransform = () => {
    queued = true;
    return "job-1";
  };
  const service = new TransformService(fakeStorage(), queue, paths);

  const result = await service.transform({
    path: "/t/clip.mp4",
    userAgent: "",
  });

  assert.equal(queued, false);
  assert.ok(result.stream, "original should be streamed");
  assert.equal(result.status, undefined);
  assert.equal(result.contentType, "video/mp4");
  assert.equal(result.outcome, "original");
});

// Camera JPEGs libjpeg refuses but browsers decode: served as the original
// instead of a 500, and never cached as if it were the transform. Anything
// else must still surface as an error. sharp's encoder is made to fail with
// libvips' wording, since a file that reproduces it is not easy to craft.
async function transformWhileSharpFails(message: string, file: string) {
  const dir = await mkdtemp(join(tmpdir(), "jpeg-fallback-"));
  const sharpProto = Object.getPrototypeOf(sharp()) as { toBuffer: unknown };
  const toBuffer = sharpProto.toBuffer;
  try {
    await mkdir(join(dir, "public"));
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#c33" } }).toFile(join(dir, "public", file));
    sharpProto.toBuffer = async () => {
      throw new Error(message);
    };
    const service = new TransformService(null, fakeQueue(), enginePathsIn(dir));
    const result = await service.transform({ path: `/t/w_4/${file}`, userAgent: "" });
    const cached = await readdir(join(dir, "cache")).catch(() => []);
    return { result, cached };
  } finally {
    sharpProto.toBuffer = toBuffer;
    await rm(dir, { recursive: true, force: true });
  }
}

const SOS = "VipsJpeg: Invalid SOS parameters for sequential JPEG";

test("a JPEG libvips refuses with the SOS error is served as the original", async () => {
  const { result, cached } = await transformWhileSharpFails(SOS, "camera.jpg");
  assert.ok(result.stream, "the original is streamed");
  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(result.headers["X-Transform-Fallback"], "original");
  assert.equal(result.outcome, "original");
  assert.deepEqual(cached, [], "the original is not cached as the transform");
});

test("other transform errors, or the SOS error on a non-JPEG, are not hidden", async () => {
  for (const [message, file] of [["JPEG encoder unavailable", "camera.jpg"], [SOS, "photo.png"]]) {
    const { result } = await transformWhileSharpFails(message, file);
    assert.equal(result.status, 500, `${message} on ${file}`);
    assert.equal(result.headers["X-Transform-Fallback"], undefined);
    assert.equal(result.outcome, undefined, "errors carry no outcome");
  }
});

test("a pending video transform answers 202 instead of the original", async () => {
  const service = new TransformService(
    fakeStorage(),
    fakeQueue({ id: "j1", status: "processing" }),
    paths,
  );

  const result = await service.transform({
    path: "/t/w_640,q_80/clip.mp4",
    userAgent: "",
  });

  assert.equal(result.status, 202);
  assert.equal(result.outcome, "queued");
  assert.equal(result.stream, undefined, "must not fall back to the original");
  const body = JSON.parse(result.buffer!.toString());
  assert.equal(body.status, "processing");
  // The estimate drives both the body and Retry-After, so a client that only
  // honours the header still comes back at the right time
  assert.equal(body.estimatedSeconds, 6);
  assert.deepEqual(body.estimatedRange, [6, 9]);
  assert.equal(result.headers?.["Retry-After"], "6");
  assert.equal(result.headers?.["X-Processing-Phase"], "processing");
});

test("the 202 status URL resolves to the job the transform queued", async () => {
  const lookups: Array<{ filePath: string; params: any }> = [];
  const queue = fakeQueue({ id: "j1", status: "processing" });
  queue.getJobByPath = (filePath: string, params: any) => {
    lookups.push({ filePath, params });
    return { id: "j1", status: "processing", progress: 42 };
  };

  const service = new TransformService(fakeStorage(), queue, paths);
  const { statusUrl } = JSON.parse(
    (
      await service.transform({
        path: "/t/w_640,q_80/videos/clip.mp4",
        userAgent: "",
          })
    ).buffer!.toString(),
  );

  const app = new Hono().route(
    "/video-status",
    createVideoStatusRoute({ storage: null, queue, paths } as any),
  );
  const response = await app.request(statusUrl);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "processing",
    progress: 42,
    phase: "processing",
    estimatedSeconds: 6,
    estimatedRange: [6, 9],
    retryAfter: 6,
  });
  // Same key the transform used: the transformation segment is params, not path
  assert.deepEqual(lookups.at(-1), {
    filePath: "videos/clip.mp4",
    params: { width: 640, quality: 80 },
  });
});

test("a cached video→image transform is served as an image, not video/mp4", async () => {
  const storage = fakeStorage();
  storage.exists = async () => true; // cloud cache hit
  storage.download = async () => Buffer.from("avif-bytes");
  const service = new TransformService(storage, fakeQueue(), paths);

  const image = await service.transform({
    path: "/t/f_avif/clip.mp4",
    userAgent: "",
  });
  assert.equal(image.contentType, "image/avif");
  assert.equal(image.outcome, "cache");

  const video = await service.transform({
    path: "/t/w_640,q_80/clip.mp4",
    userAgent: "",
  });
  assert.equal(video.contentType, "video/mp4");
});

test("q_auto opts a video into transformation", async () => {
  const service = new TransformService(fakeStorage(), fakeQueue(), paths);

  const result = await service.transform({
    path: "/t/q_auto/clip.mp4",
    userAgent: "",
  });

  assert.equal(result.status, 202);
  assert.equal(result.stream, undefined);
});

test("a bare audio/3D URL streams the original with its real content-type", async () => {
  const service = new TransformService(fakeStorage(), fakeQueue(), paths);

  const glb = await service.transform({
    path: "/t/models/duck.glb",
    userAgent: "",
  });
  assert.ok(glb.stream, "glb original should be streamed");
  assert.equal(glb.contentType, "model/gltf-binary");

  const wav = await service.transform({
    path: "/t/audio/sfx.wav",
    userAgent: "",
  });
  assert.ok(wav.stream, "wav original should be streamed");
  assert.equal(wav.contentType, "audio/wav");
});

test("transform params on a non-transformable type 400 instead of serving or erroring", async () => {
  const service = new TransformService(fakeStorage(), fakeQueue(), paths);

  const result = await service.transform({
    path: "/t/w_500/audio/sfx.wav",
    userAgent: "",
  });

  assert.equal(result.status, 400);
  assert.equal(result.stream, undefined, "must not fall back to the original");
  assert.match(result.buffer!.toString(), /audio\/sfx\.wav/);
});

// The local cache keeps a derivative from its second request (SmartCache), so
// the third is the first one it can answer.
test("an image is transformed until cached, then served from the cache", async () => {
  const dir = await mkdtemp(join(tmpdir(), "outcome-"));
  try {
    await mkdir(join(dir, "public"));
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#3c3" } }).toFile(join(dir, "public", "a.png"));
    const service = new TransformService(null, fakeQueue(), enginePathsIn(dir));

    const outcomes = [];
    for (let i = 0; i < 3; i++) {
      outcomes.push((await service.transform({ path: "/t/w_4/a.png", userAgent: "" })).outcome);
    }

    assert.deepEqual(outcomes, ["transformed", "transformed", "cache"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
