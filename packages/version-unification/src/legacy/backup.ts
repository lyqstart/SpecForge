/**
 * Legacy manifest backup utility.
 * 
 * Creates byte-identical backups of manifest files before in-place conversion.
 * This is a critical safety mechanism that preserves the original manifest
 * in case the conversion fails or needs to be rolled back.
 * 
 * @see Requirements 11.5, 12.3
 * @see design.md §"<manifest>.legacy.bak"
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Creates a legacy backup of a manifest file.
 * 
 * The backup is created at `<manifestPath>.legacy.bak` with byte-identical content.
 * No metadata is appended to the backup file - it's an exact copy.
 * 
 * This function should be called **strictly before** rewriting the manifest
 * in the in-place conversion process (cycle 3).
 * 
 * @param manifestPath - The path to the manifest file to backup
 * @returns The path to the created backup file
 * @throws Error if the source file doesn't exist or copy fails
 * 
 * @example
 * ```typescript
 * // Before in-place conversion in cycle 3
 * const backupPath = await createLegacyBackup(userManifestPath);
 * console.log(`Backup created at: ${backupPath}`);
 * 
 * // Now safely perform in-place conversion
 * await atomicWrite(manifestPath, newFormatContent);
 * ```
 */
export async function createLegacyBackup(manifestPath: string): Promise<string> {
  const backupPath = `${manifestPath}.legacy.bak`;
  
  // Use copyFile for byte-identical copy (no parsing/serialization overhead)
  await fs.copyFile(manifestPath, backupPath);
  
  return backupPath;
}