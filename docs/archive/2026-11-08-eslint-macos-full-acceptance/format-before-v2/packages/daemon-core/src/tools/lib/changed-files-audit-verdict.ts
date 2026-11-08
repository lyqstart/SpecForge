/**
 * changed-files-audit-verdict.ts
 *
 * Single authority for interpreting changed_files_audit results.
 *
 * Current report contract:
 * - Every report declares changed-files-audit/v1 and its Work Item identity.
 * - Governance consumers bind that identity to their selected Work Item.
 * - PASS requires safety summary counts; blocked attempts additionally require
 *   explicit resolved/unresolved classification.
 */

export type ChangedFilesAuditResultLabel = 'PASS' | 'FAIL' | 'UNKNOWN';
export const CHANGED_FILES_AUDIT_CONTRACT_ID = 'changed-files-audit/v1' as const;

export interface ChangedFilesAuditVerdict {
  passed: boolean;
  result: ChangedFilesAuditResultLabel;
  reason?: string;
  contract_id: string | null;
  work_item_id: string | null;
  out_of_scope: number | null;
  violations: number | null;
  blocked_write_attempts: number | null;
  historical_resolved_blocked_write_attempts: number | null;
  unresolved_blocked_write_attempts: number | null;
  incomplete_blocked_write_classification: boolean;
}

export interface ChangedFilesAuditVerdictOptions {
  expectedWorkItemId?: string;
}

function readFirstNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

function readResult(text: string): ChangedFilesAuditResultLabel {
  const label = /(?:^|\n)\s*[-#>\s]*\s*Result\s*:\s*(PASS|FAIL)\b/i;
  const match = label.exec(text);
  if (match) {
    return /^FAIL/i.test(match[1]) ? 'FAIL' : 'PASS';
  }
  return 'UNKNOWN';
}

export function evaluateChangedFilesAuditVerdict(
  auditText: string,
  options: ChangedFilesAuditVerdictOptions = {},
): ChangedFilesAuditVerdict {
  const text = String(auditText ?? '');

  if (!text.trim()) {
    return {
      passed: false,
      result: 'UNKNOWN',
      reason: 'changed_files_audit.md is empty',
      contract_id: null,
      work_item_id: null,
      out_of_scope: null,
      violations: null,
      blocked_write_attempts: null,
      historical_resolved_blocked_write_attempts: null,
      unresolved_blocked_write_attempts: null,
      incomplete_blocked_write_classification: false,
    };
  }

  const contractId = /(?:^|\n)\s*Contract\s*:\s*([^\r\n]+)\s*$/im.exec(text)?.[1]?.trim() ?? null;
  const workItemId = /(?:^|\n)\s*Work Item\s*:\s*([^\r\n]+)\s*$/im.exec(text)?.[1]?.trim() ?? null;
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
  const incompleteBlockedWriteClassification =
    blocked !== null && blocked > 0 && !hasClassificationFields;

  let reason: string | undefined;
  let passed = true;

  if (contractId !== CHANGED_FILES_AUDIT_CONTRACT_ID) {
    passed = false;
    reason = `changed_files_audit Contract must be ${CHANGED_FILES_AUDIT_CONTRACT_ID}`;
  } else if (!workItemId) {
    passed = false;
    reason = 'changed_files_audit Work Item is missing';
  } else if (options.expectedWorkItemId && workItemId !== options.expectedWorkItemId) {
    passed = false;
    reason = `changed_files_audit Work Item mismatch: expected ${options.expectedWorkItemId}, got ${workItemId}`;
  } else if (result === 'FAIL') {
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
  } else if (
    outOfScope === null ||
    violations === null ||
    blocked === null
  ) {
    passed = false;
    reason = 'changed_files_audit required summary counts are missing';
  } else if (incompleteBlockedWriteClassification) {
    passed = false;
    reason = 'Changed Files Audit has blocked write attempts without resolved/unresolved classification';
  }

  return {
    passed,
    result,
    reason,
    contract_id: contractId,
    work_item_id: workItemId,
    out_of_scope: outOfScope,
    violations,
    blocked_write_attempts: blocked,
    historical_resolved_blocked_write_attempts: resolved,
    unresolved_blocked_write_attempts: unresolved,
    incomplete_blocked_write_classification: incompleteBlockedWriteClassification,
  };
}

export function parseChangedFilesAuditVerdictPass(
  auditText: string,
  options: ChangedFilesAuditVerdictOptions = {},
): { passed: boolean; reason?: string } {
  const verdict = evaluateChangedFilesAuditVerdict(auditText, options);
  return { passed: verdict.passed, reason: verdict.reason };
}
