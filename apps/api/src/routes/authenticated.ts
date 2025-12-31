import { Hono } from 'hono';
import { TransformService } from '../services/transform.service';
import logger from '../utils/logger';
import crypto from 'crypto';

const t = new Hono();
const transformService = new TransformService();

// Get API_SECRET from environment variables
const API_SECRET = process.env.API_SECRET;

if (!API_SECRET) {
  logger.warn(
    'API_SECRET environment variable is not set. Authenticated route will not work properly.'
  );
}

t.get('/*', async (c) => {
  const path = c.req.path;
  const userAgent = c.req.header('User-Agent') ?? '';
  const acceptHeader = c.req.header('Accept');

  try {
    // Parse the authenticated URL format: /s--{signature}/{transformations}/{route}
    const segments = path.split('/').slice(2); // Remove '/s' prefix

    if (segments.length < 2) {
      return c.text(
        'Invalid authenticated URL format. Expected: /s--{signature}/{transformations}/{route}',
        400
      );
    }

    // Extract signature from first segment (format: s--{signature})
    const firstSegment = segments[0];
    if (!firstSegment.startsWith('s--')) {
      return c.text('Invalid signature format. Expected: s--{signature}', 400);
    }

    const signature = firstSegment.slice(3); // Remove 's--' prefix

    if (signature.length !== 8) {
      return c.text('Invalid signature length. Expected 8 characters.', 400);
    }

    // Extract transformations and route from remaining segments
    const routeSegments = segments.slice(1);
    if (routeSegments.length < 1) {
      return c.text('No route specified.', 400);
    }

    // Determine transformation string and file path
    // Format: {transformations}/{route}
    const hasTransform =
      routeSegments.length > 0 &&
      !routeSegments[0].includes('.') &&
      (routeSegments[0].includes(',') || routeSegments[0].includes('_'));

    const transformations = hasTransform ? routeSegments[0] : '';
    const filePathSegments = hasTransform
      ? routeSegments.slice(1)
      : routeSegments;
    const filePath = filePathSegments.join('/');

    if (!filePath) {
      return c.text('No file path specified.', 400);
    }

    // Verify the signature
    if (!API_SECRET) {
      return c.text('API_SECRET not configured on server.', 500);
    }

    // Create the string to sign: {transformations}/{filePath}{API_SECRET}
    const stringToSign = hasTransform
      ? `${transformations}/${filePath}${API_SECRET}`
      : `${filePath}${API_SECRET}`;

    // Compute SHA-1 hash
    const hash = crypto.createHash('sha1');
    hash.update(stringToSign);
    const hashHex = hash.digest('hex');

    // Take first 8 characters for comparison
    const computedSignature = hashHex.substring(0, 8);

    // Verify signature matches
    if (computedSignature !== signature) {
      logger.warn(
        {
          path,
          signature,
          computedSignature,
          stringToSign,
        },
        'Invalid signature for authenticated request'
      );

      return c.text('Invalid signature', 401);
    }

    // Construct the path for the transform service
    // Format: /t/{transformations}/{filePath}
    const transformPath = `/t/${transformations ? transformations + '/' : ''}${filePath}`;

    // Use the transform service with the constructed path
    const result = await transformService.transform({
      path: transformPath,
      userAgent,
      acceptHeader,
      context: c,
    });

    // Set response headers
    Object.entries(result.headers).forEach(([key, value]) => {
      c.header(key, value);
    });

    // Determine content type if not set in headers
    if (!result.contentType) {
      // Extract file extension from path
      const ext = filePath.split('.').pop()?.toLowerCase();
      const contentTypeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        avif: 'image/avif',
        gif: 'image/gif',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        webm: 'video/webm',
      };
      const contentType =
        contentTypeMap[ext || ''] || 'application/octet-stream';
      c.header('Content-Type', contentType);
    } else {
      c.header('Content-Type', result.contentType);
    }

    // Check if this is an error response
    if (
      result.contentType === 'text/plain' &&
      result.buffer.toString().includes('failed')
    ) {
      const errorMessage = result.buffer.toString();
      if (errorMessage.includes('File not found')) {
        return c.text(errorMessage, 404);
      }
      return c.text(errorMessage, 500);
    }

    return c.body(new Uint8Array(result.buffer));
  } catch (error) {
    logger.error({ error, path }, 'Authenticated transform route error');
    return c.text('Internal server error', 500);
  }
});

export default t;
