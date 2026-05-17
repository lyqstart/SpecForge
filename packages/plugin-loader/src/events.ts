/**
 * Plugin Event Model Definition (Task 1.2.4)
 *
 * 定义 plugin-loader 的事件模型接口，包括：
 * - 事件类型枚举（plugin.loaded, plugin.unloaded, plugin.error, plugin.permission_denied, plugin.validation_failed）
 * - 事件接口（type, timestamp, pluginId, details）
 * - 各种 Payload 接口
 * - 工厂函数与类型守卫
 *
 * 字段约定遵循 REQ-18 持久化规范（必带 schema_version）。
 * 事件设计参考 design.md §「4. 事件设计」。
 */

import type { PluginPermission } from './manifest';

// ---------------------------------------------------------------------------
// 事件类型枚举
// ---------------------------------------------------------------------------

/**
 * 插件加载器产生的所有事件类型。
 *
 * 分类：
 *   - plugin.* : 插件生命周期事件
 *   - auth.*   : 权限检查事件
 */
export type PluginEventType =
  | 'plugin.loaded'      // 插件加载成功
  | 'plugin.unloaded'    // 插件卸载
  | 'plugin.enabled'     // 插件启用
  | 'plugin.disabled'    // 插件停用
  | 'plugin.error'       // 插件加载/运行错误
  | 'auth.checked'       // 权限检查完成（通过）
  | 'auth.denied';       // 权限检查失败（拒绝）

/** 所有合法事件类型的常量集合 */
export const PLUGIN_EVENT_TYPES: ReadonlySet<PluginEventType> = new Set<PluginEventType>([
  'plugin.loaded',
  'plugin.unloaded',
  'plugin.enabled',
  'plugin.disabled',
  'plugin.error',
  'auth.checked',
  'auth.denied',
]);

// ---------------------------------------------------------------------------
// Payload 接口定义
// ---------------------------------------------------------------------------

/** plugin.loaded 事件的 payload */
export interface PluginLoadedPayload {
  /** 插件清单中的 id */
  manifestId: string;
  /** 运行时实例 id（同一插件多次加载会有不同 instanceId） */
  instanceId: string;
  /** 本次加载实际使用的权限列表（可以是任意字符串，不限于标准 PluginPermission） */
  grantsUsed: string[];
}

/** plugin.unloaded 事件的 payload */
export interface PluginUnloadedPayload {
  /** 插件清单中的 id */
  manifestId: string;
  /** 运行时实例 id */
  instanceId: string;
  /** 卸载原因（可选） */
  reason?: string;
}

/** plugin.enabled 事件的 payload */
export interface PluginEnabledPayload {
  /** 插件清单中的 id */
  manifestId: string;
}

/** plugin.disabled 事件的 payload */
export interface PluginDisabledPayload {
  /** 插件清单中的 id */
  manifestId: string;
  /** 停用原因（可选） */
  reason?: string;
}

/** plugin.error 事件的 payload */
export interface PluginErrorPayload {
  /** 插件清单中的 id */
  manifestId: string;
  /** 错误码（machine-readable，例 "LOAD_ERROR"、"STATIC_CHECK_FAILED"） */
  errorCode: string;
  /** 错误信息（人类可读） */
  errorMessage: string;
}

/** auth.checked 事件的 payload */
export interface AuthCheckedPayload {
  /** 被授予的权限列表（可以是任意字符串，不限于标准 PluginPermission） */
  grantedPermissions: string[];
  /** 被拒绝的权限列表（可选） */
  denied?: string[];
}

/** auth.denied 事件的 payload */
export interface AuthDeniedPayload {
  /** 插件声明需要的权限列表（可以是任意字符串，不限于标准 PluginPermission） */
  requiredPermissions: string[];
  /** 其中缺失的权限列表 */
  missingPermissions: string[];
}

/** 所有 Payload 类型的联合 */
export type PluginEventPayload =
  | PluginLoadedPayload
  | PluginUnloadedPayload
  | PluginEnabledPayload
  | PluginDisabledPayload
  | PluginErrorPayload
  | AuthCheckedPayload
  | AuthDeniedPayload;

