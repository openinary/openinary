export type CropMode = "fill" | "fit" | "scale" | "crop" | "pad";
export type GravityMode =
  | "center"
  | "north"
  | "south"
  | "east"
  | "west"
  | "face"
  | "auto";
export type ImageFormat =
  | "avif"
  | "webp"
  | "jpeg"
  | "jpg"
  | "png"
  | "gif"
  | "auto";
export type VideoFormat = "mp4" | "mov" | "webm";
export enum FullGravityMode {
  NORTH = "north",
  NORTHEAST = "northeast",
  SOUTHEAST = "southeast",
  SOUTH = "south",
  SOUTHWEST = "southwest",
  WEST = "west",
  NORTHWEST = "northwest",
  EAST = "east",
  CENTER = "center",
}

export interface BackgroundColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export interface ImageResizeTransformParams {
  crop?: CropMode;
  /** c_lfill/c_lpad: never enlarge ("down"); c_mfit/c_mpad: never reduce ("up"). */
  resizeLimit?: "down" | "up";
  gravity?: GravityMode;
  background?: string;
  width?: number;
  height?: number;
}

export interface OverlayTransformParams {
  overlayPath?: string;
  overlayOpacity?: number;
  overlayWidth?: number;
  overlayHeight?: number;
  overlayGravity?: FullGravityMode;
  overlayXOffset?: number;
  overlayYOffset?: number;
  overlayTiled?: boolean;
  overlayTileSpacing?: number;
}

export interface ImageTransformParams
  extends ImageResizeTransformParams, OverlayTransformParams {
  aspect?: string;
  rotate?: number;
  flip?: "h" | "v" | "hv"; // a_hflip / a_vflip, applied before rotate
  quality?: number | "auto";
  format?: ImageFormat;
  radius?: string; // e.g. "150", "20:80", "20:0:40:60", "max"
  effects?: string[]; // e_ values in URL order, e.g. ["fill_light:70:20", "blur:300"]
  opacity?: number; // o_, 0-100
  color?: string; // co_, normalized to "#rrggbb", used by e_colorize
  border?: string; // bo_, e.g. "4px_solid_red"
}

export interface VideoTransformParams extends OverlayTransformParams {
  format?: VideoFormat | ImageFormat;
  startOffset?: number;
  endOffset?: number;
  width?: number;
  height?: number;
  crop?: CropMode;
  gravity?: GravityMode;
  quality?: number | "auto";
  thumbnail?: boolean;
  thumbnailTime?: number;
}

export type CombindedTransformParams = ImageTransformParams &
  VideoTransformParams & {
    /**
     * d_: path of the image to serve when the requested one is missing.
     * Taken out of the params before anything is keyed or cached.
     */
    defaultImage?: string;
  };

export interface StorageConfig {
  provider?: string; // Optional, for backward compatibility only
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string; // Required for non-AWS providers (R2, Minio, etc.)
  publicUrl?: string; // Public URL of the bucket
}

/** HTTP client tuning for the storage backend. All fields optional; timeouts of 0/undefined mean "disabled". */
export interface StorageClientOptions {
  maxSockets?: number;
  connectionTimeout?: number;
  requestTimeout?: number;
  socketTimeout?: number;
}

export interface CacheEntry {
  exists: boolean;
  timestamp: number;
  etag?: string;
}

export interface CacheStats {
  requests: Map<
    string,
    { count: number; lastAccess: number; totalSize: number }
  >;
  totalCacheSize: number;
  maxCacheSize: number;
}

export interface ImageAnalysis {
  hasText: boolean;
  hasSharpEdges: boolean;
  isPhotographic: boolean;
  dominantColors: number;
  complexity: number;
}

export interface OptimizationResult {
  buffer: Buffer;
  format: string;
  originalSize: number;
  optimizedSize: number;
  savings: number;
  compressionRatio: number;
}
