/**
 * AuthorizationAuditLogger.test.ts — 授权审计记录器测试
 */
import { describe, it, expect } from 'vitest';
import {
  AuthorizationAuditLogger,
  createAuthorizationAuditLogger,
  InMemoryAuditSink,
} from '../../../src/rbac/AuthorizationAuditLogger.js';
import type { AuditSink, AuthorizationAuditRecord } from '../../../src/rbac/AuthorizationAuditLogger.js';
import type { Principal } from '@specforge/types/principal';
import type { Permission, PermissionContext, PermissionDecision } from '@specforge/types/permissions';

// Helpers
const testPrincipal: Principal = {
  actorRole: 'agent',
  agentRole: null,
  source: 'tool_call',
};

const testPermission: Permission = {
  resource: 'spec_file',
  operation: 'modify',
};

const testContext: PermissionContext = {
  filePath: '.specforge/specs/WI-001/requirements.md',
  isFrozen: false,
};

const testDecisionAllowed: PermissionDecision = {
  allowed: true,
  matchedRule: 'test_rule',
};

const testDecisionDenied: PermissionDecision = {
  allowed: false,
  reason: 'test deny',
  matchedRule: 'test_deny_rule',
};

describe('AuthorizationAuditLogger', () => {
  describe('basic recording', () => {
    it('should record an allowed decision', () => {
      const logger = new AuthorizationAuditLogger();
      logger.record(testPrincipal, testPermission, testContext, testDecisionAllowed);

      const records = logger.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].decision.allowed).toBe(true);
      expect(records[0].decision.matchedRule).toBe('test_rule');
    });

    it('should record a denied decision', () => {
      const logger = new AuthorizationAuditLogger();
      logger.record(testPrincipal, testPermission, testContext, testDecisionDenied);

      const records = logger.getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].decision.allowed).toBe(false);
      expect(records[0].decision.reason).toBe('test deny');
    });

    it('should record all fields', () => {
      const logger = new AuthorizationAuditLogger();
      logger.record(testPrincipal, testPermission, testContext, testDecisionAllowed);

      const record = logger.getRecords()[0];
      expect(record.timestamp).toBeDefined();
      expect(record.principal).toEqual(testPrincipal);
      expect(record.permission).toEqual(testPermission);
      expect(record.context).toEqual(testContext);
      expect(record.decision).toEqual(testDecisionAllowed);
    });

    it('should record timestamp as valid ISO string', () => {
      const logger = new AuthorizationAuditLogger();
      logger.record(testPrincipal, testPermission, testContext, testDecisionAllowed);

      const record = logger.getRecords()[0];
      expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
    });
  });

  describe('multiple records', () => {
    it('should accumulate records', () => {
      const logger = new AuthorizationAuditLogger();
      logger.record(testPrincipal, testPermission, testContext, testDecisionAllowed);
      logger.record(testPrincipal, testPermission, testContext, testDecisionDenied);

      const records = logger.getRecords();
      expect(records).toHaveLength(2);
    });

    it('getLatest should return most recent N records', () => {
      const logger = new AuthorizationAuditLogger();
      for (let i = 0; i < 10; i++) {
        logger.record(testPrincipal, testPermission, testContext, testDecisionAllowed);
      }

      const latest = logger.getLatest(3);
      expect(latest).toHaveLength(3);
    });
  });

  describe('InMemoryAuditSink', () => {
    it('should support clear', () => {
      const sink = new InMemoryAuditSink();
      const logger = new AuthorizationAuditLogger({ sink });

      logger.record(testPrincipal, testPermission, testContext, testDecisionAllowed);
      expect(sink.length).toBe(1);

      sink.clear();
      expect(sink.length).toBe(0);
      expect(logger.getRecords()).toHaveLength(0);
    });

    it('should support getLatest', () => {
      const sink = new InMemoryAuditSink();
      for (let i = 0; i < 5; i++) {
        sink.write({
          timestamp: new Date().toISOString(),
          principal: testPrincipal,
          permission: testPermission,
          context: testContext,
          decision: testDecisionAllowed,
        });
      }

      const latest = sink.getLatest(2);
      expect(latest).toHaveLength(2);
    });
  });

  describe('custom sink', () => {
    it('should use injected custom sink', () => {
      const collected: AuthorizationAuditRecord[] = [];
      const customSink: AuditSink = {
        write(record) { collected.push(record); },
      };

      const logger = new AuthorizationAuditLogger({ sink: customSink });
      logger.record(testPrincipal, testPermission, testContext, testDecisionAllowed);

      expect(collected).toHaveLength(1);
      // getRecords returns empty for custom sink
      expect(logger.getRecords()).toHaveLength(0);
    });
  });

  describe('no impact without logger', () => {
    it('should not throw when no audit logger is configured', () => {
      // This test verifies that not having an audit logger doesn't affect
      // RBACEngine behavior — tested indirectly via RBACEngine integration tests
      const logger = new AuthorizationAuditLogger();
      expect(logger.getRecords()).toHaveLength(0);
      expect(logger.getLatest(5)).toHaveLength(0);
    });
  });

  describe('factory function', () => {
    it('createAuthorizationAuditLogger should create instance', () => {
      const logger = createAuthorizationAuditLogger();
      expect(logger).toBeInstanceOf(AuthorizationAuditLogger);
    });

    it('createAuthorizationAuditLogger with custom sink', () => {
      const customSink = new InMemoryAuditSink();
      const logger = createAuthorizationAuditLogger({ sink: customSink });
      expect(logger).toBeInstanceOf(AuthorizationAuditLogger);
    });
  });
});
