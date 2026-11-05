// Small mirror of the pieces of @openinary/core (v1.3.0) the Worker needs to
// recompute a transform's R2 cache key on its own: utils/parser.js
// (parseParams, isTransformSegment) and utils/storage/key-generator.js
// (generateKey), plus the format-negotiation logic from
// utils/image/compression.js's Compression.determineOptimalFormatForCache,
// plus utils/upload-validation.js (ALLOWED_UPLOAD_TYPES,
// validateUploadFileType) for worker/app.ts's /upload route - that one is
// pinned against the real package by transform-cache.test.ts, which runs
// under Node and can afford the full import.
// Vendored instead of imported: @openinary/core's package.json only exposes
// its single bundled entrypoint, which re-exports the whole library
// including sharp/fluent-ffmpeg (confirmed empirically - importing
// `parseParams` from "@openinary/core" here ballooned the Worker bundle
// from ~57KB to ~510KB by pulling both in). A drift between this file and
// core's real logic degrades silently and safely: the computed key just
// won't match the container's, so tryServeFromR2Cache misses and falls
// through to the container, exactly like any other cache miss. Re-check
// this file whenever @openinary/core is bumped.

import { createHash } from "node:crypto";
import { posix } from "node:path";
import {
  parseAngle,
  parseBackgroundValue,
  parseColor,
  parseDpr,
  parseEffect,
} from "./effect-spec.js";

export type TransformParams = Record<string, string>;

// Every transform segment @openinary/ui hardcodes for a dashboard preview -
// grid item, hover-preload and AssetDetailsSidebar's AssetPreview build the
// q_80 pair verbatim, getFolderThumbnailUrl builds the three q_70 sizes for
// folder-card previews (see dist/index.js of the installed package).
//
// These segments are served client-side only: worker/index.ts answers a
// cache miss on any of them with a 404 instead of waking the container, and
// they all resolve to the one key worker/app.ts's /thumbnail upload route
// writes the client-generated blob under (see dashboardThumbParams, which is
// what makes the four sizes below cost one stored object, not four). So this
// really is the full list - a segment @openinary/ui uses but that is
// missing here silently loses its
// preview (permanent 404, never generated), and one listed here that
// @openinary/ui doesn't use just costs a few spare R2 objects. When bumping
// @openinary/ui, re-grep its dist for `/t/` URL construction.
export const DASHBOARD_IMAGE_THUMB_SEGMENTS = [
  "w_500,h_500,q_80",
  "w_500,h_500,q_70",
  "w_250,h_500,q_70",
  "w_250,h_250,q_70",
];
export const DASHBOARD_VIDEO_THUMB_SEGMENTS = [
  "t_true,tt_5,f_webp,w_500,h_500,c_fill,q_80",
  "t_true,tt_5,f_webp,w_500,h_500,c_fill,q_70",
  "t_true,tt_5,f_webp,w_250,h_500,c_fill,q_70",
  "t_true,tt_5,f_webp,w_250,h_250,c_fill,q_70",
];

const DASHBOARD_THUMB_SEGMENTS = new Set([
  ...DASHBOARD_IMAGE_THUMB_SEGMENTS,
  ...DASHBOARD_VIDEO_THUMB_SEGMENTS,
]);

export function isDashboardThumbSegment(segment: string): boolean {
  return DASHBOARD_THUMB_SEGMENTS.has(segment);
}

// The one format dashboard thumbnails are ever stored and served in.
// The image segments above carry no f_ param, so determineOptimalFormatForCache
// would otherwise negotiate avif/webp/jpeg per browser and expect a different
// cache key for each - three objects to generate per asset, and a guaranteed
// miss on any browser whose canvas can't encode the negotiated one (avif
// encode is Chromium-only as of writing). Pinning webp collapses that to a
// single key: every browser that can run the client generator at all can
// both encode and display webp.
export const DASHBOARD_THUMB_FORMAT = "webp";

function thumbParamsForSegment(segment: string): TransformParams {
  const params = parseParams(`/t/${segment}/f`);
  return params.format ? params : { ...params, format: DASHBOARD_THUMB_FORMAT };
}

