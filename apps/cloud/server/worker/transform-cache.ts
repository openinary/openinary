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

const TRANSFORM_VALUE_PATTERNS: Record<string, RegExp> = {
  w: /^\d+$|^auto$/,
  h: /^\d+$|^auto$/,
  c: /^(fill|lfill|fill_pad|fit|limit|mfit|scale|crop|thumb|pad|lpad)$/,
  g: /^(center|c|north(?:_center)?|n|south(?:_center)?|s|east|e|west|w|faces?(?:_center)?|auto)$/,
  q: /^\d+$|^auto$/,
  // 1.2.0 narrowed this to formats an encoder can actually produce -
  // f_psd/f_avi/f_mp3/f_wav/f_ogg/f_pdf segments no longer parse as
  // transforms and fall through to the container's 404, here and in core.
  f: /^(webp|jpe?g|png|avif|gif|mp4|webm|mov|auto)$/,
  a: /^-?\d+$|^auto$/,
  ar: /^\d+:\d+$|^\d+(?:\.\d+)?$/,
  b: /^(transparent|white|black|rgb:[0-9a-fA-F]{3,8}|#?[0-9a-fA-F]{3,8})$/,
  bg: /^(transparent|white|black|rgb:[0-9a-fA-F]{3,8}|#?[0-9a-fA-F]{3,8})$/,
  so: /^\d+(?:\.\d+)?$/,
  eo: /^\d+(?:\.\d+)?$/,
  t: /^(true|1|\d+)$/,
  tt: /^\d+(?:\.\d+)?$/,
  r: /^max$|^\d+(?::\d+){0,3}$/,
};

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
  if (!segment || segment.includes(".")) return false;
  const parts = segment.split(",").filter(Boolean);
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
  if (value.startsWith("rgb:")) {
    return `#${value.substring("rgb:".length)}`;
  }
  switch (value) {
    case "transparent":
      return "transparent";
    case "white":
      return "#ffffff";
    case "black":
      return "#000000";
    default:
      return value.startsWith("#") ? value : `#${value}`;
  }
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
        params.rotate = value;
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
      default:
        break;
    }
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
    "application/octet-stream": [".psd"],
    // Videos
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
    "video/webm": [".webm"],
  };

export function validateUploadFileType(
  filename: string,
  mimeType: string,
): boolean {
  const allowedExtensions = ALLOWED_UPLOAD_TYPES[mimeType];
  if (!allowedExtensions) return false;
  return allowedExtensions.includes(posix.extname(filename).toLowerCase());
}
