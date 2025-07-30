import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'crypto';

export interface StorageConfig {
  provider: 'aws' | 'cloudflare';
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string; // For Cloudflare R2
  publicUrl?: string; // Public URL of the bucket
}

export class CloudStorage {
  private s3Client: S3Client;
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
    
    const clientConfig: any = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };

    // Specific configuration for Cloudflare R2
    if (config.provider === 'cloudflare' && config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = true;
    }

    this.s3Client = new S3Client(clientConfig);
  }

  /**
   * Generates a unique key for the file based on path and parameters
   */
  private generateKey(originalPath: string, params: any): string {
    const paramsString = JSON.stringify(params);
    const hash = createHash('md5').update(originalPath + paramsString).digest('hex');
    const ext = originalPath.split('.').pop();
    return `cache/${hash}.${ext}`;
  }

  /**
   * Checks if a file exists in the bucket
   */
  async exists(originalPath: string, params: any): Promise<boolean> {
    try {
      const key = this.generateKey(originalPath, params);
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if an original (unprocessed) file exists in the bucket
   */
  async existsOriginal(originalPath: string): Promise<boolean> {
    try {
      console.log(`🔍 Checking cloud storage for: ${originalPath}`);
      console.log(`📍 Bucket: ${this.config.bucketName}`);
      console.log(`📍 Endpoint: ${this.config.endpoint}`);
      
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: originalPath,
      }));
      return true;
    } catch (error: any) {
      console.log(`❌ Cloud storage error for ${originalPath}:`, error.message);
      if (error.$metadata) {
        console.log(`📊 Error metadata:`, error.$metadata);
      }
      return false;
    }
  }

  /**
   * Retrieves an original (unprocessed) file from the bucket
   */
  async downloadOriginal(originalPath: string): Promise<Buffer> {
    const response = await this.s3Client.send(new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: originalPath,
    }));

    if (!response.Body) {
      throw new Error('File not found');
    }

    // Converts the stream to buffer
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Uploads a file to the bucket
   */
  async upload(originalPath: string, params: any, buffer: Buffer, contentType: string): Promise<string> {
    const key = this.generateKey(originalPath, params);
    
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache 1 year
    }));

    // Returns the public URL
    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${key}`;
    } else {
      return `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;
    }
  }

  /**
   * Retrieves a file from the bucket
   */
  async download(originalPath: string, params: any): Promise<Buffer> {
    const key = this.generateKey(originalPath, params);
    
    const response = await this.s3Client.send(new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    }));

    if (!response.Body) {
      throw new Error('File not found');
    }

    // Converts the stream to buffer
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Generates a signed URL for temporary access (optional)
   */
  async getSignedUrl(originalPath: string, params: any, expiresIn: number = 3600): Promise<string> {
    const key = this.generateKey(originalPath, params);
    
    return await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }),
      { expiresIn }
    );
  }
}

// Default configuration (to be customized via environment variables)
export function createStorageClient(): CloudStorage | null {
  const provider = process.env.STORAGE_PROVIDER as 'aws' | 'cloudflare';
  
  if (!provider) {
    return null; // No cloud storage configured
  }

  const config: StorageConfig = {
    provider,
    region: process.env.STORAGE_REGION || 'us-east-1',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || '',
    bucketName: process.env.STORAGE_BUCKET_NAME || '',
    endpoint: process.env.STORAGE_ENDPOINT, // For Cloudflare R2
    publicUrl: process.env.STORAGE_PUBLIC_URL,
  };

  // Validation of required parameters
  if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    console.warn('Storage configuration incomplete. Cloud storage disabled.');
    return null;
  }

  return new CloudStorage(config);
}