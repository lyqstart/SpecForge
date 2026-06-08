/**
 * write-guard-rbac.test.ts — Write Guard RBAC 接入测试
 *
 * 验证 enableRBAC=true 时 protected files 被强制保护，
 * enableRBAC=false 时旧行为不变。
 */
import { describe, it, expect } from 'vitest';
import {
  checkWrite,
  evaluatePolicy,
  DEFAULT_WRITE_POLICY_RULES,
} from '../../src/tools/lib/write-guard-v11.js';
import type { WriteGuardContext } from '../../src/tools/lib/write-guard-v11.js';
import { ACTOR_ROLES } from '@specforge/types/actor-roles';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseCtx: WriteGuardContext = {
  hasActiveWI: true,
  callerRole: ACTOR_ROLES.agent,
  isFrozen: false,
};

const ctxWithWI = (role: string, extra?: Partial<WriteGuardContext>): WriteGuardContext => ({
  ...baseCtx,
  callerRole: role as WriteGuardContext['callerRole'],
  workItem: {
    work_item_id: 'WI-TEST',
    status: 'verification_done',
    code_change_allowed: true,
    allowed_write_files: [
      { path: 'src/test.ts', operation: 'modify' },
      { path: 'src/index.ts', operation: 'modify' },
    ],
    workflow_path: null,
  },
  ...extra,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkWrite RBAC integration', () => {
  describe('enableRBAC=false / undefined (default)', () => {
    it('should allow agent to write spec files when RBAC disabled', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: false });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/requirements.md', 'modify');
      // Without RBAC, this goes through existing write guard rules
      // agent is blocked by restricted-files-access rule only for gates/merge/user_decision
      // spec files are not restricted in v1.1 write guard → agent can write .specforge/ files
      expect(result.allowed).toBe(true);
    });

    it('should allow orchestrator to write spec files when RBAC disabled', () => {
      const ctx = ctxWithWI('sf-orchestrator', { enableRBAC: false });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/design.md', 'modify');
      expect(result.allowed).toBe(true);
    });

    it('should allow unknown role to write spec files when RBAC undefined', () => {
      const ctx = ctxWithWI('agent'); // enableRBAC not set → undefined → false
      const result = checkWrite(ctx, '.specforge/specs/WI-001/tasks.md', 'modify');
      expect(result.allowed).toBe(true);
    });

    it('should still enforce existing v1.1 rules when RBAC disabled', () => {
      // agent should still be blocked from gates/ without RBAC
      const ctx = ctxWithWI('agent', { enableRBAC: false });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/gates/requirements_gate.md', 'modify');
      expect(result.allowed).toBe(false);
    });
  });

  describe('enableRBAC=true + protected file protection', () => {
    it('should deny agent modify spec_file (requirements.md)', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/requirements.md', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('RBAC');
    });

    it('should deny agent modify spec_file (design.md)', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/design.md', 'modify');
      expect(result.allowed).toBe(false);
    });

    it('should deny agent modify spec_file (tasks.md)', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/tasks.md', 'modify');
      expect(result.allowed).toBe(false);
    });

    it('should deny agent modify evidence_file (verification_report.md)', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/verification_report.md', 'modify');
      expect(result.allowed).toBe(false);
    });

    it('should deny agent modify evidence_file (changed_files_audit.md)', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/changed_files_audit.md', 'modify');
      expect(result.allowed).toBe(false);
    });

    it('should deny agent modify evidence_file (close_gate.md)', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/close_gate.md', 'modify');
      expect(result.allowed).toBe(false);
    });

    it('should allow agent create evidence_file (verification_report.md)', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/verification_report.md', 'create');
      expect(result.allowed).toBe(true);
    });

    it('should deny agent create spec_file', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/requirements.md', 'create');
      expect(result.allowed).toBe(false);
    });
  });

  describe('enableRBAC=true + sf-orchestrator restrictions', () => {
    it('should deny sf-orchestrator modify spec_file', () => {
      const ctx = ctxWithWI('sf-orchestrator', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/requirements.md', 'modify');
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('sf-orchestrator cannot modify');
    });

    it('should deny sf-orchestrator delete spec_file', () => {
      const ctx = ctxWithWI('sf-orchestrator', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/design.md', 'delete');
      expect(result.allowed).toBe(false);
    });

    it('should deny sf-orchestrator modify evidence_file', () => {
      const ctx = ctxWithWI('sf-orchestrator', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/evidence/report.md', 'modify');
      expect(result.allowed).toBe(false);
    });

    it('should deny sf-orchestrator create spec_file', () => {
      const ctx = ctxWithWI('sf-orchestrator', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/tasks.md', 'create');
      expect(result.allowed).toBe(false);
    });
  });

  describe('enableRBAC=true + authorized subjects', () => {
    it('should allow gate_runner create gate_file', () => {
      const ctx = ctxWithWI('gate_runner', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/gate_summary.md', 'create');
      expect(result.allowed).toBe(true);
    });

    it('should allow gate_runner modify gate_file', () => {
      const ctx = ctxWithWI('gate_runner', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/gate_summary.md', 'modify');
      expect(result.allowed).toBe(true);
    });

    it('should allow user_decision_recorder create decision_file', () => {
      const ctx = ctxWithWI('user_decision_recorder', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/user_decision.json', 'create');
      expect(result.allowed).toBe(true);
    });

    it('should allow merge_runner create merge_file', () => {
      const ctx = ctxWithWI('merge_runner', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/merge_report.md', 'create');
      expect(result.allowed).toBe(true);
    });

    it('should allow close_gate create evidence_file', () => {
      const ctx = ctxWithWI('close_gate', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/close_gate.md', 'create');
      expect(result.allowed).toBe(true);
    });

    it('should allow close_gate modify evidence_file', () => {
      const ctx = ctxWithWI('close_gate', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/verification_report.md', 'modify');
      expect(result.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + unprotected files', () => {
    it('should not affect unprotected source files', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, 'src/index.ts', 'modify');
      expect(result.allowed).toBe(true);
    });

    it('should not affect random .specforge/ files', () => {
      const ctx = ctxWithWI('agent', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/something.txt', 'modify');
      expect(result.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + unknown principal', () => {
    it('should deny unknown role modify spec_file', () => {
      // unknown roles are blocked by the first VALID_ROLES check
      const ctx = ctxWithWI('unknown_role', { enableRBAC: true });
      const result = checkWrite(ctx, '.specforge/specs/WI-001/requirements.md', 'modify');
      expect(result.allowed).toBe(false);
    });
  });
});
