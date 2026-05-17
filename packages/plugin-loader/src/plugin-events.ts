/**
 * Plugin Event Model Integration (Task 1.3)
 *
 * 集成 Event Bus 与插件加载器事件系统，定义：
 * - 插件生命周期事件类型（PluginLoadedEvent, PluginUnloadedEvent, PluginErrorEvent, PluginInitializedEvent）
 * - 事件发布到 Event Bus 的机制
 * - 事件模式匹配与订阅
 *
 * 遵循 REQ-18 持久化规范（必带 schema_version）。
 * 集成 observability 包的 Event Bus（Property 2: Event Bus Traversal）。
 */

import type { Event, EventCategory } from '@specforge/observability';

// ---------------------------------------------------------------------------
// 事件类型定义
// ---------------------------------------------------------------------------

/**
 * 插件生命周期事件类型
 */
export type PluginLifecycleAction = 'load' | 'reload' | 'unload' | 'initialize';

/**
 * 插件状态变化事件类型
 */
export type PluginStateAction = 'enabled' | 'disabled' | 'active' | 'inactive';

/**
 * 插件权限事件类型
 */
export type PluginPermissionAction = 'auth_checked' | 'auth_denied' | 'permission_changed' | 'static_check';

/**
 * 插件错误事件类型
 */
export type PluginErrorCode =
  | 'MANIFEST_ERROR'
  | 'MANIFEST_MISSING'
  | 'STATIC_CHECK_FAILED'
  | 'AUTH_DENIED'
  | 'AUTH_MISSING_PERMISSION'
  | 'DEPENDENCY_MISSING'
  | 'DEPENDENCY_UNSATISFIED'
  | 'ENTRY_NOT_FOUND'
  | 'ENTRY_LOAD_ERROR'
  | 'SANDBOX_ERROR'
  | 'INTERNAL_ERROR';

// ---------------------------------------------------------------------------
// 事件 Payload 接口
// ---------------------------------------------------------------------------

/**
 * 插件加载事件的 payload
 */
export interface PluginLoadedEventPayload {
  pluginId: string;
  version: string;
  success: boolean;
  duration?: number; // 加载耗时（毫秒）
  error?: {
    code: PluginErrorCode;
    message: string;
    details?: unknown;
  };
}

/**
 * 插件卸载事件的 payload
 */
export interface PluginUnloadedEventPayload {
  pluginId: string;
  reason?: string;
  duration?: number;
}

/**
 * 插件初始化事件的 payload
 */
export interface PluginInitializedEventPayload {
  pluginId: string;
  version: string;
  requires: string[]; // 声明的权限列表
  grants: string[]; // 实际授予的权限列表
}

/**
 * 插件错误事件的 payload
 */
export interface PluginErrorEventPayload {
  pluginId: string;
  errorCode: PluginErrorCode;
  message: string;
  details?: unknown;
  relatedState?: string;
}

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  authorized: boolean;
  missing?: string[]; // 缺失的权限
  denied?: string[]; // 被拒绝的权限
  source: 'user' | 'project' | 'default';
}

/**
 * 静态检查结果
 */
export interface StaticCheckResult {
  passed: boolean;
  duration?: number;
  violations?: Array<{
    code: string;
    message: string;
    file: string;
    line: number;
    column: number;
  }>;
}

/**
 * 权限事件的 payload
 */
export interface PluginPermissionEventPayload {
  pluginId: string;
  requires?: string[];
  grants?: string[];
  permissionResult?: PermissionCheckResult;
  staticCheckResult?: StaticCheckResult;
  previousSource?: string;
  newSource?: string;
}

// ---------------------------------------------------------------------------
// 事件接口定义
// ---------------------------------------------------------------------------

/**
 * 插件加载事件
 * 当插件成功或失败加载时产生
 */
export interface PluginLoadedEvent extends Event {
  category: 'plugin';
  action: 'plugin.loaded';
  payload: PluginLoadedEventPayload;
}

/**
 * 插件卸载事件
 * 当插件被卸载时产生
 */
export interface PluginUnloadedEvent extends Event {
  category: 'plugin';
  action: 'plugin.unloaded';
  payload: PluginUnloadedEventPayload;
}

/**
 * 插件初始化事件
 * 当插件初始化完成时产生
 */
export interface PluginInitializedEvent extends Event {
  category: 'plugin';
  action: 'plugin.initialized';
  payload: PluginInitializedEventPayload;
}

/**
 * 插件错误事件
 * 当插件加载或运行出错时产生
 */
export interface PluginErrorEvent extends Event {
  category: 'plugin';
  action: 'plugin.error';
  payload: PluginErrorEventPayload;
}

/**
 * 所有插件事件的联合类型
 */
export type PluginEvent = PluginLoadedEvent | PluginUnloadedEvent | PluginInitializedEvent | PluginErrorEvent;

// ---------------------------------------------------------------------------
// 事件工厂函数
// ---------------------------------------------------------------------------

/**
 * 生成唯一的事件 ID
 * 格式：evt_<timestamp>_<random>
 */
export function generateEventId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `evt_${timestamp}_${random}`;
}

/**
 * 创建插件加载事件
 */
export function createPluginLoadedEvent(
  pluginId: string,
  version: string,
  success: boolean,
  options?: {
    duration?: number;
    error?: {
      code: PluginErrorCode;
      message: string;
      details?: unknown;
    };
  },
): PluginLoadedEvent {
  return {
    schema_version: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    monotonicSeq: 0, // 由 Event Bus 填充
    projectId: '', // 由 Event Bus 填充
    workItemId: null,
    actor: null,
    category: 'plugin',
    action: 'plugin.loaded',
    payload: {
      pluginId,
      version,
      success,
      duration: options?.duration,
      error: options?.error,
    },
  };
}

