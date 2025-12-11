import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageConfig } from 'shared';

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

    // Universal S3-compatible configuration
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = true; // Required for most S3-compatible providers
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
    } catch {
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
   * Lists objects under an optional prefix
   */
  async listObjects(prefix?: string): Promise<{ key: string; size?: number }[]> {
    const results: { key: string; size?: number }[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key) {
            results.push({
              key: object.Key,
              size: object.Size,
            });
          }
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return results;
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
    }
    
    // For custom endpoints, construct URL from endpoint
    if (this.config.endpoint) {
      const endpointUrl = this.config.endpoint.replace(/\/$/, '');
      return `${endpointUrl}/${this.config.bucketName}/${key}`;
    }
    
    // Default AWS S3 URL format
    return `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  /**
   * Deletes an object from the bucket
   */
  async deleteObject(key: string): Promise<void> {
    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    }));
  }

  /**
   * Gets object metadata (size, lastModified) without downloading the file
   */
  async getObjectMetadata(key: string): Promise<{ size: number; lastModified: Date } | null> {
    try {
      const response = await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }));

      return {
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Gets the bucket name
   */
  get bucketName(): string {
    return this.config.bucketName;
  }
}