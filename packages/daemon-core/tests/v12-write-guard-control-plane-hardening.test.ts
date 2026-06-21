import { describe, expect, it } from 'vitest';
import { extractShellWriteTargets, parseChangedFilesAuditPass } from '../src/tools/lib/write-guard-runtime-v12';

describe('v1.2 write guard control plane hardening', () => {
  it('extracts PowerShell write targets before shell execution', () => {
    const targets = extractShellWriteTargets("powershell -NoProfile -Command \"Set-Content -Path 'src/todos/a.md' -Value x; Out-File -FilePath \\\"src/todos/b.md\\\"\"");
    expect(targets.map((t) => t.path)).toContain('src/todos/a.md');
    expect(targets.map((t) => t.path)).toContain('src/todos/b.md');
  });

  it('extracts protected project writes from shell commands', () => {
    const targets = extractShellWriteTargets("Set-Content -Path '.specforge/project/executor-project-write-test.txt' -Value x");
    expect(targets).toEqual([{ path: '.specforge/project/executor-project-write-test.txt', operation: 'create' }]);
  });

  it('rejects failed changed_files_audit before implementation_done', () => {
    const result = parseChangedFilesAuditPass('# Changed Files Audit\n\n## Result: FAIL\n\n- Out of scope: 1\n- Violations: 1\n- Blocked write attempts: 0\n');
    expect(result.passed).toBe(false);
  });

  it('accepts clean changed_files_audit before implementation_done', () => {
    const result = parseChangedFilesAuditPass('# Changed Files Audit\n\n## Result: PASS\n\n- Out of scope: 0\n- Violations: 0\n- Blocked write attempts: 0\n');
    expect(result.passed).toBe(true);
  });
});