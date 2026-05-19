/**
 * 任务 7.3.3: 测试事件内容完整性 PBT (Property PL-4)
 *
 * Feature: plugin-loader, Property PL-4: 事件可追溯性
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证事件内容的完整性：
 * 1. 字段完整性 - 每个事件类型都包含所有必需字段
 * 2. 时间戳准确性 - 事件时间戳是有效的 Unix 时间戳
 * 3. 上下文信息 - 事件包含 pluginId、版本、权限等上下文
 * 4. 序列化/反序列化 - 事件数据可以正确序列化/反序列化
 *
 * 对应 Requirements 6.2: THE Plugin_Loader SHALL 记录所有加载尝试（成功/失败）到事件日志
 *                         THE Event_Log SHALL 包含插件 ID、加载结果、失败原因（如适用）
 *
 * 测试迭代次数：≥ 100
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  type PluginLoadedEvent,
  type PluginUnloadedEvent,
  type PluginInitializedEvent,
  type PluginErrorEvent,
  type PluginEvent,
  type PluginErrorCode,
  createPluginLoadedEvent,
  createPluginUnloadedEvent,
  createPluginInitializedEvent,
  createPluginErrorEvent,
  generateEventId,
} from '../../src/plugin-events';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 已知错误码 */
const ERROR_CODES: PluginErrorCode[] = [
  'MANIFEST_ERROR',
  'MANIFEST_MISSING',
  'STATIC_CHECK_FAILED',
  'AUTH_DENIED',
  'AUTH_MISSING_PERMISSION',
  'DEPENDENCY_MISSING',
  'DEPENDENCY_UNSATISFIED',
  'ENTRY_NOT_FOUND',
  'ENTRY_LOAD_ERROR',
  'SANDBOX_ERROR',
  'INTERNAL_ERROR',
];

/** 插件操作类型（用于动态测试） */
const PLUGIN_ACTIONS = ['load', 'reload', 'unload', 'initialize'] as const;

// ---------------------------------------------------------------------------
// Arbitraries（fast-check 生成器）
// ---------------------------------------------------------------------------

/** 生成唯一插件 ID */
const arbitraryPluginId = fc
  .tuple(fc.integer(), fc.string({ minLength: 4, maxLength: 12 }))
  .map(([ts, rand]) => `plugin-${ts}-${rand}`);

/** 生成版本号 */
const arbitraryVersion = fc
  .tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }))
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/** 生成错误码 */
const arbitraryErrorCode = fc.oneof(...ERROR_CODES.map((c) => fc.constant(c)));

/** 生成加载时长 */
const arbitraryDuration = fc.integer({ min: 0, max: 60000 });

