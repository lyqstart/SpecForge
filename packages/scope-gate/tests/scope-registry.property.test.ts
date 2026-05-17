import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ScopeRegistry } from '../src/scope-registry.js';
import type { CapabilityDefinition, ScopeContext } from '../src/types.js';

// Helper to create capability definition
function createCapabilityArb(): fc.Arbitrary<CapabilityDefinition> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }).map(s => s.replace(/\s+/g, '-').toLowerCase()),
    displayName: fc.string({ minLength: 1, maxLength: 100 }),
    scopeTag: fc.constantFrom<'p0' | 'p1' | 'p2'>('p0', 'p1', 'p2'),
    entryPoints: fc.array(fc.string()),
    dependencies: fc.array(fc.string({ minLength: 1, maxLength: 50 })),
    description: fc.string({ minLength: 1, maxLength: 200 })
  }, { withDeletedKeys: false });
}

// Helper to create scope context
function createContextArb(): fc.Arbitrary<ScopeContext> {
  return fc.record({
    releaseBranch: fc.constantFrom<'v6.0' | 'v6.1' | 'v6.x' | 'development'>('v6.0', 'v6.1', 'v6.x', 'development'),
    featureFlags: fc.array(fc.string({ minLength: 1, maxLength: 30 })).map(arr => new Set(arr)),
    environment: fc.constantFrom<'production' | 'staging' | 'development' | 'test'>('production', 'staging', 'development', 'test')
  }, { withDeletedKeys: false });
}

