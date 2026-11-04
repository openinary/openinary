import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { parseParams, isTransformSegment } from "./parser";
import { ValidationError } from "./errors";
import { transformImage } from "./image";
import { transformVideo } from "./video";
import { TransformService } from "../services/transform.service";

// --- parser -----------------------------------------------------------------

test("l_ maps ':' to folder separators", () => {
  assert.equal(parseParams("/t/l_logos:brand:wm.png/a.jpg").overlayPath, "logos/brand/wm.png");
});

test("lo_ parses opacity 0-100 and rejects anything above", () => {
  assert.equal(parseParams("/t/l_wm.png,lo_30/a.jpg").overlayOpacity, 30);
  assert.equal(parseParams("/t/l_wm.png,lo_0/a.jpg").overlayOpacity, 0);
  assert.equal(isTransformSegment("l_wm.png,lo_150"), false);
});

test("lg_ accepts the compact and the underscore spellings", () => {
  for (const g of ["southeast", "south_east", "bottom_right", "se"]) {
    assert.equal(parseParams(`/t/l_wm.png,lg_${g}/a.jpg`).overlayGravity, "southeast", g);
  }
  assert.equal(parseParams("/t/l_wm.png,lg_north_west/a.jpg").overlayGravity, "northwest");
  assert.equal(isTransformSegment("l_wm.png,lg_somewhere"), false);
});

test("lx_ and ly_ parse together", () => {
  const p = parseParams("/t/l_wm.png,lx_10,ly_20/a.jpg");
  assert.equal(p.overlayXOffset, 10);
  assert.equal(p.overlayYOffset, 20);
});

test("lx_ without ly_ (or the reverse) is a ValidationError", () => {
  assert.throws(() => parseParams("/t/l_wm.png,lx_10/a.jpg"), ValidationError);
  assert.throws(() => parseParams("/t/l_wm.png,ly_10/a.jpg"), ValidationError);
});

test("overlay paths cannot traverse out of public/", () => {
  for (const seg of ["l_..:..:etc:passwd.x", "l_../secret.png", "l_/etc/passwd.png", "l_.hidden.png"]) {
    assert.equal(isTransformSegment(seg), false, seg);
    assert.equal(parseParams(`/t/${seg}/a.jpg`).overlayPath, undefined, seg);
  }
});

test("folder names with dots are still not mistaken for transforms", () => {
  assert.equal(isTransformSegment("my.folder"), false);
  assert.deepEqual(parseParams("/t/w_300/my.folder/a.jpg"), { width: 300 });
});

// --- service ----------------------------------------------------------------

test("an invalid overlay offset answers 400, not 500", async () => {
  const service = new TransformService(null, { getJobByPath: () => undefined } as any);
  const result = await service.transform({
    path: "/t/l_wm.png,lx_10/a.jpg",
    userAgent: "",
    context: {} as any,
  });
  assert.equal(result.status, 400);
  assert.match(result.buffer!.toString(), /lx_ and ly_/);
});

// --- rendering --------------------------------------------------------------

