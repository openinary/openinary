import { CacheEntry } from 'shared';

export class StorageCache {
  private existsCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 60 * 1000; // 1 minute (reduced from 5 minutes to detect deletions faster)
  private readonly NEGATIVE_CACHE_TTL = 30 * 1000; // 30 seconds for "not found"
  private readonly MAX_CACHE_SIZE = 10000; // Maximum 10k entries

  constructor() {
    // Automatic cache cleanup every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Gets a cache entry
   */
  get(key: string): CacheEntry | undefined {
    const cached = this.existsCache.get(key);
    
    if (cached) {
      const age = Date.now() - cached.timestamp;
      const ttl = cached.exists ? this.CACHE_TTL : this.NEGATIVE_CACHE_TTL;
      
      if (age < ttl) {
        return cached;
      }
      
      // Remove expired entry
      this.existsCache.delete(key);
    }
    
    return undefined;
  }

  /**
   * Sets a cache entry with size management
   */
  set(key: string, entry: CacheEntry): void {
    // Cleanup if cache becomes too large
    if (this.existsCache.size >= this.MAX_CACHE_SIZE) {
      this.cleanup();
    }
    
    this.existsCache.set(key, entry);
  }

  /**
   * Deletes a cache entry
   */
  delete(key: string): void {
    this.existsCache.delete(key);
  }

  /**
   * Checks if cache hit is valid
   */
  isValidHit(key: string): boolean {
    const cached = this.get(key);
    return cached !== undefined;
  }

  /**
   * Gets cache size
   */
  get size(): number {
    return this.existsCache.size;
  }

  /**
   * Gets all cache keys
   */
  getAllKeys(): string[] {
    return Array.from(this.existsCache.keys());
  }

  /**
   * Automatic cache cleanup (LRU + TTL)
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, value] of this.existsCache.entries()) {
      const age = now - value.timestamp;
      const ttl = value.exists ? this.CACHE_TTL : this.NEGATIVE_CACHE_TTL;
      
      if (age > ttl) {
        this.existsCache.delete(key);
      }
    }
    
    // If still too large, remove the oldest entries
    if (this.existsCache.size > this.MAX_CACHE_SIZE * 0.8) {
      const entries = Array.from(this.existsCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, Math.floor(entries.length * 0.2));
      toRemove.forEach(([key]) => {
        this.existsCache.delete(key);
      });
    }
  }
}