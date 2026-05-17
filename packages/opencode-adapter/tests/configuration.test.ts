/**
 * OpenCode Adapter Configuration System Tests
 *
 * Tests for the configuration loading system.
 *
 * Requirements: 2.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadConfig,
  validateConfig,
  mergeConfigs,
  getEnvVarName,
  getAllEnvVarNames,
  DEFAULT_CONFIG,
  CONFIG_SCHEMA_VERSION,
  CONFIG_ENV_PREFIX,
  CONFIG_PRIORITY,
} from '../src/configuration';
import type { AdapterConfig } from '../src/types';

describe('Configuration System', () => {
  // Store original env to restore after tests
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear environment before each test
    Object.keys(process.env).forEach(key => {
      if (key.startsWith(CONFIG_ENV_PREFIX)) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
  });

  // ============================================================
  // loadConfig - Default Configuration Tests
  // ============================================================

  describe('loadConfig - defaults', () => {
    it('should return default configuration when no options provided', () => {
      const result = loadConfig({ useEnv: false, useFile: false });

      expect(result.config).toEqual(DEFAULT_CONFIG);
      expect(result.sources).toEqual([]);
      expect(result.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    });

    it('should include all required config fields', () => {
      const result = loadConfig({ useEnv: false });

      expect(result.config).toHaveProperty('compatibleKernelRange');
      expect(result.config).toHaveProperty('translationStrictness');
      expect(result.config).toHaveProperty('communicationTimeout');
      expect(result.config).toHaveProperty('verboseLogging');
      expect(result.config).toHaveProperty('autoStartDaemon');
    });
  });

  // ============================================================
  // loadConfig - Environment Variables Tests
  // ============================================================

  describe('loadConfig - environment variables', () => {
    it('should load compatibleKernelRange from environment', () => {
      process.env[`${CONFIG_ENV_PREFIX}COMPATIBLE_KERNEL_RANGE`] = '>=1.14.0 <2.0.0';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.compatibleKernelRange).toBe('>=1.14.0 <2.0.0');
      expect(result.sources).toContain('environment');
    });

    it('should load translationStrictness from environment', () => {
      process.env[`${CONFIG_ENV_PREFIX}TRANSLATION_STRICTNESS`] = 'strict';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.translationStrictness).toBe('strict');
    });

    it('should load integrationTimeoutMs from environment', () => {
      process.env[`${CONFIG_ENV_PREFIX}INTEGRATION_TIMEOUT_MS`] = '60000';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.communicationTimeout).toBe(60000);
    });

    it('should load verboseLogging from environment (true)', () => {
      process.env[`${CONFIG_ENV_PREFIX}VERBOSE_LOGGING`] = 'true';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.verboseLogging).toBe(true);
    });

    it('should load verboseLogging from environment (1)', () => {
      process.env[`${CONFIG_ENV_PREFIX}VERBOSE_LOGGING`] = '1';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.verboseLogging).toBe(true);
    });

    it('should load autoStartDaemon from environment', () => {
      process.env[`${CONFIG_ENV_PREFIX}AUTO_START_DAEMON`] = 'false';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.autoStartDaemon).toBe(false);
    });

    it('should load thinPluginEndpoint from environment', () => {
      process.env[`${CONFIG_ENV_PREFIX}THIN_PLUGIN_ENDPOINT`] = 'http://localhost:3000';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.thinPluginEndpoint).toBe('http://localhost:3000');
    });

    it('should ignore invalid translationStrictness value', () => {
      process.env[`${CONFIG_ENV_PREFIX}TRANSLATION_STRICTNESS`] = 'invalid';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.translationStrictness).toBe(DEFAULT_CONFIG.translationStrictness);
    });

    it('should ignore invalid timeout value', () => {
      process.env[`${CONFIG_ENV_PREFIX}INTEGRATION_TIMEOUT_MS`] = 'not-a-number';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.communicationTimeout).toBe(DEFAULT_CONFIG.communicationTimeout);
    });

    it('should ignore negative timeout value', () => {
      process.env[`${CONFIG_ENV_PREFIX}INTEGRATION_TIMEOUT_MS`] = '-1000';

      const result = loadConfig({ useEnv: true, useFile: false });

      expect(result.config.communicationTimeout).toBe(DEFAULT_CONFIG.communicationTimeout);
    });
  });

  // ============================================================
  // loadConfig - Runtime Configuration Tests
  // ============================================================

  describe('loadConfig - runtime configuration', () => {
    it('should apply runtime configuration', () => {
      const runtimeConfig: Partial<AdapterConfig> = {
        compatibleKernelRange: '>=1.15.0 <2.0.0',
        translationStrictness: 'strict',
      };

      const result = loadConfig({ useEnv: false, runtimeConfig });

      expect(result.config.compatibleKernelRange).toBe('>=1.15.0 <2.0.0');
      expect(result.config.translationStrictness).toBe('strict');
      expect(result.sources).toContain('runtime');
    });

    it('should prioritize runtime over environment', () => {
      process.env[`${CONFIG_ENV_PREFIX}COMPATIBLE_KERNEL_RANGE`] = '>=1.14.0 <2.0.0';
      const runtimeConfig = { compatibleKernelRange: '>=1.16.0 <3.0.0' };

      const result = loadConfig({ useEnv: true, runtimeConfig });

      expect(result.config.compatibleKernelRange).toBe('>=1.16.0 <3.0.0');
    });
  });

  // ============================================================
  // validateConfig Tests
  // ============================================================

  describe('validateConfig', () => {
    it('should return valid for correct configuration', () => {
      const config: Partial<AdapterConfig> = {
        compatibleKernelRange: '>=1.0.0 <2.0.0',
        translationStrictness: 'strict',
        communicationTimeout: 30000,
        verboseLogging: true,
        autoStartDaemon: true,
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid compatibleKernelRange type', () => {
      const config = { compatibleKernelRange: 123 } as unknown as Partial<AdapterConfig>;

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('compatibleKernelRange must be a string');
    });

    it('should reject empty compatibleKernelRange', () => {
      const config = { compatibleKernelRange: '   ' };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('compatibleKernelRange cannot be empty');
    });

    it('should reject invalid translationStrictness', () => {
      const config = { translationStrictness: 'invalid' };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('translationStrictness must be "strict" or "lenient"');
    });

    it('should reject non-numeric communicationTimeout', () => {
      const config = { communicationTimeout: '5000' };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('communicationTimeout must be a number');
    });

    it('should reject zero communicationTimeout', () => {
      const config = { communicationTimeout: 0 };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('communicationTimeout must be greater than 0');
    });

    it('should reject too large communicationTimeout', () => {
      const config = { communicationTimeout: 700000 };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('communicationTimeout must be less than or equal to 600000ms (10 minutes)');
    });

    it('should reject non-boolean verboseLogging', () => {
      const config = { verboseLogging: 'true' };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('verboseLogging must be a boolean');
    });

    it('should reject non-boolean autoStartDaemon', () => {
      const config = { autoStartDaemon: 1 };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('autoStartDaemon must be a boolean');
    });

    it('should reject empty thinPluginEndpoint', () => {
      const config = { thinPluginEndpoint: '   ' };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('thinPluginEndpoint cannot be empty');
    });

    it('should return multiple errors for multiple issues', () => {
      const config = {
        compatibleKernelRange: 123,
        translationStrictness: 'invalid',
        communicationTimeout: -100,
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================================
  // mergeConfigs Tests
  // ============================================================

  describe('mergeConfigs', () => {
    it('should return defaults when no configs provided', () => {
      const result = mergeConfigs();

      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it('should merge single config', () => {
      const config = { compatibleKernelRange: '>=1.14.0 <2.0.0' };

      const result = mergeConfigs(config);

      expect(result.compatibleKernelRange).toBe('>=1.14.0 <2.0.0');
      expect(result.translationStrictness).toBe(DEFAULT_CONFIG.translationStrictness);
    });

    it('should merge multiple configs', () => {
      const config1 = { compatibleKernelRange: '>=1.14.0 <2.0.0' };
      const config2 = { translationStrictness: 'strict' };
      const config3 = { communicationTimeout: 60000 };

      const result = mergeConfigs(config1, config2, config3);

      expect(result.compatibleKernelRange).toBe('>=1.14.0 <2.0.0');
      expect(result.translationStrictness).toBe('strict');
      expect(result.communicationTimeout).toBe(60000);
    });

    it('should override with later configs', () => {
      const config1 = { verboseLogging: false };
      const config2 = { verboseLogging: true };

      const result = mergeConfigs(config1, config2);

      expect(result.verboseLogging).toBe(true);
    });

    it('should handle null/undefined configs', () => {
      const config = { verboseLogging: true };

      const result = mergeConfigs(null, config, undefined);

      expect(result.verboseLogging).toBe(true);
    });
  });

  // ============================================================
  // getEnvVarName Tests
  // ============================================================

  describe('getEnvVarName', () => {
    it('should return correct env var name for compatibleKernelRange', () => {
      const result = getEnvVarName('compatibleKernelRange');
      expect(result).toBe(`${CONFIG_ENV_PREFIX}COMPATIBLE_KERNEL_RANGE`);
    });

    it('should return correct env var name for translationStrictness', () => {
      const result = getEnvVarName('translationStrictness');
      expect(result).toBe(`${CONFIG_ENV_PREFIX}TRANSLATION_STRICTNESS`);
    });

    it('should return correct env var name for communicationTimeout', () => {
      const result = getEnvVarName('communicationTimeout');
      expect(result).toBe(`${CONFIG_ENV_PREFIX}INTEGRATION_TIMEOUT_MS`);
    });

    it('should return correct env var name for verboseLogging', () => {
      const result = getEnvVarName('verboseLogging');
      expect(result).toBe(`${CONFIG_ENV_PREFIX}VERBOSE_LOGGING`);
    });

    it('should return correct env var name for autoStartDaemon', () => {
      const result = getEnvVarName('autoStartDaemon');
      expect(result).toBe(`${CONFIG_ENV_PREFIX}AUTO_START_DAEMON`);
    });

    it('should return correct env var name for thinPluginEndpoint', () => {
      const result = getEnvVarName('thinPluginEndpoint');
      expect(result).toBe(`${CONFIG_ENV_PREFIX}THIN_PLUGIN_ENDPOINT`);
    });
  });

  // ============================================================
  // getAllEnvVarNames Tests
  // ============================================================

  describe('getAllEnvVarNames', () => {
    it('should return all environment variable names', () => {
      const result = getAllEnvVarNames();

      expect(result.compatibleKernelRange).toBe(`${CONFIG_ENV_PREFIX}COMPATIBLE_KERNEL_RANGE`);
      expect(result.translationStrictness).toBe(`${CONFIG_ENV_PREFIX}TRANSLATION_STRICTNESS`);
      expect(result.communicationTimeout).toBe(`${CONFIG_ENV_PREFIX}INTEGRATION_TIMEOUT_MS`);
      expect(result.verboseLogging).toBe(`${CONFIG_ENV_PREFIX}VERBOSE_LOGGING`);
      expect(result.autoStartDaemon).toBe(`${CONFIG_ENV_PREFIX}AUTO_START_DAEMON`);
      expect(result.thinPluginEndpoint).toBe(`${CONFIG_ENV_PREFIX}THIN_PLUGIN_ENDPOINT`);
    });

    it('should return 6 config keys', () => {
      const result = getAllEnvVarNames();
      const keys = Object.keys(result);

      expect(keys).toHaveLength(6);
    });
  });

  // ============================================================
  // Constants Tests
  // ============================================================

  describe('Constants', () => {
    it('should have correct default config values', () => {
      expect(DEFAULT_CONFIG.compatibleKernelRange).toBe('>=1.0.0 <2.0.0');
      expect(DEFAULT_CONFIG.translationStrictness).toBe('lenient');
      expect(DEFAULT_CONFIG.communicationTimeout).toBe(30000);
      expect(DEFAULT_CONFIG.verboseLogging).toBe(false);
      expect(DEFAULT_CONFIG.autoStartDaemon).toBe(true);
    });

    it('should have correct schema version', () => {
      expect(CONFIG_SCHEMA_VERSION).toBe('1.0');
    });

    it('should have correct config priority values', () => {
      expect(CONFIG_PRIORITY.DEFAULT).toBe(0);
      expect(CONFIG_PRIORITY.FILE).toBe(1);
      expect(CONFIG_PRIORITY.ENVIRONMENT).toBe(2);
      expect(CONFIG_PRIORITY.RUNTIME).toBe(3);
    });

    it('should have correct env prefix', () => {
      expect(CONFIG_ENV_PREFIX).toBe('OPENCODE_ADAPTER_');
    });
  });

  // ============================================================
  // Integration Tests
  // ============================================================

  describe('Integration - full config loading', () => {
    it('should load from multiple sources with correct priority', () => {
      // Set environment variable
      process.env[`${CONFIG_ENV_PREFIX}COMPATIBLE_KERNEL_RANGE`] = '>=1.14.0 <2.0.0';
      process.env[`${CONFIG_ENV_PREFIX}TRANSLATION_STRICTNESS`] = 'strict';

      // Runtime config
      const runtimeConfig = {
        communicationTimeout: 60000,
        verboseLogging: true,
      };

      const result = loadConfig({
        useEnv: true,
        runtimeConfig,
      });

      // Runtime overrides environment
      expect(result.config.communicationTimeout).toBe(60000);
      expect(result.config.verboseLogging).toBe(true);

      // Environment variables applied
      expect(result.config.compatibleKernelRange).toBe('>=1.14.0 <2.0.0');
      expect(result.config.translationStrictness).toBe('strict');

      // Defaults for unspecified fields
      expect(result.config.autoStartDaemon).toBe(DEFAULT_CONFIG.autoStartDaemon);
    });

    it('should track all config sources used', () => {
      process.env[`${CONFIG_ENV_PREFIX}VERBOSE_LOGGING`] = 'true';

      const runtimeConfig = { communicationTimeout: 60000 };

      const result = loadConfig({
        useEnv: true,
        runtimeConfig,
      });

      expect(result.sources).toContain('environment');
      expect(result.sources).toContain('runtime');
    });
  });
});