/**
 * Cache Module - LRU Cache with TTL support
 * 
 * Provides a high-performance cache implementation for frequent operations
 * in the Scope Gate module.
 * 
 * ## Features
 * - LRU (Least Recently Used) eviction policy
 * - TTL (Time To Live) support for automatic expiration
 * - Configurable max size
 * - Thread-safe operations
 * 
 * ## Usage
 * 
 * ```typescript
 * import { LRUCache } from '@specforge/scope-gate';
 * 
 * const cache = new LRUCache<string, number>({
 *   maxSize: 100,
 *   ttlMs: 60000  // 1 minute TTL
 * });
 * 
 * cache.set('key1', 42);
 * const value = cache.get('key1'); // 42
 * ```
 */

import type { ScopeContext } from './types.js';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Maximum number of entries */
  maxSize?: number;
  /** Time to live in milliseconds */
  ttlMs?: number;
  /** Enable TTL (default: true) */
  enableTtl?: boolean;
  /** Callback when entry is evicted */
  onEvict?: (key: string, value: any) => void;
}

/**
 * Statistics about cache performance
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

/**
 * LRU Cache with TTL support
 * 
 * Implements a Least Recently Used cache with automatic expiration
 * based on time-to-live.
 * 
 * @example
 * ```typescript
 * const cache = new LRUCache<string, string>({
 *   maxSize: 1000,
 *   ttlMs: 60000
 * });
 * ```
 */
export class LRUCache<K extends string | number, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private enableTtl: boolean;
  private onEvict?: (key: K, value: V) => void;
  
  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.ttlMs = options.ttlMs ?? 60000; // Default 1 minute
    this.enableTtl = options.enableTtl ?? true;
    this.onEvict = options.onEvict;
  }

  /**
   * Get a value from the cache
   * Returns undefined if not found, expired, or evicted
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return undefined;
    }
    
    // Check TTL expiration
    if (this.enableTtl && this.isExpired(entry)) {
      this.removeEntry(key);
      this.expirations++;
      this.misses++;
      return undefined;
    }
    
    // Update access metadata (move to end for LRU)
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   * Evicts LRU entries if at capacity
   */
  set(key: K, value: V): void {
    const now = Date.now();
    
    // If key exists, update it
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      entry.value = value;
      entry.lastAccessedAt = now;
      entry.accessCount++;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return;
    }
    
    // Evict if at capacity
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    // Add new entry
    const entry: CacheEntry<V> = {
      value,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1
    };
    this.cache.set(key, entry);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.enableTtl && this.isExpired(entry)) {
      this.removeEntry(key);
      this.expirations++;
      return false;
    }
    
    return true;
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.removeEntry(key);
      return true;
    }
    return false;
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expirations = 0;
  }

  /**
   * Set max size
   */
  setMaxSize(size: number): void {
    this.maxSize = size;
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Set TTL
   */
  setTTL(ttlMs: number): void {
    this.ttlMs = ttlMs;
  }

  /**
   * Invalidate all entries (clear cache but keep stats)
   */
  invalidate(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries (for manual cleanup)
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.enableTtl && (now - entry.createdAt) > this.ttlMs) {
        this.removeEntry(key);
        cleaned++;
        this.expirations++;
      }
    }
    
    return cleaned;
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    return (Date.now() - entry.createdAt) > this.ttlMs;
  }

  /**
   * Remove entry and call onEvict callback
   */
  private removeEntry(key: K): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.onEvict?.(key, entry.value);
      this.cache.delete(key);
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    // Find oldest entry (first in iteration order)
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      const entry = this.cache.get(firstKey);
      this.evictions++;
      this.onEvict?.(firstKey, entry?.value as V);
      this.cache.delete(firstKey);
    }
  }
}

/**
 * Generate cache key for scope availability check
 * Combines capability ID and context for a unique key
 */
export function scopeAvailabilityCacheKey(
  capabilityId: string,
  context: ScopeContext
): string {
  // Create a compact key from capability and context
  const flags = Array.from(context.featureFlags).sort().join(',');
  return `${capabilityId}|${context.releaseBranch}|${context.environment}|${flags}`;
}

/**
 * Generate cache key for feature flag check
 */
export function featureFlagCacheKey(flagName: string): string {
  return `ff:${flagName.toLowerCase().trim()}`;
}

/**
 * Generate cache key for capability lookup
 */
export function capabilityCacheKey(capabilityId: string): string {
  return `cap:${capabilityId}`;
}

// Re-export types
export type { ScopeContext };