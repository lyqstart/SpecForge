/**
 * Property-based tests for FeatureFlagManager
 * 
 * Feature: FeatureFlagManager, Property 1: Hierarchical flag resolution
 * Validates: Requirements 1.4, 3.3, 3.4 (Task 11.1)
 * Derived-From: scope-gate Task 11.1
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { FeatureFlagManager } from '../src/feature-flag-manager.js';

// Helper to generate valid flag names (no spaces, alphanumeric + underscore/dash)
function validFlagName(): fc.Arbitrary<string> {
  return fc.string({ minLength: 2, maxLength: 30 })
    .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^[0-9]/, 'f$&'))
    .filter(s => s.length >= 2 && /^[a-zA-Z]/.test(s));
}

// Generate truly unique names using an index to avoid conflicts
const generateUniqueNames = (count: number, prefix: string): string[] => {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push(`${prefix}_cap_${i}`);
  }
  return names;
};

// Helper to generate unique capability arrays (P1/P2)
function uniqueCapabilitiesArb(): fc.Arbitrary<Array<[string, 'p1' | 'p2']>> {
  return fc.nat({ max: 7 }).map(n => {
    const names = generateUniqueNames(n + 3, 'p1p2'); // 3 to 10 capabilities
    return names.map((name, i) => [name, i % 2 === 0 ? 'p1' as const : 'p2' as const]);
  });
}

// Helper to generate unique capability arrays (P0/P1/P2)
function uniqueAllScopeCapabilitiesArb(): fc.Arbitrary<Array<[string, 'p0' | 'p1' | 'p2']>> {
  return fc.nat({ max: 10 }).map(n => {
    const names = generateUniqueNames(n + 5, 'allscope'); // 5 to 15 capabilities
    return names.map((name, i) => [name, i % 3 === 0 ? 'p0' as const : i % 3 === 1 ? 'p1' as const : 'p2' as const]);
  });
}

describe('FeatureFlagManager Property Tests', () => {
  describe('Property 1: Hierarchical flag resolution', () => {
    /**
     * Property: For all flag operations, the result must be deterministic
     * given the same initial state and sequence of operations.
     */
    it('should produce deterministic results for repeated enable/disable operations', () => {
      return fc.assert(
        fc.property(
          fc.array(fc.tuple(validFlagName(), fc.boolean())),
          (operations) => {
            // First manager
            const manager1 = new FeatureFlagManager();
            for (const [flag, enabled] of operations) {
              if (enabled) {
                manager1.enable(flag);
              } else {
                manager1.disable(flag);
              }
            }
            const result1 = manager1.export();

            // Second manager with same operations
            const manager2 = new FeatureFlagManager();
            for (const [flag, enabled] of operations) {
              if (enabled) {
                manager2.enable(flag);
              } else {
                manager2.disable(flag);
              }
            }
            const result2 = manager2.export();

            // Results must be identical
            expect(result1).toEqual(result2);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Enabling a flag then disabling it should return to the original state
     */
    it('should be reversible: enable then disable returns to original state', () => {
      return fc.assert(
        fc.property(
          validFlagName(),
          (flagName) => {
            const manager = new FeatureFlagManager();
            
            // Initial state - flag should not exist or be disabled
            const initialEnabled = manager.isEnabled(flagName);
            
            // Enable
            manager.enable(flagName);
            const afterEnable = manager.isEnabled(flagName);
            
            // Disable
            manager.disable(flagName);
            const afterDisable = manager.isEnabled(flagName);
            
            // Verify
            expect(afterEnable).toBe(true);
            expect(afterDisable).toBe(false);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Master flag enable_all_p1p2 should enable all registered P1 and P2 capabilities
     */
    it('should enable all P1/P2 capabilities when enable_all_p1p2 is enabled', () => {
      return fc.assert(
        fc.property(
          uniqueCapabilitiesArb(),
          (capabilities) => {
            const manager = new FeatureFlagManager({ enableMasterFlags: true });
            
            // Register capabilities with their scope tags
            for (const [capId, scopeTag] of capabilities) {
              manager.registerCapability(capId, scopeTag);
            }
            
            // Enable master flag
            manager.enable('enable_all_p1p2');
            
            // All registered P1 and P2 capabilities should be enabled
            let allEnabled = true;
            for (const [capId, scopeTag] of capabilities) {
              const isEnabled = manager.isEnabled(`enable_${capId}`);
              if (!isEnabled) {
                allEnabled = false;
                break;
              }
            }
            
            expect(allEnabled).toBe(true);
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Disabling a capability flag should work correctly after master flag enables it
     */
    it('should correctly disable individual capability after master flag enables it', () => {
      return fc.assert(
        fc.property(
          uniqueCapabilitiesArb().map(arr => arr.slice(0, Math.min(arr.length, 5))),
          fc.integer({ min: 0, max: 4 }),
          (capabilities, disableIndex) => {
            if (capabilities.length === 0) return true;
            
            const manager = new FeatureFlagManager({ enableMasterFlags: true });
            
            // Register capabilities
            const capToDisable = capabilities[disableIndex % capabilities.length];
            for (const [capId, scopeTag] of capabilities) {
              manager.registerCapability(capId, scopeTag);
            }
            
            // Enable master flag
            manager.enable('enable_all_p1p2');
            
            // Disable one specific capability
            manager.disable(`enable_${capToDisable[0]}`);
            
            // Verify: the disabled one should be false, others should be true
            for (let i = 0; i < capabilities.length; i++) {
              const [capId] = capabilities[i];
              const expected = (i !== (disableIndex % capabilities.length));
              expect(manager.isEnabled(`enable_${capId}`)).toBe(expected);
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Import then export should be idempotent for enabled flags
     */
    it('should be idempotent for enabled flags: export(import(x)) = x', () => {
      return fc.assert(
        fc.property(
          fc.nat({ max: 19 }).map(n => {
            // Generate n+1 flags with predictable names
            const flags: Array<[string, boolean]> = [];
            for (let i = 0; i <= n; i++) {
              const name = `import_flag_${i}`;
              const enabled = i % 2 === 0;
              flags.push([name, enabled]);
            }
            return flags;
          }),
          (flags) => {
            const manager = new FeatureFlagManager();
            
            // Convert to Record for import
            const flagsRecord: Record<string, boolean> = {};
            for (const [key, value] of flags) {
              flagsRecord[key] = value;
            }
            
            manager.import(flagsRecord);
            const exported = manager.export();
            
            // After import, all enabled flags should be exported as true
            for (const [key, value] of flags) {
              if (value === true) {
                expect(exported[key]).toBe(true);
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: History records should be in chronological order
     */
    it('should maintain chronological order in history', () => {
      return fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              validFlagName(),
              fc.boolean()
            ),
            { minLength: 3, maxLength: 10 }
          ),
          (operations) => {
            const manager = new FeatureFlagManager();
            
            for (const [flag, enabled] of operations) {
              if (enabled) {
                manager.enable(flag);
              } else {
                manager.disable(flag);
              }
            }
            
            const history = manager.getHistory();
            
            // Verify chronological order
            let lastTime = new Date(0);
            for (const entry of history) {
              expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(lastTime.getTime());
              lastTime = entry.timestamp;
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Bulk enable/disable by scope should affect correct number of flags
     */
    it('should correctly count flags affected by bulk operations', () => {
      return fc.assert(
        fc.property(
          uniqueAllScopeCapabilitiesArb(),
          fc.constantFrom<'p1' | 'p2'>('p1', 'p2'),
          (capabilities, targetScope) => {
            const manager = new FeatureFlagManager();
            
            // Register all capabilities
            const expectedCount = capabilities.filter(([_, scope]) => scope === targetScope).length;
            for (const [capId, scopeTag] of capabilities) {
              manager.registerCapability(capId, scopeTag);
            }
            
            // Enable by scope
            const enabledCount = manager.enableByScope(targetScope);
            
            // Verify count
            expect(enabledCount).toBe(expectedCount);
            
            // Verify all of that scope are enabled
            for (const [capId, scopeTag] of capabilities) {
              if (scopeTag === targetScope) {
                expect(manager.isEnabled(`enable_${capId}`)).toBe(true);
              }
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});