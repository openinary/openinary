import sharp from "sharp";
import type { AutoBackgroundSpec } from "./effect-spec";

type Rgb = [number, number, number];

/**
 * b_auto: pick the pad color (or gradient colors) from the image itself.
 *
 * The image is sampled at most 256 px on its longer side. A color is the
 * predominant one of a region: pixels are binned at 4 bits per channel
 * (4096 bins), the fullest bin wins and its pixels are averaged, so a
 * photo's dominant tone is found without being muddied by a plain mean.
 * Mostly-transparent pixels are skipped; a region with nothing opaque
 * yields transparent.
 *
 * Regions: "border" samples a band along the edges (5% of the shorter
 * side), "predominant" the whole image. Gradients take one color per side
 * (2 colors: left/right, top/bottom, or the two corners the diagonal joins)
 * or per quadrant (4 colors), restricted to the border band in border modes.
 */

export interface ResolvedAutoBackground {
  /** "#rrggbb", or "transparent". The first gradient color for gradients. */
  color: string;
  /** Gradient colors in the order the direction needs (see gradientCanvas). */
  gradient?: { colors: string[]; direction: AutoBackgroundSpec["direction"] };
}

type Region = (x: number, y: number, w: number, h: number) => boolean;

const SIDES: Record<string, Region> = {
  left: (x, _y, w) => x < w / 2,
  right: (x, _y, w) => x >= w / 2,
  top: (_x, y, _w, h) => y < h / 2,
  bottom: (_x, y, _w, h) => y >= h / 2,
  topLeft: (x, y, w, h) => x < w / 2 && y < h / 2,
  topRight: (x, y, w, h) => x >= w / 2 && y < h / 2,
  bottomLeft: (x, y, w, h) => x < w / 2 && y >= h / 2,
  bottomRight: (x, y, w, h) => x >= w / 2 && y >= h / 2,
  all: () => true,
};

/** Region order per gradient layout; gradientCanvas reads them in this order. */
const GRADIENT_REGIONS: Record<string, (keyof typeof SIDES)[]> = {
  horizontal: ["left", "right"],
  vertical: ["top", "bottom"],
  diagonal_desc: ["topLeft", "bottomRight"],
  diagonal_asc: ["bottomLeft", "topRight"],
  four: ["topLeft", "topRight", "bottomLeft", "bottomRight"],
};

const predominant = (
  data: Buffer,
  width: number,
  height: number,
  include: (x: number, y: number) => boolean,
): Rgb | undefined => {
  const counts = new Uint32Array(4096);
  const sums = new Float64Array(4096 * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!include(x, y)) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const bin = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      counts[bin]++;
      sums[bin * 3] += data[i];
      sums[bin * 3 + 1] += data[i + 1];
      sums[bin * 3 + 2] += data[i + 2];
    }
  }
  let best = -1;
  for (let bin = 0; bin < 4096; bin++) {
    if (counts[bin] > 0 && (best === -1 || counts[bin] > counts[best])) best = bin;
  }
  if (best === -1) return undefined;
  const n = counts[best];
  return [
    Math.round(sums[best * 3] / n),
    Math.round(sums[best * 3 + 1] / n),
    Math.round(sums[best * 3 + 2] / n),
  ];
};

const rgbToHsl = ([r, g, b]: Rgb): [number, number, number] => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
};

const hslToRgb = ([h, s, l]: [number, number, number]): Rgb => {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
};

/**
 * The strongest contrast to a color: the opposite hue at the opposite end
 * of the lightness scale, so even a mid-gray gets a clearly different color.
 */
export const contrastColor = (rgb: Rgb): Rgb => {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([(h + 0.5) % 1, s, l < 0.5 ? Math.max(0.85, 1 - l) : Math.min(0.15, 1 - l)]);
};

const hexToRgb = (hex: string): Rgb => {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const distance = (a: Rgb, b: Rgb) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

const nearest = (rgb: Rgb, palette: Rgb[]): Rgb =>
  palette.reduce((best, c) => (distance(c, rgb) < distance(best, rgb) ? c : best));

const toHex = (rgb: Rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

export const resolveAutoBackground = async (
  image: sharp.Sharp,
  spec: AutoBackgroundSpec,
): Promise<ResolvedAutoBackground> => {
  const { data, info } = await image
    .clone()
    .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw({ depth: "uchar" })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.05));
  const inBorder = (x: number, y: number) =>
    x < band || y < band || x >= width - band || y >= height - band;

  const regionNames = spec.gradient
    ? GRADIENT_REGIONS[spec.colors === 4 ? "four" : spec.direction]
    : (["all"] as const);
  const palette = spec.palette?.map(hexToRgb);

  const colors = regionNames.map((name) => {
    const region = SIDES[name];
    let rgb = predominant(
      data,
      width,
      height,
      (x, y) => region(x, y, width, height) && (spec.source === "predominant" || inBorder(x, y)),
    );
    if (!rgb) return undefined;
    if (spec.contrast) rgb = contrastColor(rgb);
    if (palette?.length) rgb = nearest(rgb, palette);
    return toHex(rgb);
  });

  if (colors.some((c) => c === undefined)) return { color: "transparent" };
  const hexes = colors as string[];
  return spec.gradient
    ? { color: hexes[0], gradient: { colors: hexes, direction: spec.direction } }
    : { color: hexes[0] };
};

/**
 * A width x height RGB canvas painted with the gradient: two colors along
 * the direction, or four colors interpolated between the corners
 * (top-left, top-right, bottom-left, bottom-right).
 */
export const gradientCanvas = (
  width: number,
  height: number,
  gradient: NonNullable<ResolvedAutoBackground["gradient"]>,
): sharp.Sharp => {
  const c = gradient.colors.map(hexToRgb);
  const out = Buffer.alloc(width * height * 3);
  const wx = width > 1 ? width - 1 : 1;
  const hy = height > 1 ? height - 1 : 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / wx;
      const v = y / hy;
      let rgb: number[];
      if (c.length === 4) {
        rgb = [0, 1, 2].map(
          (k) =>
            c[0][k] * (1 - u) * (1 - v) +
            c[1][k] * u * (1 - v) +
            c[2][k] * (1 - u) * v +
            c[3][k] * u * v,
        );
      } else {
        const t =
          gradient.direction === "horizontal"
            ? u
            : gradient.direction === "vertical"
              ? v
              : gradient.direction === "diagonal_desc"
                ? (u + v) / 2
                : (u + (1 - v)) / 2;
        rgb = [0, 1, 2].map((k) => c[0][k] * (1 - t) + c[1][k] * t);
      }
      const i = (y * width + x) * 3;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
    }
  }
  return sharp(out, { raw: { width, height, channels: 3 } });
};
