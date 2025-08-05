// Types partagés entre l'API et le frontend

export interface ImageTransformParams {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface VideoTransformParams {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'mp4' | 'webm';
  duration?: number;
  startTime?: number;
}

export interface MediaFile {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'video';
  size: number;
  mimeType: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransformRequest {
  filePath: string;
  params: ImageTransformParams | VideoTransformParams;
}

export interface TransformResponse {
  success: boolean;
  url?: string;
  error?: string;
  processedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}