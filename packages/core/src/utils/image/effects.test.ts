import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { isTransformSegment, parseParams } from "../parser";
import { parseEffect } from "./effect-spec";
import { transformImage } from "./index";

// --- parsing ----------------------------------------------------------------

test("e_ accepts Cloudinary's effect syntax", () => {
  for (const value of [
    "fill_light",
    "fill_light:70",
    "fill_light:70:20",
    "fill_light:0:-100",
    "blur",
    "blur:2000",
    "sharpen:400",
    "unsharp_mask:500",
    "grayscale",
    "sepia:50",
    "negate",
    "brightness:-99",
    "contrast:50",
    "contrast:level_-70",
    "contrast:level_150;type_linear",
    "saturation:-100",
    "hue:40",
    "gamma:150",
    "pixelate",
    "pixelate:20",
    "trim",
    "trim:50:yellow",
    "trim:20:rgb:ff0000",
    "tint",
    "tint:50:blue",
    "tint:equalize:80:red:blue:yellow",
    "tint:50:blue:20p:0f0:80p",
    "colorize:35",
  ]) {
    assert.ok(parseEffect(value), value);
    assert.ok(isTransformSegment(`e_${value}`), value);
  }
});

test("e_ rejects unknown effects and out-of-range arguments", () => {
  for (const value of [
    "fill_lights",
    "fill_light:101",
    "fill_light:50:-101",
    "blur:0",
    "blur:2001",
    "grayscale:5",
    "brightness:-100",
    "contrast:level_201;type_linear",
    "contrast:level_0;type_linear",
    "sepia:0",
    "gamma:-51",
    "trim:10:notacolor",
    "tint:101",
    "tint:50:blue:101p",
    "tint:50:20p",
    "vignette",
  ]) {
    assert.equal(parseEffect(value), undefined, value);
    assert.equal(isTransformSegment(`w_100,e_${value}`), false, value);
  }
});

test("e_ is repeatable and keeps URL order; o_ and co_ parse", () => {
  const p = parseParams("/t/w_100,e_fill_light:70:20,e_blur:300,o_40,co_rgb:20a020/a.jpg");
  assert.deepEqual(p.effects, ["fill_light:70:20", "blur:300"]);
  assert.equal(p.opacity, 40);
  assert.equal(p.color, "#20a020");
  assert.equal(parseParams("/t/co_darkviolet/a.jpg").color, "#9400d3");
  assert.equal(isTransformSegment("co_notacolor"), false);
  assert.equal(isTransformSegment("o_101"), false);
});

test("URLs without the new keys parse exactly as before", () => {
  assert.deepEqual(parseParams("/t/w_300,h_200,c_fill/a.jpg"), {
    width: 300,
    height: 200,
    crop: "fill",
  });
});

// --- rendering --------------------------------------------------------------

