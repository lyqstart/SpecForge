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

/**
 * Result of write policy enforcement.
 */
export interface WritePolicyResult {
  allowed: boolean;
  violations: string[];
}

/**
 * Enforce write policy based on actor + path + operation + WI status (§12, §1.6).
 *
 * Rules (CR-5 strengthened):
 * - .specforge/project/ subtree → only 'merge_runner' can write (not sf-orchestrator)
 * - .specforge/.../gates/ subtree + gate_summary.md → only 'gate_runner' can write (not sf-orchestrator)
 * - .specforge/.../user_decision.json → only 'user_decision_recorder' can write (not sf-orchestrator)
 * - .specforge/.../merge_report.md → only 'merge_runner' can write (not sf-orchestrator)
 * - .specforge/specs/ subtree → completely forbidden to write
 * - wiStatus === 'closed' → all write operations fail
 * - allowedWriteFiles restricts which files can be written
 * - codePermission must be true for writes
 * - .specforge/standards|archive|snapshots|state|reports → forbidden in user projects
 */
export function enforceWritePolicy(params: {
  actor: string;
  filePath: string;
  operation: 'read' | 'write' | 'delete';
  wiStatus?: string;
  codePermission?: boolean;
  allowedWriteFiles?: string[];
}): WritePolicyResult {
  const { actor, filePath, operation, wiStatus, codePermission, allowedWriteFiles } = params;
  const violations: string[] = [];
  const normalized = filePath.replace(/\\/g, '/');

  // Reads are always allowed
  if (operation === 'read') {
    return { allowed: true, violations: [] };
  }

  // Closed guard — no writes when WI is closed
  if (wiStatus === 'closed') {
    violations.push('work item is closed — all write operations are forbidden');
  }

  // code_permission check — if revoked, reject writes
  if (codePermission === false) {
    violations.push('code_permission is revoked — write operations forbidden');
  }

  // allowed_write_files check — reject writes not in this list
  if (allowedWriteFiles !== undefined && allowedWriteFiles.length > 0) {
    const normalizedAllowed = allowedWriteFiles.map(f => f.replace(/\\/g, '/'));
    const isAllowed = normalizedAllowed.some(allowed =>
      normalized === allowed || normalized.endsWith('/' + allowed) || normalized.endsWith(allowed),
    );
    if (!isAllowed) {
      violations.push(`file not in allowed_write_files: ${normalized}`);
    }
  }

  // Forbidden MVP dirs in user projects
  const forbiddenUserDirs = ['standards', 'archive', 'snapshots', 'state', 'reports'];
  for (const dir of forbiddenUserDirs) {
    if (normalized.includes(`.specforge/${dir}/`) || normalized.includes(`.specforge/${dir}`)) {
      violations.push(`forbidden user project directory: ${dir}`);
    }
  }

  // .specforge/project/** — only Merge Runner (not sf-orchestrator)
  if (normalized.includes('.specforge/project/') || normalized.includes('project/')) {
    if (actor !== 'merge_runner') {
      violations.push(`project specs only writable by merge_runner, got: ${actor}`);
    }
  }

  // gates/ and gate_summary.md — only Gate Runner (not sf-orchestrator)
  if (normalized.includes('/gates/') || normalized.includes('gate_summary.md')) {
    if (actor !== 'gate_runner') {
      violations.push(`gates only writable by gate_runner, got: ${actor}`);
    }
  }

  // user_decision.json — only User Decision Recorder (not sf-orchestrator)
  if (normalized.includes('user_decision.json')) {
    if (actor !== 'user_decision_recorder') {
      violations.push(`user_decision.json only writable by user_decision_recorder, got: ${actor}`);
    }
  }

  // merge_report.md — only Merge Runner (not sf-orchestrator)
  if (normalized.includes('merge_report.md')) {
    if (actor !== 'merge_runner') {
      violations.push(`merge_report.md only writable by merge_runner, got: ${actor}`);
    }
  }

  // specs/ — completely forbidden to write
  if (normalized.includes('.specforge/specs/')) {
    violations.push('specs/ is completely forbidden to write');
  }

  return { allowed: violations.length === 0, violations };
}
