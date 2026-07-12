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

import * as fs from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { projectSpecManifest } from '@specforge/types/directory-layout';
import { MVP_FORBIDDEN_DIRS } from './project-layout.js';
import {
  enforceWritePolicy as canonicalEnforceWritePolicy,
  type WritePolicyResult,
} from './write-guard-v11.js';

/**
 * Result of path policy validation.
 */
export interface PathPolicyResult {
  valid: boolean;
  violations: string[];
}

const MODULE_SPEC_TARGET_KEYS = new Set([
  'module_file',
  'requirements',
  'requirements_file',
  'design',
  'design_file',
  'trace',
  'trace_file',
  'tasks',
  'tasks_file',
]);

export function normalizeProjectSpecTargetPath(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('.specforge/project/')) return normalized;
  if (normalized.startsWith('project/')) return `.specforge/${normalized}`;
  return normalized;
}

export async function readDeclaredProjectSpecTargetPaths(
  projectRoot: string
): Promise<Set<string>> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(projectSpecManifest(projectRoot), 'utf-8')
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Set();

    const manifest = parsed as Record<string, unknown>;
    const declared = new Set<string>();
    const projectValue = manifest['project'];
    if (projectValue && typeof projectValue === 'object' && !Array.isArray(projectValue)) {
      for (const target of Object.values(projectValue as Record<string, unknown>)) {
        const normalized = normalizeProjectSpecTargetPath(target);
        if (normalized) declared.add(normalized);
      }
    }

    const modulesValue = manifest['modules'];
    const modules: unknown[] = Array.isArray(modulesValue) ? modulesValue : [];
    for (const moduleEntry of modules) {
      if (!moduleEntry || typeof moduleEntry !== 'object' || Array.isArray(moduleEntry)) continue;
      for (const [key, target] of Object.entries(moduleEntry as Record<string, unknown>)) {
        if (!MODULE_SPEC_TARGET_KEYS.has(key)) continue;
        const normalized = normalizeProjectSpecTargetPath(target);
        if (normalized) declared.add(normalized);
      }
    }

    return declared;
  } catch {
    return new Set();
  }
}

export async function isDeclaredProjectSpecTargetPath(
  projectRoot: string,
  targetPath: unknown
): Promise<boolean> {
  const normalized = normalizeProjectSpecTargetPath(targetPath);
  if (!normalized) return false;
  const declared = await readDeclaredProjectSpecTargetPaths(projectRoot);
  return declared.has(normalized);
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

/**
 * Re-export WritePolicyResult from the canonical write-guard-v11 module.
 * Kept for backward compatibility with existing consumers of path-policy.ts.
 */
export type { WritePolicyResult } from './write-guard-v11.js';

/**
 * Enforce write policy by delegating to the canonical `enforceWritePolicy`
 * in write-guard-v11.ts.
 *
 * This is the single judgment entry point for the flat-parameter convention
 * used by path-policy.ts consumers. All actual logic lives in checkWrite().
 */
export const enforceWritePolicy = canonicalEnforceWritePolicy;
