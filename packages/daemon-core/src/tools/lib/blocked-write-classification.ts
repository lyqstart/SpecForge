/**
 * blocked-write-classification.ts
 *
 * Classifies Write Guard blocked attempts for changed_files_audit.
 *
 * Security model:
 * - The append-only Write Guard log is never deleted, hidden, or rewritten.
 * - Historical blocked attempts remain visible in audit output.
 * - Only unresolved blocked attempts become final audit violations.
 * - Actual out-of-scope factual changed files are still handled by
 *   runChangedFilesAudit and must fail independently.
 */

import {
  operationMatchesForAudit,
  pathMatchesForAudit,
} from './changed-files-audit';

export type BlockedWriteClassificationStatus =
  | 'historical_blocked_discovery_resolved'
  | 'historical_blocked_no_effect'
  | 'unresolved_blocked_attempt';

export interface BlockedWriteAttemptLike {
  path?: string;
  operation?: string;
  tool?: string;
  violations?: string[];
}

export interface FactualChangedFileLike {
  path: string;
  operation: 'create' | 'modify' | 'delete';
}

export interface AllowedWriteFileLike {
  path: string;
  operation: string;
}

export interface BlockedWriteClassification {
  path: string;
  operation: string;
  tool?: string;
  status: BlockedWriteClassificationStatus;
  reason: string;
  covered_by_final_allowed_scope: boolean;
  later_allowed_write: boolean;
  original_violations: string[];
}

function normalizeBlockedOperation(value: unknown): string {
  const op = String(value ?? 'modify').toLowerCase();
  if (op === 'create' || op === 'modify' || op === 'delete') return op;
  return 'modify';
}

export function classifyBlockedWriteAttempts(
  blockedWrites: BlockedWriteAttemptLike[],
  factualChangedFiles: FactualChangedFileLike[],
  allowedWriteFiles: AllowedWriteFileLike[],
): BlockedWriteClassification[] {
  return (blockedWrites ?? []).map((blocked) => {
    const filePath = String(blocked?.path ?? 'unknown');
    const operation = normalizeBlockedOperation(blocked?.operation);
    const originalViolations = Array.isArray(blocked?.violations) ? blocked.violations : [];

    const coveredByFinalAllowedScope = (allowedWriteFiles ?? []).some((allowed) => {
      return (
        pathMatchesForAudit(filePath, String(allowed?.path ?? '')) &&
        operationMatchesForAudit(operation, String(allowed?.operation ?? 'any'))
      );
    });

    // If the same path appears in factual changed files, Write Guard later
    // allowed a real write to that path. Operation is intentionally not used
    // here because some shell/native paths normalize create/modify differently;
    // final operation safety is still enforced by runChangedFilesAudit.
    const laterAllowedWrite = (factualChangedFiles ?? []).some((changed) => {
      return pathMatchesForAudit(String(changed?.path ?? ''), filePath);
    });

    if (coveredByFinalAllowedScope && laterAllowedWrite) {
      return {
        path: filePath,
        operation,
        tool: blocked?.tool,
        status: 'historical_blocked_discovery_resolved',
        reason: 'Blocked attempt is covered by final allowed_write_files scope and a later factual allowed write exists for the same path.',
        covered_by_final_allowed_scope: true,
        later_allowed_write: true,
        original_violations: originalViolations,
      };
    }

    if (coveredByFinalAllowedScope && !laterAllowedWrite) {
      return {
        path: filePath,
        operation,
        tool: blocked?.tool,
        status: 'historical_blocked_no_effect',
        reason: 'Blocked attempt is covered by final allowed_write_files scope and no final factual write exists for that path.',
        covered_by_final_allowed_scope: true,
        later_allowed_write: false,
        original_violations: originalViolations,
      };
    }

    return {
      path: filePath,
      operation,
      tool: blocked?.tool,
      status: 'unresolved_blocked_attempt',
      reason: 'Blocked attempt is not covered by final allowed_write_files scope and no resolved classification can be proven.',
      covered_by_final_allowed_scope: false,
      later_allowed_write: laterAllowedWrite,
      original_violations: originalViolations,
    };
  });
}

export function blockedWriteClassificationToViolation(
  classification: BlockedWriteClassification,
): string {
  return `UNRESOLVED_BLOCKED_WRITE_ATTEMPT: [${classification.operation}] ${classification.path} via ${classification.tool ?? 'unknown'} reason=${classification.reason}`;
}
