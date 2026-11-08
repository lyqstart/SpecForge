/**
 * PrincipalResolver.test.ts — Phase 1 Principal 解析器 tests
 */
import { describe, it, expect } from 'vitest';
import { PrincipalResolver, createPrincipalResolver } from '../../../src/rbac/PrincipalResolver.js';

describe('PrincipalResolver', () => {
  const resolver = new PrincipalResolver();

  describe('resolve sf-orchestrator', () => {
    it('should resolve sf-orchestrator with correct actorRole and agentRole', () => {
      const result = resolver.resolve('sf-orchestrator');
      expect(result.actorRole).toBe('sf-orchestrator');
      expect(result.agentRole).toBe('orchestrator');
      expect(result.source).toBe('tool_call');
    });

    it('should preserve sessionId for sf-orchestrator', () => {
      const result = resolver.resolve('sf-orchestrator', 'session-123');
      expect(result.sessionId).toBe('session-123');
    });
  });

  describe('resolve undefined', () => {
    it('should resolve undefined to agent/internal', () => {
      const result = resolver.resolve(undefined);
      expect(result.actorRole).toBe('agent');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('internal');
    });
  });

  describe('resolve empty string', () => {
    it('should resolve empty string to agent/internal', () => {
      const result = resolver.resolve('');
      expect(result.actorRole).toBe('agent');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('internal');
    });
  });

  describe('resolve known ACTOR_ROLES values', () => {
    it('should resolve gate_runner', () => {
      const result = resolver.resolve('gate_runner');
      expect(result.actorRole).toBe('gate_runner');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('tool_call');
    });

    it('should resolve merge_runner', () => {
      const result = resolver.resolve('merge_runner');
      expect(result.actorRole).toBe('merge_runner');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('tool_call');
    });

    it('should resolve close_gate', () => {
      const result = resolver.resolve('close_gate');
      expect(result.actorRole).toBe('close_gate');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('tool_call');
    });

    it('should resolve user_decision_recorder', () => {
      const result = resolver.resolve('user_decision_recorder');
      expect(result.actorRole).toBe('user_decision_recorder');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('tool_call');
    });

    it('should resolve code_permission_service', () => {
      const result = resolver.resolve('code_permission_service');
      expect(result.actorRole).toBe('code_permission_service');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('tool_call');
    });

    it('should resolve write_guard', () => {
      const result = resolver.resolve('write_guard');
      expect(result.actorRole).toBe('write_guard');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('tool_call');
    });

    it('should resolve agent', () => {
      const result = resolver.resolve('agent');
      expect(result.actorRole).toBe('agent');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('tool_call');
    });
  });

  describe('resolve unknown', () => {
    it('should resolve unknown to agent/internal (not throw)', () => {
      const result = resolver.resolve('some_random_agent');
      expect(result.actorRole).toBe('agent');
      expect(result.agentRole).toBeNull();
      expect(result.source).toBe('internal');
    });

    it('should not elevate permissions for unknown', () => {
      const result = resolver.resolve('admin');
      expect(result.actorRole).toBe('agent');
      expect(result.agentRole).toBeNull();
    });

    it('should not elevate permissions for user string', () => {
      const result = resolver.resolve('user');
      expect(result.actorRole).toBe('agent');
      expect(result.agentRole).toBeNull();
    });
  });

  describe('sessionId preservation', () => {
    it('should preserve sessionId for known roles', () => {
      const result = resolver.resolve('gate_runner', 'sess-456');
      expect(result.sessionId).toBe('sess-456');
    });

    it('should preserve sessionId for unknown roles', () => {
      const result = resolver.resolve('unknown', 'sess-789');
      expect(result.sessionId).toBe('sess-789');
    });

    it('should have undefined sessionId when not provided', () => {
      const result = resolver.resolve('sf-orchestrator');
      expect(result.sessionId).toBeUndefined();
    });
  });

  describe('createPrincipalResolver factory', () => {
    it('should create a PrincipalResolver instance', () => {
      const r = createPrincipalResolver();
      expect(r).toBeInstanceOf(PrincipalResolver);
    });
  });
});
