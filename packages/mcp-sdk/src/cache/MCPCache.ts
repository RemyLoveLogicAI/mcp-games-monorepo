/**
 * MCP Cache - In-memory caching layer with TTL support
 *
 * Features:
 * - Configurable TTL per entry
 * - LRU/LFU/FIFO eviction policies
 * - Size-based limits
 * - Cache statistics tracking
 */

import type {
  CacheConfig,
  CacheEntry,
  CacheMetadata,
  CacheStats,
  EvictionPolicy,
} from 'shared-types';

/**
 * Default cache configuration
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  defaultTtlMs: 5 * 60 * 1000, // 5 minutes
  maxEntries: 1000,
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  evictionPolicy: 'lru',
};

/**
 * Internal cache entry with additional tracking data
 */
interface InternalCacheEntry<T> extends CacheEntry<T> {
  lastAccessedAt: string;
  accessCount: number;
  insertionOrder: number;
}

/**
 * High-performance in-memory cache for MCP query results
 */
export class MCPCache {
  private cache: Map<string, InternalCacheEntry<unknown>> = new Map();
  private config: CacheConfig;
  private stats: CacheStats;
  private insertionCounter = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0,
      sizeBytes: 0,
      hitRate: 0,
    };
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    if (!this.config.enabled) {
      return null;
    }

    const entry = this.cache.get(key) as InternalCacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access tracking for LRU/LFU
    entry.lastAccessedAt = new Date().toISOString();
    entry.accessCount++;
    entry.metadata.hitCount++;

    this.stats.hits++;
    this.updateHitRate();

    return entry.data;
  }

  /**
   * Set a value in the cache
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    if (!this.config.enabled) {
      return;
    }

    const effectiveTtl = ttlMs ?? this.config.defaultTtlMs;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + effectiveTtl);
    const dataSize = this.estimateSize(data);

    // Evict entries if necessary
    this.evictIfNecessary(dataSize);

    const entry: InternalCacheEntry<T> = {
      data,
      metadata: {
        key,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttlMs: effectiveTtl,
        hitCount: 0,
        size: dataSize,
      },
      lastAccessedAt: now.toISOString(),
      accessCount: 0,
      insertionOrder: this.insertionCounter++,
    };

    // Update size tracking
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.stats.sizeBytes -= existingEntry.metadata.size ?? 0;
    }

    this.cache.set(key, entry);
    this.stats.entries = this.cache.size;
    this.stats.sizeBytes += dataSize;
  }

  /**
   * Check if cache has a valid (non-expired) entry for key
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete an entry from the cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.sizeBytes -= entry.metadata.size ?? 0;
      this.cache.delete(key);
      this.stats.entries = this.cache.size;
      return true;
    }
    return false;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0,
      sizeBytes: 0,
      hitRate: 0,
    };
    this.insertionCounter = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get all keys in the cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get metadata for a cache entry
   */
  getMetadata(key: string): CacheMetadata | null {
    const entry = this.cache.get(key);
    return entry ? { ...entry.metadata } : null;
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): number {
    let cleaned = 0;
    const now = new Date();

    for (const [key, entry] of this.cache.entries()) {
      if (new Date(entry.metadata.expiresAt) <= now) {
        this.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Generate a cache key from query parameters
   */
  static generateKey(
    servers: string[],
    query: string,
    filters?: Record<string, unknown>
  ): string {
    const normalizedServers = [...servers].sort().join(',');
    const filterString = filters ? JSON.stringify(filters, Object.keys(filters).sort()) : '';
    return `mcp:${normalizedServers}:${query}:${filterString}`;
  }

  // Private methods

  private isExpired(entry: InternalCacheEntry<unknown>): boolean {
    return new Date(entry.metadata.expiresAt) <= new Date();
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private estimateSize(data: unknown): number {
    // Rough estimate of object size in bytes
    try {
      const json = JSON.stringify(data);
      return json.length * 2; // UTF-16 characters = 2 bytes each
    } catch {
      return 1024; // Default estimate for non-serializable objects
    }
  }

  private evictIfNecessary(newEntrySize: number): void {
    // Check entry count limit
    while (this.cache.size >= this.config.maxEntries) {
      this.evictOne();
    }

    // Check size limit
    if (this.config.maxSizeBytes) {
      while (this.stats.sizeBytes + newEntrySize > this.config.maxSizeBytes && this.cache.size > 0) {
        this.evictOne();
      }
    }
  }

  private evictOne(): void {
    const keyToEvict = this.selectEvictionCandidate();
    if (keyToEvict) {
      this.delete(keyToEvict);
    }
  }

  private selectEvictionCandidate(): string | null {
    if (this.cache.size === 0) return null;

    const entries = Array.from(this.cache.entries());

    switch (this.config.evictionPolicy) {
      case 'lru': {
        // Least Recently Used
        let oldest: [string, InternalCacheEntry<unknown>] | null = null;
        for (const entry of entries) {
          if (!oldest || entry[1].lastAccessedAt < oldest[1].lastAccessedAt) {
            oldest = entry;
          }
        }
        return oldest?.[0] ?? null;
      }

      case 'lfu': {
        // Least Frequently Used
        let leastUsed: [string, InternalCacheEntry<unknown>] | null = null;
        for (const entry of entries) {
          if (!leastUsed || entry[1].accessCount < leastUsed[1].accessCount) {
            leastUsed = entry;
          }
        }
        return leastUsed?.[0] ?? null;
      }

      case 'fifo': {
        // First In First Out
        let firstIn: [string, InternalCacheEntry<unknown>] | null = null;
        for (const entry of entries) {
          if (!firstIn || entry[1].insertionOrder < firstIn[1].insertionOrder) {
            firstIn = entry;
          }
        }
        return firstIn?.[0] ?? null;
      }

      case 'ttl': {
        // Evict entry closest to expiration
        let soonestExpiry: [string, InternalCacheEntry<unknown>] | null = null;
        for (const entry of entries) {
          if (!soonestExpiry || entry[1].metadata.expiresAt < soonestExpiry[1].metadata.expiresAt) {
            soonestExpiry = entry;
          }
        }
        return soonestExpiry?.[0] ?? null;
      }

      default:
        return entries[0]?.[0] ?? null;
    }
  }
}
