import {
  createStorageClient,
  type StorageClientOptions,
  type StorageConfig,
} from "@openinary/core";

/** The one place the self-hosted app reads STORAGE_* variables. */
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
    // Undefined keeps the default "public/" layout; "" stores media at the
    // bucket root, so Openinary can serve a bucket whose layout it does not own.
    prefix: process.env.STORAGE_PREFIX,
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

let sharedStorage: ReturnType<typeof createStorageClient> | undefined;

/** One client (and one S3 connection pool) for the whole process. */
export function getSharedStorage() {
  if (sharedStorage === undefined) {
    const { config, clientOptions } = getStorageConfigFromEnv();
    sharedStorage = createStorageClient(config, clientOptions);
  }
  return sharedStorage;
}