// Helper to create scope tag
describe('ScopeRegistry Property Tests', () => {
  /**
   * Property SG-2: Feature Flag Determinism
   * 
   * For all capability availability checks with identical context 
   * (release branch, feature flags, environment), the result must be identical.
   * 
   * **Validates: Property SG-2**
   */
  describe('Property SG-2: Availability Determinism', () => {
    it('should return consistent results for identical contexts', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb(),
          createContextArb(),
          (capability, context) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            // Check availability multiple times with the same context
            const result1 = registry.isAvailable(capability.id, context);
            const result2 = registry.isAvailable(capability.id, context);
            const result3 = registry.isAvailable(capability.id, context);
            
            // All results should be identical
            expect(result1.available).toBe(result2.available);
            expect(result2.available).toBe(result3.available);
            
            // Reasons should also be identical
            expect(result1.reason).toBe(result2.reason);
            expect(result2.reason).toBe(result3.reason);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return consistent results for same capability across different registry instances', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb(),
          createContextArb(),
          (capability, context) => {
            // Create two separate registries
            const registry1 = new ScopeRegistry();
            const registry2 = new ScopeRegistry();
            
            registry1.registerCapability(capability);
            registry2.registerCapability(capability);
            
            // Both should return the same result
            const result1 = registry1.isAvailable(capability.id, context);
            const result2 = registry2.isAvailable(capability.id, context);
            
            expect(result1.available).toBe(result2.available);
            expect(result1.reason).toBe(result2.reason);
            expect(result1.requiredFlag).toBe(result2.requiredFlag);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have deterministic dependency validation', () => {
      return fc.assert(
        fc.property(
          fc.array(createCapabilityArb(), { minLength: 1, maxLength: 10 }),
          (capabilities) => {
            const registry = new ScopeRegistry();
            
            // Register all capabilities
            for (const cap of capabilities) {
              registry.registerCapability(cap);
            }
            
            // Run validation multiple times
            const results1 = registry.validateDependencies();
            const results2 = registry.validateDependencies();
            const results3 = registry.validateDependencies();
            
            // All results should be identical
            expect(results1.length).toBe(results2.length);
            expect(results2.length).toBe(results3.length);
            
            // Sort and compare for arrays
            const sorted1 = [...results1].sort((a, b) => a.message.localeCompare(b.message));
            const sorted2 = [...results2].sort((a, b) => a.message.localeCompare(b.message));
            
            expect(sorted1.map(r => r.code)).toEqual(sorted2.map(r => r.code));
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property: P1/P2 capabilities disabled by default in V6.0
   * 
   * For all capabilities f marked as P1 or P2, in V6.0 release branches 
   * with default configuration, calls to f's entry points must return 
   * errors with code SCOPE_BOUNDARY_VIOLATION or CAPABILITY_UNAVAILABLE.
   * 
   * **Validates: Property 15 (Parent Spec)**
   */
  describe('Property 15: P1/P2 Disabled in V6.0', () => {
    it('should disable P1 capabilities by default in V6.0 production', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p1'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const v60Context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(), // No feature flags
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, v60Context);
            
            // Should be unavailable without feature flag
            expect(result.available).toBe(false);
            expect(result.reason).toContain('P1');
            expect(result.requiredFlag).toBeDefined();
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should disable P2 capabilities by default in V6.0 production', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p2'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const v60Context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set(), // No feature flags
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, v60Context);
            
            // Should be unavailable without feature flag
            expect(result.available).toBe(false);
            expect(result.reason).toContain('P2');
            expect(result.requiredFlag).toBeDefined();
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should enable P1 capabilities when feature flag is set', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p1'),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const v60Context: ScopeContext = {
              releaseBranch: 'v6.0',
              featureFlags: new Set([`enable_${capability.id}`]),
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, v60Context);
            
            // Should be available with feature flag
            expect(result.available).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should enable P1 capabilities in non-V6.0 branches', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p1'),
          fc.constantFrom<'v6.1' | 'v6.x' | 'development'>('v6.1', 'v6.x', 'development'),
          (capability, branch) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const context: ScopeContext = {
              releaseBranch: branch,
              featureFlags: new Set(), // No feature flags
              environment: 'production'
            };
            
            const result = registry.isAvailable(capability.id, context);
            
            // Should be available in non-V6.0 branches
            expect(result.available).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property SG-1: Consistent Scope Tagging
   * 
   * For all capabilities c registered in the Scope Registry, 
   * c's scope tag must match its classification in REQ-25.
   * 
   * **Validates: Property SG-1**
   */
  describe('Property SG-1: Consistent Scope Tagging', () => {
    it('should always have valid scope tags', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb(),
          (capability) => {
            const registry = new ScopeRegistry();
            registry.registerCapability(capability);
            
            const retrieved = registry.getCapability(capability.id);
            
            expect(retrieved).toBeDefined();
            expect(['p0', 'p1', 'p2']).toContain(retrieved!.scopeTag);
            expect(retrieved!.scopeTag).toBe(capability.scopeTag);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should categorize capabilities correctly by scope', () => {
      return fc.assert(
        fc.property(
          fc.array(createCapabilityArb(), { minLength: 3, maxLength: 10 }),
          (capabilities) => {
            const registry = new ScopeRegistry();
            
            for (const cap of capabilities) {
              registry.registerCapability(cap);
            }
            
            // Verify each capability appears in correct category
            for (const cap of capabilities) {
              const byScope = registry.getCapabilitiesByScope(cap.scopeTag);
              const found = byScope.some(c => c.id === cap.id);
              expect(found).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property: Dependency Validation
   * 
   * No P0 capability should depend on P1 or P2 capabilities.
   */
  describe('Dependency Validation Properties', () => {
    it('should detect P0 depending on P1', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p0'),
          createCapabilityArb().filter(cap => cap.scopeTag === 'p1'),
          (p0Cap, p1Cap) => {
            const registry = new ScopeRegistry();
            
            // Ensure IDs are different to avoid self-dependency
            if (p0Cap.id === p1Cap.id) {
              p1Cap.id = p1Cap.id + '-dep';
            }
            
            registry.registerCapability(p1Cap);
            registry.registerCapability({
              ...p0Cap,
              dependencies: [p1Cap.id]
            });
            
            const results = registry.validateDependencies();
            
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].code).toBe('p0_depends_on_p1');
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should detect P0 depending on P2', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p0'),
          createCapabilityArb().filter(cap => cap.scopeTag === 'p2'),
          (p0Cap, p2Cap) => {
            const registry = new ScopeRegistry();
            
            if (p0Cap.id === p2Cap.id) {
              p2Cap.id = p2Cap.id + '-dep';
            }
            
            registry.registerCapability(p2Cap);
            registry.registerCapability({
              ...p0Cap,
              dependencies: [p2Cap.id]
            });
            
            const results = registry.validateDependencies();
            
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].code).toBe('p0_depends_on_p2');
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should allow P0 depending on P0', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb().filter(cap => cap.scopeTag === 'p0'),
          createCapabilityArb().filter(cap => cap.scopeTag === 'p0'),
          (cap1, cap2) => {
            const registry = new ScopeRegistry();
            
            if (cap1.id === cap2.id) {
              cap2.id = cap2.id + '-dep';
            }
            
            registry.registerCapability(cap1);
            registry.registerCapability({
              ...cap2,
              dependencies: [cap1.id]
            });
            
            const results = registry.validateDependencies();
            
            // No errors should be reported
            expect(results.length).toBe(0);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});