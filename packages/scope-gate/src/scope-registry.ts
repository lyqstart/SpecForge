/**
 * Scope Registry implementation
 * 
 * Maintains the authoritative mapping of capabilities to their scope tags (P0/P1/P2)
 * as defined in REQ-25 of the parent specification.
 * 
 * ## Performance Optimizations
 * 
 * This implementation includes several performance optimizations for hot paths:
 * - Pre-computed capability flag names during registration
 * - Optimized feature flag checking without array allocation
 * - Fast path for the most common case (V6.0 release, no flags)
 * 
 * ## Usage
 * 
 * ```typescript
 * import { ScopeRegistry } from '@specforge/scope-gate';
 * 
 * const registry = new ScopeRegistry();
 * await registry.loadFromParentSpec();
 * 
 * const context = {
 *   releaseBranch: 'v6.0',
 *   featureFlags: new Set(['enable_bugfix-workflow']),
 *   environment: 'production'
 * };
 * 
 * const result = registry.isAvailable('bugfix-workflow', context);
 * console.log(result.available); // true if flag is enabled
 * ```
 * 
 * ## Key Behaviors
 * 
 * - P0 capabilities are always available
 * - P1/P2 capabilities in V6.0 release require feature flags
 * - Feature flags follow pattern: `enable_{capabilityId}` or `enable_all_p1p2`
 * - For non-V6.0 branches, P1/P2 are available without flags
 */

import type {
  ScopeRegistry as IScopeRegistry,
  CapabilityDefinition,
  ScopeTag,
  ScopeContext,
  AvailabilityResult,
  ValidationResult
} from './types.js';
import { Req25Loader, loadAndRegisterCapabilitiesSync } from './req25-loader.js';
import { LRUCache, scopeAvailabilityCacheKey } from './cache.js';

/**
 * Internal capability storage with pre-computed optimization data
 */
interface CapabilityStore {
  id: string;
  definition: CapabilityDefinition;
  // Pre-computed flag name for this capability
  flagName: `enable_${string}`;
}

const ENABLE_ALL_P1P2 = 'enable_all_p1p2';

/**
 * Scope Registry
 * 
 * Maintains the authoritative mapping of capabilities to their scope tags (P0/P1/P2)
 * as defined in REQ-25 of the parent specification.
 * 
 * @example
 * ```typescript
 * const registry = new ScopeRegistry();
 * await registry.loadFromParentSpec();
 * 
 * // Check if capability is available
 * const result = registry.isAvailable('some-capability', {
 *   releaseBranch: 'v6.0',
 *   featureFlags: new Set(),
 *   environment: 'production'
 * });
 * ```
 */
export class ScopeRegistry implements IScopeRegistry {
  private capabilities: Map<string, CapabilityStore> = new Map();
  private capabilityByScope: Map<ScopeTag, Set<string>> = new Map([
    ["p0", new Set()],
    ["p1", new Set()],
    ["p2", new Set()]
  ]);
  
  private loader: Req25Loader;
  
  // Cache for isAvailable results
  private availabilityCache: LRUCache<string, AvailabilityResult>;
  // Cache for capability lookups
  private capabilityCache: LRUCache<string, CapabilityDefinition | undefined>;

  constructor(options?: { cacheSize?: number; cacheTtlMs?: number }) {
    this.loader = new Req25Loader();
    
    // Initialize caches with configurable options
    const cacheSize = options?.cacheSize ?? 1000;
    const cacheTtlMs = options?.cacheTtlMs ?? 60000; // Default 1 minute
    
    this.availabilityCache = new LRUCache({
      maxSize: cacheSize,
      ttlMs: cacheTtlMs
    });
    
    this.capabilityCache = new LRUCache({
      maxSize: cacheSize,
      ttlMs: cacheTtlMs
    });
  }
  
  /**
   * Get cache statistics (for monitoring)
   */
  getCacheStats() {
    return {
      availability: this.availabilityCache.getStats(),
      capability: this.capabilityCache.getStats()
    };
  }
  
  /**
   * Clear all caches (useful when registry is reloaded)
   */
  clearCache(): void {
    this.availabilityCache.clear();
    this.capabilityCache.clear();
  }
  
  /**
   * Get the loader instance (for testing and external access)
   */
  getLoader(): Req25Loader {
    return this.loader;
  }

  /**
   * Load scope definitions from REQ-25 of parent spec
   * 
   * @param parentSpecPath - Optional path to parent spec. If not provided, uses default path.
   */
  async loadFromParentSpec(parentSpecPath?: string): Promise<void> {
    const path = parentSpecPath || Req25Loader.getDefaultParentSpecPath();
    // Clear caches before loading new data
    this.clearCache();
    const result = loadAndRegisterCapabilitiesSync(this, path);
    
    if (!result.success) {
      console.warn(`Failed to load REQ-25 from parent spec: ${result.error}`);
    }
  }

  /**
   * Synchronous version of loadFromParentSpec
   */
  loadFromParentSpecSync(parentSpecPath?: string): void {
    const path = parentSpecPath || Req25Loader.getDefaultParentSpecPath();
    // Clear caches before loading new data
    this.clearCache();
    const result = loadAndRegisterCapabilitiesSync(this, path);
    
    if (!result.success) {
      console.warn(`Failed to load REQ-25 from parent spec: ${result.error}`);
    }
  }

