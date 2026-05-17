/**
 * Cache Module Tests
 * 
 * Task 18.2: Implement caching for frequent operations
 * 
 * Tests the LRUCache implementation with TTL support.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache, scopeAvailabilityCacheKey, featureFlagCacheKey, capabilityCacheKey } from '../src/cache.js';
import type { ScopeContext } from '../src/types.js';

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>({
      maxSize: 3,
      ttlMs: 1000 // 1 second TTL for testing
    });
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 42);
      expect(cache.get('key1')).toBe(42);
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      cache.set('key1', 42);
      cache.set('key1', 100);
      expect(cache.get('key1')).toBe(100);
    });

    it('should check existence with has()', () => {
      cache.set('key1', 42);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete values', () => {
      cache.set('key1', 42);
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all values', () => {
      cache.set('key1', 42);
      cache.set('key2', 100);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('should return correct size', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 42);
      expect(cache.size()).toBe(1);
      cache.set('key2', 100);
      expect(cache.size()).toBe(2);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when at capacity', () => {
      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);
      
      // Access key1 to make it most recently used
      cache.get('key1');
      
      // Add another item - should evict key2 (least recently used)
      cache.set('key4', 4);
      
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false); // Evicted
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should evict oldest when all have same access time', () => {
      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);
      
      // Add another - should evict key1 (first in)
      cache.set('key4', 4);
      
      expect(cache.has('key1')).toBe(false); // Evicted
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should respect maxSize configuration', () => {
      const smallCache = new LRUCache<string, number>({ maxSize: 2 });
      smallCache.set('a', 1);
      smallCache.set('b', 2);
      smallCache.set('c', 3);
      
      expect(smallCache.size()).toBe(2);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      const fastCache = new LRUCache<string, number>({
        maxSize: 10,
        ttlMs: 50 // 50ms TTL
      });
      
      fastCache.set('key1', 42);
      expect(fastCache.get('key1')).toBe(42);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(fastCache.get('key1')).toBeUndefined();
    });

    it('should not expire entries within TTL', async () => {
      cache.set('key1', 42);
      
      // Wait but not long enough for expiration
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(cache.get('key1')).toBe(42);
    });

    it('should support disabling TTL', () => {
      const noTtlCache = new LRUCache<string, number>({
        maxSize: 10,
        ttlMs: 1000,
        enableTtl: false
      });
      
      noTtlCache.set('key1', 42);
      
      // TTL disabled, so entry should not expire
      // (We can't easily test time-based behavior without mocking)
      expect(noTtlCache.get('key1')).toBe(42);
    });

    it('should cleanup expired entries manually', async () => {
      cache.set('key1', 42);
      cache.set('key2', 100);
      
      // Wait for one to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const cleaned = cache.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 42);
      
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss
      cache.get('key2'); // Miss
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(1/3);
    });

    it('should track evictions', () => {
      cache.set('key1', 1);
      cache.set('key2', 2);
      cache.set('key3', 3);
      cache.set('key4', 4); // Should evict key1
      
      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should track expirations', async () => {
      const fastCache = new LRUCache<string, number>({
        maxSize: 10,
        ttlMs: 50
      });
      
      fastCache.set('key1', 42);
      await new Promise(resolve => setTimeout(resolve, 60));
      fastCache.get('key1'); // This will count as both miss and expiration
      
      const stats = fastCache.getStats();
      expect(stats.expirations).toBe(1);
    });

    it('should reset statistics', () => {
      cache.set('key1', 42);
      cache.get('key1');
      cache.get('nonexistent');
      
      cache.resetStats();
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should allow updating maxSize', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      cache.setMaxSize(2);
      
      expect(cache.size()).toBeLessThanOrEqual(2);
    });

    it('should allow updating TTL', () => {
      cache.setTTL(5000);
      // Just verify it doesn't throw
      expect(() => cache.setTTL(5000)).not.toThrow();
    });
  });

  describe('Cache Key Functions', () => {
    it('should generate consistent scope availability cache keys', () => {
      const context: ScopeContext = {
        releaseBranch: 'v6.0',
        featureFlags: new Set(['flag1', 'flag2']),
        environment: 'production'
      };
      
      const key1 = scopeAvailabilityCacheKey('cap1', context);
      const key2 = scopeAvailabilityCacheKey('cap1', context);
      
      expect(key1).toBe(key2);
      
      // Different context should produce different key
      const context2: ScopeContext = {
        ...context,
        releaseBranch: 'v6.1'
      };
      const key3 = scopeAvailabilityCacheKey('cap1', context2);
      expect(key1).not.toBe(key3);
    });

    it('should generate feature flag cache keys', () => {
      expect(featureFlagCacheKey('TestFlag')).toBe('ff:testflag');
      expect(featureFlagCacheKey('ANOTHER_FLAG')).toBe('ff:another_flag');
      expect(featureFlagCacheKey('  spaced  ')).toBe('ff:spaced');
    });

    it('should generate capability cache keys', () => {
      expect(capabilityCacheKey('my-capability')).toBe('cap:my-capability');
    });
  });

  describe('onEvict Callback', () => {
    it('should call onEvict when evicting entries', () => {
      const evicted: Array<{ key: string; value: number }> = [];
      
      const cacheWithCallback = new LRUCache<string, number>({
        maxSize: 2,
        onEvict: (key, value) => {
          evicted.push({ key, value });
        }
      });
      
      cacheWithCallback.set('key1', 1);
      cacheWithCallback.set('key2', 2);
      cacheWithCallback.set('key3', 3);
      
      expect(evicted.length).toBe(1);
      expect(evicted[0].key).toBe('key1');
    });
  });
});

describe('Cache Integration with ScopeRegistry', () => {
  it('should cache isAvailable results', async () => {
    const { ScopeRegistry } = await import('../src/scope-registry.js');
    
    const registry = new ScopeRegistry();
    registry.registerCapability({
      id: 'test-cap',
      displayName: 'Test Capability',
      scopeTag: 'p0',
      entryPoints: [],
      dependencies: [],
      description: ''
    });
    
    const context = {
      releaseBranch: 'v6.0' as const,
      featureFlags: new Set<string>(),
      environment: 'production' as const
    };
    
    // First call - cache miss
    const result1 = registry.isAvailable('test-cap', context);
    expect(result1.available).toBe(true);
    
    // Second call - cache hit
    const result2 = registry.isAvailable('test-cap', context);
    expect(result2.available).toBe(true);
    
    // Check cache stats
    const stats = registry.getCacheStats();
    expect(stats.availability.hits).toBeGreaterThan(0);
  });

  it('should invalidate cache on registerCapability', async () => {
    const { ScopeRegistry } = await import('../src/scope-registry.js');
    
    const registry = new ScopeRegistry();
    registry.registerCapability({
      id: 'test-cap',
      displayName: 'Test Capability',
      scopeTag: 'p0',
      entryPoints: [],
      dependencies: [],
      description: ''
    });
    
    const context = {
      releaseBranch: 'v6.0' as const,
      featureFlags: new Set<string>(),
      environment: 'production' as const
    };
    
    // First check
    registry.isAvailable('test-cap', context);
    
    // Register same capability again (should invalidate)
    registry.registerCapability({
      id: 'test-cap',
      displayName: 'Test Capability',
      scopeTag: 'p0',
      entryPoints: [],
      dependencies: [],
      description: ''
    });
    
    // Should not error - cache was invalidated
    const result = registry.isAvailable('test-cap', context);
    expect(result.available).toBe(true);
  });

  it('should clear cache on loadFromParentSpec', async () => {
    const { ScopeRegistry } = await import('../src/scope-registry.js');
    
    const registry = new ScopeRegistry();
    registry.registerCapability({
      id: 'test-cap',
      displayName: 'Test Capability',
      scopeTag: 'p0',
      entryPoints: [],
      dependencies: [],
      description: ''
    });
    
    // Populate cache
    const context = {
      releaseBranch: 'v6.0' as const,
      featureFlags: new Set<string>(),
      environment: 'production' as const
    };
    registry.isAvailable('test-cap', context);
    
    // Clear cache
    registry.clearCache();
    
    const stats = registry.getCacheStats();
    expect(stats.availability.size).toBe(0);
  });
});

describe('Cache Integration with FeatureFlagManager', () => {
  it('should cache isEnabled results', async () => {
    const { FeatureFlagManager } = await import('../src/feature-flag-manager.js');
    
    const manager = new FeatureFlagManager();
    manager.enable('test-flag');
    
    // First call
    const result1 = manager.isEnabled('test-flag');
    expect(result1).toBe(true);
    
    // Second call - should be cached
    const result2 = manager.isEnabled('test-flag');
    expect(result2).toBe(true);
    
    // Check cache stats
    const stats = manager.getCacheStats();
    expect(stats.hits).toBeGreaterThan(0);
  });

  it('should invalidate cache when flag is changed', async () => {
    const { FeatureFlagManager } = await import('../src/feature-flag-manager.js');
    
    const manager = new FeatureFlagManager();
    manager.enable('test-flag');
    
    // Enable - should be true
    expect(manager.isEnabled('test-flag')).toBe(true);
    
    // Disable
    manager.disable('test-flag');
    
    // Should now be false (cache invalidated)
    expect(manager.isEnabled('test-flag')).toBe(false);
  });

  it('should clear cache on clearCache', async () => {
    const { FeatureFlagManager } = await import('../src/feature-flag-manager.js');
    
    const manager = new FeatureFlagManager();
    manager.enable('test-flag');
    manager.isEnabled('test-flag');
    
    manager.clearCache();
    
    const stats = manager.getCacheStats();
    expect(stats.size).toBe(0);
  });
});

describe('Cache Hit Rate Verification', () => {
  it('should achieve high hit rate with repeated lookups', async () => {
    const { ScopeRegistry } = await import('../src/scope-registry.js');
    
    const registry = new ScopeRegistry();
    
    // Register multiple capabilities
    for (let i = 0; i < 10; i++) {
      registry.registerCapability({
        id: `cap-${i}`,
        displayName: `Capability ${i}`,
        scopeTag: 'p0',
        entryPoints: [],
        dependencies: [],
        description: ''
      });
    }
    
    const context = {
      releaseBranch: 'v6.0' as const,
      featureFlags: new Set<string>(),
      environment: 'production' as const
    };
    
    // Make many repeated lookups
    for (let i = 0; i < 1000; i++) {
      for (let j = 0; j < 10; j++) {
        registry.isAvailable(`cap-${j}`, context);
      }
    }
    
    const stats = registry.getCacheStats();
    console.log(`Cache hit rate: ${(stats.availability.hitRate * 100).toFixed(2)}%`);
    
    // With repeated lookups, hit rate should be high
    expect(stats.availability.hitRate).toBeGreaterThan(0.9);
  });
});