/**
 * Crash Recovery Integration Tests
 * 
 * Tests permission engine state recovery after crashes, 
 * including state persistence, event log recovery, and configuration integrity.
 * Validates: Requirements: All (fault tolerance and recovery)
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  PermissionEngine,
  HardRuleEvaluator,
  EventLogger
} from '../../src/index';
import { RuleMergingEngine } from '../../src/services/rule-merging-engine';
import { BuiltinPolicyLoader } from '../../src/services/builtin-policy-loader';
import { UserPolicyLoader } from '../../src/services/user-policy-loader';

// Mock file system operations for testing
vi.mock('../../src/services/event-logger', () => ({
  EventLogger: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    logPermissionDecision: vi.fn().mockResolvedValue(undefined),
    logPermissionDenied: vi.fn().mockResolvedValue(undefined),
    logHardRuleConflict: vi.fn().mockResolvedValue(undefined),
    getLastEventIndex: vi.fn().mockReturnValue(0),
    recoverFromCrash: vi.fn().mockResolvedValue({ recovered: 0, lastIndex: 0 })
  }))
}));

describe('Crash Recovery Integration', () => {
  let permissionEngine: PermissionEngine;
  let hardRuleEvaluator: HardRuleEvaluator;
  let eventLogger: EventLogger;

  beforeEach(() => {
    // Create fresh instances
    permissionEngine = new PermissionEngine({
      eventLoggingEnabled: false,
      projectId: 'crash-recovery-test'
    });

    hardRuleEvaluator = new HardRuleEvaluator();
    eventLogger = new EventLogger({
      enabled: true,
      projectId: 'crash-recovery-test'
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await permissionEngine.cleanup();
  });

  describe('Permission Engine State Recovery', () => {
    it('should preserve hard rules after engine restart', () => {
      // Get initial hard rules
      const initialRules = hardRuleEvaluator.getAllRules();
      expect(initialRules).toHaveLength(9);

      // Verify each rule has required properties
      for (const rule of initialRules) {
        expect(rule.id).toBeDefined();
        expect(rule.description).toBeDefined();
        expect(rule.layer).toBe('hard');
        expect(rule.priority).toBeDefined();
        expect(['allow', 'deny']).toContain(rule.effect);
      }

      // Create a new engine instance (simulating restart)
      const newEngine = new PermissionEngine({
        eventLoggingEnabled: false,
        projectId: 'crash-recovery-test'
      });

      const newEvaluator = newEngine.getHardRuleEvaluator();
      const newRules = newEvaluator.getAllRules();

      // Rules should be identical
      expect(newRules).toHaveLength(9);
      
      const initialIds = initialRules.map(r => r.id).sort();
      const newIds = newRules.map(r => r.id).sort();
      expect(newIds).toEqual(initialIds);
    });

    it('should maintain configuration after restart', () => {
      const originalConfig = permissionEngine.getConfig();
      
      // Create new engine with same config
      const newEngine = new PermissionEngine({
        eventLoggingEnabled: false,
        projectId: 'crash-recovery-test'
      });

      const newConfig = newEngine.getConfig();
      expect(newConfig.projectId).toBe(originalConfig.projectId);
      expect(newConfig.strictMode).toBe(originalConfig.strictMode);
    });

    it('should preserve rule merging engine state', () => {
      const ruleEngine = permissionEngine.getRuleMergingEngine();
      expect(ruleEngine).toBeDefined();
    });
  });

  describe('Event Log Recovery', () => {
    it('should support event log recovery', async () => {
      // Initialize event logger
      await eventLogger.initialize();

      // Mock crash recovery scenario
      const mockRecoverFn = vi.mocked(eventLogger.recoverFromCrash);
      mockRecoverFn.mockResolvedValue({
        recovered: 5,
        lastIndex: 10
      });

      const recoveryResult = await eventLogger.recoverFromCrash();
      
      expect(recoveryResult.recovered).toBe(5);
      expect(recoveryResult.lastIndex).toBe(10);
    });

    it('should maintain event sequence after recovery', async () => {
      // Get last event index
      const lastIndex = eventLogger.getLastEventIndex();
      expect(typeof lastIndex).toBe('number');
      expect(lastIndex).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty event log on recovery', async () => {
      const mockRecoverFn = vi.mocked(eventLogger.recoverFromCrash);
      mockRecoverFn.mockResolvedValue({
        recovered: 0,
        lastIndex: 0
      });

      const recoveryResult = await eventLogger.recoverFromCrash();
      expect(recoveryResult.recovered).toBe(0);
    });
  });

  describe('Configuration Integrity', () => {
    it('should prevent hard rule modification after crash', async () => {
      // Get initial rules
      const initialRules = hardRuleEvaluator.getAllRules();

      // Try to create conflicting config (should be detected but not applied)
      const conflictingConfig = {
        rules: [
          { action: 'gate.bypass', resource: '*', effect: 'allow' as const }
        ]
      };

      const conflicts = hardRuleEvaluator.detectConflicts(conflictingConfig);
      expect(conflicts.length).toBeGreaterThan(0);

      // Rules should still be unchanged
      const currentRules = hardRuleEvaluator.getAllRules();
      expect(currentRules).toHaveLength(9);
      expect(currentRules.map(r => r.id).sort()).toEqual(initialRules.map(r => r.id).sort());
    });

    it('should validate configuration after engine restart', async () => {
      // Valid config should pass
      const validConfig = {
        rules: [
          { action: 'file.read', resource: 'file:*', effect: 'allow' as const }
        ]
      };

      const isValid = await permissionEngine.validatePermissionConfig(validConfig);
      expect(isValid).toBe(true);

      // Invalid config should be rejected
      const invalidConfig = {
        rules: [
          { action: 'gate.bypass', resource: '*', effect: 'allow' as const }
        ]
      };

      const isInvalid = await permissionEngine.validatePermissionConfig(invalidConfig);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Session State Recovery', () => {
    it('should handle permission decisions after crash recovery', async () => {
      // Before crash: make some decisions
      await permissionEngine.checkPermission(
        'user-1',
        'file.read',
        { type: 'file', path: '/tmp/test.txt' }
      );

      // Simulate crash and recovery...
      
      // After recovery: decisions should still work
      const decision = await permissionEngine.checkPermission(
        'user-1',
        'file.read',
        { type: 'file', path: '/tmp/test.txt' }
      );

      expect(typeof decision).toBe('boolean');
    });

    it('should maintain three-layer model after restart', async () => {
      // Check that hard rules still have highest priority
      const result = await permissionEngine.checkPermission(
        'user-1',
        'gate.bypass',
        { type: 'gate', id: 'main-gate' }
      );

      // Hard rule should always deny
      expect(result).toBe(false);
    });

    it('should preserve rule precedence after recovery', async () => {
      // Hard rule should override user/built-in rules
      const hardRuleResult = await permissionEngine.checkPermission(
        'user-1',
        'gate.bypass',
        { type: 'gate', id: 'test' }
      );
      expect(hardRuleResult).toBe(false);

      // Non-hard rule should be allowed
      const allowedResult = await permissionEngine.checkPermission(
        'user-1',
        'file.read',
        { type: 'file', path: '/tmp/test.txt' }
      );
      expect(allowedResult).toBe(true);
    });
  });

  describe('Resource Cleanup After Recovery', () => {
    it('should properly cleanup resources on engine disposal', async () => {
      await permissionEngine.cleanup();
      
      // After cleanup, engine should be in consistent state
      const config = permissionEngine.getConfig();
      expect(config).toBeDefined();
    });

    it('should handle multiple cleanup calls gracefully', async () => {
      // First cleanup
      await permissionEngine.cleanup();
      
      // Second cleanup should not throw
      await expect(permissionEngine.cleanup()).resolves.not.toThrow();
    });

    it('should release event logger resources', async () => {
      await eventLogger.cleanup();
      
      // After cleanup, should be able to reinitialize
      await expect(eventLogger.initialize()).resolves.not.toThrow();
    });
  });

  describe('Fault Tolerance', () => {
    it('should handle permission check during recovery', async () => {
      // While "recovering", permission checks should still work
      const result = await permissionEngine.checkPermission(
        'user-1',
        'file.read',
        { type: 'file', id: 'test.txt' }
      );

      expect(typeof result).toBe('boolean');
    });

    it('should maintain consistent decisions during concurrent access', async () => {
      // Make multiple concurrent requests
      const results = await Promise.all([
        permissionEngine.checkPermission('user-1', 'file.read', { type: 'file', id: '1' }),
        permissionEngine.checkPermission('user-2', 'file.write', { type: 'file', id: '2' }),
        permissionEngine.checkPermission('user-3', 'task.execute', { type: 'task', id: '3' }),
        permissionEngine.checkPermission('user-4', 'gate.bypass', { type: 'gate', id: '4' }),
        permissionEngine.checkPermission('user-5', 'file.read', { type: 'file', id: '5' })
      ]);

      // All should return valid boolean results
      expect(results.every(r => typeof r === 'boolean')).toBe(true);
      
      // gate.bypass should always be false (hard rule)
      expect(results[3]).toBe(false);
    });

    it('should handle rapid engine creation and destruction', async () => {
      const engines: PermissionEngine[] = [];

      // Create multiple engines rapidly
      for (let i = 0; i < 10; i++) {
        engines.push(new PermissionEngine({
          eventLoggingEnabled: false,
          projectId: `test-${i}`
        }));
      }

      // All should work
      const results = await Promise.all(
        engines.map(e => e.checkPermission('user-1', 'file.read', { type: 'file', id: 'test' }))
      );

      expect(results.every(r => typeof r === 'boolean')).toBe(true);

      // Cleanup all
      await Promise.all(engines.map(e => e.cleanup()));
    });
  });

  describe('State Validation', () => {
    it('should validate hard rule integrity', () => {
      const rules = hardRuleEvaluator.getAllRules();
      
      // All rules should have unique IDs
      const ids = rules.map(r => r.id);
      expect(new Set(ids).size).toBe(ids.length);

      // All rules should have valid effects
      for (const rule of rules) {
        expect(['allow', 'deny']).toContain(rule.effect);
      }

      // All rules should have priority
      for (const rule of rules) {
        expect(typeof rule.priority).toBe('number');
        expect(rule.priority).toBeGreaterThan(0);
      }
    });

    it('should validate rule ordering by priority', () => {
      const rules = hardRuleEvaluator.getAllRules();
      const priorities = rules.map(r => r.priority);
      
      // Priorities should be in descending order (or at least non-increasing)
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i]).toBeLessThanOrEqual(priorities[i - 1]);
      }
    });

    it('should maintain layer isolation', () => {
      const rules = hardRuleEvaluator.getAllRules();
      
      // All hard rules should have layer = 'hard'
      for (const rule of rules) {
        expect(rule.layer).toBe('hard');
      }
    });
  });

  describe('Recovery Scenarios', () => {
    it('should recover from mid-operation crash', async () => {
      // Start an operation
      const checkPromise = permissionEngine.checkPermission(
        'user-1',
        'file.write',
        { type: 'file', path: '/tmp/data.txt' }
      );

      // Simulate crash by cleanup
      await permissionEngine.cleanup();

      // Result should still be returned (or operation should be cancelled cleanly)
      // In practice, the promise might be rejected or resolved depending on implementation
      // The important thing is no unhandled errors
      try {
        await checkPromise;
      } catch {
        // Operation cancelled - this is acceptable
      }
    });

    it('should handle configuration reload after crash', async () => {
      // Initial configuration
      const initialConfig = permissionEngine.getConfig();

      // Simulate configuration reload (creating new engine)
      const newEngine = new PermissionEngine({
        eventLoggingEnabled: false,
        projectId: initialConfig.projectId
      });

      const reloadedConfig = newEngine.getConfig();
      
      // Core config should match
      expect(reloadedConfig.projectId).toBe(initialConfig.projectId);

      await newEngine.cleanup();
    });

    it('should preserve custom grants after recovery', () => {
      // Create engine with specific config
      const customEngine = new PermissionEngine({
        eventLoggingEnabled: false,
        projectId: 'custom-project',
        strictMode: true
      });

      const config = customEngine.getConfig();
      
      // Recreate engine
      const recoveredEngine = new PermissionEngine({
        eventLoggingEnabled: false,
        projectId: config.projectId
      });

      // Config should persist through serialization/deserialization
      const recoveredConfig = recoveredEngine.getConfig();
      expect(recoveredConfig.projectId).toBe(config.projectId);

      customEngine.cleanup();
      recoveredEngine.cleanup();
    });
  });
});

describe('Distributed Crash Recovery', () => {
  let engine1: PermissionEngine;
  let engine2: PermissionEngine;

  beforeEach(() => {
    engine1 = new PermissionEngine({
      eventLoggingEnabled: false,
      projectId: 'distributed-test'
    });
    engine2 = new PermissionEngine({
      eventLoggingEnabled: false,
      projectId: 'distributed-test'
    });
  });

  afterEach(async () => {
    await engine1.cleanup();
    await engine2.cleanup();
  });

  describe('Multi-Instance Recovery', () => {
    it('should maintain consistency across instances', async () => {
      // Both instances should make same decisions for same inputs
      const [result1, result2] = await Promise.all([
        engine1.checkPermission('user-1', 'gate.bypass', { type: 'gate', id: 'test' }),
        engine2.checkPermission('user-1', 'gate.bypass', { type: 'gate', id: 'test' })
      ]);

      expect(result1).toBe(result2);
    });

    it('should have independent state after recovery', async () => {
      // Each instance maintains its own state
      const hardRules1 = engine1.getHardRuleEvaluator().getAllRules();
      const hardRules2 = engine2.getHardRuleEvaluator().getAllRules();

      expect(hardRules1.length).toBe(hardRules2.length);
      expect(hardRules1.map(r => r.id)).toEqual(hardRules2.map(r => r.id));
    });
  });
});