export interface StorageConfig {
  provider: 'aws' | 'cloudflare';
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string; // For Cloudflare R2
  publicUrl?: string; // Public URL of the bucket
}

export interface CacheEntry {
  exists: boolean;
  timestamp: number;
  etag?: string;
}