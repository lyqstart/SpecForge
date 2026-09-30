# 资源限制接口设计文档

## 概述

本文档定义插件沙箱运行时资源限制的具体实现方案，基于已定义的 Sandbox 接口（`packages/plugin-loader/src/sandbox/index.ts`）进行细化设计。

## 1. 资源限制类型定义

### 1.1 内存限制

```typescript
interface MemoryLimit {
  /** 硬限制：超过后立即终止（MB） */
  hardLimitMB: number;
  /** 软限制：警告阈值（MB），可选 */
  softLimitMB?: number;
  /** 增长限制：单次分配最大内存（MB），防止一次性大分配 */
  allocationLimitMB?: number;
}

/**
 * 内存限制实现策略
 * 
 * Node.js/Bun 环境：
 * - 使用 v8isolate 或 Bun.maxMemory 配置
 * - 定期采样内存使用（采样间隔 100ms）
 * - 硬限制触发时发送 SIGKILL 终止子进程
 * 
 * 采样策略：
 * - 每 100ms 采样一次 RSS（Resident Set Size）
 * - 累积 3 次超阈值则触发软警告
 * - 单次超硬限制则立即终止
 */
```

### 1.2 CPU 时间限制

```typescript
interface CPULimit {
  /** 单次执行最大 CPU 时间（秒） */
  timeLimitSec: number;
  /** 总累计 CPU 时间限制（秒），防止无限循环 */
  totalTimeLimitSec?: number;
  /** CPU 使用百分比上限（1-100），默认 100 */
  cpuPercentLimit?: number;
}

/**
 * CPU 限制实现策略
 * 
 * 使用系统资源监控 API：
 * - Unix: getrusage() 系统调用
 * - Windows: GetProcessTimes() API
 * 
 * 监控频率：
 * - 每 50ms 检查一次 CPU 使用
 * - 累计超时后终止进程
 */
```

### 1.3 执行超时限制

```typescript
interface TimeoutLimit {
  /** 单次调用超时（毫秒） */
  callTimeoutMs: number;
  /** 空闲超时：插件无活动多少毫秒后自动终止 */
  idleTimeoutMs?: number;
  /** 总生命周期限制（毫秒），防止插件永久占用 */
  maxLifetimeMs?: number;
}

/**
 * 超时实现策略
 * 
 * - 使用 setTimeout + clearTimeout 管理
 * - 每次 execute() 调用创建新的定时器
 * - idleTimeout 通过活动检测（收到 IPC 消息视为活动）
 * - 使用 Promise.race 实现竞态超时（遵循 async-resource-lifecycle 规范）
 */
```

### 1.4 文件描述符限制

```typescript
interface FDLimit {
  /** 最大打开文件描述符数量 */
  maxFileDescriptors: number;
  /** 是否允许管道/套接字 */
  allowPipes?: boolean;
  /** 是否允许网络套接字 */
  allowSockets?: boolean;
}

/**
 * 文件描述符限制实现策略
 * 
 * - 使用 process.resourcesLimits（Node.js 20+）或 ulimit（Unix）
 * - 初始化时设置 RLIMIT_NOFILE
 * - 定期检查 process.openHandles().length
 * - 阻止超出限制的 open/fs.open 调用
 */
```

### 1.5 子进程限制

```typescript
interface ChildProcessLimit {
  /** 最大子进程数量，0 表示禁止 fork */
  maxChildProcesses: number;
  /** 是否允许 exec/spawn */
  allowExec?: boolean;
  /** 是否允许 fork */
  allowFork?: boolean;
  /** 允许的子进程命令白名单 */
  allowedCommands?: string[];
}

/**
 * 子进程限制实现策略
 * 
 * - 核心策略：默认禁止子进程（maxChildProcesses: 0）
 * - 若授权 child_process 权限，最多允许 1 个子进程
 * - 通过拦截 child_process 模块实现
 * - 记录所有子进程创建用于审计
 */
```

### 1.6 组合资源限制

