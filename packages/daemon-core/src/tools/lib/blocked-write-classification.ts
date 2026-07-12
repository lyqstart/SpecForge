/**
 * blocked-write-classification.ts
 *
 * Classifies Write Guard blocked attempts for changed_files_audit.
 *
 * Security model:
 * - The append-only Write Guard log is never deleted, hidden, or rewritten.
 * - Historical blocked attempts remain visible in audit output.
 * - Only unresolved blocked attempts become final audit violations.
 * - hard_stop_resolution.jsonl is accepted as the structured recovery source.
 * - project-level write_guard_authorizations.jsonl is accepted as scoped future-policy evidence.
 */
import {
  operationMatchesForAudit,
  pathMatchesForAudit,
  normalizeAuditPath,
} from './changed-files-audit';
import {
  type HardStopResolutionLogEntry,
  isAuditResolvingResolutionType,
  resolutionText,
} from './hard-stop-resolution-log';
import {
  authorizationText,
  commandMatchesWriteGuardAuthorization,
  type WriteGuardAuthorizationEntry,
} from './write-guard-authorization-log';

export type BlockedWriteClassificationStatus =
  | 'historical_blocked_discovery_resolved'
  | 'historical_blocked_no_effect'
  | 'hard_stop_resolution_resolved'
  | 'write_guard_authorization_resolved'
  | 'unresolved_blocked_attempt';

export interface BlockedWriteAttemptLike {
  path?: string;
  operation?: string;
  tool?: string;
  command?: string;
  violations?: string[];
  hard_stop_id?: string;
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
  hard_stop_resolution_type?: string;
  hard_stop_resolution_id?: string | null;
  write_guard_authorization_id?: string | null;
  write_guard_authorization_type?: string;
}

function normalizeBlockedOperation(value: unknown): string {
  const op = String(value ?? 'modify').toLowerCase();
  if (op === 'create' || op === 'modify' || op === 'delete') return op;
  return 'modify';
}

function resolutionMatchesBlockedPath(
  blockedPath: string,
  blocked: BlockedWriteAttemptLike,
  resolution: HardStopResolutionLogEntry
): boolean {
  if (!isAuditResolvingResolutionType(resolution.resolution_type)) return false;

  const blockedHardStopId = String(blocked.hard_stop_id ?? '').trim();
  const resolutionHardStopId = String(
    resolution.hard_stop_id ?? resolution.original_hard_stop?.hard_stop_id ?? ''
  ).trim();
  if (blockedHardStopId && resolutionHardStopId === blockedHardStopId) return true;

  const target = normalizeAuditPath(blockedPath);
  const text = resolutionText(resolution);
  const normalizedText = normalizeAuditPath(text);

  if (target && normalizedText.includes(target)) return true;

  const originalReason = String(resolution.original_hard_stop?.reason ?? '');
  if (target && normalizeAuditPath(originalReason).includes(target)) return true;

  const command = String(blocked.command ?? '');
  if (command && normalizeAuditPath(text).includes(normalizeAuditPath(command).slice(0, 160)))
    return true;

  const violations = Array.isArray(blocked.violations) ? blocked.violations : [];
  return violations.some(violation => {
    const v = normalizeAuditPath(String(violation ?? ''));
    return target.length > 0 && v.includes(target) && normalizedText.includes(target);
  });
}

function findResolutionForBlockedPath(
  blockedPath: string,
  blocked: BlockedWriteAttemptLike,
  resolutions: HardStopResolutionLogEntry[]
): HardStopResolutionLogEntry | null {
  for (let index = resolutions.length - 1; index >= 0; index -= 1) {
    const resolution = resolutions[index];
    if (resolutionMatchesBlockedPath(blockedPath, blocked, resolution)) return resolution;
  }
  return null;
}

function authorizationMatchesBlockedPath(
  blockedPath: string,
  blocked: BlockedWriteAttemptLike,
  authorization: WriteGuardAuthorizationEntry
): boolean {
  const command = String(blocked.command ?? '');
  if (
    command &&
    commandMatchesWriteGuardAuthorization(
      command,
      authorization,
      blockedPath ? authorization.work_item_id : undefined
    )
  ) {
    return true;
  }

  const target = normalizeAuditPath(blockedPath);
  const text = normalizeAuditPath(authorizationText(authorization));
  if (target && text.includes(target)) return true;

  const violations = Array.isArray(blocked.violations) ? blocked.violations : [];
  return violations.some(violation => {
    const v = normalizeAuditPath(String(violation ?? ''));
    return target.length > 0 && v.includes(target) && text.includes(target);
  });
}

