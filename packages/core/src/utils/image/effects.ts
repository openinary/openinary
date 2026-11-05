import sharp from "sharp";
import { parseBackgroundColor } from "./background";
import {
  type ParsedEffect,
  numericArg,
  parseColor,
  parseContrast,
  parseEffect,
  parseTint,
} from "./effect-spec";

/**
 * Image effects (Cloudinary's `e_` parameter) and opacity (`o_`).
 *
 * Effects run after resize, so they work on the delivered pixels rather than
 * the full-size original, and before overlays and rounded corners, so a
 * watermark is never blurred or recoloured along with the photo.
 *
 * Each effect materializes the pipeline to raw pixels before the next one
 * runs. Sharp applies the operations of a single pipeline in its own fixed
 * order and keeps only the last call of each (two modulate() calls collapse
 * into one), so chaining them on one pipeline would silently ignore the
 * order the URL asked for. Raw buffers keep that cheap: no encode or decode
 * between steps.
 */

type RawImage = { data: Buffer; info: sharp.OutputInfo };


const toRaw = async (image: sharp.Sharp): Promise<RawImage> => {
  const { data, info } = await image
    .raw({ depth: "uchar" })
    .toBuffer({ resolveWithObject: true });
  return { data, info };
};

const fromRaw = (raw: RawImage): sharp.Sharp =>
  sharp(raw.data, {
    raw: {
      width: raw.info.width,
      height: raw.info.height,
      channels: raw.info.channels as 1 | 2 | 3 | 4,
    },
  });

const hasAlpha = (channels: number) => channels === 2 || channels === 4;
const colorChannels = (channels: number) => (channels >= 3 ? 3 : 1);

/**
 * Apply a per-pixel luminance factor table: every color channel of a pixel
 * is multiplied by factor[L], where L is the pixel's luminance (0-255).
 * Scaling all channels by the same factor keeps hue and saturation, which is
 * what separates a fill light from a plain brightness curve.
 */
const applyLuminanceFactors = (raw: RawImage, factors: Float32Array): RawImage => {
  const { data, info } = raw;
  const channels = info.channels;
  const colors = colorChannels(channels);
  const out = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i += channels) {
    const lum =
      colors === 3
        ? Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])
        : data[i];
    const f = factors[lum];
    for (let c = 0; c < colors; c++) {
      const v = data[i + c] * f;
      out[i + c] = v > 255 ? 255 : v;
    }
    if (hasAlpha(channels)) out[i + colors] = data[i + colors];
  }
  return { data: out, info };
};

/** Apply the same 256-entry lookup table to every color channel. */
const applyChannelLut = (raw: RawImage, lut: Uint8Array): RawImage => {
  const { data, info } = raw;
  const channels = info.channels;
  const colors = colorChannels(channels);
  const out = Buffer.from(data);
  for (let i = 0; i < data.length; i += channels) {
    for (let c = 0; c < colors; c++) out[i + c] = lut[data[i + c]];
  }
  return { data: out, info };
};

/**
 * Fill light: lifts shadows and midtones while leaving highlights where they
 * are, like a reflector held on the dark side of a subject.
 *
 * Cloudinary does not document its algorithm, so this is an approximation
 * with the same interface: a gamma lift on luminance, strength 0.6 shifted by
 * bias (-100 removes the lift, 100 doubles it), then mixed with the original
 * by blend (0 = original only, 100 = lifted only).
 */
const fillLight = (raw: RawImage, blend: number, bias: number): RawImage => {
  const strength = 0.6 * (1 + bias / 100);
  const gamma = 1 / (1 + strength);
  const mix = blend / 100;
  const factors = new Float32Array(256);
  for (let lum = 0; lum < 256; lum++) {
    if (lum === 0) {
      factors[lum] = 1;
      continue;
    }
    const l = lum / 255;
    // Cap the gain so near-black noise is not amplified into color speckle.
    const ratio = Math.min(l ** gamma / l, 4);
    factors[lum] = 1 + mix * (ratio - 1);
  }
  return applyLuminanceFactors(raw, factors);
};

/** Cloudinary e_gamma: -50..150, 0 = unchanged, higher = brighter midtones. */
const gammaLut = (level: number): Uint8Array => {
  const exponent = 1 / (1 + level / 100);
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * (i / 255) ** exponent);
  return lut;
};

/**
 * Sigmoidal contrast, Cloudinary's default e_contrast type: an S-curve
 * around mid-gray. Positive levels steepen it, negative levels flatten it
 * 0 is unchanged.
 */
