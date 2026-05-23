/**
 * Legacy Manifest Migrator.
 *
 * Provides functions to detect and migrate legacy manifest formats
 * across three release cycles:
 * - Cycle 1 (DUAL_WRITE): Write both new and legacy fields
 * - Cycle 2 (READ_OLD_WRITE_NEW): Read legacy fields, write only new, emit deprecation warning
 * - Cycle 3 (IN_PLACE_CONVERT): Convert legacy manifests in-place with backup
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 * @see design.md §Legacy Migrator
 */

import * as fs from 'node:fs/promises';
import { atomicWrite } from '../manifest/atomic-write.js';
import { createLegacyBackup } from './backup.js';
import { isLegacy } from './detector.js';
import { getCurrentReleaseCycle, type ReleaseCycleBehavior } from './release-cycle-policy.js';
import {
  LEGACY_FIELDS_USER,
  LEGACY_FIELDS_PROJECT,
  USER_MANIFEST_FIELDS,
  PROJECT_MANIFEST_FIELDS,
  type UserManifest,
  type ProjectManifest,
} from '../manifest/types.js';

/**
 * Module-level set to track paths that have already emitted deprecation warnings.
 * This ensures we only emit one warning per path per process invocation (R11.3).
 */
const warnedPaths: Set<string> = new Set();

/**
 * Emit a deprecation warning for a legacy manifest.
 * Only emits once per unique path per process.
 *
 * @param path - The path to the legacy manifest
 * @param manifestType - Type of manifest ('user' or 'project')
 */
function emitDeprecationWarning(path: string, manifestType: 'user' | 'project'): void {
  if (warnedPaths.has(path)) {
    return; // Already warned for this path
  }

  warnedPaths.add(path);

  const legacyFields = manifestType === 'user'
    ? LEGACY_FIELDS_USER
    : LEGACY_FIELDS_PROJECT;

  console.warn(
    `[Deprecation Warning] Legacy manifest detected at ${path}. ` +
    `The following fields are deprecated and will be removed in a future release: ` +
    `${legacyFields.join(', ')}. ` +
    `Please migrate to the new format.`
  );
}

/**
 * Converts a legacy user manifest to new format by extracting relevant fields.
 *
 * @param rawJson - The raw legacy manifest JSON
 * @returns A clean UserManifest with only allowed fields
 */
function convertLegacyUserManifest(rawJson: Record<string, unknown>): UserManifest {
  // Extract only the allowed fields from legacy manifest
  // For user manifest, the allowed fields are the "new" format
  const allowedFields = new Set([...USER_MANIFEST_FIELDS]);

  // Build the new format manifest
  const newManifest: Record<string, unknown> = {};

  for (const field of USER_MANIFEST_FIELDS) {
    // If the field exists in legacy format, use it; otherwise use default
    if (field in rawJson) {
      newManifest[field] = rawJson[field];
    } else if (field === 'files') {
      newManifest[field] = [];
    }
  }

  return newManifest as unknown as UserManifest;
}

/**
 * Converts a legacy project manifest to new format by extracting relevant fields.
 *
 * @param rawJson - The raw legacy manifest JSON
 * @returns A clean ProjectManifest with only allowed fields
 */
function convertLegacyProjectManifest(rawJson: Record<string, unknown>): ProjectManifest {
  // Build the new format manifest
  const newManifest: Record<string, unknown> = {};

  for (const field of PROJECT_MANIFEST_FIELDS) {
    // If the field exists in legacy format, use it; otherwise use default
    if (field in rawJson) {
      newManifest[field] = rawJson[field];
    } else if (field === 'data_schema_version') {
      newManifest[field] = 0; // Default to schema 0
    }
  }

  // Generate timestamps if not present
  const now = new Date().toISOString();
  if (!newManifest.initialized_at) {
    newManifest.initialized_at = now;
  }
  if (!newManifest.updated_at) {
    newManifest.updated_at = now;
  }

  return newManifest as unknown as ProjectManifest;
}

