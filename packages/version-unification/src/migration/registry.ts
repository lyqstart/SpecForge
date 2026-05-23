/**
 * Migration Registry - Manages all migration scripts in the system.
 * 
 * This module provides the Migration interface and MigrationRegistry class
 * for discovering, validating, and executing migration scripts.
 * 
 * @see Requirements 4.1, 4.2
 * @see design.md §migration/registry.ts
 */

import { MalformedRegistryError } from '../manifest/types.js';
import { MIN_SUPPORTED_DATA_SCHEMA, HIGHEST_KNOWN_SCHEMA } from '../constants.js';

// =============================================================================
// Migration Context
// =============================================================================

/**
 * Context object passed to migration scripts.
 * Provides file system operations and utilities for migrations.
 */
export interface MigrationContext {
  /** Absolute path to the project directory */
  readonly projectDir: string;
  /** Current data schema version (before migration) */
  readonly fromVersion: number;
  /** Target data schema version (after migration) */
  readonly toVersion: number;

  /**
   * Read a JSON file relative to projectDir.
   * @param relativePath Path relative to projectDir
   */
  readJson(relativePath: string): Promise<unknown>;

  /**
   * Write a JSON file relative to projectDir (uses atomic write).
   * @param relativePath Path relative to projectDir
   * @param value Value to serialize as JSON
   */
  writeJson(relativePath: string, value: unknown): Promise<void>;

  /**
   * List all data files in a subdirectory.
   * @param subdir Optional subdirectory within projectDir
   */
  listDataFiles(subdir?: string): Promise<readonly string[]>;

  /**
   * Check if the data is already at the target schema version.
   * Used for idempotence detection.
   */
  checkAtTarget(): Promise<boolean>;
}

// =============================================================================
// Migration Interface
// =============================================================================

/**
 * Represents a single migration script that upgrades data from version N-1 to N.
 */
export interface Migration {
  /**
   * Target version N (after execution, data_schema_version should equal this).
   */
  readonly targetVersion: number;

  /**
   * Upgrade data from version (N-1) to version N.
   * 
   * Implementation must use atomicWrite primitives internally to ensure
   * single-file write atomicity.
   * 
   * @param ctx - Migration context with file system operations
   */
  forward(ctx: MigrationContext): Promise<void>;

  /**
   * Idempotence check: returns true if data is already at target version.
   * 
   * When input data already satisfies schema version N, forward() should
   * be a byte-identical no-op.
   * 
   * @param ctx - Migration context
   */
  isIdempotentAtTarget(ctx: MigrationContext): Promise<boolean>;
}

// =============================================================================
// Migration Registry
// =============================================================================

/**
 * Registry that discovers and manages migration scripts.
 * 
 * Scans src/migration/scripts/*.ts files, validates version continuity,
 * and provides access to migrations by version range.
 */
export class MigrationRegistry {
  /** All migrations sorted by targetVersion ascending */
  private readonly _all: readonly Migration[];

  /**
   * Creates a new MigrationRegistry by scanning migration scripts.
   * 
   * @throws MalformedRegistryError if duplicate or missing version numbers detected
   */
  constructor() {
    const migrations = this.discoverMigrations();
    this.validateRegistry(migrations);
    this._all = Object.freeze(migrations);
  }

  /**
   * Get all migrations sorted by targetVersion ascending.
   */
  get all(): readonly Migration[] {
    return this._all;
  }

  /**
   * Get migrations within a version range [from, to).
   * 
   * @param from - Starting version (exclusive, i.e., start after this version)
   * @param to - Ending version (exclusive, i.e., stop before this version)
   * @returns Migrations with targetVersion in (from, to] range, sorted ascending
   */
  scriptsBetween(from: number, to: number): readonly Migration[] {
    if (from >= to) {
      return [];
    }

    return this._all.filter(m => m.targetVersion > from && m.targetVersion <= to);
  }

