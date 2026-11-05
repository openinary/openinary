import sharp from "sharp";
import { readFile } from "fs/promises";
import Psd from "@webtoon/psd";
import { applyAspectRatio } from "./aspect-ratio";
import { applyRotation } from "./rotation";
import { applyQuality } from "./quality";
import { applyRoundCorners } from "./round-corners";
import { applyOverlayImage } from "./overlay";
import { applyResize } from "./resize";
import { applyEffects, hasEffects } from "./effects";
import { parseBackgroundColor } from "./background";
import { gradientCanvas, resolveAutoBackground } from "./auto-background";
import { parseAutoBackground } from "./effect-spec";
import { ImageTransformParams } from "../../types";
import { SHARP_INPUT_OPTIONS } from "./sharp-options";

// Re-export types for backward compatibility
export * from "./types";

/**
 * Decode a PSD file into a Sharp instance via raw RGBA pixel data.
 * Sharp cannot read PSD natively; @webtoon/psd composites all layers first.
 * The output is encoded as PNG so the temp-file step in processImage can read it.
 */
async function decodePsd(inputPath: string): Promise<sharp.Sharp> {
  const fileBuffer = await readFile(inputPath);
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  ) as ArrayBuffer;
  const psd = Psd.parse(arrayBuffer);
  const pixelData = await psd.composite();
  return sharp(Buffer.from(pixelData), {
    raw: { width: psd.width, height: psd.height, channels: 4 },
  }).png();
}

/**
 * Transform an image with the specified parameters
 */
export const transformImage = async (
  inputPath: string,
  inputParams: ImageTransformParams,
): Promise<Buffer> => {
  let image = inputPath.toLowerCase().endsWith(".psd")
    ? await decodePsd(inputPath)
    : sharp(inputPath, SHARP_INPUT_OPTIONS);

  // 0. Resolve b_auto against the source image, so every step that uses the
  // background (pad, rotation, rounded corners, opacity) gets a real color.
  let params = inputParams;
  let padGradient: Awaited<ReturnType<typeof resolveAutoBackground>>["gradient"];
  const autoSpec = params.background
    ? parseAutoBackground(params.background)
    : undefined;
  if (autoSpec) {
    const resolved = await resolveAutoBackground(image, autoSpec);
    params = { ...params, background: resolved.color };
    padGradient = resolved.gradient;
  }

  // 1. Apply flips, then rotation (a_hflip, a_vflip.45). Materialized in
  // between: sharp runs its own operation order inside one pipeline.
  if (params.flip) {
    if (params.flip.includes("h")) image = image.flop();
    if (params.flip.includes("v")) image = image.flip();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    image = sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    }).png();
  }
  if (params.rotate) {
    image = applyRotation(image, params.rotate, params.background);
  }

  // 2. Apply aspect ratio (if specified)
  if (params.aspect) {
    image = await applyAspectRatio(image, params.aspect, params.gravity);
    // Sharp only honors one resize() per pipeline, so a following resize would
    // override the aspect-ratio crop. Materialize the crop into a buffer first.
    if (params.width || params.height) {
      image = sharp(await image.toBuffer());
    }
  }

  // 3. Apply resize (if width or height specified)
  if (params.width || params.height) {
    const crop = params.crop || "fill";
    image = await applyResize(
      image,
      crop,
      params.gravity || "center",
      // A gradient pad is painted underneath: pad with transparency first.
      padGradient && crop === "pad" ? "transparent" : params.background,
      params.width,
      params.height,
      params.resizeLimit,
    );
    if (padGradient && crop === "pad") {
      const { data, info } = await image.png().toBuffer({ resolveWithObject: true });
      image = sharp(
        await gradientCanvas(info.width, info.height, padGradient)
          .composite([{ input: data }])
          .png()
          .toBuffer(),
      );
    }
  }

  // 4. Apply effects (e_) and opacity (o_), after resize so they work on the
  // delivered pixels, before the overlay so a watermark is left untouched.
  if (hasEffects(params)) {
    image = await applyEffects(image, params);
    // o_ adds transparency. Cloudinary bakes it onto the background (white
    // unless b_ says otherwise) when the output format has no alpha; do the
    // same when b_ is given or JPEG is requested explicitly.
    const opaqueOutput = params.format === "jpg" || params.format === "jpeg";
    if (
      params.opacity !== undefined &&
      params.opacity < 100 &&
      (params.background || opaqueOutput) &&
      params.background !== "transparent"
    ) {
      image = sharp(await image.toBuffer()).flatten({
        background: parseBackgroundColor(params.background),
      });
    }
  }

  // 5. Apply overlay image (if specified)
  if (params.overlayPath) {
    image = await applyOverlayImage(image, params);
  }

  // 6. Apply rounded corners (if specified)
  if (params.radius) {
    image = await applyRoundCorners(image, params.radius, params.background);
    // applyRoundCorners always returns a pipeline backed by a PNG buffer
    // (alpha-capable), so the intermediate toBuffer() in processImage will
    // correctly preserve transparency or the filled background color.
  }

  // 7. Apply quality (if specified)
  if (params.quality) {
    image = applyQuality(image, params.quality);
  }

  return await image.toBuffer();
};
