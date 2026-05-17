/**
 * Property-Based Tests for Property 15: Scope Boundary
 * 
 * Feature: scope-gate, Property 15: P1/P2 capabilities disabled by default
 * Derived-From: v6-architecture-overview Property 15
 * 
 * This test suite validates that P1/P2 capabilities are disabled by default
 * in V6.0 release branches, and can only be enabled through explicit feature flags.
 * 
 * **Validates: Requirements 30.15, 25.4**
 * 
 * Note: Safety-critical property uses 1000 iterations as per task requirements
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ScopeRegistry } from '../src/scope-registry.js';
import { RuntimeScopeChecker } from '../src/runtime-checker.js';
import type { CapabilityDefinition, ScopeContext } from '../src/types.js';

// ============================================================
// Arbitraries
// ============================================================

/**
 * Create arbitrary for P1 capability (filtered)
 */
function createP1CapabilityArb(): fc.Arbitrary<CapabilityDefinition> {
  return fc.record({
    id: fc.string({ minLength: 3, maxLength: 50 })
      .map(s => s.replace(/\s+/g, '-').toLowerCase())
      .filter(id => id.length > 0),
    displayName: fc.string({ minLength: 1, maxLength: 100 }),
    scopeTag: fc.constantFrom<'p1'>('p1'),
    entryPoints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    dependencies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
    description: fc.string({ minLength: 1, maxLength: 200 })
  }, { withDeletedKeys: false });
}

/**
 * Create arbitrary for P2 capability (filtered)
 */
function createP2CapabilityArb(): fc.Arbitrary<CapabilityDefinition> {
  return fc.record({
    id: fc.string({ minLength: 3, maxLength: 50 })
      .map(s => s.replace(/\s+/g, '-').toLowerCase())
      .filter(id => id.length > 0),
    displayName: fc.string({ minLength: 1, maxLength: 100 }),
    scopeTag: fc.constantFrom<'p2'>('p2'),
    entryPoints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    dependencies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
    description: fc.string({ minLength: 1, maxLength: 200 })
  }, { withDeletedKeys: false });
}

/**
 * Create arbitrary for P0 capability (for control tests)
 */
function createP0CapabilityArb(): fc.Arbitrary<CapabilityDefinition> {
  return fc.record({
    id: fc.string({ minLength: 3, maxLength: 50 })
      .map(s => s.replace(/\s+/g, '-').toLowerCase())
      .filter(id => id.length > 0),
    displayName: fc.string({ minLength: 1, maxLength: 100 }),
    scopeTag: fc.constantFrom<'p0'>('p0'),
    entryPoints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    dependencies: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 3 }),
    description: fc.string({ minLength: 1, maxLength: 200 })
  }, { withDeletedKeys: false });
}

/**
 * Create arbitrary for V6.0 production context (default config, no feature flags)
 */
function createV60DefaultContextArb(): fc.Arbitrary<ScopeContext> {
  return fc.constant({
    releaseBranch: 'v6.0' as const,
    featureFlags: new Set<string>(), // No feature flags - default disabled
    environment: 'production' as const
  });
}

/**
 * Create arbitrary for non-V6.0 context
 */
function createNonV60ContextArb(): fc.Arbitrary<ScopeContext> {
  return fc.record({
    releaseBranch: fc.constantFrom<'v6.1' | 'v6.x' | 'development'>('v6.1', 'v6.x', 'development'),
    featureFlags: fc.array(fc.string({ minLength: 1, maxLength: 30 })).map(arr => new Set(arr)),
    environment: fc.constantFrom<'production' | 'staging' | 'development' | 'test'>('production', 'staging', 'development', 'test')
  }, { withDeletedKeys: false });
}

// ============================================================
// Test Suite: Property 15 - Scope Boundary
// ============================================================

