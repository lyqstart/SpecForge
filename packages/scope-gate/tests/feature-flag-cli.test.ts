/**
 * Tests for Feature Flag CLI Management Tool
 * 
 * Tests the feature-flag.ts CLI tool's management capabilities:
 * - Enable/disable specific feature flags
 * - Batch operations (enable/disable by scope)
 * - View all flag status
 * - Persistence (save/load)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureFlagManager, type FeatureFlag } from '../src/feature-flag-manager.js';
import type { ScopeTag } from '../src/types.js';

describe('Feature Flag Management - CLI Features', () => {
  let flagManager: FeatureFlagManager;

  beforeEach(() => {
    flagManager = new FeatureFlagManager();
    
    // Register test capabilities with different scope tags
    flagManager.registerCapability('capability_p0', 'p0');
    flagManager.registerCapability('capability_p1', 'p1');
    flagManager.registerCapability('capability_p2', 'p2');
    flagManager.registerCapability('workflow_runtime', 'p1');
    flagManager.registerCapability('knowledge_graph', 'p2');
  });

  describe('Enable/Disable Specific Flags', () => {
    it('should enable a specific flag', () => {
      const result = flagManager.enable('enable_capability_p1', 'test');
      expect(result).toBe(true);
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(true);
    });

    it('should disable a specific flag', () => {
      flagManager.enable('enable_capability_p1');
      const result = flagManager.disable('enable_capability_p1', 'test');
      expect(result).toBe(true);
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(false);
    });

    it('should handle enable for non-existent flag - creates new flag', () => {
      // FeatureFlagManager auto-creates flags when they don't exist
      const result = flagManager.enable('enable_nonexistent', 'test');
      expect(result).toBe(true);
      // The flag should now exist and be enabled
      expect(flagManager.isEnabled('enable_nonexistent')).toBe(true);
    });

    it('should handle case-insensitive flag names', () => {
      flagManager.enable('ENABLE_CAPABILITY_P1', 'test');
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(true);
      expect(flagManager.isEnabled('ENABLE_CAPABILITY_P1')).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    it('should enable all flags by scope (P1)', () => {
      // Register more P1 capabilities
      flagManager.registerCapability('another_p1_cap', 'p1');
      
      const count = flagManager.enableByScope('p1', 'batch enable');
      
      expect(count).toBeGreaterThanOrEqual(2);
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(true);
      expect(flagManager.isEnabled('enable_workflow_runtime')).toBe(true);
    });

    it('should enable all flags by scope (P2)', () => {
      const count = flagManager.enableByScope('p2', 'batch enable');
      
      expect(count).toBe(2); // capability_p2, knowledge_graph
      expect(flagManager.isEnabled('enable_capability_p2')).toBe(true);
      expect(flagManager.isEnabled('enable_knowledge_graph')).toBe(true);
    });

    it('should disable all flags by scope', () => {
      flagManager.enableByScope('p1');
      const count = flagManager.disableByScope('p1', 'batch disable');
      
      expect(count).toBeGreaterThan(0);
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(false);
    });

    it('should return zero count for unknown scope', () => {
      const count = flagManager.enableByScope('unknown' as ScopeTag, 'test');
      expect(count).toBe(0);
    });
  });

  describe('View All Flag Status', () => {
    it('should get all flags', () => {
      flagManager.enable('enable_capability_p1');
      
      const allFlags = flagManager.getAll();
      
      expect(allFlags.length).toBeGreaterThan(0);
      expect(allFlags.some(f => f.name === 'enable_capability_p1')).toBe(true);
    });

    it('should get only enabled flags', () => {
      flagManager.enable('enable_capability_p1');
      flagManager.enable('enable_capability_p2');
      
      const enabledFlags = flagManager.getEnabled();
      
      expect(enabledFlags.length).toBe(2);
      expect(enabledFlags.every(f => f.enabled)).toBe(true);
    });

    it('should get statistics', () => {
      flagManager.enable('enable_capability_p1');
      flagManager.enable('enable_capability_p2');
      
      const stats = flagManager.getStats();
      
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.enabled).toBe(2);
      expect(stats.p1Count).toBe(2);
      expect(stats.p2Count).toBe(2);
    });
  });

  describe('Persistence', () => {
    it('should export flags as object', () => {
      flagManager.enable('enable_capability_p1');
      flagManager.enable('enable_capability_p2');
      
      const exported = flagManager.export();
      
      expect(typeof exported).toBe('object');
      expect(exported['enable_capability_p1']).toBe(true);
      expect(exported['enable_capability_p2']).toBe(true);
    });

    it('should import flags from object', () => {
      flagManager.import({
        'enable_capability_p1': true,
        'enable_capability_p2': false,
        'enable_capability_p0': true
      }, 'import test');
      
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(true);
      expect(flagManager.isEnabled('enable_capability_p2')).toBe(false);
      expect(flagManager.isEnabled('enable_capability_p0')).toBe(true);
    });

    it('should track change history', () => {
      flagManager.enable('enable_capability_p1', 'first enable');
      flagManager.disable('enable_capability_p1', 'first disable');
      flagManager.enable('enable_capability_p1', 'second enable');
      
      const history = flagManager.getHistory();
      
      expect(history.length).toBe(3);
      expect(history[0].flag).toBe('enable_capability_p1');
      expect(history[0].newValue).toBe(true);
      expect(history[1].newValue).toBe(false);
      expect(history[2].newValue).toBe(true);
    });

    it('should get history for specific flag', () => {
      flagManager.enable('enable_capability_p1', 'first');
      flagManager.enable('enable_capability_p2', 'other');
      flagManager.disable('enable_capability_p1', 'second');
      
      const history = flagManager.getHistoryForFlag('enable_capability_p1');
      
      expect(history.length).toBe(2);
      expect(history.every(h => h.flag === 'enable_capability_p1')).toBe(true);
    });

    it('should clear history', () => {
      flagManager.enable('enable_capability_p1');
      flagManager.disable('enable_capability_p1');
      
      flagManager.clearHistory();
      
      const history = flagManager.getHistory();
      expect(history.length).toBe(0);
    });

    it('should reset all flags', () => {
      flagManager.enable('enable_capability_p1');
      flagManager.enable('enable_capability_p2');
      flagManager.enable('enable_capability_p0');
      
      flagManager.reset('reset test');
      
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(false);
      expect(flagManager.isEnabled('enable_capability_p2')).toBe(false);
      expect(flagManager.isEnabled('enable_capability_p0')).toBe(false);
    });
  });

  describe('Master Flags', () => {
    it('should enable all P1/P2 with enable_all_p1p2', () => {
      // First enable master flag
      flagManager.enable('enable_all_p1p2', 'master enable');
      
      // Should enable all P1 and P2 capabilities
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(true);
      expect(flagManager.isEnabled('enable_capability_p2')).toBe(true);
      expect(flagManager.isEnabled('enable_capability_p0')).toBe(false);
    });

    it('should enable only P1 with enable_all_p1', () => {
      flagManager.enable('enable_all_p1', 'master p1');
      
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(true);
      expect(flagManager.isEnabled('enable_capability_p2')).toBe(false);
    });

    it('should enable only P2 with enable_all_p2', () => {
      flagManager.enable('enable_all_p2', 'master p2');
      
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(false);
      expect(flagManager.isEnabled('enable_capability_p2')).toBe(true);
    });

    it('should check capability enabled status correctly', () => {
      flagManager.enable('enable_capability_p1');
      
      expect(flagManager.isCapabilityEnabled('capability_p1')).toBe(true);
      expect(flagManager.isCapabilityEnabled('capability_p2')).toBe(false);
    });
  });

  describe('Toggle functionality', () => {
    it('should toggle flag from disabled to enabled', () => {
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(false);
      
      // Simulate toggle
      const currentState = flagManager.isEnabled('enable_capability_p1');
      if (currentState) {
        flagManager.disable('enable_capability_p1', 'toggle');
      } else {
        flagManager.enable('enable_capability_p1', 'toggle');
      }
      
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(true);
    });

    it('should toggle flag from enabled to disabled', () => {
      flagManager.enable('enable_capability_p1');
      
      const currentState = flagManager.isEnabled('enable_capability_p1');
      if (currentState) {
        flagManager.disable('enable_capability_p1', 'toggle');
      } else {
        flagManager.enable('enable_capability_p1', 'toggle');
      }
      
      expect(flagManager.isEnabled('enable_capability_p1')).toBe(false);
    });
  });

  describe('Capability Registration', () => {
    it('should register capability with scope tag', () => {
      flagManager.registerCapability('new_capability', 'p1');
      
      const flag = flagManager.get('enable_new_capability');
      expect(flag).toBeDefined();
      expect(flag?.scopeTag).toBe('p1');
    });

    it('should preserve existing flag state when re-registering', () => {
      flagManager.enable('enable_test_cap');
      flagManager.registerCapability('test_cap', 'p1');
      
      // State should be preserved
      expect(flagManager.isEnabled('enable_test_cap')).toBe(true);
    });
  });
});