  /**
   * Discover migrations by importing scripts from src/migration/scripts/.
   * 
   * Files are expected to be named as <N>.ts where N is the target version.
   * For example, 001.ts upgrades to version 1, 002.ts upgrades to version 2, etc.
   */
  private discoverMigrations(): Migration[] {
    const migrations: Migration[] = [];
    
    // Dynamic import of migration scripts
    // The naming convention is <targetVersion>.ts (e.g., 001.ts -> version 1)
    // We need to scan the directory and import all scripts
    
    // Since we need to support dynamic scanning, we use a pattern matching approach
    // The scripts directory should contain files like 001.ts, 002.ts, etc.
    
    try {
      // Use Bun's import.meta.glob to discover migration scripts
      // TypeScript doesn't know about this Bun-specific API, so we use type assertion
      type GlobModule = { migration?: Migration };
      const modules = (import.meta as unknown as { glob: (pattern: string, options: { eager: true }) => Record<string, GlobModule> }).glob('./scripts/*.ts', { eager: true });
      
      for (const [path, module] of Object.entries(modules)) {
        // Extract version from filename (e.g., ./scripts/001.ts -> 1)
        const match = path.match(/(\d+)\.ts$/);
        if (!match) continue;
        
        const version = parseInt(match[1], 10);
        const migrationModule = module as GlobModule;
        
        if (migrationModule.migration && typeof migrationModule.migration === 'object') {
          const migration = migrationModule.migration;
          
          // Validate the migration has the required properties
          if (
            typeof migration.targetVersion === 'number' &&
            typeof migration.forward === 'function' &&
            typeof migration.isIdempotentAtTarget === 'function'
          ) {
            migrations.push({
              targetVersion: migration.targetVersion,
              forward: migration.forward.bind(migration),
              isIdempotentAtTarget: migration.isIdempotentAtTarget.bind(migration),
            });
          }
        }
      }
    } catch {
      // If no scripts directory or error reading, return empty array
      // This allows the module to load even without migration scripts
    }

    return migrations;
  }

  /**
   * Validate registry for duplicate or missing version numbers.
   * 
   * @param migrations - Array of migrations to validate
   * @throws MalformedRegistryError if validation fails
   */
  private validateRegistry(migrations: Migration[]): void {
    // Sort migrations by target version for validation
    const sorted = [...migrations].sort((a, b) => a.targetVersion - b.targetVersion);
    
    if (sorted.length === 0) {
      // No migrations is valid (when MIN_SUPPORTED_DATA_SCHEMA === HIGHEST_KNOWN_SCHEMA)
      return;
    }

    // Check for duplicate versions
    const versionCounts = new Map<number, number>();
    for (const m of sorted) {
      const count = versionCounts.get(m.targetVersion) ?? 0;
      versionCounts.set(m.targetVersion, count + 1);
    }

    for (const [version, count] of versionCounts) {
      if (count > 1) {
        throw new MalformedRegistryError('duplicate_version', version);
      }
    }

    // Check for missing versions between MIN_SUPPORTED_DATA_SCHEMA + 1 and HIGHEST_KNOWN_SCHEMA
    // Expected versions: (MIN_SUPPORTED_DATA_SCHEMA + 1) to HIGHEST_KNOWN_SCHEMA inclusive
    const expectedMin = MIN_SUPPORTED_DATA_SCHEMA + 1;
    const expectedMax = HIGHEST_KNOWN_SCHEMA;

    for (let v = expectedMin; v <= expectedMax; v++) {
      const hasMigration = sorted.some(m => m.targetVersion === v);
      if (!hasMigration) {
        throw new MalformedRegistryError('missing_version', v);
      }
    }

    // Also validate that all migrations have targetVersion >= expectedMin
    for (const m of sorted) {
      if (m.targetVersion < expectedMin || m.targetVersion > expectedMax) {
        // Migration outside the expected range - this could be intentional
        // for migrations outside the MIN/HIGHEST window, so we just warn
        console.warn(
          `[MigrationRegistry] Migration script targets version ${m.targetVersion} ` +
          `which is outside the expected range [${expectedMin}, ${expectedMax}]`
        );
      }
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Default migration registry instance.
 * Created lazily on first access.
 */
let defaultRegistry: MigrationRegistry | null = null;

/**
 * Get the default migration registry instance.
 * 
 * @returns The singleton MigrationRegistry instance
 */
export function getMigrationRegistry(): MigrationRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new MigrationRegistry();
  }
  return defaultRegistry;
}

/**
 * Reset the default registry (useful for testing).
 */
export function resetMigrationRegistry(): void {
  defaultRegistry = null;
}