describe('Property 15: P1/P2 capabilities disabled by default in V6.0', () => {
  /**
   * Property 15.1: P1 capability in V6.0 production with default config is UNAVAILABLE
   * 
   * **Validates: Requirements 30.15, 25.4**
   */
  describe('P1 Capability Disabled by Default in V6.0', () => {
    it('should disable P1 capability in V6.0 production without feature flag', () => {
      // numRuns >= 100 for safety-critical property
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          createV60DefaultContextArb(),
          (capability, context) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const result = registry.isAvailable(capability.id, context);
            
            // Assert: Must be unavailable in V6.0 default
            expect(result.available).toBe(false);
            expect(result.reason).toContain('P1');
            expect(result.requiredFlag).toBeDefined();
            expect(result.requiredFlag).toBe(`enable_${capability.id}`);
            
            return true;
          }
        ),
        { numRuns: 1000 } // Safety-critical: ≥1000 iterations
      );
    });

    it('should return SCOPE_BOUNDARY_VIOLATION reason for P1 in V6.0', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Reason should clearly indicate scope boundary violation
            expect(result.reason).toMatch(/P1.*disabled.*V6\.0/i);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should disable P1 in all V6.0 environments (production, staging, test)', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          fc.constantFrom<'production' | 'staging' | 'test'>('production', 'staging', 'test'),
          (capability, env) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: env
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // P1 should be disabled regardless of environment in V6.0
            expect(result.available).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15.2: P2 capability in V6.0 production with default config is UNAVAILABLE
   * 
   * **Validates: Requirements 30.15, 25.4**
   */
  describe('P2 Capability Disabled by Default in V6.0', () => {
    it('should disable P2 capability in V6.0 production without feature flag', () => {
      return fc.assert(
        fc.property(
          createP2CapabilityArb(),
          createV60DefaultContextArb(),
          (capability, context) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const result = registry.isAvailable(capability.id, context);
            
            // Assert: Must be unavailable in V6.0 default
            expect(result.available).toBe(false);
            expect(result.reason).toContain('P2');
            expect(result.requiredFlag).toBeDefined();
            expect(result.requiredFlag).toBe(`enable_${capability.id}`);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return SCOPE_BOUNDARY_VIOLATION reason for P2 in V6.0', () => {
      return fc.assert(
        fc.property(
          createP2CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Reason should clearly indicate scope boundary violation
            expect(result.reason).toMatch(/P2.*disabled.*V6\.0/i);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should disable P2 in all V6.0 environments', () => {
      return fc.assert(
        fc.property(
          createP2CapabilityArb(),
          fc.constantFrom<'production' | 'staging' | 'test'>('production', 'staging', 'test'),
          (capability, env) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: env
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // P2 should be disabled regardless of environment in V6.0
            expect(result.available).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15.3: Only explicit feature flag enablement allows P1/P2 usage
   * 
   * **Validates: Requirements 30.15, 25.4**
   */
  describe('Feature Flag Enablement Works Correctly', () => {
    it('should enable P1 capability when specific feature flag is set', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set([`enable_${capability.id}`]),
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Should be available when feature flag is set
            expect(result.available).toBe(true);
            expect(result.reason).toBeUndefined();
            expect(result.requiredFlag).toBeUndefined();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enable P2 capability when specific feature flag is set', () => {
      return fc.assert(
        fc.property(
          createP2CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set([`enable_${capability.id}`]),
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Should be available when feature flag is set
            expect(result.available).toBe(true);
            expect(result.reason).toBeUndefined();
            expect(result.requiredFlag).toBeUndefined();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enable P1/P2 when enable_all_p1p2 flag is set', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          createP2CapabilityArb(),
          (p1Cap, p2Cap) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(p1Cap);
            registry.registerCapability(p2Cap);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(['enable_all_p1p2']),
              environment: 'production'
            };
            
            const p1Result = registry.isAvailable(p1Cap.id, context);
            const p2Result = registry.isAvailable(p2Cap.id, context);
            
            // Both should be available with the master flag
            expect(p1Result.available).toBe(true);
            expect(p2Result.available).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should require exact flag name match (case-sensitive)', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb().filter(cap => /[a-z]/.test(cap.id)), // Ensure ID has lowercase letters
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            // Wrong case or wrong flag name should not enable
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set([`ENABLE_${capability.id}`, `enable_${capability.id.toUpperCase()}`]),
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Should still be unavailable due to case mismatch
            expect(result.available).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 15.4: Feature flag disablement takes effect immediately
   * 
   * **Validates: Requirements 30.15, 25.4**
   */
  describe('Feature Flag Disable Takes Effect Immediately', () => {
    it('should disable P1 when feature flag is removed', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            // First, enable the flag
            const enabledContext: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set([`enable_${capability.id}`]),
              environment: 'production'
            };
            
            const enabledResult = registry.isAvailable(capability.id, enabledContext);
            expect(enabledResult.available).toBe(true);
            
            // Then, disable by removing the flag
            const disabledContext: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(), // Flag removed
              environment: 'production'
            };
            
            const disabledResult = registry.isAvailable(capability.id, disabledContext);
            expect(disabledResult.available).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should toggle P1 availability when flag is added/removed', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          fc.boolean(),
          (capability, enableFlag) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const featureFlags = enableFlag 
              ? new Set([`enable_${capability.id}`])
              : new Set<string>();
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags,
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Availability should match flag state
            expect(result.available).toBe(enableFlag);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15.5: P0 capabilities are always available (control test)
   * 
   * **Validates: Requirements 30.15**
   */
  describe('P0 Capabilities Always Available (Control)', () => {
    it('should always enable P0 capabilities in V6.0', () => {
      return fc.assert(
        fc.property(
          createP0CapabilityArb(),
          createV60DefaultContextArb(),
          (capability, context) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const result = registry.isAvailable(capability.id, context);
            
            // P0 should always be available
            expect(result.available).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always enable P0 capabilities in any branch', () => {
      return fc.assert(
        fc.property(
          createP0CapabilityArb(),
          createNonV60ContextArb(),
          (capability, context) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const result = registry.isAvailable(capability.id, context);
            
            // P0 should always be available regardless of branch
            expect(result.available).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 15.6: Non-V6.0 branches allow P1/P2 by default
   * 
   * **Validates: Requirements 30.15**
   */
  describe('Non-V6.0 Branches Allow P1/P2', () => {
    it('should enable P1 in v6.1 branch by default', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.1',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Should be available in v6.1
            expect(result.available).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enable P2 in v6.x branch by default', () => {
      return fc.assert(
        fc.property(
          createP2CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.x',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Should be available in v6.x
            expect(result.available).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enable P1/P2 in development branch by default', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          createP2CapabilityArb(),
          (p1Cap, p2Cap) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(p1Cap);
            registry.registerCapability(p2Cap);
            
            const context: ScopeContext = {
              releaseBranch: 'development',
              featureFlags: new Set(),
              environment: 'development'
            };
            
            const p1Result = registry.isAvailable(p1Cap.id, context);
            const p2Result = registry.isAvailable(p2Cap.id, context);
            
            // Both should be available in development
            expect(p1Result.available).toBe(true);
            expect(p2Result.available).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 15.7: RuntimeScopeChecker enforces Property 15
   * 
   * **Validates: Requirements 30.15, 25.4**
   */
  describe('RuntimeScopeChecker Enforces Property 15', () => {
    it('should throw ScopeBoundaryViolationError for P1 in V6.0', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            // Should throw error
            expect(() => checker.checkCapability(capability.id, context)).toThrow();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw ScopeBoundaryViolationError for P2 in V6.0', () => {
      return fc.assert(
        fc.property(
          createP2CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            // Should throw error
            expect(() => checker.checkCapability(capability.id, context)).toThrow();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT throw when feature flag is enabled', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set([`enable_${capability.id}`]),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            
            // Should NOT throw when flag is enabled
            expect(() => checker.checkCapability(capability.id, context)).not.toThrow();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should track feature flags through RuntimeScopeChecker', () => {
      return fc.assert(
        fc.property(
          createP1CapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const initialContext: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, initialContext);
            
            // Initially should throw
            expect(() => checker.checkCapability(capability.id, checker.getCurrentContext())).toThrow();
            
            // Enable flag through checker
            checker.enableFeatureFlag(`enable_${capability.id}`);
            
            // Now should not throw
            expect(() => checker.checkCapability(capability.id, checker.getCurrentContext())).not.toThrow();
            
            // Disable flag through checker
            checker.disableFeatureFlag(`enable_${capability.id}`);
            
            // Should throw again
            expect(() => checker.checkCapability(capability.id, checker.getCurrentContext())).toThrow();
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 15.8: Batch check returns correct availability
   * 
   * **Validates: Requirements 30.15**
   */
  describe('Batch Check Returns Correct Availability', () => {
    it('should return all P1/P2 as unavailable in V6.0 default', () => {
      return fc.assert(
        fc.property(
          fc.array(createP1CapabilityArb(), { minLength: 1, maxLength: 5 }),
          fc.array(createP2CapabilityArb(), { minLength: 1, maxLength: 5 }),
          (p1Caps, p2Caps) => {
            const registry = new ScopeRegistry();
            for (const cap of p1Caps) registry.registerCapability(cap);
            for (const cap of p2Caps) registry.registerCapability(cap);
            
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            const allIds = [...p1Caps, ...p2Caps].map(c => c.id);
            const results = checker.checkCapabilities(allIds, context);
            
            // All should be unavailable
            expect(results.every(r => !r.available)).toBe(true);
            expect(results.every(r => r.error !== undefined)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return all P1/P2 as available with feature flags', () => {
      return fc.assert(
        fc.property(
          fc.array(createP1CapabilityArb(), { minLength: 1, maxLength: 3 }),
          fc.array(createP2CapabilityArb(), { minLength: 1, maxLength: 3 }),
          (p1Caps, p2Caps) => {
            const registry = new ScopeRegistry();
            for (const cap of p1Caps) registry.registerCapability(cap);
            for (const cap of p2Caps) registry.registerCapability(cap);
            
            // Enable all via master flag
            const context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(['enable_all_p1p2']),
              environment: 'production'
            };
            
            const checker = new RuntimeScopeChecker(registry, context);
            const allIds = [...p1Caps, ...p2Caps].map(c => c.id);
            const results = checker.checkCapabilities(allIds, context);
            
            // All should be available
            expect(results.every(r => r.available)).toBe(true);
            expect(results.every(r => r.error === undefined)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

// ============================================================
// Edge Case Tests
// ============================================================

describe('Property 15 Edge Cases', () => {
  it('should handle unregistered capability gracefully', () => {
    const registry = new ScopeRegistry();
    
    const context: ScopeContext = {
      releaseBranch: 'v6.0',
      featureFlags: new Set(),
      environment: 'production'
    };
    
    const result = registry.isAvailable('nonexistent-capability', context);
    
    expect(result.available).toBe(false);
    expect(result.reason).toContain('not registered');
  });

  it('should handle empty capability ID gracefully', () => {
    const registry = new ScopeRegistry();
    registry.registerCapability({
      id: 'test-cap',
      displayName: 'Test',
      scopeTag: 'p1',
      entryPoints: [],
      dependencies: [],
      description: 'Test capability'
    });
    
    const context: ScopeContext = {
      releaseBranch: 'v6.0',
      featureFlags: new Set(),
      environment: 'production'
    };
    
    const result = registry.isAvailable('', context);
    
    expect(result.available).toBe(false);
  });

  it('should handle very long capability IDs', () => {
    const longId = 'a'.repeat(100);
    const registry = new ScopeRegistry();
    registry.registerCapability({
      id: longId,
      displayName: 'Long Capability',
      scopeTag: 'p1',
      entryPoints: [],
      dependencies: [],
      description: 'Test'
    });
    
    const context: ScopeContext = {
      releaseBranch: 'v6.0',
      featureFlags: new Set([`enable_${longId}`]),
      environment: 'production'
    };
    
    const result = registry.isAvailable(longId, context);
    
    // Should work with long IDs when flag is enabled
    expect(result.available).toBe(true);
  });

  it('should handle many feature flags', () => {
    const capability = {
      id: 'test-cap',
      displayName: 'Test',
      scopeTag: 'p1' as const,
      entryPoints: [],
      dependencies: [],
      description: 'Test'
    };
    
    const registry = new ScopeRegistry();
    registry.registerCapability(capability);
    
    // Create many feature flags
    const manyFlags = new Set<string>();
    for (let i = 0; i < 100; i++) {
      manyFlags.add(`flag_${i}`);
    }
    // Add our target flag
    manyFlags.add('enable_test-cap');
    
    const context: ScopeContext = {
      releaseBranch: 'v6.0',
      featureFlags: manyFlags,
      environment: 'production'
    };
    
    const result = registry.isAvailable('test-cap', context);
    
    expect(result.available).toBe(true);
  });
});