# 通信协议设计文档

## 概述

本文档定义主进程（Host）与沙箱进程（Sandbox）之间的通信协议实现方案，基于 `sandbox/index.ts` 中定义的 IPC 消息类型。

## 协议架构

### 通信模式

采用**请求-响应**模式为主，**事件推送**模式为辅的双向通信：

```
┌─────────────┐     IPC 消息      ┌─────────────┐
│   Host      │ ←───────────────→ │   Sandbox   │
│  (主进程)   │   request/response │  (沙箱进程) │
│             │ ←─────────────────│             │
│             │   event (异步推送) │             │
└─────────────┘                   └─────────────┘
```

### 消息流类型

| 方向 | 类型 | 用途 |
|------|------|------|
| Host → Sandbox | IPCRequest | 调用沙箱内的方法 |
| Sandbox → Host | IPCResponse | 返回方法执行结果 |
| Sandbox → Host | IPCEvent | 主动上报事件（进度、错误等） |

## 消息格式

### IPCRequest（请求）

```typescript
interface IPCRequest {
  id: string;           // 消息唯一标识符（UUID）
  type: 'request';
  direction: 'toSandbox';
  timestamp: number;    // Unix 毫秒时间戳
  method: string;       // 要调用的方法名
  args: unknown[];      // 方法参数数组
}
```

### IPCResponse（响应）

```typescript
interface IPCResponse {
  id: string;           // 消息唯一标识符
  type: 'response';
  direction: 'toHost';
  timestamp: number;
  requestId: string;    // 对应请求的 ID
  success: boolean;     // 是否成功
  result?: unknown;     // 成功时的返回值
  error?: {             // 失败时的错误信息
    code: string;       // 错误码
    message: string;    // 错误描述
    details?: unknown;  // 详细错误信息
  };
}
```

### IPCEvent（事件）

```typescript
interface IPCEvent {
  id: string;           // 事件唯一标识符
  type: 'event';
  direction: 'toHost';
  timestamp: number;
  event: string;        // 事件名称
  payload?: unknown;    // 事件数据
}
```

## 心跳机制

### 设计目标

1. 检测沙箱进程是否存活
2. 检测通信通道是否正常
3. 防止僵尸进程

### 心跳协议

```typescript
interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: number;
  from: 'host' | 'sandbox';
}
```

### 心跳参数

| 参数 | 默认值 | 可配置 | 说明 |
|------|--------|--------|------|
| interval | 5000ms | 是 | 心跳发送间隔 |
| timeout | 15000ms | 是 | 判定超时的阈值（建议 >= 3 * interval） |
| maxMissed | 3 | 是 | 连续超时次数，达到后终止沙箱 |

### 心跳流程

```
Host                      Sandbox
  │                          │
  │── heartbeat (ping) ──────│
  │                          │
  │── (无响应) ──────────────│ 超时计时开始
  │                          │
  │── heartbeat (ping) ──────│
  │                          │── heartbeat (pong) ──→
  │←─ heartbeat (pong) ──────│
  │                          │
```

### 超时处理

1. **连续超时达到阈值**：Host 主动终止沙箱进程
2. **Host 发送失败**：重试心跳，重试耗尽后终止沙箱

## 事件系统

### 沙箱主动上报的事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `sandbox.started` | Sandbox→Host | 沙箱启动完成 |
| `sandbox.error` | Sandbox→Host | 沙箱内部错误 |
| `sandbox.method_called` | Sandbox→Host | 方法被调用（调试用） |
| `sandbox.resource_warning` | Sandbox→Host | 资源使用预警 |
| `sandbox.terminating` | Sandbox→Host | 沙箱正在终止 |

### 事件数据结构

```typescript
interface SandboxEvent {
  event: string;
  timestamp: number;
  payload?: {
    method?: string;        // 方法名（method_called 时）
    error?: string;         // 错误信息（error 时）
    resourceType?: string;  // 资源类型（resource_warning 时）
    usage?: number;         // 当前使用量（resource_warning 时）
    limit?: number;         // 限制值（resource_warning 时）
    reason?: string;        // 终止原因（terminating 时）
  };
}
```

## 请求处理

### 方法路由

Host 端维护方法映射表：

