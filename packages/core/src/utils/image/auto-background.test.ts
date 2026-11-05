import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { isTransformSegment, parseParams } from "../parser";
import { parseAutoBackground } from "./effect-spec";
import { parseBackgroundColor } from "./background";
import { contrastColor } from "./auto-background";
import { transformImage } from "./index";

// --- parsing ----------------------------------------------------------------

test("b_auto accepts Cloudinary's syntax", () => {
  for (const value of [
    "auto",
    "auto:border",
    "auto:predominant",
    "auto:border_contrast",
    "auto:predominant_contrast",
    "auto:predominant_gradient",
    "auto:border_gradient:4",
    "auto:predominant_gradient:2:diagonal_desc",
    "auto:border_gradient_contrast:vertical",
    "auto:predominant:palette_red_green_blue",
    "auto:border:palette_f00_00ff00",
  ]) {
    assert.ok(parseAutoBackground(value), value);
    assert.ok(isTransformSegment(`c_pad,w_100,h_100,b_${value}`), value);
  }
  assert.deepEqual(parseAutoBackground("auto:predominant_gradient_contrast:4"), {
    source: "predominant",
    contrast: true,
    gradient: true,
    colors: 4,
    direction: "horizontal",
  });
});

test("b_auto rejects unknown modes and malformed palettes", () => {
  for (const value of [
    "auto:middle",
    "auto:border:4",
    "auto:predominant_gradient:3",
    "auto:border:palette_",
    "auto:border:palette_notacolor",
    "auto:border:extra",
    "autox",
  ]) {
    assert.equal(parseAutoBackground(value), undefined, value);
    assert.equal(isTransformSegment(`c_pad,b_${value}`), false, value);
  }
});

test("b_ values valid before b_auto map to the exact same string (cache keys)", () => {
  const cases: [string, string][] = [
    ["rgb:ABCDEF", "#ABCDEF"],
    ["rgb:f5f5f5", "#f5f5f5"],
    ["white", "#ffffff"],
    ["black", "#000000"],
    ["transparent", "transparent"],
    ["ff0000", "#ff0000"],
    ["rgb:12345", "#12345"],
  ];
  for (const [value, expected] of cases) {
    assert.equal(parseParams(`/t/b_${value}/a.jpg`).background, expected, value);
    assert.equal(parseParams(`/t/bg_${value}/a.jpg`).background, expected, value);
  }
  assert.equal(parseParams("/t/b_red/a.jpg").background, "#ff0000");
  assert.equal(parseParams("/t/b_auto:predominant/a.jpg").background, "auto:predominant");
});

test("parseBackgroundColor reads 3, 4, 6 and 8 digit hex", () => {
  assert.deepEqual(parseBackgroundColor("#f00"), { r: 255, g: 0, b: 0, alpha: 1 });
  assert.deepEqual(parseBackgroundColor("#f008"), { r: 255, g: 0, b: 0, alpha: 136 / 255 });
  assert.deepEqual(parseBackgroundColor("#00ff0080"), {
    r: 0,
    g: 255,
    b: 0,
    alpha: 128 / 255,
  });
  assert.deepEqual(parseBackgroundColor("#12345"), { r: 255, g: 255, b: 255, alpha: 1 });
});

test("contrast colors sit at the opposite end of lightness", () => {
  const [r, g, b] = contrastColor([250, 250, 250]);
  assert.ok(r + g + b < 120, `${[r, g, b]}`);
  const dark = contrastColor([128, 128, 128]);
  assert.ok(dark[0] > 200 || dark[0] < 50, `${dark}`);
});

// --- rendering --------------------------------------------------------------

/** 100x100: a 10px red frame around a blue square. */
const framed = async (dir: string) => {
  const path = join(dir, "framed.png");
  const blue = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#0000ff" },
  })
    .png()
    .toBuffer();
  await writeFile(
    path,
    await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } })
      .composite([{ input: blue, left: 10, top: 10 }])
      .png()
      .toBuffer(),
  );
  return path;
};

const pixel = async (buffer: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [...data.subarray(i, i + 3)];
};

const withDir = async (run: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), "bauto-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const pad = { crop: "pad" as const, width: 300, height: 100 };

test("b_auto:border pads with the edge color, predominant with the main one", async () => {
  await withDir(async (dir) => {
    const path = await framed(dir);
    const border = await transformImage(path, { ...pad, background: "auto" });
    assert.deepEqual(await pixel(border, 5, 50), [255, 0, 0]);
    const main = await transformImage(path, { ...pad, background: "auto:predominant" });
    assert.deepEqual(await pixel(main, 5, 50), [0, 0, 255]);
  });
});

test("b_auto palette snaps to the nearest allowed color", async () => {
  await withDir(async (dir) => {
    const path = await framed(dir);
    const out = await transformImage(path, {
      ...pad,
      background: "auto:border:palette_white_darkred",
    });
    assert.deepEqual(await pixel(out, 5, 50), [139, 0, 0]);
  });
});

test("b_auto gradient paints each side with its own color", async () => {
  await withDir(async (dir) => {
    const path = join(dir, "halves.png");
    const right = await sharp({
      create: { width: 50, height: 100, channels: 3, background: "#0000ff" },
    })
      .png()
      .toBuffer();
    await writeFile(
      path,
      await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } })
        .composite([{ input: right, left: 50, top: 0 }])
        .png()
        .toBuffer(),
    );
    const out = await transformImage(path, {
      ...pad,
      background: "auto:predominant_gradient",
    });
    const [lr, , lb] = await pixel(out, 0, 50);
    const [rr, , rb] = await pixel(out, 299, 50);
    assert.ok(lr > 240 && lb < 15, `left ${lr},${lb}`);
    assert.ok(rb > 240 && rr < 15, `right ${rr},${rb}`);
    // The image itself is untouched in the middle.
    assert.deepEqual(await pixel(out, 120, 50), [255, 0, 0]);
  });
});

test("b_auto also resolves for rotation fill", async () => {
  await withDir(async (dir) => {
    const path = await framed(dir);
    const out = await transformImage(path, { rotate: 45, background: "auto" });
    assert.deepEqual(await pixel(out, 0, 0), [255, 0, 0]);
  });
});
