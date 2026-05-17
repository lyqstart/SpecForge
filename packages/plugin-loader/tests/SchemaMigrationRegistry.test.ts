/**
 * SchemaMigrationRegistry Tests
 * 
 * Tests for schema version migration functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SchemaMigrationRegistry,
  SchemaMigrator,
  MigrationResult,
  MigrationChainResult,
  MigrationRegistryError,
  getGlobalRegistry,
  registerMigrator
} from '../src/manifest/SchemaMigrationRegistry';
import type { PluginManifest } from '../src/types';

describe('SchemaMigrationRegistry', () => {
  let registry: SchemaMigrationRegistry;

  beforeEach(() => {
    registry = new SchemaMigrationRegistry();
  });

  describe('register', () => {
    it('should register a migrator', () => {
      const migrator: SchemaMigrator = {
        fromVersion: '1.0',
        toVersion: '1.1',
        migrate: async (manifest) => manifest as PluginManifest,
        description: 'Test migrator'
      };

      registry.register(migrator);
      expect(registry.hasMigrator('1.0', '1.1')).toBe(true);
    });

    it('should overwrite existing migrator with same versions', () => {
      const migrator1: SchemaMigrator = {
        fromVersion: '1.0',
        toVersion: '1.1',
        migrate: async () => ({ id: 'test', name: 'v1', version: '1.0', entry: 'index.js', schema_version: '1.0' }) as unknown as PluginManifest,
      };

      const migrator2: SchemaMigrator = {
        fromVersion: '1.0',
        toVersion: '1.1',
        migrate: async () => ({ id: 'test2', name: 'v2', version: '1.1', entry: 'main.js', schema_version: '1.1' }) as unknown as PluginManifest,
      };

      registry.register(migrator1);
      registry.register(migrator2);

      const retrieved = registry.getMigrator('1.0', '1.1');
      expect(retrieved?.toVersion).toBe('1.1');
    });
  });

  describe('registerMany', () => {
    it('should register multiple migrators', () => {
      const migrators: SchemaMigrator[] = [
        {
          fromVersion: '1.0',
          toVersion: '1.1',
          migrate: async (manifest) => manifest as PluginManifest,
        },
        {
          fromVersion: '1.1',
          toVersion: '2.0',
          migrate: async (manifest) => manifest as PluginManifest,
        },
      ];

      registry.registerMany(migrators);
      expect(registry.size()).toBe(2);
      expect(registry.hasMigrator('1.0', '1.1')).toBe(true);
      expect(registry.hasMigrator('1.1', '2.0')).toBe(true);
    });
  });

  describe('getMigratorsFrom', () => {
    it('should return all migrators from a given version', () => {
      const migrators: SchemaMigrator[] = [
        {
          fromVersion: '1.0',
          toVersion: '1.1',
          migrate: async (manifest) => manifest as PluginManifest,
        },
        {
          fromVersion: '1.0',
          toVersion: '2.0',
          migrate: async (manifest) => manifest as PluginManifest,
        },
      ];

      registry.registerMany(migrators);
      const from1_0 = registry.getMigratorsFrom('1.0');
      expect(from1_0).toHaveLength(2);
    });

    it('should return empty array for unknown version', () => {
      const fromUnknown = registry.getMigratorsFrom('9.9');
      expect(fromUnknown).toHaveLength(0);
    });
  });

  describe('findMigrationPath', () => {
    it('should find direct migration path', () => {
      const migrator: SchemaMigrator = {
        fromVersion: '1.0',
        toVersion: '1.1',
        migrate: async (manifest) => manifest as PluginManifest,
      };

      registry.register(migrator);
      const result = registry.findMigrationPath('1.0', '1.1');

      expect(result.success).toBe(true);
      expect(result.path).toEqual(['1.0', '1.1']);
      expect(result.migrators).toHaveLength(1);
    });

    it('should find multi-step migration path', () => {
      const migrators: SchemaMigrator[] = [
        {
          fromVersion: '1.0',
          toVersion: '1.1',
          migrate: async (manifest) => manifest as PluginManifest,
        },
        {
          fromVersion: '1.1',
          toVersion: '2.0',
          migrate: async (manifest) => manifest as PluginManifest,
        },
      ];

      registry.registerMany(migrators);
      const result = registry.findMigrationPath('1.0', '2.0');

      expect(result.success).toBe(true);
      expect(result.path).toEqual(['1.0', '1.1', '2.0']);
      expect(result.migrators).toHaveLength(2);
    });

    it('should return failure for non-existent path', () => {
      const result = registry.findMigrationPath('1.0', '3.0');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No migration path found');
    });
  });

  describe('migrate', () => {
    it('should return original manifest when versions are equal', async () => {
      const manifest = { id: 'test', name: 'Test', version: '1.0', entry: 'index.js', schema_version: '1.0' };
      
      const result = await registry.migrate(manifest, '1.0', '1.0');

      expect(result.migrated).toBe(false);
      expect(result.steps).toHaveLength(0);
    });

    it('should execute migration successfully', async () => {
      const migrator: SchemaMigrator = {
        fromVersion: '1.0',
        toVersion: '1.1',
        migrate: async (manifest) => {
          const m = manifest as { schema_version: string };
          return { ...m, schema_version: '1.1' } as unknown as PluginManifest;
        },
      };

      registry.register(migrator);
      const manifest = { id: 'test', name: 'Test', version: '1.0', entry: 'index.js', schema_version: '1.0' };
      
      const result = await registry.migrate(manifest, '1.0', '1.1');

      expect(result.migrated).toBe(true);
      expect(result.toVersion).toBe('1.1');
      expect(result.steps).toContain('1.0 -> 1.1');
    });

    it('should execute multi-step migration', async () => {
      const migrators: SchemaMigrator[] = [
        {
          fromVersion: '1.0',
          toVersion: '1.1',
          migrate: async (manifest) => {
            const m = manifest as { schema_version: string };
            return { ...m, schema_version: '1.1' } as unknown as PluginManifest;
          },
        },
        {
          fromVersion: '1.1',
          toVersion: '2.0',
          migrate: async (manifest) => {
            const m = manifest as { schema_version: string };
            return { ...m, schema_version: '2.0' } as unknown as PluginManifest;
          },
        },
      ];

      registry.registerMany(migrators);
      const manifest = { id: 'test', name: 'Test', version: '1.0', entry: 'index.js', schema_version: '1.0' };
      
      const result = await registry.migrate(manifest, '1.0', '2.0');

      expect(result.migrated).toBe(true);
      expect(result.toVersion).toBe('2.0');
      expect(result.steps).toHaveLength(2);
    });

    it('should throw error when no path found', async () => {
      const manifest = { id: 'test', name: 'Test', version: '1.0', entry: 'index.js', schema_version: '1.0' };
      
      await expect(registry.migrate(manifest, '1.0', '3.0'))
        .rejects
        .toThrow(MigrationRegistryError);
    });

    it('should validate with canMigrate before migration', async () => {
      const migrator: SchemaMigrator = {
        fromVersion: '1.0',
        toVersion: '1.1',
        migrate: async (manifest) => manifest as PluginManifest,
        canMigrate: (manifest) => {
          const m = manifest as { id?: string };
          return m.id !== 'blocked';
        },
      };

      registry.register(migrator);

      // Should succeed
      const result1 = await registry.migrate({ id: 'test', schema_version: '1.0' }, '1.0', '1.1');
      expect(result1.migrated).toBe(true);

      // Should fail due to canMigrate
      await expect(
        registry.migrate({ id: 'blocked', schema_version: '1.0' }, '1.0', '1.1')
      ).rejects.toThrow(MigrationRegistryError);
    });
  });

  describe('getRegisteredVersions', () => {
    it('should return sorted list of registered versions', () => {
      const migrators: SchemaMigrator[] = [
        { fromVersion: '2.0', toVersion: '2.1', migrate: async (m) => m as PluginManifest },
        { fromVersion: '1.0', toVersion: '1.1', migrate: async (m) => m as PluginManifest },
        { fromVersion: '1.5', toVersion: '1.6', migrate: async (m) => m as PluginManifest },
      ];

      registry.registerMany(migrators);
      const versions = registry.getRegisteredVersions();

      expect(versions).toEqual(['1.0', '1.5', '2.0']);
    });
  });

  describe('size and clear', () => {
    it('should return correct size', () => {
      const migrators: SchemaMigrator[] = [
        { fromVersion: '1.0', toVersion: '1.1', migrate: async (m) => m as PluginManifest },
        { fromVersion: '1.0', toVersion: '2.0', migrate: async (m) => m as PluginManifest },
        { fromVersion: '2.0', toVersion: '3.0', migrate: async (m) => m as PluginManifest },
      ];

      registry.registerMany(migrators);
      expect(registry.size()).toBe(3);
    });

    it('should clear all migrators', () => {
      const migrator: SchemaMigrator = {
        fromVersion: '1.0',
        toVersion: '1.1',
        migrate: async (manifest) => manifest as PluginManifest,
      };

      registry.register(migrator);
      expect(registry.size()).toBe(1);

      registry.clear();
      expect(registry.size()).toBe(0);
    });
  });

  describe('getDebugInfo', () => {
    it('should return debug information', () => {
      const migrators: SchemaMigrator[] = [
        { fromVersion: '1.0', toVersion: '1.1', migrate: async (m) => m as PluginManifest },
        { fromVersion: '1.0', toVersion: '2.0', migrate: async (m) => m as PluginManifest },
      ];

      registry.registerMany(migrators);
      const info = registry.getDebugInfo();

      expect(info['1.0']).toContain('1.1');
      expect(info['1.0']).toContain('2.0');
    });
  });
});

describe('Global Registry', () => {
  it('should provide global registry instance', () => {
    const registry = getGlobalRegistry();
    expect(registry).toBeInstanceOf(SchemaMigrationRegistry);
  });

  it('should register migrator globally', () => {
    const globalRegistry = getGlobalRegistry();
    globalRegistry.clear(); // Clear first to avoid interference

    const migrator: SchemaMigrator = {
      fromVersion: '9.9',
      toVersion: '10.0',
      migrate: async (manifest) => manifest as PluginManifest,
    };

    registerMigrator(migrator);
    expect(globalRegistry.hasMigrator('9.9', '10.0')).toBe(true);
    
    globalRegistry.clear(); // Clean up
  });
});

describe('MigrationRegistryError', () => {
  it('should create error with correct properties', () => {
    const error = new MigrationRegistryError(
      'Test error',
      'NO_MIGRATOR_FOUND',
      '1.0',
      '2.0'
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('NO_MIGRATOR_FOUND');
    expect(error.fromVersion).toBe('1.0');
    expect(error.toVersion).toBe('2.0');
  });
});