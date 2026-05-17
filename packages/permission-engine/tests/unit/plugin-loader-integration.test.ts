/**
 * Plugin Loader Integration Unit Tests
 * 
 * Tests for Task 4.3: Integrate with Plugin Loader
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginLoaderIntegration,
  createRestrictivePluginLoaderIntegration,
  createStandardPluginLoaderIntegration,
  createPermissivePluginLoaderIntegration
} from '../../src/services/plugin-loader-integration';

describe('PluginLoaderIntegration', () => {
  let integration: PluginLoaderIntegration;

  beforeEach(() => {
    integration = new PluginLoaderIntegration({
      projectId: 'test-project',
      eventLoggingEnabled: false
    });
  });

  describe('Basic Functionality', () => {
    it('should create instance with default config', () => {
      expect(integration).toBeDefined();
    });

    it('should validate plugin with valid manifest and no source', async () => {
      const result = await integration.validatePlugin({
        id: 'test-plugin',
        name: 'Test Plugin',
        requires: ['filesystem.read']
      });

      expect(result.pluginId).toBe('test-plugin');
      expect(result.pluginName).toBe('Test Plugin');
    });

    it('should reject plugin with missing required permissions in restrictive mode', async () => {
      const restrictive = createRestrictivePluginLoaderIntegration({
        projectId: 'test',
        eventLoggingEnabled: false
      });

      const result = await restrictive.validatePlugin({
        id: 'test-plugin',
        name: 'Test Plugin',
        requires: ['filesystem.read', 'network.http']
      });

      expect(result.allowed).toBe(false);
      expect(result.permissionValid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(1);
      expect(result.rejectionReasons[0].code).toBe('requirements_not_granted');
    });

    it('should accept plugin with granted permissions', async () => {
      const result = await integration.validatePlugin({
        id: 'test-plugin',
        name: 'Test Plugin',
        requires: []
      });

      expect(result.allowed).toBe(true);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Permission Validation', () => {
    it('should validate permissions correctly', () => {
      // With empty default grants, no permissions are granted
      // So we test with an explicitly provided grant set
      const result = integration.validatePermissions(
        {
          id: 'test-plugin',
          name: 'Test Plugin',
          requires: []
        },
        { permissions: ['filesystem.read'] }
      );

      expect(result.valid).toBe(true);
      expect(result.pluginId).toBe('test-plugin');
    });

    it('should reject permission not in grants', () => {
      const result = integration.validatePermissions({
        id: 'test-plugin',
        name: 'Test Plugin',
        requires: ['admin.access']
      }, { permissions: ['filesystem.read'] });

      expect(result.valid).toBe(false);
      expect(result.missingRequirements).toContain('admin.access');
    });
  });

  describe('Static API Checks', () => {
    it('should pass for safe code', () => {
      const safeCode = `
        function hello() {
          console.log('Hello, world!');
          return 'hello';
        }
        export default hello;
      `;

      const result = integration.checkStaticApis(safeCode, 'test-plugin', 'Test Plugin');
      expect(result.valid).toBe(true);
      expect(result.detectedApis).toHaveLength(0);
    });

    it('should detect prohibited child_process.exec', () => {
      // Use direct child_process.exec pattern that matches the regex
      const codeWithExec = `
        child_process.exec('ls', function(err, stdout) { console.log(stdout); });
      `;

      const result = integration.checkStaticApis(codeWithExec, 'test-plugin', 'Test Plugin');
      // Check if there are any detected APIs
      expect(result.detectedApis.length).toBeGreaterThan(0);
      expect(result.hasErrors).toBe(true);
    });

    it('should detect eval usage', () => {
      const codeWithEval = `
        const result = eval('2 + 2');
      `;

      const result = integration.checkStaticApis(codeWithEval, 'test-plugin', 'Test Plugin');
      // The eval detector looks for 'eval(' pattern
      // Check for any code injection detection
      const codeInjectionApis = result.detectedApis.filter(
        api => api.category === 'code_injection'
      );
      expect(codeInjectionApis.length).toBeGreaterThan(0);
    });
  });

  describe('Complete Validation Flow', () => {
    it('should validate plugin with manifest and source code', async () => {
      const result = await integration.validatePlugin(
        {
          id: 'test-plugin',
          name: 'Test Plugin',
          requires: []
        },
        [
          {
            filename: 'index.ts',
            content: 'console.log("Hello");'
          }
        ]
      );

      expect(result.allowed).toBe(true);
      expect(result.staticApiCheck).toBeDefined();
      expect(result.permissionValidation).toBeDefined();
    });

    it('should provide detailed rejection reasons', async () => {
      const restrictive = createRestrictivePluginLoaderIntegration({
        projectId: 'test',
        eventLoggingEnabled: false
      });

      const result = await restrictive.validatePlugin(
        {
          id: 'malicious-plugin',
          name: 'Malicious Plugin',
          requires: ['process.kill', 'admin.access']
        },
        [
          {
            filename: 'malicious.ts',
            content: 'eval("require(\'child_process\').execSync(\'rm -rf /\')");'
          }
        ]
      );

      expect(result.allowed).toBe(false);
      expect(result.rejectionReasons.length).toBeGreaterThan(0);
      
      // Should have rejection for permissions
      const permReason = result.rejectionReasons.find(r => r.code === 'requirements_not_granted');
      expect(permReason).toBeDefined();
      
      // Should have rejection for static API
      const apiReason = result.rejectionReasons.find(r => r.code === 'prohibited_api');
      expect(apiReason).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should allow updating allowed permissions', () => {
      integration.setAllowedPermissions(['new.permission']);
      
      const config = integration.getConfig();
      expect(config.allowedPermissions).toContain('new.permission');
    });

    it('should allow updating allowed paths', () => {
      integration.setAllowedPaths(['/safe/path']);
      
      const config = integration.getConfig();
      expect(config.allowedPaths).toContain('/safe/path');
    });

    it('should allow updating allowed hosts', () => {
      integration.setAllowedHosts(['api.example.com']);
      
      const config = integration.getConfig();
      expect(config.allowedHosts).toContain('api.example.com');
    });
  });

  describe('Factory Functions', () => {
    it('should create restrictive integration', () => {
      const restrictive = createRestrictivePluginLoaderIntegration({
        projectId: 'test',
        eventLoggingEnabled: false
      });

      expect(restrictive).toBeDefined();
      const config = restrictive.getConfig();
      expect(config.allowChildProcess).toBe(false);
      expect(config.allowFilesystem).toBe(false);
    });

    it('should create standard integration with common permissions', () => {
      const standard = createStandardPluginLoaderIntegration({
        projectId: 'test',
        eventLoggingEnabled: false
      });

      expect(standard).toBeDefined();
      const config = standard.getConfig();
      expect(config.allowedPermissions).toContain('filesystem.read');
      expect(config.allowedPermissions).toContain('network.http');
    });

    it('should create permissive integration', () => {
      const permissive = createPermissivePluginLoaderIntegration({
        projectId: 'test',
        eventLoggingEnabled: false
      });

      expect(permissive).toBeDefined();
      const config = permissive.getConfig();
      expect(config.allowChildProcess).toBe(true);
      expect(config.allowFilesystem).toBe(true);
      expect(config.allowNetwork).toBe(true);
    });
  });
});