// The single derivation both sides of the dashboard-thumbnail contract go
// through: worker/app.ts to pick the key it writes a client-generated blob
// under, worker/index.ts (tryServeFromR2Cache) to pick the key it looks up.
// Shared rather than mirrored because the two only agree if parseParams'
// insertion order matches too - generateCacheKey hashes JSON.stringify of
// this object with no key sorting, so "same fields, different order" is a
// different key and a permanent 404 (there is no container fallback for
// these segments). transform-cache.test.ts pins that agreement.
//
// Deliberately keyed on the asset kind, not the segment: all four segments
// of a list collapse onto this one object, so an asset costs a single stored
// thumbnail instead of four near-identical crops. The client encodes one
// square webp, and every slot fits it to its own box: the folder-card ones
// are object-cover (so the 1:2 slot just center-crops it horizontally), and
// AssetPreview's is object-contain inside an aspect-square container, which
// a square fills exactly. Image and video keep separate params because a
// video's key
// must not be one a real customer transform of the same file could also
// produce (an image-shaped param set on an .mp4 is exactly /t/w_500,h_500,
// q_80/clip.mp4, a legitimate transcode); the t_/tt_/c_ fields the video
// segments carry only ever come from the guarded dashboard segments.
//
// Each kind takes the *first* segment of its list rather than a fresh param
// set: the grid tile is by far the hottest URL, so assets thumbnailed before
// this collapsed to one key keep serving from the key they already have. The
// three objects they left behind are orphans - a cache clear reclaims them.
export function dashboardThumbParams(isImage: boolean): TransformParams {
  return thumbParamsForSegment(
    (isImage
      ? DASHBOARD_IMAGE_THUMB_SEGMENTS
      : DASHBOARD_VIDEO_THUMB_SEGMENTS)[0],
  );
}

const TRANSFORM_VALUE_PATTERNS: Record<string, { test(value: string): boolean }> = {
  w: /^\d+$|^auto$/,
  h: /^\d+$|^auto$/,
  c: /^(fill|lfill|fill_pad|fit|limit|mfit|scale|crop|thumb|pad|lpad|mpad)$/,
  g: /^(center|c|north(?:_center)?|n|south(?:_center)?|s|east|e|west|w|faces?(?:_center)?|auto)$/,
  q: /^\d+$|^auto$/,
  // 1.2.0 narrowed this to formats an encoder can actually produce -
  // f_psd/f_avi/f_mp3/f_wav/f_ogg/f_pdf segments no longer parse as
  // transforms and fall through to the container's 404, here and in core.
  f: /^(webp|jpe?g|png|avif|gif|mp4|webm|mov|auto)$/,
  // Degrees, auto, and Cloudinary's modes joined with "." (a_hflip.90).
  a: { test: (value: string) => parseAngle(value) !== undefined },
  dpr: { test: (value: string) => parseDpr(value) !== undefined },
  ar: /^\d+:\d+$|^\d+(?:\.\d+)?$/,
  // Colors and b_auto, via effect-spec.ts (shared verbatim with core).
  // Every value the old regex accepted maps to the same string as before.
  b: { test: (value: string) => parseBackgroundValue(value) !== undefined },
  bg: { test: (value: string) => parseBackgroundValue(value) !== undefined },
  so: /^\d+(?:\.\d+)?$/,
  eo: /^\d+(?:\.\d+)?$/,
  t: /^(true|1|\d+)$/,
  tt: /^\d+(?:\.\d+)?$/,
  r: /^max$|^\d+(?::\d+){0,3}$/,
  // Overlays (core >= the v0.7.0 overlays commit, bc54443). Patterns copied
  // verbatim from core's TRANSFORM_VALUE_PATTERNS so the two sides agree on
  // what is a transform segment. l_ deliberately admits no "/", "%", "." run
  // or leading separator: ":" is the only folder separator, which is what
  // lets scopeOverlaySegment below confine it to the tenant.
  l: /^[\w-]+(?:\:[\w-]+)*\.\w+$/,
  lo: /^(100|[1-9]\d|[0-9])$/,
  lt: /^(true|1|\d+)$/,
  lx: /^\d+$/,
  ly: /^\d+$/,
  lw: /^([1-9]\d{0,2}|[1-7]\d{3}|80\d{2}|81[0-8]\d|819[0-2])$|^auto$/,
  lh: /^([1-9]\d{0,2}|[1-7]\d{3}|80\d{2}|81[0-8]\d|819[0-2])$|^auto$/,
  lg: /^(north_west|northwest|top_left|nw|north|north_center|top|top_center|n|north_east|northeast|top_right|ne|west|west_center|center_left|w|center|c|east|east_center|center_right|e|south_west|southwest|bottom_left|sw|south|south_center|bottom|bottom_center|s|south_east|southeast|bottom_right|se)$/i,
  ls: /^\d+$/,
  // Effects, opacity, color (core's e_/o_/co_ commit). effect-spec.ts is a
  // verbatim copy of core's, so both sides accept the same values.
  e: { test: (value: string) => parseEffect(value) !== undefined },
  o: /^(100|[1-9]?\d)$/,
  co: { test: (value: string) => parseColor(value) !== undefined },
};