const withImage = async (
  create: sharp.Create,
  run: (path: string) => Promise<void>,
  format: "png" | "jpeg" = "png",
) => {
  const dir = await mkdtemp(join(tmpdir(), "effects-"));
  const path = join(dir, `in.${format}`);
  try {
    await writeFile(path, await sharp({ create })[format]().toBuffer());
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const firstPixel = async (buffer: Buffer) => {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  return { px: [...data.subarray(0, info.channels)], info };
};

const gray = (v: number): sharp.Create => ({
  width: 8,
  height: 8,
  channels: 3,
  background: { r: v, g: v, b: v },
});

test("e_fill_light lifts shadows more than highlights, and blend 0 is a no-op", async () => {
  await withImage(gray(40), async (path) => {
    const lifted = (await firstPixel(await transformImage(path, { effects: ["fill_light"] }))).px[0];
    assert.ok(lifted > 70, `shadow lifted to ${lifted}`);
    const none = (await firstPixel(await transformImage(path, { effects: ["fill_light:0"] }))).px[0];
    assert.equal(none, 40);
    const lessBias = (
      await firstPixel(await transformImage(path, { effects: ["fill_light:100:-100"] }))
    ).px[0];
    assert.equal(lessBias, 40);
  });
  await withImage(gray(240), async (path) => {
    const v = (await firstPixel(await transformImage(path, { effects: ["fill_light"] }))).px[0];
    assert.ok(v >= 240 && v < 252, `highlight kept near 240, got ${v}`);
  });
});

test("tone effects move pixels the expected way", async () => {
  await withImage(gray(100), async (path) => {
    const value = async (e: string) =>
      (await firstPixel(await transformImage(path, { effects: [e] }))).px[0];
    assert.ok((await value("brightness:50")) > 140);
    assert.ok((await value("brightness:-50")) < 60);
    assert.equal(await value("negate"), 155);
    assert.ok((await value("gamma:100")) > 140);
    assert.ok((await value("contrast:level_100")) < 100);
    assert.ok((await value("contrast:level_200;type_linear")) < 100);
  });
});

test("color effects keep alpha and produce the expected hue", async () => {
  const red: sharp.Create = {
    width: 8,
    height: 8,
    channels: 4,
    background: { r: 200, g: 40, b: 40, alpha: 0.5 },
  };
  await withImage(red, async (path) => {
    const g = await firstPixel(await transformImage(path, { effects: ["grayscale"] }));
    assert.equal(g.info.channels, 4);
    assert.equal(g.px[0], g.px[1]);
    assert.equal(g.px[1], g.px[2]);
    assert.equal(g.px[3], 128);

    const t = await firstPixel(await transformImage(path, { effects: ["tint:100:blue"] }));
    assert.ok(t.px[2] > t.px[0], `tinted blue: ${t.px}`);
    assert.equal(t.px[3], 128);

    const c = await firstPixel(
      await transformImage(path, { effects: ["colorize:100"], color: "#00ff00" }),
    );
    assert.ok(c.px[1] > c.px[0] && c.px[1] > c.px[2], `colorized green: ${c.px}`);

    const s = await firstPixel(await transformImage(path, { effects: ["saturation:-100"] }));
    assert.ok(Math.abs(s.px[0] - s.px[2]) <= 2, `desaturated: ${s.px}`);
  });
});

test("blur, sharpen and pixelate keep dimensions", async () => {
  await withImage({ width: 40, height: 30, channels: 3, background: "#336699" }, async (path) => {
    for (const e of ["blur:300", "sharpen", "unsharp_mask:500", "pixelate:5", "sepia", "hue:40"]) {
      const { info } = await firstPixel(await transformImage(path, { effects: [e] }));
      assert.equal(`${info.width}x${info.height}`, "40x30", e);
    }
  });
});

test("e_trim removes a uniform border and survives a uniform image", async () => {
  const dir = await mkdtemp(join(tmpdir(), "effects-"));
  try {
    const path = join(dir, "framed.png");
    const inner = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    await writeFile(
      path,
      await sharp({ create: { width: 60, height: 50, channels: 3, background: "#ffffff" } })
        .composite([{ input: inner, left: 20, top: 20 }])
        .png()
        .toBuffer(),
    );
    const { info } = await firstPixel(await transformImage(path, { effects: ["trim"] }));
    assert.equal(`${info.width}x${info.height}`, "20x10");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await withImage(gray(10), async (path) => {
    const { info } = await firstPixel(await transformImage(path, { effects: ["trim"] }));
    assert.equal(info.width, 8);
  });
});

test("effects apply in URL order", async () => {
  await withImage(gray(100), async (path) => {
    // negate then brighten != brighten then negate
    const a = (await firstPixel(await transformImage(path, { effects: ["negate", "brightness:50"] }))).px[0];
    const b = (await firstPixel(await transformImage(path, { effects: ["brightness:50", "negate"] }))).px[0];
    assert.notEqual(a, b);
  });
});

test("o_ makes the image translucent, or bakes it onto b_", async () => {
  await withImage(gray(0), async (path) => {
    const t = await firstPixel(await transformImage(path, { opacity: 25 }));
    assert.equal(t.info.channels, 4);
    assert.equal(t.px[3], 64);
    const flat = await firstPixel(
      await transformImage(path, { opacity: 25, background: "#ffffff" }),
    );
    // 25% black over white
    assert.ok(Math.abs(flat.px[0] - 191) <= 1, `${flat.px}`);
  });
});

test("effects run after resize", async () => {
  await withImage(gray(100), async (path) => {
    const { info } = await firstPixel(
      await transformImage(path, { width: 4, height: 4, effects: ["blur"] }),
    );
    assert.equal(`${info.width}x${info.height}`, "4x4");
  });
});
