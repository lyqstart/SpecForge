/**
 * Migration Runner - Executes migration chains with atomicity and rollback.
 *
 * This module provides MigrationRunner.run() which:
 * 1. Sequentially executes migrations from scriptsBetween(from, to)
 * 2. Performs single-step atomicity (backup → forward → writeAfterMigration → cleanup)
 * 3. On forward failure: rollback from backup, log error, abort chain
 * 4. On rollback failure: preserve backup, log rollback failure, throw MigrationFailedNoRollbackError
 * 5. Returns MigrationRunResult discriminated union
 *
 * @see Requirements 4.2, 4.3, 4.5, 13.1, 13.2
 * @see design.md §Components.migration/runner.ts
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SPEC_DIR_NAME, LAYOUT } from '@specforge/types/directory-layout';
import {
  Migration,
  MigrationContext,
  MigrationRegistry,
  getMigrationRegistry,
} from './registry.js';
import { createMigrationContext } from './context.js';
import { MigrationErrorLogger } from './error-logger.js';
import { ProjectManifestWriter } from '../manifest/project-manifest-writer.js';
import { MigrationFailedNoRollbackError } from '../manifest/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for MigrationRunner.run()
 */
export interface MigrationRunArgs {
  /** Absolute path to the project directory */
  projectDir: string;
  /** Current data schema version (before migration) */
  from: number;
  /** Target data schema version (after migration) */
  to: number;
}

/**
 * Result of a migration run - discriminated union.
 */
export type MigrationRunResult =
  | MigrationRunResultOK
  | MigrationRunResultFailedRolledBack
  | MigrationRunResultFailedNoRollback;

/**
 * Migration completed successfully.
 */
export interface MigrationRunResultOK {
  readonly kind: 'OK';
  readonly from: number;
  readonly to: number;
  readonly elapsedMs: number;
}

/**
 * Migration failed but rollback succeeded.
 */
export interface MigrationRunResultFailedRolledBack {
  readonly kind: 'FAILED_ROLLED_BACK';
  readonly pair: readonly [number, number];
  readonly elapsedMs: number;
  readonly logPath: string;
}

/**
 * Migration failed and rollback also failed.
 */
export interface MigrationRunResultFailedNoRollback {
  readonly kind: 'FAILED_NO_ROLLBACK';
  readonly pair: readonly [number, number];
  readonly elapsedMs: number;
  readonly logPath: string;
}

// =============================================================================
// MigrationRunner Class
// =============================================================================

/**
 * MigrationRunner executes migration chains with atomicity guarantees.
 *
 * Each migration step follows the atomic pattern (Design D6):
 * 1. Backup manifest + affected data files → *.pre-migration-N.bak
 * 2. Execute forward()
 * 3. On success: writeAfterMigration → delete backups
 * 4. On failure: restore from backups → log error → abort chain
 * 5. On rollback failure: preserve backups, log rollback error, throw MigrationFailedNoRollbackError
 */
export class MigrationRunner {
  private readonly registry: MigrationRegistry;
  private readonly projectDir: string;
  private readonly manifestDir: string;
  private readonly manifestPath: string;

  /**
   * Create a new MigrationRunner.
   *
   * @param projectDir - Absolute path to the project directory
   * @param registry - Optional migration registry (defaults to global registry)
   */
  constructor(projectDir: string, registry?: MigrationRegistry) {
    this.projectDir = projectDir;
    this.registry = registry ?? getMigrationRegistry();

    // specforge directory and manifest path
    this.manifestDir = path.join(projectDir, SPEC_DIR_NAME);
    this.manifestPath = path.join(this.manifestDir, LAYOUT.manifest);
  }