  /**
   * Register a capability with its scope tag
   * Optimized: Pre-computes the flag name for faster lookups
   */
  registerCapability(capability: CapabilityDefinition): void {
    // Pre-compute the flag name during registration
    const flagName = `enable_${capability.id}` as const;
    
    this.capabilities.set(capability.id, {
      id: capability.id,
      definition: capability,
      flagName
    });
    
    const scopeSet = this.capabilityByScope.get(capability.scopeTag);
    if (scopeSet) {
      scopeSet.add(capability.id);
    }
    
    // Update capability cache
    this.capabilityCache.set(capability.id, capability);
    // Invalidate availability cache for this capability
    this.availabilityCache.delete(capability.id);
  }

  /**
   * Check if a capability is available in current scope
   * Optimized for hot path performance:
   * - Pre-computed flag names avoid string allocation
   * - Direct Set.has() is faster than Array.some()
   * - Early returns for common cases
   * - Cached results for repeated lookups
   */
  isAvailable(capabilityId: string, context: ScopeContext): AvailabilityResult {
    // Try cache first
    const cacheKey = scopeAvailabilityCacheKey(capabilityId, context);
    const cached = this.availabilityCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    
    const store = this.capabilities.get(capabilityId);
    
    if (!store) {
      const result: AvailabilityResult = {
        available: false,
        reason: `Capability '${capabilityId}' not registered in scope registry`
      };
      this.availabilityCache.set(cacheKey, result);
      return result;
    }

    const capability = store.definition;

    // P0 capabilities are always available (fast path)
    if (capability.scopeTag === "p0") {
      const result: AvailabilityResult = { available: true };
      this.availabilityCache.set(cacheKey, result);
      return result;
    }

    // P1/P2 capabilities in V6.0 require feature flags
    if (context.releaseBranch === "v6.0") {
      const flags = context.featureFlags;
      
      // Optimized: Use Set.has() directly instead of Array.some()
      // Also check pre-computed flag name
      const enabled = flags.has(store.flagName) || flags.has(ENABLE_ALL_P1P2);
      
      if (!enabled) {
        const result: AvailabilityResult = {
          available: false,
          reason: `P${capability.scopeTag === "p1" ? "1" : "2"} capability '${capabilityId}' is disabled in V6.0 release`,
          requiredFlag: store.flagName
        };
        this.availabilityCache.set(cacheKey, result);
        return result;
      }
    }

    // For non-V6.0 branches or when feature flag is enabled
    const result: AvailabilityResult = { available: true };
    this.availabilityCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get all capabilities with a specific scope tag
   * Optimized: Uses cached scope map for fast lookup
   */
  getCapabilitiesByScope(scopeTag: ScopeTag): CapabilityDefinition[] {
    const capabilityIds = this.capabilityByScope.get(scopeTag);
    if (!capabilityIds) {
      return [];
    }
    
    const result: CapabilityDefinition[] = [];
    for (const id of capabilityIds) {
      const store = this.capabilities.get(id);
      if (store) {
        result.push(store.definition);
      }
    }
    return result;
  }

  /**
   * Validate scope dependencies (no P0 depending on P1/P2)
   */
  validateDependencies(): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    for (const store of this.capabilities.values()) {
      const capability = store.definition;
      if (capability.scopeTag === "p0") {
        for (const dependencyId of capability.dependencies) {
          const depStore = this.capabilities.get(dependencyId);
          if (depStore && (depStore.definition.scopeTag === "p1" || depStore.definition.scopeTag === "p2")) {
            const dependency = depStore.definition;
            results.push({
              type: "error",
              code: capability.scopeTag === "p0" && dependency.scopeTag === "p1" 
                ? "p0_depends_on_p1" 
                : "p0_depends_on_p2",
              message: `P0 capability '${capability.id}' depends on ${dependency.scopeTag.toUpperCase()} capability '${dependencyId}'`,
              context: {
                capabilityId: capability.id,
                dependencyId,
                capabilityScope: capability.scopeTag,
                dependencyScope: dependency.scopeTag
              }
            });
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Get all registered capabilities
   */
  getAllCapabilities(): CapabilityDefinition[] {
    const result: CapabilityDefinition[] = [];
    for (const store of this.capabilities.values()) {
      result.push(store.definition);
    }
    return result;
  }

  /**
   * Check if a capability is registered
   */
  hasCapability(capabilityId: string): boolean {
    // Check cache first
    const cached = this.capabilityCache.get(capabilityId);
    if (cached !== undefined) {
      return true;
    }
    // If undefined in cache, it was explicitly not found
    if (this.capabilityCache.has(capabilityId)) {
      return false;
    }
    return this.capabilities.has(capabilityId);
  }

  /**
   * Get capability by ID
   */
  getCapability(capabilityId: string): CapabilityDefinition | undefined {
    // Try cache first
    const cached = this.capabilityCache.get(capabilityId);
    if (cached !== undefined) {
      return cached;
    }
    // Not in cache, look up in map
    const capability = this.capabilities.get(capabilityId)?.definition;
    // Cache even if undefined (to remember negative lookups)
    this.capabilityCache.set(capabilityId, capability);
    return capability;
  }
}