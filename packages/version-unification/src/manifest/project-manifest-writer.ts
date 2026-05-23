/**
 * Project Manifest Writer.
 * 
 * Provides atomic write operations for Project Manifest files.
 * - Validates manifest structure before writing
 * - Uses atomic write to ensure consistency
 * - Enforces monotonicity of data_schema_version (R7.3)
 * - Enforces call-site restrictions (R7.2)
 * - Supports dual-write for legacy compatibility during migration cycles
 *
 * @see requirements.md §Requirements 2.1, 2.4, 7.1, 7.2, 7.3, 7.5, 11.2, 15.1, 15.2
 * @see design.md §Components.project-manifest-writer.ts
 */

import { validateProjectManifest } from './schema-validator.js';
import { atomicWrite } from './atomic-write.js';
import {
  DataSchemaMonotonicError,
  IllegalWriterCallSiteError,
  type ProjectManifest,
} from './types.js';

/**
 * Token symbol for valid migration context.
 * 
 * This symbol is used to verify that writeAfterMigration is only called
 * from within a MigrationContext (R7.2). The symbol is not exported from
 * the module - it's created in migration/context.ts and passed through.
 */
const MIGRATION_CONTEXT_TOKEN = Symbol('MigrationContext');

/**
 * Creates a valid caller token for writeAfterMigration.
 * 
 * This function is used by MigrationContext to generate a valid token
 * that can be passed to writeAfterMigration to prove the call originates
 * from a migration context.
 * 
 * @returns A symbol token that can be passed to writeAfterMigration
 */
export function createMigrationCallerToken(): symbol {
  return MIGRATION_CONTEXT_TOKEN;
}

/**
 * Validates that a caller token is from a valid MigrationContext.
 * 
 * @internal - Used by MigrationContext to validate call sites
 */
export function validateCallerToken(token: unknown): void {
  if (token !== MIGRATION_CONTEXT_TOKEN) {
    throw new IllegalWriterCallSiteError(
      typeof token === 'symbol' ? token : (typeof token === 'string' ? token : String(token)),
      'writeAfterMigration must be called from a valid MigrationContext'
    );
  }
}

/**
 * Project Manifest Writer.
 * 
 * Handles atomic writing of project manifest files with validation.
 */
export class ProjectManifestWriter {
  /**
   * Creates a fresh Project Manifest for R15 initialization.
   * 
   * This method is used when no Project_Manifest exists yet and we need
   * to initialize one for a new project. It NEVER modifies an existing
   * manifest's data_schema_version - it only creates new manifests.
   * 
   * The initial dsv is set to the provided value (typically HIGHEST_KNOWN_SCHEMA).
   *
   * @param path - The target file path
   * @param dsv - The initial data_schema_version to set
   * @returns Promise that resolves when write completes
   * @throws Error if write operation fails
   */
  static async writeFresh(path: string, dsv: number): Promise<void> {
    // Validate dsv is a non-negative integer
    if (!Number.isInteger(dsv) || dsv < 0) {
      throw new Error(
        `writeFresh: data_schema_version must be a non-negative integer, got ${dsv}`
      );
    }

    // Generate current timestamps
    const now = new Date().toISOString();

    // Create the manifest object
    const manifest: ProjectManifest = {
      data_schema_version: dsv,
      initialized_at: now,
      updated_at: now,
    };

    // Serialize and write atomically
    const content = JSON.stringify(manifest, null, 2);
    await atomicWrite(path, content);
  }

  /**
   * Writes data_schema_version after successful migration (R7.2, R7.3, R7.5).
   * 
   * This method should ONLY be called from MigrationContext after a migration
   * script completes successfully. It enforces:
   * - target > prev (monotonic, R7.3)
   * - callerToken comes from MigrationContext (R7.2)
   * - Atomic write of both data_schema_version AND updated_at (R7.5)
   *
   * @param path - The target file path
   * @param prev - The previous data_schema_version
   * @param target - The target data_schema_version (must be > prev)
   * @param callerToken - Token proving the call is from MigrationContext
   * @returns Promise that resolves when write completes
   * @throws DataSchemaMonotonicError if target <= prev
   * @throws IllegalWriterCallSiteError if callerToken is not from MigrationContext
   * @throws Error if write operation fails
   */
  static async writeAfterMigration(
    path: string,
    prev: number,
    target: number,
    callerToken: unknown
  ): Promise<void> {
    // Validate caller token (R7.2)
    validateCallerToken(callerToken);

    // Validate monotonicity (R7.3)
    if (target <= prev) {
      throw new DataSchemaMonotonicError(
        prev,
        target,
        `writeAfterMigration: target version (${target}) must be greater than previous version (${prev})`
      );
    }

    // Validate versions are non-negative integers
    if (!Number.isInteger(prev) || prev < 0) {
      throw new Error(
        `writeAfterMigration: prev must be a non-negative integer, got ${prev}`
      );
    }
    if (!Number.isInteger(target) || target < 0) {
      throw new Error(
        `writeAfterMigration: target must be a non-negative integer, got ${target}`
      );
    }

    // Generate current timestamp
    const now = new Date().toISOString();

    // Create the updated manifest (R7.5: same atomic write for both fields)
    let manifest: ProjectManifest = {
      data_schema_version: target,
      initialized_at: now,
      updated_at: now,
    };

    // Try to read existing manifest to preserve initialized_at
    try {
      const { readFile } = await import('node:fs/promises');
      const existing = await readFile(path, 'utf-8').then(JSON.parse) as ProjectManifest | null;
      if (existing && existing.initialized_at) {
        manifest = {
          ...manifest,
          initialized_at: existing.initialized_at,
        };
      }
    } catch {
      // If read fails, use current timestamp for initialized_at (new manifest case)
    }

    // Serialize and write atomically (R7.5)
    const content = JSON.stringify(manifest, null, 2);
    await atomicWrite(path, content);
  }

  /**
   * Dual-write for legacy compatibility (Cycle 1, R11.2).
   * 
   * Writes both the new format manifest AND a legacy format copy
   * to support gradual migration during release cycle 1.
   * 
   * The new format is written to the primary path,
   * and legacy format is written to path + '.legacy'.
   *
   * @param path - The primary target file path
   * @param manifest - The Project Manifest to write (new format)
   * @param legacy - The legacy format manifest to also write
   * @returns Promise that resolves when both writes complete
   */
  static async writeDualWrite(
    path: string,
    manifest: unknown,
    legacy: unknown
  ): Promise<void> {
    // Validate both manifests
    const validatedNew = validateProjectManifest(manifest);
    const validatedLegacy = validateProjectManifest(legacy);
    
    // Serialize both formats
    const newContent = JSON.stringify(validatedNew, null, 2);
    const legacyContent = JSON.stringify(validatedLegacy, null, 2);
    
    // Determine legacy path
    const legacyPath = `${path}.legacy`;
    
    // Write both atomically (in parallel for performance)
    await Promise.all([
      atomicWrite(path, newContent),
      atomicWrite(legacyPath, legacyContent),
    ]);
  }
}

// Re-export for use by migration/context.ts
export { MIGRATION_CONTEXT_TOKEN };