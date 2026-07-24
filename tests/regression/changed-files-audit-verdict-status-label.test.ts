/**
 * Regression: changed_files_audit verdict must recognize the human-friendly
 * "- Status: PASSED/FAILED" label emitted by generateChangedFilesAuditMd, not
 * only the canonical "Result: PASS/FAIL".
 *
 * Root cause: close_gate's check `close_changed_files_audit_passed` read a
 * genuinely-passing report ("- Status: PASSED", "- Out of scope: 0") but the
 * verdict parser only recognized "Result: PASS", so it returned UNKNOWN and
 * failed with "changed_files_audit result is not PASS", blocking close for
 * every code Work Item.
 */
import { describe, expect, test } from 'bun:test';
import {
  evaluateChangedFilesAuditVerdict,
  parseChangedFilesAuditVerdictPass,
} from '../../packages/daemon-core/src/tools/lib/changed-files-audit-verdict';

/** Mirrors the exact shape produced by generateChangedFilesAuditMd. */
function generatedReport(status: 'PASSED' | 'FAILED', outOfScope: number): string {
  return [
    '# Changed Files Audit',
    '',
    '- Work Item: WI-0001',
    '- Timestamp: 2026-07-24T01:57:41.041Z',
    `- Status: ${status}`,
    '- Data Source: write_guard_log.jsonl (14 entries, 3 allowed writes)',
    '- Ignored Runtime Files: 0',
    '',
    '## Summary',
    '',
    '- Total files: 3',
    '- In scope: 3',
    `- Out of scope: ${outOfScope}`,
    '- Spec writes: 0',
    '- Side effects: 0',
    '',
  ].join('\n');
}

describe('changed_files_audit verdict — Status label recognition', () => {
  test('recognizes "- Status: PASSED" (generator format) as PASS', () => {
    const text = generatedReport('PASSED', 0);
    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.result).toBe('PASS');
    expect(verdict.passed).toBe(true);
    expect(parseChangedFilesAuditVerdictPass(text).passed).toBe(true);
  });

  test('recognizes "- Status: FAILED" (generator format) as FAIL', () => {
    const text = generatedReport('FAILED', 2);
    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.result).toBe('FAIL');
    expect(verdict.passed).toBe(false);
  });

  test('Status: PASSED does not override a positive out_of_scope count', () => {
    const text = generatedReport('PASSED', 1);
    const verdict = evaluateChangedFilesAuditVerdict(text);
    // Result reads as PASS, but out_of_scope > 0 must still fail the verdict.
    expect(verdict.result).toBe('PASS');
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toBe('Out of scope is 1');
  });

  test('still recognizes the canonical "## Result: PASS" format', () => {
    const text = ['# Changed Files Audit', '', '## Result: PASS', '', '- Out of scope: 0'].join('\n');
    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.result).toBe('PASS');
    expect(verdict.passed).toBe(true);
  });

  test('still recognizes the canonical "## Result: FAIL" format', () => {
    const text = ['# Changed Files Audit', '', '## Result: FAIL', '', '- Out of scope: 0'].join('\n');
    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.result).toBe('FAIL');
    expect(verdict.passed).toBe(false);
  });
});
