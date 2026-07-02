/**
 * changed-files-audit-verdict.ts
 *
 * Single authority for interpreting changed_files_audit results.
 *
 * v1.2.4 hotfix:
 * - Do not let governance consumers independently interpret raw
 *   blocked_write_attempts.
 * - Historical blocked attempts are allowed only when the audit report has the
 *   v1.2.3 resolved/unresolved classification fields and unresolved=0.
 * - Legacy reports with blocked_write_attempts>0 but no resolved/unresolved
 *   classification remain failing for safety.
 */

export type ChangedFilesAuditResultLabel = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface ChangedFilesAuditVerdict {
  passed: boolean;
  result: ChangedFilesAuditResultLabel;
  reason?: string;
  out_of_scope: number | null;
  violations: number | null;
  blocked_write_attempts: number | null;
  historical_resolved_blocked_write_attempts: number | null;
  unresolved_blocked_write_attempts: number | null;
  is_legacy_report: boolean;
  legacy_blocked_write_failure: boolean;
}

function readFirstNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

function readResult(text: string): ChangedFilesAuditResultLabel {
  if (/##\s*Result:\s*FAIL\b/i.test(text) || /^\s*Result:\s*FAIL\b/im.test(text)) return 'FAIL';
  if (/##\s*Result:\s*PASS\b/i.test(text) || /^\s*Result:\s*PASS\b/im.test(text)) return 'PASS';
  return 'UNKNOWN';
}

export function evaluateChangedFilesAuditVerdict(auditText: string): ChangedFilesAuditVerdict {
  const text = String(auditText ?? '');

  if (!text.trim()) {
    return {
      passed: false,
      result: 'UNKNOWN',
      reason: 'changed_files_audit.md is empty',
      out_of_scope: null,
      violations: null,
      blocked_write_attempts: null,
      historical_resolved_blocked_write_attempts: null,
      unresolved_blocked_write_attempts: null,
      is_legacy_report: true,
      legacy_blocked_write_failure: false,
    };
  }

  const result = readResult(text);
  const outOfScope = readFirstNumber(text, [
    /-\s*Out of scope:\s*([0-9]+)/i,
    /\bout_of_scope\b\s*[:=]\s*([0-9]+)/i,
  ]);
  const violations = readFirstNumber(text, [
    /-\s*Violations:\s*([0-9]+)/i,
    /\bviolations\b\s*[:=]\s*([0-9]+)/i,
  ]);
  const blocked = readFirstNumber(text, [
    /-\s*Blocked write attempts:\s*([0-9]+)/i,
    /\bblocked_write_attempts\b\s*[:=]\s*([0-9]+)/i,
  ]);
  const resolved = readFirstNumber(text, [
    /-\s*Historical\/resolved blocked write attempts:\s*([0-9]+)/i,
    /-\s*Resolved blocked write attempts:\s*([0-9]+)/i,
    /\bresolved_blocked_write_attempts\b\s*[:=]\s*([0-9]+)/i,
    /\bhistorical_resolved_blocked_write_attempts\b\s*[:=]\s*([0-9]+)/i,
  ]);
  const unresolved = readFirstNumber(text, [
    /-\s*Unresolved blocked write attempts:\s*([0-9]+)/i,
    /\bunresolved_blocked_write_attempts\b\s*[:=]\s*([0-9]+)/i,
  ]);

  const hasClassificationFields = resolved !== null || unresolved !== null;
  const isLegacyReport = blocked !== null && blocked > 0 && !hasClassificationFields;
  const legacyBlockedWriteFailure = isLegacyReport;

  let reason: string | undefined;
  let passed = true;

  if (result === 'FAIL') {
    passed = false;
    reason = 'changed_files_audit result is FAIL';
  } else if (result !== 'PASS') {
    passed = false;
    reason = 'changed_files_audit result is not PASS';
  } else if (outOfScope !== null && outOfScope > 0) {
    passed = false;
    reason = 'Out of scope is ' + outOfScope;
  } else if (violations !== null && violations > 0) {
    passed = false;
    reason = 'Violations is ' + violations;
  } else if (unresolved !== null && unresolved > 0) {
    passed = false;
    reason = 'Unresolved blocked write attempts is ' + unresolved;
  } else if (legacyBlockedWriteFailure) {
    passed = false;
    reason = 'Legacy changed_files_audit report has blocked write attempts without resolved/unresolved classification';
  }

  return {
    passed,
    result,
    reason,
    out_of_scope: outOfScope,
    violations,
    blocked_write_attempts: blocked,
    historical_resolved_blocked_write_attempts: resolved,
    unresolved_blocked_write_attempts: unresolved,
    is_legacy_report: isLegacyReport,
    legacy_blocked_write_failure: legacyBlockedWriteFailure,
  };
}

export function parseChangedFilesAuditVerdictPass(auditText: string): { passed: boolean; reason?: string } {
  const verdict = evaluateChangedFilesAuditVerdict(auditText);
  return { passed: verdict.passed, reason: verdict.reason };
}
