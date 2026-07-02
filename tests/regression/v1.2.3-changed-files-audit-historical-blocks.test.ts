import { describe, expect, test } from 'bun:test';
import {
  classifyBlockedWriteAttempts,
  blockedWriteClassificationToViolation,
} from '../../packages/daemon-core/src/tools/lib/blocked-write-classification';
import { runChangedFilesAudit } from '../../packages/daemon-core/src/tools/lib/changed-files-audit';

function finalPassed(
  changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>,
  allowedWriteFiles: Array<{ path: string; operation: string }>,
  blockedWrites: Array<{ path: string; operation: string; tool?: string; violations?: string[] }>,
): boolean {
  const audit = runChangedFilesAudit(changedFiles, allowedWriteFiles, 'agent');
  const classifications = classifyBlockedWriteAttempts(blockedWrites, changedFiles, allowedWriteFiles);
  const unresolvedViolations = classifications
    .filter((c) => c.status === 'unresolved_blocked_attempt')
    .map(blockedWriteClassificationToViolation);

  return audit.passed && unresolvedViolations.length === 0;
}

describe('v1.2.3 changed files audit historical blocked writes hotfix', () => {
  test('passes when historical blocked attempt is later allowed on the same path', () => {
    const blockedWrites = [
      { path: 'src/a.ts', operation: 'modify', tool: 'Write', violations: ['not_in_allowed_write_files'] },
    ];
    const changedFiles = [{ path: 'src/a.ts', operation: 'modify' as const }];
    const allowedWriteFiles = [{ path: 'src/a.ts', operation: 'modify' }];

    const classifications = classifyBlockedWriteAttempts(blockedWrites, changedFiles, allowedWriteFiles);

    expect(classifications).toHaveLength(1);
    expect(classifications[0].status).toBe('historical_blocked_discovery_resolved');
    expect(classifications[0].covered_by_final_allowed_scope).toBe(true);
    expect(classifications[0].later_allowed_write).toBe(true);
    expect(finalPassed(changedFiles, allowedWriteFiles, blockedWrites)).toBe(true);
  });

  test('passes when historical blocked attempt is covered by final scope but has no final write effect', () => {
    const blockedWrites = [
      { path: 'src/a.ts', operation: 'modify', tool: 'Write', violations: ['not_in_allowed_write_files'] },
    ];
    const changedFiles = [{ path: 'src/b.ts', operation: 'modify' as const }];
    const allowedWriteFiles = [
      { path: 'src/a.ts', operation: 'modify' },
      { path: 'src/b.ts', operation: 'modify' },
    ];

    const classifications = classifyBlockedWriteAttempts(blockedWrites, changedFiles, allowedWriteFiles);

    expect(classifications).toHaveLength(1);
    expect(classifications[0].status).toBe('historical_blocked_no_effect');
    expect(classifications[0].covered_by_final_allowed_scope).toBe(true);
    expect(classifications[0].later_allowed_write).toBe(false);
    expect(finalPassed(changedFiles, allowedWriteFiles, blockedWrites)).toBe(true);
  });

  test('fails when blocked attempt is not covered by final allowed scope', () => {
    const blockedWrites = [
      { path: 'src/secret.ts', operation: 'modify', tool: 'Write', violations: ['not_in_allowed_write_files'] },
    ];
    const changedFiles = [{ path: 'src/a.ts', operation: 'modify' as const }];
    const allowedWriteFiles = [{ path: 'src/a.ts', operation: 'modify' }];

    const classifications = classifyBlockedWriteAttempts(blockedWrites, changedFiles, allowedWriteFiles);

    expect(classifications).toHaveLength(1);
    expect(classifications[0].status).toBe('unresolved_blocked_attempt');
    expect(classifications[0].covered_by_final_allowed_scope).toBe(false);
    expect(finalPassed(changedFiles, allowedWriteFiles, blockedWrites)).toBe(false);
  });

  test('still fails actual out-of-scope changed files even when blocked attempt is resolved', () => {
    const blockedWrites = [
      { path: 'src/a.ts', operation: 'modify', tool: 'Write', violations: ['not_in_allowed_write_files'] },
    ];
    const changedFiles = [
      { path: 'src/a.ts', operation: 'modify' as const },
      { path: 'src/out.ts', operation: 'modify' as const },
    ];
    const allowedWriteFiles = [{ path: 'src/a.ts', operation: 'modify' }];

    const classifications = classifyBlockedWriteAttempts(blockedWrites, changedFiles, allowedWriteFiles);
    const audit = runChangedFilesAudit(changedFiles, allowedWriteFiles, 'agent');

    expect(classifications[0].status).toBe('historical_blocked_discovery_resolved');
    expect(audit.passed).toBe(false);
    expect(audit.violations).toContain('out_of_scope: src/out.ts');
    expect(finalPassed(changedFiles, allowedWriteFiles, blockedWrites)).toBe(false);
  });
});