```typescript
/**
 * 完整资源限制配置（整合所有类型）
 */
interface ResourceLimitsConfig {
  /** 内存限制 */
  memory: MemoryLimit;
  /** CPU 限制 */
  cpu: CPULimit;
  /** 超时限制 */
  timeout: TimeoutLimit;
  /** 文件描述符限制 */
  fileDescriptor: FDLimit;
  /** 子进程限制 */
  childProcess: ChildProcessLimit;
}

/** 资源限制默认值 */
export const DEFAULT_LIMITS: ResourceLimitsConfig = {
  memory: {
    hardLimitMB: 512,
    softLimitMB: 384,
    allocationLimitMB: 256,
  },
  cpu: {
    timeLimitSec: 30,
    totalTimeLimitSec: 300,
    cpuPercentLimit: 100,
  },
  timeout: {
    callTimeoutMs: 60000,
    idleTimeoutMs: 300000,  // 5分钟无活动自动终止
    maxLifetimeMs: 3600000, // 1小时总生命周期
  },
  fileDescriptor: {
    maxFileDescriptors: 100,
    allowPipes: true,
    allowSockets: true,
  },
  childProcess: {
    maxChildProcesses: 0,  // 默认禁止
    allowExec: false,
    allowFork: false,
  },
};
```

## 2. 资源监控器设计

### 2.1 监控器接口

```typescript
/**
 * 资源监控器接口
 * 
 * 负责持续监控资源使用情况，在接近或超过限制时采取行动
 */
interface IResourceMonitor {
  /** 开始监控 */
  start(handle: SandboxHandle): void;
  
  /** 停止监控 */
  stop(handleId: string): void;
  
  /** 获取当前资源使用情况 */
  getUsage(handleId: string): ResourceUsageSnapshot;
  
  /** 注册资源超限回调 */
  onLimitExceeded(callback: LimitExceededCallback): void;
  
  /** 注册资源警告回调 */
  onLimitWarning(callback: LimitWarningCallback): void;
}

interface ResourceUsageSnapshot {
  memoryUsedMB: number;
  cpuTimeSec: number;
  openFileDescriptors: number;
  childProcessCount: number;
  lastActivityAt: number;
}

type LimitExceededCallback = (handleId: string, limit: LimitType) => void;
type LimitWarningCallback = (handleId: string, limit: LimitType, current: number, threshold: number) => void;
type LimitType = 'memory' | 'cpu' | 'timeout' | 'fileDescriptor' | 'childProcess';
```

### 2.2 监控实现架构

```
┌─────────────────────────────────────────────────────────────┐
│                    SandboxManager                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Resource   │  │   IPC       │  │   Process           │ │
│  │  Monitor    │  │  Scheduler  │  │   Manager           │ │
│  │             │  │             │  │                     │ │
│  │ - Memory    │  │ - Timeout   │  │ - Spawn/Kill        │ │
│  │ - CPU       │  │ - Queue     │  │ - Lifecycle         │ │
│  │ - FD        │  │ - Priority  │  │ - Signals           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 3. 限制实施机制

### 3.1 内存限制实施

```typescript
/**
 * 内存限制实施策略
 * 
 * 1. 进程级限制（启动时设置）
 *    - Node.js: --max-old-space-size 参数
 *    - Bun: --max-memory 参数
 * 
 * 2. 运行时监控（定期采样）
 *    - 读取 process.memoryUsage().heapUsed
 *    - 或通过 childProcess.memoryUsage 获取子进程内存
 * 
 * 3. 超限处理
 *    - 软限制: 记录警告事件
 *    - 硬限制: 发送 SIGKILL 终止进程
 */
class MemoryLimiter {
  private readonly intervalMs = 100;  // 采样间隔
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  
  start(handle: SandboxHandle, limits: MemoryLimit): void {
    const timer = setInterval(() => {
      const usage = this.getMemoryUsage(handle);
      if (usage > limits.hardLimitMB) {
        this.triggerTermination(handle.id, 'memory', usage, limits.hardLimitMB);
      } else if (usage > (limits.softLimitMB ?? limits.hardLimitMB * 0.8)) {
        this.emitWarning(handle.id, 'memory', usage, limits.softLimitMB ?? limits.hardLimitMB * 0.8);
      }
    }, this.intervalMs);
    
    this.timers.set(handle.id, timer);
  }
  
  stop(handleId: string): void {
    const timer = this.timers.get(handleId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(handleId);
    }
  }
  
  private getMemoryUsage(handle: SandboxHandle): number {
    // 获取子进程内存使用
    // Windows: 使用 tasklist 或 wmic
    // Unix: 读取 /proc/<pid>/status VmRSS
    // 或通过 IPC 请求子进程报告
    return 0;  // TODO: 实现
  }
  
