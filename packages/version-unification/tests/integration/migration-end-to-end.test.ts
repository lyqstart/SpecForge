/**
 * Integration test: Multi-step migration chain end-to-end.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.5
 *
 * This test:
 * 1. Creates a temporary directory as test workspace
 * 2. Creates multiple fixture migration scripts (simulating a chain)
 * 3. Creates initial project manifest with low data_schema_version
 * 4. Calls MigrationRunner.run() to execute multi-step migration
 * 5. Verifies:
 *    - Each migration script is invoked in ascending order
 *    - project manifest's data_schema_version increments progressively
 *    - File tree updates as expected
 *
 * @see requirements.md §Requirement 4 (Migration 链机制)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Migration, MigrationContext, MigrationRegistry } from '../../src/migration/registry';
import { MigrationRunner, MigrationRunArgs } from '../../src/migration/runner';
import type { ProjectManifest } from '../../src/manifest/types';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Custom migration registry that provides mock migrations.
 * This simulates having migration scripts in src/migration/scripts/
 */
class TestMigrationRegistry implements MigrationRegistry {
  private readonly migrations: Migration[];

  constructor(migrations: Migration[]) {
    // Sort by target version
    this.migrations = [...migrations].sort((a, b) => a.targetVersion - b.targetVersion);
  }

  get all(): readonly Migration[] {
    return this.migrations;
  }

  scriptsBetween(from: number, to: number): readonly Migration[] {
    if (from >= to) return [];
    return this.migrations.filter(m => m.targetVersion > from && m.targetVersion <= to);
  }
}

/**
 * Creates a mock migration that tracks its execution.
 * Each migration records its target version and creates a marker file.
 */
function createTrackingMigration(
  targetVersion: number,
  executionLog: number[]
): Migration {
  return {
    targetVersion,
    forward: async (ctx: MigrationContext) => {
      // Record that this migration was invoked
      executionLog.push(targetVersion);

      // Create a marker file to prove migration ran
      const markerPath = path.join(ctx.projectDir, `.migrated-to-v${targetVersion}.marker`);
      await fs.writeFile(markerPath, `Migration to v${targetVersion} completed at ${new Date().toISOString()}`);
    },
    isIdempotentAtTarget: async () => false,
  };
}

/**
 * Creates a temp directory for testing with cleanup.
 */
class TempWorkspace {
  readonly path: string;

  constructor() {
    this.path = '';
  }

