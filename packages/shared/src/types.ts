export type CropMode = "fill" | "fit" | "scale" | "crop" | "pad";
export type GravityMode =
  | "center"
  | "north"
  | "south"
  | "east"
  | "west"
  | "face"
  | "auto";
export type ImageFormat = "avif" | "webp" | "jpeg" | "jpg" | "png";
export type VideoFormat = "mp4" | "mov" | "webm";

export interface BackgroundColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export interface TransformParams {
  aspect?: string;
  resize?: string;
  width?: string;
  height?: string;
  crop?: CropMode;
  gravity?: GravityMode;
  rotate?: string | number;
  background?: string;
  quality?: string | number;
  format?: ImageFormat;
}

export interface VideoTransformParams {
  format?: VideoFormat | ImageFormat;
  startOffset?: number;
  endOffset?: number;
  resize?: string;
  width?: string | number;
  height?: string | number;
  crop?: CropMode;
  gravity?: GravityMode;
  quality?: number;
  thumbnail?: boolean;
  thumbnailTime?: number;
}

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
