import { describe, expect, it } from 'vitest';
import {
  SF_WRITE_GUARD_PREFLIGHT_V12_CONTRACT,
  sfWriteGuardPreflight,
} from '../src/tools/lib/write-guard-preflight-v12';

describe('v1.2 write guard preflight contract coverage', () => {
  it('exports the frozen v1.2 contract marker', () => {
    expect(SF_WRITE_GUARD_PREFLIGHT_V12_CONTRACT.schema_version).toBe('1.2');
    expect(SF_WRITE_GUARD_PREFLIGHT_V12_CONTRACT.canonical_entry).toBe('sfWriteGuardPreflight');
    expect(SF_WRITE_GUARD_PREFLIGHT_V12_CONTRACT.rules.join('\n')).toContain('implementation_running');
    expect(SF_WRITE_GUARD_PREFLIGHT_V12_CONTRACT.rules.join('\n')).toContain('blocked_write_attempts');
  });

  it('supports allowed directory writes for generated files', () => {
    const result = sfWriteGuardPreflight({
      work_item_id: 'WI-0002',
      tool_name: 'generator',
      operation: 'create',
      current_state: 'implementation_running',
      code_permission_enabled: true,
      allowed_write_dirs: ['generated'],
      target_paths: ['generated/client/index.ts'],
    });

    expect(result.allowed).toBe(true);
    expect(result.decision).toBe('ALLOWED');
  });

  it('denies writes into WI process artifacts by default', () => {
    const result = sfWriteGuardPreflight({
      work_item_id: 'WI-0003',
      tool_name: 'edit',
      operation: 'modify',
      current_state: 'implementation_running',
      code_permission_enabled: true,
      allowed_write_dirs: ['.specforge'],
      target_paths: ['.specforge/work-items/WI-0003/work_item.json'],
    });

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe('DENIED_PATH');
  });

  it('allows create/modify when permission was granted as any', () => {
    const result = sfWriteGuardPreflight({
      work_item_id: 'WI-0004',
      tool_name: 'edit',
      operation: 'create',
      current_state: 'implementation_running',
      code_permission_enabled: true,
      allowed_write_files: [{ path: 'src/new.ts', operation: 'any' }],
      target_paths: ['src/new.ts'],
    });

    expect(result.allowed).toBe(true);
  });
});
