/**
 * Client-side rendering for the Images playground, used only for a file the
 * user brought themselves - the demo media is precomputed and served
 * statically (see components/playground/demo-assets.ts).
 *
 * Same OffscreenCanvas approach as lib/thumbnails, deliberately not sharing
 * its drawCover: that one is fixed to one square size and one quality tuned
 * for grid tiles, and it sits on the dashboard's critical path.
 *
 * WebP only. No browser can encode AVIF from a canvas - they all decode it,
 * none encode it - so the playground says so rather than pretending.
 */

export const PLAYGROUND_MIME = "image/webp";
export const PLAYGROUND_QUALITY = 0.78;

export interface RenderedImage {
  /** Object URL for the encoded blob. Revoke it when you replace it. */
  url: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Scales `bitmap` to `targetWidth` (never upscaling past the source) and
 * encodes it. Returns the real encoded byte count, which is the only number
 * worth showing next to the original's.
 */
export async function renderWidth(
  bitmap: ImageBitmap,
  targetWidth: number,
): Promise<RenderedImage> {
  const width = Math.min(targetWidth, bitmap.width);
  const height = Math.max(
    1,
    Math.round((bitmap.height / bitmap.width) * width),
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await canvas.convertToBlob({
    type: PLAYGROUND_MIME,
    quality: PLAYGROUND_QUALITY,
  });
  return {
    url: URL.createObjectURL(blob),
    bytes: blob.size,
    width,
    height,
  };
}

/** Decodes a picked file once, so every width reuses the same bitmap. */
export async function decodeImage(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

export interface VideoPoster extends RenderedImage {
  /**
   * The timestamp actually sampled, clamped into the clip. Whatever builds a
   * `tt_` URL has to use this and not the requested one: past the last frame,
   * ffmpeg's `-ss` encodes nothing and the transform 500s.
   */
  atSeconds: number;
}

/**
 * One frame out of a local video file, at its own aspect ratio - what
 * `t_true,tt_N` produces server-side. Decoding only, no re-encode: mediabunny
 * can transcode in the browser, but a real clip takes tens of seconds of the
 * user's CPU and this page has to feel instant.
 *
 * Mirrors lib/thumbnails/generate-video-thumbnail.ts, except the source is the
 * picked File rather than a URL, so nothing is uploaded or fetched first.
 */
export async function renderVideoPoster(
  file: File,
  atSeconds: number,
): Promise<VideoPoster | null> {
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import(
    "mediabunny"
  );
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const duration = await track.computeDuration();
    // Two decimals: `tt_` takes a decimal, and a raw float would print
    // sixteen digits and give the transform cache a key of its own.
    const at = Number(
      Math.min(atSeconds, Math.max(0, duration - 0.1)).toFixed(2),
    );
    const sample = await new VideoSampleSink(track).getSample(at);
    if (!sample) return null;
    try {
      const width = Math.min(1280, sample.displayWidth);
      const height = Math.max(
        1,
        Math.round((sample.displayHeight / sample.displayWidth) * width),
      );
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");
      sample.drawWithFit(ctx, { fit: "contain" });
      const blob = await canvas.convertToBlob({
        type: PLAYGROUND_MIME,
        quality: PLAYGROUND_QUALITY,
      });
      return {
        url: URL.createObjectURL(blob),
        bytes: blob.size,
        width,
        height,
        atSeconds: at,
      };
    } finally {
      sample.close();
    }
  } finally {
    input.dispose();
  }
}
