import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageConfig } from './types';

export class S3ClientWrapper {
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
   * Checks if an object exists in the bucket
   */
  async objectExists(key: string): Promise<boolean> {
    try {
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
   * Downloads an object from the bucket
   */
  async downloadObject(key: string): Promise<Buffer> {
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
   * Uploads an object to the bucket
   */
  async uploadObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache 1 year
    }));
  }

  /**
   * Generates a signed URL for temporary access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return await getSignedUrl(
      this.s3Client,
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }),
      { expiresIn }
    );
  }

  /**
   * Generates public URL for the object
   */
  getPublicUrl(key: string): string {
    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${key}`;
    } else {
      return `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;
    }
  }

  /**
   * Gets the bucket name
   */
  get bucketName(): string {
    return this.config.bucketName;
  }
}