import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { enginePathsIn } from "../../config/paths";
import { TransformService } from "../../services/transform.service";

test("f_jpg puts transparent pixels on the b_ color, white by default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jpeg-bg-"));
  try {
    await mkdir(join(dir, "public"), { recursive: true });
    const clear = { r: 0, g: 0, b: 0, alpha: 0 };
    await writeFile(
      join(dir, "public", "clear.png"),
      await sharp({ create: { width: 20, height: 20, channels: 4, background: clear } }).png().toBuffer(),
    );
    const service = new TransformService(null, {} as any, enginePathsIn(dir));
    const corner = async (path: string) => {
      const { buffer } = await service.transform({ path, userAgent: "", acceptHeader: "image/jpeg" });
      const { data } = await sharp(buffer!).raw().toBuffer({ resolveWithObject: true });
      return [...data.subarray(0, 3)];
    };
    assert.ok((await corner("/t/f_jpg/clear.png")).every((v) => v > 245));
    const [r, g, b] = await corner("/t/f_jpg,b_rgb:ff0000/clear.png");
    assert.ok(r > 245 && g < 10 && b < 10, `${[r, g, b]}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