// ---------------------------------------------------------------------------
// 事件接口
// ---------------------------------------------------------------------------

/** 事件创建选项 */
export interface PluginEventOptions {
  /** 关联的插件 id（可选） */
  pluginId?: string;
  /** 关联的会话 id（可选） */
  sessionId?: string;
}

/**
 * 插件事件（核心数据模型）
 *
 * 必填字段：
 *   - schema_version: 必须严格等于字面量 "1.0"
 *   - type: 事件类型
 *   - timestamp: Unix ms 时间戳
 *   - payload: 事件负载（类型由 type 决定）
 *
 * 可选字段：
 *   - pluginId: 关联的插件 id
 *   - sessionId: 关联的会话 id
 */
export interface PluginEvent {
  schema_version: '1.0';
  type: PluginEventType;
  timestamp: number;
  payload: PluginEventPayload;
  pluginId?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** 判断 obj 是否是非空、非数组的普通对象 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/** 判断 v 是否是有限的非负整数（Unix ms 合法值） */
function isUnixMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v);
}

/** 判断 v 是否是合法的 PluginPermission */
function isPluginPermission(v: unknown): v is PluginPermission {
  const validPermissions: ReadonlySet<string> = new Set<PluginPermission>([
    'filesystem.read',
    'filesystem.write',
    'network',
    'child_process',
    'env.read',
  ]);
  return typeof v === 'string' && validPermissions.has(v);
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/**
 * 判断 x 是否是合法的 PluginEventType。
 */
export function isPluginEventType(x: unknown): x is PluginEventType {
  return typeof x === 'string' && PLUGIN_EVENT_TYPES.has(x as PluginEventType);
}

/**
 * 判断 x 是否是合法的 PluginLoadedPayload。
 */
export function isPluginLoadedPayload(x: unknown): x is PluginLoadedPayload {
  if (!isPlainObject(x)) return false;
  if (typeof x['manifestId'] !== 'string' || x['manifestId'].length === 0) return false;
  if (typeof x['instanceId'] !== 'string' || x['instanceId'].length === 0) return false;
  if (!Array.isArray(x['grantsUsed'])) return false;
  if (!x['grantsUsed'].every((p) => typeof p === 'string')) return false;
  return true;
}

/**
 * 判断 x 是否是合法的 PluginUnloadedPayload。
 */
export function isPluginUnloadedPayload(x: unknown): x is PluginUnloadedPayload {
  if (!isPlainObject(x)) return false;
  if (typeof x['manifestId'] !== 'string' || x['manifestId'].length === 0) return false;
  if (typeof x['instanceId'] !== 'string' || x['instanceId'].length === 0) return false;
  if (x['reason'] !== undefined && typeof x['reason'] !== 'string') return false;
  return true;
}

/**
 * 判断 x 是否是合法的 PluginEnabledPayload。
 */
export function isPluginEnabledPayload(x: unknown): x is PluginEnabledPayload {
  if (!isPlainObject(x)) return false;
  if (typeof x['manifestId'] !== 'string' || x['manifestId'].length === 0) return false;
  return true;
}

/**
 * 判断 x 是否是合法的 PluginDisabledPayload。
 */
export function isPluginDisabledPayload(x: unknown): x is PluginDisabledPayload {
  if (!isPlainObject(x)) return false;
  if (typeof x['manifestId'] !== 'string' || x['manifestId'].length === 0) return false;
  if (x['reason'] !== undefined && typeof x['reason'] !== 'string') return false;
  return true;
}

/**
 * 判断 x 是否是合法的 PluginErrorPayload。
 */
export function isPluginErrorPayload(x: unknown): x is PluginErrorPayload {
  if (!isPlainObject(x)) return false;
  if (typeof x['manifestId'] !== 'string' || x['manifestId'].length === 0) return false;
  if (typeof x['errorCode'] !== 'string' || x['errorCode'].length === 0) return false;
  if (typeof x['errorMessage'] !== 'string') return false;
  return true;
}

/**
 * 判断 x 是否是合法的 AuthCheckedPayload。
 */
export function isAuthCheckedPayload(x: unknown): x is AuthCheckedPayload {
  if (!isPlainObject(x)) return false;
  if (!Array.isArray(x['grantedPermissions'])) return false;
  if (!x['grantedPermissions'].every((p) => typeof p === 'string')) return false;
  if (x['denied'] !== undefined) {
    if (!Array.isArray(x['denied'])) return false;
    if (!x['denied'].every((p) => typeof p === 'string')) return false;
  }
  return true;
}

/**
 * 判断 x 是否是合法的 AuthDeniedPayload。
 */
export function isAuthDeniedPayload(x: unknown): x is AuthDeniedPayload {
  if (!isPlainObject(x)) return false;
  if (!Array.isArray(x['requiredPermissions'])) return false;
  if (!x['requiredPermissions'].every((p) => typeof p === 'string')) return false;
  if (!Array.isArray(x['missingPermissions'])) return false;
  if (!x['missingPermissions'].every((p) => typeof p === 'string')) return false;
  return true;
}

/**
 * 判断 x 是否是合法的 PluginEventPayload。
 * 根据 payload 的形状推断其类型。
 */
function isPluginEventPayload(x: unknown): x is PluginEventPayload {
  if (!isPlainObject(x)) return false;

  // 尝试匹配各种 payload 类型
  if (isPluginLoadedPayload(x)) return true;
  if (isPluginUnloadedPayload(x)) return true;
  if (isPluginEnabledPayload(x)) return true;
  if (isPluginDisabledPayload(x)) return true;
  if (isPluginErrorPayload(x)) return true;
  if (isAuthCheckedPayload(x)) return true;
  if (isAuthDeniedPayload(x)) return true;

  return false;
}

/**
 * 判断 x 是否是合法的 PluginEvent。
 *
 * 校验规则：
 *   1. 必须是普通对象
 *   2. schema_version 必须严格等于字符串 "1.0"
 *   3. type 必须是合法的 PluginEventType
 *   4. timestamp 必须是非负整数（Unix ms）
 *   5. payload 必须是合法的 PluginEventPayload
 *   6. pluginId（如有）必须是非空字符串
 *   7. sessionId（如有）必须是非空字符串
 */
export function isPluginEvent(x: unknown): x is PluginEvent {
  if (!isPlainObject(x)) return false;

  if (x['schema_version'] !== '1.0') return false;

  if (!isPluginEventType(x['type'])) return false;

  if (!isUnixMs(x['timestamp'])) return false;

  if (!isPluginEventPayload(x['payload'])) return false;

  if (x['pluginId'] !== undefined) {
    if (typeof x['pluginId'] !== 'string' || x['pluginId'].length === 0) return false;
  }

  if (x['sessionId'] !== undefined) {
    if (typeof x['sessionId'] !== 'string' || x['sessionId'].length === 0) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// 工厂函数
// ---------------------------------------------------------------------------

/**
 * 创建一个 PluginEvent 实例。
 *
 * @param type - 事件类型
 * @param payload - 事件负载
 * @param options - 可选的事件选项（pluginId, sessionId）
 * @returns 新创建的 PluginEvent
 *
 * 自动生成：
 *   - schema_version: "1.0"
 *   - timestamp: 当前 Unix ms 时间戳
 */
export function createPluginEvent(
  type: PluginEventType,
  payload: PluginEventPayload,
  options?: PluginEventOptions,
): PluginEvent {
  const event: PluginEvent = {
    schema_version: '1.0',
    type,
    timestamp: Date.now(),
    payload,
  };

  if (options?.pluginId !== undefined) {
    event.pluginId = options.pluginId;
  }

  if (options?.sessionId !== undefined) {
    event.sessionId = options.sessionId;
  }

  return event;
}
