import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  evaluateChangedFilesAuditVerdict,
  parseChangedFilesAuditVerdictPass,
} from '../../packages/daemon-core/src/tools/lib/changed-files-audit-verdict';
import { parseChangedFilesAuditPass } from '../../packages/daemon-core/src/tools/lib/write-guard-runtime-v12';

function report(lines: string[]): string {
  return ['# Changed Files Audit', '', ...lines].join('\n');
}

describe('v1.2.4 changed files audit verdict unification', () => {
  test('passes resolved historical blocked attempts with zero unresolved attempts', () => {
    const text = report([
      '## Result: PASS',
      '',
      '- Out of scope: 0',
      '- Violations: 0',
      '- Blocked write attempts: 5',
      '- Historical/resolved blocked write attempts: 5',
      '- Unresolved blocked write attempts: 0',
    ]);

    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.passed).toBe(true);
    expect(verdict.blocked_write_attempts).toBe(5);
    expect(verdict.historical_resolved_blocked_write_attempts).toBe(5);
    expect(verdict.unresolved_blocked_write_attempts).toBe(0);
    expect(parseChangedFilesAuditPass(text).passed).toBe(true);
    expect(parseChangedFilesAuditVerdictPass(text).passed).toBe(true);
  });

  test('fails unresolved blocked attempts even when the raw result says PASS', () => {
    const text = report([
      '## Result: PASS',
      '',
      '- Out of scope: 0',
      '- Violations: 0',
      '- Blocked write attempts: 5',
      '- Historical/resolved blocked write attempts: 4',
      '- Unresolved blocked write attempts: 1',
    ]);

    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toBe('Unresolved blocked write attempts is 1');
    expect(parseChangedFilesAuditPass(text).passed).toBe(false);
  });

  test('fails legacy reports with blocked attempts but no resolved/unresolved classification', () => {
    const text = report([
      '## Result: PASS',
      '',
      '- Out of scope: 0',
      '- Violations: 0',
      '- Blocked write attempts: 5',
    ]);

    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.passed).toBe(false);
    expect(verdict.is_legacy_report).toBe(true);
    expect(verdict.legacy_blocked_write_failure).toBe(true);
    expect(verdict.reason).toContain('Legacy changed_files_audit report');
    expect(parseChangedFilesAuditPass(text).passed).toBe(false);
  });

  test('fails actual out-of-scope files regardless of blocked-write classification', () => {
    const text = report([
      '## Result: PASS',
      '',
      '- Out of scope: 1',
      '- Violations: 0',
      '- Blocked write attempts: 5',
      '- Historical/resolved blocked write attempts: 5',
      '- Unresolved blocked write attempts: 0',
    ]);

    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toBe('Out of scope is 1');
  });

  test('fails explicit FAIL result even when all counters look clean', () => {
    const text = report([
      '## Result: FAIL',
      '',
      '- Out of scope: 0',
      '- Violations: 0',
      '- Blocked write attempts: 5',
      '- Historical/resolved blocked write attempts: 5',
      '- Unresolved blocked write attempts: 0',
    ]);

    const verdict = evaluateChangedFilesAuditVerdict(text);
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toBe('changed_files_audit result is FAIL');
  });

  test('write-guard runtime delegates audit pass parsing to the unified verdict service', async () => {
    const source = await readFile(
      join(process.cwd(), 'packages/daemon-core/src/tools/lib/write-guard-runtime-v12.ts'),
      'utf-8',
    );
    const functionStart = source.indexOf('export function parseChangedFilesAuditPass');
    expect(functionStart).toBeGreaterThanOrEqual(0);
    const functionSource = source.slice(functionStart);
    expect(functionSource).toContain('parseChangedFilesAuditVerdictPass(auditText)');
    expect(functionSource).not.toContain("label: 'Blocked write attempts'");
    expect(functionSource).not.toContain('Blocked write attempts is');
  });
});
