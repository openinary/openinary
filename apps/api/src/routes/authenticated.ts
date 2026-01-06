import { Hono } from 'hono';
import { TransformService } from '../services/transform.service';
import logger from '../utils/logger';
import { verifySignature, SIGNATURE_LENGTH, sanitizeFilePath } from '../utils/signature';

const t = new Hono();
const transformService = new TransformService();

// Get API_SECRET from environment variables
const API_SECRET = process.env.API_SECRET;

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

    if (signature.length !== SIGNATURE_LENGTH) {
      return c.text(`Invalid signature length. Expected ${SIGNATURE_LENGTH} characters.`, 400);
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

    // Sanitize the file path to prevent path traversal attacks
    let sanitizedFilePath: string;
    try {
      sanitizedFilePath = sanitizeFilePath(filePath);
    } catch (error) {
      logger.warn(
        {
          path,
          filePath,
          error,
        },
        'Path traversal attempt detected in authenticated request'
      );
      return c.text('Invalid file path', 400);
    }

    // Verify the signature using timing-safe comparison and HMAC-SHA256
    if (!API_SECRET) {
      return c.text('API_SECRET not configured on server.', 500);
    }

    const isValidSignature = verifySignature(
      signature,
      transformations,
      sanitizedFilePath,
      API_SECRET
    );

    if (!isValidSignature) {
      logger.warn(
        {
          path,
          signature,
          transformations,
          filePath: sanitizedFilePath,
        },
        'Invalid signature for authenticated request'
      );

      return c.text('Invalid signature', 401);
    }

    // Construct the path for the transform service using the sanitized path
    // Format: /t/{transformations}/{filePath}
    const transformPath = `/t/${transformations ? `${transformations}/` : ''}${sanitizedFilePath}`;

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
      // Extract file extension from sanitized path
      const ext = sanitizedFilePath.split('.').pop()?.toLowerCase();
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
