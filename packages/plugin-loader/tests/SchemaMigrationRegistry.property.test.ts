/**
 * SchemaMigrationRegistry Property-Based Tests
 * 
 * Validates universal properties of the migration system using fast-check
 * Feature: schema-version-migration, Property: 1-7
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SchemaMigrationRegistry } from '../src/manifest/SchemaMigrationRegistry';
import type { PluginManifest } from '../src/types';
import type { SchemaMigrator } from '../src/manifest/SchemaMigrationRegistry';

describe('SchemaMigrationRegistry - Property Tests', () => {
  describe('Property 1: Migration registry operations are idempotent', () => {
    it(
      'Registering the same migrator twice should be equivalent to registering once',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 5 }),
            fc.string({ minLength: 1, maxLength: 5 }),
            async (from, to) => {
              const registry = new SchemaMigrationRegistry();
              
              const migrator: SchemaMigrator = {
                fromVersion: from,
                toVersion: to,
                migrate: async (m) => m as PluginManifest,
              };

              registry.register(migrator);
              registry.register(migrator);

              // Should only count as one
              expect(registry.size()).toBe(1);
            }
          ),
          { endOnFailure: true, numRuns: 100 }
        );
      }
    );
  });

  describe('Property 2: Migration preserves manifest structure', () => {
    it(
      'Migration should preserve required manifest fields',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }),
              name: fc.string({ minLength: 1, maxLength: 20 }),
              version: fc.string({ minLength: 1, maxLength: 10 }),
              entry: fc.string({ minLength: 1, maxLength: 50 }),
              schema_version: fc.constant('1.0'),
            }),
            async (manifest) => {
              const registry = new SchemaMigrationRegistry();
              
              const migrator: SchemaMigrator = {
                fromVersion: '1.0',
                toVersion: '1.1',
                migrate: async (m) => {
                  const input = m as typeof manifest;
                  return {
                    ...input,
                    schema_version: '1.1' as const,
                  };
                },
              };

              registry.register(migrator);
              const result = await registry.migrate(manifest, '1.0', '1.1');

              // Preserve required fields
              expect(result.manifest.id).toBe(manifest.id);
              expect(result.manifest.name).toBe(manifest.name);
              expect(result.manifest.version).toBe(manifest.version);
              expect(result.manifest.entry).toBe(manifest.entry);
              expect(result.manifest.schema_version).toBe('1.1');
            }
          ),
          { endOnFailure: true, numRuns: 50 }
        );
      }
    );
  });

  describe('Property 3: Same version migration returns original', () => {
    it(
      'Migrating from X to X should not modify the manifest',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              id: fc.string({ minLength: 1 }),
              name: fc.string({ minLength: 1 }),
              version: fc.string({ minLength: 1 }),
              entry: fc.string({ minLength: 1 }),
              schema_version: fc.constant('1.0'),
            }),
            async (manifest) => {
              const registry = new SchemaMigrationRegistry();
              const result = await registry.migrate(manifest, '1.0', '1.0');

              expect(result.migrated).toBe(false);
              expect(result.steps).toHaveLength(0);
              expect(result.manifest).toEqual(manifest);
            }
          ),
          { endOnFailure: true, numRuns: 50 }
        );
      }
    );
  });

  describe('Property 4: Path finding finds shortest path', () => {
    it(
      'Multiple migration paths should find the shortest one',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.nat({ max: 5 }),
            async (chainLength) => {
              const registry = new SchemaMigrationRegistry();
              
              // Create chain: 1.0 -> 1.1 -> 1.2 -> ... -> 2.0
              const targetVersion = `${Math.min(chainLength + 1)}.0`;
              
              for (let i = 0; i <= chainLength; i++) {
                const fromV = `${i}.0`;
                const toV = `${i + 1}.0`;
                
                registry.register({
                  fromVersion: fromV,
                  toVersion: toV,
                  migrate: async (m) => m as PluginManifest,
                });
              }

              // Add a longer alternative path
              registry.register({
                fromVersion: '1.0',
                toVersion: targetVersion,
                migrate: async (m) => m as PluginManifest,
              });

              const result = registry.findMigrationPath('1.0', targetVersion);

              // Should find direct path (shortest)
              expect(result.success).toBe(true);
              expect(result.path.length).toBe(2); // Direct path: [1.0, 2.0]
            }
          ),
          { endOnFailure: true, numRuns: 30 }
        );
      }
    );
  });

  describe('Property 5: Empty registry operations are safe', () => {
    it(
      'Operations on empty registry should not throw (for non-empty version strings)',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            async (from, to) => {
              const registry = new SchemaMigrationRegistry();
              
              // These should all be safe on empty registry
              expect(registry.hasMigrator(from, to)).toBe(false);
              expect(registry.getMigrator(from, to)).toBeNull();
              expect(registry.getMigratorsFrom(from)).toHaveLength(0);
              expect(registry.getRegisteredVersions()).toHaveLength(0);
              expect(registry.size()).toBe(0);
              
              const pathResult = registry.findMigrationPath(from, to);
              expect(pathResult.success).toBe(false);
              
              // migrate should throw with meaningful error
              await expect(
                registry.migrate({}, from, to)
              ).rejects.toThrow();
            }
          ),
          { endOnFailure: true, numRuns: 30 }
        );
      }
    );
  });

  describe('Property 6: Version comparison is consistent', () => {
    it(
      'getRegisteredVersions returns sorted versions (valid semver)',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({
                from: fc.string({ minLength: 3, maxLength: 5 }),
                to: fc.string({ minLength: 3, maxLength: 5 }),
              }),
              { minLength: 3, maxLength: 10 }
            ),
            async (pairs) => {
              const registry = new SchemaMigrationRegistry();
              
              for (const { from, to } of pairs) {
                // Only register valid semver versions (e.g., "1.0", "2.5")
                if (/^\d+\.\d+$/.test(from) && /^\d+\.\d+$/.test(to)) {
                  registry.register({
                    fromVersion: from,
                    toVersion: to,
                    migrate: async (m) => m as PluginManifest,
                  });
                }
              }

              const versions = registry.getRegisteredVersions();
              
              // Check sorted order
              for (let i = 1; i < versions.length; i++) {
                const prevParts = versions[i - 1].split('.').map(Number);
                const currParts = versions[i].split('.').map(Number);
                
                // Compare as version numbers
                const prevNum = prevParts[0] * 100 + (prevParts[1] || 0);
                const currNum = currParts[0] * 100 + (currParts[1] || 0);
                
                expect(prevNum).toBeLessThanOrEqual(currNum);
              }
            }
          ),
          { endOnFailure: true, numRuns: 30 }
        );
      }
    );
  });

  describe('Property 7: Migration chain executes in order', () => {
    it(
      'Multi-step migrations execute in correct order',
      async () => {
        // Fixed test: simple chain 1.0 -> 1.1 -> 1.2 -> 1.3
        const registry = new SchemaMigrationRegistry();
        const executionOrder: string[] = [];
        
        // Create chain: 1.0->2.0, 2.0->3.0, 3.0->4.0
        for (let i = 0; i < 3; i++) {
          const fromV = `${i + 1}.0`;
          const toV = `${i + 2}.0`;
          
          registry.register({
            fromVersion: fromV,
            toVersion: toV,
            migrate: async (m) => {
              executionOrder.push(`${fromV}->${toV}`);
              return m as PluginManifest;
            },
          });
        }

        const manifest = { 
          id: 'test', 
          name: 'Test', 
          version: '1.0', 
          entry: 'index.js',
          schema_version: '1.0' 
        };
        
        // Migrate from 1.0 to 4.0 (needs all 3 steps)
        await registry.migrate(manifest, '1.0', '4.0');

        expect(executionOrder).toHaveLength(3);
        
        // Verify order
        expect(executionOrder[0]).toBe('1.0->2.0');
        expect(executionOrder[1]).toBe('2.0->3.0');
        expect(executionOrder[2]).toBe('3.0->4.0');
      }
    );
  });
});