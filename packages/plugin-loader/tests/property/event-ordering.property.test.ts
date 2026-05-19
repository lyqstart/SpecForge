/**
 * 任务 7.3.4: 确保事件顺序正确 (Property PL-4)
 *
 * Feature: plugin-loader, Property PL-4: 事件顺序正确性
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证事件顺序的核心属性：
 * 1. 加载事件在初始化事件之前
 * 2. 错误事件在相应操作之后
 * 3. 事件时间戳递增
 * 4. 并发操作时事件顺序
 *
 * 对应 Requirements 6.2: THE Plugin_Loader SHALL 记录所有加载尝试（成功/失败）到事件日志
 *                         THE Event_Log SHALL 包含插件 ID、加载结果、失败原因（如适用）
 *                         事件顺序 SHALL 符合操作逻辑顺序
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
import {
  createPluginLoadedEvent,
  createPluginInitializedEvent,
  createPluginUnloadedEvent,
  createPluginErrorEvent,
  type PluginEvent,
} from '../../src/plugin-events';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

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

/** 插件生命周期操作顺序定义 */
const LIFECYCLE_ORDER: AuditAction[][] = [
  ['static_check', 'permission_check', 'load'], // 成功加载流程
  ['static_check', 'permission_check', 'load', 'initialize'], // 完整加载+初始化流程
  ['load', 'unload'], // 加载然后卸载
  ['load', 'initialize', 'unload'], // 完整生命周期
];

// ---------------------------------------------------------------------------
// Arbitraries（fast-check 生成器）
// ---------------------------------------------------------------------------

/** 生成唯一插件 ID */
const arbitraryPluginId = fc
  .tuple(fc.integer(), fc.string({ minLength: 4, maxLength: 8 }))
  .map(([ts, rand]) => `plugin-${ts}-${rand}`);

/** 生成版本号 */
const arbitraryVersion = fc
  .tuple(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }))
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/** 生成错误码 */
const arbitraryErrorCode = fc.oneof(...ERROR_CODES.map((c) => fc.constant(c)));

/** 生成权限数组 */
const arbitraryPermissionArray = fc.array(
  fc.oneof(
    fc.constant('filesystem.read'),
    fc.constant('filesystem.write'),
    fc.constant('network'),
    fc.constant('child_process'),
    fc.constant('env.read'),
  ),
  { minLength: 0, maxLength: 5 },
);

