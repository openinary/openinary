import {
  CombindedTransformParams,
  CropMode,
  FullGravityMode,
  GravityMode,
  ImageFormat,
  VideoFormat,
} from "shared";

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
const TRANSFORM_VALUE_PATTERNS: Readonly<Record<TransformKey, RegExp>> = {
  w: /^\d+$|^auto$/,
  h: /^\d+$|^auto$/,
  c: /^(fill|lfill|fill_pad|fit|limit|mfit|scale|crop|thumb|pad|lpad)$/,
  g: /^(center|c|north(?:_center)?|n|south(?:_center)?|s|east|e|west|w|faces?(?:_center)?|auto)$/,
  q: /^\d+$|^auto$/,
  f: /^(webp|jpe?g|png|avif|gif|psd|mp4|webm|mov|avi|mp3|wav|ogg|pdf|auto)$/,
  a: /^-?\d+$|^auto$/,
  ar: /^\d+:\d+$|^\d+(?:\.\d+)?$/,
  b: /^(transparent|white|black|rgb:[0-9a-fA-F]{3,8}|#?[0-9a-fA-F]{3,8})$/,
  bg: /^(transparent|white|black|rgb:[0-9a-fA-F]{3,8}|#?[0-9a-fA-F]{3,8})$/,
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
  lw: /^\d+$|^auto$/,
  lh: /^\d+$|^auto$/,
  lg: new RegExp(`^(${Object.values(FullGravityMode).join("|")})$`, "i"),
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
  | "lg"; // overlay gravity

/**
 * Parse a single transformation segment into our
 * internal parameter map.
 */
const parseTransform = (segment: string): CombindedTransformParams => {
  const params: CombindedTransformParams = {};

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
        } catch (e) {
          throw new Error(
            "Parsing width value failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "h":
        try {
          ("fill");
          params.height = value === "auto" ? undefined : parseInt(value);
        } catch (e) {
          throw new Error(
            "Parsing height value failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "c":
        "fill";
        params.crop = mapCropMode(value);
        break;
      case "g":
        params.gravity = mapGravity(value);
        break;
      case "q":
        // Quality (e.g. q_80, q_auto)
        try {
          params.quality = value === "auto" ? "auto" : parseInt(value);
        } catch (e) {
          throw new Error(
            "Parsing rotation value failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "f":
        // Map directly, validation happens downstream
        params.format = value as VideoFormat & ImageFormat;
        break;
      case "a":
        // Angle of rotation (e.g. a_90, a_auto)
        try {
          params.rotate = value === "auto" ? undefined : parseInt(value);
        } catch (e) {
          throw new Error(
            "Parsing rotation value failed. Make sure it is an integer or 'auto'.",
          );
        }
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
        } catch (e) {
          throw new Error(
            "Parsing start offset failed. Make sure it is an integer.",
          );
        }
        break;
      case "eo":
        // End offset (in seconds) for video/audio
        try {
          params.endOffset = parseInt(value);
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
          throw new Error(
            "Parsing overlay x offset failed. Make sure it is an integer.",
          );
        }
        break;
      case "ly":
        try {
          params.overlayYOffset = parseInt(value);
        } catch (e) {
          throw new Error(
            "Parsing overlay y offset failed. Make sure it is an integer.",
          );
        }
        break;
      case "lo":
        try {
          params.overlayOpacity = parseInt(value);
        } catch (e) {
          throw new Error(
            "Parsing overlay opacity failed. Make sure it is an integer between 0 and 100.",
          );
        }
        break;
      case "lw":
        try {
          params.overlayWidth = value === "auto" ? undefined : parseInt(value);
        } catch (e) {
          throw new Error(
            "Parsing overlay width failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "lh":
        try {
          params.overlayHeight = value === "auto" ? undefined : parseInt(value);
        } catch (e) {
          throw new Error(
            "Parsing overlay width failed. Make sure it is an integer or 'auto'.",
          );
        }
        break;
      case "lg":
        params.overlayGravity = mapFullGravity(value);
        break;
      default:
        // Ignore unsupported/unknown directives for now
        break;
    }
  }

  if (
    (params.overlayXOffset != null && params.overlayYOffset == null) ||
    (params.overlayXOffset == null && params.overlayYOffset != null)
  )
    throw new Error(
      "Validating overlay offset failed. X and Y have to be set.",
    );

  return params;
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

const mapBackground = (value: string): string => {
  if (value.startsWith("rgb:")) {
    const hex = value.substring("rgb:".length);
    return `#${hex}`;
  }

  switch (value) {
    case "transparent":
      return "transparent";
    case "white":
      return "#ffffff";
    case "black":
      return "#000000";
    default:
      // Assume it's already a hex-like string
      if (value.startsWith("#")) return value;
      return `#${value}`;
  }
};
