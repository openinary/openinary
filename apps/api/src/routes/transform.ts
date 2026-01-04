import { Hono } from 'hono';
import { TransformService } from '../services/transform.service';
import logger from '../utils/logger';

const t = new Hono();
const transformService = new TransformService();

t.get('/*', async (c) => {
  const path = c.req.path;
  const userAgent = c.req.header('User-Agent') ?? '';
  const acceptHeader = c.req.header('Accept');

  try {
    const result = await transformService.transform({
      path,
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
      const ext = path.split('.').pop()?.toLowerCase();
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
    logger.error({ error, path }, 'Transform route error');
    return c.text('Internal server error', 500);
  }
});

export default t;
