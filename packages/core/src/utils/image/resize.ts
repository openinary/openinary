import sharp from "sharp";
import { CropMode, GravityMode } from "./types";
import { getSharpPosition } from "./gravity";
import { parseBackgroundColor } from "./background";

/** Where an image sits on a larger canvas, by gravity. */
const placement = (gravity: GravityMode, free: number, axis: "x" | "y"): number => {
  const start = axis === "x" ? gravity === "west" : gravity === "north";
  const end = axis === "x" ? gravity === "east" : gravity === "south";
  if (start) return 0;
  if (end) return free;
  return Math.floor(free / 2);
};

/** Grow the canvas to width x height around the image, filled with background. */
const padTo = async (
  image: sharp.Sharp,
  gravity: GravityMode,
  background: string | undefined,
  width: number,
  height: number,
): Promise<sharp.Sharp> => {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const freeX = Math.max(0, width - info.width);
  const freeY = Math.max(0, height - info.height);
  const left = placement(gravity, freeX, "x");
  const top = placement(gravity, freeY, "y");
  const raw = sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  });
  if (freeX === 0 && freeY === 0) return raw.png();
  return sharp(
    await raw
      .extend({
        left,
        right: freeX - left,
        top,
        bottom: freeY - top,
        background: parseBackgroundColor(background),
      })
      .png()
      .toBuffer(),
  );
};

/**
 * c_lfill, c_lpad (limit "down": never enlarge) and c_mfit, c_mpad (limit
 * "up": never reduce).
 */
const applyLimitedResize = async (
  image: sharp.Sharp,
  cropMode: CropMode,
  limit: "down" | "up",
  gravity: GravityMode,
  background: string | undefined,
  width?: number,
  height?: number,
): Promise<sharp.Sharp> => {
  const box = {
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
  };
  if (cropMode === "fill") {
    // lfill: cover, but a smaller image is only cropped, never scaled up.
    return image.resize({
      ...box,
      fit: "cover",
      position: getSharpPosition(gravity),
      withoutEnlargement: true,
    });
  }
  if (cropMode === "fit") {
    // mfit: scale up to fit the box when smaller, leave larger images alone.
    return image.resize({ ...box, fit: "inside", withoutReduction: true });
  }
  // pad
  const scaled =
    limit === "down"
      ? // lpad: shrink to fit if larger, then pad to the exact size.
        image.resize({ ...box, fit: "inside", withoutEnlargement: true })
      : // mpad: never resized, only padded when the box is larger.
        image;
  if (width === undefined || height === undefined) return scaled;
  return padTo(scaled, gravity, background, width, height);
};

/**
 * Apply resize transformation to an image
 */
export const applyResize = async (
  image: sharp.Sharp,
  cropMode: CropMode = "fill",
  gravity: GravityMode = "center",
  background?: string,
  width?: number,
  height?: number,
  resizeLimit?: "down" | "up",
): Promise<sharp.Sharp> => {
  // If neither width nor height is specified, return image unchanged
  if (width === undefined && height === undefined) {
    return image;
  }

  if (resizeLimit) {
    return applyLimitedResize(
      image,
      cropMode,
      resizeLimit,
      gravity,
      background,
      width,
      height,
    );
  }

  const resizeOptions: sharp.ResizeOptions = {
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
  };

  switch (cropMode) {
    case "fill":
      // Resize to fill the entire area, cropping if necessary
      resizeOptions.fit = "cover";
      resizeOptions.position = getSharpPosition(gravity);
      break;

    case "fit":
      // Resize to fit within the dimensions, maintaining aspect ratio
      resizeOptions.fit = "inside";
      resizeOptions.withoutEnlargement = true;
      break;

    case "scale":
      // Scale to exact dimensions, ignoring aspect ratio
      resizeOptions.fit = "fill";
      break;

    case "crop":
      // Resize and crop to exact dimensions, maintaining aspect ratio
      resizeOptions.fit = "cover";
      resizeOptions.position = getSharpPosition(gravity);
      break;

    case "pad":
      // Resize to fit within dimensions and pad with background color
      resizeOptions.fit = "contain";
      resizeOptions.background = parseBackgroundColor(background);
      break;

    default:
      // Default to fill mode
      resizeOptions.fit = "cover";
      resizeOptions.position = getSharpPosition(gravity);
  }

  return image.resize(resizeOptions);
};