const sigmoidalContrastLut = (level: number): Uint8Array => {
  const lut = new Uint8Array(256);
  if (level === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const strength = (Math.abs(level) / 100) * 10;
  const sig = (x: number) => 1 / (1 + Math.exp(-strength * (x - 0.5)));
  const lo = sig(0);
  const hi = sig(1);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let y: number;
    if (level > 0) {
      y = (sig(x) - lo) / (hi - lo);
    } else {
      // Inverse of the same S-curve: compresses the tones toward mid-gray.
      const v = lo + x * (hi - lo);
      y = 0.5 - Math.log(1 / v - 1) / strength;
    }
    lut[i] = Math.round(Math.min(1, Math.max(0, y)) * 255);
  }
  return lut;
};

const LUMA = [0.2126, 0.7152, 0.0722];
const GRAYSCALE_MATRIX: sharp.Matrix3x3 = [LUMA, LUMA, LUMA] as sharp.Matrix3x3;
const SEPIA_MATRIX: sharp.Matrix3x3 = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];

/** Mix a 3x3 color matrix with identity: amount 0 = unchanged, 1 = full. */
const mixWithIdentity = (matrix: sharp.Matrix3x3, amount: number): sharp.Matrix3x3 =>
  matrix.map((row, r) =>
    row.map((v, c) => v * amount + (r === c ? 1 - amount : 0)),
  ) as sharp.Matrix3x3;

/**
 * Tint/colorize: blend every pixel toward a color picked from `stops` by the
 * pixel's luminance (one stop = one flat color), rescaled to keep that
 * luminance so the image still reads; a flat fill would be an overlay, not a
 * tint. amount is 0..1.
 */
const blendTowardColors = (
  raw: RawImage,
  stops: { color: string; position: number }[],
  amount: number,
): RawImage => {
  const rgbStops = stops.map((s) => {
    const { r, g, b } = parseBackgroundColor(s.color);
    return { rgb: [r, g, b], at: (s.position / 100) * 255 };
  });
  // Precompute the luminance-preserving target color for each luminance.
  const table = new Float32Array(256 * 3);
  for (let lum = 0; lum < 256; lum++) {
    let rgb = rgbStops[0].rgb;
    if (lum >= rgbStops[rgbStops.length - 1].at) {
      rgb = rgbStops[rgbStops.length - 1].rgb;
    } else {
      for (let k = 0; k + 1 < rgbStops.length; k++) {
        const a = rgbStops[k];
        const b = rgbStops[k + 1];
        if (lum >= a.at && lum < b.at) {
          const t = (lum - a.at) / (b.at - a.at || 1);
          rgb = a.rgb.map((v, c) => v + (b.rgb[c] - v) * t);
          break;
        }
      }
    }
    const targetLum = LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
    for (let c = 0; c < 3; c++) {
      table[lum * 3 + c] = targetLum > 0 ? (rgb[c] * lum) / targetLum : lum;
    }
  }
  const { data, info } = raw;
  const channels = info.channels;
  const out = Buffer.from(data);
  for (let i = 0; i < data.length; i += channels) {
    const lum = Math.round(
      LUMA[0] * data[i] + LUMA[1] * data[i + 1] + LUMA[2] * data[i + 2],
    );
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] * (1 - amount) + table[lum * 3 + c] * amount;
      out[i + c] = v > 255 ? 255 : v < 0 ? 0 : v;
    }
  }
  return { data: out, info };
};

const ensureColor = (raw: RawImage): Promise<RawImage> =>
  colorChannels(raw.info.channels) === 3
    ? Promise.resolve(raw)
    : toRaw(fromRaw(raw).toColourspace("srgb"));

const viaSharp = async (
  raw: RawImage,
  op: (image: sharp.Sharp) => sharp.Sharp,
): Promise<RawImage> => toRaw(op(fromRaw(raw)));

