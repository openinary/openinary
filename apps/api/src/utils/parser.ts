export const parseParams = (path: string) => {
  const segments = path.split("/");
  const params: Record<string, string> = {};

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
 * Heuristic check if a path segment looks like a transformation
 * definition (e.g. "w_300,h_300,c_fill").
 */
const isTransformSegment = (segment: string): boolean => {
  if (!segment || segment.includes(".")) return false;
  // Must contain either "," separating options or "_" within an option
  if (!segment.includes(",") && !segment.includes("_")) return false;

  // Look for known transformation keys
  const hasKnownKey = /(,|^)(w|h|c|g|q|f|a|ar|b|bg|so|eo)_/.test("," + segment);
  return hasKnownKey;
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
  | "eo";

/**
 * Parse a single transformation segment into our
 * internal parameter map.
 */
const parseTransform = (
  segment: string
): Record<string, string> => {
  const params: Record<string, string> = {};

  const parts = segment.split(",");

  let width: string | undefined;
  let height: string | undefined;
  let cropMode: string | undefined;
  let startOffset: string | undefined;
  let endOffset: string | undefined;

  for (const part of parts) {
    if (!part) continue;

    const underscoreIndex = part.indexOf("_");
    if (underscoreIndex === -1) continue;

    const key = part.substring(0, underscoreIndex) as TransformKey;
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
        // Quality (e.g. q_80, q_auto)
        params.quality = value;
        break;
      case "f":
        // Map directly, validation happens downstream
        params.format = value;
        break;
      case "a":
        // Angle of rotation (e.g. a_90, a_auto)
        params.rotate = value;
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
        startOffset = value;
        break;
      case "eo":
        // End offset (in seconds) for video/audio
        endOffset = value;
        break;
      default:
        // Ignore unsupported/unknown directives for now
        break;
    }
  }

  // Set width and/or height independently
  if (width) {
    params.width = width;
  }
  if (height) {
    params.height = height;
  }
  // If both are present, also set resize for backwards compatibility
  if (width && height) {
    params.resize = `${width}x${height}`;
  }

  if (cropMode) {
    params.crop = cropMode;
  }

  if (startOffset) {
    params.startOffset = startOffset;
  }

  if (endOffset) {
    params.endOffset = endOffset;
  }

  return params;
};

const mapCropMode = (value: string): string => {
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

const mapGravity = (value: string): string => {
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