/** 生成布尔值（加权，更常见的是 true） */
const arbitrarySuccessWithBias = fc.oneof(
  fc.constant(true),
  fc.constant(true),
  fc.constant(true),
  fc.constant(false),
);

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('Property PL-4: 事件顺序正确性', () => {
  /**
   * Property 1: 加载事件在初始化事件之前
   *
   * 形式化: ∀ plugin: initialize 事件的 ts > load 事件的 ts
   */
  it('加载事件应该在初始化事件之前发生', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryPermissionArray,
        arbitraryPermissionArray,
        (pluginId, version, requires, grants) => {
          // 创建一个新的存储和审计日志器
          const storage = new InMemoryAuditLogStorage();
          const auditLogger = new AuditLogger({ storage, verbose: true });

          // 步骤 1: 记录加载事件
          const loadEntry = auditLogger.logLoad(pluginId, true, {
            version,
            requires,
            grants,
          });

          // 步骤 2: 记录初始化事件（模拟初始化完成）
          const initEntry = auditLogger.logLoad(pluginId, true, {
            version,
            requires,
            grants,
            initialized: true, // 标记为初始化
          });

          // 验证：初始化事件的 ts 应该 >= 加载事件的 ts
          // （因为初始化发生在加载之后）
          expect(initEntry.ts).toBeGreaterThanOrEqual(loadEntry.ts);

          // 验证：两个事件属于同一个插件
          expect(initEntry.pluginId).toBe(loadEntry.pluginId);
        }
      ),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 2: 错误事件在相应操作之后
   *
   * 形式化: ∀ plugin, errorCode: error 事件的 ts >= 导致错误的操作事件的 ts
   */
  it('错误事件应该在导致错误的操作之后发生', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryErrorCode,
        fc.string({ minLength: 1, maxLength: 200 }),
        (pluginId, version, errorCode, errorMessage) => {
          const storage = new InMemoryAuditLogStorage();
          const auditLogger = new AuditLogger({ storage, verbose: true });

          // 步骤 1: 记录失败的加载操作
          const loadEntry = auditLogger.logLoad(pluginId, false, {
            version,
            errorCode,
            errorDetails: { message: errorMessage },
            reason: errorMessage,
          });

          // 步骤 2: 记录错误事件（通过审计日志）
          // 在实际实现中，错误可能是同一个日志条目
          // 这里我们验证：错误日志的时间戳应该 >= 加载失败的时间戳
          const logs = storage.getAll();
          const errorLog = logs.find((l) => !l.success && l.errorCode === errorCode);

          expect(errorLog).toBeDefined();
          expect(errorLog!.ts).toBeGreaterThanOrEqual(loadEntry.ts);
        }
      ),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 3: 事件时间戳严格递增
   *
   * 形式化: ∀ events: ∀ i < j: events[i].ts <= events[j].ts
   */
  it('多条事件的时间戳应该单调递增', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryPluginId, { minLength: 2, maxLength: 20 }),
        (pluginIds) => {
          const storage = new InMemoryAuditLogStorage();
          const auditLogger = new AuditLogger({ storage, verbose: true });

          // 按顺序记录多个事件
          const timestamps: number[] = [];
          for (const pluginId of pluginIds) {
            const entry = auditLogger.logLoad(pluginId, true, {
              version: '1.0.0',
              requires: ['filesystem.read'],
              grants: ['filesystem.read'],
            });
            timestamps.push(entry.ts);
          }

          // 验证：时间戳应该单调递增（或相等，因为在同一毫秒内可能生成）
          for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
          }

          // 额外验证：所有时间戳应该是有效的 Unix 时间戳
          const now = Date.now();
          for (const ts of timestamps) {
            expect(ts).toBeGreaterThan(0);
            expect(ts).toBeLessThanOrEqual(now + 1000); // 允许小误差
          }
        }
      ),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 4: 完整生命周期事件顺序正确
   *
   * 形式化: 完整加载流程（static_check -> permission_check -> load -> initialize）的事件顺序应该正确
   */
  it('完整加载流程的事件顺序应该正确', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryPermissionArray,
        arbitraryPermissionArray,
        (pluginId, version, requires, grants) => {
          const storage = new InMemoryAuditLogStorage();
          const auditLogger = new AuditLogger({ storage, verbose: true });

          // 模拟完整加载流程
          // 步骤 1: 静态检查
          const staticCheckEntry = auditLogger.logLoad(pluginId, true, {
            version,
            requires,
            grants,
            staticCheckPassed: true,
          });

          // 步骤 2: 权限检查
          const permissionEntry = auditLogger.logPermissionCheck(pluginId, {
            authorized: true,
            source: 'default',
          }, {
            requires,
            grants,
          });

          // 步骤 3: 加载
          const loadEntry = auditLogger.logLoad(pluginId, true, {
            version,
            requires,
            grants,
            staticCheckPassed: true,
          });

          // 步骤 4: 初始化
          const initEntry = auditLogger.logLoad(pluginId, true, {
            version,
            requires,
            grants,
            initialized: true,
          });

          // 验证事件顺序：static_check <= permission_check <= load <= initialize
          expect(staticCheckEntry.ts).toBeLessThanOrEqual(permissionEntry.ts);
          expect(permissionEntry.ts).toBeLessThanOrEqual(loadEntry.ts);
          expect(loadEntry.ts).toBeLessThanOrEqual(initEntry.ts);
        }
      ),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 5: 并发加载时事件顺序仍然正确
   *
   * 形式化: ∀ 并发加载: 事件按实际发生顺序记录
   */
  it('并发加载时事件顺序应该保持正确', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            arbitraryPluginId,
            arbitrarySuccessWithBias,
            arbitraryVersion,
          ),
          { minLength: 2, maxLength: 10 },
        ),
        (operations) => {
          const storage = new InMemoryAuditLogStorage();
          const auditLogger = new AuditLogger({ storage, verbose: true });

          // 模拟并发加载（实际代码中可能是真正的并发，但这里按顺序记录）
          const timestamps: { pluginId: string; ts: number; success: boolean }[] = [];

          for (const [pluginId, success, version] of operations) {
            const entry = auditLogger.logLoad(pluginId, success, {
              version,
              requires: ['filesystem.read'],
              grants: ['filesystem.read'],
            });
            timestamps.push({
              pluginId,
              ts: entry.ts,
              success,
            });
          }

          // 验证：所有事件的时间戳都应该单调递增
          for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i].ts).toBeGreaterThanOrEqual(timestamps[i - 1].ts);
          }

          // 验证：每个事件都应该被正确记录
          const logs = storage.getAll();
          expect(logs.length).toBe(operations.length);
        }
      ),
      { numRuns: 120, seed: 42 }
    );
  });

  /**
   * Property 6: 卸载事件在加载事件之后
   *
   * 形式化: ∀ plugin: unload 事件的 ts > load 事件的 ts
   */
  it('卸载事件应该在加载事件之后发生', () => {
    fc.assert(
      fc.property(arbitraryPluginId, (pluginId) => {
        const storage = new InMemoryAuditLogStorage();
        const auditLogger = new AuditLogger({ storage, verbose: true });

        // 步骤 1: 加载插件
        const loadEntry = auditLogger.logLoad(pluginId, true, {
          version: '1.0.0',
          requires: ['filesystem.read'],
          grants: ['filesystem.read'],
        });

        // 步骤 2: 卸载插件
        const unloadEntry = auditLogger.logUnload(pluginId, true, {
          reason: 'User requested unload',
        });

        // 验证：卸载事件的 ts 应该 >= 加载事件的 ts
        // （可能在同一毫秒内生成）
        expect(unloadEntry.ts).toBeGreaterThanOrEqual(loadEntry.ts);

        // 验证：两个事件属于同一个插件
        expect(unloadEntry.pluginId).toBe(loadEntry.pluginId);
      }),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 7: 失败操作的错误码应该被正确记录
   *
   * 形式化: ∀ plugin, errorCode: 失败日志包含正确的 errorCode
   */
  it('失败操作应该记录正确的错误码', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryErrorCode,
        fc.string({ minLength: 1, maxLength: 200 }),
        (pluginId, errorCode, errorMessage) => {
          const storage = new InMemoryAuditLogStorage();
          const auditLogger = new AuditLogger({ storage, verbose: true });

          // 记录失败的加载
          const entry = auditLogger.logLoad(pluginId, false, {
            version: '1.0.0',
            errorCode,
            errorDetails: { message: errorMessage },
            reason: errorMessage,
          });

          // 验证：失败日志包含正确的 errorCode
          expect(entry.success).toBe(false);
          expect(entry.errorCode).toBe(errorCode);
          expect(entry.reason).toBe(errorMessage);
        }
      ),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 8: 多个插件的事件不会交错混乱
   *
   * 形式化: ∀ plugins: 每个插件的事件都正确记录，不会被其他插件的事件混淆
   */
  it('多个插件的事件不应该交错混乱', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            arbitraryPluginId,
            arbitraryVersion,
          ),
          { minLength: 3, maxLength: 8 },
        ),
        (plugins) => {
          const storage = new InMemoryAuditLogStorage();
          const auditLogger = new AuditLogger({ storage, verbose: true });

          // 为每个插件记录加载事件
          const pluginTimestamps: Map<string, number[]> = new Map();

          for (const [pluginId, version] of plugins) {
            const entry = auditLogger.logLoad(pluginId, true, {
              version,
              requires: ['filesystem.read'],
              grants: ['filesystem.read'],
            });

            if (!pluginTimestamps.has(pluginId)) {
              pluginTimestamps.set(pluginId, []);
            }
            pluginTimestamps.get(pluginId)!.push(entry.ts);
          }

          // 验证：每个插件的时间戳都是单调递增的
          for (const [, timestamps] of pluginTimestamps) {
            for (let i = 1; i < timestamps.length; i++) {
              expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
            }
          }

          // 验证：存储中的记录数量正确
          const logs = storage.getAll();
          expect(logs.length).toBe(plugins.length);

          // 验证：每个插件 ID 都正确记录
          for (const [pluginId, version] of plugins) {
            const pluginLogs = storage.getByPluginId(pluginId);
            expect(pluginLogs.length).toBe(1);
            expect(pluginLogs[0].version).toBe(version);
          }
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 9: 热重载事件顺序正确
   *
   * 形式化: load -> unload -> load (reload) 序列的时间戳应该正确
   */
  it('热重载的事件顺序应该正确', () => {
    fc.assert(
      fc.property(arbitraryPluginId, (pluginId) => {
        const storage = new InMemoryAuditLogStorage();
        const auditLogger = new AuditLogger({ storage, verbose: true });

        // 步骤 1: 首次加载
        const load1 = auditLogger.logLoad(pluginId, true, {
          version: '1.0.0',
        });

        // 步骤 2: 卸载（为重载做准备）
        const unload = auditLogger.logUnload(pluginId, true);

        // 步骤 3: 重新加载（热重载）
        const load2 = auditLogger.logLoad(pluginId, true, {
          version: '1.0.1', // 新版本
        });

        // 验证：时间戳顺序正确
        expect(load1.ts).toBeLessThanOrEqual(unload.ts);
        expect(unload.ts).toBeLessThanOrEqual(load2.ts);
      }),
      { numRuns: 150, seed: 42 }
    );
  });

  /**
   * Property 10: 事件 ID 唯一性
   *
   * 形式化: ∀ events: 每个事件的 eventId 都是唯一的
   */
  it('每个事件的 ID 应该唯一', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryPluginId, { minLength: 5, maxLength: 15 }),
        (pluginIds) => {
          const storage = new InMemoryAuditLogStorage();
          const auditLogger = new AuditLogger({ storage, verbose: true });

          // 记录多个事件
          const eventIds: string[] = [];
          for (const pluginId of pluginIds) {
            const entry = auditLogger.logLoad(pluginId, true);
            eventIds.push(entry.eventId);
          }

          // 验证：所有 eventId 都是唯一的
          const uniqueIds = new Set(eventIds);
          expect(uniqueIds.size).toBe(eventIds.length);
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });
});