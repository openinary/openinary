// Cloudflare R2 Types
export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  checksums: R2Checksums;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

export interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

export interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
  sha384?: ArrayBuffer;
  sha512?: ArrayBuffer;
}

export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata | Headers;
  customMetadata?: Record<string, string>;
  md5?: ArrayBuffer | string;
  sha1?: ArrayBuffer | string;
  sha256?: ArrayBuffer | string;
  sha384?: ArrayBuffer | string;
  sha512?: ArrayBuffer | string;
}

export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  startAfter?: string;
  include?: ("httpMetadata" | "customMetadata")[];
}

export interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
}

export interface R2MultipartUpload {
  uploadId: string;
  key: string;
}

export interface R2UploadedPart {
  partNumber: number;
  etag: string;
}

export interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: {
    onlyIf?: R2Conditional;
    range?: R2Range;
  }): Promise<R2ObjectBody | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions): Promise<R2Object | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  createMultipartUpload(key: string, options?: R2PutOptions): Promise<R2MultipartUpload>;
  uploadPart(key: string, uploadId: string, partNumber: number, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob): Promise<R2UploadedPart>;
  completeMultipartUpload(key: string, uploadId: string, parts: R2UploadedPart[]): Promise<R2Object | null>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
}