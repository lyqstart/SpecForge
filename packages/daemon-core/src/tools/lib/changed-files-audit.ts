/**
 * changed-files-audit.ts - ChangedFilesAuditResult & runChangedFilesAudit
 *
 * v18: robust Windows path matching for close_gate and changed_files_audit.
 * The audit must treat these as the same file when they refer to the same target:
 * - D:\code\temp\testX\index.html
 * - D:/code/temp/testX/index.html
 * - index.html
 */
import { ACTOR_ROLES } from '@specforge/types/actor-roles';
import { isSpecForgeRuntimePath, normalizeFsPath } from './filesystem-diff';

export interface ChangedFilesAuditEntry {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  in_allowed_write_files: boolean;
  is_spec_write: boolean;
  is_side_effect: boolean;
  actor?: string;
  ignored_runtime_path?: boolean;
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
  ignored_runtime_files?: number;
}

function isProtectedSpecWrite(normalizedPath: string): boolean {
  return normalizedPath.startsWith('.specforge/project/');
}

function normalizeAuditPath(value: string): string {
  return normalizeFsPath(String(value ?? ''))
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/g, '')
    .toLowerCase();
}

function pathMatchesForAudit(changedPath: string, allowedPath: string): boolean {
  const changed = normalizeAuditPath(changedPath);
  const allowed = normalizeAuditPath(allowedPath);
  if (!changed || !allowed) return false;

  if (changed === allowed) return true;

  // Preserve existing directory allow-list behavior.
  if (changed.startsWith(`${allowed}/`)) return true;

  // Windows close_gate may compare an absolute WriteGuard path with a relative
  // allowed_write_files_snapshot path, or the inverse. Treat suffix-equivalent
  // file paths as the same file.
  if (changed.endsWith(`/${allowed}`)) return true;
  if (allowed.endsWith(`/${changed}`)) return true;

  return false;
}

function operationMatchesForAudit(changedOp: string, allowedOp: string): boolean {
  const c = String(changedOp ?? '').toLowerCase();
  const a = String(allowedOp ?? '').toLowerCase();
  return a === 'any' || a === c;
}

export function runChangedFilesAudit(
  changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>,
  allowedWriteFiles: Array<{ path: string; operation: string }>,
  actor?: string,
): ChangedFilesAuditResult {
  const entries: ChangedFilesAuditEntry[] = [];
  const violations: string[] = [];
  let ignoredRuntimeFiles = 0;

  const normalizedAllowed = (allowedWriteFiles ?? [])
    .filter((f) => typeof f?.path === 'string' && f.path.length > 0)
    .map((f) => ({ path: f.path, operation: String(f.operation ?? 'any') }));

  for (const file of changedFiles ?? []) {
    const normalized = normalizeFsPath(file.path).replace(/\\/g, '/');

    if (isSpecForgeRuntimePath(normalized)) {
      ignoredRuntimeFiles += 1;
      entries.push({
        path: normalized,
        operation: file.operation,
        in_allowed_write_files: true,
        is_spec_write: false,
        is_side_effect: false,
        actor,
        ignored_runtime_path: true,
      });
      continue;
    }

    const inScope = normalizedAllowed.some((allowed) => {
      return (
        pathMatchesForAudit(normalized, allowed.path) &&
        operationMatchesForAudit(file.operation, allowed.operation)
      );
    });

    let isSpecWrite = isProtectedSpecWrite(normalizeAuditPath(normalized));
    const isSideEffect = !inScope && !isSpecWrite;

    if (isSpecWrite) {
      if (actor === ACTOR_ROLES.mergeRunner) {
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
    total_files: (changedFiles ?? []).length,
    in_scope: entries.filter((e) => e.in_allowed_write_files && !e.ignored_runtime_path).length,
    out_of_scope: entries.filter((e) => !e.in_allowed_write_files && !e.is_spec_write).length,
    spec_writes: entries.filter((e) => e.is_spec_write).length,
    side_effects: entries.filter((e) => e.is_side_effect).length,
    violations,
    entries,
    ignored_runtime_files: ignoredRuntimeFiles,
  };
}