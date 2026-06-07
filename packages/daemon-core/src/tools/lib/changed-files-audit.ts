/**
 * changed-files-audit.ts — ChangedFilesAuditResult & runChangedFilesAudit
 *
 * Extracted from write-guard-v11.ts for write-guard domain.
 * Imports from write-policy for shared types.
 */

import { ACTOR_ROLES } from '@specforge/types/actor-roles'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangedFilesAuditEntry {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  in_allowed_write_files: boolean;
  is_spec_write: boolean;
  is_side_effect: boolean;
  actor?: string;
}

export interface ChangedFilesAuditResult {
  passed: boolean;
  total_files: number;
  in_scope: number;
  out_of_scope: number;
  spec_writes: number;
  side_effects: number;
  violations: string[];
  entries: ChangedFilesAuditEntry[];
}

// ---------------------------------------------------------------------------
// runChangedFilesAudit
// ---------------------------------------------------------------------------

/**
 * Execute a changed-files audit (§12.7).
 *
 * Compares the list of files changed during a task execution against the
 * declared allowed_write_files, identifying out-of-scope writes, spec writes,
 * and side effects.
 *
 * @param actor Optional actor role — merge_runner writes to .specforge/project/
 *   are legitimate and not flagged as violations.
 */
export function runChangedFilesAudit(
  changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>,
  allowedWriteFiles: Array<{ path: string; operation: string }>,
  actor?: string,
): ChangedFilesAuditResult {
  const entries: ChangedFilesAuditEntry[] = [];
  const violations: string[] = [];
  const normalizedAllowed = new Map(
    allowedWriteFiles.map((f) => [f.path.replace(/\\/g, '/'), f.operation] as const),
  );

  for (const file of changedFiles) {
    const normalized = file.path.replace(/\\/g, '/');
    const inScope = Array.from(normalizedAllowed.entries()).some(([allowedPath, allowedOp]) => {
      const pathMatch = normalized === allowedPath || normalized.startsWith(allowedPath + '/');
      const opMatch = allowedOp === file.operation || allowedOp === 'any';
      return pathMatch && opMatch;
    });
    let isSpecWrite = normalized.startsWith('.specforge/project/');
    const isSideEffect = !inScope && !isSpecWrite;

    if (isSpecWrite) {
      if (actor === ACTOR_ROLES.mergeRunner) {
        // Legitimate merge_runner write — not a violation
        isSpecWrite = false;
      } else {
        violations.push(`spec_write_by_non_merge_runner: ${normalized} (actor: ${actor ?? 'unknown'})`);
      }
    }

    entries.push({
      path: normalized,
      operation: file.operation,
      in_allowed_write_files: inScope,
      is_spec_write: isSpecWrite,
      is_side_effect: isSideEffect,
      actor,
    });

    if (!inScope && !isSpecWrite) {
      violations.push(`out_of_scope: ${normalized}`);
    }
  }

  return {
    passed: violations.length === 0,
    total_files: changedFiles.length,
    in_scope: entries.filter((e) => e.in_allowed_write_files).length,
    out_of_scope: entries.filter((e) => !e.in_allowed_write_files && !e.is_spec_write).length,
    spec_writes: entries.filter((e) => e.is_spec_write).length,
    side_effects: entries.filter((e) => e.is_side_effect).length,
    violations,
    entries,
  };
}
