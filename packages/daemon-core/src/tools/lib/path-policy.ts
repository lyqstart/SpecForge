/**
 * path-policy.ts — Path policy enforcement for SpecForge
 *
 * Validates file paths against the §1.6 path policy rules:
 * 1. No backslashes (POSIX style only)
 * 2. No absolute paths
 * 3. No parent traversal (..)
 * 4. No home expansion (~)
 * 5. Must have .specforge/ prefix
 * 6. Must not reference forbidden directories
 */

import { isAbsolute } from 'node:path';
import { MVP_FORBIDDEN_DIRS } from './project-layout.js';

/**
 * Result of path policy validation.
 */
export interface PathPolicyResult {
  valid: boolean;
  violations: string[];
}

/**
 * Enforce path policy rules (§1.6) on the given file path.
 *
 * @param filePath - The file path to validate
 * @returns Validation result with list of any violations found
 */
export function enforcePathPolicy(filePath: string): PathPolicyResult {
  const violations: string[] = [];

  // Rule 1: No backslashes
  if (filePath.includes('\\')) {
    violations.push('backslash not allowed');
  }

  // Rule 2: No absolute paths
  if (isAbsolute(filePath)) {
    violations.push('absolute paths not allowed');
  }

  // Rule 3: No parent traversal
  if (filePath.includes('..')) {
    violations.push('parent traversal not allowed');
  }

  // Rule 4: No home expansion
  if (filePath.includes('~')) {
    violations.push('home expansion not allowed');
  }

  // Rule 5: Must have .specforge/ prefix
  if (!filePath.includes('.specforge/')) {
    violations.push('must have .specforge/ prefix');
  }

  // Rule 6: No forbidden directories
  for (const dir of MVP_FORBIDDEN_DIRS) {
    if (filePath.includes(dir)) {
      violations.push(`forbidden dir: ${dir}`);
    }
  }

  return { valid: violations.length === 0, violations };
}
