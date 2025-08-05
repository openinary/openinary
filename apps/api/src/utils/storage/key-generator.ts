import { createHash } from 'crypto';

export class KeyGenerator {
  /**
   * Generates a unique key for the file based on path and parameters
   */
  static generateKey(originalPath: string, params: any): string {
    const paramsString = JSON.stringify(params);
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