// Mirrors core's mapFullGravity (overlay gravity) output strings.
function mapFullGravity(value: string): string | undefined {
  switch (value.toLowerCase()) {
    case "north_west": case "northwest": case "top_left": case "nw":
      return "northwest";
    case "north": case "north_center": case "top": case "top_center": case "n":
      return "north";
    case "north_east": case "northeast": case "top_right": case "ne":
      return "northeast";
    case "west": case "west_center": case "center_left": case "w":
      return "west";
    case "center": case "c":
      return "center";
    case "east": case "east_center": case "center_right": case "e":
      return "east";
    case "south_west": case "southwest": case "bottom_left": case "sw":
      return "southwest";
    case "south": case "south_center": case "bottom": case "bottom_center": case "s":
      return "south";
    case "south_east": case "southeast": case "bottom_right": case "se":
      return "southeast";
    default:
      return undefined;
  }
}

/** Mirrors core's overlayPath normalisation ("a:b.png" -> "a/b.png"). */
export function overlayPathFromValue(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // keep as sent
  }
  return decoded
    .replace(/\.\./g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replaceAll(":", "/");
}

export type OverlayScopeResult =
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
 * explicit check catches them when the pattern changes upstream.
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
  const parts = segment.split(",");
  let overlayRelativePath: string | null = null;
  let hasX = false;
  let hasY = false;
  const rootParts = tenantRoot.split("/");
  if (rootParts.length !== 3 || !rootParts.every((p) => TENANT_COMPONENT.test(p))) {
    return { ok: false, error: "Invalid tenant scope" };
  }
  const out = parts.map((part) => {
    if (part.startsWith("lx_")) hasX = true;
    if (part.startsWith("ly_")) hasY = true;
    if (!part.startsWith("l_")) return part;
    const value = part.slice(2);
    if (overlayRelativePath !== null) {
      throw new OverlayError("Only one l_ overlay is supported per transform");
    }
    if (
      /^ugc(?::|$)/i.test(value) ||
      value.includes("..") ||
      /[\/\\%]/.test(value)
    ) {
      throw new OverlayError("Overlay path must be relative to your bucket");
    }
    overlayRelativePath = overlayPathFromValue(value);
    return `l_${rootParts.join(":")}:${value}`;
  });
  if (hasX !== hasY) {
    return { ok: false, error: "lx_ and ly_ have to be set together" };
  }
  return { ok: true, segment: out.join(","), overlayRelativePath };
}

class OverlayError extends Error {}

/** Non-throwing wrapper around scopeOverlaySegment. */
export function tryScopeOverlaySegment(
  segment: string,
  tenantRoot: string,
): OverlayScopeResult {
  try {
    return scopeOverlaySegment(segment, tenantRoot);
  } catch (error) {
    if (error instanceof OverlayError) return { ok: false, error: error.message };
    throw error;
  }
}

function isValidTransformPair(part: string): boolean {
  const underscoreIndex = part.indexOf("_");
  if (underscoreIndex === -1) return false;
  const key = part.substring(0, underscoreIndex);
  const value = part.substring(underscoreIndex + 1);
  if (!value) return false;
  const pattern = TRANSFORM_VALUE_PATTERNS[key];
  return pattern !== undefined && pattern.test(value);
}

export function isTransformSegment(segment: string | undefined): boolean {
  if (!segment) return false;
  const parts = segment.split(",").filter(Boolean);
  // A "." means a file name, except inside an l_ value (an overlay names a
  // file: l_logo.png), a_ (a_hflip.90) and dpr_ (dpr_1.5). Their patterns
  // reject anything file-like ("a_hflip.png", "dpr_2.png") anyway.
  if (
    parts.some(
      (part) =>
        part.includes(".") &&
        !part.startsWith("l_") &&
        !part.startsWith("a_") &&
        !part.startsWith("dpr_"),
    )
  ) {
    return false;
  }
  return parts.length > 0 && parts.every(isValidTransformPair);
}

