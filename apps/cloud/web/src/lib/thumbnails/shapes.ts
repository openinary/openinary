// One square source crop per asset, whatever slot renders it. @openinary/ui
// asks for four sizes (500² and 250² previews plus a 1:2 folder card), but
// they all resolve to the same stored object server-side (see
// dashboardThumbParams in worker/transform-cache.ts), and every slot fits
// what it gets to its own box: the folder-card ones are object-cover (so the
// 1:2 slot just center-crops this square horizontally), and AssetPreview's is
// object-contain inside an aspect-square container, which a square fills
// exactly.
//
// 400px is that one size: the largest slot asks for 500, and a webp thumbnail
// upscaled 1.25x there is indistinguishable from a native one, while encoding
// the full 500 would cost ~1.5x the bytes for a preview tile nobody inspects.
export const THUMB_SIZE = 400;

// webp is the one format these are ever stored and served in - see
// DASHBOARD_THUMB_FORMAT in worker/transform-cache.ts.
export const THUMB_MIME = "image/webp";
export const THUMB_QUALITY = 0.75;

// The multipart field name the upload route reads.
export const THUMB_FIELD = "thumb";

// Cover-crops whatever was drawn into the square canvas, the same way the CSS
// object-cover on the destination <img> would.
export function drawCover(
  draw: (
    ctx: OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(THUMB_SIZE, THUMB_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  draw(ctx, THUMB_SIZE, THUMB_SIZE);
  return canvas.convertToBlob({ type: THUMB_MIME, quality: THUMB_QUALITY });
}
