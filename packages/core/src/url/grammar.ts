import { ValidationError } from "../utils/errors";
import {
  parseAngle,
  parseBackgroundValue,
  parseBorder,
  parseColor,
  parseDpr,
  parseEffect,
} from "./effect-spec";
import {
  CombindedTransformParams,
  CropMode,
  FullGravityMode,
  GravityMode,
  ImageFormat,
  VideoFormat,
} from "../types";

/**
 * The request path as a storage key. Hono's c.req.path is only decodeURI'd,
 * which leaves reserved characters (, & @ + = ; : $) percent-encoded, while
 * every write path stores keys fully decoded: "a, b.png" requested as
 * /t/a%2C%20b.png was looked up as "a%2C b.png" and 404'd. Safe on an
 * already-decoded path because Hono keeps "%25" encoded, so a literal "%" is
 * only decoded once.
 */
export const decodeRequestPath = (path: string): string => {
  try {
    return decodeURIComponent(path);
  } catch {
    // Malformed escape sequence: keep it as sent, like the storage routes.
    return path;
  }
};

/** Typed params of "/t/{transform}/{file}" or "{transform}/{file}". */
export const parseParams = (path: string): CombindedTransformParams => {
  const { transform } = splitTransformPath(path.replace(/^\/t\//, ""));
  return transform ? parseTransform(transform) : {};
};

/**
 * Splits what follows a transform mount ("w_300,h_200/photos/a.jpg") into its
 * transform segment ("" when there is none) and the file path.
 */
export function splitTransformPath(rest: string): {
  transform: string;
  filePath: string;
} {
  const segments = rest.replace(/^\/+/, "").split("/");
  const transform = isTransformSegment(segments[0]) ? segments.shift()! : "";
  return { transform, filePath: segments.join("/") };
}

/**
 * What a delivery path below its mount names: the transform segment, the file,
 * and the typed params its derivative and video job are keyed on. d_ is split
 * off: it only matters when the file is missing, so it stays out of every key.
 */
export function deliveryTarget(rest: string): {
  transform: string;
  filePath: string;
  params: CombindedTransformParams;
  defaultImage: string | undefined;
} {
  const { transform, filePath } = splitTransformPath(rest);
  const { defaultImage, ...params } = transform
    ? parseTransform(transform)
    : ({} as CombindedTransformParams);
  return { transform, filePath, params, defaultImage };
}

/**
 * Valid values for each transformation key.
 * Used by isTransformSegment to reject folder names that happen to start with a known key.
 */
const TRANSFORM_VALUE_PATTERNS: Readonly<
  Record<TransformKey, { test(value: string): boolean }>
> = {
  w: /^\d+$|^auto$/,
  h: /^\d+$|^auto$/,
  c: /^(fill|lfill|fill_pad|fit|limit|mfit|scale|crop|thumb|pad|lpad|mpad)$/,
  g: /^(center|c|north(?:_center)?|n|south(?:_center)?|s|east|e|west|w|faces?(?:_center)?|auto)$/,
  q: /^\d+$|^auto$/,
  // Only formats an encoder can actually produce. Image sources: webp/jpeg/png/
  // avif/gif via sharp. Video sources: mp4/webm/mov, plus the image formats as
  // thumbnails. psd is an accepted *upload* format but is never an output.
  f: /^(webp|jpe?g|png|avif|gif|mp4|webm|mov|auto)$/,
  // Degrees, auto, and Cloudinary's modes joined with "." (a_hflip.90).
  a: { test: (value: string) => parseAngle(value) !== undefined },
  dpr: { test: (value: string) => parseDpr(value) !== undefined },
  bo: { test: (value: string) => parseBorder(value) !== undefined },
  // Default image when the requested one is missing, folders as ":" like l_.
  d: /^[\w-]+(?:\:[\w-]+)*\.\w+$/,
  ar: /^\d+:\d+$|^\d+(?:\.\d+)?$/,
  // Colors (hex, rgb:hex, CSS names, transparent) and b_auto[:mode]...
  b: { test: (value: string) => parseBackgroundValue(value) !== undefined },
  bg: { test: (value: string) => parseBackgroundValue(value) !== undefined },
  so: /^\d+(?:\.\d+)?$/,
  eo: /^\d+(?:\.\d+)?$/,
  t: /^(true|1|\d+)$/,
  tt: /^\d+(?:\.\d+)?$/,
  r: /^max$|^\d+(?::\d+){0,3}$/,
  // ":" is the only folder separator an overlay may use: no "/", "%", ".."
  // or leading separator, which is what lets the Cloud Worker confine it to
  // the tenant (scopeOverlaySegment).
  l: /^[\w-]+(?:\:[\w-]+)*\.\w+$/,
  lo: /^(100|[1-9]\d|[0-9])$/,
  lt: /^(true|1|\d+)$/,
  lx: /^\d+$/,
  ly: /^\d+$/,
  // Overlay size is capped like an output dimension, 8192 px
  lw: /^([1-9]\d{0,2}|[1-7]\d{3}|80\d{2}|81[0-8]\d|819[0-2])$|^auto$/,
  lh: /^([1-9]\d{0,2}|[1-7]\d{3}|80\d{2}|81[0-8]\d|819[0-2])$|^auto$/,
  lg: /^(north_west|northwest|top_left|nw|north|north_center|top|top_center|n|north_east|northeast|top_right|ne|west|west_center|center_left|w|center|c|east|east_center|center_right|e|south_west|southwest|bottom_left|sw|south|south_center|bottom|bottom_center|s|south_east|southeast|bottom_right|se)$/i,
  ls: /^\d+$/,
  // Effects carry their own argument grammar (e_blur:300, e_tint:40:blue:0p),
  // validated by the same table that applies them.
  e: { test: (value: string) => parseEffect(value) !== undefined },
  o: /^(100|[1-9]?\d)$/,
  co: { test: (value: string) => parseColor(value) !== undefined },
};

const isValidTransformPair = (part: string): boolean => {
  const underscoreIndex = part.indexOf("_");
  if (underscoreIndex === -1) return false;
  const key = part.substring(0, underscoreIndex);
  const value = part.substring(underscoreIndex + 1);
  if (!value) return false;
  const pattern = TRANSFORM_VALUE_PATTERNS[key as TransformKey];
  return pattern !== undefined && pattern.test(value);
};

/**
 * Check if a path segment is a transformation definition (e.g. "w_300,h_300,c_fill").
 * Every comma-separated part must be a valid key_value pair to avoid false positives
 * on folder names like "w_photos", "f_family", or "bg_images".
 */
export const isTransformSegment = (segment: string | undefined): boolean => {
  if (!segment) return false;
  const parts = segment.split(",").filter(Boolean);
  return parts.length > 0 && parts.every(isValidTransformPair);
};

type TransformKey =
  | "w"
  | "h"
  | "c"
  | "g"
  | "q"
  | "f"
  | "a"
  | "ar"
  | "b"
  | "bg"
  | "so"
  | "eo"
  | "t" // thumbnail
  | "tt" // thumbnail time
  | "r" // round corners
  | "l" // overlay layer image path
  | "lo" // overlay opacity
  | "lt" // overlay tiled
  | "lx" // overlay left offset
  | "ly" // overlay top offset
  | "lw" // overlay width
  | "lh" // overlay height
  | "lg" // overlay gravity
  | "ls" // overlay tile spacing
  | "e" // effect, repeatable, applied in URL order
  | "o" // opacity 0-100
  | "co" // color qualifier (e_colorize)
  | "dpr" // device pixel ratio, multiplies w and h
  | "bo" // border
  | "d"; // default image

/** Splits a transform segment into its key/value pairs, in URL order. */
export function transformPairs(segment: string): [string, string][] {
  const pairs: [string, string][] = [];
  for (const part of segment.split(",")) {
    const underscoreIndex = part.indexOf("_");
    if (underscoreIndex === -1) continue;
    pairs.push([part.substring(0, underscoreIndex), part.substring(underscoreIndex + 1)]);
  }
  return pairs;
}

const parseTransform = (segment: string): CombindedTransformParams => {
  const params: CombindedTransformParams = {};
  let dpr: number | undefined;

  for (const [key, value] of transformPairs(segment)) {
    switch (key as TransformKey) {
      case "w":
        params.width = value === "auto" ? undefined : parseInt(value);
        break;
      case "h":
        params.height = value === "auto" ? undefined : parseInt(value);
        break;
      case "c":
        params.crop = mapCropMode(value);
        // A separate param rather than new crop names, so c_fill, c_pad,
        // c_fit and c_limit URLs keep the params (and cache keys) they had.
        if (RESIZE_LIMITS[value]) params.resizeLimit = RESIZE_LIMITS[value];
        break;
      case "g":
        params.gravity = mapGravity(value);
        break;
      case "q":
        params.quality = value === "auto" ? "auto" : parseInt(value);
        break;
      case "f":
        params.format = value as VideoFormat & ImageFormat;
        break;
      case "a": {
        // a_ignore alone sets nothing else, so it has no rotate key.
        if (value.split(".").includes("ignore")) params.ignoreOrientation = true;
        if (value === "ignore") break;
        const angle = parseAngle(value);
        params.rotate = angle?.rotate;
        if (angle?.flip) params.flip = angle.flip;
        break;
      }
      case "dpr":
        dpr = parseDpr(value);
        break;
      case "bo":
        params.border = value;
        break;
      case "d":
        params.defaultImage = value.replaceAll(":", "/");
        break;
      case "ar":
        params.aspect = value;
        break;
      case "b":
      case "bg":
        params.background = mapBackground(value);
        break;
      case "so":
        params.startOffset = parseInt(value);
        break;
      case "eo":
        params.endOffset = parseInt(value);
        break;
      case "t":
        params.thumbnail = !!value;
        break;
      case "tt":
        params.thumbnailTime = parseFloat(value);
        break;
      case "r":
        params.radius = value;
        break;
      case "l":
        params.overlayPath = overlayPathFromValue(value);
        break;
      case "lt":
        params.overlayTiled = !!value;
        break;
      case "lx":
        params.overlayXOffset = parseInt(value);
        break;
      case "ly":
        params.overlayYOffset = parseInt(value);
        break;
      case "lo":
        params.overlayOpacity = parseInt(value);
        break;
      case "lw":
        params.overlayWidth = value === "auto" ? undefined : parseInt(value);
        break;
      case "lh":
        params.overlayHeight = value === "auto" ? undefined : parseInt(value);
        break;
      case "ls":
        params.overlayTileSpacing = parseInt(value);
        break;
      case "lg":
        params.overlayGravity = mapFullGravity(value);
        break;
      case "e":
        // Kept as written: effect-spec parses the arguments again when the
        // effect is applied, and the raw string is what the cache key hashes.
        params.effects = [...(params.effects ?? []), value];
        break;
      case "o":
        params.opacity = parseInt(value);
        break;
      case "co":
        params.color = parseColor(value);
        break;
    }
  }

  // dpr_2 with w_400 is exactly w_800: same params, same cached derivative.
  if (dpr !== undefined && dpr !== 1) {
    if (params.width) params.width = Math.round(params.width * dpr);
    if (params.height) params.height = Math.round(params.height * dpr);
  }

  if ((params.overlayXOffset == null) !== (params.overlayYOffset == null))
    throw new ValidationError(
      "Validating overlay offset failed. lx_ and ly_ have to be set together.",
    );

  return params;
};

/**
 * The overlay's storage path from an l_ value, ":" being the folder separator
 * ("brand:logo.png" -> "brand/logo.png"). A malformed escape is kept as sent
 * instead of throwing, which answered 500.
 */
export function overlayPathFromValue(value: string): string {
  return decodeRequestPath(value)
    .replace(/\.\./g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replaceAll(":", "/");
}

/** lfill/lpad never enlarge, mfit/mpad never reduce. */
export const RESIZE_LIMITS: Readonly<Record<string, "down" | "up">> = {
  lfill: "down",
  lpad: "down",
  mfit: "up",
  mpad: "up",
};

export const mapCropMode = (value: string): CropMode => {
  switch (value) {
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
};

export const mapGravity = (value: string): GravityMode => {
  switch (value) {
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
};

export const mapFullGravity = (value: string): FullGravityMode | undefined => {
  switch (value.toLowerCase()) {
    case "north_west":
    case "northwest":
    case "top_left":
    case "nw":
      return FullGravityMode.NORTHWEST;
    case "north":
    case "north_center":
    case "top":
    case "top_center":
    case "n":
      return FullGravityMode.NORTH;
    case "north_east":
    case "northeast":
    case "top_right":
    case "ne":
      return FullGravityMode.NORTHEAST;
    case "west":
    case "west_center":
    case "center_left":
    case "w":
      return FullGravityMode.WEST;
    case "center":
    case "c":
      return FullGravityMode.CENTER;
    case "east":
    case "east_center":
    case "center_right":
    case "e":
      return FullGravityMode.EAST;
    case "south_west":
    case "southwest":
    case "bottom_left":
    case "sw":
      return FullGravityMode.SOUTHWEST;
    case "south":
    case "south_center":
    case "bottom":
    case "bottom_center":
    case "s":
      return FullGravityMode.SOUTH;
    case "south_east":
    case "southeast":
    case "bottom_right":
    case "se":
      return FullGravityMode.SOUTHEAST;
    default:
      return undefined;
  }
};

// Validated by the b/bg pattern, so never undefined there.
export const mapBackground = (value: string): string =>
  parseBackgroundValue(value) ?? value;
