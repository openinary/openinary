import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { isTransformSegment, parseParams } from "../parser";
import { parseAngle } from "./effect-spec";
import { transformImage } from "./index";

// --- parsing ----------------------------------------------------------------

test("dpr_ multiplies w and h, so it shares the plain URL's params", () => {
  assert.deepEqual(parseParams("/t/dpr_2,w_400,h_300/a.jpg"), parseParams("/t/w_800,h_600/a.jpg"));
  assert.deepEqual(parseParams("/t/w_400,dpr_1.5/a.jpg"), { width: 600 });
  assert.deepEqual(parseParams("/t/w_400,dpr_auto/a.jpg"), { width: 400 });
  for (const bad of ["dpr_0", "dpr_6", "dpr_2.555", "dpr_x"]) {
    assert.equal(isTransformSegment(bad), false, bad);
  }
});

test("a_ flips normalize to flip-then-rotate", () => {
  assert.deepEqual(parseAngle("90"), { rotate: 90 });
  assert.deepEqual(parseAngle("auto"), {});
  assert.deepEqual(parseAngle("hflip"), { flip: "h" });
  assert.deepEqual(parseAngle("vflip.45"), { rotate: 45, flip: "v" });
  // rotate 90, then mirror == mirror, then rotate -90
  assert.deepEqual(parseAngle("90.hflip"), { rotate: -90, flip: "h" });
  assert.deepEqual(parseAngle("hflip.vflip"), { flip: "hv" });
  assert.deepEqual(parseAngle("hflip.hflip"), {});
  assert.equal(parseAngle("hflip.png"), undefined);
  assert.equal(isTransformSegment("a_sideways"), false);
});

test("a_ and c_ URLs that existed before keep their params", () => {
  assert.deepEqual(parseParams("/t/a_90/a.jpg"), { rotate: 90 });
  assert.deepEqual(parseParams("/t/a_-45/a.jpg"), { rotate: -45 });
  for (const c of ["fill", "fit", "limit", "pad", "scale", "crop", "thumb", "fill_pad"]) {
    assert.equal(parseParams(`/t/c_${c},w_10/a.jpg`).resizeLimit, undefined, c);
  }
  assert.equal(parseParams("/t/c_lfill,w_10/a.jpg").resizeLimit, "down");
  assert.equal(parseParams("/t/c_mpad,w_10/a.jpg").crop, "pad");
});

// --- rendering --------------------------------------------------------------

const withImage = async (
  width: number,
  height: number,
  run: (path: string) => Promise<void>,
) => {
  const dir = await mkdtemp(join(tmpdir(), "geometry-"));
  const path = join(dir, "in.png");
  // Left half red, right half blue: shows mirroring.
  const right = await sharp({
    create: { width: width / 2, height, channels: 3, background: "#0000ff" },
  })
    .png()
    .toBuffer();
  await writeFile(
    path,
    await sharp({ create: { width, height, channels: 3, background: "#ff0000" } })
      .composite([{ input: right, left: width / 2, top: 0 }])
      .png()
      .toBuffer(),
  );
  try {
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const info = async (buffer: Buffer) => {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  return { size: `${info.width}x${info.height}`, data, info };
};

const pixelAt = (d: Awaited<ReturnType<typeof info>>, x: number, y: number) => {
  const i = (y * d.info.width + x) * d.info.channels;
  return [...d.data.subarray(i, i + 3)];
};

test("a_hflip mirrors, a_vflip keeps left-right", async () => {
  await withImage(100, 50, async (path) => {
    const h = await info(await transformImage(path, { flip: "h" }));
    assert.deepEqual(pixelAt(h, 0, 0), [0, 0, 255]);
    const v = await info(await transformImage(path, { flip: "v" }));
    assert.deepEqual(pixelAt(v, 0, 0), [255, 0, 0]);
    const hr = await info(await transformImage(path, { flip: "h", rotate: 90 }));
    assert.equal(hr.size, "50x100");
  });
});

test("c_lfill and c_lpad never enlarge; c_mfit and c_mpad never reduce", async () => {
  await withImage(100, 50, async (path) => {
    const run = async (crop: "fill" | "fit" | "pad", limit: "down" | "up", w: number, h: number) =>
      (await info(await transformImage(path, { crop, resizeLimit: limit, width: w, height: h }))).size;

    // lfill: larger box -> not scaled up, only cropped to what fits
    assert.equal(await run("fill", "down", 300, 300), "100x50");
    assert.equal(await run("fill", "down", 40, 40), "40x40");
    // lpad: larger box -> padded to the exact size, image kept at 100x50
    const lpad = await info(
      await transformImage(path, {
        crop: "pad",
        resizeLimit: "down",
        width: 200,
        height: 100,
        background: "#00ff00",
      }),
    );
    assert.equal(lpad.size, "200x100");
    assert.deepEqual(pixelAt(lpad, 10, 50), [0, 255, 0]);
    assert.deepEqual(pixelAt(lpad, 55, 50), [255, 0, 0]);
    assert.equal(await run("pad", "down", 50, 50), "50x50");
    // mfit: larger box -> scaled up to fit; smaller box -> untouched
    assert.equal(await run("fit", "up", 300, 300), "300x150");
    assert.equal(await run("fit", "up", 40, 40), "100x50");
    // mpad: larger box -> padded, image not scaled; smaller -> untouched
    assert.equal(await run("pad", "up", 200, 100), "200x100");
    assert.equal(await run("pad", "up", 40, 40), "100x50");
  });
});

test("plain c_fit, c_pad and c_fill behave as before", async () => {
  await withImage(100, 50, async (path) => {
    const run = async (crop: "fill" | "fit" | "pad", w: number, h: number) =>
      (await info(await transformImage(path, { crop, width: w, height: h }))).size;
    assert.equal(await run("fit", 300, 300), "100x50");
    assert.equal(await run("pad", 300, 300), "300x300");
    assert.equal(await run("fill", 300, 300), "300x300");
  });
});
