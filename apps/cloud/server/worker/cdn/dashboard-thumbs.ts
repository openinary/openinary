// The dashboard thumbnail contract. Keys use core's
// legacyCloudKey/legacyCloudParams, the format every derivative already in R2
// was written under.

import {
  dashboardThumbSegment,
  dashboardThumbSegments,
  legacyCloudKey,
  legacyCloudParams,
  type LegacyCloudParams,
} from "@openinary/core/url";

// The segments come from core, the same list @openinary/ui builds its preview
// URLs from. cdn/serve.ts answers a cache miss on any of them with a 404
// instead of waking the container, and they all resolve to the one key the
// /thumbnail upload route (routes/storage.ts) writes the client-generated blob
// under (see dashboardThumbParams): four sizes, one stored object.
const DASHBOARD_THUMB_SEGMENTS = new Set([
  ...dashboardThumbSegments("image"),
  ...dashboardThumbSegments("video"),
]);

export function isDashboardThumbSegment(segment: string): boolean {
  return DASHBOARD_THUMB_SEGMENTS.has(segment);
}

// The one format dashboard thumbnails are ever stored and served in.
// The image segments carry no f_ param, so content negotiation would
// otherwise pick avif/webp/jpeg per browser and expect a different cache key
// for each - three objects to generate per asset, and a guaranteed miss on
// any browser whose canvas can't encode the negotiated one (avif encode is
// Chromium-only as of writing). Every browser that can run the client
// generator at all can both encode and display webp.
export const DASHBOARD_THUMB_FORMAT = "webp";

/**
 * The params both sides of the dashboard-thumbnail contract key on:
 * routes/storage.ts to write a client-generated blob, cdn/serve.ts to look it
 * up. There is no container fallback for these segments, so any drift is a
 * permanent 404 (cache-keys.test.ts pins the keys).
 *
 * Keyed on the asset kind, not the segment: all four segments of a list
 * collapse onto one object. The client encodes one square webp and every
 * slot fits it to its own box. Image and video keep separate params because
 * a video's key must not be one a real customer transform of the same file
 * could also produce (an image-shaped param set on an .mp4 is a legitimate
 * transcode). Each kind keys on its "preview" segment so assets thumbnailed
 * before the collapse keep the key they already have.
 */
export function dashboardThumbParams(isImage: boolean): LegacyCloudParams {
  const segment = dashboardThumbSegment(isImage ? "image" : "video", "preview");
  const params = legacyCloudParams(`/t/${segment}/f`);
  return params.format ? params : { ...params, format: DASHBOARD_THUMB_FORMAT };
}

/**
 * The one cache key every dashboard preview of this asset resolves to,
 * whichever of @openinary/ui's four sizes asked for it.
 */
export function thumbnailCacheKey(fullPath: string, isImage: boolean): string {
  return legacyCloudKey(fullPath, dashboardThumbParams(isImage));
}