  private triggerTermination(handleId: string, type: LimitType, current: number, limit: number): void {
    // 发送 SIGKILL 终止子进程
    // 记录审计日志
    // 触发事件
  }
}
```

### 3.2 CPU 限制实施

```typescript
/**
 * CPU 限制实施策略
 * 
 * 1. 累计时间跟踪
 *    - 使用 process.cpuUsage() 累计 CPU 时间
 *    - 每次调用 execute() 时检查剩余配额
 * 
 * 2. 实时使用监控
 *    - 使用 getrusage() 获取当前 CPU 使用
 *    - 采样频率: 50ms
 * 
 * 3. 超限处理
 *    - 累计超限: 拒绝新的 execute() 调用
 *    - 单次超限: 终止当前执行
 */
class CPULimiter {
  private cpuUsage = new Map<string, number>();  // 累计 CPU 时间（微秒）
  
  // 获取当前 CPU 使用（微秒）
  private getCurrentCPU(handle: SandboxHandle): number {
    // Unix: getrusage(RUSAGE_SELF).ru_utime + ru_stime
    // Windows: GetProcessTimes
    return 0;  // TODO: 实现
  }
  
  // 扣除已使用的 CPU 时间
  deductTime(handleId: string, usedMicroseconds: number): void {
    const current = this.cpuUsage.get(handleId) ?? 0;
    this.cpuUsage.set(handleId, current + usedMicroseconds);
  }
  
  // 检查是否有足够 CPU 时间配额
  hasQuota(handleId: string, requiredMicroseconds: number): boolean {
    const used = this.cpuUsage.get(handleId) ?? 0;
    const limit = DEFAULT_LIMITS.cpu.totalTimeLimitSec * 1_000_000;
    return (used + requiredMicroseconds) <= limit;
  }
}
```

### 3.3 超时限制实施

```typescript
/**
 * 超时限制实施策略
 * 
 * 使用 Promise.race 实现超时（遵循 async-resource-lifecycle 规范）
 * - 确保败者的 timer 在 finally 中清理
 * - 提供清晰的错误信息
 */
class TimeoutLimiter {
  private activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  
  async executeWithTimeout<T>(
    handleId: string,
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new TimeoutError({
              operation: 'sandbox.execute',
              timeoutMs,
              suggestion: '插件执行超时，可能存在无限循环或性能问题',
            })),
            timeoutMs
          );
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  }
  
  // 空闲超时检测
  startIdleMonitor(handle: SandboxHandle, idleTimeoutMs: number): void {
    let lastActivity = Date.now();
    
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastActivity > idleTimeoutMs) {
        this.triggerTermination(handle.id, 'idle-timeout');
      }
    }, 5000);  // 每 5 秒检查一次
    
    this.activeTimers.set(handle.id, timer);
  }
  
  // 更新活动标记（收到 IPC 消息时调用）
  markActivity(handleId: string): void {
    // 更新最后活动时间
  }
}
```

### 3.4 文件描述符限制实施

```typescript
/**
 * 文件描述符限制实施策略
 * 
 * 1. 启动时设置 ulimit
 * 2. 运行时监控 openHandles
 * 3. 阻止超限的打开操作
 */
class FDLimiter {
  private openCount = new Map<string, number>();
  
  // 初始化时设置限制
  async setProcessLimit(limit: number): Promise<void> {
    // Unix: process.resourceLimits?.fd = limit
    // 或通过 spawn 选项设置
    process.resourceLimits ??= {};
    (process.resourceLimits as any).maxFileDescriptors = limit;
  }
  
  // 监控打开的文件描述符数量
  async getOpenCount(handleId: string): Promise<number> {
    // 使用 process.getOpenHandles() 或 lsof
    return 0;  // TODO: 实现
  }
  
  // 尝试打开文件前的检查
  async canOpen(handleId: string): Promise<boolean> {
    const count = await this.getOpenCount(handleId);
    const limit = DEFAULT_LIMITS.fileDescriptor.maxFileDescriptors;
    return count < limit;
  }
}
```

## 4. 配置与验证

### 4.1 资源限制配置 Schema

```typescript
/**
 * 资源限制配置 Schema（用于 JSON 验证）
 */
