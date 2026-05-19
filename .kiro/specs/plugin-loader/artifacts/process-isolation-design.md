# 进程隔离机制设计

## 概述

本文档定义 Plugin Loader P2 阶段的核心机制：**进程隔离**（Process Isolation）。基于 `sandbox/index.ts` 中定义的接口，本设计详细说明如何在操作系统层面实现插件的运行时隔离。

## 设计目标

1. **进程隔离**：每个插件运行在独立子进程中，与 Daemon 主进程隔离
2. **资源限制**：强制执行 CPU、内存、文件描述符等资源配额
3. **文件系统隔离**：通过白名单机制限制文件系统访问
4. **网络隔离**：控制插件的网络访问能力
5. **可观测性**：记录沙箱生命周期事件和资源使用

## 架构设计

### 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Daemon 主进程                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Plugin Sandbox Manager                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ Process     │  │ IPC         │  │ Resource        │  │  │
│  │  │ Manager     │  │ Handler     │  │ Monitor         │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                     IPC (Unix/TCP)                              │
│                              │                                   │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │                    Sandbox Child Process                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ Plugin      │  │ IPC         │  │ API             │   │  │
│  │  │ Loader      │  │ Server      │  │ Proxy           │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │              Restricted Environment                  │   │  │
│  │  │  - 清理后的环境变量                                   │   │  │
│  │  │  - 文件系统白名单                                     │   │  │
│  │  │  - 网络访问限制                                       │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 组件职责

#### Process Manager

**职责**：
- 创建和管理子进程生命周期
- 应用系统级资源限制（cgroups、ulimit）
- 处理进程退出和异常

**关键方法**：
```typescript
interface ProcessManager {
  spawn(pluginId: string, entryPath: string, options: SpawnOptions): Promise<ProcessHandle>;
  terminate(handle: ProcessHandle): Promise<void>;
  getStatus(handle: ProcessHandle): ProcessStatus;
}
```

#### IPC Handler

**职责**：
- 在主进程和子进程之间传递消息
- 序列化和反序列化消息
- 处理请求超时和错误

**消息格式**（已在 `sandbox/index.ts` 定义）：
- `IPCRequest`: 主机 → 沙箱
- `IPCResponse`: 沙箱 → 主机
- `IPCEvent`: 沙箱 → 主机（异步事件）

#### Resource Monitor

**职责**：
- 定期采集子进程资源使用（CPU、内存）
- 检测资源超限并触发终止
- 生成资源使用报告

**关键方法**：
```typescript
interface ResourceMonitor {
  startMonitoring(handle: ProcessHandle, limits: ResourceLimits): void;
  stopMonitoring(handle: ProcessHandle): ResourceUsage;
  getCurrentUsage(handle: ProcessHandle): ResourceUsage;
}
```

## 进程隔离实现

### 1. 子进程创建

使用 Node.js/Bun 的 `child_process` 模块创建隔离进程：

```typescript
import { spawn, ChildProcess } from 'child_process';

// 创建子进程
const child = spawn('bun', [entryScriptPath], {
  cwd: options.workingDir || pluginDir,
  env: createRestrictedEnv(options.envWhitelist),
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],  // 标准流 + IPC 通道
  execArgv: [
    '--no-warnings',           // 禁用警告输出
    '--disable-warning=Asymmetric',  // 禁用特定警告
  ],
});
```

### 2. 环境隔离

#### 环境变量清理

```typescript
function createRestrictedEnv(whitelist: string[] = ['PATH', 'NODE_ENV']): NodeJS.ProcessEnv {
  const restricted: NodeJS.ProcessEnv = {};
  
  // 只保留白名单中的环境变量
  for (const key of whitelist) {
    if (process.env[key] !== undefined) {
      restricted[key] = process.env[key];
    }
  }
  
  // 添加沙箱特定的环境变量
  restricted['SF_SANDBOX_MODE'] = 'true';
  restricted['SF_PLUGIN_ID'] = options.pluginId;
  
  return restricted;
}
```

#### 敏感变量黑名单

```typescript
const ENV_BLACKLIST = new Set([
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'DATABASE_URL',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'PASSWORD',
  'TOKEN',
]);
```

### 3. 文件系统隔离

#### 白名单检查

在子进程启动前，设置工作目录和权限：

```typescript
import { chdir, chmod } from 'fs/promises';
import { resolve } from 'path';

// 设置工作目录为插件目录
process.chdir(pluginDir);

// 使用 chroot 实现更严格的隔离（需要 root 权限）
// 或使用 seccomp-bpf（Linux）
```

#### 运行时路径检查

在 IPC 层拦截文件操作：

```typescript
// 沙箱子进程中的路径检查
function validatePath(requestedPath: string, whitelist: FSWhitelist): boolean {
  const resolved = resolve(requestedPath);
  
  for (const rule of whitelist.rules) {
    const allowedPath = resolve(rule.path);
    
    // 检查是否在白名单目录内
    if (resolved.startsWith(allowedPath)) {
      return rule.mode === 'read-write' || rule.mode === 'read';
    }
  }
  
  return false;
}
```

