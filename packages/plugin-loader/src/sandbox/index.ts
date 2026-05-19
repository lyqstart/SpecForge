/**
 * Sandbox 接口定义（任务 9.1.1 核心交付物）
 *
 * 定义运行时沙箱接口，规定插件运行时的隔离边界、资源限制和通信协议。
 * 本模块为 P2（V6.x）预备，不影响 P0 加载流程。
 *
 * 字段约定遵循：
 *   - REQ-18 持久化字段规范（必带 schema_version）
 *   - design.md 中 §「PluginSandbox (P2)」对隔离策略的要求
 *   - 与现有事件模型（types/events.ts）保持一致的 JSDoc 风格
 */

import type { PluginManifest } from '../manifest';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** schema_version 默认值 */
export const SANDBOX_SCHEMA_VERSION = '1.0' as const;

/** 沙箱状态枚举 */
export type SandboxStatus = 'created' | 'running' | 'terminated' | 'error';

/** 所有合法沙箱状态的常量集合 */
export const SANDBOX_STATUSES: ReadonlySet<SandboxStatus> = new Set<SandboxStatus>([
  'created',
  'running',
  'terminated',
  'error',
]);

// ---------------------------------------------------------------------------
// 资源限制配置
// ---------------------------------------------------------------------------

/**
 * 沙箱资源限制配置
 *
 * 字段：
 *   - memoryLimitMB: 内存上限（MB），默认 512MB
 *   - cpuTimeLimitSec: CPU 时间配额（秒），默认 30s
 *   - timeoutMs: 执行超时（毫秒），默认 60000ms（1分钟）
 *   - maxFileDescriptors: 最大文件描述符数量，默认 100
 *   - maxChildProcesses: 最大子进程数量，默认 0（禁止 fork）
 */
export interface ResourceLimits {
  /** 内存上限（MB），默认 512MB */
  memoryLimitMB?: number;
  /** CPU 时间配额（秒），默认 30s */
  cpuTimeLimitSec?: number;
  /** 执行超时（毫秒），默认 60000ms（1分钟） */
  timeoutMs?: number;
  /** 最大文件描述符数量，默认 100 */
  maxFileDescriptors?: number;
  /** 最大子进程数量，默认 0（禁止 fork） */
  maxChildProcesses?: number;
}

/** 资源限制的默认值 */
export const DEFAULT_RESOURCE_LIMITS: Required<ResourceLimits> = {
  memoryLimitMB: 512,
  cpuTimeLimitSec: 30,
  timeoutMs: 60000,
  maxFileDescriptors: 100,
  maxChildProcesses: 0,
};

// ---------------------------------------------------------------------------
// 文件系统白名单
// ---------------------------------------------------------------------------

/**
 * 文件系统访问规则
 *
 * 字段：
 *   - path: 允许访问的路径（可以是目录或文件）
 *   - mode: 访问模式，"read" | "write" | "read-write"
 */
export interface FSRule {
  /** 允许访问的路径 */
  path: string;
  /** 访问模式 */
  mode: 'read' | 'write' | 'read-write';
}

/**
 * 文件系统白名单配置
 *
 * 字段：
 *   - rules: 访问规则列表
 *   - allowTempDir: 是否允许临时目录，默认 true
 *   - allowNetworkConfig: 是否允许访问网络配置文件，默认 false
 */
export interface FSWhitelist {
  /** 访问规则列表 */
  rules: FSRule[];
  /** 是否允许临时目录，默认 true */
  allowTempDir?: boolean;
  /** 是否允许访问网络配置文件，默认 false */
  allowNetworkConfig?: boolean;
}

/**
 * 生成默认文件系统白名单（插件目录 + 临时目录）
 *
 * @param pluginDir 插件根目录
 * @returns 默认白名单配置
 */
export function createDefaultFSWhitelist(pluginDir: string): FSWhitelist {
  return {
    rules: [
      { path: pluginDir, mode: 'read-write' },
      { path: process.env['TEMP'] || '/tmp', mode: 'read-write' },
    ],
    allowTempDir: true,
    allowNetworkConfig: false,
  };
}

