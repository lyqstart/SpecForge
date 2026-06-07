/**
 * required-files.ts — Required files validation for workflow paths
 *
 * Provides utilities to look up and validate the required spec files
 * for a given workflow type, based on the WI_REQUIRED_FILES registry.
 */

import { WI_REQUIRED_FILES } from './project-layout.js';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Returns the list of required file names for a given workflow path.
 * Returns an empty array if the workflow path is unknown.
 */
export function getRequiredFiles(workflowPath: string): string[] {
  return WI_REQUIRED_FILES[workflowPath] ?? [];
}

/**
 * Validates that all required files exist in the given Work Item directory.
 *
 * @param workItemDir - Absolute path to the Work Item directory
 * @param workflowPath - The workflow_path value (e.g. 'feature_spec')
 * @returns Object with arrays of missing and found file names
 */
export async function validateRequiredFiles(
  workItemDir: string,
  workflowPath: string,
): Promise<{ missing: string[]; found: string[] }> {
  const required = getRequiredFiles(workflowPath);
  const missing: string[] = [];
  const found: string[] = [];

  for (const file of required) {
    try {
      await access(join(workItemDir, file));
      found.push(file);
    } catch {
      missing.push(file);
    }
  }

  return { missing, found };
}