const fixtures = async () => {
  const dir = await mkdtemp(join(tmpdir(), "overlay-test-"));
  const base = join(dir, "base.png");
  const wm = join(dir, "wm.png");
  await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 0, b: 255 } } })
    .png()
    .toFile(base);
  await sharp({ create: { width: 100, height: 50, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toFile(wm);
  return { dir, base, wm };
};

const pixel = async (input: Buffer | string, x: number, y: number) => {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};

test("image overlay is composited at the gravity with the requested opacity", async () => {
  const { dir, base, wm } = await fixtures();
  try {
    const params = parseParams("/t/l_wm.png,lo_50,lg_south_east/base.png");
    const out = await transformImage(base, { ...params, overlayPath: wm });
    const [r, , b] = await pixel(out, 395, 295); // inside the bottom-right watermark
    assert.ok(Math.abs(r - 128) <= 3 && Math.abs(b - 127) <= 3, `blended ${r},${b}`);
    assert.deepEqual(await pixel(out, 5, 5), [0, 0, 255]); // untouched elsewhere
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("video overlay is burned into the encoded frames", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const { dir, wm } = await fixtures();
  const cwd = process.cwd();
  try {
    // transformVideo resolves overlay paths against ./public, like the service
    process.chdir(dir);
    execFileSync("mkdir", ["-p", "public"]);
    await writeFile(join(dir, "public", "wm.png"), await readFile(wm));
    const src = join(dir, "base.mp4");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "color=c=blue:size=320x240:rate=25", "-t", "1", "-pix_fmt", "yuv420p", src]);
    const params = parseParams("/t/l_wm.png,lo_100,lg_northwest/base.mp4");
    const out = await transformVideo(src, params, null);
    const outPath = join(dir, "out.mp4");
    const frame = join(dir, "frame.png");
    await writeFile(outPath, out);
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", outPath, "-frames:v", "1", frame]);
    const [r, , b] = await pixel(frame, 20, 20);
    assert.ok(r > 180 && b < 60, `top-left should be red, got ${r},${b}`);
    const [r2, , b2] = await pixel(frame, 300, 220);
    assert.ok(b2 > 180 && r2 < 60, `rest should stay blue, got ${r2},${b2}`);
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("a video thumbnail with an overlay stages the overlay once", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const { dir, wm } = await fixtures();
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    execFileSync("mkdir", ["-p", "public"]);
    await writeFile(join(dir, "public", "wm.png"), await readFile(wm));
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "color=c=blue:size=320x240:rate=25", "-t", "1", "-pix_fmt", "yuv420p", join(dir, "public", "clip.mp4")]);
    const service = new TransformService(null, { getJobByPath: () => undefined } as any);
    const result = await service.transform({
      path: "/t/t_1,f_jpg,l_wm.png,lo_100,lg_northwest/clip.mp4",
      userAgent: "",
      context: {} as any,
    });
    assert.equal(result.status, undefined, result.buffer?.toString());
    const [r, , b] = await pixel(result.buffer!, 20, 20);
    assert.ok(r > 180 && b < 60, `thumbnail should carry the overlay, got ${r},${b}`);
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("a local overlay original survives a request served from a remote source", async () => {
  const { dir, base, wm } = await fixtures();
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    execFileSync("mkdir", ["-p", "public", "temp"]);
    await writeFile(join(dir, "public", "wm.png"), await readFile(wm));
    const bytes = await readFile(base);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(bytes)) as any;
    try {
      const service = new TransformService(null, { getJobByPath: () => undefined } as any);
      await service.transform({
        path: "/t/l_wm.png/remote.png",
        sourceUrl: "https://example.test/remote.png",
        userAgent: "",
        context: {} as any,
      } as any);
    } finally {
      globalThis.fetch = realFetch;
    }
    await readFile(join(dir, "public", "wm.png")); // throws if it was deleted
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("video overlay honours lg_southeast", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const { dir, wm } = await fixtures();
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    execFileSync("mkdir", ["-p", "public"]);
    await writeFile(join(dir, "public", "wm.png"), await readFile(wm));
    const src = join(dir, "base.mp4");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "color=c=blue:size=320x240:rate=25", "-t", "1", "-pix_fmt", "yuv420p", src]);
    const out = await transformVideo(src, parseParams("/t/l_wm.png,lo_100,lg_southeast/base.mp4"), null);
    const outPath = join(dir, "out.mp4");
    const frame = join(dir, "frame.png");
    await writeFile(outPath, out);
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", outPath, "-frames:v", "1", frame]);
    const [r, , b] = await pixel(frame, 310, 230);
    assert.ok(r > 180 && b < 60, `bottom-right should be red, got ${r},${b}`);
    const [r2, , b2] = await pixel(frame, 160, 120);
    assert.ok(b2 > 180 && r2 < 60, `center should stay blue, got ${r2},${b2}`);
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("overlay sizes are bounded in the URL", () => {
  assert.equal(isTransformSegment("l_wm.png,lw_8192"), true);
  assert.equal(isTransformSegment("l_wm.png,lw_8193"), false);
  assert.equal(isTransformSegment("l_wm.png,lh_0"), false);
});

test("a tiled video overlay with tiny tiles is refused before compositing", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const { dir, wm } = await fixtures();
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    execFileSync("mkdir", ["-p", "public"]);
    await writeFile(join(dir, "public", "wm.png"), await readFile(wm));
    const src = join(dir, "base.mp4");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "color=c=blue:size=1280x720:rate=25", "-t", "1", "-pix_fmt", "yuv420p", src]);
    const started = Date.now();
    await assert.rejects(
      transformVideo(src, parseParams("/t/l_wm.png,lt_1,lw_1,lh_1/base.mp4"), null),
    );
    assert.ok(Date.now() - started < 5000, "should fail fast");
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});
