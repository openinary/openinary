import { StorageConfig, StorageClientOptions } from "shared";
import { createStorageClient } from "@openinary/core";

/**
 * Single place where the self-hosted app reads STORAGE_* environment
 * variables. Keeping this out of utils/storage keeps that layer a pure
 * function of its inputs, so it can be reused by callers that resolve
 * storage config a different way (e.g. per-tenant, from a database).
 */
export function getStorageConfigFromEnv(): {
  config: StorageConfig;
  clientOptions: StorageClientOptions;
} {
  const config: StorageConfig = {
    region: process.env.STORAGE_REGION || "auto",
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
    bucketName: process.env.STORAGE_BUCKET_NAME || "",
    endpoint: process.env.STORAGE_ENDPOINT,
    publicUrl: process.env.STORAGE_PUBLIC_URL,
  };

  const clientOptions: StorageClientOptions = {
    maxSockets: parseInt(process.env.STORAGE_MAX_SOCKETS || "50", 10),
    connectionTimeout: parseInt(
      process.env.STORAGE_CONNECTION_TIMEOUT || "0",
      10,
    ),
    requestTimeout: parseInt(process.env.STORAGE_REQUEST_TIMEOUT || "0", 10),
    socketTimeout: parseInt(process.env.STORAGE_SOCKET_TIMEOUT || "0", 10),
  };

  return { config, clientOptions };
}

/**
 * Convenience wrapper for the common case (self-hosted, single global
 * config). Equivalent to the old zero-arg createStorageClient(). Builds a
 * fresh client on every call - most callers want getSharedStorage() instead.
 */
export function createStorageClientFromEnv() {
  const { config, clientOptions } = getStorageConfigFromEnv();
  return createStorageClient(config, clientOptions);
}

let sharedStorage: ReturnType<typeof createStorageClientFromEnv> | undefined;

/**
 * The one CloudStorage instance shared by every route and background worker
 * in this process. Lazily built on first use so it doesn't matter whether
 * index.ts (route wiring) or server.ts (queue init, cache cleanup) resolves
 * it first - both get the same client instead of each opening its own S3
 * connection pool.
 */
export function getSharedStorage() {
  if (sharedStorage === undefined) {
    sharedStorage = createStorageClientFromEnv();
  }
  return sharedStorage;
}
