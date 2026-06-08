/**
 * FileAuthorizationPolicy.test.ts — 受保护文件授权策略测试
 */
import { describe, it, expect } from 'vitest';
import {
  FileAuthorizationPolicy,
  createFileAuthorizationPolicy,
} from '../../../src/rbac/FileAuthorizationPolicy.js';
import type { Principal } from '@specforge/types/principal';
import type { Permission, PermissionContext, PermissionDecision } from '@specforge/types/permissions';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const principalByRole = (role: string): Principal => ({
  actorRole: role as Principal['actorRole'],
  agentRole: null,
  source: 'tool_call',
});

const orchestrator: Principal = principalByRole('sf-orchestrator');
const gateRunner: Principal = principalByRole('gate_runner');
const userDecisionRecorder: Principal = principalByRole('user_decision_recorder');
const mergeRunner: Principal = principalByRole('merge_runner');
const closeGate: Principal = principalByRole('close_gate');
const agent: Principal = principalByRole('agent');
const unknown: Principal = principalByRole('agent'); // unknown maps to agent

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileAuthorizationPolicy', () => {
  describe('enableRBAC=false (default)', () => {
    const policy = new FileAuthorizationPolicy();

    it('should allow any operation when RBAC disabled', () => {
      const decision = policy.check({
        principal: orchestrator,
        permission: { resource: 'spec_file', operation: 'modify' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(true);
      expect(decision.matchedRule).toBe('rbac_disabled');
    });

    it('should allow delete when RBAC disabled', () => {
      const decision = policy.check({
        principal: unknown,
        permission: { resource: 'spec_file', operation: 'delete' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + read operations', () => {
    const policy = new FileAuthorizationPolicy({ enableRBAC: true });

    it('should always allow read', () => {
      const decision = policy.check({
        principal: unknown,
        permission: { resource: 'spec_file', operation: 'read' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(true);
      expect(decision.matchedRule).toBe('read_allowed');
    });

    it('should allow read on gate_file', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'gate_file', operation: 'read' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow read on evidence_file', () => {
      const decision = policy.check({
        principal: orchestrator,
        permission: { resource: 'evidence_file', operation: 'read' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + non-protected resources', () => {
    const policy = new FileAuthorizationPolicy({ enableRBAC: true });

    it('should allow operations on code_file', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'code_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
      expect(decision.matchedRule).toBe('non_protected_resource');
    });

    it('should allow operations on tool_invocation', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'tool_invocation', operation: 'invoke' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + orchestrator restrictions', () => {
    const policy = new FileAuthorizationPolicy({ enableRBAC: true });

    it('should deny orchestrator modify spec_file', () => {
      const decision = policy.check({
        principal: orchestrator,
        permission: { resource: 'spec_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe('orchestrator_cannot_modify_protected');
      expect(decision.reason).toContain('sf-orchestrator');
    });

    it('should deny orchestrator delete spec_file', () => {
      const decision = policy.check({
        principal: orchestrator,
        permission: { resource: 'spec_file', operation: 'delete' },
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });

    it('should deny orchestrator modify evidence_file', () => {
      const decision = policy.check({
        principal: orchestrator,
        permission: { resource: 'evidence_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });

    it('should deny orchestrator modify gate_file', () => {
      const decision = policy.check({
        principal: orchestrator,
        permission: { resource: 'gate_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });

    it('should allow orchestrator create spec_file (no specific rule blocks create)', () => {
      const decision = policy.check({
        principal: orchestrator,
        permission: { resource: 'spec_file', operation: 'create' },
        context: {},
      });
      // orchestrator is blocked from modify/delete but not explicitly from create
      // however create spec_file isn't in AUTHORIZED_SUBJECT_OPERATIONS for orchestrator
      // so it falls to default_deny_protected
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe('default_deny_protected');
    });
  });

  describe('enableRBAC=true + frozen restrictions', () => {
    const policy = new FileAuthorizationPolicy({ enableRBAC: true });

    it('should deny modify spec_file when frozen', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'spec_file', operation: 'modify' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe('frozen_modify_denied');
    });

    it('should deny delete spec_file when frozen', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'spec_file', operation: 'delete' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(false);
    });

    it('should deny modify evidence_file when frozen (non-authorized agent)', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'evidence_file', operation: 'modify' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(false);
    });

    it('should deny delete evidence_file when frozen', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'evidence_file', operation: 'delete' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(false);
    });

    it('should allow read when frozen', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'spec_file', operation: 'read' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow gate_runner modify gate_file when frozen', () => {
      const decision = policy.check({
        principal: gateRunner,
        permission: { resource: 'gate_file', operation: 'modify' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow merge_runner modify merge_file when frozen', () => {
      const decision = policy.check({
        principal: mergeRunner,
        permission: { resource: 'merge_file', operation: 'modify' },
        context: { isFrozen: true },
      });
      expect(decision.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + authorized subjects', () => {
    const policy = new FileAuthorizationPolicy({ enableRBAC: true });

    it('should allow gate_runner create gate_file', () => {
      const decision = policy.check({
        principal: gateRunner,
        permission: { resource: 'gate_file', operation: 'create' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow gate_runner modify gate_file', () => {
      const decision = policy.check({
        principal: gateRunner,
        permission: { resource: 'gate_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should deny gate_runner delete gate_file', () => {
      const decision = policy.check({
        principal: gateRunner,
        permission: { resource: 'gate_file', operation: 'delete' },
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });

    it('should allow user_decision_recorder create decision_file', () => {
      const decision = policy.check({
        principal: userDecisionRecorder,
        permission: { resource: 'decision_file', operation: 'create' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow user_decision_recorder modify decision_file', () => {
      const decision = policy.check({
        principal: userDecisionRecorder,
        permission: { resource: 'decision_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow merge_runner create merge_file', () => {
      const decision = policy.check({
        principal: mergeRunner,
        permission: { resource: 'merge_file', operation: 'create' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow close_gate create evidence_file', () => {
      const decision = policy.check({
        principal: closeGate,
        permission: { resource: 'evidence_file', operation: 'create' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow close_gate modify evidence_file', () => {
      const decision = policy.check({
        principal: closeGate,
        permission: { resource: 'evidence_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should allow agent create evidence_file', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'evidence_file', operation: 'create' },
        context: {},
      });
      expect(decision.allowed).toBe(true);
    });

    it('should deny agent modify evidence_file', () => {
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'evidence_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });
  });

  describe('enableRBAC=true + unknown principal', () => {
    const policy = new FileAuthorizationPolicy({ enableRBAC: true });

    it('should not elevate unknown principal permissions', () => {
      // unknown resolves to agent role via PrincipalResolver
      // agent can only create evidence_file, not modify spec_file
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'spec_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });
  });

  describe('checkFile (path-based)', () => {
    const policy = new FileAuthorizationPolicy({ enableRBAC: true });

    it('should identify and protect requirements.md', () => {
      const decision = policy.checkFile(
        agent,
        'modify',
        '.specforge/specs/WI-001/requirements.md',
        { isFrozen: false },
      );
      expect(decision.allowed).toBe(false);
    });

    it('should allow unprotected files', () => {
      const decision = policy.checkFile(
        agent,
        'modify',
        'src/index.ts',
        {},
      );
      expect(decision.allowed).toBe(true);
      expect(decision.matchedRule).toBe('unprotected_file');
    });

    it('should allow gate_runner to modify gate_summary.md', () => {
      const decision = policy.checkFile(
        gateRunner,
        'modify',
        '.specforge/specs/WI-001/gate_summary.md',
        {},
      );
      expect(decision.allowed).toBe(true);
    });

    it('should deny agent modify user_decision.json', () => {
      const decision = policy.checkFile(
        agent,
        'modify',
        '.specforge/specs/WI-001/user_decision.json',
        {},
      );
      expect(decision.allowed).toBe(false);
    });

    it('should allow user_decision_recorder create user_decision.json', () => {
      const decision = policy.checkFile(
        userDecisionRecorder,
        'create',
        '.specforge/specs/WI-001/user_decision.json',
        {},
      );
      expect(decision.allowed).toBe(true);
    });
  });

  describe('factory function', () => {
    it('should create policy with default config', () => {
      const policy = createFileAuthorizationPolicy();
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'spec_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(true); // RBAC disabled
    });

    it('should create policy with RBAC enabled', () => {
      const policy = createFileAuthorizationPolicy({ enableRBAC: true });
      const decision = policy.check({
        principal: agent,
        permission: { resource: 'spec_file', operation: 'modify' },
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });
  });
});
