/**
 * RBACEngine-RoundB.test.ts — RBACEngine Round B 集成测试
 *
 * 覆盖：
 * - enableRBAC=false 仍放行
 * - enableRBAC=true protected file denied/allowed 生效
 * - audit logger 能记录 RBACEngine check 结果
 * - checkFile 路径匹配
 */
import { describe, it, expect } from 'vitest';
import { RBACEngine, createRBACEngine } from '../../../src/rbac/RBACEngine.js';
import { AuthorizationAuditLogger, InMemoryAuditSink } from '../../../src/rbac/AuthorizationAuditLogger.js';
import type { Principal } from '@specforge/types/principal';
import type { Permission, PermissionContext } from '@specforge/types/permissions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const orchestrator: Principal = {
  actorRole: 'sf-orchestrator',
  agentRole: 'orchestrator',
  source: 'tool_call',
};

const gateRunner: Principal = {
  actorRole: 'gate_runner',
  agentRole: null,
  source: 'internal',
};

const agent: Principal = {
  actorRole: 'agent',
  agentRole: null,
  source: 'tool_call',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RBACEngine Round B integration', () => {
  describe('enableRBAC=false (default)', () => {
    it('should allow all file operations', () => {
      const engine = new RBACEngine();
      const decision = engine.check(
        agent,
        { resource: 'spec_file', operation: 'modify' },
        { isFrozen: true },
      );
      expect(decision.allowed).toBe(true);
      expect(decision.matchedRule).toBe('rbac_disabled');
    });

    it('should allow state_transition when RBAC disabled', () => {
      const engine = new RBACEngine();
      const decision = engine.check(
        orchestrator,
        { resource: 'state_transition', operation: 'invoke' },
        {},
      );
      expect(decision.allowed).toBe(true);
    });

    it('checkFile should allow unprotected files', () => {
      const engine = new RBACEngine();
      const decision = engine.checkFile(agent, 'modify', 'src/index.ts', {});
      expect(decision.allowed).toBe(true);
    });

    it('checkFile should allow protected files when RBAC disabled', () => {
      const engine = new RBACEngine();
      const decision = engine.checkFile(
        agent,
        'modify',
        '.specforge/specs/WI-001/requirements.md',
        { isFrozen: true },
      );
      expect(decision.allowed).toBe(true);
    });
  });

  describe('enableRBAC=true + file operations', () => {
    const engine = new RBACEngine({ enableRBAC: true });

    it('should deny agent modify spec_file', () => {
      const decision = engine.check(
        agent,
        { resource: 'spec_file', operation: 'modify' },
        {},
      );
      expect(decision.allowed).toBe(false);
    });

    it('should allow gate_runner modify gate_file', () => {
      const decision = engine.check(
        gateRunner,
        { resource: 'gate_file', operation: 'modify' },
        {},
      );
      expect(decision.allowed).toBe(true);
    });

    it('should deny orchestrator modify spec_file', () => {
      const decision = engine.check(
        orchestrator,
        { resource: 'spec_file', operation: 'modify' },
        {},
      );
      expect(decision.allowed).toBe(false);
    });

    it('should allow read on any protected file', () => {
      const decision = engine.check(
        agent,
        { resource: 'spec_file', operation: 'read' },
        {},
      );
      expect(decision.allowed).toBe(true);
    });

    it('should route state_transition to use_transition_authorizer hint', () => {
      const decision = engine.check(
        orchestrator,
        { resource: 'state_transition', operation: 'invoke' },
        {},
      );
      expect(decision.allowed).toBe(false);
      expect(decision.matchedRule).toBe('use_transition_authorizer');
    });

    it('should allow tool_invocation passthrough', () => {
      const decision = engine.check(
        agent,
        { resource: 'tool_invocation', operation: 'invoke' },
        {},
      );
      expect(decision.allowed).toBe(true);
    });

    it('should deny code_file for unknown resource', () => {
      // code_file is in FILE_RESOURCE_TYPES but not in FROZEN_PROTECTED_RESOURCES
      // so FileAuthorizationPolicy will return non_protected_resource
      const decision = engine.check(
        agent,
        { resource: 'code_file', operation: 'modify' },
        {},
      );
      expect(decision.allowed).toBe(true);
      expect(decision.matchedRule).toBe('non_protected_resource');
    });
  });

  describe('enableRBAC=true + checkFile', () => {
    const engine = new RBACEngine({ enableRBAC: true });

    it('should deny agent modify requirements.md', () => {
      const decision = engine.checkFile(
        agent,
        'modify',
        '.specforge/specs/WI-001/requirements.md',
        {},
      );
      expect(decision.allowed).toBe(false);
    });

    it('should allow gate_runner modify gate_summary.md', () => {
      const decision = engine.checkFile(
        gateRunner,
        'modify',
        '.specforge/specs/WI-001/gate_summary.md',
        {},
      );
      expect(decision.allowed).toBe(true);
    });

    it('should allow unprotected file operations', () => {
      const decision = engine.checkFile(
        agent,
        'modify',
        'src/index.ts',
        {},
      );
      expect(decision.allowed).toBe(true);
      expect(decision.matchedRule).toBe('non_protected_file');
    });

    it('should allow agent create evidence via checkFile', () => {
      const decision = engine.checkFile(
        agent,
        'create',
        '.specforge/specs/WI-001/evidence/report.md',
        {},
      );
      expect(decision.allowed).toBe(true);
    });
  });

  describe('audit logger integration', () => {
    it('should record allowed decisions when audit logger configured', () => {
      const auditLogger = new AuthorizationAuditLogger();
      const engine = new RBACEngine({ enableRBAC: false, auditLogger });

      engine.check(
        agent,
        { resource: 'spec_file', operation: 'modify' },
        { isFrozen: true },
      );

      const records = auditLogger.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].decision.allowed).toBe(true);
      expect(records[0].decision.matchedRule).toBe('rbac_disabled');
    });

    it('should record denied decisions when RBAC enabled', () => {
      const auditLogger = new AuthorizationAuditLogger();
      const engine = new RBACEngine({ enableRBAC: true, auditLogger });

      engine.check(
        agent,
        { resource: 'spec_file', operation: 'modify' },
        {},
      );

      const records = auditLogger.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].decision.allowed).toBe(false);
    });

    it('should not affect check() when no audit logger configured', () => {
      const engine = new RBACEngine({ enableRBAC: true });
      const decision = engine.check(
        gateRunner,
        { resource: 'gate_file', operation: 'modify' },
        {},
      );
      expect(decision.allowed).toBe(true);
    });

    it('should record checkFile decisions', () => {
      const auditLogger = new AuthorizationAuditLogger();
      const engine = new RBACEngine({ enableRBAC: true, auditLogger });

      engine.checkFile(
        agent,
        'modify',
        '.specforge/specs/WI-001/requirements.md',
        {},
      );

      const records = auditLogger.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].permission.resource).toBe('spec_file');
      expect(records[0].decision.allowed).toBe(false);
    });

    it('should record multiple decisions', () => {
      const auditLogger = new AuthorizationAuditLogger();
      const engine = new RBACEngine({ enableRBAC: true, auditLogger });

      engine.check(agent, { resource: 'spec_file', operation: 'modify' }, {});
      engine.check(gateRunner, { resource: 'gate_file', operation: 'modify' }, {});
      engine.check(agent, { resource: 'spec_file', operation: 'read' }, {});

      const records = auditLogger.getRecords();
      expect(records).toHaveLength(3);
      expect(records[0].decision.allowed).toBe(false);
      expect(records[1].decision.allowed).toBe(true);
      expect(records[2].decision.allowed).toBe(true);
    });
  });

  describe('factory function', () => {
    it('should create engine with default config', () => {
      const engine = createRBACEngine();
      expect(engine.isEnabled()).toBe(false);
    });

    it('should create engine with RBAC enabled', () => {
      const engine = createRBACEngine({ enableRBAC: true });
      expect(engine.isEnabled()).toBe(true);
    });

    it('should create engine with audit logger', () => {
      const auditLogger = new AuthorizationAuditLogger();
      const engine = createRBACEngine({ enableRBAC: true, auditLogger });
      expect(engine.isEnabled()).toBe(true);
    });
  });

  describe('getFilePolicy', () => {
    it('should expose file policy for testing', () => {
      const engine = new RBACEngine({ enableRBAC: true });
      const policy = engine.getFilePolicy();
      expect(policy).toBeDefined();
    });
  });
});
