/**
 * Property-based tests for Round-trip Serialization of all data models
 * 
 * Feature: scope-gate
 * Task: 14.4 - Round-trip serialization of all data models
 * 
 * This test suite validates Property 8 (Parent Spec): Round-trip serialization
 * for all data models in the Scope Gate module.
 * 
 * Data models tested:
 * 1. CapabilityDefinition - JSON serialization/deserialization
 * 2. ScopeContext - serialization with Set handling
 * 3. FeatureFlag (from feature-flag-manager) - serialization
 * 4. ScopeConfiguration - full config serialization
 * 5. FeatureFlagChange - change log serialization
 * 6. ScopeViolationAttempt - audit event serialization
 * 
 * Property: Serialize → Deserialize must preserve data consistency
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  createCapabilityArb,
  createContextArb,
  createFeatureFlagChangeArb,
  createViolationAttemptArb,
  createCapabilityIdArb
} from '../src/generators.js';
import { ScopeRegistry } from '../src/scope-registry.js';
import { ScopeConfigurationLoader } from '../src/scope-configuration.js';
import { FeatureFlagManager } from '../src/feature-flag-manager.js';
import type { 
  CapabilityDefinition, 
  ScopeContext, 
  ScopeConfiguration,
  FeatureFlagChange,
  ScopeViolationAttempt,
  FeatureFlag
} from '../src/types.js';

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

// Helper to create valid capability IDs
function createValidCapabilityIdArb(): fc.Arbitrary<string> {
  return fc.string({ minLength: 2, maxLength: 30 })
    .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_'))
    .filter(s => s.length >= 2 && /^[a-zA-Z]/.test(s));
}

describe('Round-Trip Serialization Property Tests (Task 14.4)', () => {
  describe('Property 8: CapabilityDefinition Serialization', () => {
    /**
     * Property: JSON stringify → JSON parse must preserve CapabilityDefinition
     * 
     * For any valid CapabilityDefinition, serializing to JSON and parsing back
     * should produce an equal object (accounting for Set → Array conversion).
     */
    it('should preserve CapabilityDefinition through JSON round-trip', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb(),
          (capability) => {
            // Serialize to JSON
            const json = JSON.stringify(capability);
            
            // Deserialize back
            const parsed = JSON.parse(json) as CapabilityDefinition;
            
            // Verify all fields are preserved
            expect(parsed.id).toBe(capability.id);
            expect(parsed.displayName).toBe(capability.displayName);
            expect(parsed.scopeTag).toBe(capability.scopeTag);
            expect(parsed.description).toBe(capability.description);
            
            // Arrays should be equal (they survive JSON serialization as arrays)
            expect(parsed.entryPoints).toEqual(capability.entryPoints);
            expect(parsed.dependencies).toEqual(capability.dependencies);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Multiple capabilities should serialize consistently
     * 
     * When multiple capabilities are serialized together and parsed back,
     * each capability should be preserved correctly.
     */
    it('should preserve array of CapabilityDefinition through round-trip', () => {
      return fc.assert(
        fc.property(
          fc.array(createCapabilityArb(), { minLength: 1, maxLength: 20 }),
          (capabilities) => {
            // Serialize array to JSON
            const json = JSON.stringify(capabilities);
            
            // Deserialize back
            const parsed = JSON.parse(json) as CapabilityDefinition[];
            
            // Verify count
            expect(parsed.length).toBe(capabilities.length);
            
            // Verify each capability
            for (let i = 0; i < capabilities.length; i++) {
              expect(parsed[i].id).toBe(capabilities[i].id);
              expect(parsed[i].displayName).toBe(capabilities[i].displayName);
              expect(parsed[i].scopeTag).toBe(capabilities[i].scopeTag);
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: ScopeRegistry capabilities should serialize correctly
     * 
     * Capabilities stored in ScopeRegistry should survive serialization
     * when the registry is serialized to JSON.
     */
    it('should preserve ScopeRegistry capabilities through serialization', () => {
      return fc.assert(
        fc.property(
          fc.array(createCapabilityArb(), { minLength: 1, maxLength: 10 }),
          (capabilities) => {
            // Create registry and register capabilities
            const registry = new ScopeRegistry();
            for (const cap of capabilities) {
              registry.registerCapability(cap);
            }
            
            // Get all capabilities
            const stored = registry.getAllCapabilities();
            
            // Serialize registry state
            const serialized = JSON.stringify(stored.map(c => ({
              id: c.id,
              displayName: c.displayName,
              scopeTag: c.scopeTag,
              entryPoints: c.entryPoints,
              dependencies: c.dependencies,
              description: c.description
            })));
            
            // Deserialize
            const parsed = JSON.parse(serialized) as CapabilityDefinition[];
            
            // Verify all registered capabilities are preserved
            expect(parsed.length).toBe(capabilities.length);
            
            // Verify IDs match
            const parsedIds = parsed.map(p => p.id).sort();
            const originalIds = capabilities.map(c => c.id).sort();
            expect(parsedIds).toEqual(originalIds);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 8: ScopeContext Serialization', () => {
    /**
     * Property: ScopeContext with Set<featureFlags> must serialize correctly
     * 
     * ScopeContext uses Set for featureFlags, which requires special handling
     * during JSON serialization. The round-trip must preserve all flags.
     */
    it('should preserve ScopeContext with Set through JSON round-trip', () => {
      return fc.assert(
        fc.property(
          createContextArb(),
          (context) => {
            // Serialize to JSON (Set becomes array)
            // We need to handle the Set specially since it's not JSON serializable
            const serializable = {
              releaseBranch: context.releaseBranch,
              featureFlags: Array.from(context.featureFlags),
              environment: context.environment
            };
            
            const json = JSON.stringify(serializable);
            
            // Deserialize back
            const parsed = JSON.parse(json);
            
            // Reconstruct ScopeContext with Set
            const restoredContext: ScopeContext = {
              releaseBranch: parsed.releaseBranch,
              featureFlags: new Set(parsed.featureFlags),
              environment: parsed.environment
            };
            
            // Verify all fields
            expect(restoredContext.releaseBranch).toBe(context.releaseBranch);
            expect(restoredContext.environment).toBe(context.environment);
            expect(restoredContext.featureFlags.size).toBe(context.featureFlags.size);
            
            // Verify all flags are preserved
            for (const flag of context.featureFlags) {
              expect(restoredContext.featureFlags.has(flag)).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: ScopeContext created from config should serialize consistently
     * 
     * When ScopeContext is created from ScopeConfiguration, the serialization
     * should be deterministic.
     */
    it('should preserve ScopeContext from configuration through round-trip', () => {
      return fc.assert(
        fc.property(
          createReleaseBranchArb(),
          createEnvironmentArb(),
          fc.array(
            fc.tuple(createValidCapabilityIdArb(), fc.boolean()),
            { maxLength: 10 }
          ),
          (releaseBranch, environment, flagPairs) => {
            // Create config with flags
            const loader = new ScopeConfigurationLoader({
              defaultContext: { releaseBranch, environment }
            });
            
            // Set flags
            for (const [flag, value] of flagPairs) {
              loader.setFeatureFlag(flag, value);
            }
            
            // Create context
            const context = loader.createScopeContext();
            
            // Serialize (handle Set)
            const serializable = {
              releaseBranch: context.releaseBranch,
              featureFlags: Array.from(context.featureFlags),
              environment: context.environment
            };
            const json = JSON.stringify(serializable);
            
            // Deserialize and reconstruct
            const parsed = JSON.parse(json);
            const restored: ScopeContext = {
              releaseBranch: parsed.releaseBranch,
              featureFlags: new Set(parsed.featureFlags),
              environment: parsed.environment
            };
            
            // Verify consistency
            expect(restored.releaseBranch).toBe(context.releaseBranch);
            expect(restored.environment).toBe(context.environment);
            expect(restored.featureFlags.size).toBe(context.featureFlags.size);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Empty feature flags Set should serialize correctly
     */
    it('should handle empty feature flags set through round-trip', () => {
      return fc.assert(
        fc.property(
          createReleaseBranchArb(),
          createEnvironmentArb(),
          (releaseBranch, environment) => {
            // Create context with empty set
            const context: ScopeContext = {
              releaseBranch,
              featureFlags: new Set(),
              environment
            };
            
            // Serialize
            const serializable = {
              releaseBranch: context.releaseBranch,
              featureFlags: Array.from(context.featureFlags),
              environment: context.environment
            };
            const json = JSON.stringify(serializable);
            
            // Deserialize
            const parsed = JSON.parse(json);
            const restored: ScopeContext = {
              releaseBranch: parsed.releaseBranch,
              featureFlags: new Set(parsed.featureFlags),
              environment: parsed.environment
            };
            
            // Verify
            expect(restored.featureFlags.size).toBe(0);
            expect(restored.releaseBranch).toBe(releaseBranch);
            expect(restored.environment).toBe(environment);
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 8: FeatureFlag Serialization', () => {
    /**
     * Property: FeatureFlag objects must serialize correctly
     * 
     * FeatureFlag objects with Date fields must preserve timestamps
     * through JSON serialization.
     */
    it('should preserve FeatureFlag through JSON round-trip', () => {
      return fc.assert(
        fc.property(
          createValidCapabilityIdArb(),
          fc.boolean(),
          (flagName, enabled) => {
            // Create a FeatureFlag (from feature-flag-manager)
            const flag: FeatureFlag = {
              name: flagName,
              enabled,
              updatedAt: new Date(),
              description: `Test flag ${flagName}`
            };
            
            // Serialize (handle Date)
            const serializable = {
              ...flag,
              updatedAt: flag.updatedAt.toISOString()
            };
            const json = JSON.stringify(serializable);
            
            // Deserialize
            const parsed = JSON.parse(json);
            const restored: FeatureFlag = {
              ...parsed,
              updatedAt: new Date(parsed.updatedAt)
            };
            
            // Verify
            expect(restored.name).toBe(flag.name);
            expect(restored.enabled).toBe(flag.enabled);
            expect(restored.updatedAt.getTime()).toBe(flag.updatedAt.getTime());
            expect(restored.description).toBe(flag.description);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: FeatureFlagManager state should serialize correctly
     * 
     * When FeatureFlagManager is serialized, all flags should be preserved.
     */
    it('should preserve FeatureFlagManager flags through serialization', () => {
      return fc.assert(
        fc.property(
          fc.record({
            flags: fc.dictionary(createValidCapabilityIdArb(), fc.boolean()),
            enableMaster: fc.boolean()
          }),
          ({ flags, enableMaster }) => {
            // Create manager with flags (using config source to bypass security)
            const manager = new FeatureFlagManager({
              initialFlags: flags,
              enableMasterFlags: enableMaster
            });
            
            // Get all flags - use getAll() which returns FeatureFlag[]
            const allFlags = manager.getAll();
            
            // Serialize
            const serializable = allFlags.map(flag => ({
              name: flag.name,
              enabled: flag.enabled,
              scopeTag: flag.scopeTag,
              updatedAt: flag.updatedAt.toISOString(),
              description: flag.description
            }));
            const json = JSON.stringify(serializable);
            
            // Deserialize
            const parsed = JSON.parse(json) as Array<{
              name: string;
              enabled: boolean;
              scopeTag?: 'p0' | 'p1' | 'p2';
              updatedAt: string;
              description?: string;
            }>;
            
            // Note: FeatureFlagManager normalizes flag names to lowercase
            // We need to check that all input flags are represented in output
            // Create normalized version of input flags for comparison
            const normalizedInputFlags: Record<string, boolean> = {};
            for (const [key, value] of Object.entries(flags)) {
              normalizedInputFlags[key.toLowerCase()] = value;
            }
            
            // Verify all serialized flags are in the original input (normalized)
            for (const p of parsed) {
              expect(normalizedInputFlags[p.name]).toBe(p.enabled);
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 8: ScopeConfiguration Serialization', () => {
    /**
     * Property: Full ScopeConfiguration must serialize correctly
     * 
     * The complete configuration object should survive JSON serialization
     * with all nested structures intact.
     */
    it('should preserve full ScopeConfiguration through JSON round-trip', () => {
      return fc.assert(
        fc.property(
          createEnforcementModeArb(),
          createReleaseBranchArb(),
          createEnvironmentArb(),
          (enforcementMode, releaseBranch, environment) => {
            // Create configuration
            const loader = new ScopeConfigurationLoader({
              enforcementMode,
              defaultContext: { releaseBranch, environment }
            });
            
            // Add some feature flags
            loader.setFeatureFlag('test-flag-1', true);
            loader.setFeatureFlag('test-flag-2', false);
            
            // Add override
            loader.addOverride('test-capability', false, 'Test override');
            
            // Get config
            const config = loader.getConfig();
            
            // Serialize to JSON
            const json = JSON.stringify(config);
            
            // Deserialize
            const parsed = JSON.parse(json) as ScopeConfiguration;
            
            // Verify schema version
            expect(parsed.schema_version).toBe(config.schema_version);
            
            // Verify enforcement mode
            expect(parsed.enforcementMode).toBe(config.enforcementMode);
            
            // Verify default context
            expect(parsed.defaultContext.releaseBranch).toBe(config.defaultContext.releaseBranch);
            expect(parsed.defaultContext.environment).toBe(config.defaultContext.environment);
            
            // Verify feature flags (at least the ones we added)
            expect(parsed.featureFlags['test-flag-1']).toBeDefined();
            expect(parsed.featureFlags['test-flag-1']?.default).toBe(true);
            
            // Verify overrides
            expect(parsed.overrides.length).toBeGreaterThan(0);
            const testOverride = parsed.overrides.find(o => o.capabilityId === 'test-capability');
            expect(testOverride).toBeDefined();
            expect(testOverride?.available).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Configuration file save/load should preserve all data
     */
    it('should preserve configuration through file save/load', async () => {
      // Create configuration
      const loader1 = new ScopeConfigurationLoader({
        enforcementMode: 'strict',
        defaultContext: { releaseBranch: 'v6.0', environment: 'production' }
      });
      
      loader1.setFeatureFlag('persisted-flag', true);
      loader1.addOverride('test-cap', false, 'Test');
      
      const config1 = loader1.getConfig();
      
      // Save to temp file
      const tempPath = `d:/code/temp/SpecForge/packages/scope-gate/tests/test-serialization-${Date.now()}-${Math.random()}.json`;
      await loader1.saveToFile(tempPath);
      
      // Load into new loader
      const loader2 = new ScopeConfigurationLoader({ configPath: tempPath });
      await loader2.load();
      
      const config2 = loader2.getConfig();
      
      // Verify
      expect(config2.schema_version).toBe(config1.schema_version);
      expect(config2.enforcementMode).toBe(config1.enforcementMode);
      expect(config2.defaultContext.releaseBranch).toBe(config1.defaultContext.releaseBranch);
      expect(config2.defaultContext.environment).toBe(config1.defaultContext.environment);
      
      // Cleanup
      try {
        const fs = await import('fs/promises');
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      
      return true;
    });

    /**
     * Property: Environment defaults should serialize correctly
     */
    it('should preserve environment defaults through serialization', () => {
      return fc.assert(
        fc.property(
          createEnvironmentArb(),
          (env) => {
            const loader = new ScopeConfigurationLoader();
            const defaults = loader.getEnvironmentDefaults(env);
            
            // Serialize
            const json = JSON.stringify(defaults);
            const parsed = JSON.parse(json);
            
            // Verify
            expect(parsed.enforcementMode).toBe(defaults?.enforcementMode);
            expect(parsed.allowP1).toBe(defaults?.allowP1);
            expect(parsed.allowP2).toBe(defaults?.allowP2);
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 8: FeatureFlagChange Serialization', () => {
    /**
     * Property: FeatureFlagChange must preserve all fields through serialization
     * 
     * FeatureFlagChange includes Date and optional fields that must be
     * preserved correctly.
     */
    it('should preserve FeatureFlagChange through JSON round-trip', () => {
      return fc.assert(
        fc.property(
          createFeatureFlagChangeArb(),
          (change) => {
            // Serialize (handle Date)
            const serializable = {
              ...change,
              timestamp: change.timestamp.toISOString()
            };
            const json = JSON.stringify(serializable);
            
            // Deserialize
            const parsed = JSON.parse(json);
            const restored: FeatureFlagChange = {
              ...parsed,
              timestamp: new Date(parsed.timestamp)
            };
            
            // Verify all fields
            expect(restored.flag).toBe(change.flag);
            expect(restored.oldValue).toBe(change.oldValue);
            expect(restored.newValue).toBe(change.newValue);
            expect(restored.reason).toBe(change.reason);
            expect(restored.timestamp.getTime()).toBe(change.timestamp.getTime());
            expect(restored.userId).toBe(change.userId);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: FeatureFlagManager change history should serialize correctly
     */
    it('should preserve change history through serialization', () => {
      return fc.assert(
        fc.property(
          fc.array(createFeatureFlagChangeArb(), { minLength: 1, maxLength: 20 }),
          (changes) => {
            // Create manager and simulate changes (use config source to bypass security)
            const manager = new FeatureFlagManager();
            
            for (const change of changes) {
              manager.setFlag(change.flag, change.newValue, 'config', change.reason, change.userId);
            }
            
            // Get change history - use getHistory() not getChangeHistory()
            const history = manager.getHistory();
            
            // Serialize
            const serializable = history.map(h => ({
              ...h,
              timestamp: h.timestamp.toISOString()
            }));
            const json = JSON.stringify(serializable);
            
            // Deserialize
            const parsed = JSON.parse(json) as Array<{
              flag: string;
              oldValue: boolean;
              newValue: boolean;
              reason: string;
              userId?: string;
              timestamp: string;
              source?: 'config' | 'environment' | 'runtime' | 'api';
            }>;
            
            // Verify count (may be less if duplicates were collapsed)
            expect(parsed.length).toBeGreaterThan(0);
            
            // Verify all serialized changes are in history
            for (const p of parsed) {
              const found = history.find(h => 
                h.flag === p.flag && 
                h.newValue === p.newValue &&
                h.timestamp.toISOString() === p.timestamp
              );
              expect(found).toBeDefined();
            }
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 8: ScopeViolationAttempt Serialization', () => {
    /**
     * Property: ScopeViolationAttempt must preserve all fields through serialization
     * 
     * ScopeViolationAttempt includes nested ScopeContext with Set, plus
     * Date and optional fields.
     */
    it('should preserve ScopeViolationAttempt through JSON round-trip', () => {
      return fc.assert(
        fc.property(
          createViolationAttemptArb(),
          (violation) => {
            // Serialize (handle Date and Set)
            const serializable = {
              capabilityId: violation.capabilityId,
              scopeTag: violation.scopeTag,
              context: {
                releaseBranch: violation.context.releaseBranch,
                featureFlags: Array.from(violation.context.featureFlags),
                environment: violation.context.environment
              },
              stackTrace: violation.stackTrace,
              userId: violation.userId,
              sessionId: violation.sessionId,
              timestamp: violation.timestamp.toISOString()
            };
            const json = JSON.stringify(serializable);
            
            // Deserialize
            const parsed = JSON.parse(json);
            const restored: ScopeViolationAttempt = {
              capabilityId: parsed.capabilityId,
              scopeTag: parsed.scopeTag,
              context: {
                releaseBranch: parsed.context.releaseBranch,
                featureFlags: new Set(parsed.context.featureFlags),
                environment: parsed.context.environment
              },
              stackTrace: parsed.stackTrace,
              userId: parsed.userId,
              sessionId: parsed.sessionId,
              timestamp: new Date(parsed.timestamp)
            };
            
            // Verify all fields
            expect(restored.capabilityId).toBe(violation.capabilityId);
            expect(restored.scopeTag).toBe(violation.scopeTag);
            expect(restored.context.releaseBranch).toBe(violation.context.releaseBranch);
            expect(restored.context.environment).toBe(violation.context.environment);
            expect(restored.context.featureFlags.size).toBe(violation.context.featureFlags.size);
            expect(restored.stackTrace).toBe(violation.stackTrace);
            expect(restored.userId).toBe(violation.userId);
            expect(restored.sessionId).toBe(violation.sessionId);
            expect(restored.timestamp.getTime()).toBe(violation.timestamp.getTime());
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 8: Cross-Model Serialization Consistency', () => {
    /**
     * Property: Serialization should be consistent across multiple operations
     * 
     * When the same data is serialized multiple times, it should produce
     * identical results.
     */
    it('should produce consistent serialization for same data', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb(),
          (capability) => {
            // Serialize multiple times
            const json1 = JSON.stringify(capability);
            const json2 = JSON.stringify(capability);
            const json3 = JSON.stringify(capability);
            
            // All should be identical
            expect(json1).toBe(json2);
            expect(json2).toBe(json3);
            
            // Parse and verify consistency
            const parsed1 = JSON.parse(json1);
            const parsed2 = JSON.parse(json2);
            
            expect(parsed1).toEqual(parsed2);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Multiple round-trips should produce identical results
     * 
     * Data that goes through multiple serialize/deserialize cycles
     * should remain consistent.
     */
    it('should remain consistent through multiple round-trips', () => {
      return fc.assert(
        fc.property(
          createCapabilityArb(),
          (original) => {
            let data = original;
            
            // Do 3 round-trips
            for (let i = 0; i < 3; i++) {
              const json = JSON.stringify(data);
              data = JSON.parse(json) as CapabilityDefinition;
            }
            
            // Should still match original
            expect(data.id).toBe(original.id);
            expect(data.displayName).toBe(original.displayName);
            expect(data.scopeTag).toBe(original.scopeTag);
            expect(data.description).toBe(original.description);
            
            return true;
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 8: Edge Cases in Serialization', () => {
    /**
     * Property: Should handle Unicode characters correctly
     */
    it('should preserve Unicode characters through serialization', () => {
      const capability: CapabilityDefinition = {
        id: 'unicode-capability',
        displayName: '中文能力 🔒',
        scopeTag: 'p0',
        entryPoints: ['入口点1', 'entry_point_2'],
        dependencies: [],
        description: '描述 with emoji 🎉'
      };
      
      const json = JSON.stringify(capability);
      const parsed = JSON.parse(json) as CapabilityDefinition;
      
      expect(parsed.displayName).toBe(capability.displayName);
      expect(parsed.entryPoints).toEqual(capability.entryPoints);
      expect(parsed.description).toBe(capability.description);
      
      return true;
    });

    /**
     * Property: Should handle very long strings correctly
     */
    it('should preserve very long strings through serialization', () => {
      return fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 2000 }),
          (longString) => {
            const capability: CapabilityDefinition = {
              id: 'long-cap',
              displayName: longString,
              scopeTag: 'p0',
              entryPoints: [],
              dependencies: [],
              description: longString
            };
            
            const json = JSON.stringify(capability);
            const parsed = JSON.parse(json) as CapabilityDefinition;
            
            expect(parsed.displayName).toBe(longString);
            expect(parsed.description).toBe(longString);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property: Should handle empty arrays correctly
     */
    it('should preserve empty arrays through serialization', () => {
      const capability: CapabilityDefinition = {
        id: 'empty-arrays',
        displayName: 'Test',
        scopeTag: 'p0',
        entryPoints: [],
        dependencies: []
      };
      
      const json = JSON.stringify(capability);
      const parsed = JSON.parse(json) as CapabilityDefinition;
      
      expect(parsed.entryPoints).toEqual([]);
      expect(parsed.dependencies).toEqual([]);
      
      return true;
    });

    /**
     * Property: Should handle Date objects that are not JSON serializable
     */
    it('should preserve Date objects through serialization with ISO conversion', () => {
      const now = new Date();
      
      const change: FeatureFlagChange = {
        flag: 'test-flag',
        oldValue: false,
        newValue: true,
        reason: 'Test',
        timestamp: now
      };
      
      // Manual serialization with Date handling
      const serializable = {
        ...change,
        timestamp: change.timestamp.toISOString()
      };
      
      const json = JSON.stringify(serializable);
      const parsed = JSON.parse(json);
      
      const restored: FeatureFlagChange = {
        ...parsed,
        timestamp: new Date(parsed.timestamp)
      };
      
      expect(restored.timestamp.getTime()).toBe(now.getTime());
      
      return true;
    });
  });
});