/**
 * 创建插件卸载事件
 */
export function createPluginUnloadedEvent(
  pluginId: string,
  options?: {
    reason?: string;
    duration?: number;
  },
): PluginUnloadedEvent {
  return {
    schema_version: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    monotonicSeq: 0,
    projectId: '',
    workItemId: null,
    actor: null,
    category: 'plugin',
    action: 'plugin.unloaded',
    payload: {
      pluginId,
      reason: options?.reason,
      duration: options?.duration,
    },
  };
}

/**
 * 创建插件初始化事件
 */
export function createPluginInitializedEvent(
  pluginId: string,
  version: string,
  requires: string[],
  grants: string[],
): PluginInitializedEvent {
  return {
    schema_version: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    monotonicSeq: 0,
    projectId: '',
    workItemId: null,
    actor: null,
    category: 'plugin',
    action: 'plugin.initialized',
    payload: {
      pluginId,
      version,
      requires,
      grants,
    },
  };
}

/**
 * 创建插件错误事件
 */
export function createPluginErrorEvent(
  pluginId: string,
  errorCode: PluginErrorCode,
  message: string,
  options?: {
    details?: unknown;
    relatedState?: string;
  },
): PluginErrorEvent {
  return {
    schema_version: '1.0',
    eventId: generateEventId(),
    ts: Date.now(),
    monotonicSeq: 0,
    projectId: '',
    workItemId: null,
    actor: null,
    category: 'plugin',
    action: 'plugin.error',
    payload: {
      pluginId,
      errorCode,
      message,
      details: options?.details,
      relatedState: options?.relatedState,
    },
  };
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/**
 * 判断是否是插件加载事件
 */
export function isPluginLoadedEvent(event: Event): event is PluginLoadedEvent {
  return event.category === 'plugin' && event.action === 'plugin.loaded';
}

/**
 * 判断是否是插件卸载事件
 */
export function isPluginUnloadedEvent(event: Event): event is PluginUnloadedEvent {
  return event.category === 'plugin' && event.action === 'plugin.unloaded';
}

/**
 * 判断是否是插件初始化事件
 */
export function isPluginInitializedEvent(event: Event): event is PluginInitializedEvent {
  return event.category === 'plugin' && event.action === 'plugin.initialized';
}

/**
 * 判断是否是插件错误事件
 */
export function isPluginErrorEvent(event: Event): event is PluginErrorEvent {
  return event.category === 'plugin' && event.action === 'plugin.error';
}

/**
 * 判断是否是任何插件事件
 */
export function isPluginEvent(event: Event): event is PluginEvent {
  return (
    isPluginLoadedEvent(event) ||
    isPluginUnloadedEvent(event) ||
    isPluginInitializedEvent(event) ||
    isPluginErrorEvent(event)
  );
}

// ---------------------------------------------------------------------------
// Event Bus 集成
// ---------------------------------------------------------------------------

/**
 * 插件事件发布器
 * 负责将插件事件发布到 Event Bus
 */
export interface PluginEventPublisher {
  /**
   * 发布插件加载事件
   */
  publishLoaded(event: PluginLoadedEvent): Promise<void>;

  /**
   * 发布插件卸载事件
   */
  publishUnloaded(event: PluginUnloadedEvent): Promise<void>;

  /**
   * 发布插件初始化事件
   */
  publishInitialized(event: PluginInitializedEvent): Promise<void>;

  /**
   * 发布插件错误事件
   */
  publishError(event: PluginErrorEvent): Promise<void>;

  /**
   * 发布任何插件事件
   */
  publish(event: PluginEvent): Promise<void>;
}

/**
 * 创建插件事件发布器
 * @param eventBus - Event Bus 实例
 * @returns 插件事件发布器
 */
export function createPluginEventPublisher(eventBus: any): PluginEventPublisher {
  return {
    async publishLoaded(event: PluginLoadedEvent): Promise<void> {
      await eventBus.emit({
        category: event.category,
        action: event.action,
        payload: event.payload,
      });
    },

    async publishUnloaded(event: PluginUnloadedEvent): Promise<void> {
      await eventBus.emit({
        category: event.category,
        action: event.action,
        payload: event.payload,
      });
    },

    async publishInitialized(event: PluginInitializedEvent): Promise<void> {
      await eventBus.emit({
        category: event.category,
        action: event.action,
        payload: event.payload,
      });
    },

    async publishError(event: PluginErrorEvent): Promise<void> {
      await eventBus.emit({
        category: event.category,
        action: event.action,
        payload: event.payload,
      });
    },

    async publish(event: PluginEvent): Promise<void> {
      await eventBus.emit({
        category: event.category,
        action: event.action,
        payload: event.payload,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// 事件订阅辅助函数
// ---------------------------------------------------------------------------

/**
 * 订阅所有插件事件
 * @param eventBus - Event Bus 实例
 * @returns 异步可迭代的事件流
 */
export function subscribeToPluginEvents(eventBus: any): AsyncIterable<PluginEvent> {
  return eventBus.subscribe('plugin.*');
}

/**
 * 订阅特定类型的插件事件
 * @param eventBus - Event Bus 实例
 * @param action - 事件动作（如 'plugin.loaded'）
 * @returns 异步可迭代的事件流
 */
export function subscribeToPluginEventAction(eventBus: any, action: string): AsyncIterable<Event> {
  return eventBus.subscribe(action);
}