export const resourceLimitsSchema = {
  type: 'object',
  properties: {
    memory: {
      type: 'object',
      properties: {
        hardLimitMB: { type: 'number', minimum: 64, maximum: 16384 },
        softLimitMB: { type: 'number', minimum: 64 },
        allocationLimitMB: { type: 'number', minimum: 1 },
      },
      required: ['hardLimitMB'],
    },
    cpu: {
      type: 'object',
      properties: {
        timeLimitSec: { type: 'number', minimum: 1, maximum: 3600 },
        totalTimeLimitSec: { type: 'number', minimum: 1 },
        cpuPercentLimit: { type: 'number', minimum: 1, maximum: 100 },
      },
      required: ['timeLimitSec'],
    },
    timeout: {
      type: 'object',
      properties: {
        callTimeoutMs: { type: 'number', minimum: 1000 },
        idleTimeoutMs: { type: 'number', minimum: 60000 },
        maxLifetimeMs: { type: 'number', minimum: 60000 },
      },
      required: ['callTimeoutMs'],
    },
    fileDescriptor: {
      type: 'object',
      properties: {
        maxFileDescriptors: { type: 'number', minimum: 4, maximum: 10000 },
        allowPipes: { type: 'boolean' },
        allowSockets: { type: 'boolean' },
      },
      required: ['maxFileDescriptors'],
    },
    childProcess: {
      type: 'object',
      properties: {
        maxChildProcesses: { type: 'number', minimum: 0, maximum: 10 },
        allowExec: { type: 'boolean' },
        allowFork: { type: 'boolean' },
        allowedCommands: { type: 'array', items: { type: 'string' } },
      },
      required: ['maxChildProcesses'],
    },
  },
  required: ['memory', 'cpu', 'timeout', 'fileDescriptor', 'childProcess'],
} as const;
```

### 4.2 环境兼容性

| 限制类型 | Node.js | Bun | Windows |
|---------|---------|-----|---------|
| 内存限制 | --max-old-space-size | --max-memory | 不支持（需进程隔离） |
| CPU 限制 | getrusage() | 部分支持 | GetProcessTimes() |
| 超时限制 | setTimeout/Promise.race | setTimeout | setTimeout |
| FD 限制 | resourceLimits | ulimit | 不适用 |
| 子进程限制 | 拦截模块 | 拦截模块 | 拦截模块 |

## 5. 错误处理

### 5.1 资源超限错误

```typescript
/**
 * 资源超限错误
 */
class ResourceLimitError extends Error {
  constructor(
    public readonly limitType: LimitType,
    public readonly currentValue: number,
    public readonly limitValue: number,
    public readonly suggestion?: string
  ) {
    super(
      `Resource limit exceeded: ${limitType} ` +
      `(current: ${currentValue}, limit: ${limitValue})` +
      (suggestion ? `. ${suggestion}` : '')
    );
    this.name = 'ResourceLimitError';
  }
}
```

### 5.2 错误码定义

| 错误码 | 含义 | 处理策略 |
|--------|------|----------|
| MEMORY_EXCEEDED | 内存超限 | 立即终止插件 |
| CPU_TIME_EXCEEDED | CPU 时间超限 | 终止当前执行，拒绝新调用 |
| TIMEOUT_EXCEEDED | 执行超时 | 终止当前执行 |
| IDLE_TIMEOUT | 空闲超时 | 终止沙箱 |
| FD_EXCEEDED | 文件描述符超限 | 阻止新打开操作 |
| CHILD_PROCESS_FORBIDDEN | 禁止创建子进程 | 拒绝 exec/fork 调用 |

## 6. 与现有 Sandbox 接口的集成

### 6.1 接口适配

现有的 `ResourceLimits` 接口已经定义了基础字段，需要扩展为 `ResourceLimitsConfig`：

```typescript
// 现有接口（保持向后兼容）
interface ResourceLimits {
  memoryLimitMB?: number;
  cpuTimeLimitSec?: number;
  timeoutMs?: number;
  maxFileDescriptors?: number;
  maxChildProcesses?: number;
}

// 扩展为完整配置
interface ExtendedResourceLimits extends ResourceLimits {
  // 内存
  memorySoftLimitMB?: number;
  memoryAllocationLimitMB?: number;
  
  // CPU
  cpuTotalLimitSec?: number;
  cpuPercentLimit?: number;
  
  // 超时
  idleTimeoutMs?: number;
  maxLifetimeMs?: number;
  
