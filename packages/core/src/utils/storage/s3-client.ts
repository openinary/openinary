import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import https from "https";
import { StorageConfig, StorageClientOptions } from "shared";

export class S3ClientWrapper {
  private s3Client: S3Client;
  private config: StorageConfig;

  constructor(config: StorageConfig, clientOptions: StorageClientOptions = {}) {
    this.config = config;

    // Configure HTTP handler with socket settings (caller resolves these,
    // e.g. from environment variables in self-hosted mode)
    const maxSockets = clientOptions.maxSockets ?? 50;
    const connectionTimeout = clientOptions.connectionTimeout ?? 0;
    const requestTimeout = clientOptions.requestTimeout ?? 0;
    const socketTimeout = clientOptions.socketTimeout ?? 0;

    const clientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && {
        endpoint: config.endpoint,
        forcePathStyle: true, // Required for most S3-compatible providers
      }),
      requestHandler: {
        httpsAgent: new https.Agent({
          keepAlive: true,
          maxSockets,
        }),
        ...(connectionTimeout > 0 && { connectionTimeout }),
        ...(requestTimeout > 0 && { requestTimeout }),
        ...(socketTimeout > 0 && { socketTimeout }),
      },
    };

    this.s3Client = new S3Client(clientConfig);
  }

  /**
   * Checks if an object exists in the bucket
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Downloads an object from the bucket
   */
  async downloadObject(key: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error("File not found");
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
   * Downloads an object as a stream, without buffering it in memory.
   * Used to serve large files (e.g. original videos) directly to clients.
   */
  async downloadObjectStream(key: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    contentLength?: number;
    contentType?: string;
  }> {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error("File not found");
    }

    return {
      stream: response.Body.transformToWebStream() as ReadableStream<Uint8Array>,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
    };
  }

  /**
   * Lists objects under an optional prefix
   */
  async listObjects(
    prefix?: string,
    maxKeys?: number,
  ): Promise<{ key: string; size?: number; lastModified?: Date }[]> {
    const results: { key: string; size?: number; lastModified?: Date }[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucketName,
          Prefix: prefix,
          MaxKeys: maxKeys,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key) {
            results.push({
              key: object.Key,
              size: object.Size,
              lastModified: object.LastModified,
            });
          }
        }
      }

      continuationToken =
        response.IsTruncated && (!maxKeys || results.length < maxKeys)
          ? response.NextContinuationToken
          : undefined;
    } while (continuationToken);

    return results;
  }

  /**
   * Lists a single page of one directory level using Delimiter: "/"
   * Returns direct child prefixes (CommonPrefixes) and direct child objects
   */
  async listDelimitedPage(
    prefix: string,
    maxKeys = 1000,
    continuationToken?: string,
  ): Promise<{
    prefixes: string[];
    objects: { key: string; size?: number; lastModified?: Date }[];
    isTruncated: boolean;
    nextToken?: string;
  }> {
    const response = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.config.bucketName,
        Prefix: prefix,
        Delimiter: "/",
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      }),
    );

    const prefixes: string[] = [];
    for (const commonPrefix of response.CommonPrefixes ?? []) {
      if (commonPrefix.Prefix) {
        prefixes.push(commonPrefix.Prefix);
      }
    }

    const objects: { key: string; size?: number; lastModified?: Date }[] = [];
    for (const object of response.Contents ?? []) {
      if (object.Key) {
        objects.push({
          key: object.Key,
          size: object.Size,
          lastModified: object.LastModified,
        });
      }
    }

    return {
      prefixes,
      objects,
      isTruncated: response.IsTruncated ?? false,
      nextToken: response.NextContinuationToken,
    };
  }

  /**
   * Lists one full directory level (all pages) using Delimiter: "/"
   */
  async listDelimited(prefix: string): Promise<{
    prefixes: string[];
    objects: { key: string; size?: number; lastModified?: Date }[];
  }> {
    // Some S3-compatible providers repeat CommonPrefixes across pages
    const prefixes = new Set<string>();
    const objects: { key: string; size?: number; lastModified?: Date }[] = [];
    let continuationToken: string | undefined;

    do {
      const page = await this.listDelimitedPage(
        prefix,
        1000,
        continuationToken,
      );
      for (const p of page.prefixes) {
        prefixes.add(p);
      }
      objects.push(...page.objects);
      continuationToken = page.isTruncated ? page.nextToken : undefined;
    } while (continuationToken);

    return { prefixes: [...prefixes], objects };
  }

  /**
   * Uploads an object to the bucket
   */
  async uploadObject(
    key: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000", // Cache 1 year
        Metadata: metadata,
      }),
    );
  }

  /**
   * Creates a zero-byte object to represent a folder in S3-compatible storage
   */
  async createFolderMarker(key: string): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        Body: "",
        ContentType: "application/x-directory",
      }),
    );
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
      { expiresIn },
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
      const endpointUrl = this.config.endpoint.replace(/\/$/, "");
      return `${endpointUrl}/${this.config.bucketName}/${key}`;
    }

    // Default AWS S3 URL format
    return `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  /**
   * Copies an object within the bucket to a new key
   */
  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucketName,
        CopySource: `${this.config.bucketName}/${sourceKey
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        Key: destKey,
      }),
    );
  }

  /**
   * Deletes an object from the bucket
   */
  async deleteObject(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
      }),
    );
  }

  /**
   * Gets object metadata (size, lastModified) without downloading the file
   */
  async getObjectMetadata(
    key: string,
  ): Promise<{
    size: number;
    lastModified: Date;
    metadata?: Record<string, string>;
  } | null> {
    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucketName,
          Key: key,
        }),
      );

      return {
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
        metadata: response.Metadata,
      };
    } catch {
      return null;
    }
  }

  /**
   * Deletes multiple objects from the bucket (up to 1000 at once)
   */
  async deleteObjects(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    // S3 DeleteObjects can delete up to 1000 objects at once
    const batches: string[][] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      batches.push(keys.slice(i, i + 1000));
    }

    let totalDeleted = 0;
    for (const batch of batches) {
      const response = await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucketName,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );

      totalDeleted += batch.length - (response.Errors?.length ?? 0);
    }

    return totalDeleted;
  }

  /**
   * Gets the bucket name
   */
  get bucketName(): string {
    return this.config.bucketName;
  }
}
