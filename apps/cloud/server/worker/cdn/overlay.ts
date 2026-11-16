// Overlay (l_) tenant scoping, for the /b/* CDN path and /video-status.

import {
  deliveryTarget,
  isTransformSegment,
  legacyCloudParams,
  overlayPathFromValue,
} from "@openinary/core/url";
import { parseTenantPath } from "../../shared/tenant.js";
import { existsOriginal } from "../r2-storage.js";
import { textResponse } from "../responses.js";
import { type CdnPath, withTransform } from "./path.js";

type OverlayScopeResult =
  | { ok: true; segment: string; overlayRelativePath: string | null }
  | { ok: false; error: string };

const TENANT_COMPONENT = /^[\w-]+$/;

/**
 * Rewrites the l_ pair of a transform segment into the tenant's scope, so the
 * container (whose storage is the whole bucket, unscoped) reads the overlay
 * from ugc/<userId>/<bucketId>/... and nowhere else. A customer names an
 * overlay relative to their own bucket ("l_logo.png", "l_brand:logo.png").
 *
 * Refuses rather than repairs anything that looks like an escape attempt:
 * a value starting with "ugc:" (naming a tenant root explicitly), "..",
 * "/", "\\" or "%" (encoded separators). l_'s pattern already rejects most
 * of these, which makes the segment a non-transform (a folder name); the
 * explicit check catches them should the pattern change.
 *
 * Also enforces core's lx_/ly_ pairing so the worker never forwards (or
 * meters) a request the container will only answer 400 to.
 */
export function scopeOverlaySegment(
  segment: string,
  tenantRoot: string,
): OverlayScopeResult {
  if (!isTransformSegment(segment)) {
    return { ok: true, segment, overlayRelativePath: null };
  }
  const tenant = parseTenantPath(tenantRoot);
  if (
    !tenant ||
    tenant.path !== "" ||
    !TENANT_COMPONENT.test(tenant.userId) ||
    !TENANT_COMPONENT.test(tenant.bucketId)
  ) {
    return { ok: false, error: "Invalid tenant scope" };
  }
  let overlayRelativePath: string | null = null;
  let hasX = false;
  let hasY = false;
  const out: string[] = [];
  for (const part of segment.split(",")) {
    // d_ names a fallback file by path, and the container's storage is the
    // whole bucket: forwarded as is it could read another tenant's file. Cloud
    // does not serve the fallback yet (a missing source is answered 404 above
    // the container), so the pair is dropped rather than scoped.
    if (part.startsWith("d_")) continue;
    if (part.startsWith("lx_")) hasX = true;
    if (part.startsWith("ly_")) hasY = true;
    if (!part.startsWith("l_")) {
      out.push(part);
      continue;
    }
    const value = part.slice(2);
    if (overlayRelativePath !== null) {
      return { ok: false, error: "Only one l_ overlay is supported per transform" };
    }
    if (/^ugc(?::|$)/i.test(value) || value.includes("..") || /[\/\\%]/.test(value)) {
      return { ok: false, error: "Overlay path must be relative to your bucket" };
    }
    overlayRelativePath = overlayPathFromValue(value);
    out.push(`l_${tenantRoot.replaceAll("/", ":")}:${value}`);
  }
  if (hasX !== hasY) {
    return { ok: false, error: "lx_ and ly_ have to be set together" };
  }
  return { ok: true, segment: out.join(","), overlayRelativePath };
}

/**
 * What a /video-status path resolves to: the file path, the legacy params its
 * R2 cache key is built from, and core's params its video_job row is keyed on.
 * The transform segment belongs to the params, never to the file path.
 */
export function resolveStatusTarget(tenantRoot: string, clientPath: string) {
  const segments = clientPath.split("/");
  // Overlay transforms are keyed on the tenant-scoped l_ the CDN path
  // forwarded, not the one the client sent - see scopeOverlaySegment. An
  // invalid one leaves the path as-is: it can only ever be "not found".
  const scoped = scopeOverlaySegment(segments[0] ?? "", tenantRoot);
  if (scoped.ok) segments[0] = scoped.segment;
  const scopedPath = segments.join("/");
  const target = deliveryTarget(scopedPath);
  return {
    filePath: `${tenantRoot}/${target.filePath}`,
    params: legacyCloudParams(`/t/${scopedPath}`),
    jobParams: target.params,
  };
}

/**
 * Applies scopeOverlaySegment to a CDN path's transform segment. Returns the
 * path unchanged when it carries no overlay and no d_.
 */
export function scopeCdnOverlay(
  path: CdnPath,
  tenantRoot: string,
):
  | { ok: true; path: CdnPath; overlayRelativePath: string | null }
  | { ok: false; error: string } {
  if (!path.transform) return { ok: true, path, overlayRelativePath: null };
  const scoped = scopeOverlaySegment(path.transform, tenantRoot);
  if (!scoped.ok) return scoped;
  return {
    ok: true,
    // A segment that only carried d_ is gone entirely.
    path:
      scoped.segment === path.transform
        ? path
        : withTransform(path, scoped.segment),
    overlayRelativePath: scoped.overlayRelativePath,
  };
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
  if (await existsOriginal(bucket, tenantRoot, overlayRelativePath)) {
    return null;
  }
  return textResponse(400, `Overlay not found: ${overlayRelativePath}`);
}
