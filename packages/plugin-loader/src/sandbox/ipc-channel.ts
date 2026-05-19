/**
 * IPC 通道实现（任务 9.2.2 核心交付物）
 *
 * 实现简单 IPC 通信功能：
 *   - 消息发送/接收
 *   - 请求-响应模式
 *   - 事件订阅机制
 *
 * 本模块为 P2（V6.x）预备，是沙箱与主机通信的基础组件。
 * 字段约定遵循：
 *   - REQ-18 持久化字段规范
 *   - design.md 中 §「PluginSandbox (P2)」对 IPC 通信的要求
 *   - async-resource-lifecycle 经验（A1 败者清理、A2 终止可达性）
 */

import { randomUUID } from 'crypto';
import type { IPCMessage, IPCRequest, IPCResponse, IPCEvent } from './index';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 默认请求超时（毫秒） */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** IPC 通道状态 */
export type IPCChannelStatus = 'created' | 'connected' | 'disconnected' | 'error';

/** 所有合法通道状态的常量集合 */
export const IPC_CHANNEL_STATUSES: ReadonlySet<IPCChannelStatus> = new Set<IPCChannelStatus>([
  'created',
  'connected',
  'disconnected',
  'error',
]);

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * IPC 通道配置
 *
 * 字段：
 *   - requestTimeoutMs: 请求超时时间，默认 30000ms
 *   - enableLogging: 是否启用日志，默认 false
 */
export interface IPCChannelConfig {
  /** 请求超时时间（毫秒），默认 30000ms */
  requestTimeoutMs?: number;
  /** 是否启用日志，默认 false */
  enableLogging?: boolean;
}

/**
 * 待处理的请求（用于请求-响应模式）
 */
interface PendingRequest {
  /** 请求 ID */
  requestId: string;
  /** 请求时间戳 */
  timestamp: number;
  /** Promise resolve 回调 */
  resolve: (value: IPCResponse) => void;
  /** Promise reject 回调 */
  reject: (error: Error) => void;
  /** 超时 timer */
  timeoutTimer: ReturnType<typeof setTimeout>;
}

/**
 * 事件订阅者
 */
interface EventSubscriber {
  /** 订阅 ID */
  id: string;
  /** 事件处理器 */
  handler: (event: IPCEvent) => void;
}

// ---------------------------------------------------------------------------
// IPC 通道类
// ---------------------------------------------------------------------------

/**
 * IPC 通道
 *
 * 提供进程间通信的抽象，支持：
 *   - 消息发送/接收
 *   - 请求-响应模式（带超时）
 *   - 事件订阅
 *
 * 遵循 async-resource-lifecycle 经验：
 *   - A1 败者清理：Promise.race 的 timer 必须在 finally 中清理
 *   - A2 终止可达性：终止条件必须在 finally 中可达
 *   - A4 所有者原则：创建者负责清理
 */
export class IPCChannel {
  /** 通道唯一标识符 */
  public readonly id: string;

  /** 关联的进程 ID */
  public readonly processId: string;

  /** 当前状态 */
  private status: IPCChannelStatus = 'created';

  /** 通道配置 */
  private config: Required<IPCChannelConfig>;

  /** 待处理的请求映射（requestId → PendingRequest） */
  private pendingRequests = new Map<string, PendingRequest>();

  /** 事件订阅者映射（eventName → EventSubscriber[]） */
  private eventSubscribers = new Map<string, EventSubscriber[]>();

  /** 消息处理器 */
  private messageHandler: ((message: IPCMessage) => void) | null = null;

  /** 通道是否已释放 */
  private disposed = false;

  /**
   * 创建 IPC 通道
   *
   * @param processId 关联的进程 ID
   * @param config 通道配置
   */
  constructor(processId: string, config: IPCChannelConfig = {}) {
    this.id = randomUUID();
    this.processId = processId;
    this.config = {
      requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      enableLogging: config.enableLogging ?? false,
    };
  }

  // ---------------------------------------------------------------------------
  // 状态管理
  // ---------------------------------------------------------------------------

  /**
   * 获取通道状态
   */
  getStatus(): IPCChannelStatus {
    return this.status;
  }

  /**
   * 设置通道状态
   */
  private setStatus(status: IPCChannelStatus): void {
    this.status = status;
    this.log(`Status changed to: ${status}`);
  }

  /**
   * 通道是否已连接
   */
  isConnected(): boolean {
    return this.status === 'connected';
  }

  // ---------------------------------------------------------------------------
  // 连接管理
  // ---------------------------------------------------------------------------

