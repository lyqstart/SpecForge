/**
 * IPC 路由实现（任务 9.2.2 核心交付物）
 *
 * 实现主机端的 IPC 路由功能：
 *   - 消息路由（根据 direction 转发）
 *   - 通道管理
 *   - 请求-响应模式
 *   - 事件转发
 *
 * 本模块为 P2（V6.x）预备，是沙箱与主机通信的核心组件。
 * 字段约定遵循：
 *   - REQ-18 持久化字段规范
 *   - design.md 中 §「PluginSandbox (P2)」对 IPC 通信的要求
 *   - async-resource-lifecycle 经验（A1 败者清理、A2 终止可达性、A4 所有者原则）
 */

import { randomUUID } from 'crypto';
import * as readline from 'readline';
import * as stream from 'stream';
import type { ChildProcess } from 'child_process';
import { IPCChannel, type IPCChannelConfig, type IPCChannelStatus } from './ipc-channel';
import type { IPCMessage, IPCRequest, IPCResponse, IPCEvent } from './index';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 默认通道配置 */
const DEFAULT_CHANNEL_CONFIG: Required<IPCChannelConfig> = {
  requestTimeoutMs: 30000,
  enableLogging: false,
};

/** IPC 路由状态 */
export type IPRouterStatus = 'created' | 'running' | 'stopped' | 'error';

/** 所有合法路由状态的常量集合 */
export const IP_ROUTER_STATUSES: ReadonlySet<IPRouterStatus> = new Set<IPRouterStatus>([
  'created',
  'running',
  'stopped',
  'error',
]);

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * IPC 路由配置
 *
 * 字段：
 *   - enableLogging: 是否启用日志，默认 false
 *   - maxChannels: 最大通道数，默认 10
 *   - channelConfig: 通道默认配置
 */
export interface IPRouterConfig {
  /** 是否启用日志，默认 false */
  enableLogging?: boolean;
  /** 最大通道数，默认 10 */
  maxChannels?: number;
  /** 通道默认配置 */
  channelConfig?: IPCChannelConfig;
}

/**
 * 通道信息
 */
interface ChannelInfo {
  /** IPC 通道实例 */
  channel: IPCChannel;
  /** 关联的子进程 */
  childProcess: ChildProcess | null;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 消息处理器
 */
type MessageHandler = (message: IPCMessage, channelId: string) => void;

/**
 * 事件处理器
 */
type EventHandler = (event: IPCEvent, channelId: string) => void;

// ---------------------------------------------------------------------------
// IPC 路由类
// ---------------------------------------------------------------------------

/**
 * IPC 路由
 *
 * 负责管理多个 IPC 通道，实现消息路由和进程间通信。
 * 支持：
 *   - 动态创建/销毁通道
 *   - 消息路由（toSandbox / toHost）
 *   - 请求-响应模式
 *   - 事件广播
 *
 * 遵循 async-resource-lifecycle 经验：
 *   - A1 败者清理：Promise.race 的 timer 必须在 finally 中清理
 *   - A2 终止可达性：终止条件必须在 finally 中可达
 *   - A4 所有者原则：创建者负责清理
 */
export class IPRouter {
  /** 路由唯一标识符 */
  public readonly id: string;

  /** 当前状态 */
  private status: IPRouterStatus = 'created';

  /** 路由配置 */
  private config: Required<IPRouterConfig>;

  /** 通道映射（channelId → ChannelInfo） */
  private channels = new Map<string, ChannelInfo>();

  /** 全局消息处理器 */
  private messageHandler: MessageHandler | null = null;

  /** 全局事件处理器 */
  private eventHandler: EventHandler | null = null;

  /** 路由是否已释放 */
  private disposed = false;