// Mirrors core's mapCropMode/mapGravity/mapBackground (utils/parser.js)
// exactly - their *output strings*, not just the raw param, land in the
// hashed params object, so a divergence here mismatches the cache key same
// as a missing field would.
function mapCropMode(value: string): string {
  switch (value) {
    case "fill":
    case "lfill":
    case "fill_pad":
      return "fill";
    case "fit":
    case "limit":
    case "mfit":
      return "fit";
    case "scale":
      return "scale";
    case "crop":
    case "thumb":
      return "crop";
    case "pad":
    case "lpad":
    case "mpad":
      return "pad";
    default:
      return "fill";
  }
}

function mapGravity(value: string): string {
  switch (value) {
    case "center":
    case "c":
      return "center";
    case "north":
    case "north_center":
    case "n":
      return "north";
    case "south":
    case "south_center":
    case "s":
      return "south";
    case "east":
    case "e":
      return "east";
    case "west":
    case "w":
      return "west";
    case "face":
    case "faces":
    case "face_center":
      return "face";
    case "auto":
      return "auto";
    default:
      return "center";
  }
}

function mapBackground(value: string): string {
  return parseBackgroundValue(value) ?? value;
}

// Mirrors core's parseTransform (utils/parser.js) exactly, insertion order
// included: the hashed cache key is md5(path + JSON.stringify(params)) with
// no key sorting, so params inserted in a different order (or mapped
// through different logic, e.g. c_/g_/b_/bg_) produces a different key and
// silently always misses the R2 cache - see the file header.
function parseTransform(segment: string): TransformParams {
  const params: TransformParams = {};
  let width: string | undefined;
  let height: string | undefined;
  let cropMode: string | undefined;
  let startOffset: string | undefined;
  let endOffset: string | undefined;
  let dpr: number | undefined;

  for (const part of segment.split(",")) {
    if (!part) continue;
    const underscoreIndex = part.indexOf("_");
    if (underscoreIndex === -1) continue;
    const key = part.substring(0, underscoreIndex);
    const value = part.substring(underscoreIndex + 1);
    switch (key) {
      case "w":
        width = value;
        break;
      case "h":
        height = value;
        break;
      case "c":
        cropMode = mapCropMode(value);
        // Mirrors core: only the limited modes add a param, so existing
        // c_ URLs keep their keys.
        if (value === "lfill" || value === "lpad") params.resizeLimit = "down";
        if (value === "mfit" || value === "mpad") params.resizeLimit = "up";
        break;
      case "g":
        params.gravity = mapGravity(value);
        break;
      case "q":
        params.quality = value;
        break;
      case "f":
        params.format = value;
        break;
      case "a":
        if (/^-?\d+$|^auto$/.test(value)) {
          // Unchanged since v1.3.0 (a_auto stays "auto": lossy in core).
          params.rotate = value;
        } else {
          const angle = parseAngle(value);
          if (angle?.rotate !== undefined) params.rotate = String(angle.rotate);
          if (angle?.flip) params.flip = angle.flip;
        }
        break;
      case "dpr":
        dpr = parseDpr(value);
        break;
      case "ar":
        params.aspect = value;
        break;
      case "b":
      case "bg":
        params.background = mapBackground(value);
        break;
      case "so":
        startOffset = value;
        break;
      case "eo":
        endOffset = value;
        break;
      case "t":
        params.thumbnail = value;
        break;
      case "tt":
        params.thumbnailTime = value;
        break;
      case "r":
        params.radius = value;
        break;
      // Overlay keys: new in core's overlays commit, so no existing cache key
      // contains them and their representation is ours to define. Normalised
      // to what core's parser keeps (ints, mapped gravity, booleans as
      // "true", "auto" sizes dropped) so api/lib/cache-params.ts's
      // toCloudCacheParams(core params) lands on the same strings.
      case "l":
        params.overlayPath = overlayPathFromValue(value);
        break;
      case "lt":
        params.overlayTiled = "true";
        break;
      case "lx":
        params.overlayXOffset = String(parseInt(value));
        break;
      case "ly":
        params.overlayYOffset = String(parseInt(value));
        break;
      case "lo":
        params.overlayOpacity = String(parseInt(value));
        break;
      case "lw":
        if (value !== "auto") params.overlayWidth = String(parseInt(value));
        break;
      case "lh":
        if (value !== "auto") params.overlayHeight = String(parseInt(value));
        break;
      case "ls":
        params.overlayTileSpacing = String(parseInt(value));
        break;
      case "lg": {
        const gravity = mapFullGravity(value);
        if (gravity) params.overlayGravity = gravity;
        break;
      }
      // Effects: new keys, so no existing cache key contains them. Shaped
      // like toCloudCacheParams(core params): core keeps e_ values as an
      // array in URL order, which String() joins with ",".
      case "e":
        params.effects = params.effects ? `${params.effects},${value}` : value;
        break;
      case "o":
        params.opacity = String(parseInt(value));
        break;
      case "co": {
        const color = parseColor(value);
        if (color) params.color = color;
        break;
      }
      default:
        break;
    }
  }

  // Mirrors core: dpr_ scales w/h, so dpr_2,w_400 shares w_800's key.
  if (dpr !== undefined && dpr !== 1) {
    if (width && width !== "auto") width = String(Math.round(parseInt(width) * dpr));
    if (height && height !== "auto") height = String(Math.round(parseInt(height) * dpr));
  }
  if (width) params.width = width;
  if (height) params.height = height;
  if (width && height) params.resize = `${width}x${height}`;
  if (cropMode) params.crop = cropMode;
  if (startOffset) params.startOffset = startOffset;
  if (endOffset) params.endOffset = endOffset;

  return params;
}

