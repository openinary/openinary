import { ALL_FORMATS, Input, UrlSource, VideoSampleSink } from "mediabunny";
import { drawCover } from "./shapes";

// Mirrors the container's tt_5 (thumbnailTime=5s) default so a freshly
// client-generated thumbnail looks like what the container would have
// produced for the same asset.
const THUMB_TIMESTAMP_SECONDS = 5;

// Reads the original video through the tenant-scoped, cookie-authenticated
// /download/* route (now Range-capable - see worker/app.ts) via mediabunny's
// UrlSource, which only requests the byte ranges it actually needs (moov
// atom + one GOP) rather than downloading the whole file. One frame is
// decoded, then cover-cropped into the single dashboard thumbnail (see
// shapes.ts).
export async function generateVideoThumbnail(
  apiBaseUrl: string,
  path: string,
): Promise<Blob | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(`${apiBaseUrl}/download/${encodedPath}`, {
      requestInit: { credentials: "include" },
    }),
  });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !(await videoTrack.canDecode())) return null;
    const duration = await videoTrack.computeDuration();
    const sink = new VideoSampleSink(videoTrack);
    const sample = await sink.getSample(
      Math.min(THUMB_TIMESTAMP_SECONDS, duration / 2),
    );
    if (!sample) return null;
    try {
      const paint = (ctx: OffscreenCanvasRenderingContext2D) =>
        sample.drawWithFit(ctx, { fit: "cover" });
      return await drawCover(paint);
    } finally {
      sample.close();
    }
  } finally {
    input.dispose();
  }
}