  /**
   * 连接到通道
   *
   * 设置消息处理器，开始接收消息。
   */
  connect(): void {
    if (this.disposed) {
      throw new Error('Cannot connect a disposed channel');
    }
    this.setStatus('connected');
  }

  /**
   * 断开连接
   *
   * 清除所有待处理的请求，但不断开底层连接。
   */
  disconnect(): void {
    this.setStatus('disconnected');
    // 拒绝所有待处理的请求
    for (const [requestId, request] of this.pendingRequests) {
      clearTimeout(request.timeoutTimer);
      request.reject(new Error('Channel disconnected'));
      this.pendingRequests.delete(requestId);
    }
  }

  // ---------------------------------------------------------------------------
  // 消息处理
  // ---------------------------------------------------------------------------

  /**
   * 设置消息处理器
   *
   * @param handler 处理接收到的消息的回调
   */
  setMessageHandler(handler: (message: IPCMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * 处理接收到的消息
   *
   * @param message 接收到的 IPC 消息
   */
  handleMessage(message: IPCMessage): void {
    if (this.disposed) {
      this.log('Ignoring message on disposed channel');
      return;
    }

    this.log(`Received message: ${message.type} (${message.id})`);

    // 调用消息处理器（如果有）
    if (this.messageHandler) {
      try {
        this.messageHandler(message);
      } catch (error) {
        this.log(`Message handler error: ${error}`);
      }
    }

    switch (message.type) {
      case 'response':
        this.handleResponse(message as IPCResponse);
        break;
      case 'event':
        this.handleEvent(message as IPCEvent);
        break;
      case 'request':
        // 主机模式下才会收到请求，这里暂不处理
        this.log('Received request (not implemented in host mode)');
        break;
    }
  }

  /**
   * 处理响应消息
   */
  private handleResponse(response: IPCResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      this.log(`No pending request for response: ${response.requestId}`);
      return;
    }

    // 清理 timer
    clearTimeout(pending.timeoutTimer);
    this.pendingRequests.delete(response.requestId);

    // 根据 success 字段 resolve 或 reject
    if (response.success) {
      pending.resolve(response);
    } else {
      pending.reject(new Error(response.error?.message ?? 'Request failed'));
    }
  }

  /**
   * 处理事件消息
   */
  private handleEvent(event: IPCEvent): void {
    const subscribers = this.eventSubscribers.get(event.event);
    if (!subscribers || subscribers.length === 0) {
      return;
    }

    // 通知所有订阅者
    for (const subscriber of subscribers) {
      try {
        subscriber.handler(event);
      } catch (error) {
        this.log(`Event handler error: ${error}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 消息发送
  // ---------------------------------------------------------------------------

  /**
   * 发送消息（底层方法）
   *
   * 子类需要实现具体的发送逻辑。
   * @param message 要发送的消息
   */
  send(message: IPCMessage): void {
    if (this.disposed) {
      throw new Error('Cannot send on disposed channel');
    }
    if (!this.isConnected()) {
      throw new Error('Channel is not connected');
    }
    this.log(`Sending message: ${message.type} (${message.id})`);
    // 子类实现实际发送逻辑
    this.doSend(message);
  }

  /**
   * 执行实际的消息发送
   *
   * 子类可以覆盖此方法实现具体的发送逻辑。
   * 默认实现为空操作（用于测试场景）。
   */
  protected doSend(_message: IPCMessage): void {
    // 默认实现为空操作，子类可覆盖
    this.log('doSend not implemented - message not sent');
  }

  /**
   * 发送请求并等待响应（请求-响应模式）
   *
   * @param method 要调用的方法名
   * @param args 方法参数
   * @returns 响应结果
   */
  async sendRequest(method: string, args: unknown[] = []): Promise<IPCResponse> {
    if (!this.isConnected()) {
      throw new Error('Channel is not connected');
    }

    const requestId = randomUUID();
    const request: IPCRequest = {
      id: requestId,
      type: 'request',
      direction: 'toSandbox',
      timestamp: Date.now(),
      method,
      args,
    };

    this.log(`Sending request: ${method} (${requestId})`);

    // 创建 Promise 和 timer（遵循 A1 败者清理）
    let timeoutTimer: ReturnType<typeof setTimeout>;
    const response = await new Promise<IPCResponse>((resolve, reject) => {
      // 设置超时
      timeoutTimer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${this.config.requestTimeoutMs}ms`));
      }, this.config.requestTimeoutMs);

      // 注册待处理请求
      this.pendingRequests.set(requestId, {
        requestId,
        timestamp: Date.now(),
        resolve,
        reject,
        timeoutTimer,
      });

      // 发送请求
      this.send(request);
    });

    return response;
  }

  /**
   * 发送响应
   *
   * @param requestId 对应的请求 ID
   * @param success 是否成功
   * @param result 返回结果（成功时）
   * @param error 错误信息（失败时）
   */
  sendResponse(
    requestId: string,
    success: boolean,
    result?: unknown,
    error?: { code: string; message: string; details?: unknown }
  ): void {
    const response: IPCResponse = {
      id: randomUUID(),
      type: 'response',
      direction: 'toHost',
      timestamp: Date.now(),
      requestId,
      success,
      result,
      error,
    };

    this.send(response);
  }

  /**
   * 发送事件
   *
   * @param event 事件名称
   * @param payload 事件数据
   */
  sendEvent(event: string, payload?: unknown): void {
    // 触发本地订阅者
    const subscribers = this.eventSubscribers.get(event);
    if (subscribers && subscribers.length > 0) {
      const ipcEvent: IPCEvent = {
        id: randomUUID(),
        type: 'event',
        direction: 'toHost',
        timestamp: Date.now(),
        event,
        payload,
      };

      // 通知所有订阅者
      for (const subscriber of subscribers) {
        try {
          subscriber.handler(ipcEvent);
        } catch (error) {
          this.log(`Event handler error: ${error}`);
        }
      }
    }

    // 发送到远程（如果已连接）
    if (this.isConnected() && !this.disposed) {
      const ipcEvent: IPCEvent = {
        id: randomUUID(),
        type: 'event',
        direction: 'toHost',
        timestamp: Date.now(),
        event,
        payload,
      };
      this.send(ipcEvent);
    }
  }

  // ---------------------------------------------------------------------------
  // 事件订阅
  // ---------------------------------------------------------------------------

  /**
   * 订阅事件
   *
   * @param event 事件名称
   * @param handler 事件处理器
   * @returns 取消订阅的函数
   */
  subscribe(event: string, handler: (event: IPCEvent) => void): () => void {
    const subscriber: EventSubscriber = {
      id: randomUUID(),
      handler,
    };

    let subscribers = this.eventSubscribers.get(event);
    if (!subscribers) {
      subscribers = [];
      this.eventSubscribers.set(event, subscribers);
    }
    subscribers.push(subscriber);

    this.log(`Subscribed to event: ${event}`);

    // 返回取消订阅的函数
    return () => {
      const idx = subscribers!.indexOf(subscriber);
      if (idx >= 0) {
        subscribers!.splice(idx, 1);
        this.log(`Unsubscribed from event: ${event}`);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 资源清理
  // ---------------------------------------------------------------------------

  /**
   * 释放通道资源
   *
   * 遵循 A4 所有者原则：创建者负责清理。
   * 遵循 A1 败者清理：清理所有待处理的请求。
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.log('Disposing channel');

    // 清理所有待处理的请求
    for (const [requestId, request] of this.pendingRequests) {
      clearTimeout(request.timeoutTimer);
      request.reject(new Error('Channel disposed'));
    }
    this.pendingRequests.clear();

    // 清理所有事件订阅
    this.eventSubscribers.clear();

    // 断开连接
    this.disconnect();

    this.setStatus('disconnected');
  }

  // ---------------------------------------------------------------------------
  // 工具方法
  // ---------------------------------------------------------------------------

  /**
   * 获取待处理请求数量
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * 获取事件订阅者数量
   */
  getSubscriberCount(event?: string): number {
    if (event) {
      return this.eventSubscribers.get(event)?.length ?? 0;
    }
    let total = 0;
    for (const subscribers of this.eventSubscribers.values()) {
      total += subscribers.length;
    }
    return total;
  }

  /**
   * 内部日志
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[IPCChannel:${this.id.slice(0, 8)}] ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/**
 * 判断 obj 是否是非空、非数组的普通对象
 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/**
 * 判断 v 是否是正整数
 */
function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && Number.isInteger(v);
}

/**
 * 校验 x 是否是合法的 IPCChannelConfig
 */
export function isIPCChannelConfig(x: unknown): x is IPCChannelConfig {
  if (!isPlainObject(x)) return false;

  const c = x as Record<string, unknown>;
  if (c['requestTimeoutMs'] !== undefined && !isPositiveInt(c['requestTimeoutMs'])) {
    return false;
  }
  if (c['enableLogging'] !== undefined && typeof c['enableLogging'] !== 'boolean') {
    return false;
  }

  return true;
}