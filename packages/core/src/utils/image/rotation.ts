import sharp from "sharp";
import { parseBackgroundColor } from "./background";

/**
 * Apply rotation transformation to an image
 */
export const applyRotation = (
  image: sharp.Sharp,
  rotateParam: number,
  background?: string,
): sharp.Sharp => {
  const backgroundColor = parseBackgroundColor(background);

  return image.rotate(rotateParam, { background: backgroundColor });
};
