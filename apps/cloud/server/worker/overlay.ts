// Overlay (l_) handling for the /b/* CDN path, kept out of index.ts so it can
// be unit-tested under Node (index.ts imports cloudflare:workers).

import { existsOriginal } from "./r2-storage.js";
import { tryScopeOverlaySegment } from "./transform-cache.js";

/**
 * Applies scopeOverlaySegment to a /b/{bucketId}/t/{segment}/... URL.
 * Returns the URL unchanged when it carries no overlay and no d_.
 */
export function scopeCdnOverlay(
  url: URL,
  bucketId: string,
  tenantRoot: string,
):
  | { ok: true; url: URL; overlayRelativePath: string | null }
  | { ok: false; error: string } {
  const prefix = `/b/${bucketId}/t/`;
  if (!url.pathname.startsWith(prefix)) {
    return { ok: true, url, overlayRelativePath: null };
  }
  const rest = url.pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return { ok: true, url, overlayRelativePath: null };
  const segment = rest.slice(0, slash);
  const scoped = tryScopeOverlaySegment(segment, tenantRoot);
  if (!scoped.ok) return scoped;
  if (scoped.segment === segment) {
    return { ok: true, url, overlayRelativePath: scoped.overlayRelativePath };
  }
  const next = new URL(url.toString());
  // A segment that only carried d_ is gone entirely.
  next.pathname = scoped.segment
    ? `${prefix}${scoped.segment}${rest.slice(slash)}`
    : `${prefix}${rest.slice(slash + 1)}`;
  return { ok: true, url: next, overlayRelativePath: scoped.overlayRelativePath };
}


/**
 * 400 when the (tenant-relative) overlay does not exist, null otherwise.
 * Checked in the Worker for the same reason as the source: the container
 * would only answer 400 after a wake, once both 202 branches have promised
 * "processing".
 */
export async function overlayMissingResponse(
  bucket: Pick<R2Bucket, "head">,
  tenantRoot: string,
  overlayRelativePath: string,
): Promise<Response | null> {
  if (await existsOriginal(bucket as R2Bucket, tenantRoot, overlayRelativePath)) {
    return null;
  }
  return new Response(`Overlay not found: ${overlayRelativePath}`, {
    status: 400,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
