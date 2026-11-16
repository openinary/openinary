// The public CDN URL: /b/{bucketId}/t/[{transform}/]{file}. Every reader and
// builder of that shape goes through here: request parsing, overlay scoping,
// the path forwarded to the container, status URLs, upload responses and
// takedown references.
//
// "t" is the container's transform-route mount (container/index.ts), always
// present and never itself a transform or file segment.

import {
  extOf,
  isTransformSegment,
  legacyCloudParams,
} from "@openinary/core/url";

const BUCKET_PREFIX = /^\/b\/([^/]+)\//;

/** One segment decoded, or kept as sent when its escapes are malformed. */
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export type CdnPath = {
  bucketId: string;
  /** The transform segment as sent, "" when the URL asks for the file as is. */
  transform: string;
  /** File segments as sent (percent-encoded), never empty. */
  fileSegments: string[];
  /**
   * The original's path inside the bucket. Decoded, because R2 keys are not
   * percent-encoded: every write path decodes, so a key built from
   * "La%20Mar%C3%A9e.png" would never match the stored "La Marée.png".
   */
  relativePath: string;
  /** Lowercased extension of the file, "" without one. */
  ext: string;
  /** Legacy-keyed params of the transform segment, {} without one. */
  params: Record<string, string>;
};

/** The bucket a /b/* request names, before anything else is parsed. */
export function cdnBucketId(pathname: string): string | null {
  return pathname.match(BUCKET_PREFIX)?.[1] ?? null;
}

/** Null unless the path is /b/{bucketId}/t/ followed by at least a file name. */
export function parseCdnPath(pathname: string): CdnPath | null {
  const bucketId = cdnBucketId(pathname);
  if (!bucketId) return null;
  const rest = pathname.slice(`/b/${bucketId}/`.length);
  if (!rest.startsWith("t/")) return null;
  const segments = rest.slice(2).split("/").filter(Boolean);
  const transform = isTransformSegment(segments[0]) ? segments.shift()! : "";
  if (segments.length === 0) return null;
  const relativePath = segments.map(decodeSegment).join("/");
  return {
    bucketId,
    transform,
    fileSegments: segments,
    relativePath,
    ext: extOf(relativePath),
    params: transform ? legacyCloudParams(`/t/${transform}/f`) : {},
  };
}

function join(transform: string, rest: string): string {
  return transform ? `${transform}/${rest}` : rest;
}

/** The same URL with another transform segment ("" drops it). */
export function withTransform(path: CdnPath, transform: string): CdnPath {
  return parseCdnPath(
    `/b/${path.bucketId}/t/${join(transform, path.fileSegments.join("/"))}`,
  )!;
}

/**
 * The container's own path for this request: the tenant root spliced in
 * front of the file, so the filePath @openinary/core derives from the request
 * path is already the real R2 key.
 */
export function upstreamPath(path: CdnPath, tenantRoot: string): string {
  return `/t/${join(path.transform, `${tenantRoot}/${path.fileSegments.join("/")}`)}`;
}

/** Where /video-status reports on this transform, relative to the Worker. */
export function statusPath(path: CdnPath): string {
  return `/video-status/${join(path.transform, path.fileSegments.join("/"))}`;
}

/** The public URL of a stored original. */
export function cdnFilePath(bucketId: string, filePath: string): string {
  return `/b/${bucketId}/t/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Turns whatever arrives in a takedown notice into the original it points at.
 * Accepts a full CDN URL, a "/b/..." path, or a bare "{bucketId}/file" pasted
 * from our own logs. A complaint quotes the URL a viewer saw, so the
 * transform segment is dropped: deleting the derivative alone would leave the
 * original there for the next request to regenerate from.
 *
 * Null when there is no file path left to point at, so the caller reports a
 * bad reference rather than deleting a whole bucket by accident.
 */
export function parseAssetRef(
  input: string,
): { bucketId: string; filePath: string } | null {
  const pathname = input
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "")
    .split(/[?#]/)[0];
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "b") segments.shift();
  const bucketId = segments.shift();
  if (!bucketId) return null;
  if (segments[0] === "t") segments.shift();
  const parsed = parseCdnPath(`/b/${bucketId}/t/${segments.join("/")}`);
  return parsed && { bucketId, filePath: parsed.relativePath };
}

// Substitutes a concrete format for f_auto in a transform segment.
//
// cdn/serve.ts resolves f_auto itself instead of forwarding it, because core
// answers "auto" by encoding every format the client supports and keeping the
// smallest - an outcome no cache key can predict. The key the R2 lookup
// computes would never be the one the container wrote, and the one object it
// did leave behind would be shared by clients that cannot all decode it.
// Resolved here, f_auto means "the best format this client supports" - one
// predictable cached object per client class.
export function resolveAutoFormat(transform: string, format: string): string {
  return transform
    .split(",")
    .map((pair) => (pair === "f_auto" ? `f_${format}` : pair))
    .join(",");
}
