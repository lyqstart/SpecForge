import { describe, expect, it } from 'vitest';
import {
  classifyShellWriteRisk,
  sfWriteGuardPreflight,
  checkCloseGateWriteGuard,
} from '../src/tools/lib/write-guard-preflight-v12';

const base = {
  work_item_id: 'WI-0001',
  tool_name: 'edit',
  current_state: 'implementation_running',
  code_permission_enabled: true,
  allowed_write_files: [{ path: 'src/a.ts', operation: 'modify' as const }],
};

describe('v1.2 write guard preflight enforcement', () => {
  it('allows an in-scope write during implementation_running with active code permission', () => {
    const result = sfWriteGuardPreflight({
      ...base,
      operation: 'modify',
      target_paths: ['src/a.ts'],
    });

    expect(result.allowed).toBe(true);
    expect(result.decision).toBe('ALLOWED');
    expect(result.blocked_write_attempts).toBe(0);
    expect(result.audit_event.type).toBe('write_guard.preflight');
  });

  it('allows read-only shell verification without code write target', () => {
    const result = sfWriteGuardPreflight({
      ...base,
      operation: 'shell_command',
      target_paths: [],
      command: 'Get-Content src/a.ts | Select-String hello',
    });

    expect(result.allowed).toBe(true);
    expect(result.decision).toBe('READ_ONLY_ALLOWED');
  });

  it('denies writes outside implementation_running', () => {
    const result = sfWriteGuardPreflight({
      ...base,
      current_state: 'post_merge_verified',
      operation: 'modify',
      target_paths: ['src/a.ts'],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('STATE_NOT_IMPLEMENTATION_RUNNING');
  });

  it('denies writes when code permission is not enabled', () => {
    const result = sfWriteGuardPreflight({
      ...base,
      code_permission_enabled: false,
      operation: 'modify',
      target_paths: ['src/a.ts'],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('CODE_PERMISSION_NOT_ENABLED');
  });

  it('denies writes after code permission revoke', () => {
    const result = sfWriteGuardPreflight({
      ...base,
      code_permission_revoked: true,
      operation: 'modify',
      target_paths: ['src/a.ts'],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('CODE_PERMISSION_REVOKED');
  });

  it('denies out-of-scope writes', () => {
    const result = sfWriteGuardPreflight({
      ...base,
      operation: 'modify',
      target_paths: ['src/b.ts'],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('OUT_OF_SCOPE_WRITE');
    expect(result.blocked_write_attempts).toBe(1);
    expect(result.audit_event.type).toBe('write_guard.violation');
  });

  it('denies direct project spec writes except sf_project_spec_merge', () => {
    const denied = sfWriteGuardPreflight({
      ...base,
      operation: 'modify',
      target_paths: ['.specforge/project/requirements/requirements.md'],
    });

    expect(denied.allowed).toBe(false);
    expect(denied.decision).toBe('DIRECT_PROJECT_SPEC_WRITE');

    const allowed = sfWriteGuardPreflight({
      ...base,
      tool_name: 'sf_project_spec_merge',
      operation: 'project_spec_merge',
      allow_project_spec_write: true,
      target_paths: ['.specforge/project/requirements/requirements.md'],
    });

    expect(allowed.allowed).toBe(true);
  });

  it('detects and denies shell writes with out-of-scope targets', () => {
    const result = sfWriteGuardPreflight({
      ...base,
      operation: 'shell_command',
      command: 'Set-Content -Path "src/b.ts" -Value "bad"',
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('SHELL_WRITE_RISK');
    expect(result.normalized_paths).toEqual(['src/b.ts']);
  });

  it('denies shell writes when target cannot be determined', () => {
    const result = sfWriteGuardPreflight({
      ...base,
      operation: 'shell_command',
      command: 'node -e "process.stdout.write(String(Date.now()))" > $env:TEMP\\x.txt',
    });

    expect(result.allowed).toBe(false);
    expect(['UNKNOWN_SHELL_WRITE_TARGET', 'SHELL_WRITE_RISK']).toContain(result.decision);
  });

  it('blocks close when preflight recorded blocked_write_attempts', () => {
    const result = checkCloseGateWriteGuard({
      blocked_write_attempts: 1,
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('CLOSE_BLOCKED_BY_WRITE_GUARD');
  });

  it('classifies write-capable shell syntax', () => {
    const risk = classifyShellWriteRisk('echo ok >> src/a.ts');

    expect(risk.is_write_risk).toBe(true);
    expect(risk.extracted_target_paths).toEqual(['src/a.ts']);
  });
});