// ---------------------------------------------------------------------------
// 网络白名单
// ---------------------------------------------------------------------------

/**
 * 网络访问规则
 *
 * 字段：
 *   - host: 允许的域名或 IP（支持通配符 *）
 *   - port: 允许的端口号，-1 表示所有端口
 *   - protocol: 协议，"http" | "https" | "ws" | "wss" | "*"
 */
export interface NetworkRule {
  /** 允许的域名或 IP（支持通配符 *） */
  host: string;
  /** 允许的端口号，-1 表示所有端口 */
  port: number;
  /** 协议 */
  protocol: 'http' | 'https' | 'ws' | 'wss' | '*';
}

/**
 * 网络白名单配置
 *
 * 字段：
 *   - enabled: 是否启用网络限制，默认 false（除非插件声明了 network 权限）
 *   - rules: 访问规则列表
 *   - dnsHosts: 允许解析的 DNS 域名列表
 */
export interface NetworkWhitelist {
  /** 是否启用网络限制 */
  enabled?: boolean;
  /** 访问规则列表 */
  rules: NetworkRule[];
  /** 允许解析的 DNS 域名列表 */
  dnsHosts?: string[];
}

/**
 * 生成默认网络白名单（仅允许本地连接）
 */
export function createDefaultNetworkWhitelist(): NetworkWhitelist {
  return {
    enabled: false,
    rules: [
      { host: 'localhost', port: -1, protocol: '*' },
      { host: '127.0.0.1', port: -1, protocol: '*' },
    ],
    dnsHosts: [],
  };
}

// ---------------------------------------------------------------------------
// 沙箱选项
// ---------------------------------------------------------------------------

/**
 * 沙箱创建选项
 *
 * 字段：
 *   - plugin: 插件清单信息
 *   - pluginDir: 插件根目录（用于白名单生成）
 *   - resourceLimits: 资源限制配置
 *   - fsWhitelist: 文件系统白名单（可选，自动从 pluginDir 生成默认值）
 *   - networkWhitelist: 网络白名单（可选，默认仅本地）
 *   - envWhitelist: 环境变量白名单
 *   - enableLogging: 是否启用沙箱日志，默认 true
 */
export interface SandboxOptions {
  /** 插件清单信息 */
  plugin: Pick<PluginManifest, 'id' | 'version' | 'permissions'>;
  /** 插件根目录（用于白名单生成） */
  pluginDir: string;
  /** 资源限制配置 */
  resourceLimits?: ResourceLimits;
  /** 文件系统白名单（可选，自动从 pluginDir 生成默认值） */
  fsWhitelist?: FSWhitelist;
  /** 网络白名单（可选，默认仅本地） */
  networkWhitelist?: NetworkWhitelist;
  /** 环境变量白名单（默认仅 PATH 和 NODE_ENV） */
  envWhitelist?: string[];
  /** 是否启用沙箱日志，默认 true */
  enableLogging?: boolean;
  /** 自定义工作目录（默认使用 pluginDir） */
  workingDir?: string;
}

// ---------------------------------------------------------------------------
// 沙箱句柄
// ---------------------------------------------------------------------------

/**
 * 沙箱句柄（与已创建的沙箱实例交互的接口）
 *
 * 字段：
 *   - id: 沙箱唯一标识符
 *   - pluginId: 关联的插件 ID
 *   - status: 当前状态
 *   - createdAt: 创建时间（Unix 毫秒）
 *   - startedAt: 开始执行时间（Unix 毫秒，可选）
 */
export interface SandboxHandle {
  /** 沙箱唯一标识符（UUID） */
  id: string;
  /** 关联的插件 ID */
  pluginId: string;
  /** 当前状态 */
  status: SandboxStatus;
  /** 创建时间（Unix 毫秒） */
  createdAt: number;
  /** 开始执行时间（Unix 毫秒） */
  startedAt?: number;
}

// ---------------------------------------------------------------------------
// IPC 通信
// ---------------------------------------------------------------------------

