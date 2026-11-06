import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { isTransformSegment, parseParams } from "../parser";
import { parseBlurredBackground, parseBorder } from "./effect-spec";
import { transformImage } from "./index";
import { TransformService } from "../../services/transform.service";

// --- parsing ----------------------------------------------------------------

test("bo_ follows Cloudinary's <width>px_solid_<color>", () => {
  assert.deepEqual(parseBorder("4px_solid_red"), { width: 4, color: "#ff0000" });
  assert.deepEqual(parseBorder("5px_solid_rgb:999"), { width: 5, color: "#999" });
  assert.deepEqual(parseBorder("60px_solid_rgb:00390b60"), { width: 60, color: "#00390b60" });
  for (const bad of ["4_solid_red", "4px_dashed_red", "0px_solid_red", "1001px_solid_red", "4px_solid_nope"]) {
    assert.equal(parseBorder(bad), undefined, bad);
    assert.equal(isTransformSegment(`bo_${bad}`), false, bad);
  }
  assert.equal(parseParams("/t/w_100,bo_4px_solid_red/a.jpg").border, "4px_solid_red");
});

test("b_blurred takes intensity 1-2000 and brightness -300 to 100", () => {
  assert.deepEqual(parseBlurredBackground("blurred"), { intensity: 100, brightness: 0 });
  assert.deepEqual(parseBlurredBackground("blurred:400:15"), { intensity: 400, brightness: 15 });
  assert.deepEqual(parseBlurredBackground("blurred:400:-300"), { intensity: 400, brightness: -300 });
  for (const bad of ["blurred:0", "blurred:2001", "blurred:100:101", "blurred:100:-301"]) {
    assert.equal(parseBlurredBackground(bad), undefined, bad);
  }
  assert.equal(parseParams("/t/c_pad,b_blurred:400:15/a.jpg").background, "blurred:400:15");
});

test("d_ names a file like l_, with ':' folders, and no traversal", () => {
  assert.equal(parseParams("/t/d_placeholders:avatar.png/a.jpg").defaultImage, "placeholders/avatar.png");
  for (const bad of ["d_..:secret.png", "d_noext", "d_/etc/passwd.png"]) {
    assert.equal(isTransformSegment(bad), false, bad);
  }
});

// --- rendering --------------------------------------------------------------

const solid = async (path: string, width: number, height: number, background: string) =>
  writeFile(
    path,
    await sharp({ create: { width, height, channels: 3, background } }).png().toBuffer(),
  );

const read = async (buffer: Buffer) => {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return [...data.subarray(i, i + 3)];
  };
  return { size: `${info.width}x${info.height}`, at };
};

test("bo_ adds the border outside the image", async () => {
  const dir = await mkdtemp(join(tmpdir(), "border-"));
  try {
    const path = join(dir, "in.png");
    await solid(path, 50, 40, "#0000ff");
    const out = await read(
      await transformImage(path, { width: 50, height: 40, border: "5px_solid_red" }),
    );
    assert.equal(out.size, "60x50");
    assert.deepEqual(out.at(2, 2), [255, 0, 0]);
    assert.deepEqual(out.at(30, 25), [0, 0, 255]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("b_blurred pads with a blurred copy of the image", async () => {
  const dir = await mkdtemp(join(tmpdir(), "blurred-"));
  try {
    const path = join(dir, "in.png");
    await solid(path, 50, 100, "#00ff00");
    const out = await read(
      await transformImage(path, {
        crop: "pad",
        width: 300,
        height: 100,
        background: "blurred:400:-50",
      }),
    );
    assert.equal(out.size, "300x100");
    // The pad is the image's color, darkened by the brightness shift.
    const [r, g, b] = out.at(5, 50);
    assert.ok(r < 20 && b < 20 && g > 100 && g < 160, `${[r, g, b]}`);
    // The image itself sits in the middle, unchanged.
    assert.deepEqual(out.at(150, 50), [0, 255, 0]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("d_ serves the default image, transformed, when the file is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "default-"));
  const cwd = process.cwd();
  try {
    process.chdir(dir);
    await mkdir(join(dir, "public", "placeholders"), { recursive: true });
    await solid(join(dir, "public", "placeholders", "avatar.png"), 200, 200, "#ff00ff");
    await solid(join(dir, "public", "real.png"), 200, 200, "#00ffff");
    const service = new TransformService(null, { getJobByPath: () => undefined } as any);
    const request = (path: string) =>
      service.transform({ path, userAgent: "", acceptHeader: "image/png", context: {} as any });

    const missing = await request("/t/w_50,f_png,d_placeholders:avatar.png/nope.png");
    assert.equal(missing.headers["X-Default-Image"], "placeholders/avatar.png");
    assert.equal(missing.headers["Cache-Control"], "private, max-age=60");
    const placeholder = await read(missing.buffer!);
    assert.equal(placeholder.size, "50x50");
    assert.deepEqual(placeholder.at(10, 10), [255, 0, 255]);

    const present = await request("/t/w_50,f_png,d_placeholders:avatar.png/real.png");
    assert.equal(present.headers["X-Default-Image"], undefined);
    assert.deepEqual((await read(present.buffer!)).at(10, 10), [0, 255, 255]);

    // A missing default image is still a plain "not found".
    const neither = await request("/t/w_50,d_placeholders:gone.png/nope.png");
    assert.match(neither.buffer!.toString(), /not found/i);
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
});
