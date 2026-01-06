import crypto from 'crypto';
import path from 'path';
import logger from './logger';

/**
 * Signature utility for authenticated delivery URLs
 * Uses HMAC-SHA256 for cryptographically secure signatures
 */

export const SIGNATURE_LENGTH = 16; // 64 bits of entropy

/**
 * Sanitizes a file path to prevent path traversal attacks
 * @param filePath - The file path to sanitize
 * @returns Sanitized file path
 */
export function sanitizeFilePath(filePath: string): string {
  // Normalize the path to resolve any '..' or '.' segments
  const normalized = path.normalize(filePath);

  // Remove any leading path traversal sequences
  const sanitized = normalized.replace(/^(\.\.[/\\])+/, '');

  // Additional check: reject paths that still contain '..'
  if (sanitized.includes('..')) {
    throw new Error('Invalid file path: path traversal detected');
  }

  return sanitized;
}

/**
 * Generates a cryptographically secure signature for authenticated URLs
 * @param transformations - The transformation string (e.g., "c_fill,w_300,h_250")
 * @param filePath - The file path
 * @param secret - The API secret key
 * @returns The signature (first SIGNATURE_LENGTH characters of HMAC-SHA256)
 */
export function generateSignature(
  transformations: string,
  filePath: string,
  secret: string
): string {
  if (!secret) {
    throw new Error('API_SECRET is required for signature generation');
  }

  // Sanitize the file path to prevent path traversal
  const sanitizedPath = sanitizeFilePath(filePath);

  // Create the string to sign
  const stringToSign = transformations
    ? `${transformations}/${sanitizedPath}`
    : sanitizedPath;

  // Generate HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(stringToSign);
  const signature = hmac.digest('hex').substring(0, SIGNATURE_LENGTH);

  return signature;
}

/**
 * Verifies a signature using timing-safe comparison
 * @param providedSignature - The signature provided in the URL
 * @param transformations - The transformation string
 * @param filePath - The file path
 * @param secret - The API secret key
 * @returns True if the signature is valid, false otherwise
 */
export function verifySignature(
  providedSignature: string,
  transformations: string,
  filePath: string,
  secret: string
): boolean {
  if (!secret) {
    logger.error('API_SECRET is not configured for signature verification');
    return false;
  }

  // Validate signature length
  if (providedSignature.length !== SIGNATURE_LENGTH) {
    logger.warn(
      { providedLength: providedSignature.length, expectedLength: SIGNATURE_LENGTH },
      'Invalid signature length'
    );
    return false;
  }

  try {
    // Generate the expected signature
    const expectedSignature = generateSignature(transformations, filePath, secret);

    // Use timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    // Both buffers must have the same length for timingSafeEqual
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (error) {
    logger.error({ error }, 'Error during signature verification');
    return false;
  }
}

/**
 * Validates that the API_SECRET is properly configured
 * @param secret - The API secret to validate
 * @throws Error if the secret is not configured or is too weak
 */
export function validateApiSecret(secret: string | undefined): void {
  if (!secret) {
    throw new Error(
      'API_SECRET environment variable is required for authenticated delivery URLs. ' +
      'Please set a strong secret key in your environment configuration.'
    );
  }

  // Ensure the secret is reasonably strong (at least 16 characters)
  if (secret.length < 16) {
    throw new Error(
      'API_SECRET must be at least 16 characters long for adequate security. ' +
      `Current length: ${secret.length}`
    );
  }

  logger.info('API_SECRET validation passed');
}