/**
 * IPC 消息类型
 *
 * - request: 从主机发往沙箱的请求
 * - response: 从沙箱发往主机的响应
 * - event: 从沙箱发往主机的事件
 */
export type IPCMessageType = 'request' | 'response' | 'event';

/**
 * IPC 消息方向
 *
 * - toSandbox: 主机 → 沙箱
 * - toHost: 沙箱 → 主机
 */
export type IPCDirection = 'toSandbox' | 'toHost';

/**
 * IPC 消息基接口
 *
 * 字段：
 *   - id: 消息唯一标识符
 *   - type: 消息类型
 *   - direction: 消息方向
 *   - timestamp: 时间戳（Unix 毫秒）
 */
export interface IPCMessageBase {
  /** 消息唯一标识符（UUID） */
  id: string;
  /** 消息类型 */
  type: IPCMessageType;
  /** 消息方向 */
  direction: IPCDirection;
  /** 时间戳（Unix 毫秒） */
  timestamp: number;
}

/**
 * IPC 请求消息（主机 → 沙箱）
 *
 * 字段：
 *   - method: 要调用的方法名
 *   - args: 方法参数
 */
export interface IPCRequest extends IPCMessageBase {
  type: 'request';
  direction: 'toSandbox';
  /** 要调用的方法名 */
  method: string;
  /** 方法参数（JSON 序列化） */
  args: unknown[];
}

/**
 * IPC 响应消息（沙箱 → 主机）
 *
 * 字段：
 *   - requestId: 对应的请求 ID
 *   - success: 是否成功
 *   - result: 返回结果（成功时）
 *   - error: 错误信息（失败时）
 */
export interface IPCResponse extends IPCMessageBase {
  type: 'response';
  direction: 'toHost';
  /** 对应的请求 ID */
  requestId: string;
  /** 是否成功 */
  success: boolean;
  /** 返回结果（成功时） */
  result?: unknown;
  /** 错误信息（失败时） */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * IPC 事件消息（沙箱 → 主机）
 *
 * 字段：
 *   - event: 事件名称
 *   - payload: 事件数据
 */
export interface IPCEvent extends IPCMessageBase {
  type: 'event';
  direction: 'toHost';
  /** 事件名称 */
  event: string;
  /** 事件数据 */
  payload?: unknown;
}

/** IPC 消息的联合类型 */
export type IPCMessage = IPCRequest | IPCResponse | IPCEvent;

// ---------------------------------------------------------------------------
// 执行结果
// ---------------------------------------------------------------------------

/**
 * 沙箱执行结果
 *
 * 字段：
 *   - success: 是否成功
 *   - result: 返回结果（成功时）
 *   - error: 错误信息（失败时）
 *   - executionTimeMs: 执行耗时（毫秒）
 *   - resourceUsage: 资源使用情况
 */
export interface SandboxExecuteResult {
  /** 是否成功 */
  success: boolean;
  /** 返回结果（成功时） */
  result?: unknown;
  /** 错误信息（失败时） */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** 执行耗时（毫秒） */
  executionTimeMs?: number;
  /** 资源使用情况 */
  resourceUsage?: ResourceUsage;
}

/**
 * 资源使用情况
 *
 * 字段：
 *   - memoryUsedMB: 使用的内存（MB）
 *   - cpuTimeSec: 使用的 CPU 时间（秒）
 *   - durationMs: 实际执行时长（毫秒）
 */
export interface ResourceUsage {
  /** 使用的内存（MB） */
  memoryUsedMB?: number;
  /** 使用的 CPU 时间（秒） */
  cpuTimeSec?: number;
  /** 实际执行时长（毫秒） */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// 沙箱接口
// ---------------------------------------------------------------------------

/**
 * 沙箱接口（PluginSandbox）
 *
 * 定义插件运行时沙箱的创建、执行、销毁生命周期管理。
 * P0 阶段不启用，所有插件直接加载到 Daemon 进程（信任模式）。
 * P2 阶段启用，提供进程隔离与资源限制。
 *
 * 核心方法：
 *   - createSandbox: 创建沙箱实例
 *   - execute: 在沙箱中执行插件代码
 *   - destroySandbox: 销毁沙箱实例
 *   - getStatus: 获取沙箱状态
 *   - setResourceLimits: 动态调整资源限制
 */
export interface ISandbox {
  /**
   * 创建沙箱实例
   *
   * @param options 沙箱选项
   * @returns 沙箱句柄
   * @throws Error 创建失败时抛出
   */
  createSandbox(options: SandboxOptions): Promise<SandboxHandle>;

