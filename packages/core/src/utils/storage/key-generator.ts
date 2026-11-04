import { createHash } from 'crypto';

export class KeyGenerator {
  /**
   * Generates a unique key for the file based on path and parameters
   */
  static generateKey(originalPath: string, params: any): string {
    // Key order must not matter: the video job store persists params with
    // sorted keys, so the worker uploaded a transcode under a different key
    // than the one the request later looks up (w_320,h_240 hashed as
    // {"height","width"} on upload and {"width","height"} on lookup), and
    // every multi-parameter video was re-transcoded once the local cache
    // was gone. Same normalization as sqlite-video-job-store.
    const paramsString = JSON.stringify(
      params && typeof params === 'object' && !Array.isArray(params)
        ? Object.fromEntries(Object.keys(params).sort().map((k) => [k, params[k]]))
        : params,
    );
    const hash = createHash('md5').update(originalPath + paramsString).digest('hex');
    const ext = originalPath.split('.').pop();
    return `cache/${hash}.${ext}`;
  }

  /**
   * Generates cache key for existence check
   */
  static generateCacheKey(originalPath: string, params?: any): string {
    if (params) {
      const key = this.generateKey(originalPath, params);
      return `exists:${key}`;
    }
    return `original:${originalPath}`;
  }
}