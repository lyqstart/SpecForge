/**
 * 任务 7.3.1: 事件可追溯性 PBT (Property PL-4)
 *
 * Feature: plugin-loader, Property PL-4: 事件可追溯性
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证事件可追溯性的核心属性：
 * 1. 所有操作产生事件 - 每个加载/卸载操作都产生审计日志
 * 2. 事件内容完整性 - 事件包含所有必需字段（pluginId, success, reason 等）
 * 3. 成功/失败场景都记录 - 无论成功还是失败都有对应事件
 * 4. 事件顺序正确 - 时间戳递增
 *
 * 对应 Requirements 6.2: THE Plugin_Loader SHALL 记录所有加载尝试（成功/失败）到事件日志
 *                         THE Event_Log SHALL 包含插件 ID、加载结果、失败原因（如适用）
 *
 * 测试迭代次数：≥ 100
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  AuditLogger,
  InMemoryAuditLogStorage,
  type AuditLogEntry,
  type AuditAction,
} from '../../src/audit-log';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 已知权限类型（来自 requirements.md） */
const KNOWN_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

/** 插件操作类型 */
const PLUGIN_ACTIONS: AuditAction[] = ['load', 'reload', 'unload', 'permission_check', 'static_check'];

/** 错误码示例 */
const ERROR_CODES = [
  'MANIFEST_ERROR',
  'STATIC_CHECK_FAILED',
  'AUTH_DENIED',
  'DEPENDENCY_MISSING',
  'ENTRY_NOT_FOUND',
  'LOAD_ERROR',
] as const;

// ---------------------------------------------------------------------------
// Arbitraries（fast-check 生成器）
// ---------------------------------------------------------------------------

/** 生成任意已知权限 */
const arbitraryKnownPermission = fc.oneof(
  ...KNOWN_PERMISSIONS.map((p) => fc.constant(p))
);

/** 生成权限数组 */
const arbitraryPermissionArray = fc.array(arbitraryKnownPermission, { minLength: 0, maxLength: 5 });

/** 生成插件操作 */
const arbitraryAction = fc.oneof(...PLUGIN_ACTIONS.map((a) => fc.constant(a)));

/** 生成唯一插件 ID - 使用时间戳+随机字符串确保唯一性 */
const arbitraryPluginId = fc
  .tuple(fc.integer(), fc.string({ minLength: 4, maxLength: 8 }))
  .map(([ts, rand]) => `plugin-${ts}-${rand}`);

/** 生成唯一插件 ID - 变体2 */
const arbitraryPluginId2 = fc
  .tuple(fc.integer(), fc.string({ minLength: 4, maxLength: 8 }))
  .map(([ts, rand]) => `plugin-${ts + 1}-${rand}`);