/**
 * Determines if a manifest is a user or project manifest based on its fields.
 *
 * @param rawJson - The raw manifest JSON
 * @returns 'user' or 'project'
 */
function determineManifestType(rawJson: Record<string, unknown>): 'user' | 'project' {
  // If it has code_version and min_supported_data_schema, it's likely a user manifest
  if ('code_version' in rawJson && 'min_supported_data_schema' in rawJson) {
    return 'user';
  }
  // If it has data_schema_version, it's a project manifest
  if ('data_schema_version' in rawJson) {
    return 'project';
  }
  // Default to project if unclear (has fewer fields)
  return 'project';
}

/**
 * ManifestMigrator provides migration functionality for legacy manifest formats.
 *
 * It handles:
 * - Reading: Detect legacy manifests and convert them based on release cycle
 * - Writing: Apply dual-write or new-only policies based on release cycle
 * - In-place conversion: Convert legacy manifests to new format with backup
 */
export class ManifestMigrator {
  /**
   * Migrate a manifest on read.
   *
   * This is the main entry point for handling legacy manifests during startup.
   * It detects legacy format and applies the appropriate migration strategy
   * based on the current release cycle.
   *
   * @param rawJson - The raw JSON object parsed from the manifest file
   * @param manifestPath - The path to the manifest file (for logging/backup)
   * @returns The migrated manifest (either legacy-compatible or new format)
   *
   * @example
   * ```typescript
   * const rawJson = JSON.parse(await fs.readFile(path, 'utf-8'));
   * const migrated = await ManifestMigrator.migrateOnRead(rawJson, path);
   * ```
   */
  static async migrateOnRead(
    rawJson: Record<string, unknown>,
    manifestPath: string
  ): Promise<UserManifest | ProjectManifest> {
    // Check if this is a legacy manifest
    if (!isLegacy(rawJson)) {
      // Not legacy - return as-is (may already be new format)
      return rawJson as unknown as UserManifest | ProjectManifest;
    }

    // This is a legacy manifest - apply cycle-specific behavior
    const cycle = getCurrentReleaseCycle();
    const manifestType = determineManifestType(rawJson);

    switch (cycle) {
      case 'DUAL_WRITE':
        // Cycle 1: Both new and legacy fields are present in the file
        // The reader will pick new fields when available
        // Just return the raw JSON (contains both formats)
        return rawJson as unknown as UserManifest | ProjectManifest;

      case 'READ_OLD_WRITE_NEW':
        // Cycle 2: Read legacy fields but convert to new format on write
        // Emit single deprecation warning per path
        emitDeprecationWarning(manifestPath, manifestType);

        // Convert to new format in memory
        if (manifestType === 'user') {
          return convertLegacyUserManifest(rawJson);
        } else {
          return convertLegacyProjectManifest(rawJson);
        }

      case 'IN_PLACE_CONVERT':
        // Cycle 3: Convert in-place at startup
        await this.inPlaceConvert(manifestPath);
        // After conversion, read and return the new format
        // Note: The file has been converted, so we need to read it again
        const converted = await fs.readFile(manifestPath, 'utf-8');
        return JSON.parse(converted) as unknown as UserManifest | ProjectManifest;

      default:
        // Should not reach here, but handle gracefully
        return rawJson as unknown as UserManifest | ProjectManifest;
    }
  }

  /**
   * Decorate a manifest for writing based on current release cycle.
   *
   * This determines what fields to write:
   * - Cycle 1: Both new and legacy fields (dual-write)
   * - Cycle 2/3: Only new fields
   *
   * @param manifest - The manifest to prepare for writing
   * @returns The manifest shape to write (with or without legacy fields)
   *
   * @example
   * ```typescript
   * const manifest = { code_version: '6.0.0', ... };
   * const toWrite = ManifestMigrator.decorateOnWrite(manifest);
   * await writer.write(path, toWrite);
   * ```
   */
  static decorateOnWrite(
    manifest: UserManifest | ProjectManifest
  ): Record<string, unknown> {
    const cycle = getCurrentReleaseCycle();
    const manifestObj = manifest as unknown as Record<string, unknown>;

    if (cycle === 'DUAL_WRITE') {
      // Cycle 1: Add legacy fields alongside new fields
      return this.addLegacyFields(manifestObj);
    } else {
      // Cycle 2/3: Only new fields (legacy already converted or will be on read)
      return manifestObj;
    }
  }

