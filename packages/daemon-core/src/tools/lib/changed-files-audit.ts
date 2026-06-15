/**
 * changed-files-audit.ts — ChangedFilesAuditResult & runChangedFilesAudit
 *
 * R2 changes:
 * - SpecForge runtime/log/archive files are ignored by business changed-files audit.
 * - .specforge/project/** is still protected and only merge_runner may write it.
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

export function runChangedFilesAudit(
  changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>,
  allowedWriteFiles: Array<{ path: string; operation: string }>,
  actor?: string,
): ChangedFilesAuditResult {
  const entries: ChangedFilesAuditEntry[] = [];
  const violations: string[] = [];
  let ignoredRuntimeFiles = 0;

  const normalizedAllowed = new Map(
    allowedWriteFiles.map((f) => [normalizeFsPath(f.path), f.operation] as const),
  );

  for (const file of changedFiles) {
    const normalized = normalizeFsPath(file.path);

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

    const inScope = Array.from(normalizedAllowed.entries()).some(([allowedPath, allowedOp]) => {
      const pathMatch = normalized === allowedPath || normalized.startsWith(`${allowedPath}/`);
      const opMatch = allowedOp === file.operation || allowedOp === 'any';
      return pathMatch && opMatch;
    });

    let isSpecWrite = isProtectedSpecWrite(normalized);
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
    total_files: changedFiles.length,
    in_scope: entries.filter((e) => e.in_allowed_write_files && !e.ignored_runtime_path).length,
    out_of_scope: entries.filter((e) => !e.in_allowed_write_files && !e.is_spec_write).length,
    spec_writes: entries.filter((e) => e.is_spec_write).length,
    side_effects: entries.filter((e) => e.is_side_effect).length,
    violations,
    entries,
    ignored_runtime_files: ignoredRuntimeFiles,
  };
}