  // FD
  allowPipes?: boolean;
  allowSockets?: boolean;
  
  // 子进程
  allowExec?: boolean;
  allowFork?: boolean;
  allowedCommands?: string[];
}
```

### 6.2 适配器实现

```typescript
/**
 * 将简化配置转换为完整配置
 */
export function normalizeResourceLimits(limits?: ResourceLimits): ResourceLimitsConfig {
  if (!limits) return DEFAULT_LIMITS;
  
  return {
    memory: {
      hardLimitMB: limits.memoryLimitMB ?? DEFAULT_LIMITS.memory.hardLimitMB,
      softLimitMB: (limits as ExtendedResourceLimits).memorySoftLimitMB 
        ?? Math.floor((limits.memoryLimitMB ?? DEFAULT_LIMITS.memory.hardLimitMB) * 0.8),
      allocationLimitMB: (limits as ExtendedResourceLimits).memoryAllocationLimitMB 
        ?? Math.floor((limits.memoryLimitMB ?? DEFAULT_LIMITS.memory.hardLimitMB) * 0.5),
    },
    cpu: {
      timeLimitSec: limits.cpuTimeLimitSec ?? DEFAULT_LIMITS.cpu.timeLimitSec,
      totalTimeLimitSec: (limits as ExtendedResourceLimits).cpuTotalLimitSec 
        ?? DEFAULT_LIMITS.cpu.totalTimeLimitSec,
      cpuPercentLimit: (limits as ExtendedResourceLimits).cpuPercentLimit 
        ?? DEFAULT_LIMITS.cpu.cpuPercentLimit,
    },
    timeout: {
      callTimeoutMs: limits.timeoutMs ?? DEFAULT_LIMITS.timeout.callTimeoutMs,
      idleTimeoutMs: (limits as ExtendedResourceLimits).idleTimeoutMs 
        ?? DEFAULT_LIMITS.timeout.idleTimeoutMs,
      maxLifetimeMs: (limits as ExtendedResourceLimits).maxLifetimeMs 
        ?? DEFAULT_LIMITS.timeout.maxLifetimeMs,
    },
    fileDescriptor: {
      maxFileDescriptors: limits.maxFileDescriptors ?? DEFAULT_LIMITS.fileDescriptor.maxFileDescriptors,
      allowPipes: (limits as ExtendedResourceLimits).allowPipes ?? true,
      allowSockets: (limits as ExtendedResourceLimits).allowSockets ?? true,
    },
    childProcess: {
      maxChildProcesses: limits.maxChildProcesses ?? DEFAULT_LIMITS.childProcess.maxChildProcesses,
      allowExec: (limits as ExtendedResourceLimits).allowExec ?? false,
      allowFork: (limits as ExtendedResourceLimits).allowFork ?? false,
      allowedCommands: (limits as ExtendedResourceLimits).allowedCommands,
    },
  };
}
```

## 7. 设计决策

### ADR-RL-001: 使用子进程隔离 + 运行时监控

**决策**：不依赖容器或 VM 的资源限制，而是采用子进程隔离 + 运行时监控组合。

**理由**：
- 轻量：无需额外运行时依赖
- 灵活：可动态调整限制
- 可观测：实时监控资源使用

### ADR-RL-002: 软硬双阈值设计

**决策**：内存和 CPU 限制采用软硬双阈值。

**理由**：
- 软阈值提供预警，允许系统采取预防措施
- 硬阈值作为最后防线，确保不超限
- 符合"防御性超时洋葱模型"（X3 经验）

### ADR-RL-003: Promise.race 超时实现

**决策**：超时使用 Promise.race 实现，确保败者 timer 清理。

**理由**：
- 符合 async-resource-lifecycle 规范（A1 规则）
- 避免资源泄漏
- 清晰的错误信息

## 8. 验证要点

### Property PL-8: 资源限制有效性

> *For all* 在沙箱中执行的插件 p，若 p 超过配置的资源限制（内存、CPU、时间），THEN Sandbox 终止 p 的执行。

验证方法：
1. 生成随机资源限制配置
2. 执行插件代码尝试突破限制
3. 验证沙箱正确终止并报告错误

---

**设计完成日期**: 2026-01-XX  
**设计者**: Kiro (spec-task-execution)  
**关联任务**: 9.1.3 设计资源限制接口