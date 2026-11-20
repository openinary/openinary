import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { enginePathsIn } from "../../config/paths";
import { detectVideoSettings } from "./config";
import { transformVideo } from "./index";

const hasFfmpeg = (() => {
  try {
    for (const binary of ["ffmpeg", "ffprobe"]) {
      execFileSync(binary, ["-version"], { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
})();
const options = { skip: !hasFfmpeg && "ffmpeg or ffprobe not installed" };
const settings = detectVideoSettings({ ffmpegThreads: 1, ffmpegNiceness: 0 }).settings;

function createVideo(path: string, withAudio: boolean) {
  execFileSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=10",
    ...(withAudio ? ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"] : []),
    "-t", "0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    ...(withAudio ? ["-c:a", "aac"] : ["-an"]),
    path,
  ]);
}

for (const extension of ["mp4", "mov"]) {
  for (const withAudio of [true, false]) {
    test(`resized WebP thumbnail from ${extension} ${withAudio ? "with" : "without"} audio`, options, async (t) => {
      const dir = await mkdtemp(join(tmpdir(), "thumbnail-test-"));
      t.after(() => rm(dir, { recursive: true, force: true }));
      const source = join(dir, `source.${extension}`);
      createVideo(source, withAudio);

      const buffer = await transformVideo(source, {
        format: "webp", thumbnailTime: 0, width: 64, height: 64, crop: "fill",
      }, { storage: null, paths: enginePathsIn(dir), settings });

      const image = await sharp(buffer).metadata();
      assert.equal(image.format, "webp");
      assert.equal(image.width, 64);
      assert.equal(image.height, 64);
      const { data } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.ok(data[0]! > 200 && data[1]! < 30 && data[2]! < 30, "thumbnail contains the source's red frame");
    });
  }

  test(`JPEG thumbnail without resize from ${extension} with audio`, options, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "thumbnail-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = join(dir, `source.${extension}`);
    createVideo(source, true);

    const buffer = await transformVideo(source, { format: "jpg", thumbnailTime: 0 }, {
      storage: null, paths: enginePathsIn(dir), settings,
    });

    const image = await sharp(buffer).metadata();
    assert.equal(image.format, "jpeg");
    assert.equal(image.width, 160);
    assert.equal(image.height, 90);
  });

  test(`resized video from ${extension} preserves audio`, options, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "thumbnail-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = join(dir, `source.${extension}`);
    createVideo(source, true);

    const buffer = await transformVideo(source, { format: "mp4", width: 64, height: 64, crop: "fill" }, {
      storage: null, paths: enginePathsIn(dir), settings,
    });
    const output = join(dir, "output.mp4");
    await writeFile(output, buffer);
    const { streams } = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", output,
    ], { encoding: "utf8" }));
    const video = streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
    assert.equal(video.width, 64);
    assert.equal(video.height, 64);
    assert.ok(streams.some((stream: { codec_type: string; codec_name: string }) =>
      stream.codec_type === "audio" && stream.codec_name === "aac"));
  });
}
