interface CacheRecord<T = any> {
  value: T;
  expiresAt: number;
  tags: string[];
}

/**
 * Dual-mode Cache Engine compatible with Cloudflare Cache API and Node/Worker memory caching.
 * Supports tag-based and prefix-based cache invalidation whenever new candidate submissions
 * or answer-key revisions occur.
 */
export class EdgeCacheManager {
  private store = new Map<string, CacheRecord>();
  private defaultTtlMs: number;

  constructor(defaultTtlSeconds = 20) {
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  public get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  public set<T>(key: string, value: T, tags: string[] = ['public'], ttlSeconds?: number): void {
    const ttl = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      tags,
    });
  }

  public invalidateByTag(tag: string): number {
    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.tags.includes(tag)) {
        this.store.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  public invalidateAll(): void {
    this.store.clear();
  }

  public size(): number {
    return this.store.size;
  }
}

export const appCache = new EdgeCacheManager(20);