/** 生成版本号 */
const arbitraryVersion = fc
  .tuple(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }))
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/** 生成错误码 */
const arbitraryErrorCode = fc.oneof(...ERROR_CODES.map((c) => fc.constant(c)));

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('Property PL-4: 事件可追溯性', () => {
  /**
   * Property 1: 每个加载操作都会产生审计日志
   *
   * 形式化: ∀ pluginId, success: logLoad(pluginId, success, ...) 后，存储中有对应记录
   */
  it('每次加载操作都应该产生审计日志记录', () => {
    // 每个测试使用独立的存储，避免测试间干扰
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryPermissionArray,
        arbitraryPermissionArray,
        fc.boolean(),
        (pluginId, version, requires, grants, success) => {
          // 记录加载操作
          auditLogger.logLoad(pluginId, success, {
            version,
            requires,
            grants,
            staticCheckPassed: success,
          });

          // 验证：存储中应该有对应记录
          const logs = storage.getAll();
          expect(logs.length).toBeGreaterThan(0);

          // 验证：最新记录匹配操作
          const latestLog = logs[logs.length - 1];
          expect(latestLog.action).toBe('load');
          expect(latestLog.pluginId).toBe(pluginId);
          expect(latestLog.success).toBe(success);
          expect(latestLog.requires).toEqual(requires);
          expect(latestLog.grants).toEqual(grants);
        }
      ),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 2: 成功和失败的操作都应该被记录
   *
   * 形式化: ∀ pluginId, success, reason: logLoad 后都有对应记录
   */
  it('成功和失败的加载操作都应该被记录', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryPermissionArray,
        arbitraryPermissionArray,
        fc.boolean(),
        fc.option(fc.string({ minLength: 1, maxLength: 200 })),
        (pluginId, version, requires, grants, success, reason) => {
          // 记录加载操作（成功或失败）
          auditLogger.logLoad(pluginId, success, {
            version,
            requires,
            grants,
            reason: reason ?? undefined,
            staticCheckPassed: success,
          });

          // 验证：存储中应该有记录
          const logs = storage.getAll();
          expect(logs.length).toBeGreaterThan(0);

          // 验证：记录包含正确的成功/失败状态
          const loadLogs = logs.filter((l) => l.action === 'load' && l.pluginId === pluginId);
          expect(loadLogs.length).toBeGreaterThan(0);

          const latestLog = loadLogs[loadLogs.length - 1];
          expect(latestLog.success).toBe(success);
          if (!success && reason) {
            expect(latestLog.reason).toBe(reason);
          }
        }
      ),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 3: 事件内容完整性 - 所有必需字段都存在
   *
   * 形式化: ∀ entry: entry 包含 schema_version, eventId, ts, action, pluginId, success
   */
  it('审计日志应该包含所有必需字段', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    // 只测试 load/reload/unload，因为这些有明确的 action
    const loadActions: AuditAction[] = ['load', 'reload', 'unload'];
    const arbitraryLoadAction = fc.oneof(...loadActions.map((a) => fc.constant(a)));

    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryLoadAction,
        fc.boolean(),
        fc.option(arbitraryVersion),
        fc.option(arbitraryErrorCode),
        fc.option(fc.string({ minLength: 1, maxLength: 200 })),
        (pluginId, action, success, version, errorCode, reason) => {
          // 根据操作类型记录
          let entry: AuditLogEntry;
          if (action === 'load') {
            entry = auditLogger.logLoad(pluginId, success, {
              version: version ?? undefined,
              errorCode: errorCode ?? undefined,
              reason: reason ?? undefined,
            });
          } else if (action === 'reload') {
            entry = auditLogger.logReload(pluginId, success, {
              version: version ?? undefined,
              errorCode: errorCode ?? undefined,
              reason: reason ?? undefined,
            });
          } else {
            entry = auditLogger.logUnload(pluginId, success, {
              reason: reason ?? undefined,
            });
          }

          // 验证必需字段存在
          expect(entry.schema_version).toBe('1.0');
          expect(entry.eventId).toBeDefined();
          expect(entry.eventId.length).toBeGreaterThan(0);
          expect(entry.ts).toBeDefined();
          expect(typeof entry.ts).toBe('number');
          expect(entry.ts).toBeGreaterThan(0);
          expect(entry.action).toBeDefined();
          expect(entry.pluginId).toBeDefined();
          expect(entry.success).toBeDefined();
          expect(typeof entry.success).toBe('boolean');
        }
      ),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 4: 事件按时间顺序记录
   *
   * 形式化: ∀ logs: logs 按 ts 升序排列
   */
  it('多条审计日志应该按时间顺序排列', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), (count) => {
        // 记录多条日志
        const timestamps: number[] = [];
        for (let i = 0; i < count; i++) {
          const entry = auditLogger.logLoad(`plugin-${i}`, true, {
            version: '1.0.0',
            requires: ['filesystem.read'],
            grants: ['filesystem.read'],
          });
          timestamps.push(entry.ts);
        }

        // 验证：时间戳应该递增（或相等，因为可能在同一毫秒生成）
        for (let i = 1; i < timestamps.length; i++) {
          expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
        }
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 5: 失败操作应该记录错误详情
   *
   * 形式化: ∀ pluginId, success=false, errorCode, reason: 日志包含错误码和原因
   */
  it('失败的加载操作应该记录错误详情', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryErrorCode,
        fc.string({ minLength: 1, maxLength: 200 }),
        (pluginId, errorCode, errorMessage) => {
          // 记录失败的加载
          const entry = auditLogger.logLoad(pluginId, false, {
            version: '1.0.0',
            errorCode,
            errorDetails: { message: errorMessage },
            reason: errorMessage,
          });

          // 验证：失败记录包含错误信息
          expect(entry.success).toBe(false);
          expect(entry.errorCode).toBe(errorCode);
          expect(entry.reason).toBe(errorMessage);
          expect(entry.errorDetails).toBeDefined();
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 6: 按插件 ID 查询应该返回正确结果
   *
   * 形式化: ∀ pluginId: getByPluginId(pluginId) 返回的日志都是该插件的
   */
  it('按插件 ID 查询应该返回该插件的所有日志', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryPluginId2,
        fc.integer({ min: 1, max: 5 }),
        (targetPluginId, otherPluginId, count) => {
          // 确保两个插件 ID 不同
          if (targetPluginId === otherPluginId) {
            return;
          }

          // 记录目标插件的日志
          for (let i = 0; i < count; i++) {
            auditLogger.logLoad(targetPluginId, true);
          }

          // 记录其他插件的日志
          auditLogger.logLoad(otherPluginId, true);

          // 查询目标插件
          const targetLogs = storage.getByPluginId(targetPluginId);

          // 验证：所有返回的日志都是目标插件的
          expect(targetLogs.length).toBe(count);
          for (const log of targetLogs) {
            expect(log.pluginId).toBe(targetPluginId);
          }
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 7: 按操作类型查询应该返回正确结果
   *
   * 形式化: ∀ action: getByAction(action) 返回的日志都是该操作类型的
   */
  it('按操作类型查询应该返回该操作类型的所有日志', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    // 只使用 load/reload/unload 这些有明确 action 的操作
    const actions: AuditAction[] = ['load', 'reload', 'unload'];
    const arbitraryTestAction = fc.oneof(...actions.map((a) => fc.constant(a)));

    fc.assert(
      fc.property(
        fc.array(arbitraryTestAction, { minLength: 5, maxLength: 10 }),
        (actions) => {
          // 记录各种操作
          for (const action of actions) {
            if (action === 'load') {
              auditLogger.logLoad('plugin-1', true);
            } else if (action === 'reload') {
              auditLogger.logReload('plugin-1', true);
            } else {
              auditLogger.logUnload('plugin-1', true);
            }
          }

          // 验证每种操作类型
          const uniqueActions = [...new Set(actions)];
          for (const action of uniqueActions) {
            const logs = storage.getByAction(action);
            expect(logs.length).toBeGreaterThan(0);
            for (const log of logs) {
              expect(log.action).toBe(action);
            }
          }
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 8: verifyTraceability 方法正确工作
   *
   * 形式化: verifyTraceability 返回正确的负载计数
   */
  it('verifyTraceability 应该正确返回负载记录统计', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 5 }),
        (loadCount, unloadCount) => {
          // 每个属性回调创建新的存储，确保隔离
          const testStorage = new InMemoryAuditLogStorage();
          const testLogger = new AuditLogger({ storage: testStorage, verbose: true });

          // 记录加载日志
          for (let i = 0; i < loadCount; i++) {
            testLogger.logLoad(`v8-pl-${i}`, true);
          }

          // 记录卸载日志
          for (let i = 0; i < unloadCount; i++) {
            testLogger.logUnload(`v8-pu-${i}`, true);
          }

          // 验证可追溯性
          const result = testLogger.verifyTraceability();

          expect(result.hasLoadRecords).toBe(loadCount > 0);
          expect(result.hasUnloadRecords).toBe(unloadCount > 0);
          expect(result.loadCount).toBe(loadCount);
          expect(result.unloadCount).toBe(unloadCount);
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 9: 权限检查结果应该被记录
   *
   * 形式化: logPermissionCheck 后应该有对应审计记录
   */
  it('权限检查结果应该被记录到审计日志', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryPermissionArray,
        arbitraryPermissionArray,
        (pluginId, requires, grants) => {
          const grantsSet = new Set(grants);
          const unauthorized = requires.filter((r) => !grantsSet.has(r));

          // 模拟权限检查结果
          const result = {
            authorized: unauthorized.length === 0,
            missing: unauthorized.length > 0 ? unauthorized : undefined,
            source: 'default' as const,
          };

          // 记录权限检查
          const entry = auditLogger.logPermissionCheck(pluginId, result, {
            requires,
            grants,
          });

          // 验证：记录包含权限信息
          expect(entry.action).toBe('permission_check');
          expect(entry.pluginId).toBe(pluginId);
          expect(entry.success).toBe(result.authorized);
          expect(entry.requires).toEqual(requires);
          expect(entry.grants).toEqual(grants);

          if (unauthorized.length > 0) {
            expect(entry.permissionCheckResult?.missing).toEqual(unauthorized);
          }
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 10: 完整的加载流程日志应该包含所有阶段信息
   *
   * 形式化: 完整加载流程的日志应该包含 manifest、static check、permission check 结果
   */
  it('完整加载流程的审计日志应该包含所有阶段信息', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryPermissionArray,
        arbitraryPermissionArray,
        fc.boolean(),
        fc.boolean(),
        (pluginId, version, requires, grants, staticCheckPassed, permissionGranted) => {
          // 步骤 1: 静态检查（通过 logLoad 记录）
          const staticCheckEntry = auditLogger.logLoad(pluginId, staticCheckPassed, {
            version,
            requires,
            grants,
            staticCheckPassed,
            staticCheckResult: {
              passed: staticCheckPassed,
              violations: staticCheckPassed ? [] : [{ code: 'TEST', message: 'test' }],
            },
          });

          expect(staticCheckEntry.action).toBe('load');
          expect(staticCheckEntry.staticCheckPassed).toBe(staticCheckPassed);

          // 步骤 2: 权限检查
          const permissionEntry = auditLogger.logPermissionCheck(pluginId, {
            authorized: permissionGranted,
            missing: permissionGranted ? undefined : requires,
            source: 'default',
          }, {
            requires,
            grants,
          });

          expect(permissionEntry.action).toBe('permission_check');
          expect(permissionEntry.permissionCheckResult?.authorized).toBe(permissionGranted);

          // 步骤 3: 最终加载结果
          const finalSuccess = staticCheckPassed && permissionGranted;
          const loadEntry = auditLogger.logLoad(pluginId, finalSuccess, {
            version,
            requires,
            grants,
            staticCheckPassed,
          });

          expect(loadEntry.action).toBe('load');
          expect(loadEntry.success).toBe(finalSuccess);
          expect(loadEntry.requires).toEqual(requires);
          expect(loadEntry.grants).toEqual(grants);
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 11: 时间范围查询应该返回正确结果
   *
   * 形式化: getByTimeRange(start, end) 返回 ts 在范围内的日志
   */
  it('时间范围查询应该返回正确的结果', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(fc.integer({ min: 3, max: 10 }), (count) => {
        const timestamps: number[] = [];

        // 记录多条日志并收集时间戳
        for (let i = 0; i < count; i++) {
          const entry = auditLogger.logLoad(`plugin-${i}`, true);
          timestamps.push(entry.ts);
        }

        // 查询完整时间范围
        const start = timestamps[0];
        const end = timestamps[timestamps.length - 1];
        const rangeLogs = storage.getByTimeRange(start, end);

        // 验证：所有返回的日志时间戳都在范围内
        for (const log of rangeLogs) {
          expect(log.ts).toBeGreaterThanOrEqual(start);
          expect(log.ts).toBeLessThanOrEqual(end);
        }

        // 查询部分时间范围
        const midIndex = Math.floor(count / 2);
        const midStart = timestamps[0];
        const midEnd = timestamps[midIndex];
        const midRangeLogs = storage.getByTimeRange(midStart, midEnd);

        // 验证：部分范围查询也正确
        for (const log of midRangeLogs) {
          expect(log.ts).toBeGreaterThanOrEqual(midStart);
          expect(log.ts).toBeLessThanOrEqual(midEnd);
        }
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 12: 日志数量正确
   *
   * 形式化: 记录 N 次后，size() 应该返回 N
   */
  it('记录的日志数量应该正确', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (count) => {
        // 每个属性回调创建新的存储，确保隔离
        const testStorage = new InMemoryAuditLogStorage();
        const testLogger = new AuditLogger({ storage: testStorage, verbose: true });

        // 记录指定数量的日志
        for (let i = 0; i < count; i++) {
          testLogger.logLoad(`pl12-${i}`, true);
        }

        // 验证数量
        expect(testStorage.size()).toBe(count);

        // 验证 getAll() 返回正确数量
        expect(testStorage.getAll().length).toBe(count);
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 13: clearLogs 应该清空所有日志
   *
   * 形式化: clearLogs() 后，size() = 0
   */
  it('clearLogs 应该清空所有日志', () => {
    const storage = new InMemoryAuditLogStorage();
    const auditLogger = new AuditLogger({ storage, verbose: true });

    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (count) => {
        // 记录一些日志
        for (let i = 0; i < count; i++) {
          auditLogger.logLoad(`plugin-${i}`, true);
        }

        expect(storage.size()).toBe(count);

        // 清空日志
        auditLogger.clearLogs();

        // 验证：日志已清空
        expect(storage.size()).toBe(0);
        expect(storage.getAll()).toEqual([]);
      }),
      { numRuns: 100, seed: 42 }
    );
  });
});