  /**
   * Run migration chain from `from` version to `to` version.
   *
   * Executes each migration script in ascending order of target version.
   * Each step is atomic (backup → forward → writeAfterMigration → cleanup).
   *
   * @param args - Migration run arguments
   * @returns MigrationRunResult indicating outcome
   * @throws MigrationFailedNoRollbackError if both migration and rollback fail
   */
  async run(args: MigrationRunArgs): Promise<MigrationRunResult> {
    const { projectDir, from, to } = args;

    // Validate version range
    if (from >= to) {
      // Nothing to do - return success immediately
      return {
        kind: 'OK',
        from,
        to,
        elapsedMs: 0,
      };
    }

    const startTime = Date.now();

    // Get migrations to run
    const migrations = this.registry.scriptsBetween(from, to);

    if (migrations.length === 0) {
      // No migrations needed - already at target or no scripts defined
      return {
        kind: 'OK',
        from,
        to,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Create error logger for this project
    const errorLogger = new MigrationErrorLogger(projectDir);

    // Execute each migration sequentially
    let currentVersion = from;

    for (const migration of migrations) {
      const targetVersion = migration.targetVersion;
      const pair: [number, number] = [currentVersion, targetVersion];

      try {
        // Execute single migration step (atomic)
        await this.executeStep({
          migration,
          currentVersion,
          targetVersion,
          errorLogger,
        });

        // Success - move to next version
        currentVersion = targetVersion;

      } catch (error) {
        const elapsedMs = Date.now() - startTime;

        // Migration step failed - determine if we can rollback
        const rollbackResult = await this.rollbackStep(projectDir, targetVersion, error as Error);

        if (rollbackResult.rollbackSucceeded) {
          // Rollback succeeded - log error (R13.2: any Migration_Chain error must
          // be appended to migration-error.log with schema_version="1.0" header)
          await errorLogger.append({
            pair,
            err: (error as Error).message,
            stack: (error as Error).stack ?? '',
            rollback: 'ok',
          });

          // Return FAILED_ROLLED_BACK
          return {
            kind: 'FAILED_ROLLED_BACK',
            pair,
            elapsedMs,
            logPath: errorLogger.logPath,
          };
        } else {
          // Rollback failed - return FAILED_NO_ROLLBACK and throw
          // Write error log with rollback failure info
          await errorLogger.append({
            pair,
            err: (error as Error).message,
            stack: (error as Error).stack ?? '',
            rollback: `failed:${rollbackResult.rollbackError?.message ?? 'unknown'}`,
          });

          // Throw the specific error
          throw new MigrationFailedNoRollbackError(
            pair,
            error as Error,
            `Migration failed without rollback: ${pair[0]} → ${pair[1]}: ${(error as Error).message}`
          );
        }
      }
    }

    // All migrations successful
    return {
      kind: 'OK',
      from,
      to,
      elapsedMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a single migration step with atomicity.
   *
   * Steps:
   * 1. Backup manifest and data files
   * 2. Execute migration.forward()
   * 3. On success: writeAfterMigration to update dsv, delete backups
   */
  private async executeStep(params: {
    migration: Migration;
    currentVersion: number;
    targetVersion: number;
    errorLogger: MigrationErrorLogger;
  }): Promise<void> {
    const { migration, currentVersion, targetVersion, errorLogger } = params;

    // Step 1: Backup files before migration
    const backupPaths = await this.backupAffectedFiles(targetVersion);

    // Step 2: Execute the migration forward
    // Create migration context with caller token
    const ctx = createMigrationContext(
      this.projectDir,
      currentVersion,
      targetVersion
    );

    try {
      // Run the migration forward
      await migration.forward(ctx);

      // Step 3: Write the updated data_schema_version after successful migration
      // This also writes updated_at to current ISO 8601 (R4.3)
      await this.writeAfterMigration(targetVersion, ctx.callerToken);

      // Step 4: Cleanup - delete backup files on success
      await this.cleanupBackups(backupPaths);

    } catch (error) {
      // Migration failed - cleanup will be handled by caller
      throw error;
    }
  }

  /**
   * Backup affected files before migration step.
   *
   * Backs up:
   * - Project manifest
   * - Any .json files in the project directory
   *
   * Backup files are named: *.pre-migration-N.bak
   */
  private async backupAffectedFiles(targetVersion: number): Promise<BackupPaths> {
    const backupDir = this.projectDir;
    const backupSuffix = `.pre-migration-${targetVersion}.bak`;

    const backups: BackupPaths = {
      manifest: null,
      dataFiles: [],
    };

    // Backup manifest if it exists
    try {
      await fs.access(this.manifestPath);
      const manifestBackupPath = this.manifestPath + backupSuffix;
      await fs.copyFile(this.manifestPath, manifestBackupPath);
      backups.manifest = manifestBackupPath;
    } catch {
      // Manifest doesn't exist yet - no backup needed
    }

    // Backup data files (.json) in project directory
    try {
      const entries = await fs.readdir(this.projectDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'package.json') {
          const fullPath = path.join(this.projectDir, entry.name);
          const backupPath = fullPath + backupSuffix;
          await fs.copyFile(fullPath, backupPath);
          backups.dataFiles.push(backupPath);
        }
      }
    } catch {
      // No data files or directory not readable - continue
    }

    return backups;
  }

  /**
   * Restore files from backup (rollback).
   *
   * @param targetVersion - The version number used in backup suffix
   * @returns Object indicating success/failure and any error
   */
  private async rollbackStep(
    projectDir: string,
    targetVersion: number,
    originalError: Error
  ): Promise<{ rollbackSucceeded: boolean; rollbackError?: Error }> {
    const backupSuffix = `.pre-migration-${targetVersion}.bak`;

    try {
      // Restore manifest
      const manifestBackupPath = this.manifestPath + backupSuffix;
      try {
        await fs.access(manifestBackupPath);
        await fs.copyFile(manifestBackupPath, this.manifestPath);
        // Keep the backup - don't delete it (D6: preserve for manual recovery)
      } catch {
        // No manifest backup exists
      }

      // Restore data files
      try {
        const entries = await fs.readdir(this.projectDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'package.json') {
            const fullPath = path.join(this.projectDir, entry.name);
            const backupPath = fullPath + backupSuffix;
            try {
              await fs.access(backupPath);
              await fs.copyFile(backupPath, fullPath);
            } catch {
              // No backup for this file
            }
          }
        }
      } catch {
        // Directory not readable
      }

      // Rollback succeeded
      return { rollbackSucceeded: true };

    } catch (error) {
      // Rollback failed
      return {
        rollbackSucceeded: false,
        rollbackError: error as Error,
      };
    }
  }

  /**
   * Write data_schema_version after successful migration.
   *
   * This updates the manifest to the new version and sets updated_at
   * to current ISO 8601 timestamp (R4.3).
   */
  private async writeAfterMigration(targetVersion: number, callerToken: symbol): Promise<void> {
    // Ensure specforge directory exists
    await fs.mkdir(this.manifestDir, { recursive: true });

    // Use ProjectManifestWriter.writeAfterMigration
    // This writes both data_schema_version AND updated_at atomically
    await ProjectManifestWriter.writeAfterMigration(
      this.manifestPath,
      targetVersion - 1, // prev version
      targetVersion,     // target version
      callerToken        // token from MigrationContext
    );
  }

  /**
   * Cleanup backup files after successful migration.
   */
  private async cleanupBackups(backups: BackupPaths): Promise<void> {
    // Delete manifest backup
    if (backups.manifest) {
      try {
        await fs.unlink(backups.manifest);
      } catch {
        // Best effort cleanup
      }
    }

    // Delete data file backups
    for (const backupPath of backups.dataFiles) {
      try {
        await fs.unlink(backupPath);
      } catch {
        // Best effort cleanup
      }
    }
  }
}

// =============================================================================
// Backup Paths Type
// =============================================================================

/**
 * Tracks paths of backup files created during migration.
 */
interface BackupPaths {
  /** Path to manifest backup, or null if no manifest existed */
  manifest: string | null;
  /** Paths to data file backups */
  dataFiles: string[];
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new MigrationRunner for a project.
 *
 * @param projectDir - Absolute path to the project directory
 * @param registry - Optional migration registry (defaults to global)
 * @returns A new MigrationRunner instance
 */
export function createMigrationRunner(
  projectDir: string,
  registry?: MigrationRegistry
): MigrationRunner {
  return new MigrationRunner(projectDir, registry);
}

/**
 * Run a migration chain.
 *
 * This is a convenience function that creates a runner and executes the chain.
 *
 * @param args - Migration run arguments
 * @param registry - Optional migration registry
 * @returns MigrationRunResult
 */
export async function runMigration(
  args: MigrationRunArgs,
  registry?: MigrationRegistry
): Promise<MigrationRunResult> {
  const runner = new MigrationRunner(args.projectDir, registry);
  return runner.run(args);
}