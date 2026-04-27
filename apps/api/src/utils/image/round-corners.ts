import sharp from 'sharp';
import { parseBackgroundColor } from './background';

/**
 * Expand a Cloudinary-style radius spec to [tl, tr, br, bl] corner values,
 * following CSS border-radius replication rules:
 *   1 value  → all four corners the same
 *   2 values → v1 = TL+BR, v2 = TR+BL
 *   3 values → v1 = TL, v2 = TR+BL, v3 = BR
 *   4 values → TL, TR, BR, BL (clockwise from top-left)
 */
function expandRadii(spec: string, maxRadius: number): [number, number, number, number] {
  const parts = spec.split(':').map(Number);
  let tl: number, tr: number, br: number, bl: number;

  switch (parts.length) {
    case 1:
      tl = tr = br = bl = parts[0];
      break;
    case 2:
      tl = br = parts[0];
      tr = bl = parts[1];
      break;
    case 3:
      tl = parts[0];
      tr = bl = parts[1];
      br = parts[2];
      break;
    default:
      tl = parts[0];
      tr = parts[1];
      br = parts[2];
      bl = parts[3];
  }

  // Clamp each radius so corners never overlap
  const clamp = (v: number) => Math.min(v, maxRadius);
  return [clamp(tl), clamp(tr), clamp(br), clamp(bl)];
}

/**
 * Build an SVG mask with rounded corners sized to the given dimensions.
 * Uses an ellipse for r_max, and an arc-based path for explicit radii.
 */
function buildMaskSvg(width: number, height: number, radiusSpec: string): string {
  const w = width;
  const h = height;
  const maxRadius = Math.floor(Math.min(w, h) / 2);

  if (radiusSpec === 'max') {
    const rx = w / 2;
    const ry = h / 2;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<ellipse cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" fill="white"/>` +
      `</svg>`
    );
  }

  const [tl, tr, br, bl] = expandRadii(radiusSpec, maxRadius);

  // SVG arc path: M tl,0 → top edge → TR arc → right edge → BR arc → bottom edge → BL arc → left edge → TL arc → close
  const path =
    `M ${tl},0 ` +
    `H ${w - tr} ` +
    `A ${tr},${tr} 0 0 1 ${w},${tr} ` +
    `V ${h - br} ` +
    `A ${br},${br} 0 0 1 ${w - br},${h} ` +
    `H ${bl} ` +
    `A ${bl},${bl} 0 0 1 0,${h - bl} ` +
    `V ${tl} ` +
    `A ${tl},${tl} 0 0 1 ${tl},0 ` +
    `Z`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<path d="${path}" fill="white"/>` +
    `</svg>`
  );
}

/**
 * Apply rounded corners to a Sharp image using an SVG alpha mask.
 *
 * Without a background: corners become transparent — use a format that
 * preserves alpha (PNG, WebP, AVIF). JPEG will bake transparency onto black.
 *
 * With a background color: corners are filled with that color instead of
 * becoming transparent, so any output format (including JPEG) works.
 */
export const applyRoundCorners = async (
  image: sharp.Sharp,
  radiusSpec: string,
  background?: string
): Promise<sharp.Sharp> => {
  // Materialize any pending operations (e.g. resize) so we get the actual
  // output dimensions. image.metadata() only returns the *input* dimensions
  // and would produce an oversized mask that Sharp refuses to composite.
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const svg = buildMaskSvg(width, height, radiusSpec);

  // Apply the mask. Must materialize to a PNG buffer before flattening:
  // Sharp runs flatten BEFORE composite internally, so chaining
  // .composite(...).flatten(...) would flatten first (no-op) and leave
  // the corners created by composite unfilled (they'd bake to black).
  const maskedBuffer = await sharp(data)
    .ensureAlpha()
    .composite([{ input: Buffer.from(svg), blend: 'dest-in' }])
    .png()
    .toBuffer();

  // If a background color is specified, fill transparent corners in a new
  // pipeline where flatten sees the alpha produced by the composite above.
  if (background) {
    return sharp(maskedBuffer).flatten({ background: parseBackgroundColor(background) });
  }

  return sharp(maskedBuffer);
};
