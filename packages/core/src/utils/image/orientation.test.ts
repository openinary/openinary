import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { transformImage } from "./index";
import { parseParams } from "../parser";
import { KeyGenerator } from "../storage/key-generator";

// A phone-style photo: stored as 400x200 landscape pixels (left half red,
// right half blue) with EXIF orientation 6, i.e. "rotate 90° clockwise to
// display". Upright it is 200x400 with red on top and blue at the bottom.
let dir: string;
let photo: string;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "orientation-"));
  const raw = Buffer.alloc(400 * 200 * 3);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 400; x++) {
      const i = (y * 400 + x) * 3;
      if (x < 200) raw[i] = 255;
      else raw[i + 2] = 255;
    }
  }
  photo = join(dir, "phone.jpg");
  await writeFile(
    photo,
    await sharp(raw, { raw: { width: 400, height: 200, channels: 3 } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer(),
  );
});

after(() => rm(dir, { recursive: true, force: true }));

/** Size of the output and whether the pixel at (x, y) is mostly red. */
const probe = async (buf: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { width: info.width, height: info.height, red: data[i] > data[i + 2] };
};

const transform = (url: string) =>
  transformImage(photo, parseParams(`/t/${url}/phone.jpg`));

test("resize follows EXIF orientation", async () => {
  const out = await transform("w_100,h_300,c_fill");
  assert.deepEqual(await probe(out, 50, 10), { width: 100, height: 300, red: true });
  assert.deepEqual(await probe(out, 50, 290), { width: 100, height: 300, red: false });
  assert.equal((await sharp(out).metadata()).orientation, undefined);
});

test("aspect ratio crops the upright image", async () => {
  // Upright 200x400 cropped to 1:1 keeps the middle: 200x200, red top half.
  const out = await transform("ar_1:1");
  assert.deepEqual(await probe(out, 100, 10), { width: 200, height: 200, red: true });
  assert.deepEqual(await probe(out, 100, 190), { width: 200, height: 200, red: false });
});

test("an explicit angle rotates the upright image", async () => {
  // Upright red-top, then 90° clockwise: 400x200 with red on the right.
  const out = await transform("a_90");
  assert.deepEqual(await probe(out, 390, 100), { width: 400, height: 200, red: true });
  assert.deepEqual(await probe(out, 10, 100), { width: 400, height: 200, red: false });
});

test("a_auto behaves like no angle", async () => {
  const out = await transform("a_auto,w_100");
  assert.deepEqual(await probe(out, 50, 10), { width: 100, height: 200, red: true });
});

test("a_ignore keeps the stored orientation", async () => {
  const out = await transform("a_ignore,w_200");
  assert.deepEqual(await probe(out, 10, 50), { width: 200, height: 100, red: true });
  assert.deepEqual(await probe(out, 190, 50), { width: 200, height: 100, red: false });
});

test("parsed params (and so cache keys) are unchanged for existing URLs", () => {
  assert.deepEqual(parseParams("/t/w_100,h_300,c_fill/a.jpg"), {
    width: 100,
    height: 300,
    crop: "fill",
  });
  assert.deepEqual(parseParams("/t/a_auto,w_100/a.jpg"), {
    rotate: undefined,
    width: 100,
  });
  assert.equal(
    KeyGenerator.generateKey("a.jpg", parseParams("/t/a_90/a.jpg")),
    KeyGenerator.generateKey("a.jpg", { rotate: 90 }),
  );
  assert.deepEqual(parseParams("/t/a_ignore/a.jpg"), { ignoreOrientation: true });
});
