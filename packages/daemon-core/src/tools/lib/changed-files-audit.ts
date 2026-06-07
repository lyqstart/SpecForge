/**
 * changed-files-audit.ts — ChangedFilesAuditResult & runChangedFilesAudit
 *
 * Extracted from write-guard-v11.ts for write-guard domain.
 * Imports from write-policy for shared types.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangedFilesAuditEntry {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  in_allowed_write_files: boolean;
  is_spec_write: boolean;
  is_side_effect: boolean;
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
 */
export function runChangedFilesAudit(
  changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>,
  allowedWriteFiles: Array<{ path: string; operation: string }>,
): ChangedFilesAuditResult {
  const entries: ChangedFilesAuditEntry[] = [];
  const violations: string[] = [];
  const normalizedAllowed = new Set(
    allowedWriteFiles.map((f) => f.path.replace(/\\/g, '/')),
  );

  for (const file of changedFiles) {
    const normalized = file.path.replace(/\\/g, '/');
    const inScope = normalizedAllowed.has(normalized);
    const isSpecWrite = normalized.startsWith('.specforge/project/');
    const isSideEffect = !inScope && !isSpecWrite;

    entries.push({
      path: normalized,
      operation: file.operation,
      in_allowed_write_files: inScope,
      is_spec_write: isSpecWrite,
      is_side_effect: isSideEffect,
    });

    if (!inScope && !isSpecWrite) {
      violations.push(`out_of_scope: ${normalized}`);
    }

    if (isSpecWrite) {
      violations.push(`spec_write_by_agent: ${normalized}`);
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
