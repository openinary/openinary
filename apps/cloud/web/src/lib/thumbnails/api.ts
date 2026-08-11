import type { OpeninaryFetch } from "@openinary/ui";
import { THUMB_FIELD } from "./shapes";

// Mirrors @openinary/ui's own fetchFolderSummaries batching convention
// exactly (encode each path, join with a literal ",") so the server's
// raw.split(",") on GET /storage/thumbnails-missing lines up the same way
// it already does for GET /storage/folder-summaries.
export async function fetchMissingThumbnails(
  fetchImpl: OpeninaryFetch,
  apiBaseUrl: string,
  paths: string[],
): Promise<string[]> {
  if (paths.length === 0) return [];
  const res = await fetchImpl(
    `${apiBaseUrl}/storage/thumbnails-missing?paths=${paths.map(encodeURIComponent).join(",")}`,
  );
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  const json = (await res.json()) as { missing: string[] };
  return json.missing;
}

// One webp blob per asset: the server stores it under the single key every
// dashboard preview of that asset resolves to (see worker/app.ts's
// thumbnailCacheKey, and DASHBOARD_THUMB_FORMAT for why content negotiation
// isn't in play here).
export async function uploadThumbnail(
  fetchImpl: OpeninaryFetch,
  apiBaseUrl: string,
  path: string,
  blob: Blob,
): Promise<void> {
  const formData = new FormData();
  formData.append(THUMB_FIELD, blob, `${THUMB_FIELD}.webp`);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetchImpl(
    `${apiBaseUrl}/storage/${encodedPath}/thumbnail`,
    { method: "POST", body: formData },
  );
  if (!res.ok)
    throw new Error(`Thumbnail upload failed with status ${res.status}`);
}