  /**
   * 在沙箱中执行插件代码
   *
   * @param handle 沙箱句柄
   * @param method 要调用的方法名
   * @param args 方法参数
   * @returns 执行结果
   */
  execute(
    handle: SandboxHandle,
    method: string,
    args?: unknown[]
  ): Promise<SandboxExecuteResult>;

  /**
   * 销毁沙箱实例
   *
   * @param handle 沙箱句柄
   * @returns 销毁完成
   */
  destroySandbox(handle: SandboxHandle): Promise<void>;

  /**
   * 获取沙箱状态
   *
   * @param handle 沙箱句柄
   * @returns 当前状态
   */
  getStatus(handle: SandboxHandle): SandboxStatus;

  /**
   * 动态调整资源限制
   *
   * @param handle 沙箱句柄
   * @param limits 新的资源限制
   */
  setResourceLimits(handle: SandboxHandle, limits: ResourceLimits): Promise<void>;

  /**
   * 获取沙箱资源使用情况
   *
   * @param handle 沙箱句柄
   * @returns 资源使用情况
   */
  getResourceUsage(handle: SandboxHandle): Promise<ResourceUsage>;
}

// ---------------------------------------------------------------------------
// 进程管理器导出（任务 9.2.1）
// ---------------------------------------------------------------------------

export {
  ProcessManager,
  processManager,
  type ProcessStatus,
  type ManagedProcess,
  type ProcessCreateOptions,
  type GracefulTerminateOptions,
  type ProcessExecuteResult,
  PROCESS_STATUSES,
  isProcessCreateOptions,
  isGracefulTerminateOptions,
  isManagedProcess,
} from './process-manager';

// ---------------------------------------------------------------------------
// IPC 通信导出（任务 9.2.2）
// ---------------------------------------------------------------------------

export {
  IPCChannel,
  type IPCChannelConfig,
  type IPCChannelStatus,
  IPC_CHANNEL_STATUSES,
  isIPCChannelConfig,
} from './ipc-channel';

export {
  IPRouter,
  ipcRouter,
  type IPRouterConfig,
  type IPRouterStatus,
  IP_ROUTER_STATUSES,
  isIPRouterConfig,
} from './ipc-router';

// ---------------------------------------------------------------------------
// 资源监控导出（任务 9.2.3）
// ---------------------------------------------------------------------------

export {
  ResourceMonitor,
  type ResourceMonitorSnapshot,
  type ResourceMonitorOptions,
  type ResourceMonitorStatus,
  type ResourceType,
  type MemoryUsage,
  type CPUUsage,
  type FileDescriptorUsage,
  type ChildProcessUsage,
  type ResourceLimitCheckResult,
  RESOURCE_MONITOR_SCHEMA_VERSION,
  RESOURCE_SCHEMA_VERSION,
  RESOURCE_MONITOR_STATUSES,
  isResourceMonitorOptions,
  isMemoryUsage,
  isCPUUsage,
  isResourceMonitorSnapshot,
} from './resource-monitor';

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/** 判断 obj 是否是非空、非数组的普通对象 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/** 判断 v 是否是非负整数 */
function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v);
}

/**
 * 校验 x 是否是合法的 ResourceLimits
 */
export function isResourceLimits(x: unknown): x is ResourceLimits {
  if (!isPlainObject(x)) return false;

  const r = x as Record<string, unknown>;
  if (r['memoryLimitMB'] !== undefined && !isNonNegativeInt(r['memoryLimitMB'])) return false;
  if (r['cpuTimeLimitSec'] !== undefined && !isNonNegativeInt(r['cpuTimeLimitSec'])) return false;
  if (r['timeoutMs'] !== undefined && !isNonNegativeInt(r['timeoutMs'])) return false;
  if (r['maxFileDescriptors'] !== undefined && !isNonNegativeInt(r['maxFileDescriptors'])) {
    return false;
  }
  if (r['maxChildProcesses'] !== undefined && !isNonNegativeInt(r['maxChildProcesses'])) {
    return false;
  }

  return true;
}