  /**
   * Adds legacy fields to a manifest for dual-write (Cycle 1).
   *
   * @param manifest - The new format manifest
   * @returns The manifest with legacy fields added
   */
  private static addLegacyFields(manifest: Record<string, unknown>): Record<string, unknown> {
    // Create a copy to avoid mutating the original
    const result: Record<string, unknown> = { ...manifest };

    // Add legacy fields for user manifest
    if ('code_version' in manifest && 'min_supported_data_schema' in manifest) {
      result['shared_version'] = manifest['code_version'];
      result['required_shared_version_range'] = `>=${manifest['min_supported_data_schema']}.0.0`;
      result['schema_version'] = '1.0';
      result['runtime_schema_version'] = '1.0';
    }

    // Add legacy fields for project manifest
    if ('data_schema_version' in manifest) {
      result['code_version'] = manifest['code_version'] ?? '6.0.0';
      result['shared_version'] = manifest['code_version'] ?? '6.0.0';
      result['required_shared_version_range'] = `>=${manifest['data_schema_version']}.0.0`;
      result['schema_version'] = '1.0';
      result['runtime_schema_version'] = '1.0';
    }

    return result;
  }

  /**
   * In-place conversion of a legacy manifest to new format (Cycle 3).
   *
   * This function:
   * 1. Creates a byte-identical backup (.legacy.bak)
   * 2. Reads the legacy manifest
   * 3. Converts to new format
   * 4. Writes the new format in-place
   *
   * After this operation:
   * - The original file is replaced with new format
   * - A .legacy.bak backup exists with original content
   * - Future reads will see the new format
   *
   * @param manifestPath - The path to the manifest file to convert
   * @throws Error if backup or conversion fails
   *
   * @example
   * ```typescript
   * // Called during startup in Cycle 3 when legacy manifest is detected
   * await ManifestMigrator.inPlaceConvert(projectManifestPath);
   * ```
   */
  static async inPlaceConvert(manifestPath: string): Promise<void> {
    // Step 1: Create backup BEFORE any modifications (R11.5)
    await createLegacyBackup(manifestPath);

    // Step 2: Read the legacy manifest
    const content = await fs.readFile(manifestPath, 'utf-8');
    const legacyJson = JSON.parse(content) as Record<string, unknown>;

    // Step 3: Determine type and convert
    const manifestType = determineManifestType(legacyJson);
    let newManifest: Record<string, unknown>;

    if (manifestType === 'user') {
      newManifest = convertLegacyUserManifest(legacyJson) as unknown as Record<string, unknown>;
    } else {
      newManifest = convertLegacyProjectManifest(legacyJson) as unknown as Record<string, unknown>;
    }

    // Step 4: Write new format in-place using atomic write
    const newContent = JSON.stringify(newManifest, null, 2);
    await atomicWrite(manifestPath, newContent);
  }
}

/**
 * Convenience function to get the current release cycle behavior.
 * Useful for testing and external callers.
 *
 * @returns The current release cycle behavior
 */
export function getCurrentCycleBehavior(): ReleaseCycleBehavior {
  return getCurrentReleaseCycle();
}

/**
 * Reset the warned paths set (useful for testing).
 *
 * @internal - Only for testing purposes
 */
export function _resetWarnedPaths(): void {
  warnedPaths.clear();
}

/**
 * Get the set of warned paths (useful for testing).
 *
 * @internal - Only for testing purposes
 */
export function _getWarnedPaths(): Set<string> {
  return new Set(warnedPaths);
}