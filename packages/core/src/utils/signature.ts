import logger from "./logger";
import { sign, verify } from "../url/hmac";
import { cleanStorageKey } from "../url/storage-layout";

/** @throws Error on a path that could leave its root */
export function sanitizeFilePath(filePath: string): string {
  const key = cleanStorageKey(filePath);
  if (key === null) throw new Error("Invalid file path: path traversal detected");
  return key;
}

const deliveryPayload = (transformations: string, filePath: string) => {
  const sanitizedPath = sanitizeFilePath(filePath);
  return transformations ? `${transformations}/${sanitizedPath}` : sanitizedPath;
};

/** Signature of an /authenticated delivery URL (the s--{signature} segment). */
export function generateSignature(
  transformations: string,
  filePath: string,
  secret: string,
): string {
  if (!secret) {
    throw new Error("API_SECRET is required for signature generation");
  }
  return sign(deliveryPayload(transformations, filePath), secret);
}

export function verifySignature(
  providedSignature: string,
  transformations: string,
  filePath: string,
  secret: string,
): boolean {
  try {
    return verify(providedSignature, deliveryPayload(transformations, filePath), secret);
  } catch {
    return false;
  }
}

/**
 * Signature of a presigned upload. The payload carries the expiry, since the
 * signature is handed to a browser and must stop working after a short window.
 */
export function generateUploadSignature(
  folder: string,
  expires: number,
  secret: string,
): string {
  if (!secret) {
    throw new Error("API_SECRET is required for signature generation");
  }
  return sign(`${folder}:${expires}`, secret);
}

export function verifyUploadSignature(
  providedSignature: string,
  folder: string,
  expires: number,
  secret: string,
): boolean {
  return Number.isFinite(expires) && verify(providedSignature, `${folder}:${expires}`, secret);
}

/**
 * @throws Error if the secret is missing or shorter than 16 characters
 */
export function validateApiSecret(secret: string | undefined): void {
  if (!secret) {
    throw new Error(
      "API_SECRET environment variable is required for authenticated delivery URLs. " +
        "Please set a strong secret key in your environment configuration.",
    );
  }
  if (secret.length < 16) {
    throw new Error(
      "API_SECRET must be at least 16 characters long for adequate security. " +
        `Current length: ${secret.length}`,
    );
  }
  logger.info("API_SECRET validation passed");
}
