import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { getSharpPosition } from "./gravity";
import { transformImage } from "./index";

test("g_auto and g_face both crop on salience, not entropy", () => {
  assert.equal(getSharpPosition("auto"), "attention");
  assert.equal(getSharpPosition("face"), "attention");
});

// A wide banner: busy grey noise on the left (high entropy, like rippling
// water), a saturated warm subject on the right. Entropy cropping drifts
// towards the noise at some sizes; g_auto should keep the subject in frame
// at every size, the way Cloudinary's g_auto does.
async function withBanner(run: (path: string) => Promise<void>) {
  const width = 1440;
  const height = 380;
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const subject = x >= 980 && x < 1180 && y >= 60 && y < 340;
      if (subject) {
        pixels[i] = 220;
        pixels[i + 1] = 60;
        pixels[i + 2] = 50;
      } else {
        const v = x < 800 ? Math.round(random() * 255) : 128;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
      }
    }
  }
  const dir = await mkdtemp(join(tmpdir(), "gravity-"));
  const path = join(dir, "banner.png");
  try {
    await writeFile(path, await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer());
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("g_auto keeps the subject in a square crop at every size", async () => {
  await withBanner(async (path) => {
    for (const size of [120, 180, 240, 300, 360, 420, 475, 600]) {
      const out = await transformImage(path, { width: size, height: size, crop: "fill", gravity: "auto" });
      const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      assert.ok(r > 180 && g < 110 && b < 110, `w_${size}: centre pixel ${r},${g},${b} is not the subject`);
    }
  });
});
