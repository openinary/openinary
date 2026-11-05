import sharp from "sharp";

/**
 * Turn the pixels upright according to the EXIF Orientation tag, as Cloudinary
 * does by default. Phone cameras store portrait shots as landscape pixels plus
 * an orientation tag (6 or 8); the final encode strips metadata, so without
 * this every transformed phone photo came out sideways.
 *
 * Images without an orientation tag (or with orientation 1) pass through
 * untouched. Oriented ones are materialized here rather than left as a pending
 * `rotate()`: later steps read `metadata()`, which reports the *stored*
 * dimensions (aspect ratio and overlay sizing would crop the wrong axis), and
 * sharp keeps only one rotate per pipeline, so an explicit `a_90` would
 * silently replace the auto-orientation. The intermediate is encoded in the
 * source format so the rest of the pipeline behaves exactly as for an upright
 * source, losslessly where the format allows it.
 */
export const applyAutoOrient = async (
  image: sharp.Sharp,
): Promise<sharp.Sharp> => {
  const { orientation, format } = await image.metadata();
  if (!orientation || orientation === 1) return image;

  let upright = image.rotate();
  switch (format) {
    case "jpeg":
      upright = upright.jpeg({ quality: 100, chromaSubsampling: "4:4:4" });
      break;
    case "webp":
      upright = upright.webp({ lossless: true });
      break;
    // Anything else keeps sharp's default: the source format (png, tiff, ...).
  }
  return sharp(await upright.toBuffer());
};