  async init(): Promise<void> {
    this.path = await fs.mkdtemp(path.join(os.tmpdir(), 'migrate-e2e-'));
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.path, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates initial project manifest with specified data_schema_version.
 */
async function createInitialManifest(
  projectDir: string,
  dataSchemaVersion: number
): Promise<string> {
  const specforgeDir = path.join(projectDir, 'specforge');
  await fs.mkdir(specforgeDir, { recursive: true });

  const manifestPath = path.join(specforgeDir, 'manifest.json');
  const manifest: ProjectManifest = {
    data_schema_version: dataSchemaVersion,
    initialized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

/**
 * Reads and parses the project manifest.
 */
async function readManifest(manifestPath: string): Promise<ProjectManifest> {
  const content = await fs.readFile(manifestPath, 'utf-8');
  return JSON.parse(content) as ProjectManifest;
}

/**
 * Lists all marker files in the project directory.
 */
async function listMarkerFiles(projectDir: string): Promise<string[]> {
  const entries = await fs.readdir(projectDir);
  return entries
    .filter(name => name.startsWith('.migrated-to-v') && name.endsWith('.marker'))
    .sort();
}

// =============================================================================
// Tests
// =============================================================================

describe('MigrationRunner Integration: Multi-step chain', () => {
  let workspace: TempWorkspace;

  beforeEach(async () => {
    workspace = new TempWorkspace();
    await workspace.init();
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it('should execute a 3-step migration chain and update manifest correctly', async () => {
    // Step 1: Setup - create initial manifest at version 0
    const manifestPath = await createInitialManifest(workspace.path, 0);

    // Step 2: Create migrations for versions 1, 2, 3
    const executionLog: number[] = [];
    const migrations = [
      createTrackingMigration(1, executionLog),
      createTrackingMigration(2, executionLog),
      createTrackingMigration(3, executionLog),
    ];

    const registry = new TestMigrationRegistry(migrations);

    // Step 3: Run migration from version 0 to 3
    const runner = new MigrationRunner(workspace.path, registry);
    const result = await runner.run({
      projectDir: workspace.path,
      from: 0,
      to: 3,
    });

    // Step 4: Verify migration succeeded
    expect(result.kind).toBe('OK');
    expect(result.from).toBe(0);
    expect(result.to).toBe(3);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);

    // Step 5: Verify manifest was updated to version 3
    const manifest = await readManifest(manifestPath);
    expect(manifest.data_schema_version).toBe(3);

    // Verify updated_at is recent (within last minute)
    const updatedAt = new Date(manifest.updated_at);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - updatedAt.getTime());
    expect(diffMs).toBeLessThan(60000); // Within 1 minute

    // Step 6: Verify all migrations were executed in order
    expect(executionLog).toEqual([1, 2, 3]);

    // Step 7: Verify marker files exist for each migration
    const markers = await listMarkerFiles(workspace.path);
    expect(markers).toEqual([
      '.migrated-to-v1.marker',
      '.migrated-to-v2.marker',
      '.migrated-to-v3.marker',
    ]);
  });

  it('should handle migration chain with gaps (e.g., 0 -> 2, skipping 1)', async () => {
    // Setup: initial manifest at version 0
    const manifestPath = await createInitialManifest(workspace.path, 0);

    // Create only migration for version 2
    const executionLog: number[] = [];
    const migrations = [
      createTrackingMigration(2, executionLog),
    ];

    const registry = new TestMigrationRegistry(migrations);
    const runner = new MigrationRunner(workspace.path, registry);

    // Run migration from 0 to 2
    const result = await runner.run({
      projectDir: workspace.path,
      from: 0,
      to: 2,
    });

    // Verify success
    expect(result.kind).toBe('OK');

    // Verify version updated to 2
    const manifest = await readManifest(manifestPath);
    expect(manifest.data_schema_version).toBe(2);

    // Verify migration 2 was executed
    expect(executionLog).toEqual([2]);
  });

  it('should be idempotent when running migration with from >= to', async () => {
    // Setup: initial manifest at version 3
    const manifestPath = await createInitialManifest(workspace.path, 3);

    const executionLog: number[] = [];
    const migrations = [
      createTrackingMigration(1, executionLog),
      createTrackingMigration(2, executionLog),
      createTrackingMigration(3, executionLog),
    ];

    const registry = new TestMigrationRegistry(migrations);
    const runner = new MigrationRunner(workspace.path, registry);

    // Run with from >= to (should be no-op)
    const result = await runner.run({
      projectDir: workspace.path,
      from: 3,
      to: 3,
    });

    // Verify success with zero elapsed time
    expect(result.kind).toBe('OK');
    expect(result.from).toBe(3);
    expect(result.to).toBe(3);
    expect(result.elapsedMs).toBe(0);

    // Verify no migrations executed
    expect(executionLog).toEqual([]);

    // Verify manifest unchanged
    const manifest = await readManifest(manifestPath);
    expect(manifest.data_schema_version).toBe(3);
  });

  it('should handle existing project data files during migration', async () => {
    // Setup: initial manifest and some data files
    const manifestPath = await createInitialManifest(workspace.path, 0);

    // Create some project data files
    await fs.writeFile(path.join(workspace.path, 'project-data.json'), JSON.stringify({ old: 'data' }));
    await fs.writeFile(path.join(workspace.path, 'config.json'), JSON.stringify({ setting: 'value' }));

    // Create migration that modifies data files
    const executionLog: number[] = [];
    const migrations: Migration[] = [
      {
        targetVersion: 1,
        forward: async (ctx: MigrationContext) => {
          executionLog.push(1);
          // Migration modifies a data file
          const dataPath = path.join(ctx.projectDir, 'project-data.json');
          const data = JSON.parse(await fs.readFile(dataPath, 'utf-8'));
          data.migrated = true;
          await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
        },
        isIdempotentAtTarget: async () => false,
      },
    ];

    const registry = new TestMigrationRegistry(migrations);
    const runner = new MigrationRunner(workspace.path, registry);

    // Run migration
    const result = await runner.run({
      projectDir: workspace.path,
      from: 0,
      to: 1,
    });

    // Verify success
    expect(result.kind).toBe('OK');

    // Verify manifest updated
    const manifest = await readManifest(manifestPath);
    expect(manifest.data_schema_version).toBe(1);

    // Verify data file was modified
    const projectData = JSON.parse(
      await fs.readFile(path.join(workspace.path, 'project-data.json'), 'utf-8')
    );
    expect(projectData).toEqual({ old: 'data', migrated: true });

    // Verify config file still exists
    const config = JSON.parse(
      await fs.readFile(path.join(workspace.path, 'config.json'), 'utf-8')
    );
    expect(config).toEqual({ setting: 'value' });
  });

  it('should handle new project without existing manifest', async () => {
    // Setup: no manifest exists (new project scenario)
    const specforgeDir = path.join(workspace.path, 'specforge');

    // Ensure specforge directory doesn't exist
    try {
      await fs.rm(specforgeDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }

    // Create a migration for version 1
    const executionLog: number[] = [];
    const migrations = [
      createTrackingMigration(1, executionLog),
    ];

    const registry = new TestMigrationRegistry(migrations);
    const runner = new MigrationRunner(workspace.path, registry);

    // Run migration (should create manifest since it doesn't exist)
    const result = await runner.run({
      projectDir: workspace.path,
      from: 0,
      to: 1,
    });

    // Verify success
    expect(result.kind).toBe('OK');

    // Verify manifest was created
    const manifestPath = path.join(specforgeDir, 'manifest.json');
    const manifest = await readManifest(manifestPath);
    expect(manifest.data_schema_version).toBe(1);
    expect(manifest.initialized_at).toBeDefined();
    expect(manifest.updated_at).toBeDefined();
  });
});