### 4. 网络隔离

#### 网络限制策略

```typescript
// 仅允许白名单中的网络请求
async function validateNetworkRequest(
  host: string, 
  port: number, 
  protocol: string,
  whitelist: NetworkWhitelist
): Promise<boolean> {
  if (!whitelist.enabled) {
    // 默认禁用所有网络访问（除非明确启用）
    return false;
  }
  
  for (const rule of whitelist.rules) {
    // 主机名匹配（支持通配符）
    if (matchHost(host, rule.host)) {
      // 端口检查
      if (rule.port === -1 || rule.port === port) {
        // 协议检查
        if (rule.protocol === '*' || rule.protocol === protocol) {
          return true;
        }
      }
    }
  }
  
  return false;
}

function matchHost(actual: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === actual) return true;
  
  // 支持通配符 *.example.com
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return actual.endsWith(suffix);
  }
  
  return false;
}
```

## 资源限制实现

### 1. 内存限制

#### 实现方式

```typescript
// 方式 1: 使用 v8 堆内存限制（仅限制堆内存）
process.resources?.setHeapLimit?.(memoryLimitMB * 1024 * 1024);

// 方式 2: 定期检查内存使用
setInterval(() => {
  const usage = process.memoryUsage();
  const usedMB = usage.heapUsed / (1024 * 1024);
  
  if (usedMB > options.memoryLimitMB) {
    throw new Error(`Memory limit exceeded: ${usedMB}MB > ${options.memoryLimitMB}MB`);
  }
}, 1000);
```

### 2. CPU 时间限制

```typescript
// CPU 时间监控
class CPUTimeTracker {
  private startTime: number;
  private accumulatedTime: number = 0;
  
  start() {
    this.startTime = Date.now();
  }
  
  pause() {
    this.accumulatedTime += Date.now() - this.startTime;
  }
  
  getUsedSeconds(): number {
    const current = this.startTime ? 
      this.accumulatedTime + (Date.now() - this.startTime) : 
      this.accumulatedTime;
    return current / 1000;
  }
}
```

### 3. 执行超时

```typescript
// 执行超时控制
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Execution timeout: ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
```

### 4. 文件描述符限制

```typescript
// 限制子进程可打开的文件数（通过 spawn options）
const child = spawn('bun', [scriptPath], {
  // 使用 setrlimit 系统调用（需要 root）
  // 或在容器级别配置
});

// 运行时监控
function monitorFileDescriptors(pid: number): number {
  // Linux: 读取 /proc/{pid}/fd
  // macOS: 使用 lsof
  // 返回打开的文件描述符数量
}
```

## IPC 通信协议

### 1. 消息格式

已在 `sandbox/index.ts` 中定义完整格式：

```typescript
// 请求示例
{
  "id": "uuid-v4",
  "type": "request",
  "direction": "toSandbox",
  "timestamp": 1700000000000,
  "method": "execute",
  "args": [{ "code": "return 1 + 1" }]
}

// 响应示例
{
  "id": "uuid-v4",
  "type": "response",
  "direction": "toHost",
  "timestamp": 1700000000001,
  "requestId": "uuid-v4",
  "success": true,
  "result": 2
}
```

### 2. 消息序列化

```typescript
import { serialize, deserialize } from 'v8';

// 序列化（使用 v8 快速序列化）
function serializeMessage(msg: IPCMessage): Buffer {
  return Buffer.from(serialize(msg));
}

// 反序列化
function deserializeMessage(data: Buffer): IPCMessage {
  return deserialize(data) as IPCMessage;
}
```

### 3. 错误处理

```typescript
interface IPCError {
  code: string;        // 错误码
  message: string;     // 错误信息
  details?: unknown;   // 详细错误
}

// 错误码规范
const IPC_ERROR_CODES = {
  PARSE_ERROR: 'PARSE_ERROR',      // 消息解析失败
  TIMEOUT: 'TIMEOUT',              // 请求超时
  METHOD_NOT_FOUND: 'METHOD_NOT_FOUND',  // 方法不存在
  EXECUTION_ERROR: 'EXECUTION_ERROR',    // 执行出错
  RESOURCE_EXCEEDED: 'RESOURCE_EXCEEDED', // 资源超限
  INTERNAL_ERROR: 'INTERNAL_ERROR',      // 内部错误
};
```

## 进程生命周期管理

### 1. 状态机

```
                    ┌─────────────┐
                    │   created   │
                    └──────┬──────┘
                           │ createSandbox()
                           ▼
                    ┌─────────────┐
              ┌──── │   running   │ ◄────────────┐
              │     └──────┬──────┘              │
              │            │                     │
   execute()  │            │ execute()           │ terminate()
              │            │                     │
              │     ┌──────▼──────┐              │
              │     │   active    │              │
              │     └──────┬──────┘              │
              │            │                     │
              │            │ 完成执行            │ destroy()
              │            ▼                     │
              │     ┌─────────────┐              │
              └────►│  terminated │ ◄────────────┘
                    └─────────────┘
                    
错误或超限 → [error] 状态 → terminated
```

