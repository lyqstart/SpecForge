/**
 * RBACEngine.test.ts — Phase 1 RBAC Engine skeleton tests
 */
import { describe, it, expect } from 'vitest';
import { RBACEngine, createRBACEngine } from '../../../src/rbac/RBACEngine.js';
import type { Principal } from '@specforge/types/principal';
import type { Permission, PermissionContext } from '@specforge/types/permissions';

const MOCK_PRINCIPAL: Principal = {
  actorRole: 'agent',
  agentRole: null,
  source: 'tool_call',
};

const MOCK_PERMISSION: Permission = {
  resource: 'state_transition',
  operation: 'invoke',
};

const MOCK_CONTEXT: PermissionContext = {
  workItemId: 'WI-0001',
  currentState: 'created',
  targetState: 'intake_ready',
};

describe('RBACEngine', () => {
  describe('constructor', () => {
    it('should default enableRBAC to false', () => {
      const engine = new RBACEngine();
      expect(engine.isEnabled()).toBe(false);
    });

    it('should accept config with enableRBAC=false', () => {
      const engine = new RBACEngine({ enableRBAC: false });
      expect(engine.isEnabled()).toBe(false);
    });

    it('should accept config with enableRBAC=true', () => {
      const engine = new RBACEngine({ enableRBAC: true });
      expect(engine.isEnabled()).toBe(true);
    });
  });

  describe('check with enableRBAC=false (default)', () => {
    it('should return allowed=true when RBAC is disabled', () => {
      const engine = new RBACEngine();
      const result = engine.check(MOCK_PRINCIPAL, MOCK_PERMISSION, MOCK_CONTEXT);
      expect(result.allowed).toBe(true);
    });

    it('should return matchedRule=rbac_disabled', () => {
      const engine = new RBACEngine();
      const result = engine.check(MOCK_PRINCIPAL, MOCK_PERMISSION);
      expect(result.matchedRule).toBe('rbac_disabled');
    });

    it('should allow any principal when disabled', () => {
      const engine = new RBACEngine();
      const principal: Principal = { actorRole: 'sf-orchestrator', agentRole: 'orchestrator', source: 'tool_call' };
      const result = engine.check(principal, MOCK_PERMISSION);
      expect(result.allowed).toBe(true);
    });

    it('should allow any permission when disabled', () => {
      const engine = new RBACEngine();
      const permission: Permission = { resource: 'code_file', operation: 'delete' };
      const result = engine.check(MOCK_PRINCIPAL, permission);
      expect(result.allowed).toBe(true);
    });
  });

  describe('check with enableRBAC=true', () => {
    it('should return allowed=false when RBAC is enabled but no rules configured', () => {
      const engine = new RBACEngine({ enableRBAC: true });
      const result = engine.check(MOCK_PRINCIPAL, MOCK_PERMISSION, MOCK_CONTEXT);
      expect(result.allowed).toBe(false);
    });

    it('should return matchedRule=default_deny when enabled', () => {
      const engine = new RBACEngine({ enableRBAC: true });
      const result = engine.check(MOCK_PRINCIPAL, MOCK_PERMISSION);
      expect(result.matchedRule).toBe('default_deny');
    });

    it('should return reason when denied', () => {
      const engine = new RBACEngine({ enableRBAC: true });
      const result = engine.check(MOCK_PRINCIPAL, MOCK_PERMISSION);
      expect(result.reason).toBeTruthy();
    });

    it('should deny even sf-orchestrator when no rules configured', () => {
      const engine = new RBACEngine({ enableRBAC: true });
      const principal: Principal = { actorRole: 'sf-orchestrator', agentRole: 'orchestrator', source: 'tool_call' };
      const result = engine.check(principal, MOCK_PERMISSION);
      expect(result.allowed).toBe(false);
    });
  });

  describe('createRBACEngine factory', () => {
    it('should create engine with default config', () => {
      const engine = createRBACEngine();
      expect(engine).toBeInstanceOf(RBACEngine);
      expect(engine.isEnabled()).toBe(false);
    });

    it('should create engine with custom config', () => {
      const engine = createRBACEngine({ enableRBAC: true });
      expect(engine.isEnabled()).toBe(true);
    });
  });
});
