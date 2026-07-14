export type CropMode = "fill" | "fit" | "scale" | "crop" | "pad";
export type ImageFormat = "avif" | "webp" | "jpeg" | "jpg" | "png";
export type VideoFormat = "mp4" | "mov" | "webm";
export type GravityMode =
  | "center"
  | "north"
  | "south"
  | "east"
  | "west"
  | "face"
  | "auto";
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
  quality?: number | "auto";
  format?: ImageFormat;
  radius?: string; // e.g. "150", "20:80", "20:0:40:60", "max"
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
  VideoTransformParams;

export interface StorageConfig {
  provider?: string; // Optional, for backward compatibility only
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string; // Required for non-AWS providers (R2, Minio, etc.)
  publicUrl?: string; // Public URL of the bucket
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