export function parseParams(path: string): TransformParams {
  const segments = path.split("/");
  const tIndex = segments.indexOf("t");
  if (tIndex !== -1 && segments.length > tIndex + 1) {
    const transformSegment = segments[tIndex + 1];
    if (isTransformSegment(transformSegment)) {
      return parseTransform(transformSegment);
    }
  }
  return {};
}

// Mirrors core's resolveStatusTarget (routes/video-status.ts): the transform
// segment of a status path belongs to the params, not to the file path the
// job and the R2 cache key are built from. Prepending the whole client path
// to the tenant root keyed every lookup with a transform on
// "{root}/w_720,.../file.mp4" - a file_path no job ever has - so any status
// URL carrying params answered not_found while its /t/ URL kept answering
// "processing".
export function resolveStatusTarget(tenantRoot: string, clientPath: string) {
  const segments = clientPath.split("/");
  // Overlay transforms are keyed on the tenant-scoped l_ the CDN path
  // forwarded, not the one the client sent - see scopeOverlaySegment. An
  // invalid one leaves the path as-is: it can only ever be "not found".
  const scoped = tryScopeOverlaySegment(segments[0] ?? "", tenantRoot);
  if (scoped.ok) segments[0] = scoped.segment;
  clientPath = segments.join("/");
  const hasTransform = isTransformSegment(segments[0]);
  const relativePath = (hasTransform ? segments.slice(1) : segments).join("/");
  return {
    filePath: `${tenantRoot}/${relativePath}`,
    params: parseParams(`/t/${clientPath}`),
  };
}

// Substitutes a concrete format for f_auto in a "/t/<transform>/<file>" path,
// touching the transform segment only - a file may legitimately be called
// f_auto.png, and isTransformSegment is what tells the two apart.
//
// worker/index.ts resolves f_auto itself instead of forwarding it, because core
// answers "auto" by encoding every format the client supports and keeping the
// smallest (Compression.optimizeForDelivery) - an outcome no cache key can
// predict. The key tryServeFromR2Cache computes would therefore never be the
// one the container wrote: every request for that URL would wake it again, and
// the one object it did leave behind would be shared by clients that cannot all
// decode it and could only go out as application/octet-stream, since "auto"
// names no content type. Resolved here, f_auto means "the best format this
// client supports" - one predictable cached object per client class.
export function resolveAutoFormat(
  transformPath: string,
  format: string,
): string {
  // "/t/w_500,f_auto/cow.png" -> ["", "t", "w_500,f_auto", "cow.png"]
  const parts = transformPath.split("/");
  if (!isTransformSegment(parts[2])) return transformPath;
  parts[2] = parts[2]
    .split(",")
    .map((pair) => (pair === "f_auto" ? `f_${format}` : pair))
    .join(",");
  return parts.join("/");
}

// Mirrors KeyGenerator.generateKey exactly (md5 of originalPath + JSON(params)).
// Web Crypto's SubtleCrypto doesn't support MD5 (not in the spec), so this
// uses node:crypto's createHash via nodejs_compat instead, same as
// @openinary/core itself does.
export function generateCacheKey(
  originalPath: string,
  params: TransformParams,
): string {
  const paramsString = JSON.stringify(params);
  const hash = createHash("md5")
    .update(originalPath + paramsString)
    .digest("hex");
  const ext = originalPath.split(".").pop();
  return `cache/${hash}.${ext}`;
}