/**
 * 校验 x 是否是合法的 FSRule
 */
export function isFSRule(x: unknown): x is FSRule {
  if (!isPlainObject(x)) return false;

  const r = x as Record<string, unknown>;
  if (typeof r['path'] !== 'string' || r['path'].length === 0) return false;
  if (!['read', 'write', 'read-write'].includes(r['mode'])) return false;

  return true;
}

/**
 * 校验 x 是否是合法的 FSWhitelist
 */
export function isFSWhitelist(x: unknown): x is FSWhitelist {
  if (!isPlainObject(x)) return false;

  const w = x as Record<string, unknown>;
  if (!Array.isArray(w['rules'])) return false;
  if (!w['rules'].every((r) => isFSRule(r))) return false;

  return true;
}

/**
 * 校验 x 是否是合法的 NetworkRule
 */
export function isNetworkRule(x: unknown): x is NetworkRule {
  if (!isPlainObject(x)) return false;

  const r = x as Record<string, unknown>;
  if (typeof r['host'] !== 'string' || r['host'].length === 0) return false;
  if (typeof r['port'] !== 'number' || !Number.isInteger(r['port'])) return false;
  if (!['http', 'https', 'ws', 'wss', '*'].includes(r['protocol'])) return false;

  return true;
}

/**
 * 校验 x 是否是合法的 NetworkWhitelist
 */
export function isNetworkWhitelist(x: unknown): x is NetworkWhitelist {
  if (!isPlainObject(x)) return false;

  const w = x as Record<string, unknown>;
  if (w['enabled'] !== undefined && typeof w['enabled'] !== 'boolean') return false;
  if (!Array.isArray(w['rules'])) return false;
  if (!w['rules'].every((r) => isNetworkRule(r))) return false;

  return true;
}

/**
 * 校验 x 是否是合法的 SandboxHandle
 */
export function isSandboxHandle(x: unknown): x is SandboxHandle {
  if (!isPlainObject(x)) return false;

  const h = x as Record<string, unknown>;
  if (typeof h['id'] !== 'string' || h['id'].length === 0) return false;
  if (typeof h['pluginId'] !== 'string' || h['pluginId'].length === 0) return false;
  if (!SANDBOX_STATUSES.has(h['status'] as SandboxStatus)) return false;
  if (!isNonNegativeInt(h['createdAt'])) return false;

  return true;
}

/**
 * 校验 x 是否是合法的 SandboxOptions
 */
export function isSandboxOptions(x: unknown): x is SandboxOptions {
  if (!isPlainObject(x)) return false;

  const o = x as Record<string, unknown>;
  if (!isPlainObject(o['plugin'])) return false;
  if (typeof o['pluginDir'] !== 'string' || o['pluginDir'].length === 0) return false;

  if (o['resourceLimits'] !== undefined && !isResourceLimits(o['resourceLimits'])) {
    return false;
  }
  if (o['fsWhitelist'] !== undefined && !isFSWhitelist(o['fsWhitelist'])) {
    return false;
  }
  if (o['networkWhitelist'] !== undefined && !isNetworkWhitelist(o['networkWhitelist'])) {
    return false;
  }

  return true;
}

/**
 * 校验 x 是否是合法的 SandboxExecuteResult
 */
export function isSandboxExecuteResult(x: unknown): x is SandboxExecuteResult {
  if (!isPlainObject(x)) return false;

  const r = x as Record<string, unknown>;
  if (typeof r['success'] !== 'boolean') return false;

  if (r['success']) {
    // 成功时 result 可选
  } else {
    // 失败时 error 必须存在且是对象
    if (!isPlainObject(r['error'])) return false;
  }

  return true;
}