```typescript
interface MethodHandler {
  // 处理方法调用
  handle(request: IPCRequest): Promise<IPCResponse>;
  // 获取方法元数据
  getMetadata(): MethodMetadata;
}

interface MethodMetadata {
  name: string;
  params: ParamInfo[];
  returnType: string;
  description?: string;
}
```

### 预定义方法

| 方法名 | 方向 | 说明 | 参数 |
|--------|------|------|------|
| `initialize` | Host→Sandbox | 初始化沙箱 | config: SandboxConfig |
| `execute` | Host→Sandbox | 执行插件代码 | method: string, args: unknown[] |
| `getStatus` | Host→Sandbox | 获取沙箱状态 | - |
| `setResourceLimits` | Host→Sandbox | 动态调整资源限制 | limits: ResourceLimits |
| `terminate` | Host→Sandbox | 终止沙箱 | - |

### 响应序列化

- 成功时：`result` 字段包含返回值
- 失败时：`error` 字段包含错误信息

## 错误码规范

### 系统错误码

| 错误码 | 说明 |
|--------|------|
| `IPC_TIMEOUT` | 请求超时 |
| `IPC_INVALID_MESSAGE` | 无效的消息格式 |
| `IPC_METHOD_NOT_FOUND` | 方法不存在 |
| `IPC_SANDBOX_CRASHED` | 沙箱进程崩溃 |
| `IPC_CONNECTION_LOST` | 连接中断 |

### 插件执行错误码

| 错误码 | 说明 |
|--------|------|
| `PLUGIN_INIT_FAILED` | 插件初始化失败 |
| `PLUGIN_METHOD_ERROR` | 插件方法执行错误 |
| `PLUGIN_TIMEOUT` | 插件执行超时 |
| `PLUGIN_MEMORY_LIMIT` | 内存超限 |
| `PLUGIN_CPU_LIMIT` | CPU 时间超限 |

## 安全性考虑

### 消息验证

1. **格式校验**：所有消息必须符合 IPCMessage 接口
2. **来源验证**：验证消息来自已授权的进程
3. **参数校验**：方法参数类型和范围检查

### 传输安全

1. **进程间通信**：使用 Node.js 原生 IPC（避免网络暴露）
2. **序列化限制**：只允许 JSON 序列化安全类型

## 实现建议

### Host 端

```typescript
class IPCClient {
  private messageId = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private heartbeatTimer?: NodeJS.Timeout;
  
  // 发送请求
  async sendRequest<T>(method: string, args: unknown[]): Promise<T> {
    const id = this.generateMessageId();
    const request: IPCRequest = {
      id,
      type: 'request',
      direction: 'toSandbox',
      timestamp: Date.now(),
      method,
      args,
    };
    
    // 等待响应
    return this.waitForResponse<T>(id, request);
  }
  
  // 启动心跳
  startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }
}
```

### Sandbox 端

```typescript
class IPCServer {
  private methodHandlers = new Map<string, MethodHandler>();
  
  // 处理来自 Host 的消息
  async handleMessage(message: IPCMessage): Promise<void> {
    switch (message.type) {
      case 'request':
        await this.handleRequest(message);
        break;
      case 'event':
        await this.handleEvent(message);
        break;
    }
  }
  
  // 发送响应
  private async sendResponse(response: IPCResponse): Promise<void> {
    // 通过 IPC 发送响应
  }
  
  // 发送事件
  async sendEvent(event: string, payload?: unknown): Promise<void> {
    const message: IPCEvent = {
      id: this.generateMessageId(),
      type: 'event',
      direction: 'toHost',
      timestamp: Date.now(),
      event,
      payload,
    };
    // 通过 IPC 发送事件
  }
}
```

## 与现有代码的集成

### 与 sandbox/index.ts 的关系

`sandbox/index.ts` 定义的接口：
- `IPCRequest` / `IPCResponse` / `IPCEvent` — 消息格式 ✓
- `SandboxExecuteResult` — 执行结果格式 ✓
- `ResourceLimits` — 资源限制配置 ✓

本文档在此基础上补充：
- 消息发送/接收机制
- 心跳协议
- 方法路由与处理
- 错误处理流程

## 验收标准

1. [ ] 支持请求-响应模式
2. [ ] 支持事件推送模式
3. [ ] 实现心跳机制（可配置间隔和超时）
4. [ ] 心跳超时时能自动终止沙箱
5. [ ] 错误码规范化
6. [ ] 与现有 sandbox/index.ts 接口兼容