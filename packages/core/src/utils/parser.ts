import { ValidationError } from "./errors";
import {
  parseAngle,
  parseBackgroundValue,
  parseBorder,
  parseColor,
  parseDpr,
  parseEffect,
} from "./image/effect-spec";
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
 * /t/a%2C%20b.png was looked up as "a%2C b.png" and 404'd. Same second pass
 * the storage and download routes already apply. Safe on an already-decoded
 * path because Hono keeps "%25" encoded, so a literal "%" is only decoded once.
 */
export const decodeRequestPath = (path: string): string => {
  try {
    return decodeURIComponent(path);
  } catch {
    // Malformed escape sequence: keep it as sent, like the storage routes.
    return path;
  }
};

export const parseParams = (path: string) => {
  const segments = path.split("/");
  const params: CombindedTransformParams = {};

  const tIndex = segments.indexOf("t");
  if (tIndex !== -1 && segments.length > tIndex + 1) {
    const transformSegment = segments[tIndex + 1];

    if (isTransformSegment(transformSegment)) {
      const transformParams = parseTransform(transformSegment);
      Object.assign(params, transformParams);
    }
  }

  return params;
};

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
export const isTransformSegment = (segment: string): boolean => {
  if (!segment) return false;
  const parts = segment.split(",").filter(Boolean);
  return parts.length > 0 && parts.every(isValidTransformPair);
};

/**
 * Valid transformation keys
 */
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
  | "t" // FIX H12: Add thumbnail parameter
  | "tt" // FIX H12: Add thumbnail time parameter
  | "r" // Round corners
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

/**
 * Parse a single transformation segment into our
 * internal parameter map.
 */
const parseTransform = (segment: string): CombindedTransformParams => {
  const params: CombindedTransformParams = {};
  let dpr: number | undefined;

  const parts = segment.split(",");

  for (const part of parts) {
    if (!part) continue;

    const underscoreIndex = part.indexOf("_");
    if (underscoreIndex === -1) continue;

    const key = part.substring(0, underscoreIndex) as TransformKey;
    const value = part.substring(underscoreIndex + 1);

    switch (key) {
      case "w":
        try {
          params.width = value === "auto" ? undefined : parseInt(value);
        } catch {
          throw new Error(
            "Parsing width value failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "h":
        try {
          params.height = value === "auto" ? undefined : parseInt(value);
        } catch {
          throw new Error(
            "Parsing height value failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "c":
        params.crop = mapCropMode(value);
        {
          // lfill/lpad never enlarge, mfit/mpad never reduce. A separate
          // param rather than new crop names, so c_fill, c_pad, c_fit and
          // c_limit URLs keep the params (and cache keys) they always had.
          const limit = RESIZE_LIMITS[value];
          if (limit) params.resizeLimit = limit;
        }
        break;
      case "g":
        params.gravity = mapGravity(value);
        break;
      case "q":
        // Quality (e.g. q_80, q_auto)
        try {
          params.quality = value === "auto" ? "auto" : parseInt(value);
        } catch {
          throw new Error(
            "Parsing rotation value failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "f":
        // Map directly, validation happens downstream
        params.format = value as VideoFormat & ImageFormat;
        break;
      case "a": {
        // Angle of rotation (a_90, a_auto) and flips (a_hflip, a_vflip.45)
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
        // Same sanitizing as l_ (its pattern already rejects "..", "/" and
        // a leading separator); ":" is the folder separator.
        params.defaultImage = value.replaceAll(":", "/");
        break;
      case "ar":
        // Aspect ratio, usually like "16:9" already
        params.aspect = value;
        break;
      case "b":
      case "bg":
        params.background = mapBackground(value);
        break;
      case "so":
        // Start offset (in seconds) for video/audio
        try {
          params.startOffset = parseInt(value);
        } catch {
          throw new Error(
            "Parsing start offset failed. Make sure it is an integer.",
          );
        }
        break;
      case "eo":
        // End offset (in seconds) for video/audio
        try {
          params.endOffset = parseInt(value);
        } catch {
          throw new Error(
            "Parsing end offset failed. Make sure it is an integer.",
          );
        }
        break;
      case "t":
        // FIX H12: Parse thumbnail parameter
        params.thumbnail = !!value;
        break;
      case "tt":
        // FIX H12: Parse thumbnail time parameter
        try {
          params.thumbnailTime = parseFloat(value);
        } catch {
          throw new Error(
            "Parsing thumbnail time failed. Make sure it is a positiv float.",
          );
        }
        break;
      case "r":
        params.radius = value;
        break;
      case "l":
        params.overlayPath = decodeURIComponent(value)
          .replace(/\.\./g, "")
          .replace(/\\/g, "/")
          .replace(/\/+/g, "/")
          .replace(/^\/+/, "")
          .replaceAll(":", "/");
        break;
      case "lt":
        params.overlayTiled = !!value;
        break;
      case "lx":
        try {
          params.overlayXOffset = parseInt(value);
        } catch {
          throw new Error(
            "Parsing overlay x offset failed. Make sure it is an integer.",
          );
        }
        break;
      case "ly":
        try {
          params.overlayYOffset = parseInt(value);
        } catch {
          throw new Error(
            "Parsing overlay y offset failed. Make sure it is an integer.",
          );
        }
        break;
      case "lo":
        try {
          params.overlayOpacity = parseInt(value);
        } catch {
          throw new Error(
            "Parsing overlay opacity failed. Make sure it is an integer between 0 and 100.",
          );
        }
        break;
      case "lw":
        try {
          params.overlayWidth = value === "auto" ? undefined : parseInt(value);
        } catch {
          throw new Error(
            "Parsing overlay width failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "lh":
        try {
          params.overlayHeight = value === "auto" ? undefined : parseInt(value);
        } catch {
          throw new Error(
            "Parsing overlay width failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "ls":
        try {
          params.overlayTileSpacing = parseInt(value);
        } catch {
          throw new Error(
            "Parsing overlay tile spacing failed. Make sure it is an integer.",
          );
        }
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
      default:
        // Ignore unsupported/unknown directives for now
        break;
    }
  }

  // dpr_2 with w_400 is exactly w_800: same params, same cached derivative.
  if (dpr !== undefined && dpr !== 1) {
    if (params.width) params.width = Math.round(params.width * dpr);
    if (params.height) params.height = Math.round(params.height * dpr);
  }

  if (
    (params.overlayXOffset != null && params.overlayYOffset == null) ||
    (params.overlayXOffset == null && params.overlayYOffset != null)
  )
    throw new ValidationError(
      "Validating overlay offset failed. lx_ and ly_ have to be set together.",
    );

  return params;
};

const RESIZE_LIMITS: Readonly<Record<string, "down" | "up">> = {
  lfill: "down",
  lpad: "down",
  mfit: "up",
  mpad: "up",
};

const mapCropMode = (value: string): CropMode => {
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
};

const mapGravity = (value: string): GravityMode => {
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
};

const mapFullGravity = (value: string): FullGravityMode | undefined => {
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

const mapBackground = (value: string): string =>
  // Validated by the b/bg pattern above, so never undefined here.
  parseBackgroundValue(value) ?? value;

