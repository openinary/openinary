// MD5 is not in Web Crypto; Workers get node:crypto through nodejs_compat.
import { createHash } from "node:crypto";
import { parseColor, parseAngle, parseDpr } from "./effect-spec";
import {
  isTransformSegment,
  mapBackground,
  mapCropMode,
  mapFullGravity,
  mapGravity,
  overlayPathFromValue,
  RESIZE_LIMITS,
  transformPairs,
} from "./grammar";

/** Storage key of the derivative of `originalPath` under `params`. */
export type CacheKeyFn = (originalPath: string, params: object) => string;

const md5Key = (originalPath: string, paramsJson: string): string =>
  `cache/${createHash("md5").update(originalPath + paramsJson).digest("hex")}.${originalPath.split(".").pop()}`;

/**
 * Self-hosted keys. Key order must not matter: the video job store persists
 * params with sorted keys, so a transcode uploaded under one order was looked
 * up under the other and every multi-parameter video re-transcoded.
 */
export const sortedKey: CacheKeyFn = (originalPath, params) => {
  const p = params as Record<string, unknown>;
  return md5Key(
    originalPath,
    JSON.stringify(
      Array.isArray(params)
        ? params
        : Object.fromEntries(Object.keys(p).sort().map((k) => [k, p[k]])),
    ),
  );
};

/**
 * Openinary Cloud's keys: insertion order, over legacyCloudParams. Every
 * derivative already in Cloud's R2 is keyed this way; changing either half
 * re-keys them all (one re-transform and one re-bill per derivative).
 */
export const legacyCloudKey: CacheKeyFn = (originalPath, params) =>
  md5Key(originalPath, JSON.stringify(params));

export type LegacyCloudParams = Record<string, string>;

/**
 * Header the Cloud Worker sends the container with the JSON of the
 * LegacyCloudParams it keys a request's derivative under.
 */
export const CACHE_PARAMS_HEADER = "X-Openinary-Cache-Params";

/**
 * The params shape Cloud keys derivatives with: the engine's grammar, but
 * every value kept as a string (w_auto stays "auto", t_1 stays "1"), and
 * width/height/resize/crop/startOffset/endOffset appended last. The typed
 * parser drops some of those distinctions, so it cannot produce these keys.
 */
export function legacyCloudParams(path: string): LegacyCloudParams {
  const segments = path.split("/");
  const tIndex = segments.indexOf("t");
  const segment = tIndex === -1 ? undefined : segments[tIndex + 1];
  if (!segment || !isTransformSegment(segment)) return {};

  const params: LegacyCloudParams = {};
  let width: string | undefined;
  let height: string | undefined;
  let cropMode: string | undefined;
  let startOffset: string | undefined;
  let endOffset: string | undefined;
  let dpr: number | undefined;

  for (const [key, value] of transformPairs(segment)) {
    switch (key) {
      case "w":
        width = value;
        break;
      case "h":
        height = value;
        break;
      case "c":
        cropMode = mapCropMode(value);
        if (RESIZE_LIMITS[value]) params.resizeLimit = RESIZE_LIMITS[value];
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
        if (value.split(".").includes("ignore")) params.ignoreOrientation = "true";
        if (/^-?\d+$|^auto$/.test(value)) {
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
      case "bo":
        params.border = value;
        break;
      // d_ never reaches the params: it only matters when the file is missing.
    }
  }

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

const TRAILING = new Set(["width", "height", "resize", "crop", "startOffset", "endOffset"]);

/**
 * Typed engine params back to LegacyCloudParams, for a derivative written
 * outside the request that carried CACHE_PARAMS_HEADER (a video job that
 * outlived a container restart). Exact except where the typed parser is
 * lossy (w_auto, a_auto, t_1, tt_ formatting): those miss once and are
 * regenerated.
 */
export function toLegacyCloudParams(input: object): LegacyCloudParams {
  const params = input as Record<string, unknown>;
  const out: LegacyCloudParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === false || value === "" || TRAILING.has(key)) continue;
    out[key] = String(value);
  }
  const width = params.width != null ? String(params.width) : undefined;
  const height = params.height != null ? String(params.height) : undefined;
  if (width) out.width = width;
  if (height) out.height = height;
  if (width && height) out.resize = `${width}x${height}`;
  if (params.crop != null) out.crop = String(params.crop);
  if (params.startOffset != null) out.startOffset = String(params.startOffset);
  if (params.endOffset != null) out.endOffset = String(params.endOffset);
  return out;
}
