export type CropMode = 'fill' | 'fit' | 'scale' | 'crop' | 'pad';
export type GravityMode = 'center' | 'north' | 'south' | 'east' | 'west' | 'face' | 'auto';
export type ImageFormat = 'avif' | 'webp' | 'jpeg' | 'jpg' | 'png';

export interface BackgroundColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export interface TransformParams {
  aspect?: string;
  resize?: string;
  crop?: CropMode;
  gravity?: GravityMode;
  rotate?: string | number;
  background?: string;
  quality?: string | number;
  format?: ImageFormat;
}