### 2. 优雅终止

```typescript
async function gracefulTerminate(handle: ProcessHandle, timeoutMs: number = 5000): Promise<void> {
  const { pid } = handle;
  
  // 1. 发送终止信号
  process.kill(pid, 'SIGTERM');
  
  // 2. 等待进程退出
  await waitForExit(pid, timeoutMs);
  
  // 3. 如果仍未退出，强制终止
  try {
    process.kill(pid, 'SIGKILL');
    await waitForExit(pid, 1000);
  } catch {
    // 进程已退出
  }
}

function waitForExit(pid: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    
    // 使用 poll 等待进程退出
    const check = () => {
      try {
        // 检查进程是否存在（ESRCH = 无此进程）
        process.kill(pid, 0);
        setTimeout(check, 100);
      } catch (err: any) {
        if (err.code === 'ESRCH') {
          clearTimeout(timer);
          resolve();
        }
      }
    };
    
    check();
  });
}
```

## 安全考虑

### 1. 进程权限

- 子进程应使用最小权限用户运行（如果以 root 启动 Daemon）
- 使用 `setuid`/`setgid` 切换到非特权用户

### 2. 系统调用过滤

使用 `seccomp-bpf`（Linux）或 `Seatbelt`（macOS）限制可用的系统调用：

```typescript
// Linux seccomp 示例（需要 libseccomp）
import { load } from 'libseccomp';

// 只允许安全子集的系统调用
const allowList = [
  'read', 'write', 'close', 'brk', 'mmap', 
  'munmap', 'rt_sigaction', 'rt_sigprocmask',
  // ... 其他允许的调用
];

const ctx = new seccomp.SecComp();
ctx.addRule(seccomp.SecCompAction.KILL, seccomp.SecCompSyscall.resolve('execve'));
// ... 添加更多规则
ctx.load();
```

### 3. 容器化部署（可选）

对于更严格的隔离，可以使用 Docker 容器：

```typescript
interface ContainerConfig {
  image: string;
  memoryLimit: string;
  cpuPeriod: number;
  cpuQuota: number;
  readonlyRootfs: boolean;
  networkMode: 'none' | 'bridge' | 'host';
}

async function spawnInContainer(
  pluginId: string,
  config: ContainerConfig
): Promise<ContainerHandle> {
  // 使用 dockerode 库
  const container = await docker.createContainer({
    Image: config.image,
    Memory: parseMemory(config.memoryLimit),
    CpuPeriod: config.cpuPeriod,
    CpuQuota: config.cpuQuota,
    NetworkMode: config.networkMode,
    ReadonlyRootfs: config.readonlyRootfs,
    Cmd: ['bun', '/plugin/entry.js'],
    Env: createRestrictedEnv(),
  });
  
  await container.start();
  return { id: container.id, container };
}
```

## 性能优化

### 1. 进程池

```typescript
class SandboxPool {
  private pool: ProcessHandle[] = [];
  private active: Set<string> = new Set();
  
  async acquire(pluginId: string): Promise<ProcessHandle> {
    // 从池中获取空闲进程
    const available = this.pool.find(h => !this.active.has(h.id));
    if (available) {
      this.active.add(available.id);
      return available;
    }
    
    // 创建新进程
    const handle = await this.createSandbox(pluginId);
    this.active.add(handle.id);
    return handle;
  }
  
  async release(handle: ProcessHandle): Promise<void> {
    this.active.delete(handle.id);
    
    // 放回池中（如果池未满）
    if (this.pool.length < MAX_POOL_SIZE) {
      await this.resetSandbox(handle);
      this.pool.push(handle);
    } else {
      await this.destroySandbox(handle);
    }
  }
}
```

### 2. IPC 优化

- 使用共享内存传递大数据
- 批量消息处理
- 连接复用

## 测试策略

### 单元测试

- 进程创建和终止
- IPC 消息序列化/反序列化
- 资源限制检测

### 集成测试

- 插件在沙箱中执行
- 资源超限触发终止
- 文件系统隔离有效性

### Property-Based 测试

- PL-7: 沙箱隔离性验证
- PL-8: 资源限制有效性验证

## 实现路线图

### Phase 1: 基础进程隔离（9.2.1）

- 实现 ProcessManager
- 实现基本的子进程创建和终止
- 实现基础 IPC 通信

### Phase 2: IPC 通信（9.2.2）

- 实现 IPC 消息协议
- 实现请求/响应处理
- 实现事件推送

### Phase 3: 资源监控骨架（9.2.3）

- 实现资源使用采集
- 实现基础限制检测
- 实现超时控制

### Phase 4: 沙箱骨架测试（9.2.4）

- 编写集成测试
- 验证隔离有效性

## 参考实现

- [Node.js 官方文档: child_process](https://nodejs.org/api/child_process.html)
- [Docker container runtime](https://docs.docker.com/engine/api/v1.41/)
- [seccomp-bpf Linux kernel documentation](https://www.kernel.org/doc/Documentation/prctl/seccomp_filter.txt)
- [Bun spawn API](https://bun.sh/docs/api/spawn)