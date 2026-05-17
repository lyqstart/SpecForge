/**
 * 事件模型接口定义（任务 1.2.4 核心交付物）
 *
 * 定义插件相关事件的类型接口，支持事件类型：
 *   - plugin.loaded: 插件加载成功
 *   - plugin.unloaded: 插件卸载
 *   - plugin.error: 插件加载/运行错误
 *   - plugin.hot_reloaded: 插件热重载
 *
 * 字段约定遵循 REQ-18（持久化必带 schema_version）和 design.md 中
 * §「事件设计」对事件日志的要求。所有事件通过 Event Bus 广播，
 * 记录到 events.jsonl 便于审计与调试。
 */

import type { PluginManifest } from '../manifest';
import type { PluginPermission } from '../manifest';

// ---------------------------------------------------------------------------
// 事件类型枚举
// ---------------------------------------------------------------------------

/**
 * 插件事件的标准分类（category）。
 * 所有插件相关事件都使用 "plugin" 作为 category。
 */
export const PLUGIN_EVENT_CATEGORY = 'plugin' as const;

/**
 * 插件事件的标准动作（action）。
 *
 * - `loaded`: 插件加载成功，已通过所有校验（manifest/auth/static-check）
 * - `unloaded`: 插件被卸载（用户操作、配置变更、或清理）
 * - `error`: 插件加载/运行出错（校验失败、依赖缺失、运行时异常等）
 * - `hot_reloaded`: 插件热重载成功（文件变化后重新加载）
 */
export type PluginEventAction = 'loaded' | 'unloaded' | 'error' | 'hot_reloaded';

/** 所有合法事件动作的常量集合 */
export const PLUGIN_EVENT_ACTIONS: ReadonlySet<PluginEventAction> = new Set<PluginEventAction>([
  'loaded',
  'unloaded',
  'error',
  'hot_reloaded',
]);

// ---------------------------------------------------------------------------
// 事件错误信息
// ---------------------------------------------------------------------------

/**
 * 事件中的错误详情（仅在 action === 'error' 时通常有值）。
 *
 * 字段：
 *   - code: 错误码（machine-readable，例 "MANIFEST_ERROR" / "AUTH_DENIED"）
 *   - message: 人类可读错误信息
 *   - details: 可选的额外上下文（例如缺失的权限列表、违规的 API 调用位置）
 */
