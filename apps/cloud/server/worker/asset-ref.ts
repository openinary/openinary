// Turns whatever arrives in a takedown notice into the two things needed to
// delete the file: which bucket, and the path inside it.
//
// A complaint quotes the URL a viewer saw, which is a public CDN URL with the
// transform mount and possibly a transform segment in the middle of it - and
// the file that has to go is the *original*, not the derivative that URL
// named. Deleting the derivative alone would leave the original there for the
// next request to regenerate from.
//
// Free of Worker imports so the parsing can be asserted under plain node - see
// worker/asset-ref.test.ts.

import { isTransformSegment } from "./transform-cache.js";

export type AssetRef = { bucketId: string; filePath: string };

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Malformed escape sequence - keep it as sent, matching extractFilePath.
    return segment;
  }
}

/**
 * Accepts any of:
 *
 *   https://cdn.openinary.dev/b/{bucketId}/t/w_500/photo.png
 *   /b/{bucketId}/t/photo.png
 *   {bucketId}/nested/photo.png
 *
 * and answers with the original's location. Returns null when there is no file
 * path left to point at, so the caller reports a bad reference rather than
 * deleting a whole bucket by accident.
 */
export function parseAssetRef(input: string): AssetRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strip scheme + host if this is a full URL, and drop any query/fragment.
  const withoutOrigin = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "");
  const pathname = withoutOrigin.split(/[?#]/)[0];

  const segments = pathname.split("/").filter(Boolean);
  // "/b/" is the public CDN prefix; a raw "{bucketId}/path" has no such marker.
  if (segments[0] === "b") segments.shift();

  const bucketId = segments.shift();
  if (!bucketId) return null;

  // "t" is the fixed transform-route mount (see parseCdnRequest in
  // worker/index.ts), and the segment after it may be transform params.
  if (segments[0] === "t") segments.shift();
  if (isTransformSegment(segments[0])) segments.shift();

  if (segments.length === 0) return null;
  return { bucketId, filePath: segments.map(decodeSegment).join("/") };
}
