import { describe, it, expect, beforeEach } from 'vitest';
import { 
  PluginPermissionValidator,
  createPluginPermissionValidator,
  createDefaultPluginPermissionValidator,
  type PluginManifest,
  type GrantSet
} from '../../src/services/plugin-permission-validator';

describe('PluginPermissionValidator', () => {
  let validator: PluginPermissionValidator;

  beforeEach(() => {
    validator = createPluginPermissionValidator({
      eventLoggingEnabled: false,
      defaultGrants: {
        permissions: [
          'filesystem.read',
          'filesystem.write',
          'network.http',
          'tool.execute'
        ]
      }
    });
  });

  describe('Basic Functionality', () => {
    it('should be instantiable', () => {
      expect(validator).toBeInstanceOf(PluginPermissionValidator);
    });

    it('should have validate method', () => {
      expect(typeof validator.validate).toBe('function');
    });

    it('should have hasPermission method', () => {
      expect(typeof validator.hasPermission).toBe('function');
    });

    it('should have validateBatch method', () => {
      expect(typeof validator.validateBatch).toBe('function');
    });
  });

  describe('Manifest Validation', () => {
    it('should validate a plugin manifest with no requirements', () => {
      const manifest: PluginManifest = {
        id: 'plugin-001',
        name: 'Simple Plugin'
      };

      const result = validator.validate(manifest);

      expect(result.valid).toBe(true);
      expect(result.pluginId).toBe('plugin-001');
      expect(result.missingRequirements).toHaveLength(0);
    });

    it('should validate a plugin with granted requirements', () => {
      const manifest: PluginManifest = {
        id: 'plugin-002',
        name: 'File Reader Plugin',
        requires: ['filesystem.read', 'filesystem.write']
      };

      const result = validator.validate(manifest);

      expect(result.valid).toBe(true);
      expect(result.missingRequirements).toHaveLength(0);
    });

    it('should reject a plugin with ungranted requirements', () => {
      const manifest: PluginManifest = {
        id: 'plugin-003',
        name: 'Network Plugin',
        requires: ['network.http', 'database.read']
      };

      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.missingRequirements).toContain('database.read');
      expect(result.reason).toBe('requirements_not_granted');
    });

    it('should reject when all requirements are ungranted', () => {
      const manifest: PluginManifest = {
        id: 'plugin-004',
        name: 'Admin Plugin',
        requires: ['system.admin', 'config.write', 'user.impersonate']
      };

      const result = validator.validate(manifest);

      expect(result.valid).toBe(false);
      expect(result.missingRequirements).toHaveLength(3);
      expect(result.missingRequirements).toContain('system.admin');
      expect(result.missingRequirements).toContain('config.write');
      expect(result.missingRequirements).toContain('user.impersonate');
    });

    it('should handle empty requires array', () => {
      const manifest: PluginManifest = {
        id: 'plugin-005',
        name: 'No Permissions Plugin',
        requires: []
      };

      const result = validator.validate(manifest);

      expect(result.valid).toBe(true);
    });

    it('should handle undefined requires field', () => {
      const manifest: PluginManifest = {
        id: 'plugin-006',
        name: 'Optional Perms Plugin'
      };

      const result = validator.validate(manifest);

      expect(result.valid).toBe(true);
    });
  });

  describe('Custom Grants', () => {
    it('should use provided grants over default grants', () => {
      const customGrants: GrantSet = {
        permissions: ['custom.permission']
      };

      const manifest: PluginManifest = {
        id: 'plugin-007',
        name: 'Custom Plugin',
        requires: ['custom.permission']
      };

      const result = validator.validate(manifest, customGrants);

      expect(result.valid).toBe(true);
    });

    it('should reject when custom grants do not include required permissions', () => {
      const customGrants: GrantSet = {
        permissions: ['limited.permission']
      };

      const manifest: PluginManifest = {
        id: 'plugin-008',
        name: 'Full Feature Plugin',
        requires: ['limited.permission', 'unlimited.permission']
      };

      const result = validator.validate(manifest, customGrants);

      expect(result.valid).toBe(false);
      expect(result.missingRequirements).toContain('unlimited.permission');
    });
  });

  describe('hasPermission', () => {
    it('should return true for granted permission', () => {
      expect(validator.hasPermission('filesystem.read')).toBe(true);
    });

    it('should return false for ungranted permission', () => {
      expect(validator.hasPermission('database.write')).toBe(false);
    });

    it('should use custom grants when provided', () => {
      const customGrants: GrantSet = {
        permissions: ['special.permission']
      };

      expect(validator.hasPermission('special.permission', customGrants)).toBe(true);
      expect(validator.hasPermission('filesystem.read', customGrants)).toBe(false);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple plugins', () => {
      const manifests: PluginManifest[] = [
        { id: 'plugin-a', name: 'Plugin A', requires: ['filesystem.read'] },
        { id: 'plugin-b', name: 'Plugin B', requires: ['database.read'] },
        { id: 'plugin-c', name: 'Plugin C' }
      ];

      const results = validator.validateBatch(manifests);

      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[2].valid).toBe(true);
    });

    it('should return empty missingRequirements for valid plugins', () => {
      const manifests: PluginManifest[] = [
        { id: 'plugin-d', name: 'Plugin D', requires: ['filesystem.read', 'filesystem.write'] }
      ];

      const results = validator.validateBatch(manifests);

      expect(results[0].missingRequirements).toHaveLength(0);
    });
  });

  describe('Configuration', () => {
    it('should allow updating allowed permissions', () => {
      validator.setAllowedPermissions(['new.permission']);
      
      expect(validator.getAllowedPermissions()).toContain('new.permission');
    });

    it('should update configuration', () => {
      validator.updateConfig({
        projectId: 'new-project',
        eventLoggingEnabled: false
      });

      const config = validator.getConfig();
      expect(config.projectId).toBe('new-project');
      expect(config.eventLoggingEnabled).toBe(false);
    });

    it('should get current configuration', () => {
      const config = validator.getConfig();
      
      expect(config).toHaveProperty('projectId');
      expect(config).toHaveProperty('eventLoggingEnabled');
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid manifest gracefully', () => {
      const invalidManifest = {
        // Missing required 'id' field
        name: 'Invalid Plugin'
      } as any;

      const result = validator.validate(invalidManifest);
      expect(result.valid).toBe(false);
    });

    it('should handle plugin with duplicate requirements', () => {
      const manifest: PluginManifest = {
        id: 'plugin-dup',
        name: 'Duplicate Plugin',
        requires: ['filesystem.read', 'filesystem.read']
      };

      const result = validator.validate(manifest);

      expect(result.valid).toBe(true);
      // Should not have duplicates in missing requirements
      const uniqueMissing = new Set(result.missingRequirements);
      expect(uniqueMissing.size).toBe(result.missingRequirements.length);
    });

    it('should handle special characters in permission names', () => {
      const customGrants: GrantSet = {
        permissions: ['permission.with.dots', 'permission-with-dashes', 'permission_with_underscores']
      };

      const manifest: PluginManifest = {
        id: 'plugin-special',
        name: 'Special Plugin',
        requires: ['permission.with.dots']
      };

      const result = validator.validate(manifest, customGrants);

      expect(result.valid).toBe(true);
    });
  });
});

describe('createDefaultPluginPermissionValidator', () => {
  it('should create a validator with default permissions', () => {
    const validator = createDefaultPluginPermissionValidator('test-project');

    expect(validator).toBeInstanceOf(PluginPermissionValidator);
    
    // Default permissions should be granted
    const manifest: PluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      requires: ['filesystem.read']
    };
    
    const result = validator.validate(manifest);
    expect(result.valid).toBe(true);
  });
});