  /**
   * 创建 IPC 路由
   *
   * @param config 路由配置
   */
  constructor(config: IPRouterConfig = {}) {
    this.id = randomUUID();
    this.config = {
      enableLogging: config.enableLogging ?? false,
      maxChannels: config.maxChannels ?? 10,
      channelConfig: {
        requestTimeoutMs: config.channelConfig?.requestTimeoutMs ?? DEFAULT_CHANNEL_CONFIG.requestTimeoutMs,
        enableLogging: config.channelConfig?.enableLogging ?? DEFAULT_CHANNEL_CONFIG.enableLogging,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 状态管理
  // ---------------------------------------------------------------------------

  /**
   * 获取路由状态
   */
  getStatus(): IPRouterStatus {
    return this.status;
  }

  /**
   * 设置路由状态
   */
  private setStatus(status: IPRouterStatus): void {
    this.status = status;
    this.log(`Status changed to: ${status}`);
  }

  /**
   * 路由是否在运行
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  // ---------------------------------------------------------------------------
  // 通道管理
  // ---------------------------------------------------------------------------

  /**
   * 创建通道
   *
   * @param processId 关联的进程 ID
   * @param childProcess 子进程对象
   * @returns 创建的通道 ID
   */
  createChannel(processId: string, childProcess: ChildProcess): string {
    if (this.disposed) {
      throw new Error('Cannot create channel on disposed router');
    }

    if (this.channels.size >= this.config.maxChannels) {
      throw new Error(`Maximum channel limit reached: ${this.config.maxChannels}`);
    }

    // 创建 IPC 通道
    const channel = new IPCChannel(processId, this.config.channelConfig);

    // 设置消息处理器
    channel.setMessageHandler((message) => {
      this.handleChannelMessage(channel.id, message);
    });

    // 连接通道
    channel.connect();

    // 创建通道信息
    const channelInfo: ChannelInfo = {
      channel,
      childProcess,
      createdAt: Date.now(),
    };

    // 设置子进程 stdout 监听（接收来自沙箱的消息）
    this.setupProcessListener(channel.id, childProcess);

    // 注册通道
    this.channels.set(channel.id, channelInfo);

    this.log(`Channel created: ${channel.id} for process: ${processId}`);

    return channel.id;
  }

  /**
   * 设置子进程监听器
   */
  private setupProcessListener(channelId: string, childProcess: ChildProcess): void {
    if (!childProcess.stdout || childProcess.stdout.destroyed) {
      this.log(`No stdout for process, channel: ${channelId}`);
      return;
    }

    // 使用 readline 创建行读取器
    const rl = readline.createInterface({
      input: childProcess.stdout as readline.Reader,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      try {
        if (!line.trim()) return;
        const message = JSON.parse(line) as IPCMessage;
        const channelInfo = this.channels.get(channelId);
        if (channelInfo) {
          channelInfo.channel.handleMessage(message);
        }
      } catch (error) {
        this.log(`Failed to parse message: ${line.slice(0, 100)}`);
      }
    });

    // 处理 stderr（用于日志输出）
    if (childProcess.stderr && !childProcess.stderr.destroyed) {
      childProcess.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.log(`[Sandbox:${channelId.slice(0, 8)}] ${line}`);
          }
        }
      });
    }

    // 处理进程退出
    childProcess.on('exit', (code, signal) => {
      this.log(`Process exited with code: ${code}, signal: ${signal}`);
      this.closeChannel(channelId);
    });

    childProcess.on('error', (error) => {
      this.log(`Process error: ${error.message}`);
      const channelInfo = this.channels.get(channelId);
      if (channelInfo) {
        channelInfo.channel.dispose();
      }
    });
  }

  /**
   * 关闭通道
   *
   * @param channelId 通道 ID
   */
  closeChannel(channelId: string): void {
    const channelInfo = this.channels.get(channelId);
    if (!channelInfo) {
      return;
    }

    // 清理子进程监听器
    if (channelInfo.childProcess) {
      channelInfo.childProcess.removeAllListeners();
    }

    // 释放通道
    channelInfo.channel.dispose();

    // 移除通道
    this.channels.delete(channelId);

    this.log(`Channel closed: ${channelId}`);
  }

