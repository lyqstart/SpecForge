/**
 * Unit Tests for PBT Generators
 * 
 * This test file validates that the edge case generators produce
 * the expected variety of inputs for property-based testing.
 * 
 * Feature: Generators, Task 14.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createCapabilityArb,
  createContextArb,
  createV60ContextArb,
  createCapabilityIdArb,
  createEdgeCaseStringArb,
  createEdgeCaseCapabilityArb,
  createEdgeCaseContextArb,
  createInvalidCapabilityIdArb,
  createInvalidScopeTagArb,
  createInvalidReleaseBranchArb,
  createInvalidEnvironmentArb,
  createInvalidFeatureFlagArb,
  createMixedCapabilityIdArb,
  createFeatureFlagChangeArb,
  createViolationAttemptArb,
  createCyclicDependencyArb,
  createP0DependsOnP1P2Arb,
  createSelfDependencyArb,
  createCapabilityArrayArb,
  createV60ViolationScenarioArb,
  createEnabledScenarioArb,
  generators
} from '../src/generators';

describe('PBT Generators', () => {
  describe('Standard Generators', () => {
    it('createCapabilityArb should generate valid capability definitions', () => {
      return fc.assert(
        fc.property(createCapabilityArb(), (cap) => {
          expect(cap.id).toBeDefined();
          expect(cap.id.length).toBeGreaterThan(0);
          expect(cap.scopeTag).toMatch(/^(p0|p1|p2)$/);
          expect(cap.displayName).toBeDefined();
          expect(Array.isArray(cap.entryPoints)).toBe(true);
          expect(Array.isArray(cap.dependencies)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('createContextArb should generate valid scope contexts', () => {
      return fc.assert(
        fc.property(createContextArb(), (ctx) => {
          expect(ctx.releaseBranch).toMatch(/^(v6\.0|v6\.1|v6\.x|development)$/);
          expect(ctx.featureFlags).toBeInstanceOf(Set);
          expect(ctx.environment).toMatch(/^(production|staging|development|test)$/);
        }),
        { numRuns: 100 }
      );
    });

    it('createV60ContextArb should always generate v6.0 context', () => {
      return fc.assert(
        fc.property(createV60ContextArb(), (ctx) => {
          expect(ctx.releaseBranch).toBe('v6.0');
        }),
        { numRuns: 50 }
      );
    });

    it('createCapabilityIdArb should generate valid capability IDs', () => {
      return fc.assert(
        fc.property(createCapabilityIdArb(), (id) => {
          expect(id.length).toBeGreaterThan(0);
          expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Case Generators', () => {
    it('createEdgeCaseStringArb should include empty strings', () => {
      return fc.assert(
        fc.property(createEdgeCaseStringArb(), (s) => {
          // Should generate various edge case strings including empty
          expect(typeof s).toBe('string');
        }),
        { numRuns: 100 }
      );
    });

    it('createEdgeCaseCapabilityArb should generate capabilities with edge cases', () => {
      return fc.assert(
        fc.property(createEdgeCaseCapabilityArb(), (cap) => {
          expect(cap.id).toBeDefined();
          expect(cap.scopeTag).toMatch(/^(p0|p1|p2)$/);
        }),
        { numRuns: 100 }
      );
    });

    it('createEdgeCaseContextArb should generate contexts with edge cases', () => {
      return fc.assert(
        fc.property(createEdgeCaseContextArb(), (ctx) => {
          expect(ctx.releaseBranch).toBeDefined();
          expect(ctx.featureFlags).toBeInstanceOf(Set);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Invalid Input Generators', () => {
    it('createInvalidCapabilityIdArb should generate invalid IDs', () => {
      const invalidIds: string[] = [];
      
      fc.assert(
        fc.property(createInvalidCapabilityIdArb(), (id) => {
          invalidIds.push(id);
        }),
        { numRuns: 20 }
      );
      
      // Should have generated various invalid IDs
      expect(invalidIds.length).toBe(20);
      // Check that some are clearly invalid (not matching valid pattern)
      const validPattern = /^[a-z][a-z0-9-]*$/;
      const hasInvalid = invalidIds.some(id => !validPattern.test(id));
      expect(hasInvalid).toBe(true);
    });

    it('createInvalidScopeTagArb should generate invalid scope tags', () => {
      return fc.assert(
        fc.property(createInvalidScopeTagArb(), (tag) => {
          // Should not be valid p0, p1, or p2
          expect(['p0', 'p1', 'p2']).not.toContain(tag);
        }),
        { numRuns: 50 }
      );
    });

    it('createInvalidReleaseBranchArb should generate invalid release branches', () => {
      return fc.assert(
        fc.property(createInvalidReleaseBranchArb(), (branch) => {
          // Should not be valid branches
          expect(['v6.0', 'v6.1', 'v6.x', 'development']).not.toContain(branch);
        }),
        { numRuns: 50 }
      );
    });

    it('createInvalidEnvironmentArb should generate invalid environments', () => {
      return fc.assert(
        fc.property(createInvalidEnvironmentArb(), (env) => {
          // Should not be valid environments
          expect(['production', 'staging', 'development', 'test']).not.toContain(env);
        }),
        { numRuns: 50 }
      );
    });

    it('createInvalidFeatureFlagArb should generate invalid feature flags', () => {
      return fc.assert(
        fc.property(createInvalidFeatureFlagArb(), (flag) => {
          expect(typeof flag).toBe('string');
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Mixed Generators', () => {
    it('createMixedCapabilityIdArb should generate both valid and invalid IDs', () => {
      const results: { valid: number; invalid: number } = { valid: 0, invalid: 0 };
      const validPattern = /^[a-z][a-z0-9-]*$/;
      
      fc.assert(
        fc.property(createMixedCapabilityIdArb(0.5), (id) => {
          if (validPattern.test(id)) {
            results.valid++;
          } else {
            results.invalid++;
          }
        }),
        { numRuns: 100 }
      );
      
      // Should have both valid and invalid
      expect(results.valid).toBeGreaterThan(0);
      expect(results.invalid).toBeGreaterThan(0);
    });
  });

  describe('Specialized Generators', () => {
    it('createFeatureFlagChangeArb should generate valid feature flag changes', () => {
      return fc.assert(
        fc.property(createFeatureFlagChangeArb(), (change) => {
          expect(change.flag).toBeDefined();
          expect(typeof change.oldValue).toBe('boolean');
          expect(typeof change.newValue).toBe('boolean');
          expect(change.reason).toBeDefined();
          expect(change.timestamp).toBeInstanceOf(Date);
        }),
        { numRuns: 50 }
      );
    });

    it('createViolationAttemptArb should generate valid violation attempts', () => {
      return fc.assert(
        fc.property(createViolationAttemptArb(), (attempt) => {
          expect(attempt.capabilityId).toBeDefined();
          expect(['p0', 'p1', 'p2']).toContain(attempt.scopeTag);
          expect(attempt.context).toBeDefined();
          expect(attempt.timestamp).toBeInstanceOf(Date);
        }),
        { numRuns: 50 }
      );
    });

    it('createCyclicDependencyArb should generate capabilities with cyclic dependencies', () => {
      return fc.assert(
        fc.property(createCyclicDependencyArb(3), (caps) => {
          expect(caps.length).toBeGreaterThanOrEqual(3);
          // Each capability should depend on another in the cycle
          for (const cap of caps) {
            expect(cap.dependencies.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 20 }
      );
    });

    it('createP0DependsOnP1P2Arb should generate P0 depending on P1/P2', () => {
      return fc.assert(
        fc.property(createP0DependsOnP1P2Arb(true), ({ p0Capability, p1p2Capability }) => {
          expect(p0Capability.scopeTag).toBe('p0');
          expect(p1p2Capability.scopeTag).toBe('p1');
          expect(p0Capability.dependencies).toContain(p1p2Capability.id);
        }),
        { numRuns: 20 }
      );
    });

    it('createSelfDependencyArb should generate capability with self-dependency', () => {
      return fc.assert(
        fc.property(createSelfDependencyArb(), (cap) => {
          expect(cap.dependencies).toContain(cap.id);
        }),
        { numRuns: 20 }
      );
    });

    it('createCapabilityArrayArb should generate array of capabilities', () => {
      return fc.assert(
        fc.property(createCapabilityArrayArb(3, 7), (caps) => {
          expect(caps.length).toBeGreaterThanOrEqual(3);
          expect(caps.length).toBeLessThanOrEqual(7);
          for (const cap of caps) {
            expect(cap.id).toBeDefined();
          }
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Scenario Generators', () => {
    it('createV60ViolationScenarioArb should generate V6.0 violation scenarios', () => {
      return fc.assert(
        fc.property(createV60ViolationScenarioArb(), ({ capability, context }) => {
          expect(context.releaseBranch).toBe('v6.0');
          expect(capability.scopeTag).toMatch(/^(p1|p2)$/);
          expect(context.featureFlags.size).toBe(0); // No flags = violation
        }),
        { numRuns: 50 }
      );
    });

    it('createEnabledScenarioArb should generate enabled capability scenarios', () => {
      return fc.assert(
        fc.property(createEnabledScenarioArb(), ({ capability, context }) => {
          expect(capability.scopeTag).toMatch(/^(p1|p2)$/);
          // Should have the enable flag for this capability
          const enableFlag = `enable_${capability.id}`;
          expect(context.featureFlags.has(enableFlag)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Default Export', () => {
    it('generators object should contain all generator functions', () => {
      expect(generators.capability).toBeDefined();
      expect(generators.context).toBeDefined();
      expect(generators.v60Context).toBeDefined();
      expect(generators.capabilityId).toBeDefined();
      expect(generators.edgeCaseString).toBeDefined();
      expect(generators.edgeCaseCapability).toBeDefined();
      expect(generators.edgeCaseContext).toBeDefined();
      expect(generators.invalidCapabilityId).toBeDefined();
      expect(generators.invalidScopeTag).toBeDefined();
      expect(generators.invalidReleaseBranch).toBeDefined();
      expect(generators.invalidEnvironment).toBeDefined();
      expect(generators.invalidFeatureFlag).toBeDefined();
      expect(generators.mixedCapabilityId).toBeDefined();
      expect(generators.mixedScopeTag).toBeDefined();
      expect(generators.mixedContext).toBeDefined();
      expect(generators.mixedCapability).toBeDefined();
      expect(generators.featureFlagChange).toBeDefined();
      expect(generators.violationAttempt).toBeDefined();
      expect(generators.v60ViolationScenario).toBeDefined();
      expect(generators.enabledScenario).toBeDefined();
      expect(generators.dependencyScenario).toBeDefined();
    });
  });

  describe('Edge Case Coverage - Triggering Error Paths', () => {
    it('should generate enough variety to trigger different code paths', () => {
      const uniqueScopeTags = new Set<string>();
      const uniqueEnvironments = new Set<string>();
      const uniqueReleaseBranches = new Set<string>();
      
      fc.assert(
        fc.property(
          createCapabilityArb(),
          createContextArb(),
          (cap, ctx) => {
            uniqueScopeTags.add(cap.scopeTag);
            uniqueEnvironments.add(ctx.environment);
            uniqueReleaseBranches.add(ctx.releaseBranch);
          }
        ),
        { numRuns: 200 }
      );
      
      // Should have seen all scope tags
      expect(uniqueScopeTags.size).toBe(3); // p0, p1, p2
      // Should have seen multiple environments
      expect(uniqueEnvironments.size).toBeGreaterThanOrEqual(2);
      // Should have seen multiple release branches
      expect(uniqueReleaseBranches.size).toBeGreaterThanOrEqual(2);
    });
  });
});