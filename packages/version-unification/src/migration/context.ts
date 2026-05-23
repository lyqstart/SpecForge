/**
 * Migration Context Helper.
 *
 * Provides file system operations for migration scripts:
 * - readJson: Read JSON files relative to projectDir
 * - writeJson: Write JSON files using atomicWrite
 * - listDataFiles: List data files in a subdirectory
 * - checkAtTarget: Check if data is already at target schema version
 *
 * Also exposes callerToken for writeAfterMigration call-site validation (R7.2).
 *
 * @see Requirements 4.4, 7.2
 * @see design.md §migration/context.ts
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { atomicWrite } from '../manifest/atomic-write.js';
import { readProject } from '../manifest/manifest-reader.js';
import {
  createMigrationCallerToken,
  type ProjectManifestWriter,
} from '../manifest/project-manifest-writer.js';

/**
 * Creates a new MigrationContext for running migration scripts.
 *
 * @param projectDir - Absolute path to the project directory
 * @param fromVersion - Current data schema version (before migration)
 * @param toVersion - Target data schema version (after migration)
 * @returns MigrationContext instance
 */
export function createMigrationContext(
  projectDir: string,
  fromVersion: number,
  toVersion: number
): MigrationContextImpl {
  return new MigrationContextImpl(projectDir, fromVersion, toVersion);
}

/**
 * Implementation of MigrationContext.
 */
class MigrationContextImpl {
  readonly projectDir: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly callerToken: symbol;

  constructor(projectDir: string, fromVersion: number, toVersion: number) {
    this.projectDir = projectDir;
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
    this.callerToken = createMigrationCallerToken();
  }

  /**
   * Read a JSON file relative to projectDir.
   *
   * @param relativePath - Path relative to projectDir
   * @returns Parsed JSON content
   * @throws Error if file cannot be read or parsed
   */
  async readJson(relativePath: string): Promise<unknown> {
    const fullPath = path.resolve(this.projectDir, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Write a JSON file relative to projectDir using atomic write.
   *
   * @param relativePath - Path relative to projectDir
   * @param value - Value to serialize as JSON
   * @throws Error if write operation fails
   */
  async writeJson(relativePath: string, value: unknown): Promise<void> {
    const fullPath = path.resolve(this.projectDir, relativePath);
    const content = JSON.stringify(value, null, 2);
    await atomicWrite(fullPath, content);
  }

  /**
   * List all data files in a subdirectory.
   *
   * Scans for files with .json extension in the specified subdirectory.
   *
   * @param subdir - Optional subdirectory within projectDir (default: '')
   * @returns Array of relative file paths
   * @throws Error if directory cannot be read
   */
  async listDataFiles(subdir: string = ''): Promise<readonly string[]> {
    const fullPath = subdir
      ? path.resolve(this.projectDir, subdir)
      : this.projectDir;

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => path.join(subdir, entry.name));
    } catch (err) {
      // Directory doesn't exist or cannot be read - return empty array
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * Check if the data is already at the target schema version.
   *
   * Reads the Project_Manifest and compares its data_schema_version
   * with the target version of this migration.
   *
   * @returns true if data_schema_version >= toVersion
   * @throws Error if Project_Manifest cannot be read
   */
  async checkAtTarget(): Promise<boolean> {
    const manifestPath = path.join(this.projectDir, '.specforge', 'manifest.json');

    try {
      const manifest = await readProject(manifestPath);
      return manifest.data_schema_version >= this.toVersion;
    } catch (err) {
      // If manifest doesn't exist, we're not at target
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      // Re-throw other errors
      throw err;
    }
  }
}

/**
 * MigrationContext interface used by migration scripts.
 */
export interface MigrationContext {
  /** Absolute path to the project directory */
  readonly projectDir: string;
  /** Current data schema version (before migration) */
  readonly fromVersion: number;
  /** Target data schema version (after migration) */
  readonly toVersion: number;
  /** Token to pass to writeAfterMigration for call-site validation */
  readonly callerToken: symbol;

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