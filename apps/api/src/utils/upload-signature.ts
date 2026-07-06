import crypto from 'crypto';

/**
 * Signature utility for presigned client-side uploads.
 * Mirrors utils/signature.ts (used for /authenticated delivery URLs) but the
 * signed payload includes an expiry, since presigned uploads are meant to be
 * handed to a browser and should stop working after a short window.
 */

export const UPLOAD_SIGNATURE_LENGTH = 16; // 64 bits of entropy

/**
 * Generates a cryptographically secure signature for a presigned upload.
 * @param folder - The destination folder the upload is scoped to (empty string for root)
 * @param expires - Unix timestamp (seconds) after which the signature is no longer valid
 * @param secret - The API secret key
 * @returns The signature (first UPLOAD_SIGNATURE_LENGTH characters of HMAC-SHA256)
 */
export function generateUploadSignature(
  folder: string,
  expires: number,
  secret: string
): string {
  if (!secret) {
    throw new Error('API_SECRET is required for signature generation');
  }

  const stringToSign = `${folder}:${expires}`;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(stringToSign);
  return hmac.digest('hex').substring(0, UPLOAD_SIGNATURE_LENGTH);
}

/**
 * Verifies a presigned upload signature using timing-safe comparison.
 * @param providedSignature - The signature submitted with the upload
 * @param folder - The destination folder submitted with the upload
 * @param expires - The expiry timestamp submitted with the upload
 * @param secret - The API secret key
 * @returns True if the signature is valid, false otherwise
 */
export function verifyUploadSignature(
  providedSignature: string,
  folder: string,
  expires: number,
  secret: string
): boolean {
  if (!secret || !providedSignature) {
    return false;
  }

  if (providedSignature.length !== UPLOAD_SIGNATURE_LENGTH) {
    return false;
  }

  if (!Number.isFinite(expires)) {
    return false;
  }

  try {
    const expectedSignature = generateUploadSignature(folder, expires, secret);

    const providedBuffer = Buffer.from(providedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
