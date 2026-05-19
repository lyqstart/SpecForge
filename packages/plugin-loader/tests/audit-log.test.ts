/**
 * Unit tests for Audit Logger (Task 5.3.1)
 * Tests audit log functionality and event traceability
 *
 * Validates: Property PL-4 (事件可追溯性)
 * Feature: plugin-loader, Property 4: 所有插件加载操作产生审计记录
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AuditLogger,
  InMemoryAuditLogStorage,
  createAuditLogger,
  getAuditLogger,
  resetAuditLogger,
  type AuditLogEntry,
  type AuditAction,
} from '../src/audit-log';

describe('Audit Logger (Task 5.3.1)', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    resetAuditLogger();
    logger = new AuditLogger({ verbose: false });
  });

  afterEach(() => {
    logger.clearLogs();
  });

  describe('AuditLogEntry Structure', () => {
    it('should create audit log entry with schema_version', () => {
      const entry = logger.logLoad('test-plugin', true);

      expect(entry.schema_version).toBe('1.0');
    });

    it('should create audit log entry with unique eventId', () => {
      const entry1 = logger.logLoad('test-plugin', true);
      const entry2 = logger.logLoad('test-plugin', true);

      expect(entry1.eventId).toMatch(/^audit_\d+_[a-z0-9]+$/);
      expect(entry2.eventId).toMatch(/^audit_\d+_[a-z0-9]+$/);
      expect(entry1.eventId).not.toBe(entry2.eventId);
    });

    it('should create audit log entry with timestamp', () => {
      const before = Date.now();
      const entry = logger.logLoad('test-plugin', true);
      const after = Date.now();

      expect(entry.ts).toBeGreaterThanOrEqual(before);
      expect(entry.ts).toBeLessThanOrEqual(after);
    });

    it('should create audit log entry with correct action type', () => {
      const loadEntry = logger.logLoad('test-plugin', true);
      const unloadEntry = logger.logUnload('test-plugin', true);
      const reloadEntry = logger.logReload('test-plugin', true);

      expect(loadEntry.action).toBe('load');
      expect(unloadEntry.action).toBe('unload');
      expect(reloadEntry.action).toBe('reload');
    });
  });

  describe('logLoad', () => {
    it('should log successful plugin load', () => {
      const entry = logger.logLoad('test-plugin', true, {
        version: '1.0.0',
        requires: ['filesystem.read', 'network'],
        grants: ['filesystem.read', 'network'],
        staticCheckPassed: true,
        permissionCheckResult: { authorized: true },
        duration: 150,
      });

      expect(entry.pluginId).toBe('test-plugin');
      expect(entry.success).toBe(true);
      expect(entry.version).toBe('1.0.0');
      expect(entry.requires).toEqual(['filesystem.read', 'network']);
      expect(entry.grants).toEqual(['filesystem.read', 'network']);
      expect(entry.staticCheckPassed).toBe(true);
      expect(entry.duration).toBe(150);
    });

    it('should log failed plugin load', () => {
      const entry = logger.logLoad('test-plugin', false, {
        version: '1.0.0',
        reason: 'Permission denied',
        errorCode: 'PERMISSION_DENIED',
        errorDetails: { missing: ['network'] },
        requires: ['filesystem.read', 'network'],
        grants: ['filesystem.read'],
        staticCheckPassed: true,
        permissionCheckResult: { authorized: false, missing: ['network'] },
        duration: 100,
      });

      expect(entry.pluginId).toBe('test-plugin');
      expect(entry.success).toBe(false);
      expect(entry.reason).toBe('Permission denied');
      expect(entry.errorCode).toBe('PERMISSION_DENIED');
      expect(entry.errorDetails).toEqual({ missing: ['network'] });
      expect(entry.permissionCheckResult?.authorized).toBe(false);
      expect(entry.permissionCheckResult?.missing).toEqual(['network']);
    });

    it('should handle load without optional fields', () => {
      const entry = logger.logLoad('test-plugin', true);

      expect(entry.pluginId).toBe('test-plugin');
      expect(entry.success).toBe(true);
      expect(entry.version).toBeUndefined();
      expect(entry.requires).toBeUndefined();
      expect(entry.duration).toBeUndefined();
    });
  });

  describe('logReload', () => {
    it('should log successful plugin reload', () => {
      const entry = logger.logReload('test-plugin', true, {
        version: '1.0.1',
        requires: ['filesystem.read'],
        grants: ['filesystem.read'],
        staticCheckPassed: true,
        duration: 200,
      });

      expect(entry.action).toBe('reload');
      expect(entry.pluginId).toBe('test-plugin');
      expect(entry.success).toBe(true);
      expect(entry.version).toBe('1.0.1');
    });

    it('should log failed plugin reload', () => {
      const entry = logger.logReload('test-plugin', false, {
        reason: 'Plugin not loaded',
        errorCode: 'LOAD_ERROR',
      });

      expect(entry.action).toBe('reload');
      expect(entry.success).toBe(false);
      expect(entry.reason).toBe('Plugin not loaded');
      expect(entry.errorCode).toBe('LOAD_ERROR');
    });
  });

  describe('logUnload', () => {
    it('should log successful plugin unload', () => {
      const entry = logger.logUnload('test-plugin', true, {
        reason: 'User requested',
      });

      expect(entry.action).toBe('unload');
      expect(entry.pluginId).toBe('test-plugin');
      expect(entry.success).toBe(true);
      expect(entry.reason).toBe('User requested');
    });

    it('should log failed plugin unload', () => {
      const entry = logger.logUnload('test-plugin', false, {
        reason: 'Plugin not found',
      });

      expect(entry.action).toBe('unload');
      expect(entry.success).toBe(false);
      expect(entry.reason).toBe('Plugin not found');
    });
  });

  describe('logPermissionCheck', () => {
    it('should log permission check with authorized result', () => {
      const entry = logger.logPermissionCheck('test-plugin', {
        authorized: true,
        source: 'user',
      }, {
        requires: ['filesystem.read', 'network'],
        grants: ['filesystem.read', 'network'],
      });

      expect(entry.action).toBe('permission_check');
      expect(entry.pluginId).toBe('test-plugin');
      expect(entry.success).toBe(true);
      expect(entry.requires).toEqual(['filesystem.read', 'network']);
      expect(entry.grants).toEqual(['filesystem.read', 'network']);
      expect(entry.permissionCheckResult?.authorized).toBe(true);
    });

    it('should log permission check with denied result', () => {
      const entry = logger.logPermissionCheck('test-plugin', {
        authorized: false,
        missing: ['network'],
        source: 'default',
      }, {
        requires: ['filesystem.read', 'network'],
        grants: ['filesystem.read'],
      });

      expect(entry.action).toBe('permission_check');
      expect(entry.success).toBe(false);
      expect(entry.permissionCheckResult?.authorized).toBe(false);
      expect(entry.permissionCheckResult?.missing).toEqual(['network']);
    });
  });

  describe('logStaticCheck', () => {
    it('should log static check with passed result', () => {
      const entry = logger.logStaticCheck('test-plugin', true, {
        duration: 50,
      });

      expect(entry.action).toBe('static_check');
      expect(entry.pluginId).toBe('test-plugin');
      expect(entry.success).toBe(true);
      expect(entry.staticCheckPassed).toBe(true);
      expect(entry.duration).toBe(50);
    });

    it('should log static check with failed result', () => {
      const entry = logger.logStaticCheck('test-plugin', false, {
        result: {
          passed: false,
          violations: [
            { ruleName: 'CP001', errorMessage: 'Forbidden API', line: 10 },
          ],
          duration: 50,
        },
        duration: 50,
      });

      expect(entry.action).toBe('static_check');
      expect(entry.success).toBe(false);
      expect(entry.staticCheckPassed).toBe(false);
      expect(entry.staticCheckResult?.violationsCount).toBe(1);
    });
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      // Setup test data
      logger.logLoad('plugin-a', true, { version: '1.0.0' });
      logger.logLoad('plugin-b', true, { version: '1.0.0' });
      logger.logLoad('plugin-a', true, { version: '1.0.1' }); // Second load for plugin-a
      logger.logUnload('plugin-a', true);
    });

    describe('getLogs', () => {
      it('should return all logs', () => {
        const logs = logger.getLogs();
        expect(logs).toHaveLength(4);
      });
    });

    describe('getLogsByPluginId', () => {
      it('should return logs for specific plugin', () => {
        const logs = logger.getLogsByPluginId('plugin-a');
        expect(logs).toHaveLength(3); // 2 loads + 1 unload
        expect(logs.every(l => l.pluginId === 'plugin-a')).toBe(true);
      });

      it('should return empty array for non-existent plugin', () => {
        const logs = logger.getLogsByPluginId('non-existent');
        expect(logs).toHaveLength(0);
      });
    });

    describe('getLogsByAction', () => {
      it('should return logs by action type', () => {
        const loadLogs = logger.getLogsByAction('load');
        const unloadLogs = logger.getLogsByAction('unload');

        expect(loadLogs).toHaveLength(3);
        expect(unloadLogs).toHaveLength(1);
      });
    });

    describe('getLogsByTimeRange', () => {
      it('should return logs within time range', () => {
        const firstLog = logger.getLogs()[0];
        const start = firstLog.ts - 1000;
        const end = firstLog.ts + 1000;

        const logs = logger.getLogsByTimeRange(start, end);
        expect(logs.length).toBeGreaterThan(0);
      });

      it('should return empty array for time range with no logs', () => {
        const start = Date.now() + 1000000;
        const end = start + 1000;

        const logs = logger.getLogsByTimeRange(start, end);
        expect(logs).toHaveLength(0);
      });
    });

    describe('getLogCount', () => {
      it('should return correct log count', () => {
        expect(logger.getLogCount()).toBe(4);
      });
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs', () => {
      logger.logLoad('plugin-a', true);
      logger.logLoad('plugin-b', true);

      expect(logger.getLogCount()).toBe(2);

      logger.clearLogs();

      expect(logger.getLogCount()).toBe(0);
    });
  });

  describe('Verbose Mode', () => {
    it('should include metadata when verbose is true', () => {
      const verboseLogger = new AuditLogger({ verbose: true });
      const entry = verboseLogger.logLoad('test-plugin', true, {
        metadata: { customField: 'value' },
      });

      expect(entry.metadata).toBeDefined();
      expect(entry.metadata?.customField).toBe('value');
    });

    it('should not include metadata when verbose is false', () => {
      const entry = logger.logLoad('test-plugin', true, {
        metadata: { customField: 'value' },
      });

      expect(entry.metadata).toBeUndefined();
    });
  });

  describe('InMemoryAuditLogStorage', () => {
    it('should store and retrieve logs', () => {
      const storage = new InMemoryAuditLogStorage();
      const entry: AuditLogEntry = {
        schema_version: '1.0',
        eventId: 'audit_123_abc',
        ts: Date.now(),
        action: 'load' as AuditAction,
        pluginId: 'test-plugin',
        success: true,
      };

      storage.add(entry);
      const logs = storage.getAll();

      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(entry);
    });

    it('should support all query methods', () => {
      const storage = new InMemoryAuditLogStorage();
      
      storage.add({
        schema_version: '1.0',
        eventId: 'audit_1',
        ts: Date.now(),
        action: 'load',
        pluginId: 'plugin-a',
        success: true,
      });

      storage.add({
        schema_version: '1.0',
        eventId: 'audit_2',
        ts: Date.now(),
        action: 'load',
        pluginId: 'plugin-b',
        success: true,
      });

      storage.add({
        schema_version: '1.0',
        eventId: 'audit_3',
        ts: Date.now(),
        action: 'unload',
        pluginId: 'plugin-a',
        success: true,
      });

      expect(storage.getByPluginId('plugin-a')).toHaveLength(2);
      expect(storage.getByAction('load')).toHaveLength(2);
      expect(storage.size()).toBe(3);

      storage.clear();
      expect(storage.size()).toBe(0);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const logger1 = getAuditLogger();
      const logger2 = getAuditLogger();

      expect(logger1).toBe(logger2);
    });

    it('should reset singleton for testing', () => {
      const logger1 = getAuditLogger();
      resetAuditLogger();
      const logger2 = getAuditLogger();

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('createAuditLogger', () => {
    it('should create independent logger instances', () => {
      const logger1 = createAuditLogger();
      const logger2 = createAuditLogger();

      expect(logger1).not.toBe(logger2);
    });

    it('should accept custom storage', () => {
      const customStorage = new InMemoryAuditLogStorage();
      const logger = createAuditLogger({ storage: customStorage });

      logger.logLoad('test-plugin', true);
      
      expect(customStorage.size()).toBe(1);
    });
  });

  describe('verifyTraceability', () => {
    it('should verify load and unload records exist', () => {
      logger.logLoad('plugin-a', true);
      logger.logUnload('plugin-a', true);

      const result = logger.verifyTraceability();

      expect(result.hasLoadRecords).toBe(true);
      expect(result.hasUnloadRecords).toBe(true);
      expect(result.loadCount).toBe(1);
      expect(result.unloadCount).toBe(1);
    });

    it('should report correct counts', () => {
      logger.logLoad('plugin-a', true);
      logger.logLoad('plugin-b', true);
      logger.logLoad('plugin-c', true);
      logger.logUnload('plugin-a', true);

      const result = logger.verifyTraceability();

      expect(result.loadCount).toBe(3);
      expect(result.unloadCount).toBe(1);
    });
  });
});

describe('Property PL-4: 事件可追溯性 (Task 5.3.3)', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    resetAuditLogger();
    logger = new AuditLogger();
  });

  /**
   * Property PL-4: For all plugin loading operations (success or failure),
   * the PluginLoader should produce an audit log entry with complete context.
   */
  it('should generate audit log for every load operation (success)', () => {
    // Simulate load success
    logger.logLoad('my-plugin', true, {
      version: '1.0.0',
      requires: ['filesystem.read'],
      grants: ['filesystem.read'],
      staticCheckPassed: true,
      permissionCheckResult: { authorized: true },
      duration: 100,
    });

    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    
    const entry = logs[0];
    expect(entry.action).toBe('load');
    expect(entry.success).toBe(true);
    expect(entry.pluginId).toBe('my-plugin');
    expect(entry.version).toBe('1.0.0');
    expect(entry.requires).toEqual(['filesystem.read']);
    expect(entry.grants).toEqual(['filesystem.read']);
    expect(entry.staticCheckPassed).toBe(true);
    expect(entry.duration).toBe(100);
  });

  it('should generate audit log for every load operation (failure)', () => {
    // Simulate load failure
    logger.logLoad('my-plugin', false, {
      version: '1.0.0',
      reason: 'Permission denied',
      errorCode: 'PERMISSION_DENIED',
      requires: ['network'],
      grants: [], // No grants
      staticCheckPassed: true,
      permissionCheckResult: { authorized: false, missing: ['network'] },
      duration: 50,
    });

    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    
    const entry = logs[0];
    expect(entry.action).toBe('load');
    expect(entry.success).toBe(false);
    expect(entry.reason).toBe('Permission denied');
    expect(entry.errorCode).toBe('PERMISSION_DENIED');
    expect(entry.permissionCheckResult?.missing).toEqual(['network']);
  });

  it('should generate audit log for unload operation', () => {
    logger.logUnload('my-plugin', true, { reason: 'User requested' });

    const logs = logger.getLogsByAction('unload');
    expect(logs).toHaveLength(1);
    expect(logs[0].pluginId).toBe('my-plugin');
  });

  it('should track complete context in audit log', () => {
    logger.logLoad('complex-plugin', false, {
      version: '2.0.0',
      reason: 'Static check failed',
      errorCode: 'STATIC_CHECK_FAILED',
      errorDetails: {
        violations: [
          { ruleName: 'CP001', errorMessage: 'Forbidden child_process.exec', line: 10 }
        ]
      },
      requires: ['filesystem.read', 'network', 'child_process'],
      grants: ['filesystem.read'],
      staticCheckPassed: false,
      staticCheckResult: {
        violations: [{ ruleName: 'CP001', errorMessage: 'Forbidden', line: 10 }],
        duration: 25
      },
      permissionCheckResult: { authorized: true },
      duration: 150,
    });

    const entry = logger.getLogs()[0];
    
    // Verify complete context is captured
    expect(entry.pluginId).toBe('complex-plugin');
    expect(entry.version).toBe('2.0.0');
    expect(entry.errorCode).toBe('STATIC_CHECK_FAILED');
    expect(entry.requires).toEqual(['filesystem.read', 'network', 'child_process']);
    expect(entry.grants).toEqual(['filesystem.read']);
    expect(entry.staticCheckPassed).toBe(false);
    expect(entry.staticCheckResult?.violationsCount).toBe(1);
    expect(entry.staticCheckResult?.duration).toBe(25);
    expect(entry.duration).toBe(150);
  });

  it('should support querying audit logs for traceability', () => {
    // Simulate multiple operations
    logger.logLoad('plugin-a', true);
    logger.logLoad('plugin-b', false, { reason: 'Error' });
    logger.logUnload('plugin-a', true);
    logger.logReload('plugin-a', true);

    // Query by plugin
    const pluginALogs = logger.getLogsByPluginId('plugin-a');
    expect(pluginALogs.length).toBeGreaterThanOrEqual(2);

    // Query by action
    const loadLogs = logger.getLogsByAction('load');
    expect(loadLogs.length).toBe(2);

    // Verify all operations are traceable
    const allLogs = logger.getLogs();
    expect(allLogs.every(l => l.eventId)).toBe(true);
    expect(allLogs.every(l => l.ts)).toBe(true);
    expect(allLogs.every(l => l.action)).toBe(true);
    expect(allLogs.every(l => l.pluginId)).toBe(true);
  });
});