  /**
   * 获取通道
   *
   * @param channelId 通道 ID
   * @returns IPC 通道，如果不存在则返回 undefined
   */
  getChannel(channelId: string): IPCChannel | undefined {
    return this.channels.get(channelId)?.channel;
  }

  /**
   * 获取所有通道 ID
   */
  getChannelIds(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * 获取活跃通道数量
   */
  getActiveChannelCount(): number {
    let count = 0;
    for (const channelInfo of this.channels.values()) {
      if (channelInfo.channel.isConnected()) {
        count++;
      }
    }
    return count;
  }

  // ---------------------------------------------------------------------------
  // 消息处理
  // ---------------------------------------------------------------------------

  /**
   * 设置消息处理器
   *
   * @param handler 消息处理回调
   */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * 设置事件处理器
   *
   * @param handler 事件处理回调
   */
  setEventHandler(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  /**
   * 处理通道消息（内部方法）
   */
  private handleChannelMessage(channelId: string, message: IPCMessage): void {
    // 调用全局消息处理器
    if (this.messageHandler) {
      try {
        this.messageHandler(message, channelId);
      } catch (error) {
        this.log(`Message handler error: ${error}`);
      }
    }

    // 如果是事件，调用事件处理器
    if (message.type === 'event' && this.eventHandler) {
      try {
        this.eventHandler(message as IPCEvent, channelId);
      } catch (error) {
        this.log(`Event handler error: ${error}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 消息发送
  // ---------------------------------------------------------------------------

  /**
   * 发送消息到指定通道
   *
   * @param channelId 通道 ID
   * @param message 要发送的消息
   */
  send(channelId: string, message: IPCMessage): void {
    const channelInfo = this.channels.get(channelId);
    if (!channelInfo) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    if (!channelInfo.channel.isConnected()) {
      throw new Error(`Channel is not connected: ${channelId}`);
    }

    // 序列化并发送到子进程 stdin
    this.sendToProcess(channelInfo.childProcess, message);
  }

  /**
   * 发送消息到子进程
   */
  private sendToProcess(childProcess: ChildProcess | null, message: IPCMessage): void {
    if (!childProcess || !childProcess.stdin || childProcess.stdin.destroyed) {
      throw new Error('Process stdin not available');
    }

    const line = JSON.stringify(message) + '\n';
    childProcess.stdin.write(line);
  }

  /**
   * 发送请求到指定通道并等待响应
   *
   * @param channelId 通道 ID
   * @param method 方法名
   * @param args 参数
   * @returns 响应结果
   */
  async sendRequest(channelId: string, method: string, args: unknown[] = []): Promise<IPCResponse> {
    const channelInfo = this.channels.get(channelId);
    if (!channelInfo) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    // 创建请求消息
    const request: IPCRequest = {
      id: randomUUID(),
      type: 'request',
      direction: 'toSandbox',
      timestamp: Date.now(),
      method,
      args,
    };

    // 发送请求并获取响应
    const response = await channelInfo.channel.sendRequest(method, args);

    // 通过进程发送
    this.sendToProcess(channelInfo.childProcess, request);

    return response;
  }

  /**
   * 发送响应到指定通道
   *
   * @param channelId 通道 ID
   * @param requestId 请求 ID
   * @param success 是否成功
   * @param result 结果（成功时）
   * @param error 错误（失败时）
   */
  sendResponse(
    channelId: string,
    requestId: string,
    success: boolean,
    result?: unknown,
    error?: { code: string; message: string; details?: unknown }
  ): void {
    const channelInfo = this.channels.get(channelId);
    if (!channelInfo) {
      throw new Error(`Channel not found: ${channelId}`);
    }

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

    this.sendToProcess(channelInfo.childProcess, response);
  }

  /**
   * 发送事件到指定通道
   *
   * @param channelId 通道 ID
   * @param event 事件名称
   * @param payload 事件数据
   */
  sendEvent(channelId: string, event: string, payload?: unknown): void {
    const channelInfo = this.channels.get(channelId);
    if (!channelInfo) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    const ipcEvent: IPCEvent = {
      id: randomUUID(),
      type: 'event',
      direction: 'toHost',
      timestamp: Date.now(),
      event,
      payload,
    };

    this.sendToProcess(channelInfo.childProcess, ipcEvent);
  }

  // ---------------------------------------------------------------------------
  // 事件订阅
  // ---------------------------------------------------------------------------

  /**
   * 订阅通道事件
   *
   * @param channelId 通道 ID
   * @param event 事件名称
   * @param handler 事件处理回调
   * @returns 取消订阅的函数
   */
  subscribe(channelId: string, event: string, handler: (event: IPCEvent) => void): () => void {
    const channelInfo = this.channels.get(channelId);
    if (!channelInfo) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    return channelInfo.channel.subscribe(event, handler);
  }

  /**
   * 订阅所有通道的特定事件
   *
   * @param event 事件名称
   * @param handler 事件处理回调（接收事件和通道 ID）
   * @returns 取消订阅的函数
   */
  subscribeAll(event: string, handler: (event: IPCEvent, channelId: string) => void): () => void {
    const unsubscribers: (() => void)[] = [];

    for (const [channelId, channelInfo] of this.channels) {
      const unsub = channelInfo.channel.subscribe(event, (e) => handler(e, channelId));
      unsubscribers.push(unsub);
    }

    // 返回批量取消订阅函数
    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 生命周期管理
  // ---------------------------------------------------------------------------

  /**
   * 启动路由
   */
  start(): void {
    if (this.disposed) {
      throw new Error('Cannot start disposed router');
    }
    this.setStatus('running');
    this.log('Router started');
  }

  /**
   * 停止路由
   */
  stop(): void {
    this.setStatus('stopped');
    this.log('Router stopped');
  }

  // ---------------------------------------------------------------------------
  // 资源清理
  // ---------------------------------------------------------------------------

  /**
   * 释放路由资源
   *
   * 遵循 A4 所有者原则：创建者负责清理。
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.log('Disposing router');

    // 关闭所有通道
    for (const channelId of Array.from(this.channels.keys())) {
      this.closeChannel(channelId);
    }

    // 清除处理器
    this.messageHandler = null;
    this.eventHandler = null;

    this.setStatus('stopped');
  }

  // ---------------------------------------------------------------------------
  // 工具方法
  // ---------------------------------------------------------------------------

  /**
   * 获取通道统计信息
   */
  getStats(): {
    total: number;
    connected: number;
    disconnected: number;
  } {
    let connected = 0;
    let disconnected = 0;

    for (const channelInfo of this.channels.values()) {
      if (channelInfo.channel.isConnected()) {
        connected++;
      } else {
        disconnected++;
      }
    }

    return {
      total: this.channels.size,
      connected,
      disconnected,
    };
  }

  /**
   * 内部日志
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[IPRouter:${this.id.slice(0, 8)}] ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 单例导出
// ---------------------------------------------------------------------------

/** 全局 IPC 路由实例 */
export const ipcRouter = new IPRouter();

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
 * 校验 x 是否是合法的 IPRouterConfig
 */
export function isIPRouterConfig(x: unknown): x is IPRouterConfig {
  if (!isPlainObject(x)) return false;

  const c = x as Record<string, unknown>;
  if (c['enableLogging'] !== undefined && typeof c['enableLogging'] !== 'boolean') {
    return false;
  }
  if (c['maxChannels'] !== undefined && !isPositiveInt(c['maxChannels'])) {
    return false;
  }
  if (c['channelConfig'] !== undefined && !isPlainObject(c['channelConfig'])) {
    return false;
  }

  return true;
}