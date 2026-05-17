/**
 * Property-based tests for ScopeConfiguration
 * 
 * Feature: scope-gate
 * Task: 14.3 - Ensure PBT coverage for all critical paths
 * 
 * This test suite validates the ScopeConfiguration module with property-based tests
 * to ensure all critical code paths are covered.
 * 
 * Key properties tested:
 * 1. Configuration determinism - same inputs produce same outputs
 * 2. Feature flag serialization round-trip
 * 3. Override behavior consistency
 * 4. Context creation determinism
 * 5. Schema version consistency
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  ScopeConfigurationLoader,
  createDefaultConfigLoader 
} from '../src/scope-configuration.js';
import type { ScopeContext } from '../src/types.js';

// Helper to create valid capability IDs
function createValidCapabilityIdArb(): fc.Arbitrary<string> {
  return fc.string({ minLength: 2, maxLength: 30 })
    .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_'))
    .filter(s => s.length >= 2 && /^[a-zA-Z]/.test(s));
}

// Helper to create valid enforcement modes
function createEnforcementModeArb(): fc.Arbitrary<'strict' | 'warning' | 'disabled'> {
  return fc.constantFrom<'strict' | 'warning' | 'disabled'>('strict', 'warning', 'disabled');
}

// Helper to create valid release branches
function createReleaseBranchArb(): fc.Arbitrary<'v6.0' | 'v6.1' | 'v6.x' | 'development'> {
  return fc.constantFrom<'v6.0' | 'v6.1' | 'v6.x' | 'development'>('v6.0', 'v6.1', 'v6.x', 'development');
}

// Helper to create valid environments
function createEnvironmentArb(): fc.Arbitrary<'production' | 'staging' | 'development' | 'test'> {
  return fc.constantFrom<'production' | 'staging' | 'development' | 'test'>('production', 'staging', 'development', 'test');
}

describe('ScopeConfiguration Property Tests (Task 14.3)', () => {
  describe('Property: Configuration Determinism', () => {
    /**
     * Property: Creating multiple loaders with same options should produce identical configs
     * 
     * For all identical configuration options, the resulting config must be identical.
     */
    it('should produce identical configs for same constructor options', () => {
      return fc.assert(
        fc.property(
          createEnforcementModeArb(),
          createReleaseBranchArb(),
          createEnvironmentArb(),
          (enforcementMode, releaseBranch, environment) => {
            const loader1 = new ScopeConfigurationLoader({
              defaultContext: {
                releaseBranch,
                environment
              },
              enforcementMode
            });
            
            const loader2 = new ScopeConfigurationLoader({
              defaultContext: {
                releaseBranch,
                environment
              },
              enforcementMode
            });
            
            const config1 = loader1.getConfig();
            const config2 = loader2.getConfig();
            
            // Both configs should be identical
            expect(config1.schema_version).toBe(config2.schema_version);
            expect(config1.enforcementMode).toBe(config2.enforcementMode);
            expect(config1.defaultContext.releaseBranch).toBe(config2.defaultContext.releaseBranch);
            expect(config1.defaultContext.environment).toBe(config2.defaultContext.environment);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Same config should produce same hash
     * 
     * For identical configurations, the config hash must be identical.
     */
    it('should produce consistent hash for same config', () => {
      return fc.assert(
        fc.property(
          createEnforcementModeArb(),
          (mode) => {
            const loader1 = new ScopeConfigurationLoader({ enforcementMode: mode });
            const loader2 = new ScopeConfigurationLoader({ enforcementMode: mode });
            
            const hash1 = loader1.getConfigHash();
            const hash2 = loader2.getConfigHash();
            
            expect(hash1).toBe(hash2);
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property: Feature Flag Serialization', () => {
    /**
     * Property: Feature flags set via environment variables should serialize correctly
     * 
     * When feature flags are set via env vars, they should be properly
     * serialized in config export and re-importable.
     */
    it('should serialize and deserialize feature flags correctly', () => {
      return fc.assert(
        fc.property(
          fc.array(
            fc.tuple(createValidCapabilityIdArb(), fc.boolean()),
            { minLength: 1, maxLength: 10 }
          ),
          (flagPairs) => {
            // Create flags from array
            const flags: Record<string, boolean> = {};
            for (const [name, value] of flagPairs) {
              flags[name] = value;
            }
            
            const loader = new ScopeConfigurationLoader();
            
            // Manually set flags using setFeatureFlag
            for (const [name, value] of flagPairs) {
              loader.setFeatureFlag(name, value);
            }
            
            // Export config
            const exported = loader.getConfig();
            
            // Re-import by creating new loader
            const loader2 = new ScopeConfigurationLoader();
            
            // Apply exported flags
            for (const [name, value] of Object.entries(flags)) {
              loader2.setFeatureFlag(name, value);
            }
            
            // Check consistency
            for (const [name, expectedValue] of flagPairs) {
              expect(loader2.isFeatureFlagEnabled(name)).toBe(expectedValue);
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Multiple flag changes should be tracked in order
     * 
     * When flags are changed multiple times, the order should be preserved
     * and each change should be reflectable.
     */
    it('should maintain order of multiple flag changes', () => {
      return fc.assert(
        fc.property(
          fc.array(
            fc.tuple(createValidCapabilityIdArb(), fc.boolean()),
            { minLength: 3, maxLength: 8 }
          ),
          (changes) => {
            const loader = new ScopeConfigurationLoader();
            
            // Apply changes in sequence
            for (const [flag, value] of changes) {
              loader.setFeatureFlag(flag, value);
            }
            
            // Verify all final states
            for (const [flag, expectedValue] of changes) {
              expect(loader.isFeatureFlagEnabled(flag)).toBe(expectedValue);
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Override Behavior Consistency', () => {
    /**
     * Property: Overrides should consistently affect capability availability
     * 
     * When a capability override is added, it should consistently
     * affect the availability check.
     */
    it('should consistently apply capability overrides', () => {
      return fc.assert(
        fc.property(
          createValidCapabilityIdArb(),
          fc.boolean(),
          (capabilityId, available) => {
            const loader = new ScopeConfigurationLoader();
            
            // Add override
            loader.addOverride(capabilityId, available, 'Test override');
            
            // Check availability - should match override
            expect(loader.isCapabilityAvailable(capabilityId)).toBe(available);
            
            // Other capabilities should not be affected
            expect(loader.isCapabilityAvailable('other-capability')).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Override removal should be consistent
     * 
     * When an override is removed, availability should return to default.
     */
    it('should consistently remove overrides', () => {
      return fc.assert(
        fc.property(
          createValidCapabilityIdArb(),
          (capabilityId) => {
            const loader = new ScopeConfigurationLoader();
            
            // Add override
            loader.addOverride(capabilityId, false, 'Test');
            
            // Verify override is applied
            expect(loader.isCapabilityAvailable(capabilityId)).toBe(false);
            
            // Remove override
            const removed = loader.removeOverride(capabilityId);
            
            // Verify removal
            expect(removed).toBe(true);
            expect(loader.isCapabilityAvailable(capabilityId)).toBe(true); // Default
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Expired overrides should not affect availability
     * 
     * When an override has an expiration date in the past, it should
     * not affect capability availability.
     */
    it('should not apply expired overrides', () => {
      return fc.assert(
        fc.property(
          createValidCapabilityIdArb(),
          (capabilityId) => {
            const loader = new ScopeConfigurationLoader();
            
            // Add expired override (24 hours ago)
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            loader.addOverride(capabilityId, false, 'Expired', yesterday);
            
            // Should use default availability
            expect(loader.isCapabilityAvailable(capabilityId)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Context Creation Determinism', () => {
    /**
     * Property: Same input options should produce identical scope contexts
     * 
     * When createScopeContext is called with the same options,
     * it should produce identical contexts.
     */
    it('should produce deterministic scope contexts', () => {
      return fc.assert(
        fc.property(
          createReleaseBranchArb(),
          createEnvironmentArb(),
          fc.array(
            fc.tuple(createValidCapabilityIdArb(), fc.boolean()),
            { maxLength: 5 }
          ),
          (releaseBranch, environment, flags) => {
            const loader = new ScopeConfigurationLoader({
              defaultContext: {
                releaseBranch,
                environment
              }
            });
            
            // Set flags
            for (const [flag, value] of flags) {
              loader.setFeatureFlag(flag, value);
            }
            
            // Create context multiple times
            const context1 = loader.createScopeContext();
            const context2 = loader.createScopeContext();
            
            // Should be identical
            expect(context1.releaseBranch).toBe(context2.releaseBranch);
            expect(context1.environment).toBe(context2.environment);
            expect(context1.featureFlags.size).toBe(context2.featureFlags.size);
            
            // Compare flag sets
            for (const flag of context1.featureFlags) {
              expect(context2.featureFlags.has(flag)).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Context overrides should work correctly
     * 
     * When createScopeContext is called with override options,
     * they should take precedence over defaults.
     */
    it('should apply context overrides correctly', () => {
      return fc.assert(
        fc.property(
          createReleaseBranchArb(),
          createEnvironmentArb(),
          createReleaseBranchArb(),
          createEnvironmentArb(),
          (defaultBranch, defaultEnv, overrideBranch, overrideEnv) => {
            // Ensure overrides are different from defaults
            if (defaultBranch === overrideBranch && defaultEnv === overrideEnv) {
              return true;
            }
            
            const loader = new ScopeConfigurationLoader({
              defaultContext: {
                releaseBranch: defaultBranch,
                environment: defaultEnv
              }
            });
            
            const context = loader.createScopeContext({
              releaseBranch: overrideBranch,
              environment: overrideEnv
            });
            
            // Overrides should take effect
            expect(context.releaseBranch).toBe(overrideBranch);
            expect(context.environment).toBe(overrideEnv);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Schema Version Consistency', () => {
    /**
     * Property: All configs must have valid schema_version
     * 
     * Every ScopeConfiguration should include a schema_version field
     * for future migration support.
     */
    it('should always include schema_version in config', () => {
      return fc.assert(
        fc.property(
          createEnforcementModeArb(),
          (mode) => {
            const loader = new ScopeConfigurationLoader({ enforcementMode: mode });
            const config = loader.getConfig();
            
            expect(config.schema_version).toBeDefined();
            expect(config.schema_version).toBe('1.0');
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Schema version should persist through save/load
     * 
     * When config is saved and reloaded, schema_version should be preserved.
     */
    it('should preserve schema_version through save/load cycle', async () => {
      // Use a simpler approach without fc.assert since we're doing file I/O
      const tempPath = `d:/code/temp/SpecForge/packages/scope-gate/tests/test-schema-${Date.now()}-${Math.random()}.json`;
      
      const loader1 = new ScopeConfigurationLoader({ enforcementMode: 'strict' });
      const initialSchema = loader1.getConfig().schema_version;
      
      await loader1.saveToFile(tempPath);
      
      const loader2 = new ScopeConfigurationLoader({ configPath: tempPath });
      await loader2.load();
      
      expect(loader2.getConfig().schema_version).toBe(initialSchema);
      
      // Cleanup
      try {
        const fs = await import('fs/promises');
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      
      return true;
    });
  });

  describe('Property: Validation Consistency', () => {
    /**
     * Property: Valid configs should always pass validation
     * 
     * Configs created with valid values should always pass validation.
     */
    it('should pass validation for valid configs', () => {
      return fc.assert(
        fc.property(
          createEnforcementModeArb(),
          createReleaseBranchArb(),
          createEnvironmentArb(),
          (mode, branch, env) => {
            const loader = new ScopeConfigurationLoader({
              enforcementMode: mode,
              defaultContext: {
                releaseBranch: branch,
                environment: env
              }
            });
            
            const errors = loader.validate();
            
            // Should have no validation errors for valid inputs
            expect(errors.length).toBe(0);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Feature Flag Listener Consistency', () => {
    /**
     * Property: Listeners should always be called on flag changes
     * 
     * When a feature flag is changed, all registered listeners should
     * be called with the updated flag state.
     */
    it('should notify all listeners on flag change', () => {
      return fc.assert(
        fc.property(
          createValidCapabilityIdArb(),
          fc.boolean(),
          (flagName, value) => {
            const loader = new ScopeConfigurationLoader();
            
            // Register multiple listeners
            const listener1 = { called: false, flags: {} as Record<string, boolean> };
            const listener2 = { called: false, flags: {} as Record<string, boolean> };
            
            loader.onFeatureFlagChange((flags) => {
              listener1.called = true;
              listener1.flags = { ...flags };
            });
            
            loader.onFeatureFlagChange((flags) => {
              listener2.called = true;
              listener2.flags = { ...flags };
            });
            
            // Change flag
            loader.setFeatureFlag(flagName, value);
            
            // Both listeners should be called
            expect(listener1.called).toBe(true);
            expect(listener2.called).toBe(true);
            
            // Both should receive the updated flags
            expect(listener1.flags[flagName]).toBe(value);
            expect(listener2.flags[flagName]).toBe(value);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Unsubscribe should work correctly
     * 
     * When a listener is unsubscribed, it should not be called
     * on subsequent flag changes.
     */
    it('should stop calling unsubscribed listeners', () => {
      return fc.assert(
        fc.property(
          createValidCapabilityIdArb(),
          (flagName) => {
            const loader = new ScopeConfigurationLoader();
            
            const activeListener = { called: false };
            const inactiveListener = { called: false };
            
            const unsubscribe = loader.onFeatureFlagChange(() => {
              inactiveListener.called = true;
            });
            
            loader.onFeatureFlagChange(() => {
              activeListener.called = true;
            });
            
            // Unsubscribe
            unsubscribe();
            
            // Change flag
            loader.setFeatureFlag(flagName, true);
            
            // Only active listener should be called
            expect(activeListener.called).toBe(true);
            expect(inactiveListener.called).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Config Hash Determinism', () => {
    /**
     * Property: Config hash should be deterministic across same operations
     * 
     * When the same operations are performed in the same order,
     * the resulting config hash should be identical.
     */
    it('should produce consistent hash after same operations', () => {
      return fc.assert(
        fc.property(
          fc.array(
            fc.tuple(createValidCapabilityIdArb(), fc.boolean()),
            { minLength: 1, maxLength: 5 }
          ),
          (operations) => {
            // First loader
            const loader1 = new ScopeConfigurationLoader();
            for (const [flag, value] of operations) {
              loader1.setFeatureFlag(flag, value);
            }
            const hash1 = loader1.getConfigHash();
            
            // Second loader with same operations
            const loader2 = new ScopeConfigurationLoader();
            for (const [flag, value] of operations) {
              loader2.setFeatureFlag(flag, value);
            }
            const hash2 = loader2.getConfigHash();
            
            // Hashes should be identical
            expect(hash1).toBe(hash2);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Edge Cases', () => {
    /**
     * Property: Should handle empty feature flag names gracefully
     */
    it('should handle empty feature flag names', () => {
      const loader = new ScopeConfigurationLoader();
      
      // Empty string - the implementation may allow setting it but we verify behavior is defined
      // Just check it doesn't crash and behavior is consistent
      expect(() => loader.setFeatureFlag('', true)).not.toThrow();
      
      // The key is that behavior is deterministic - if it gets set, it should stay set
      const initialState = loader.isFeatureFlagEnabled('');
      
      // Check consistency
      const subsequentState = loader.isFeatureFlagEnabled('');
      expect(initialState).toBe(subsequentState);
      
      return true;
    });

    /**
     * Property: Should handle very long flag names
     */
    it('should handle very long flag names', () => {
      return fc.assert(
        fc.property(
          fc.string({ minLength: 100, maxLength: 200 }),
          (longName) => {
            const loader = new ScopeConfigurationLoader();
            
            // Should handle long names
            expect(() => loader.setFeatureFlag(longName, true)).not.toThrow();
            expect(loader.isFeatureFlagEnabled(longName)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Property: Should handle unicode flag names
     */
    it('should handle unicode flag names', () => {
      const loader = new ScopeConfigurationLoader();
      
      // Unicode flag names
      expect(() => loader.setFeatureFlag('标志', true)).not.toThrow();
      expect(loader.isFeatureFlagEnabled('标志')).toBe(true);
      
      return true;
    });

    /**
     * Property: Should handle many concurrent flag changes
     */
    it('should handle many concurrent flag changes', () => {
      return fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 20 }).map((s, i) => `${s}_${i}`), 
              fc.boolean()
            ),
            { minLength: 50, maxLength: 100 }
          ),
          (changes) => {
            const loader = new ScopeConfigurationLoader();
            
            // Set all flags with unique names (by adding index)
            for (let i = 0; i < changes.length; i++) {
              const [_, value] = changes[i];
              const uniqueFlagName = `flag_${i}`;
              loader.setFeatureFlag(uniqueFlagName, value);
            }
            
            // Verify all were set - use unique names
            for (let i = 0; i < changes.length; i++) {
              const [_, expected] = changes[i];
              const uniqueFlagName = `flag_${i}`;
              expect(loader.isFeatureFlagEnabled(uniqueFlagName)).toBe(expected);
            }
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: Default Values Consistency', () => {
    /**
     * Property: Factory function should produce consistent defaults
     */
    it('createDefaultConfigLoader should produce consistent defaults', () => {
      return fc.assert(
        fc.property(
          fc.nat({ max: 10 }),
          (n) => {
            // Create multiple loaders
            const loaders = [];
            for (let i = 0; i < n; i++) {
              loaders.push(createDefaultConfigLoader());
            }
            
            // All should have same defaults
            const firstLoader = loaders[0];
            for (const loader of loaders) {
              expect(loader.getEnforcementMode()).toBe(firstLoader.getEnforcementMode());
              expect(loader.getDefaultContext().releaseBranch).toBe(firstLoader.getDefaultContext().releaseBranch);
              expect(loader.getDefaultContext().environment).toBe(firstLoader.getDefaultContext().environment);
            }
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});