function findAuthorizationForBlockedPath(
  blockedPath: string,
  blocked: BlockedWriteAttemptLike,
  authorizations: WriteGuardAuthorizationEntry[]
): WriteGuardAuthorizationEntry | null {
  for (let index = authorizations.length - 1; index >= 0; index -= 1) {
    const authorization = authorizations[index];
    if (authorizationMatchesBlockedPath(blockedPath, blocked, authorization)) return authorization;
  }
  return null;
}

export function classifyBlockedWriteAttempts(
  blockedWrites: BlockedWriteAttemptLike[],
  factualChangedFiles: FactualChangedFileLike[],
  allowedWriteFiles: AllowedWriteFileLike[],
  hardStopResolutions: HardStopResolutionLogEntry[] = [],
  writeGuardAuthorizations: WriteGuardAuthorizationEntry[] = []
): BlockedWriteClassification[] {
  return (blockedWrites ?? []).map(blocked => {
    const filePath = String(blocked?.path ?? 'unknown');
    const operation = normalizeBlockedOperation(blocked?.operation);
    const originalViolations = Array.isArray(blocked?.violations) ? blocked.violations : [];

    const coveredByFinalAllowedScope = (allowedWriteFiles ?? []).some(allowed => {
      return (
        pathMatchesForAudit(filePath, String(allowed?.path ?? '')) &&
        operationMatchesForAudit(operation, String(allowed?.operation ?? 'any'))
      );
    });

    const laterAllowedWrite = (factualChangedFiles ?? []).some(changed => {
      return pathMatchesForAudit(String(changed?.path ?? ''), filePath);
    });

    const resolution = findResolutionForBlockedPath(filePath, blocked, hardStopResolutions);
    if (resolution) {
      return {
        path: filePath,
        operation,
        tool: blocked?.tool,
        status: 'hard_stop_resolution_resolved',
        reason:
          'Blocked attempt has a structured hard_stop_resolution.jsonl entry with resolution_type=' +
          String(resolution.resolution_type ?? 'unknown') +
          '. The blocked attempt remains visible, but is not an unresolved audit violation.',
        covered_by_final_allowed_scope: coveredByFinalAllowedScope,
        later_allowed_write: laterAllowedWrite,
        original_violations: originalViolations,
        hard_stop_resolution_type: String(resolution.resolution_type ?? ''),
        hard_stop_resolution_id: resolution.hard_stop_id ?? null,
      };
    }

    const authorization = findAuthorizationForBlockedPath(
      filePath,
      blocked,
      writeGuardAuthorizations
    );
    if (authorization) {
      return {
        path: filePath,
        operation,
        tool: blocked?.tool,
        status: 'write_guard_authorization_resolved',
        reason:
          'Blocked attempt is covered by project-level write_guard_authorizations.jsonl entry authorization_id=' +
          String(authorization.authorization_id ?? 'unknown') +
          '. The attempt remains visible, but this scoped authorization prevents it from being treated as unresolved.',
        covered_by_final_allowed_scope: coveredByFinalAllowedScope,
        later_allowed_write: laterAllowedWrite,
        original_violations: originalViolations,
        write_guard_authorization_id: authorization.authorization_id ?? null,
        write_guard_authorization_type: String(authorization.authorization_type ?? ''),
      };
    }

    if (coveredByFinalAllowedScope && laterAllowedWrite) {
      return {
        path: filePath,
        operation,
        tool: blocked?.tool,
        status: 'historical_blocked_discovery_resolved',
        reason:
          'Blocked attempt is covered by final allowed_write_files scope and a later factual allowed write exists for the same path.',
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
        reason:
          'Blocked attempt is covered by final allowed_write_files scope and no final factual write exists for that path.',
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
      reason:
        'Blocked attempt is not covered by final allowed_write_files scope and no structured hard_stop resolution or project-level write_guard authorization can be proven.',
      covered_by_final_allowed_scope: false,
      later_allowed_write: laterAllowedWrite,
      original_violations: originalViolations,
    };
  });
}

export function blockedWriteClassificationToViolation(
  classification: BlockedWriteClassification
): string {
  return `UNRESOLVED_BLOCKED_WRITE_ATTEMPT: [${classification.operation}] ${classification.path} via ${
    classification.tool ?? 'unknown'
  } reason=${classification.reason}`;
}
