/**
 * path-service.ts — Path resolution service for SpecForge Work Items
 *
 * Provides functions to resolve paths within the .specforge directory
 * structure, specifically for Work Item spec files.
 */

import { join } from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types';

/**
 * Interface for a path resolution service.
 * Implementations provide methods to resolve Work Item and spec directory paths.
 */
export interface PathService {
  resolveWIPath(baseDir: string, workItemId: string, fileName: string): string;
  resolveSpecDir(baseDir: string): string;
}

/**
 * Resolve the full path to a Work Item spec file.
 *
 * @param baseDir - Project root directory
 * @param workItemId - Work Item identifier (e.g. "WI-001")
 * @param fileName - File name within the Work Item directory
 * @returns Absolute path to the spec file
 */
export function resolveWIPath(
  baseDir: string,
  workItemId: string,
  fileName: string,
): string {
  return join(baseDir, SPEC_DIR_NAME, 'specs', workItemId, fileName);
}

/**
 * Resolve the .specforge/specs root directory path.
 *
 * @param baseDir - Project root directory
 * @returns Absolute path to the specs directory
 */
export function resolveSpecDir(baseDir: string): string {
  return join(baseDir, SPEC_DIR_NAME, 'specs');
}
