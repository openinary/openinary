import type { OpeninaryFetch } from "@openinary/ui";
import { drawCover } from "./shapes";

// Fetches the original from the tenant-scoped, cookie-authenticated
// /download/* route and encodes the one webp every dashboard slot renders.
// THUMB_SIZE doesn't need to match the "500x500" in the dashboard's request
// URL - see DASHBOARD_IMAGE_THUMB_SEGMENTS' comment in
// worker/transform-cache.ts.
export async function generateImageThumbnail(
  fetchImpl: OpeninaryFetch,
  apiBaseUrl: string,
  path: string,
): Promise<Blob | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetchImpl(`${apiBaseUrl}/download/${encodedPath}`);
  if (!res.ok) throw new Error(`Failed to fetch original: ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const paint = (
      ctx: OffscreenCanvasRenderingContext2D,
      width: number,
      height: number,
    ) => {
      const scale = Math.max(width / bitmap.width, height / bitmap.height);
      const drawWidth = bitmap.width * scale;
      const drawHeight = bitmap.height * scale;
      ctx.drawImage(
        bitmap,
        (width - drawWidth) / 2,
        (height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
    };
    return await drawCover(paint);
  } finally {
    bitmap.close();
  }
}
