/**
 * Unit tests for FeatureFlagManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureFlagManager, createFeatureFlagManager } from '../src/feature-flag-manager.js';
import type { ScopeConfiguration } from '../src/types.js';

describe('FeatureFlagManager', () => {
  let manager: FeatureFlagManager;

  beforeEach(() => {
    manager = new FeatureFlagManager();
  });

  describe('enable/disable', () => {
    it('should enable a flag', () => {
      manager.enable('test_flag');
      expect(manager.isEnabled('test_flag')).toBe(true);
    });

    it('should disable a flag', () => {
      manager.enable('test_flag');
      manager.disable('test_flag');
      expect(manager.isEnabled('test_flag')).toBe(false);
    });

    it('should handle enable with reason and userId', () => {
      manager.enable('test_flag', 'Testing enable', 'user-123');
      const flag = manager.get('test_flag');
      expect(flag?.updatedBy).toBe('user-123');
    });

    it('should handle disable with reason and userId', () => {
      manager.enable('test_flag');
      manager.disable('test_flag', 'Testing disable', 'user-456');
      const history = manager.getHistoryForFlag('test_flag');
      expect(history[history.length - 1]?.userId).toBe('user-456');
    });
  });

  describe('isEnabled', () => {
    it('should return false for non-existent flags', () => {
      expect(manager.isEnabled('nonexistent')).toBe(false);
    });

    it('should return true for enabled flags', () => {
      manager.enable('my_feature');
      expect(manager.isEnabled('my_feature')).toBe(true);
    });

    it('should be case-insensitive', () => {
      manager.enable('My_Feature');
      expect(manager.isEnabled('MY_FEATURE')).toBe(true);
      expect(manager.isEnabled('my_feature')).toBe(true);
    });

    it('should trim whitespace', () => {
      manager.enable('  my_feature  ');
      expect(manager.isEnabled('my_feature')).toBe(true);
    });
  });

  describe('getAll and get', () => {
    it('should get all flags', () => {
      manager.enable('flag_a');
      manager.enable('flag_b');
      const all = manager.getAll();
      expect(all.length).toBe(2);
    });

    it('should get a specific flag', () => {
      manager.enable('my_flag');
      const flag = manager.get('my_flag');
      expect(flag?.name).toBe('my_flag');
      expect(flag?.enabled).toBe(true);
    });

    it('should return undefined for non-existent flag', () => {
      const flag = manager.get('nonexistent');
      expect(flag).toBeUndefined();
    });

    it('should get all enabled flags', () => {
      manager.enable('enabled_1');
      manager.enable('enabled_2');
      manager.disable('disabled_1');
      const enabled = manager.getEnabled();
      expect(enabled.length).toBe(2);
    });
  });

  describe('history', () => {
    it('should record change history', () => {
      manager.enable('test_flag');
      const history = manager.getHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history.some(h => h.flag === 'test_flag')).toBe(true);
    });

    it('should not record redundant changes', () => {
      manager.enable('test_flag');
      const historyLength = manager.getHistory().length;
      manager.enable('test_flag'); // Same value, should not create new entry
      expect(manager.getHistory().length).toBe(historyLength);
    });

    it('should get history for specific flag', () => {
      manager.enable('flag_a');
      manager.enable('flag_b');
      manager.enable('flag_a');
      const history = manager.getHistoryForFlag('flag_a');
      expect(history.length).toBe(1); // Only one change for flag_a
    });

    it('should clear history', () => {
      manager.enable('test_flag');
      manager.clearHistory();
      expect(manager.getHistory().length).toBe(0);
    });
  });

  describe('per-capability flags', () => {
    it('should support enable_{capabilityId} format', () => {
      manager.enable('enable_workflow_runtime');
      expect(manager.isEnabled('enable_workflow_runtime')).toBe(true);
    });

    it('should check isCapabilityEnabled', () => {
      manager.enable('enable_my_capability');
      expect(manager.isCapabilityEnabled('my_capability')).toBe(true);
    });

    it('should return false for non-enabled capability', () => {
      expect(manager.isCapabilityEnabled('my_capability')).toBe(false);
    });
  });

  describe('master flags', () => {
    it('should support enable_all_p1p2 master flag', () => {
      // Register capabilities with scope tags
      manager.registerCapability('cap_p1', 'p1');
      manager.registerCapability('cap_p2', 'p2');
      
      // Enable master flag
      manager.enable('enable_all_p1p2');
      
      expect(manager.isEnabled('enable_cap_p1')).toBe(true);
      expect(manager.isEnabled('enable_cap_p2')).toBe(true);
    });

    it('should support enable_all_p1 master flag', () => {
      manager.registerCapability('cap_p1', 'p1');
      manager.registerCapability('cap_p2', 'p2');
      
      manager.enable('enable_all_p1');
      
      expect(manager.isEnabled('enable_cap_p1')).toBe(true);
      expect(manager.isEnabled('enable_cap_p2')).toBe(false);
    });

    it('should support enable_all_p2 master flag', () => {
      manager.registerCapability('cap_p1', 'p1');
      manager.registerCapability('cap_p2', 'p2');
      
      manager.enable('enable_all_p2');
      
      expect(manager.isEnabled('enable_cap_p1')).toBe(false);
      expect(manager.isEnabled('enable_cap_p2')).toBe(true);
    });
  });

  describe('registerCapability', () => {
    it('should register capability with scope tag', () => {
      manager.registerCapability('my_capability', 'p1');
      const flag = manager.get('enable_my_capability');
      expect(flag?.scopeTag).toBe('p1');
    });

    it('should preserve existing flag state when registering', () => {
      manager.enable('enable_my_capability');
      manager.registerCapability('my_capability', 'p1');
      const flag = manager.get('enable_my_capability');
      expect(flag?.enabled).toBe(true);
      expect(flag?.scopeTag).toBe('p1');
    });
  });

  describe('bulk operations', () => {
    it('should enable by scope', () => {
      manager.registerCapability('cap1', 'p1');
      manager.registerCapability('cap2', 'p1');
      manager.registerCapability('cap3', 'p2');
      
      const count = manager.enableByScope('p1');
      expect(count).toBe(2);
      expect(manager.isEnabled('enable_cap1')).toBe(true);
      expect(manager.isEnabled('enable_cap2')).toBe(true);
      expect(manager.isEnabled('enable_cap3')).toBe(false);
    });

    it('should disable by scope', () => {
      manager.registerCapability('cap1', 'p1');
      manager.registerCapability('cap2', 'p1');
      manager.enable('enable_cap1');
      manager.enable('enable_cap2');
      
      const count = manager.disableByScope('p1');
      expect(count).toBe(2);
      expect(manager.isEnabled('enable_cap1')).toBe(false);
      expect(manager.isEnabled('enable_cap2')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all enabled flags', () => {
      manager.enable('flag_a');
      manager.enable('flag_b');
      manager.enable('flag_c');
      
      manager.reset();
      
      expect(manager.isEnabled('flag_a')).toBe(false);
      expect(manager.isEnabled('flag_b')).toBe(false);
      expect(manager.isEnabled('flag_c')).toBe(false);
    });
  });

  describe('import/export', () => {
    it('should export flags', () => {
      manager.enable('flag_a');
      manager.disable('flag_b');
      const exported = manager.export();
      expect(exported.flag_a).toBe(true);
      expect(exported.flag_b).toBe(false);
    });

    it('should import flags', () => {
      manager.import({ imported_a: true, imported_b: false });
      expect(manager.isEnabled('imported_a')).toBe(true);
      expect(manager.isEnabled('imported_b')).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should get stats', () => {
      manager.enable('flag_a');
      manager.registerCapability('cap_p1', 'p1');
      manager.registerCapability('cap_p2', 'p2');
      manager.enable('enable_cap_p1');
      
      const stats = manager.getStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.enabled).toBe(2);
      expect(stats.p1Count).toBe(1);
      expect(stats.p2Count).toBe(1);
    });
  });

  describe('createScopeContext', () => {
    it('should create scope context with enabled flags', () => {
      manager.enable('flag_a');
      manager.enable('flag_b');
      
      const context = manager.createScopeContext();
      expect(context.featureFlags.has('flag_a')).toBe(true);
      expect(context.featureFlags.has('flag_b')).toBe(true);
    });

    it('should allow overrides', () => {
      manager.enable('flag_a');
      const context = manager.createScopeContext({ 
        releaseBranch: 'v6.1',
        environment: 'development'
      });
      expect(context.releaseBranch).toBe('v6.1');
      expect(context.environment).toBe('development');
    });
  });

  describe('createFeatureFlagManager factory', () => {
    it('should create manager with initial flags', () => {
      const mgr = createFeatureFlagManager({
        initialFlags: { flag_a: true, flag_b: false }
      });
      expect(mgr.isEnabled('flag_a')).toBe(true);
      expect(mgr.isEnabled('flag_b')).toBe(false);
    });

    it('should create manager with configuration', () => {
      const config: ScopeConfiguration = {
        schema_version: "1.0",
        enforcementMode: "strict",
        defaultContext: {
          releaseBranch: "v6.0",
          environment: "production"
        },
        environmentDefaults: {
          production: { enforcementMode: "strict", allowP1: false, allowP2: false, defaultFeatureFlags: {} },
          staging: { enforcementMode: "warning", allowP1: false, allowP2: false, defaultFeatureFlags: {} },
          development: { enforcementMode: "warning", allowP1: true, allowP2: true, defaultFeatureFlags: {} },
          test: { enforcementMode: "disabled", allowP1: true, allowP2: true, defaultFeatureFlags: {} }
        },
        featureFlags: {
          config_flag: { description: 'Test flag', default: true, capabilities: [], environments: ['production'] }
        },
        overrides: []
      };
      
      const mgr = createFeatureFlagManager({ configuration: config });
      expect(mgr.isEnabled('config_flag')).toBe(true);
    });
  });

  describe('security controls', () => {
    it('should default to protecting master flags', () => {
      const mgr = new FeatureFlagManager();
      const policy = mgr.getSecurityPolicy();
      expect(policy.protectedFlags).toContain('enable_all_p1p2');
      expect(policy.protectedFlags).toContain('enable_all_p1');
      expect(policy.protectedFlags).toContain('enable_all_p2');
    });

    it('should allow canEnable for non-protected flags', () => {
      const mgr = new FeatureFlagManager();
      const result = mgr.canEnable('my_feature', 'user-123');
      expect(result.allowed).toBe(true);
    });

    it('should allow canDisable for non-protected flags', () => {
      const mgr = new FeatureFlagManager();
      const result = mgr.canDisable('my_feature', 'user-123');
      expect(result.allowed).toBe(true);
    });

    it('should allow enable/disable for non-admin on non-protected flags', () => {
      const mgr = new FeatureFlagManager();
      const enabled = mgr.enable('test_flag', 'test', 'regular-user');
      expect(enabled).toBe(true);
      expect(mgr.isEnabled('test_flag')).toBe(true);
      
      const disabled = mgr.disable('test_flag', 'test', 'regular-user');
      expect(disabled).toBe(true);
      expect(mgr.isEnabled('test_flag')).toBe(false);
    });

    it('should allow admin to modify master flags', () => {
      const mgr = new FeatureFlagManager();
      mgr.registerCapability('my_cap', 'p1');
      
      // Admin can enable master flag
      const enabled = mgr.enable('enable_all_p1p2', 'admin action', 'admin');
      expect(enabled).toBe(true);
      expect(mgr.isEnabled('enable_all_p1p2')).toBe(true);
      
      // And it should cascade to P1 capabilities
      expect(mgr.isEnabled('enable_my_cap')).toBe(true);
    });

    it('should use security policy with requireRole', () => {
      // Use a non-protected flag to test role requirement
      const mgr = new FeatureFlagManager({
        securityPolicy: {
          requireRole: 'flag-admin',
          protectedFlags: []  // No protected flags
        }
      });
      
      // User without required role should be denied
      const result = mgr.canEnable('non_protected_flag', 'regular-user');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('required role');
    });

    it('should allow user with required role', () => {
      // Use a non-protected flag to test role requirement
      const mgr = new FeatureFlagManager({
        securityPolicy: {
          requireRole: 'flag-admin',
          protectedFlags: []
        }
      });
      
      // User with required role should be allowed
      const result = mgr.canEnable('test_flag', 'user-with-flag-admin-role');
      expect(result.allowed).toBe(true);
    });

    it('should allow admin to bypass role requirement', () => {
      const mgr = new FeatureFlagManager({
        securityPolicy: {
          requireRole: 'flag-admin',
          protectedFlags: ['special_flag']
        }
      });
      
      const result = mgr.canEnable('special_flag', 'admin');
      expect(result.allowed).toBe(true);
    });

    it('should set and get security policy', () => {
      const mgr = new FeatureFlagManager();
      
      mgr.setSecurityPolicy({
        requireRole: 'new-role',
        requirePermission: 'manage-flags'
      });
      
      const policy = mgr.getSecurityPolicy();
      expect(policy.requireRole).toBe('new-role');
      expect(policy.requirePermission).toBe('manage-flags');
    });

    it('should add and remove protected flags', () => {
      const mgr = new FeatureFlagManager();
      
      mgr.addProtectedFlags('custom_protected');
      const policy = mgr.getSecurityPolicy();
      expect(policy.protectedFlags).toContain('custom_protected');
      
      mgr.removeProtectedFlags('custom_protected');
      const updatedPolicy = mgr.getSecurityPolicy();
      expect(updatedPolicy.protectedFlags).not.toContain('custom_protected');
    });

    it('should log security audit events', () => {
      const mgr = new FeatureFlagManager();
      mgr.enable('test_flag', 'test', 'user-123');
      
      const auditLog = mgr.getSecurityAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
      
      // Check that permission check was logged
      const permissionCheck = auditLog.find(log => log.event === 'permission_check');
      expect(permissionCheck).toBeDefined();
      expect(permissionCheck?.userId).toBe('user-123');
      expect(permissionCheck?.flagName).toBe('test_flag');
    });

    it('should log permission denied events', () => {
      const mgr = new FeatureFlagManager({
        securityPolicy: {
          requireRole: 'admin',
          protectedFlags: []
        }
      });
      
      // This should be denied because of the role requirement (no protected flags, so it checks role)
      mgr.canEnable('non_protected_flag', 'regular-user');
      
      const auditLog = mgr.getSecurityAuditLog();
      const denied = auditLog.find(log => log.event === 'permission_denied');
      expect(denied).toBeDefined();
      expect(denied?.reason).toContain('required role');
    });

    it('should return boolean from enable/disable', () => {
      const mgr = new FeatureFlagManager({
        securityPolicy: {
          requireRole: 'admin',
          protectedFlags: []
        }
      });
      
      // Regular user should be denied when role is required
      const result = mgr.enable('test_flag', 'test', 'regular-user');
      expect(result).toBe(false);
      
      // But should work for non-protected flags when user is admin
      const result2 = mgr.enable('allowed_flag', 'test', 'admin');
      expect(result2).toBe(true);
    });

    it('should work with permission engine (mock)', async () => {
      // Create a mock permission engine
      const mockPermissionEngine = {
        checkPermission: async (userId: string, _action: string, _resource: string) => {
          return userId === 'authorized-user';
        }
      };
      
      const mgr = new FeatureFlagManager({
        permissionEngine: mockPermissionEngine as any,
        securityPolicy: {
          permissionEngineEnabled: true
        }
      });
      
      // Authorized user should pass
      const result = mgr.canEnable('test_flag', 'authorized-user');
      expect(result.allowed).toBe(true);
    });

    it('should include security audit in stats', () => {
      const mgr = new FeatureFlagManager();
      mgr.enable('flag1', 'test', 'user1');
      mgr.enable('flag2', 'test', 'user2');
      
      const stats = mgr.getStats();
      expect(stats.securityAuditSize).toBeGreaterThan(0);
    });

    it('should clear security audit log', () => {
      const mgr = new FeatureFlagManager();
      mgr.enable('test_flag', 'test', 'user-123');
      
      expect(mgr.getSecurityAuditLog().length).toBeGreaterThan(0);
      
      mgr.clearSecurityAuditLog();
      expect(mgr.getSecurityAuditLog().length).toBe(0);
    });
  });
});