/**
 * User Manifest Writer.
 * 
 * Provides atomic write operations for User Manifest files.
 * - Validates manifest structure before writing
 * - Uses atomic write to ensure consistency
 * - Supports dual-write for legacy compatibility during migration cycles
 *
 * @see requirements.md §Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 11.2
 * @see design.md §Components.user-manifest-writer.ts
 */

import { validateUserManifest } from './schema-validator.js';
import { atomicWrite } from './atomic-write.js';
import { type UserManifest } from './types.js';

/**
 * User Manifest Writer.
 * 
 * Handles atomic writing of user manifest files with validation.
 */
export class UserManifestWriter {
  /**
   * Writes a User Manifest to the specified path atomically.
   * 
   * Validates the manifest structure before writing.
   * Uses atomic write to ensure the file is either fully written or not touched
   * on failure (R4.5).
   *
   * @param path - The target file path
   * @param manifest - The User Manifest to write
   * @returns Promise that resolves when write completes
   * @throws InvalidManifestFieldError if manifest validation fails
   * @throws Error if write operation fails
   */
  static async write(path: string, manifest: unknown): Promise<void> {
    // Validate manifest structure first (R1.1, R1.2, R1.3, R1.4, R1.5, R1.6)
    const validated = validateUserManifest(manifest);
    
    // Serialize to JSON with pretty formatting for readability
    const content = JSON.stringify(validated, null, 2);
    
    // Atomically write to target
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
   * @param manifest - The User Manifest to write (new format)
   * @param legacy - The legacy format manifest to also write
   * @returns Promise that resolves when both writes complete
   */
  static async writeDualWrite(
    path: string,
    manifest: unknown,
    legacy: unknown
  ): Promise<void> {
    // Validate both manifests
    const validatedNew = validateUserManifest(manifest);
    const validatedLegacy = validateUserManifest(legacy);
    
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