export interface PluginEventError {
  /** 错误码（machine-readable） */
  code: string;
  /** 人类可读错误信息 */
  message: string;
  /** 可选的额外上下文（任意 JSON 序列化对象） */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 事件元数据
// ---------------------------------------------------------------------------

/**
 * 事件元数据（所有事件共有的基础字段）。
 *
 * 字段：
 *   - eventId: 事件全局唯一标识符（UUID v4 或类似）
 *   - ts: Unix 毫秒时间戳
 *   - category: 事件分类（固定为 "plugin"）
 *   - action: 事件动作（loaded / unloaded / error / hot_reloaded）
 */
export interface PluginEventMetadata {
  /** 事件全局唯一标识符（UUID v4 或类似） */
  eventId: string;
  /** Unix 毫秒时间戳 */
  ts: number;
  /** 事件分类（固定为 "plugin"） */
  category: typeof PLUGIN_EVENT_CATEGORY;
  /** 事件动作 */
  action: PluginEventAction;
}

// ---------------------------------------------------------------------------
// 具体事件类型
// ---------------------------------------------------------------------------

/**
 * 插件加载成功事件（action === 'loaded'）。
 *
 * 字段：
 *   - pluginId: 插件 ID
 *   - version: 插件版本
 *   - requires: 插件声明的权限列表
 *   - grants: 实际授予的权限列表
 *   - staticCheckPassed: 静态检查是否通过
 *   - loadTimeMs: 加载耗时（毫秒）
 */
export interface PluginLoadedEvent extends PluginEventMetadata {
  action: 'loaded';
  /** 插件 ID */
  pluginId: string;
  /** 插件版本 */
  version: string;
  /** 插件声明的权限列表 */
  requires?: PluginPermission[];
  /** 实际授予的权限列表 */
  grants?: PluginPermission[];
  /** 静态检查是否通过 */
  staticCheckPassed?: boolean;
  /** 加载耗时（毫秒） */
  loadTimeMs?: number;
}

/**
 * 插件卸载事件（action === 'unloaded'）。
 *
 * 字段：
 *   - pluginId: 插件 ID
 *   - version: 插件版本
 *   - reason: 卸载原因（可选，例如 "user_request" / "config_change" / "cleanup"）
 */
export interface PluginUnloadedEvent extends PluginEventMetadata {
  action: 'unloaded';
  /** 插件 ID */
  pluginId: string;
  /** 插件版本 */
  version: string;
  /** 卸载原因（可选） */
  reason?: string;
}

/**
 * 插件错误事件（action === 'error'）。
 *
 * 字段：
 *   - pluginId: 插件 ID（可能为 undefined，如果错误发生在清单解析阶段）
 *   - version: 插件版本（可能为 undefined）
 *   - error: 错误详情
 *   - stage: 错误发生的阶段（例如 "manifest_parse" / "auth_check" / "static_check" / "load" / "runtime"）
 */
export interface PluginErrorEvent extends PluginEventMetadata {
  action: 'error';
  /** 插件 ID（可能为 undefined） */
  pluginId?: string;
  /** 插件版本（可能为 undefined） */
  version?: string;
  /** 错误详情 */
  error: PluginEventError;
  /** 错误发生的阶段 */
  stage?: 'manifest_parse' | 'auth_check' | 'static_check' | 'load' | 'runtime';
}

/**
 * 插件热重载事件（action === 'hot_reloaded'）。
 *
 * 字段：
 *   - pluginId: 插件 ID
 *   - oldVersion: 旧版本
 *   - newVersion: 新版本
 *   - reason: 热重载原因（例如 "file_change" / "config_update"）
 *   - reloadTimeMs: 重载耗时（毫秒）
 */
export interface PluginHotReloadedEvent extends PluginEventMetadata {
  action: 'hot_reloaded';
  /** 插件 ID */
  pluginId: string;
  /** 旧版本 */
  oldVersion: string;
  /** 新版本 */
  newVersion: string;
  /** 热重载原因（可选） */
  reason?: string;
  /** 重载耗时（毫秒） */
  reloadTimeMs?: number;
}

// ---------------------------------------------------------------------------
// 联合类型
// ---------------------------------------------------------------------------

/**
 * 所有插件事件的联合类型。
 *
 * 使用 discriminated union 模式，通过 action 字段进行类型缩小：
 *
 *   ```typescript
 *   function handleEvent(event: PluginEvent) {
 *     switch (event.action) {
 *       case 'loaded':
 *         // event 自动缩小为 PluginLoadedEvent
 *         console.log(event.loadTimeMs);
 *         break;
 *       case 'error':
 *         // event 自动缩小为 PluginErrorEvent
 *         console.log(event.error.code);
 *         break;
 *       // ...
 *     }
 *   }
 *   ```
 */
export type PluginEvent =
  | PluginLoadedEvent
  | PluginUnloadedEvent
  | PluginErrorEvent
  | PluginHotReloadedEvent;

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

/** 判断 v 是否是非空字符串 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/**
 * 校验 x 是否是合法的 PluginEventMetadata。
 *
 * 校验规则：
 *   1. 必须是普通对象
 *   2. eventId 必须是非空字符串
 *   3. ts 必须是非负整数（Unix ms）
 *   4. category 必须严格等于 "plugin"
 *   5. action 必须是 PLUGIN_EVENT_ACTIONS 中的合法值
 */
export function isPluginEventMetadata(x: unknown): x is PluginEventMetadata {
  if (!isPlainObject(x)) return false;

  if (!isNonEmptyString(x['eventId'])) return false;
  if (!isUnixMs(x['ts'])) return false;
  if (x['category'] !== PLUGIN_EVENT_CATEGORY) return false;

  if (typeof x['action'] !== 'string') return false;
  if (!PLUGIN_EVENT_ACTIONS.has(x['action'] as PluginEventAction)) return false;

  return true;
}

/**
 * 校验 x 是否是合法的 PluginEventError。
 *
 * 校验规则：
 *   1. 必须是普通对象
 *   2. code 必须是非空字符串
 *   3. message 必须是字符串（允许空字符串）
 *   4. details（如有）必须是普通对象
 */
export function isPluginEventError(x: unknown): x is PluginEventError {
  if (!isPlainObject(x)) return false;

  if (!isNonEmptyString(x['code'])) return false;
  if (typeof x['message'] !== 'string') return false;

  if (x['details'] !== undefined) {
    if (!isPlainObject(x['details'])) return false;
  }

  return true;
}

/**
 * 校验 x 是否是合法的 PluginLoadedEvent。
 *
 * 校验规则：
 *   1. 必须通过 isPluginEventMetadata 校验
 *   2. action 必须严格等于 'loaded'
 *   3. pluginId 必须是非空字符串
 *   4. version 必须是非空字符串
 *   5. requires（如有）必须是字符串数组
 *   6. grants（如有）必须是字符串数组
 *   7. staticCheckPassed（如有）必须是布尔值
 *   8. loadTimeMs（如有）必须是非负整数
 */
export function isPluginLoadedEvent(x: unknown): x is PluginLoadedEvent {
  if (!isPluginEventMetadata(x)) return false;
  if (x['action'] !== 'loaded') return false;

  if (!isNonEmptyString(x['pluginId'])) return false;
  if (!isNonEmptyString(x['version'])) return false;

  if (x['requires'] !== undefined) {
    if (!Array.isArray(x['requires'])) return false;
    if (!x['requires'].every((p) => typeof p === 'string')) return false;
  }

  if (x['grants'] !== undefined) {
    if (!Array.isArray(x['grants'])) return false;
    if (!x['grants'].every((p) => typeof p === 'string')) return false;
  }

  if (x['staticCheckPassed'] !== undefined && typeof x['staticCheckPassed'] !== 'boolean') {
    return false;
  }

  if (x['loadTimeMs'] !== undefined && !isUnixMs(x['loadTimeMs'])) {
    return false;
  }

  return true;
}

/**
 * 校验 x 是否是合法的 PluginUnloadedEvent。
 *
 * 校验规则：
 *   1. 必须通过 isPluginEventMetadata 校验
 *   2. action 必须严格等于 'unloaded'
 *   3. pluginId 必须是非空字符串
 *   4. version 必须是非空字符串
 *   5. reason（如有）必须是字符串
 */
export function isPluginUnloadedEvent(x: unknown): x is PluginUnloadedEvent {
  if (!isPluginEventMetadata(x)) return false;
  if (x['action'] !== 'unloaded') return false;

  if (!isNonEmptyString(x['pluginId'])) return false;
  if (!isNonEmptyString(x['version'])) return false;

  if (x['reason'] !== undefined && typeof x['reason'] !== 'string') {
    return false;
  }

  return true;
}

/**
 * 校验 x 是否是合法的 PluginErrorEvent。
 *
 * 校验规则：
 *   1. 必须通过 isPluginEventMetadata 校验
 *   2. action 必须严格等于 'error'
 *   3. pluginId（如有）必须是非空字符串
 *   4. version（如有）必须是非空字符串
 *   5. error 必须通过 isPluginEventError 校验
 *   6. stage（如有）必须是已知的阶段值
 */
export function isPluginErrorEvent(x: unknown): x is PluginErrorEvent {
  if (!isPluginEventMetadata(x)) return false;
  if (x['action'] !== 'error') return false;

  if (x['pluginId'] !== undefined && !isNonEmptyString(x['pluginId'])) {
    return false;
  }

  if (x['version'] !== undefined && !isNonEmptyString(x['version'])) {
    return false;
  }

  if (!isPluginEventError(x['error'])) return false;

  if (x['stage'] !== undefined) {
    const validStages = ['manifest_parse', 'auth_check', 'static_check', 'load', 'runtime'];
    if (typeof x['stage'] !== 'string' || !validStages.includes(x['stage'])) {
      return false;
    }
  }

  return true;
}

/**
 * 校验 x 是否是合法的 PluginHotReloadedEvent。
 *
 * 校验规则：
 *   1. 必须通过 isPluginEventMetadata 校验
 *   2. action 必须严格等于 'hot_reloaded'
 *   3. pluginId 必须是非空字符串
 *   4. oldVersion 必须是非空字符串
 *   5. newVersion 必须是非空字符串
 *   6. reason（如有）必须是字符串
 *   7. reloadTimeMs（如有）必须是非负整数
 */
export function isPluginHotReloadedEvent(x: unknown): x is PluginHotReloadedEvent {
  if (!isPluginEventMetadata(x)) return false;
  if (x['action'] !== 'hot_reloaded') return false;

  if (!isNonEmptyString(x['pluginId'])) return false;
  if (!isNonEmptyString(x['oldVersion'])) return false;
  if (!isNonEmptyString(x['newVersion'])) return false;

  if (x['reason'] !== undefined && typeof x['reason'] !== 'string') {
    return false;
  }

  if (x['reloadTimeMs'] !== undefined && !isUnixMs(x['reloadTimeMs'])) {
    return false;
  }

  return true;
}

/**
 * 校验 x 是否是合法的 PluginEvent（任意事件类型）。
 *
 * 使用 discriminated union 模式，根据 action 字段调用对应的守卫函数。
 */
export function isPluginEvent(x: unknown): x is PluginEvent {
  if (!isPlainObject(x)) return false;

  const action = x['action'];

  switch (action) {
    case 'loaded':
      return isPluginLoadedEvent(x);
    case 'unloaded':
      return isPluginUnloadedEvent(x);
    case 'error':
      return isPluginErrorEvent(x);
    case 'hot_reloaded':
      return isPluginHotReloadedEvent(x);
    default:
      return false;
  }
}