const applyEffect = async (
  raw: RawImage,
  effect: ParsedEffect,
  color?: string,
): Promise<RawImage> => {
  switch (effect.name) {
    case "fill_light":
      return fillLight(raw, numericArg(effect, 0), numericArg(effect, 1));

    case "blur": {
      // Cloudinary's 1-2000 strength onto a Gaussian sigma: 100 (the default)
      // is a clearly soft image (sigma 5), 2000 is unrecognizable (sigma 100).
      const sigma = Math.max(0.3, numericArg(effect, 0) / 20);
      return viaSharp(raw, (i) => i.blur(sigma));
    }

    case "sharpen":
    case "unsharp_mask": {
      const strength = numericArg(effect, 0);
      // sharp.sharpen is an unsharp mask; the two names differ in Cloudinary
      // mostly by radius, which here means sigma.
      const sigma = Math.min(
        10,
        effect.name === "unsharp_mask" ? 1 + strength / 100 : 0.5 + strength / 200,
      );
      return viaSharp(raw, (i) => i.sharpen({ sigma, m2: 1 + strength / 50 }));
    }

    case "grayscale":
      // recomb instead of sharp.grayscale(): grayscale() drops to a one-band
      // b-w image and, on raw output, loses the alpha channel with it.
      return viaSharp(await ensureColor(raw), (i) => i.recomb(GRAYSCALE_MATRIX));

    case "sepia":
      return viaSharp(await ensureColor(raw), (i) =>
        i.recomb(mixWithIdentity(SEPIA_MATRIX, numericArg(effect, 0) / 100)),
      );

    case "negate":
      return viaSharp(raw, (i) => i.negate({ alpha: false }));

    case "brightness": {
      // -99..100 as a percentage change of lightness (100 doubles it).
      const factor = 1 + numericArg(effect, 0) / 100;
      return viaSharp(raw, (i) => i.linear(factor, 0));
    }

    case "contrast": {
      const { level, type } = parseContrast(effect.args[0] ?? "0")!;
      if (type === "linear") {
        // Percent, like CSS contrast(): 100 unchanged, 200 doubles it.
        const a = level / 100;
        return viaSharp(raw, (i) => i.linear(a, 128 * (1 - a)));
      }
      return applyChannelLut(raw, sigmoidalContrastLut(level));
    }

    case "saturation":
      return viaSharp(await ensureColor(raw), (i) =>
        i.modulate({ saturation: 1 + numericArg(effect, 0) / 100 }),
      );

    case "hue":
      // -100..100 as a fraction of a half turn around the color wheel.
      return viaSharp(await ensureColor(raw), (i) =>
        i.modulate({ hue: Math.round(numericArg(effect, 0) * 1.8) }),
      );

    case "gamma":
      return applyChannelLut(raw, gammaLut(numericArg(effect, 0)));

    case "pixelate": {
      const { width, height } = raw.info;
      // No size: Cloudinary picks one from the image dimensions.
      const size = effect.args[0]
        ? Number(effect.args[0])
        : Math.max(4, Math.round(Math.min(width, height) / 40));
      const small = await toRaw(
        fromRaw(raw).resize({
          width: Math.max(1, Math.round(width / size)),
          height: Math.max(1, Math.round(height / size)),
          kernel: "nearest",
        }),
      );
      return toRaw(fromRaw(small).resize({ width, height, kernel: "nearest" }));
    }

    case "trim": {
      const tolerance = numericArg(effect, 0);
      const background = effect.args[1] ? parseColor(effect.args[1]) : undefined;
      try {
        // sharp's threshold is a 0-255 color distance; scale the 0-100 tolerance.
        return await viaSharp(raw, (i) =>
          i.trim({
            threshold: Math.round(tolerance * 2.55),
            ...(background && { background }),
          }),
        );
      } catch {
        // Nothing to trim (a uniform image): keep it as is rather than 500.
        return raw;
      }
    }

    case "tint": {
      const spec = parseTint(effect.args)!;
      let base = await ensureColor(raw);
      if (spec.equalize) base = await viaSharp(base, (i) => i.normalise());
      return blendTowardColors(base, spec.stops, spec.amount / 100);
    }

    case "colorize": {
      const amount = numericArg(effect, 0) / 100;
      return blendTowardColors(
        await ensureColor(raw),
        [{ color: color ?? "#808080", position: 50 }],
        amount,
      );
    }
  }
};

/**
 * Multiply the alpha channel by opacity/100, adding one if the image has
 * none. JPEG output cannot carry it, so the result is composited on `b_`
 * (white by default) when the delivered format is opaque - same as rounded
 * corners.
 */
const applyOpacity = async (raw: RawImage, opacity: number): Promise<RawImage> => {
  const withAlpha = hasAlpha(raw.info.channels)
    ? raw
    : await toRaw(fromRaw(raw).ensureAlpha());
  const { data, info } = withAlpha;
  const channels = info.channels;
  const out = Buffer.from(data);
  const factor = opacity / 100;
  for (let i = channels - 1; i < out.length; i += channels) {
    out[i] = Math.round(out[i] * factor);
  }
  return { data: out, info };
};

export interface EffectOptions {
  effects?: string[];
  opacity?: number;
  /** co_ color, used by e_colorize. */
  color?: string;
}

export const hasEffects = (options: EffectOptions): boolean =>
  (options.effects?.length ?? 0) > 0 ||
  (options.opacity !== undefined && options.opacity < 100);

/**
 * Apply every e_ effect in URL order, then o_ opacity. Returns a pipeline
 * backed by raw pixels with PNG set as its output format, so the alpha
 * channel survives into the compression step.
 */
export const applyEffects = async (
  image: sharp.Sharp,
  options: EffectOptions,
): Promise<sharp.Sharp> => {
  if (!hasEffects(options)) return image;
  let raw = await toRaw(image);
  for (const value of options.effects ?? []) {
    const effect = parseEffect(value);
    if (effect) raw = await applyEffect(raw, effect, options.color);
  }
  if (options.opacity !== undefined && options.opacity < 100) {
    raw = await applyOpacity(raw, options.opacity);
  }
  return fromRaw(raw).png();
};