// Mirrors core's determineOutputFormat (utils/video/format.js): what a video
// source actually comes back as. An image format asked of a video - f_webp on
// an .mp4 - is a still-frame extraction, not a transcode: core routes it
// through ffmpeg + sharp and stores an image under the cache key. Anything
// else encodes to a container format, mp4 unless a real one was named.
//
// Worth mirroring rather than assuming "video in, video out", because the
// Content-Type is derived from this: a webp frame served as video/mp4 renders
// an empty <video> element, which is exactly what a browser was doing with
// /t/f_webp/clip.mp4.
const IMAGE_OUTPUT_FORMATS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
]);
const VIDEO_OUTPUT_FORMATS = new Set(["mp4", "mov", "webm"]);

export function videoOutputExt(requestedFormat: string | undefined): string {
  const format = requestedFormat?.toLowerCase();
  if (format && IMAGE_OUTPUT_FORMATS.has(format)) return format;
  return format && VIDEO_OUTPUT_FORMATS.has(format) ? format : "mp4";
}

export function isVideoOutputExt(ext: string): boolean {
  return VIDEO_OUTPUT_FORMATS.has(ext);
}

function supportsFormat(
  format: "avif" | "webp",
  userAgent: string,
  acceptHeader: string | undefined,
): boolean {
  if (acceptHeader) {
    const acceptLower = acceptHeader.toLowerCase();
    if (format === "avif" && acceptLower.includes("image/avif")) return true;
    if (format === "webp" && acceptLower.includes("image/webp")) return true;
  }
  if (!userAgent) return format === "avif" || format === "webp";
  const ua = userAgent.toLowerCase();
  if (format === "avif") {
    return (
      (ua.includes("chrome") &&
        !ua.includes("edg") &&
        Number.parseInt(ua.match(/chrome\/(\d+)/)?.[1] || "0") >= 85) ||
      (ua.includes("firefox") &&
        Number.parseInt(ua.match(/firefox\/(\d+)/)?.[1] || "0") >= 93) ||
      (ua.includes("safari") &&
        !ua.includes("chrome") &&
        Number.parseInt(ua.match(/version\/(\d+)/)?.[1] || "0") >= 16) ||
      (ua.includes("edg") &&
        Number.parseInt(ua.match(/edg\/(\d+)/)?.[1] || "0") >= 122)
    );
  }
  return (
    !ua.includes("msie") &&
    !ua.includes("trident") &&
    !(
      ua.includes("edge") &&
      Number.parseInt(ua.match(/edge\/(\d+)/)?.[1] || "0") < 18
    )
  );
}

export function determineOptimalFormatForCache(
  userAgent: string,
  acceptHeader: string | undefined,
  originalFormat: string | undefined,
): string {
  if (supportsFormat("avif", userAgent, acceptHeader)) return "avif";
  if (supportsFormat("webp", userAgent, acceptHeader)) return "webp";
  if (originalFormat === "png") return "png";
  return "jpeg";
}

// Mirrors utils/upload-validation.js: what Openinary accepts at upload time.
// Deliberately excludes svg (stored-XSS vector when served inline) and every
// format the transform pipeline cannot decode. Unlike the cache-key mirrors
// above, drift here would NOT degrade safely (a type core rejects would be
// accepted, or vice versa), so transform-cache.test.ts asserts deep equality
// with the real package's export.
export const ALLOWED_UPLOAD_TYPES: Readonly<Record<string, readonly string[]>> =
  {
    // Images
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/avif": [".avif"],
    "image/gif": [".gif"],
    "image/heic": [".heic", ".heif"],
    "image/heif": [".heic", ".heif"],
    "image/vnd.adobe.photoshop": [".psd"],
    "application/octet-stream": [".psd", ".glb", ".gltf"],
    // Videos
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
    "video/webm": [".webm"],
    // Audio
    "audio/mpeg": [".mp3"],
    "audio/wav": [".wav"],
    "audio/x-wav": [".wav"],
    "audio/ogg": [".ogg"],
    "application/ogg": [".ogg"],
    // 3D
    "model/gltf-binary": [".glb"],
    "model/gltf+json": [".gltf"],
  };

export function validateUploadFileType(
  filename: string,
  mimeType: string,
): boolean {
  const allowedExtensions = ALLOWED_UPLOAD_TYPES[mimeType];
  if (!allowedExtensions) return false;
  return allowedExtensions.includes(posix.extname(filename).toLowerCase());
}