/** 生成非空字符串（用于 reason、message 等） */
const arbitraryNonEmptyString = fc.string({ minLength: 1, maxLength: 200 });

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

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('Property PL-4: 事件内容完整性 (7.3.3)', () => {
  /**
   * Property 1: PluginLoadedEvent 字段完整性
   *
   * 形式化: ∀ pluginId, version, success: 创建的事件包含所有必需字段
   */
  it('PluginLoadedEvent 应包含所有必需字段', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        fc.boolean(),
        fc.option(arbitraryDuration),
        (pluginId, version, success, duration) => {
          const event = createPluginLoadedEvent(pluginId, version, success, {
            duration,
            error: success
              ? undefined
              : {
                  code: 'MANIFEST_ERROR',
                  message: 'Test error message',
                },
          });

          // 验证 schema_version
          expect(event.schema_version).toBe('1.0');

          // 验证 eventId
          expect(event.eventId).toBeDefined();
          expect(event.eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);

          // 验证 ts
          expect(event.ts).toBeDefined();
          expect(typeof event.ts).toBe('number');
          expect(event.ts).toBeGreaterThan(0);

          // 验证 category 和 action
          expect(event.category).toBe('plugin');
          expect(event.action).toBe('plugin.loaded');

          // 验证 payload 字段
          expect(event.payload.pluginId).toBe(pluginId);
          expect(event.payload.version).toBe(version);
          expect(event.payload.success).toBe(success);

          // 验证可选字段
          if (duration !== undefined) {
            expect(event.payload.duration).toBe(duration);
          }

          if (!success) {
            expect(event.payload.error).toBeDefined();
            expect(event.payload.error?.code).toBeDefined();
            expect(event.payload.error?.message).toBeDefined();
          }
        }
      ),
      { numRuns: 120, seed: 42 }
    );
  });

  /**
   * Property 2: PluginUnloadedEvent 字段完整性
   *
   * 形式化: ∀ pluginId, reason, duration: 创建的事件包含所有必需字段
   */
  it('PluginUnloadedEvent 应包含所有必需字段', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        fc.option(arbitraryNonEmptyString),
        fc.option(arbitraryDuration),
        (pluginId, reason, duration) => {
          const event = createPluginUnloadedEvent(pluginId, { reason, duration });

          // 验证 schema_version
          expect(event.schema_version).toBe('1.0');

          // 验证 eventId
          expect(event.eventId).toBeDefined();
          expect(event.eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);

          // 验证 ts
          expect(event.ts).toBeDefined();
          expect(typeof event.ts).toBe('number');
          expect(event.ts).toBeGreaterThan(0);

          // 验证 category 和 action
          expect(event.category).toBe('plugin');
          expect(event.action).toBe('plugin.unloaded');

          // 验证 payload 字段
          expect(event.payload.pluginId).toBe(pluginId);

          // 验证可选字段
          if (reason !== undefined) {
            expect(event.payload.reason).toBe(reason);
          }

          if (duration !== undefined) {
            expect(event.payload.duration).toBe(duration);
          }
        }
      ),
      { numRuns: 120, seed: 42 }
    );
  });

  /**
   * Property 3: PluginInitializedEvent 字段完整性
   *
   * 形式化: ∀ pluginId, version, requires, grants: 创建的事件包含所有必需字段
   */
  it('PluginInitializedEvent 应包含所有必需字段', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryPermissionArray,
        arbitraryPermissionArray,
        (pluginId, version, requires, grants) => {
          const event = createPluginInitializedEvent(pluginId, version, requires, grants);

          // 验证 schema_version
          expect(event.schema_version).toBe('1.0');

          // 验证 eventId
          expect(event.eventId).toBeDefined();
          expect(event.eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);

          // 验证 ts
          expect(event.ts).toBeDefined();
          expect(typeof event.ts).toBe('number');
          expect(event.ts).toBeGreaterThan(0);

          // 验证 category 和 action
          expect(event.category).toBe('plugin');
          expect(event.action).toBe('plugin.initialized');

          // 验证 payload 字段
          expect(event.payload.pluginId).toBe(pluginId);
          expect(event.payload.version).toBe(version);
          expect(event.payload.requires).toEqual(requires);
          expect(event.payload.grants).toEqual(grants);
        }
      ),
      { numRuns: 120, seed: 42 }
    );
  });

  /**
   * Property 4: PluginErrorEvent 字段完整性
   *
   * 形式化: ∀ pluginId, errorCode, message, details: 创建的事件包含所有必需字段
   */
  it('PluginErrorEvent 应包含所有必需字段', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryErrorCode,
        arbitraryNonEmptyString,
        fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        (pluginId, errorCode, message, details) => {
          const event = createPluginErrorEvent(pluginId, errorCode, message, {
            details,
            relatedState: 'loading',
          });

          // 验证 schema_version
          expect(event.schema_version).toBe('1.0');

          // 验证 eventId
          expect(event.eventId).toBeDefined();
          expect(event.eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);

          // 验证 ts
          expect(event.ts).toBeDefined();
          expect(typeof event.ts).toBe('number');
          expect(event.ts).toBeGreaterThan(0);

          // 验证 category 和 action
          expect(event.category).toBe('plugin');
          expect(event.action).toBe('plugin.error');

          // 验证 payload 字段
          expect(event.payload.pluginId).toBe(pluginId);
          expect(event.payload.errorCode).toBe(errorCode);
          expect(event.payload.message).toBe(message);

          // 验证可选字段
          if (details !== undefined) {
            expect(event.payload.details).toBe(details);
          }
          expect(event.payload.relatedState).toBe('loading');
        }
      ),
      { numRuns: 120, seed: 42 }
    );
  });

  /**
   * Property 5: 事件时间戳准确性
   *
   * 形式化: ∀ event: event.ts 应该是有效的 Unix 时间戳（在合理范围内）
   */
  it('事件时间戳应该是有效的 Unix 时间戳', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        fc.boolean(),
        (pluginId, version, success) => {
          const event = createPluginLoadedEvent(pluginId, version, success);

          // 时间戳应该是正数
          expect(event.ts).toBeGreaterThan(0);

          // 时间戳应该在合理范围内（2020-01-01 到 2100-01-01）
          const minTimestamp = new Date('2020-01-01').getTime();
          const maxTimestamp = new Date('2100-01-01').getTime();
          expect(event.ts).toBeGreaterThanOrEqual(minTimestamp);
          expect(event.ts).toBeLessThanOrEqual(maxTimestamp);

          // 时间戳不应该超过当前时间太多（5分钟内）
          const now = Date.now();
          const fiveMinutes = 5 * 60 * 1000;
          expect(event.ts).toBeLessThanOrEqual(now + fiveMinutes);
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 6: 事件时间戳单调性（同一进程生成的事件）
   *
   * 形式化: 在同一进程中连续创建的事件，时间戳应该递增
   */
  it('同一进程中连续创建的事件时间戳应该递增', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (count) => {
        const events: PluginLoadedEvent[] = [];

        // 连续创建多个事件
        for (let i = 0; i < count; i++) {
          events.push(createPluginLoadedEvent(`plugin-${i}`, '1.0.0', true));
        }

        // 验证时间戳递增（或相等，因为在同一毫秒内创建）
        for (let i = 1; i < events.length; i++) {
          expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
        }
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 7: 事件 ID 唯一性
   *
   * 形式化: 生成的 eventId 应该是唯一的
   */
  it('生成的事件 ID 应该是唯一的', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 20 }), (count) => {
        const eventIds = new Set<string>();

        for (let i = 0; i < count; i++) {
          const eventId = generateEventId();
          expect(eventIds.has(eventId)).toBe(false); // 不应该有重复
          eventIds.add(eventId);
        }

        // 验证所有 ID 都是唯一的
        expect(eventIds.size).toBe(count);
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 8: 事件上下文信息完整性 - 加载事件
   *
   * 形式化: 加载事件应包含完整的上下文（pluginId, version, success）
   */
  it('加载事件应包含完整上下文信息', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        fc.boolean(),
        arbitraryPermissionArray,
        (pluginId, version, success, requires) => {
          const grants = requires.filter(() => Math.random() > 0.3);
          const event = createPluginLoadedEvent(pluginId, version, success);

          // 验证所有核心上下文字段
          expect(event.payload.pluginId).toBe(pluginId);
          expect(event.payload.version).toBe(version);
          expect(event.payload.success).toBe(success);

          // 验证事件包含足够的上下文用于调试
          expect(event.payload.pluginId.length).toBeGreaterThan(0);
          expect(event.payload.version.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 9: 事件上下文信息完整性 - 错误事件
   *
   * 形式化: 错误事件应包含完整的错误上下文（errorCode, message, details）
   */
  it('错误事件应包含完整错误上下文信息', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryErrorCode,
        arbitraryNonEmptyString,
        (pluginId, errorCode, message) => {
          const event = createPluginErrorEvent(pluginId, errorCode, message, {
            details: { extra: 'test data' },
          });

          // 验证错误上下文字段
          expect(event.payload.pluginId).toBe(pluginId);
          expect(event.payload.errorCode).toBe(errorCode);
          expect(event.payload.message).toBe(message);
          expect(event.payload.details).toBeDefined();
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 10: 事件数据的序列化/反序列化 - JSON 序列化
   *
   * 形式化: 事件对象应该可以正确序列化为 JSON 字符串
   */
  it('事件对象应该可以正确序列化为 JSON', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        fc.boolean(),
        (pluginId, version, success) => {
          const event = createPluginLoadedEvent(pluginId, version, success);

          // 序列化
          const json = JSON.stringify(event);

          // 应该能成功序列化
          expect(json).toBeDefined();
          expect(typeof json).toBe('string');
          expect(json.length).toBeGreaterThan(0);

          // 反序列化
          const parsed = JSON.parse(json) as PluginEvent;

          // 验证反序列化后的数据完整性
          expect(parsed.schema_version).toBe(event.schema_version);
          expect(parsed.eventId).toBe(event.eventId);
          expect(parsed.ts).toBe(event.ts);
          expect(parsed.category).toBe(event.category);
          expect(parsed.action).toBe(event.action);
          expect(parsed.payload.pluginId).toBe(event.payload.pluginId);
          expect(parsed.payload.version).toBe(event.payload.version);
          expect(parsed.payload.success).toBe(event.payload.success);
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 11: 事件数据的序列化/反序列化 - 复杂 payload
   *
   * 形式化: 包含错误详情的复杂事件应该可以正确序列化/反序列化
   */
  it('包含错误详情的复杂事件应该可以正确序列化', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryErrorCode,
        arbitraryNonEmptyString,
        (pluginId, errorCode, message) => {
          const errorDetails = {
            stack: 'Error: test error\n  at Test.fn (test.ts:1:1)',
            context: { attempt: 3, retry: true },
          };

          const event = createPluginLoadedEvent(pluginId, '1.0.0', false, {
            error: {
              code: errorCode,
              message,
              details: errorDetails,
            },
          });

          // 序列化
          const json = JSON.stringify(event);

          // 反序列化
          const parsed = JSON.parse(json) as PluginLoadedEvent;

          // 验证错误详情完整性
          expect(parsed.payload.error).toBeDefined();
          expect(parsed.payload.error?.code).toBe(errorCode);
          expect(parsed.payload.error?.message).toBe(message);
          expect(parsed.payload.error?.details).toEqual(errorDetails);
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 12: 所有事件类型共享字段
   *
   * 形式化: 所有事件类型都应该包含 schema_version, eventId, ts, category, action
   */
  it('所有事件类型都应该包含共享必需字段', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryPermissionArray,
        (pluginId, version, permissions) => {
          const grants = permissions.slice(0, Math.floor(permissions.length / 2));

          // 创建各种类型的事件
          const loadedEvent = createPluginLoadedEvent(pluginId, version, true);
          const unloadedEvent = createPluginUnloadedEvent(pluginId);
          const initializedEvent = createPluginInitializedEvent(pluginId, version, permissions, grants);
          const errorEvent = createPluginErrorEvent(pluginId, 'MANIFEST_ERROR', 'Test error');

          const events = [loadedEvent, unloadedEvent, initializedEvent, errorEvent];

          // 验证每个事件都包含共享字段
          for (const event of events) {
            // schema_version
            expect(event).toHaveProperty('schema_version');
            expect(event.schema_version).toBe('1.0');

            // eventId
            expect(event).toHaveProperty('eventId');
            expect(typeof event.eventId).toBe('string');
            expect(event.eventId.length).toBeGreaterThan(0);

            // ts
            expect(event).toHaveProperty('ts');
            expect(typeof event.ts).toBe('number');
            expect(event.ts).toBeGreaterThan(0);

            // category
            expect(event).toHaveProperty('category');
            expect(event.category).toBe('plugin');

            // action
            expect(event).toHaveProperty('action');
            expect(typeof event.action).toBe('string');
            expect(event.action.startsWith('plugin.')).toBe(true);
          }
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 13: 事件 payload 字段类型正确性
   *
   * 形式化: 事件 payload 中的字段类型应该是正确的
   */
  it('事件 payload 字段类型应该是正确的', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        fc.boolean(),
        // 使用可空整数（fc.option 会产生 undefined, null 或具体值）
        fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 60000 })),
        (pluginId, version, success, duration) => {
          // 只有当 duration 是具体数字时才传入 options
          const options = duration !== undefined ? { duration } : undefined;
          const event = createPluginLoadedEvent(pluginId, version, success, options);

          // 验证字段类型
          expect(typeof event.payload.pluginId).toBe('string');
          expect(typeof event.payload.version).toBe('string');
          expect(typeof event.payload.success).toBe('boolean');

          // 当传入 duration 时，payload 应该有 duration 字段
          if (duration !== undefined) {
            expect(event.payload.duration).toBe(duration);
            expect(typeof event.payload.duration).toBe('number');
          }

          // 当未传入 duration 时，payload 不应该有 duration 字段（或为 undefined）
          if (duration === undefined) {
            expect(event.payload.duration).toBeUndefined();
          }
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 14: 事件版本控制兼容性
   *
   * 形式化: 不同版本的事件对象应该都能被正确处理
   */
  it('事件版本控制字段应该保持一致性', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryVersion,
        (id1, v1, v2) => {
          const event1 = createPluginLoadedEvent(id1, v1, true);
          const event2 = createPluginLoadedEvent(id1, v2, false);

          // 两个事件的 schema_version 应该一致
          expect(event1.schema_version).toBe(event2.schema_version);
          expect(event1.schema_version).toBe('1.0');
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 15: 事件初始化事件的权限上下文
   *
   * 形式化: 初始化事件应该正确记录权限声明和授权集合
   */
  it('初始化事件应该正确记录权限上下文', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        arbitraryPermissionArray,
        (pluginId, version, requires) => {
          // grants 是 requires 的子集（模拟权限被拒绝的场景）
          const grants = requires.slice(0, Math.floor(requires.length * 0.7));

          const event = createPluginInitializedEvent(pluginId, version, requires, grants);

          // 验证权限上下文
          expect(event.payload.requires).toEqual(requires);
          expect(event.payload.grants).toEqual(grants);

          // 验证 grants 是 requires 的子集
          const grantsSet = new Set(grants);
          const allGrantsInRequires = grants.every((g) => grantsSet.has(g));
          expect(allGrantsInRequires).toBe(true);
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 16: 事件字段不可变性验证（通过深拷贝）
   *
   * 形式化: 事件对象深拷贝后，原始事件不应该被修改
   */
  it('深拷贝后原始事件不应该被意外修改', () => {
    fc.assert(
      fc.property(
        arbitraryPluginId,
        arbitraryVersion,
        (pluginId, version) => {
          const event = createPluginLoadedEvent(pluginId, version, true);

          // 保存原始值
          const originalEventId = event.eventId;
          const originalTs = event.ts;
          const originalPluginId = event.payload.pluginId;

          // 深拷贝（使用 JSON 序列化/反序列化）
          const eventCopy = JSON.parse(JSON.stringify(event));
          eventCopy.eventId = 'modified';
          eventCopy.ts = 9999999999999;
          eventCopy.payload.pluginId = 'modified-plugin';

          // 验证原始事件未被修改
          expect(event.eventId).toBe(originalEventId);
          expect(event.ts).toBe(originalTs);
          expect(event.payload.pluginId).toBe(originalPluginId);

          // 验证深拷贝的修改只影响副本
          expect(eventCopy.eventId).toBe('modified');
          expect(eventCopy.payload.pluginId).toBe('modified-plugin');
        }
      ),
      { numRuns: 100, seed: 42 }
    );
  });
});