# Tasks: SpecForge V6 一次性切换方案

**Work Item**: WI-001
**任务规划日期**: 2026-05-24
**规划人**: sf-task-planner Agent
**总任务数**: 44
**预估总工期**: 14 周（3.5 个月）

---

## 依赖图概览

```
E1 (T01-T10) ──→ E2 (T11-T16) ──┐
                E3 (T17-T21) ──┼──→ E5 (T32-T34) ──→ E6 (T35-T37) ──→ E7 (T38-T44)
                E4 (T22-T31) ──┘
```

**关键路径**: T01→...→T10 → T22→...→T31 → T32→T33→T34 → T35→T36→T37 → T38→...→T44

**可并行 Epic**: E2 (T11-T16)、E3 (T17-T21)、E4 (T22-T31) 在 E1 完成后可同时开始

---

## Epic 1: Daemon Core 基石

> 建立独立 Daemon 进程，提供 HTTP/SSE API 作为所有工具的统一后端。
> 这是整个 V6 架构的基石，必须在 M1 里程碑完成。

---

### TASK-1 Daemon HTTP Server 基础框架

**Epic**: E1
**依赖**: 无
**预估工作量**: 3 天
**可并行**: 否

### 描述

创建 Daemon HTTP Server 基础框架，基于 Node.js `http` 模块（ADR-01）实现。

1. 实现 `packages/daemon-core/src/http/HTTPServer.ts` 核心 HTTP 服务器
2. 支持请求路由分发：`/health`、`/api/v1/*`、`/events`
3. 实现 SSE (Server-Sent Events) 端点 `/events`，支持实时事件推送
4. 统一请求/响应格式：`ApiResponse<T>` 包装所有返回值
5. 请求 payload 大小检查：>64KB 自动分流到 CAS（预留接口）
6. 全局错误处理中间件：统一 `DaemonError` 分类和响应格式
7. 空闲超时机制：非 detached 模式下 30s 无活动自动退出

### 验收标准
- [ ] HTTP Server 启动后 `/health` 端点返回 200
- [ ] SSE `/events` 端点可建立长连接并推送事件
- [ ] 无效路由返回 404 + 标准错误格式
- [ ] 请求体解析支持 JSON，错误请求返回 400
- [ ] 全局错误处理捕获未处理异常，返回 500 + 标准格式
- [ ] TypeScript 类型定义完整，无 `any` 类型

### verification_commands
```
检查 packages/daemon-core/src/http/HTTPServer.ts 文件存在
检查 HTTPServer.ts 中包含 "createServer" 
检查 HTTPServer.ts 中包含 "/health"
检查 HTTPServer.ts 中包含 "text/event-stream"
检查 packages/daemon-core/src/types.ts 中包含 "ApiResponse"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/http/HTTPServer.ts` — HTTP 服务器核心实现
- `packages/daemon-core/src/types.ts` — 核心类型定义（ApiResponse, ApiError, SSEEvent 等）
- `packages/daemon-core/src/daemon/DaemonConfig.ts` — Daemon 配置管理

---

### TASK-2 State Manager（WAL + state.json 派生）

**Epic**: E1
**依赖**: T01
**预估工作量**: 3 天
**可并行**: 否

### 描述

实现状态管理系统，基于 WAL（Write-Ahead Log）保证状态一致性和崩溃恢复能力。

1. 完善 `packages/daemon-core/src/wal/WAL.ts`：
   - `appendEvent()` 带 fsync 确保落盘
   - `readAllEvents()` 顺序读取所有事件
   - `createEvent()` 生成 UUIDv7 事件 ID + 单调递增序号
2. 实现 `packages/daemon-core/src/state/StateManager.ts`：
   - 从 WAL 事件流派生 state.json（内存状态）
   - `transition()` 方法：验证合法性 → WAL 写入 → 更新内存状态
   - 乐观锁机制：from_state 验证 + 版本号
   - `rebuildState()` 从 WAL 完全重建状态
3. 数据目录从 `specforge/` 切换到 `.specforge/`
4. 事件格式符合 E2 统一 Event Schema（schema_version: '1.0'）

### 验收标准
- [ ] WAL appendEvent 后 fsync 调用（可验证 WAL 文件持久性）
- [ ] StateManager.transition() 正确写入 WAL 并更新内存状态
- [ ] 非法状态转移被拒绝并返回明确错误
- [ ] 乐观锁：并发写入时先到者成功，后到者冲突
- [ ] rebuildState 从 WAL 完全重建状态与内存一致
- [ ] 事件 monotonicSeq 严格递增

### verification_commands
```
检查 packages/daemon-core/src/wal/WAL.ts 文件存在
检查 WAL.ts 中包含 "fsync" 或 "fdatasync" 或 "SYNC"
检查 packages/daemon-core/src/state/StateManager.ts 文件存在
检查 StateManager.ts 中包含 "transition"
检查 StateManager.ts 中包含 "rebuildState"
检查 StateManager.ts 中包含 "optimistic" 或 "version" 或 "from_state"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/wal/WAL.ts` — Write-Ahead Log 实现
- `packages/daemon-core/src/state/StateManager.ts` — 状态管理器
- `packages/daemon-core/src/types.ts` — 事件和状态类型定义

---

### TASK-3 Recovery 子系统

**Epic**: E1
**依赖**: T02
**预估工作量**: 2 天
**可并行**: 否

### 描述

实现 Daemon 崩溃恢复子系统，确保 Daemon 异常退出后能安全恢复。

1. 实现 `packages/daemon-core/src/recovery/RecoverySubsystem.ts`：
   - `beginStartupPhase()`: 标记启动阶段开始
   - `checkAndRepair()`: 检查 WAL 与内存状态一致性，修复不匹配
   - `reconnectOldSessions()`: 重新连接之前活跃的会话
   - `completeStartup()`: 标记启动完成
2. 恢复流程：WAL.readAllEvents() → 重放事件 → StateManager.rebuildState() → 一致性校验
3. 半写入检测：识别 WAL 中未完成的事务（如只有 begin 没有 commit 的事件），自动回滚
4. 启动阶段锁定：启动期间拒绝外部请求（返回 `DAEMON_NOT_READY` 503）

### 验收标准
- [ ] Recovery 子系统在 Daemon 启动时自动执行
- [ ] 模拟崩溃后重启，状态恢复到崩溃前最后一致状态
- [ ] 半写入事件被正确识别和回滚
- [ ] 启动期间请求返回 503 DAEMON_NOT_READY
- [ ] 启动完成后 health check 返回 200

### verification_commands
```
检查 packages/daemon-core/src/recovery/RecoverySubsystem.ts 文件存在
检查 RecoverySubsystem.ts 中包含 "beginStartupPhase"
检查 RecoverySubsystem.ts 中包含 "checkAndRepair"
检查 RecoverySubsystem.ts 中包含 "reconnectOldSessions"
检查 RecoverySubsystem.ts 中包含 "completeStartup"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/recovery/RecoverySubsystem.ts` — 恢复子系统实现

---

### TASK-4 Multi-project Manager

**Epic**: E1
**依赖**: T02
**预估工作量**: 2 天
**可并行**: 是（与 T03 并行）

### 描述

实现多项目管理器，支持 Daemon 同时服务多个项目，确保状态隔离。

1. 实现 `packages/daemon-core/src/project/ProjectManager.ts`：
   - `getProject(projectPath)` 返回 `ProjectContext`
   - `ProjectContext` 包含独立的 WAL 实例、StateManager 实例、事件流
   - Project ID 生成：`SHA-256(projectPath)[:16]`
2. 项目级数据目录：`~/.specforge/projects/{hash}/`
3. 项目注册/注销生命周期管理
4. 项目间状态完全隔离：项目 A 的状态变化不影响项目 B

### 验收标准
- [ ] 不同项目路径生成不同的 Project ID
- [ ] 每个项目有独立的 WAL 和 StateManager 实例
- [ ] 项目 A 的状态操作不影响项目 B
- [ ] 项目注销后资源被正确释放
- [ ] 同一项目重复调用 getProject 返回同一实例

### verification_commands
```
检查 packages/daemon-core/src/project/ProjectManager.ts 文件存在
检查 ProjectManager.ts 中包含 "ProjectContext"
检查 ProjectManager.ts 中包含 "getProject"
检查 ProjectManager.ts 中包含 "projectId" 或 "SHA-256" 或 "projectPath"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/project/ProjectManager.ts` — 多项目管理器

---

### TASK-5 Session Registry

**Epic**: E1
**依赖**: T01
**预估工作量**: 1 天
**可并行**: 是（与 T02-T04 并行）

### 描述

实现会话注册表，跟踪 OpenCode 与 Daemon 的活跃会话连接。

1. 实现 `packages/daemon-core/src/session/SessionRegistry.ts`：
   - 会话创建、激活、销毁生命周期
   - 会话元数据：sessionId、agentRole、workItemId、projectId
   - 会话列表查询 API
2. 会话与项目绑定：每个会话属于一个项目
3. 会话超时管理：长时间无活动的会话自动清理
4. Daemon 重启时会话重连（配合 RecoverySubsystem）

### 验收标准
- [ ] 会话创建后可通过 sessionId 查询
- [ ] 会话列表 API 返回所有活跃会话
- [ ] 过期会话被自动清理
- [ ] 会话重连后状态恢复正确

### verification_commands
```
检查 packages/daemon-core/src/session/SessionRegistry.ts 文件存在
检查 SessionRegistry.ts 中包含 "createSession" 或 "register"
检查 SessionRegistry.ts 中包含 "sessionId"
检查 SessionRegistry.ts 中包含 "agentRole"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/session/SessionRegistry.ts` — 会话注册表

---

### TASK-6 CAS（内容寻址存储）

**Epic**: E1
**依赖**: T01
**预估工作量**: 2 天
**可并行**: 是（与 T02-T05 并行）

### 描述

实现内容寻址存储（CAS），用于存储大 payload（>64KB），支持去重和高效检索。

1. 完善 `packages/daemon-core/src/cas/ContentAddressableStorage.ts`：
   - `store(content)` → 返回 `blob://sha256hash` 引用
   - `retrieve(blobRef)` → 返回原始内容
   - 二级目录结构：`{sha256[:2]}/{sha256[2:]}` 避免单目录文件过多
2. 存储 API 端点：
   - `POST /api/v1/cas/store` — 存储内容
   - `GET /api/v1/cas/retrieve?ref=blob://...` — 读取内容
3. CAS 存储路径：`.specforge/cas/`
4. 自动去重：相同内容返回同一引用

### 验收标准
- [ ] 存储内容后返回 `blob://sha256hash` 格式引用
- [ ] 通过引用能正确取回原始内容
- [ ] 相同内容存储返回同一引用（去重）
- [ ] 二级目录结构正确（`ab/cdef...`）
- [ ] HTTP API 端点正常工作

### verification_commands
```
检查 packages/daemon-core/src/cas/ContentAddressableStorage.ts 文件存在
检查 ContentAddressableStorage.ts 中包含 "store"
检查 ContentAddressableStorage.ts 中包含 "retrieve"
检查 ContentAddressableStorage.ts 中包含 "sha256" 或 "SHA-256"
检查 ContentAddressableStorage.ts 中包含 "blob://"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/cas/ContentAddressableStorage.ts` — CAS 实现
- `packages/daemon-core/src/cas/index.ts` — CAS 模块入口

---

### TASK-7 Bearer Token 认证

**Epic**: E1
**依赖**: T01
**预估工作量**: 1 天
**可并行**: 是（与 T02-T06 并行）

### 描述

实现 Daemon 的 Bearer Token 认证机制，保护 HTTP API 端点。

1. 实现 Token 生成：Daemon 启动时自动生成 32 字节随机 Token
2. 实现 `packages/daemon-core/src/daemon/HandshakeManager.ts`：
   - 写入 Handshake 文件 `~/.specforge/handshake.json`
   - 包含：`{ pid, port, token, startedAt, schemaVersion }`
   - Thin Plugin 读取 Handshake 文件获取连接信息
3. HTTP Server 认证中间件：
   - 提取 `Authorization: Bearer <token>` 头
   - 无 Token → 401 `AUTH_MISSING_TOKEN`
   - Token 无效 → 401 `AUTH_INVALID_TOKEN`
   - `/health` 端点免认证
4. Token 生命周期：每次 Daemon 重启重新生成

### 验收标准
- [ ] Daemon 启动后 handshake.json 文件存在
- [ ] handshake.json 包含 pid、port、token、startedAt 字段
- [ ] 无 Token 请求受保护端点返回 401
- [ ] 无效 Token 请求返回 401
- [ ] 有效 Token 请求正常通过
- [ ] `/health` 端点无需认证

### verification_commands
```
检查 packages/daemon-core/src/daemon/HandshakeManager.ts 文件存在
检查 HandshakeManager.ts 中包含 "handshake"
检查 HandshakeManager.ts 中包含 "token" 或 "Bearer"
检查 HTTPServer.ts 或认证中间件文件中包含 "AUTH_MISSING_TOKEN" 或 "401"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/daemon/HandshakeManager.ts` — 握手文件管理
- `packages/daemon-core/src/http/HTTPServer.ts` — 添加认证中间件

---

### TASK-8 HTTP API 端点（状态/事件/workflow）

**Epic**: E1
**依赖**: T02, T06, T07
**预估工作量**: 3 天
**可并行**: 否

### 描述

实现所有 Daemon HTTP API 端点，将内部子系统的能力暴露为 HTTP 接口。

1. 状态 API：
   - `POST /api/v1/state/read` — 读取状态（StateManager）
   - `POST /api/v1/state/transition` — 状态流转（StateManager）
2. 事件 API：
   - `POST /api/v1/event/log` — 写入事件（WAL）
   - `POST /api/v1/event/query` — 查询事件
3. CAS API：
   - `POST /api/v1/cas/store` — 存储到 CAS
   - `GET /api/v1/cas/retrieve` — 从 CAS 读取
4. 会话 API：
   - `GET /api/v1/session/list` — 会话列表
5. 通用 Tool 调用：
   - `POST /api/v1/tool/invoke` — 统一 Tool 调用入口（Single Endpoint 策略）
   - `ToolInvokeRequest { tool, args, context }` 路由到具体 Tool 实现
6. 管理端点：
   - `POST /api/v1/admin/stop` — 停止 Daemon

### 验收标准
- [ ] 所有端点正确注册并可访问
- [ ] 状态读写端点正确调用 StateManager
- [ ] 事件写入端点正确调用 WAL
- [ ] Tool invoke 端点正确路由到具体 Tool
- [ ] 所有端点都有 Bearer Token 认证（除 /health）
- [ ] 错误响应使用标准错误码格式

### verification_commands
```
检查 packages/daemon-core/src/http/HTTPServer.ts 中包含 "/api/v1/state/read"
检查 packages/daemon-core/src/http/HTTPServer.ts 中包含 "/api/v1/state/transition"
检查 packages/daemon-core/src/http/HTTPServer.ts 中包含 "/api/v1/event/log"
检查 packages/daemon-core/src/http/HTTPServer.ts 中包含 "/api/v1/tool/invoke"
检查 packages/daemon-core/src/http/HTTPServer.ts 中包含 "/api/v1/cas"
检查 packages/daemon-core/src/http/HTTPServer.ts 中包含 "ToolInvokeRequest"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/http/HTTPServer.ts` — 端点路由注册
- `packages/daemon-core/src/types.ts` — API 请求/响应类型

---

### TASK-9 Daemon 启动/关闭/握手

**Epic**: E1
**依赖**: T03, T04, T05, T07, T08
**预估工作量**: 2 天
**可并行**: 否

### 描述

实现 Daemon 完整生命周期管理：启动、握手、运行、优雅关闭。

1. 完善 `packages/daemon-core/src/daemon/Daemon.ts` 主生命周期：
   - `start()`: 绑定端口 → 执行 Recovery → 生成 Token → 写入 Handshake → 就绪
   - `stop()`: 停止接收请求 → 等待进行中请求完成 → WAL flush → 退出
   - 端口管理：port=0 时自动分配，写入 handshake 文件
   - 单实例锁：防止多个 Daemon 实例冲突
2. 握手流程：
   - Thin Plugin 读取 handshake.json → 获取 port + token
   - 连接失败 → 自动重启 Daemon（autoStart 模式）
3. 优雅关闭：
   - SIGTERM/SIGINT 处理
   - 等待所有活跃连接关闭（超时 5s）
   - WAL 最终 fsync
   - 删除 handshake 文件

### 验收标准
- [ ] Daemon 启动后 handshake.json 存在且包含正确字段
- [ ] 端口 0 自动分配到可用端口
- [ ] 优雅关闭后 handshake.json 被删除
- [ ] 单实例锁防止第二个 Daemon 启动
- [ ] SIGTERM 信号触发优雅关闭
- [ ] 启动时自动执行 Recovery 流程

### verification_commands
```
检查 packages/daemon-core/src/daemon/Daemon.ts 文件存在
检查 Daemon.ts 中包含 "start"
检查 Daemon.ts 中包含 "stop"
检查 Daemon.ts 中包含 "SIGTERM" 或 "signal"
检查 Daemon.ts 中包含 "graceful" 或 "shutdown"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/daemon/Daemon.ts` — 主生命周期
- `packages/daemon-core/src/index.ts` — 入口文件（导出 Daemon）

---

### TASK-10 E1 集成测试（含混沌测试）

**Epic**: E1
**依赖**: T09
**预估工作量**: 3 天
**可并行**: 否

### 描述

为 E1 Daemon Core 编写全面的集成测试，包含混沌测试验证崩溃恢复。

1. 基础集成测试：
   - Daemon 完整启动/关闭生命周期
   - HTTP API 端到端调用（状态读写、事件写入、CAS 存取）
   - Bearer Token 认证全场景
   - SSE 事件流连接和推送
2. 混沌测试：
   - 模拟 WAL 写入过程中 Daemon 崩溃（kill -9 模拟）
   - 崩溃后重启验证 WAL 重放正确性（PBT-ST-04）
   - 并发写入冲突测试（PBT-ST-05 乐观锁）
   - 多项目隔离测试（PBT-ST-06）
3. 属性测试（PBT）：
   - PBT-ST-01: 状态一致性（WAL 与内存状态一致）
   - PBT-ST-02: 幂等性（重复请求结果相同）
   - PBT-ST-03: 非法状态拒绝
   - PBT-HTTP-01: 认证必过
   - PBT-HTTP-02: 请求响应匹配

### 验收标准
- [ ] 所有集成测试通过
- [ ] 混沌测试：崩溃恢复后状态一致
- [ ] 并发测试：乐观锁正确工作
- [ ] 多项目测试：状态完全隔离
- [ ] PBT 属性测试全部通过

### verification_commands
```
检查 packages/daemon-core/tests/ 或 __tests__/ 目录存在
检查集成测试文件中包含 "recovery" 或 "crash"
检查集成测试文件中包含 "concurrent" 或 "optimistic" 或 "lock"
检查集成测试文件中包含 "multi-project" 或 "isolation"
npx vitest run --project daemon-core
```

### 目标文件
- `packages/daemon-core/tests/integration/daemon-lifecycle.test.ts` — 生命周期测试
- `packages/daemon-core/tests/integration/api-endpoints.test.ts` — API 端点测试
- `packages/daemon-core/tests/integration/chaos-recovery.test.ts` — 混沌恢复测试
- `packages/daemon-core/tests/integration/pbt-state.test.ts` — 状态属性测试

---

## Epic 2: Observability 子系统

> 统一 Event schema、三级模式、Conversation 重写、agent 注入、sf-analyst。
> 依赖 E1 完成。可与 E3、E4 并行开发。

---

### TASK-11 统一 Event Schema + Event Bus

**Epic**: E2
**依赖**: T10
**预估工作量**: 2 天
**可并行**: 是（与 T17、T22 并行）

### 描述

建立统一的事件 schema 和 Daemon 内部事件总线。

1. 完善 `packages/observability/src/types/index.ts`：
   - 统一 Event 接口：`schema_version`, `eventId`, `ts`, `monotonicSeq`, `projectId`, `workItemId`, `actor`, `category`, `action`, `payload`, `payloadBlobRef`
   - 9 种事件类别：`workflow`, `gate`, `permission`, `session`, `tool`, `heal`, `modality`, `migration`, `system`
   - AgentIdentity 接口
2. 实现 `packages/daemon-core/src/event-bus/EventBus.ts`：
   - `publish(event)` 发布事件
   - `subscribe(category, handler)` 按类别订阅
   - `unsubscribe(category, handler)` 取消订阅
   - 事件缓冲区：确保订阅者不丢事件
3. Event ID 生成：UUIDv7 + 单调递增序号

### 验收标准
- [ ] Event 接口包含所有必需字段
- [ ] 9 种 EventCategory 全部定义
- [ ] EventBus 支持发布/订阅/取消订阅
- [ ] 事件 ID 格式为 UUIDv7
- [ ] EventBus 缓冲区确保事件不丢失

### verification_commands
```
检查 packages/observability/src/types/index.ts 文件存在
检查 types/index.ts 中包含 "schema_version"
检查 types/index.ts 中包含 "EventCategory" 或 "workflow"
检查 packages/daemon-core/src/event-bus/EventBus.ts 文件存在
检查 EventBus.ts 中包含 "publish"
检查 EventBus.ts 中包含 "subscribe"
npx tsc --noEmit --project packages/observability/tsconfig.json
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/observability/src/types/index.ts` — Event schema 定义
- `packages/observability/src/types/event-utils.ts` — 事件创建工具
- `packages/daemon-core/src/event-bus/EventBus.ts` — 事件总线

---

### TASK-12 三级模式 + CAS 大 payload

**Epic**: E2
**依赖**: T11
**预估工作量**: 2 天
**可并行**: 是（与 T18、T23 并行）

### 描述

实现三级观测模式（minimal/standard/deep）和大 payload 自动 CAS 分流。

1. 实现 `packages/observability/src/mode-switch/index.ts`：
   - `filterByMode(event, mode)` 按模式过滤事件
   - minimal: 仅保留核心事件（workflow.started/completed, permission.evaluated deny）
   - standard: 保留所有非 debug 事件，payload 限制 64KB
   - deep: 保留全部事件，包含 LLM 上下文
   - `configureMode(mode, projectId)` 动态切换模式
2. 大 payload 自动分流：
   - EventBus publish 时检测 payload 大小
   - >64KB：自动存储到 CAS，Event 中使用 `payloadBlobRef: "blob://sha256"`
   - ≤64KB：直接内联到 Event
3. 模式持久化：`~/.specforge/observability.json`
4. 模式切换 API：`POST /api/v1/observability/mode`

### 验收标准
- [ ] minimal 模式仅保留核心事件
- [ ] standard 模式保留非 debug 事件
- [ ] deep 模式保留全部事件
- [ ] >64KB payload 自动存储为 CAS blob
- [ ] 模式切换 API 正常工作

### verification_commands
```
检查 packages/observability/src/mode-switch/index.ts 文件存在
检查 mode-switch/index.ts 中包含 "minimal"
检查 mode-switch/index.ts 中包含 "standard"
检查 mode-switch/index.ts 中包含 "deep"
检查 mode-switch/index.ts 中包含 "filterByMode" 或 "filter"
npx tsc --noEmit --project packages/observability/tsconfig.json
```

### 目标文件
- `packages/observability/src/mode-switch/index.ts` — 三级模式实现
- `packages/observability/src/cas/index.ts` — CAS 适配层

---

### TASK-13 Conversation 录制重写

**Epic**: E2
**依赖**: T11
**预估工作量**: 2 天
**可并行**: 是（与 T12、T18、T23 并行）

### 描述

完全重写 Conversation 录制器，从 V5 的 `sf_conversation_recorder_core.ts` 本地文件写入模式迁移到 Daemon 事件流模式。

1. 实现 Daemon 端 Conversation 录制器：
   - `injectAgentContext(toolContext)` 注入 agent 上下文
   - `recordLLMExchange(request, response)` 记录 LLM 交互
   - `emitConversationEvent(event)` 通过 EventBus 发射 `conversation.exchange` 事件
2. ConversationEvent 格式：
   - category: 'session', action: 'conversation.exchange'
   - payload: role, content, toolCalls, toolResults, truncated, tokens
3. 替代 V5 的 `session.messages()` → JSONL 写入模式
4. 确保 conversation 事件在 deep 模式下完整记录

### 验收标准
- [ ] Conversation 录制器正确发射 session 类别事件
- [ ] 事件包含完整的 agent 身份信息
- [ ] LLM 请求/响应都被记录
- [ ] deep 模式下 conversation 事件完整保留

### verification_commands
```
检查 packages/observability/src/event-logger/index.ts 文件存在
检查 event-logger 中包含 "recordLLMExchange" 或 "conversation"
检查 Conversation 录制实现中包含 "AgentIdentity" 或 "actor"
npx tsc --noEmit --project packages/observability/tsconfig.json
```

### 目标文件
- `packages/observability/src/event-logger/index.ts` — EventLogger（WAL 写入封装）

---

### TASK-14 agent 字段注入 + LLM 上下文拦截

**Epic**: E2
**依赖**: T11
**预估工作量**: 2 天
**可并行**: 是（与 T12、T13、T18、T23 并行）

### 描述

解决 V5 的 `agent=unknown` 问题，在 Daemon 层面注入正确的 agent 身份信息。

1. 实现 HTTP 请求头 → AgentIdentity 的注入机制：
   - Thin Plugin 调用时携带 Headers: `X-Session-Id`, `X-Agent-Role`, `X-Work-Item-Id`
   - Daemon HTTPServer 中间件提取 Headers → 构建 AgentIdentity
   - 注入到所有后续 emit 的事件 actor 字段
2. LLM 上下文拦截：
   - 在 OpenCodeAdapter 层面拦截 LLM 请求
   - 提取 agent 上下文信息
   - 确保每次 tool 调用都携带完整的 agent 身份
3. Session 绑定：每个 HTTP 请求自动关联到正确的 session

### 验收标准
- [ ] 所有事件的 actor 字段不为 null（不再出现 agent=unknown）
- [ ] HTTP 请求头正确提取为 AgentIdentity
- [ ] session 和 agentRole 正确关联
- [ ] LLM 调用链中 agent 信息完整

### verification_commands
```
检查 HTTPServer 中间件代码包含 "X-Session-Id" 或 "X-Agent-Role"
检查 HTTPServer 中间件代码包含 "AgentIdentity"
检查 agent 注入代码包含 "actor" 和 "agentRole"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/http/HTTPServer.ts` — 请求头提取中间件
- `packages/opencode-adapter/src/OpenCodeAdapter.ts` — agent 上下文传递

---

### TASK-15 OpenCode part 类型完整覆盖

**Epic**: E2
**依赖**: T11
**预估工作量**: 1 天
**可并行**: 是（与 T12-T14、T18、T23 并行）

### 描述

确保 Observability 系统完整覆盖 OpenCode 的所有 part 类型和消息格式。

1. 梳理 OpenCode SDK 中所有 part 类型：text, tool_call, tool_result, image, etc.
2. 为每种 part 类型定义对应的事件 schema
3. 确保 Conversation 录制器能正确处理所有 part 类型
4. 处理截断逻辑：超长内容标记 `truncated: true`

### 验收标准
- [ ] 所有 OpenCode part 类型都有对应的事件 schema
- [ ] 每种 part 类型都能正确录制
- [ ] 超长内容正确截断并标记

### verification_commands
```
检查 part 类型处理代码覆盖 text、tool_call、tool_result 等类型
检查截断逻辑中包含 "truncated"
npx tsc --noEmit --project packages/observability/tsconfig.json
```

### 目标文件
- `packages/observability/src/types/index.ts` — part 类型定义
- `packages/observability/src/event-logger/index.ts` — 录制逻辑

---

### TASK-16 sf-analyst Agent 数据访问接口

**Epic**: E2
**依赖**: T12, T13
**预估工作量**: 2 天
**可并行**: 是（与 T19、T25 并行）

### 描述

实现 sf-analyst Agent 的数据访问接口，支持 10 种 North Star 场景分析。

1. 实现 `packages/observability/src/sf-analyst/index.ts`：
   - `queryEvents(filter)` — 按条件查询事件
   - `getEvent(eventId)` — 获取单个事件详情
   - `getPermissionTrace(decisionId)` — 权限决策追踪
   - `getStats()` — 统计信息（事件数、类别分布）
2. 实现 `packages/observability/src/analyst-engine/index.ts`：
   - 10 种 North Star 验证场景引擎
3. 实现 `packages/observability/src/query-api/index.ts`：
   - 事件查询 API，支持按类别、时间范围、workItemId 过滤

### 验收标准
- [ ] sf-analyst 能查询所有事件类别
- [ ] 权限追踪能回溯完整决策链
- [ ] 统计信息准确（事件数、类别分布）
- [ ] North Star 场景分析引擎可用

### verification_commands
```
检查 packages/observability/src/sf-analyst/index.ts 文件存在
检查 sf-analyst/index.ts 中包含 "queryEvents"
检查 packages/observability/src/analyst-engine/index.ts 文件存在
检查 packages/observability/src/query-api/index.ts 文件存在
npx tsc --noEmit --project packages/observability/tsconfig.json
```

### 目标文件
- `packages/observability/src/sf-analyst/index.ts` — sf-analyst 数据访问
- `packages/observability/src/analyst-engine/index.ts` — 分析引擎
- `packages/observability/src/query-api/index.ts` — 查询 API
- `packages/observability/src/north-star/index.ts` — North Star 验证

---

## Epic 3: Permission Engine + Scope Gate

> 三层规则合并器、决策事件、Tool/File/Agent 边界控制。
> 依赖 E1 完成。可与 E2、E4 并行开发。

---

### TASK-17 三层规则合并器

**Epic**: E3
**依赖**: T10
**预估工作量**: 3 天
**可并行**: 是（与 T11、T22 并行）

### 描述

实现三层规则合并器：Hard Rules > Built-in Rules > User Rules。

1. 完善 `packages/permission-engine/src/services/rule-merging-engine.ts`：
   - 三层规则优先级：Hard（Agent Constitution 不可违反） > Built-in（系统预定义） > User（项目自定义）
   - `evaluate(request)` 方法：按优先级逐层评估，第一条匹配的规则决定结果
   - 结果包含：decision (allow/deny), matched_rule, rule_layer, reason
2. 实现 `packages/permission-engine/src/hard-rules.ts`：
   - 不可违反的硬规则：如 agent=unknown 一律拒绝
3. 实现 `packages/permission-engine/src/services/builtin-policy-loader.ts`：
   - 系统内置规则：如 sf_state_transition 只允许 orchestrator
4. 实现 `packages/permission-engine/src/services/user-policy-loader.ts`：
   - 用户自定义规则：从 `.specforge/permissions.json` 加载

### 验收标准
- [ ] 三层优先级正确：Hard > Built-in > User
- [ ] 硬规则 deny 不可被覆盖（PBT-PM-01）
- [ ] 每个评估请求返回完整决策信息
- [ ] 规则配置文件正确加载

### verification_commands
```
检查 packages/permission-engine/src/services/rule-merging-engine.ts 文件存在
检查 rule-merging-engine.ts 中包含 "evaluate" 或 "merge"
检查 rule-merging-engine.ts 中包含 "hard" 和 "builtin" 和 "user"
检查 packages/permission-engine/src/hard-rules.ts 文件存在
检查 packages/permission-engine/src/services/builtin-policy-loader.ts 文件存在
检查 packages/permission-engine/src/services/user-policy-loader.ts 文件存在
npx tsc --noEmit --project packages/permission-engine/tsconfig.json
```

### 目标文件
- `packages/permission-engine/src/services/rule-merging-engine.ts` — 三层规则合并
- `packages/permission-engine/src/hard-rules.ts` — 硬规则
- `packages/permission-engine/src/services/builtin-policy-loader.ts` — 内置规则
- `packages/permission-engine/src/services/user-policy-loader.ts` — 用户规则

---

### TASK-18 Permission.evaluated 事件

**Epic**: E3
**依赖**: T11, T17
**预估工作量**: 1 天
**可并行**: 是（与 T12-T16、T19、T23-T25 并行）

### 描述

实现权限决策事件的记录和发射，确保每次权限判断都被审计。

1. 实现 `packages/permission-engine/src/services/event-logger.ts`：
   - `logPermissionDecision(decision)` 记录权限决策
   - 发射 `permission.evaluated` 事件到 EventBus
   - 事件 payload 包含：action, resource, decision, matched_rule, rule_layer, reason
2. 集成到 RuleMergingEngine：
   - 每次 evaluate() 后自动发射决策事件
   - 无论 allow 或 deny 都记录
3. 确保 agent 身份信息正确注入（配合 T14）

### 验收标准
- [ ] 每次权限判断都发射 permission.evaluated 事件（PBT-PM-02）
- [ ] allow 和 deny 决策都被记录
- [ ] 事件包含完整的决策元信息
- [ ] agent 身份信息正确

### verification_commands
```
检查 packages/permission-engine/src/services/event-logger.ts 文件存在
检查 event-logger.ts 中包含 "permission.evaluated"
检查 event-logger.ts 中包含 "logPermissionDecision" 或 "logDecision"
npx tsc --noEmit --project packages/permission-engine/tsconfig.json
```

### 目标文件
- `packages/permission-engine/src/services/event-logger.ts` — 权限决策事件记录

---

### TASK-19 Scope Gate（Tool/File/Agent 边界）

**Epic**: E3
**依赖**: T17
**预估工作量**: 3 天
**可并行**: 是（与 T16、T23-T25 并行）

### 描述

实现三类边界控制：Tool 调用边界、File 编辑边界、Agent 编排边界。

1. 完善 `packages/scope-gate/src/scope-validator.ts`：
   - Tool 边界：哪些 tool 可被哪些 agent 调用
   - File 边界：哪些文件路径可被哪些 agent 写入
   - Agent 边界：哪些 agent 可被哪些 agent 调度
2. 实现运行时检查：
   - `packages/scope-gate/src/runtime-checker.ts`：
     - `checkToolAccess(agentRole, toolId)` → allow/deny
     - `checkFileAccess(agentRole, filePath, action)` → allow/deny
     - `checkAgentAccess(callerRole, targetAgent)` → allow/deny
3. 与 PermissionEngine 集成：
   - Scope Gate 作为 PermissionEngine 的评估维度之一
   - 每次边界检查结果都通过 PermissionEngine 记录事件

### 验收标准
- [ ] Tool 边界：非授权 tool 调用被拦截（PM-002）
- [ ] File 边界：非授权文件访问被拦截（PM-003）
- [ ] Agent 边界：非授权 agent 调度被拦截（PM-004）
- [ ] 边界检查结果都产生 permission.evaluated 事件

### verification_commands
```
检查 packages/scope-gate/src/runtime-checker.ts 文件存在
检查 runtime-checker.ts 中包含 "checkToolAccess" 或 "tool"
检查 runtime-checker.ts 中包含 "checkFileAccess" 或 "file"
检查 runtime-checker.ts 中包含 "checkAgentAccess" 或 "agent"
检查 packages/scope-gate/src/scope-validator.ts 文件存在
npx tsc --noEmit --project packages/scope-gate/tsconfig.json
```

### 目标文件
- `packages/scope-gate/src/runtime-checker.ts` — 运行时边界检查
- `packages/scope-gate/src/scope-validator.ts` — 规则验证
- `packages/scope-gate/src/scope-registry.ts` — 边界规则注册

---

### TASK-20 agent.md 与 contract 一致性测试

**Epic**: E3
**依赖**: T19
**预估工作量**: 1 天
**可并行**: 是（与 T24-T26 并行）

### 描述

验证 9 个 agent.md 中声明的权限边界与 Permission Engine + Scope Gate 的实际规则一致。

1. 编写一致性测试：
   - 读取每个 agent.md 中声明的权限边界
   - 验证 PermissionEngine 的规则覆盖了 agent.md 中的所有声明
   - 验证 Scope Gate 的边界定义与 agent.md 一致
2. 测试场景：
   - 每个 agent 只能调用其声明的 tool
   - 每个 agent 只能写入其声明的文件路径
   - 每个 agent 只能被其声明的 caller 调度

### 验收标准
- [ ] 9 个 agent.md 的权限声明与 PermissionEngine 规则一致
- [ ] 不一致时测试失败并报告差异

### verification_commands
```
检查 agent 一致性测试文件存在
检查测试文件中包含 "agent.md" 或 "contract"
npx vitest run --project permission-engine 或对应测试命令
```

### 目标文件
- `packages/permission-engine/tests/agent-contract-consistency.test.ts` — 一致性测试

---

### TASK-21 E3 集成测试

**Epic**: E3
**依赖**: T18, T19, T20
**预估工作量**: 2 天
**可并行**: 是（与 T25、T26、T30 并行）

### 描述

为 E3 Permission Engine + Scope Gate 编写集成测试。

1. 三层规则合并测试：
   - Hard 规则 deny 不可覆盖
   - Built-in 规则可被 Hard 覆盖
   - User 规则可被 Built-in/Hard 覆盖
   - 无规则匹配时的默认行为
2. 边界控制集成测试：
   - Tool 边界拦截非法调用
   - File 边界拦截非法文件访问
   - Agent 边界拦截非法调度
3. 决策事件验证：
   - 每次判断都产生 permission.evaluated 事件
   - 事件内容完整（actor, decision, rule 等）
4. PBT 属性测试：
   - PBT-PM-01: 硬规则优先
   - PBT-PM-02: 可追溯性
   - PBT-PM-03: 确定性（同输入同输出）
   - PBT-PM-04: 边界完整性

### 验收标准
- [ ] 所有集成测试通过
- [ ] PBT 属性测试通过
- [ ] agent=unknown 场景全部被拒绝

### verification_commands
```
检查 packages/permission-engine/tests/integration/ 目录存在
检查集成测试文件中包含 "rule-merging" 或 "three-layer"
检查集成测试文件中包含 "scope-gate" 或 "boundary"
检查集成测试文件中包含 "permission.evaluated"
npx vitest run --project permission-engine
npx vitest run --project scope-gate
```

### 目标文件
- `packages/permission-engine/tests/integration/rule-merging.test.ts` — 规则合并集成测试
- `packages/permission-engine/tests/integration/scope-gate.test.ts` — 边界控制集成测试
- `packages/permission-engine/tests/pbt/permission-properties.test.ts` — PBT 属性测试

---

## Epic 4: Workflow Runtime（数据驱动）

> 用 JSON workflow 定义替代硬编码状态机，实现 WorkflowEngine 和 GateRunner。
> 依赖 E1 完成。可与 E2、E3 并行开发。
> **关键路径上的 Epic**，决定最短工期。

---

### TASK-22 WorkflowDefinitionFile JSON Schema

**Epic**: E4
**依赖**: T10
**预估工作量**: 2 天
**可并行**: 是（与 T11、T17 并行）

### 描述

定义 WorkflowDefinitionFile JSON Schema，替代 V5 state_machine.ts 中的 8 张硬编码流转表。

1. 定义 `WorkflowDefinitionFile` 接口：
   - `schema_version: '1.0'`
   - `id`: 工作流 ID（如 "feature_spec"）
   - `displayName`: 显示名称
   - `intent`: 意图描述
   - `stateMachine`: 状态机定义（initial, states）
   - `artifacts`: 产物定义
   - `changelog`: 版本历史
2. 定义 `WorkflowStateDef`：
   - `agent`: 负责该阶段的 Agent
   - `gate`: Gate 定义（simple/composite）
   - `skills`: 自动加载的 Skill 列表
   - `next`: 下一状态（静态或条件分支）
3. 定义 `GateDef`：
   - `type`: 'simple' | 'composite'
   - `checkFn`: Gate 实现函数名
   - `children`: 子 Gate 列表（composite）
   - `mode`: 'sequential' | 'parallel'
   - `failPolicy`: 'fail_fast' | 'collect_all'
4. 编写 JSON Schema 验证器
5. 存储位置：`~/.config/specforge/workflows/builtin/`

### 验收标准
- [ ] JSON Schema 类型定义完整
- [ ] 验证器能正确验证合法和非法的 workflow 定义
- [ ] 支持 simple 和 composite 两种 Gate 类型
- [ ] TypeScript 类型与 JSON Schema 一致

### verification_commands
```
检查 packages/workflow-runtime/src/types.ts 文件存在
检查 types.ts 中包含 "WorkflowDefinitionFile"
检查 types.ts 中包含 "WorkflowStateDef"
检查 types.ts 中包含 "GateDef"
检查 types.ts 中包含 "stateMachine"
npx tsc --noEmit --project packages/workflow-runtime/tsconfig.json
```

### 目标文件
- `packages/workflow-runtime/src/types.ts` — Workflow 类型定义（扩展）

---

### TASK-23 8 个 workflow JSON 文件编写

**Epic**: E4
**依赖**: T22
**预估工作量**: 3 天
**可并行**: 是（与 T12-T16、T18-T20、T24 并行）

### 描述

编写 8 个 workflow JSON 定义文件，将 V5 state_machine.ts 中的 8 张硬编码流转表逐一迁移为 JSON 格式。

8 个 workflow 定义文件：

1. `feature_spec.json` — Feature Spec (Requirements-First)
   - 11 个状态：intake → requirements → design → tasks → development → review → verification → completed
2. `bugfix_spec.json` — Bugfix Spec
   - 10 个状态：intake → analysis → design → development → review → verification → completed
3. `design_first.json` — Feature Spec (Design-First)
   - 11 个状态：intake → design → requirements → tasks → development → review → verification → completed
4. `quick_change.json` — Quick Change
   - 5 个状态：intake → change → review → verification → completed
5. `change_request.json` — Change Request
   - 11 个状态：intake → impact_analysis → requirements → design → tasks → development → review → verification → completed
6. `refactor.json` — Refactor
   - 8 个状态：intake → risk_assessment → analysis → (low→verification | high→review) → verification → completed
7. `ops_task.json` — Ops Task
   - 6 个状态：intake → plan → confirm → execution → verification → completed
8. `investigation.json` — Investigation
   - 5 个状态：intake → plan → research → report → completed

每个 JSON 文件包含：agent 分配、Gate 定义、Skill 列表、状态转移规则。

### 验收标准
- [ ] 8 个 JSON 文件全部存在且格式正确
- [ ] 每个文件通过 JSON Schema 验证
- [ ] 状态转移路径与 V5 state_machine.ts 等价
- [ ] 每个 agent 分配与 V5 一致
- [ ] 每个 Gate 定义正确

### verification_commands
```
检查 ~/.config/specforge/workflows/builtin/feature_spec.json 文件存在
检查 ~/.config/specforge/workflows/builtin/bugfix_spec.json 文件存在
检查 ~/.config/specflows/builtin/design_first.json 文件存在
检查 ~/.config/specforge/workflows/builtin/quick_change.json 文件存在
检查 ~/.config/specforge/workflows/builtin/change_request.json 文件存在
检查 ~/.config/specforge/workflows/builtin/refactor.json 文件存在
检查 ~/.config/specforge/workflows/builtin/ops_task.json 文件存在
检查 ~/.config/specforge/workflows/builtin/investigation.json 文件存在
检查每个 JSON 文件中包含 "schema_version" 和 "stateMachine"
检查每个 JSON 文件中包含 "initial" 和 "states"
```

### 目标文件
- `~/.config/specforge/workflows/builtin/feature_spec.json`
- `~/.config/specforge/workflows/builtin/bugfix_spec.json`
- `~/.config/specforge/workflows/builtin/design_first.json`
- `~/.config/specforge/workflows/builtin/quick_change.json`
- `~/.config/specforge/workflows/builtin/change_request.json`
- `~/.config/specforge/workflows/builtin/refactor.json`
- `~/.config/specforge/workflows/builtin/ops_task.json`
- `~/.config/specforge/workflows/builtin/investigation.json`

---

### TASK-24 WorkflowEngine（从 JSON 加载）

**Epic**: E4
**依赖**: T22, T23
**预估工作量**: 3 天
**可并行**: 否

### 描述

修改 WorkflowEngine 支持从 JSON 文件加载 workflow 定义。

1. 扩展 `packages/workflow-runtime/src/engine/WorkflowEngine.ts`：
   - `loadWorkflowFromFile(filePath)` — 从 JSON 文件加载
   - `loadBuiltinWorkflows()` — 加载所有 8 个内置 workflow
   - `registerGate(name, runner)` — 注册 Gate 实现
   - `executeStateGate(instanceId, stateName)` — 执行指定状态的 Gate
   - `getStateSkills(instanceId, stateName)` — 获取阶段的 Skill 列表
2. 修改 `packages/workflow-runtime/src/loaders/WorkflowDefinitionLoader.ts`：
   - 添加 JSON 文件加载和验证
   - 内置路径：`~/.config/specforge/workflows/builtin/`
3. 状态转移执行：
   - 验证 from_state 合法性
   - 确定下一状态（静态或条件分支）
   - 发射 workflow.state_changed 事件
   - 记录到 WAL

### 验收标准
- [ ] 8 个 workflow JSON 文件都能正确加载
- [ ] 状态转移与 V5 行为一致（PBT-WF-05 迁移等价性）
- [ ] 非法状态转移被拒绝（PBT-WF-03）
- [ ] 条件分支（pass/fail）正确工作
- [ ] 每次状态变更发射事件

### verification_commands
```
检查 packages/workflow-runtime/src/engine/WorkflowEngine.ts 中包含 "loadWorkflowFromFile"
检查 packages/workflow-runtime/src/engine/WorkflowEngine.ts 中包含 "loadBuiltinWorkflows"
检查 packages/workflow-runtime/src/engine/WorkflowEngine.ts 中包含 "registerGate"
检查 packages/workflow-runtime/src/loaders/WorkflowDefinitionLoader.ts 中包含 "builtin"
npx tsc --noEmit --project packages/workflow-runtime/tsconfig.json
```

### 目标文件
- `packages/workflow-runtime/src/engine/WorkflowEngine.ts` — WorkflowEngine 扩展
- `packages/workflow-runtime/src/loaders/WorkflowDefinitionLoader.ts` — JSON 加载器
- `packages/workflow-runtime/src/engine/WorkflowLoader.ts` — Workflow 加载器

---

### TASK-25 GateRunner 重构

**Epic**: E4
**依赖**: T24
**预估工作量**: 2 天
**可并行**: 是（与 T16、T21、T26 并行）

### 描述

重构 GateRunner 基类，创建具体 Gate 实现子类。

1. 完善 `packages/workflow-runtime/src/GateRunner.ts`：
   - GateRegistry: `Map<string, new () => GateRunner>` 注册表
   - Gate 结果发射 `gate.executed` 事件
2. 创建具体 Gate 实现子类：
   - `packages/workflow-runtime/src/gates/RequirementsGateRunner.ts` — 封装 sf_requirements_gate 逻辑
   - `packages/workflow-runtime/src/gates/DesignGateRunner.ts` — 封装 sf_design_gate 逻辑
   - `packages/workflow-runtime/src/gates/TasksGateRunner.ts` — 封装 sf_tasks_gate 逻辑
   - `packages/workflow-runtime/src/gates/VerificationGateRunner.ts` — 封装 sf_verification_gate 逻辑
   - `packages/workflow-runtime/src/gates/StateTransitionGate.ts` — 状态转移验证 Gate
3. Gate 实现通过 Daemon 内部调用（非 HTTP），复用现有 Gate 核心逻辑

### 验收标准
- [ ] GateRegistry 正确注册 4+ 种 Gate
- [ ] 每个 Gate 实现正确执行检查逻辑
- [ ] Gate 通过/失败结果正确
- [ ] Gate 执行结果发射 gate.executed 事件

### verification_commands
```
检查 packages/workflow-runtime/src/gates/RequirementsGateRunner.ts 文件存在
检查 packages/workflow-runtime/src/gates/DesignGateRunner.ts 文件存在
检查 packages/workflow-runtime/src/gates/TasksGateRunner.ts 文件存在
检查 packages/workflow-runtime/src/gates/VerificationGateRunner.ts 文件存在
检查 GateRunner.ts 或 gates/index.ts 中包含 "GateRegistry" 或 "register"
npx tsc --noEmit --project packages/workflow-runtime/tsconfig.json
```

### 目标文件
- `packages/workflow-runtime/src/GateRunner.ts` — 基类 + 注册表
- `packages/workflow-runtime/src/gates/RequirementsGateRunner.ts`
- `packages/workflow-runtime/src/gates/DesignGateRunner.ts`
- `packages/workflow-runtime/src/gates/TasksGateRunner.ts`
- `packages/workflow-runtime/src/gates/VerificationGateRunner.ts`
- `packages/workflow-runtime/src/gates/StateTransitionGate.ts`
- `packages/workflow-runtime/src/gates/index.ts` — Gate 注册入口

---

### TASK-26 CompositeGateRunner

**Epic**: E4
**依赖**: T25
**预估工作量**: 2 天
**可并行**: 是（与 T21、T30 并行）

### 描述

实现复合 Gate 执行器，支持 sequential 和 parallel 两种模式。

1. 实现 CompositeGateRunner：
   - `sequential` 模式：按顺序执行子 Gate，fail_fast 策略下第一个失败即停止
   - `parallel` 模式：并行执行所有子 Gate，collect_all 策略收集所有结果
   - `fail_fast` 策略：任一子 Gate 失败立即返回
   - `collect_all` 策略：收集所有子 Gate 结果后汇总
2. 与 WorkflowEngine 集成：
   - workflow JSON 中定义 composite Gate 时自动使用 CompositeGateRunner
   - 支持 Gate 嵌套（composite 内包含 composite）
3. 结果聚合：
   - 汇总所有子 Gate 的结果
   - 生成聚合报告

### 验收标准
- [ ] sequential 模式按顺序执行子 Gate
- [ ] parallel 模式并行执行子 Gate
- [ ] fail_fast 策略第一个失败即停止
- [ ] collect_all 策略收集所有结果
- [ ] 支持嵌套 composite Gate

### verification_commands
```
检查 packages/workflow-runtime/src/GateRunner.ts 或相关文件中包含 "Composite"
检查 CompositeGateRunner 代码中包含 "sequential"
检查 CompositeGateRunner 代码中包含 "parallel"
检查 CompositeGateRunner 代码中包含 "fail_fast" 或 "collect_all"
npx tsc --noEmit --project packages/workflow-runtime/tsconfig.json
```

### 目标文件
- `packages/workflow-runtime/src/GateRunner.ts` — 添加 CompositeGateRunner 逻辑
- `packages/workflow-runtime/src/gates/index.ts` — 注册 composite gate

---

### TASK-27 删除 state_machine.ts + 重写 sf_state_transition

**Epic**: E4
**依赖**: T24, T25
**预估工作量**: 2 天
**可并行**: 是（与 T26 并行）

### 描述

删除 V5 硬编码状态机，确保所有引用已替换为 JSON 加载。

1. 删除 `.opencode/tools/lib/state_machine.ts`（235 行）
2. 验证所有 state_machine.ts 的引用已迁移：
   - `sf_state_transition_core.ts` 中的 VALID_TRANSITIONS 引用 → 改为 WorkflowEngine API
   - 其他任何引用 state_machine 的代码
3. 确保 sf_state_transition（Daemon 端）通过 WorkflowEngine 执行：
   - 不再直接查硬编码表
   - 通过 WorkflowEngine.transition() 执行
   - 支持所有 8 种 workflow 类型的状态转移
4. 等价性验证：对 8 种工作流的每条流转边进行等价性测试

### 验收标准
- [ ] state_machine.ts 文件已删除
- [ ] 代码库中无 state_machine 的 import 引用
- [ ] 8 种工作流的所有流转边行为与 V5 等价
- [ ] 非法状态转移被正确拦截

### verification_commands
```
检查 .opencode/tools/lib/state_machine.ts 文件不存在
搜索代码库中不包含 "from.*state_machine" 或 "import.*state_machine" 引用
检查 sf_state_transition 相关代码使用 WorkflowEngine API
npx vitest run --project workflow-runtime（运行等价性测试）
```

### 目标文件
- `.opencode/tools/lib/state_machine.ts` — **删除**
- `packages/workflow-runtime/src/engine/WorkflowEngine.ts` — 状态转移执行

---

### TASK-28 render-workflow-docs.ts

**Epic**: E4
**依赖**: T23, T24
**预估工作量**: 2 天
**可并行**: 是（与 T25-T27、T30 并行）

### 描述

实现 Markdown 文档自动生成脚本，从 workflow JSON 定义生成 agent.md 和 SKILL.md 的阶段表。

1. 实现 `scripts/render-workflow-docs.ts`：
   - `renderPhaseTable(definition)` — 从 JSON 生成 Markdown 阶段表
   - `renderAgentDoc(workflowId, agentRole)` — 生成 agent.md 的阶段描述
   - `renderSkillDoc(workflowId)` — 生成 SKILL.md 的工作流阶段表
2. 输出目标：
   - `.opencode/agents/sf-*.md` → 阶段表替换为 `<!-- AUTO-GENERATED -->` 区块
   - `.opencode/skills/sf-workflow-*/SKILL.md` → 阶段表替换为 auto-generated
3. 保留非阶段表内容不变（agent 职责描述、skill 使用说明等）
4. 生成内容格式与 V5 手写格式保持一致

### 验收标准
- [ ] 脚本能读取 8 个 JSON 文件并生成 Markdown
- [ ] 生成的阶段表格式与 V5 一致
- [ ] 非阶段表内容不被覆盖
- [ ] 生成的文档包含所有 agent 分配和 Gate 信息

### verification_commands
```
检查 scripts/render-workflow-docs.ts 文件存在
检查 render-workflow-docs.ts 中包含 "renderPhaseTable"
检查 render-workflow-docs.ts 中包含 "renderAgentDoc"
检查 render-workflow-docs.ts 中包含 "renderSkillDoc"
检查 render-workflow-docs.ts 中包含 "AUTO-GENERATED" 或 "auto-generated"
npx tsc --noEmit scripts/render-workflow-docs.ts
```

### 目标文件
- `scripts/render-workflow-docs.ts` — Markdown 自动生成脚本

---

### TASK-29 agent.md + SKILL.md auto-generated 区块

**Epic**: E4
**依赖**: T28
**预估工作量**: 2 天
**可并行**: 是（与 T26、T27、T31 并行）

### 描述

将 9 个 agent.md 和 8 个 workflow SKILL.md 中的硬编码阶段表替换为 auto-generated 区块，并执行生成。

1. 修改 9 个 agent.md：
   - 将硬编码的工作流阶段表替换为 `<!-- AUTO-GENERATED:START:workflows -->` 区块
   - 保留 agent 职责描述、约束、工具列表等不变
   - 文件：sf-orchestrator.md, sf-requirements.md, sf-design.md, sf-task-planner.md, sf-executor.md, sf-debugger.md, sf-reviewer.md, sf-verifier.md, sf-knowledge.md
2. 修改 8 个 workflow SKILL.md：
   - 将硬编码阶段表替换为 auto-generated 区块
   - 保留 skill 使用说明和特定指令不变
3. 执行 render-workflow-docs.ts 生成内容
4. 验证生成内容与 V5 原始阶段表语义一致

### 验收标准
- [ ] 9 个 agent.md 包含 auto-generated 区块
- [ ] 8 个 workflow SKILL.md 包含 auto-generated 区块
- [ ] 生成内容与 V5 阶段表语义一致
- [ ] 非 auto-generated 内容未被修改

### verification_commands
```
检查 .opencode/agents/sf-orchestrator.md 中包含 "AUTO-GENERATED"
检查 .opencode/agents/sf-executor.md 中包含 "AUTO-GENERATED"
检查 .opencode/skills/sf-workflow-feature-spec/SKILL.md 中包含 "AUTO-GENERATED"
检查 .opencode/skills/sf-workflow-bugfix-spec/SKILL.md 中包含 "AUTO-GENERATED"
验证 9 个 agent.md 文件都包含 auto-generated 标记
验证 8 个 workflow SKILL.md 都包含 auto-generated 标记
```

### 目标文件
- `.opencode/agents/sf-orchestrator.md` — 替换阶段表
- `.opencode/agents/sf-requirements.md` — 替换阶段表
- `.opencode/agents/sf-design.md` — 替换阶段表
- `.opencode/agents/sf-task-planner.md` — 替换阶段表
- `.opencode/agents/sf-executor.md` — 替换阶段表
- `.opencode/agents/sf-debugger.md` — 替换阶段表
- `.opencode/agents/sf-reviewer.md` — 替换阶段表
- `.opencode/agents/sf-verifier.md` — 替换阶段表
- `.opencode/agents/sf-knowledge.md` — 替换阶段表
- `.opencode/skills/sf-workflow-feature-spec/SKILL.md` — 替换阶段表
- `.opencode/skills/sf-workflow-design-first/SKILL.md` — 替换阶段表
- `.opencode/skills/sf-workflow-bugfix-spec/SKILL.md` — 替换阶段表
- `.opencode/skills/sf-workflow-quick-change/SKILL.md` — 替换阶段表
- `.opencode/skills/sf-workflow-change-request/SKILL.md` — 替换阶段表
- `.opencode/skills/sf-workflow-refactor/SKILL.md` — 替换阶段表
- `.opencode/skills/sf-workflow-ops-task/SKILL.md` — 替换阶段表
- `.opencode/skills/sf-workflow-investigation/SKILL.md` — 替换阶段表

---

### TASK-30 Workflow Loader 注册机制

**Epic**: E4
**依赖**: T24
**预估工作量**: 1 天
**可并行**: 是（与 T25-T29 并行）

### 描述

实现 workflow 定义的加载、注册和运行时管理机制。

1. 实现 `packages/workflow-runtime/src/engine/WorkflowLoader.ts` 扩展：
   - 内置 workflow 自动扫描和注册
   - 运行时热加载：支持新增/修改 workflow 文件后重新加载
   - workflow 版本管理：检查 schema_version 兼容性
2. 实现 Workflow 注册表：
   - `Map<string, WorkflowDefinitionFile>` 存储已加载的 workflow
   - `getWorkflow(id)` 获取指定 workflow
   - `listWorkflows()` 列出所有已注册 workflow
3. 与 Daemon 启动流程集成：
   - Daemon 启动时自动加载所有内置 workflow
   - 加载失败时记录错误但不阻止启动

### 验收标准
- [ ] Daemon 启动时自动加载 8 个内置 workflow
- [ ] workflow 列表 API 返回所有已注册 workflow
- [ ] 热加载支持运行时刷新
- [ ] schema_version 不兼容时报告错误

### verification_commands
```
检查 packages/workflow-runtime/src/engine/WorkflowLoader.ts 中包含 "loadBuiltin" 或 "builtin"
检查 WorkflowLoader 中包含 "register" 或 "registry"
检查 WorkflowLoader 中包含 "hotReload" 或 "reload" 或 "refresh"
npx tsc --noEmit --project packages/workflow-runtime/tsconfig.json
```

### 目标文件
- `packages/workflow-runtime/src/engine/WorkflowLoader.ts` — 加载器扩展

---

### TASK-31 E4 集成测试

**Epic**: E4
**依赖**: T26, T27, T30
**预估工作量**: 3 天
**可并行**: 否

### 描述

为 E4 Workflow Runtime 编写全面的集成测试，包括 8 种工作流的等价性验证。

1. JSON 加载测试：
   - 8 个 workflow JSON 正确加载和验证
   - 非法 JSON 报告错误
2. 状态转移测试（覆盖 8 张流转表的每条边）：
   - 所有合法状态转移正确执行（ST-002）
   - 非法状态转移被拦截（ST-003）
   - 条件分支（pass/fail）正确工作
3. Gate 执行测试（GT-001~004）：
   - 4 种 Gate 通过和失败场景
   - Composite Gate 的 sequential 和 parallel 模式
   - Gate 结果事件正确发射
4. PBT 属性测试：
   - PBT-WF-01: A 到 B 可达性
   - PBT-WF-02: 终态可达
   - PBT-WF-03: 无循环
   - PBT-WF-04: Gate 结果正确性
   - PBT-WF-05: 迁移等价性（关键）
5. Markdown 生成测试：
   - 自动生成内容与 V5 阶段表一致

### 验收标准
- [ ] 8 种工作流的所有流转边测试通过
- [ ] 所有 PBT 属性测试通过
- [ ] Gate 集成测试通过
- [ ] 迁移等价性验证通过（PBT-WF-05 最关键）

### verification_commands
```
检查 packages/workflow-runtime/tests/integration/ 目录存在
检查集成测试文件中包含 "state-transition" 或 "state_machine"
检查集成测试文件中包含 "GateRunner" 或 "gate"
检查集成测试文件中包含 "equivalence" 或 "等价"
npx vitest run --project workflow-runtime
```

### 目标文件
- `packages/workflow-runtime/tests/integration/workflow-loading.test.ts` — JSON 加载测试
- `packages/workflow-runtime/tests/integration/state-transitions.test.ts` — 状态转移测试
- `packages/workflow-runtime/tests/integration/gate-execution.test.ts` — Gate 执行测试
- `packages/workflow-runtime/tests/pbt/workflow-properties.test.ts` — PBT 属性测试
- `packages/workflow-runtime/tests/integration/migration-equivalence.test.ts` — 迁移等价性测试

---

## Epic 5: Skill Loader 强制化

> 建立 Skill Registry，在 phase-enter 时强制加载对应 skill。
> 依赖 E4 完成（需要 workflow JSON 中的 phase 定义和 skill 映射）。

---

### TASK-32 Skill Registry

**Epic**: E5
**依赖**: T31
**预估工作量**: 2 天
**可并行**: 否

### 描述

建立 Skill Registry，管理所有 Skill 的注册、查询和加载。

1. 实现 `packages/daemon-core/src/extensions/skill/SkillRegistry.ts`：
   - `registerFromDirectory(dirPath)` — 扫描 `.opencode/skills/` 注册所有 Skill
   - `registerSkill(skill)` — 注册单个 Skill
   - `findSkills(workflowId, phase)` — 查找匹配某 phase 的 Skill 列表
   - `loadSkill(name)` — 强制加载指定 Skill 的内容
   - `loadPhaseSkills(workflowId, phase)` — 批量加载匹配的 Skill
2. SkillDefinition 数据模型：
   - name, description, filePath
   - workflowPattern, phasePattern
   - autoload: 'always' | 'workflow_match' | 'phase_match' | 'manual'
3. Skill 匹配逻辑：
   - `SkillMatcher.match(workflowId, phase, skill)` — 判断 Skill 是否匹配当前上下文
4. 扫描 17 个 SKILL.md 文件并注册

### 验收标准
- [ ] 扫描所有 17 个 SKILL.md 并成功注册（SK-001）
- [ ] 按 workflow + phase 正确匹配 Skill
- [ ] Skill 内容可正确加载

### verification_commands
```
检查 packages/daemon-core/src/extensions/skill/SkillRegistry.ts 文件存在
检查 SkillRegistry.ts 中包含 "registerFromDirectory"
检查 SkillRegistry.ts 中包含 "findSkills"
检查 SkillRegistry.ts 中包含 "loadPhaseSkills"
检查 packages/daemon-core/src/extensions/skill/SkillMatcher.ts 文件存在
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/extensions/skill/SkillRegistry.ts` — Skill 注册表
- `packages/daemon-core/src/extensions/skill/SkillMatcher.ts` — Skill 匹配逻辑
- `packages/daemon-core/src/extensions/skill/types.ts` — Skill 类型定义

---

### TASK-33 Phase-enter 强制加载

**Epic**: E5
**依赖**: T32
**预估工作量**: 2 天
**可并行**: 否

### 描述

实现 phase-enter 时的 Skill 强制加载机制，不再依赖 LLM 自觉调用。

1. 实现 PhaseEnterInterceptor：
   - WorkflowEngine.transition() → 状态变更后自动触发
   - WorkflowEngine.getStateSkills(instanceId, newState) → 获取 workflow JSON 定义的 Skill 列表
   - SkillRegistry.findSkills(workflowId, newState) → 查找匹配的 Skill
   - SkillRegistry.loadPhaseSkills(workflowId, newState) → 强制加载
   - 将 Skill content 注入到 Agent 的系统 prompt
2. 事件发射：
   - 每次 Skill 加载发射 `skill.loaded` 事件
   - 事件包含 skillName, workflowId, phase, autoloadStrategy, size
3. 与 AgentRunner 集成：
   - Agent 开始执行前确认所有匹配 Skill 已注入
   - 验证 Skill 注入后 Agent 上下文中包含 Skill 内容

### 验收标准
- [ ] 每个 phase-enter 时正确加载匹配的 Skill（SK-002）
- [ ] Skill 内容注入到 Agent 系统提示
- [ ] 不依赖 LLM 调用 `skill` tool
- [ ] 每次加载发射 skill.loaded 事件

### verification_commands
```
检查 PhaseEnterInterceptor 实现代码中包含 "getStateSkills"
检查 PhaseEnterInterceptor 实现代码中包含 "loadPhaseSkills"
检查 PhaseEnterInterceptor 实现代码中包含 "skill.loaded"
检查 Agent 集成代码中包含 "injectSkill" 或 "systemPrompt" + "skill"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/extensions/skill/SkillLoader.ts` — Skill 加载器
- `packages/workflow-runtime/src/engine/AgentWorkflowEngine.ts` — phase-enter 拦截

---

### TASK-34 Autoload 策略调整

**Epic**: E5
**依赖**: T33
**预估工作量**: 1 天
**可并行**: 否

### 描述

实现 4 种 Autoload 策略，并为 17 个 Skill 配置正确的策略。

1. 实现 4 种 Autoload 策略：
   - `always`: 任何 phase-enter 都加载（如 superpowers-engineering-lessons）
   - `workflow_match`: 匹配 workflow 类型时加载（如 sf-workflow-* SKILL.md）
   - `phase_match`: 匹配 phase 时加载（如 superpowers-brainstorming 在 requirements phase）
   - `manual`: 仅 LLM 调用 `skill` tool 时加载（保留 V5 兼容方式）
2. 为 17 个 Skill 配置 autoload 策略：
   - 8 个 workflow SKILL.md → `workflow_match`
   - superpowers-engineering-lessons → `always`
   - superpowers-brainstorming → `phase_match`（requirements phase）
   - 其余 superpowers → `manual` 或 `phase_match`
3. 运行时 Skill 注册表刷新：支持动态更新

### 验收标准
- [ ] 4 种 autoload 策略行为正确
- [ ] 17 个 Skill 配置了正确的策略
- [ ] 运行时可刷新注册表

### verification_commands
```
检查 autoload 策略配置文件包含 "always" 和 "workflow_match" 和 "phase_match" 和 "manual"
检查 17 个 SKILL.md 或其元数据中包含 autoload 配置
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/extensions/skill/SkillRegistry.ts` — 策略逻辑
- `.opencode/skills/*/SKILL.md` — autoload 配置（frontmatter 或 metadata）

---

## Epic 6: Agent Roster 自动化触发

> 实现重试计数硬执行和 completed 后 sf-knowledge 自动触发。
> 依赖 E5 完成。

---

### TASK-35 重试计数硬执行

**Epic**: E6
**依赖**: T34
**预估工作量**: 2 天
**可并行**: 否

### 描述

实现 Daemon 级别的重试计数硬执行，替代 V5 中依赖自然语言指令的重试机制。

1. 实现 `packages/daemon-core/src/retry/RetryCounter.ts`：
   - `recordFailure(workItemId, phase, error)` — Gate 失败时记录
   - `isBlocked(workItemId)` — 检查是否达到阈值
   - `getState(workItemId)` — 获取重试状态
   - `maxAttempts` 配置：默认 3 次
2. RetryState 状态机：
   - `active` → 正常重试
   - `blocked` → 达到阈值，需要人工介入
   - `escalated` → 已升级到 debugger
3. 达到阈值时自动行为：
   - 状态变为 `blocked`
   - 发射 `agent.roster.retry_exhausted` 事件
   - Orchestrator 收到事件后调度 sf-debugger
4. 通过 Daemon Event Bus 订阅 `gate.executed (failed)` 事件触发计数

### 验收标准
- [ ] 重试计数精确（SK-004）
- [ ] 达到阈值时自动转为 blocked
- [ ] 发射 retry_exhausted 事件
- [ ] 重试状态正确追踪

### verification_commands
```
检查 packages/daemon-core/src/retry/RetryCounter.ts 文件存在
检查 RetryCounter.ts 中包含 "recordFailure"
检查 RetryCounter.ts 中包含 "isBlocked"
检查 RetryCounter.ts 中包含 "retry_exhausted" 或 "maxAttempts"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/retry/RetryCounter.ts` — 重试计数器
- `packages/daemon-core/src/retry/types.ts` — 重试状态类型

---

### TASK-36 completed 后 sf-knowledge 自动触发

**Epic**: E6
**依赖**: T34
**预估工作量**: 1 天
**可并行**: 是（与 T35 并行）

### 描述

实现 workflow.completed 事件触发 sf-knowledge agent 自动执行知识提取。

1. 实现 `packages/daemon-core/src/agent/KnowledgeTrigger.ts`：
   - 订阅 `workflow.completed` 事件
   - 自动调度 sf-knowledge agent：
     - `spawnAgent({ agentRole: "sf-knowledge", workItemId, ... })`
   - 发射 `knowledge.extraction.triggered` 事件
2. sf-knowledge agent 执行：
   - 读取当前 WI 的 requirements + design + tasks
   - 调用 sf_knowledge_base 添加知识条目
   - 调用 sf_knowledge_graph 同步节点
3. 触发结果记录：
   - 成功：`knowledge.extraction.completed`
   - 失败：`knowledge.extraction.failed`（不阻塞 workflow 完成）

### 验收标准
- [ ] completed 后 sf-knowledge 自动触发（SK-005）
- [ ] 知识提取结果正确写入
- [ ] 提取失败不阻塞 workflow

### verification_commands
```
检查 packages/daemon-core/src/agent/KnowledgeTrigger.ts 文件存在
检查 KnowledgeTrigger.ts 中包含 "workflow.completed"
检查 KnowledgeTrigger.ts 中包含 "knowledge.extraction.triggered"
检查 KnowledgeTrigger.ts 中包含 "spawnAgent" 或 "sf-knowledge"
npx tsc --noEmit --project packages/daemon-core/tsconfig.json
```

### 目标文件
- `packages/daemon-core/src/agent/KnowledgeTrigger.ts` — Knowledge 自动触发

---

### TASK-37 sf-orchestrator.md 瘦身

**Epic**: E6
**依赖**: T29, T35, T36
**预估工作量**: 1 天
**可并行**: 否

### 描述

精简 sf-orchestrator.md，移除已由 Daemon 机制替代的硬编码指令。

1. 保留内容：
   - Agent 职责描述 ✅
   - 工具使用说明 ✅
   - 工作流阶段表 → auto-generated ✅（T29 已处理）
2. 移除内容：
   - ❌ 重试逻辑的自然语言指令 → 由 RetryCounter（T35）替代
   - ❌ Knowledge 提取的手动调度指令 → 由 KnowledgeTrigger（T36）替代
   - ❌ 8 种工作流的硬编码阶段表 → 已在 T29 替换
3. 添加 auto-generated 占位符说明

### 验收标准
- [ ] sf-orchestrator.md 不包含硬编码重试指令
- [ ] sf-orchestrator.md 不包含手动 knowledge 调度指令
- [ ] 职责描述和工具说明完整保留
- [ ] 阶段表为 auto-generated 区块

### verification_commands
```
检查 .opencode/agents/sf-orchestrator.md 中包含 "AUTO-GENERATED"
检查 sf-orchestrator.md 中不包含硬编码的重试逻辑（如 "重试 3 次" 的自然语言指令）
检查 sf-orchestrator.md 中不包含手动 knowledge 调度指令
```

### 目标文件
- `.opencode/agents/sf-orchestrator.md` — 瘦身

---

## Epic 7: Adapter & Thin Plugin Cutover

> 最终切换 Epic，实现 Thin Plugin、删除旧代码、CLI 命令。
> 依赖 E1-E6 全部完成。
> 完成后 V5 代码完全移除，V6.0 发版。

---

### TASK-38 OpenCodeAdapter 实现

**Epic**: E7
**依赖**: T37
**预估工作量**: 3 天
**可并行**: 否

### 描述

扩展 OpenCodeAdapter，实现 Tool 调用代理和 Daemon 连接管理。

1. 扩展 `packages/opencode-adapter/src/OpenCodeAdapter.ts`：
   - `invokeTool(toolName, args)` — 将 tool 调用转发到 Daemon HTTP API
   - `registerToolMapping(toolName, endpoint)` — 注册 tool 映射
   - 从 Handshake 文件获取 Daemon 地址和 Token
2. Session Binding 增强：
   - 每次 HTTP 请求携带 X-Session-Id, X-Agent-Role, X-Work-Item-Id 头
   - 自动从 OpenCode SDK 上下文获取 agent 信息
3. On-Demand Daemon Startup：
   - 检测 Daemon 是否运行（读取 handshake.json）
   - 未运行时自动调用 CLI 启动 Daemon
   - 启动后等待 handshake 文件就绪
4. 错误处理：
   - Daemon 不可用：自动重启（一次）
   - 连接超时：30s 超时返回错误
   - 版本不匹配：拒绝连接

### 验收标准
- [ ] invokeTool 正确转发到 Daemon
- [ ] Session 头正确携带
- [ ] Daemon 未运行时自动启动
- [ ] 错误处理降级正确

### verification_commands
```
检查 packages/opencode-adapter/src/OpenCodeAdapter.ts 中包含 "invokeTool"
检查 OpenCodeAdapter.ts 中包含 "X-Session-Id" 或 "X-Agent-Role"
检查 OpenCodeAdapter.ts 中包含 "handshake"
检查 OpenCodeAdapter.ts 中包含 "autoStart" 或 "on-demand"
npx tsc --noEmit --project packages/opencode-adapter/tsconfig.json
```

### 目标文件
- `packages/opencode-adapter/src/OpenCodeAdapter.ts` — 扩展实现

---

### TASK-39 Thin Plugin 实现（<5KB）

**Epic**: E7
**依赖**: T38
**预估工作量**: 2 天
**可并行**: 否

### 描述

实现共享 HTTP 客户端（thin-client.ts）和每个 tool 文件的 HTTP 壳模板。

1. 实现 `.opencode/tools/lib/thin-client.ts`（<5KB）：
   - DaemonClient 类：从 handshake.json 读取连接信息
   - `call(method, path, body)` — 统一 HTTP 调用
   - Bearer Token 自动注入
   - 错误处理：连接失败、超时、Daemon 不可用
   - 单例模式导出 `daemon`
2. Tool 壳文件模板：
   - 导入 `daemon` from `../lib/thin-client`
   - `handler(args, context)` → `daemon.call('POST', '/api/v1/tool/invoke', { tool, args, context })`
   - 每个文件 < 5KB

### 验收标准
- [ ] thin-client.ts 文件大小 < 5KB（TH-002）
- [ ] 从 handshake.json 正确读取连接信息
- [ ] HTTP 调用正确携带 Bearer Token
- [ ] 错误处理覆盖主要场景

### verification_commands
```
检查 .opencode/tools/lib/thin-client.ts 文件存在
检查 thin-client.ts 中包含 "DaemonClient" 或 "call"
检查 thin-client.ts 中包含 "handshake"
检查 thin-client.ts 中包含 "Bearer"
验证 thin-client.ts 文件大小 < 5120 字节
npx tsc --noEmit .opencode/tools/lib/thin-client.ts
```

### 目标文件
- `.opencode/tools/lib/thin-client.ts` — 共享 HTTP 客户端（<5KB）

---

### TASK-40 18 个工具改写为 HTTP 客户端壳

**Epic**: E7
**依赖**: T39
**预估工作量**: 3 天
**可并行**: 否

### 描述

将 18 个 sf_*.ts tool 文件从包含完整业务逻辑的文件改写为纯 HTTP 客户端壳。

18 个工具文件改写清单：

| # | 文件 | Daemon 内部实现 |
|---|------|----------------|
| 1 | `sf_state_transition.ts` | StateManager.transition() |
| 2 | `sf_state_read.ts` | StateManager.read() |
| 3 | `sf_artifact_write.ts` | ArtifactWriter |
| 4 | `sf_context_build.ts` | ContextBuilder |
| 5 | `sf_continuity.ts` | ContinuityManager |
| 6 | `sf_cost_report.ts` | CostReport |
| 7 | `sf_knowledge_base.ts` | KnowledgeBase |
| 8 | `sf_knowledge_graph.ts` | KnowledgeGraph |
| 9 | `sf_knowledge_query.ts` | KnowledgeQuery |
| 10 | `sf_design_gate.ts` | DesignGateRunner |
| 11 | `sf_requirements_gate.ts` | RequirementsGateRunner |
| 12 | `sf_tasks_gate.ts` | TasksGateRunner |
| 13 | `sf_verification_gate.ts` | VerificationGateRunner |
| 14 | `sf_doc_lint.ts` | DocLint |
| 15 | `sf_trace_matrix.ts` | TraceMatrix |
| 16 | `sf_batch_verify.ts` | BatchVerify |
| 17 | `sf_doctor.ts` | Doctor (自检) |
| 18 | `sf_safe_bash.ts` | SafeBash |

每个文件统一模式：
```typescript
import { daemon } from '../lib/thin-client';
export const tool = {
  name: 'sf_xxx',
  description: '...',
  async handler(args, context) {
    return await daemon.call('POST', '/api/v1/tool/invoke', { tool: 'sf_xxx', args, context });
  }
};
```

### 验收标准
- [ ] 18 个 tool 文件全部改写为 HTTP 壳
- [ ] 每个文件大小 < 5KB（TH-002）
- [ ] 每个文件只导入 thin-client，无其他依赖
- [ ] HTTP 调用正确转发到 Daemon（TH-001）
- [ ] 错误处理：Daemon 不可用时返回明确错误（TH-003）

### verification_commands
```
检查 .opencode/tools/sf_state_transition.ts 中包含 "thin-client"
检查 .opencode/tools/sf_knowledge_base.ts 中包含 "thin-client"
检查 .opencode/tools/sf_safe_bash.ts 中包含 "thin-client"
验证 18 个 sf_*.ts 文件都不包含 "import" 除 thin-client 外的业务逻辑导入
验证每个 tool 文件大小 < 5120 字节
npx tsc --noEmit（验证所有 tool 文件编译通过）
```

### 目标文件
- `.opencode/tools/sf_state_transition.ts` — HTTP 壳
- `.opencode/tools/sf_state_read.ts` — HTTP 壳
- `.opencode/tools/sf_artifact_write.ts` — HTTP 壳
- `.opencode/tools/sf_context_build.ts` — HTTP 壳
- `.opencode/tools/sf_continuity.ts` — HTTP 壳
- `.opencode/tools/sf_cost_report.ts` — HTTP 壳
- `.opencode/tools/sf_knowledge_base.ts` — HTTP 壳
- `.opencode/tools/sf_knowledge_graph.ts` — HTTP 壳
- `.opencode/tools/sf_knowledge_query.ts` — HTTP 壳
- `.opencode/tools/sf_design_gate.ts` — HTTP 壳
- `.opencode/tools/sf_requirements_gate.ts` — HTTP 壳
- `.opencode/tools/sf_tasks_gate.ts` — HTTP 壳
- `.opencode/tools/sf_verification_gate.ts` — HTTP 壳
- `.opencode/tools/sf_doc_lint.ts` — HTTP 壳
- `.opencode/tools/sf_trace_matrix.ts` — HTTP 壳
- `.opencode/tools/sf_batch_verify.ts` — HTTP 壳
- `.opencode/tools/sf_doctor.ts` — HTTP 壳
- `.opencode/tools/sf_safe_bash.ts` — HTTP 壳

---

### TASK-41 删除旧代码（plugin entry + _core.ts + utils.ts）

**Epic**: E7
**依赖**: T40
**预估工作量**: 1 天
**可并行**: 否

### 描述

删除所有 V5 旧代码，确保无残留。

完全删除的文件：

| 文件 | 行数 | 说明 |
|------|------|------|
| `.opencode/tools/lib/sf_specforge_plugin_entry.ts` | 2904 行, ~102KB | V5 统一入口 |
| `.opencode/tools/lib/sf_state_transition_core.ts` | 397+ 行 | 状态流转核心 |
| `.opencode/tools/lib/sf_state_read_core.ts` | ~300 行 | 状态读取核心 |
| `.opencode/tools/lib/state_machine.ts` | 235 行 | 硬编码状态机（已在 T27 删除，此任务验证） |
| `.opencode/tools/lib/sf_conversation_recorder_core.ts` | 312 行 | 会话记录核心 |

从 `utils.ts` 中删除的函数：
- `appendJsonl`
- `recordGateResult`
- `writeLog`

验证：搜索代码库确保无残留引用。

### 验收标准
- [ ] 5 个核心旧文件完全删除
- [ ] utils.ts 中 3 个函数已删除
- [ ] 代码库中无对已删除文件的 import 引用
- [ ] 编译通过（无断引用）

### verification_commands
```
检查 .opencode/tools/lib/sf_specforge_plugin_entry.ts 文件不存在
检查 .opencode/tools/lib/sf_state_transition_core.ts 文件不存在
检查 .opencode/tools/lib/sf_state_read_core.ts 文件不存在
检查 .opencode/tools/lib/state_machine.ts 文件不存在
检查 .opencode/tools/lib/sf_conversation_recorder_core.ts 文件不存在
检查 .opencode/tools/lib/utils.ts 中不包含 "appendJsonl"
检查 .opencode/tools/lib/utils.ts 中不包含 "recordGateResult"
检查 .opencode/tools/lib/utils.ts 中不包含 "writeLog"
搜索代码库中不包含 "sf_specforge_plugin_entry" 引用
搜索代码库中不包含 "sf_state_transition_core" 引用
搜索代码库中不包含 "sf_conversation_recorder_core" 引用
npx tsc --noEmit（验证编译通过）
```

### 目标文件
- `.opencode/tools/lib/sf_specforge_plugin_entry.ts` — **删除**
- `.opencode/tools/lib/sf_state_transition_core.ts` — **删除**
- `.opencode/tools/lib/sf_state_read_core.ts` — **删除**
- `.opencode/tools/lib/state_machine.ts` — **验证已删除**
- `.opencode/tools/lib/sf_conversation_recorder_core.ts` — **删除**
- `.opencode/tools/lib/utils.ts` — 删除 3 个函数

---

### TASK-42 CLI 命令

**Epic**: E7
**依赖**: T38
**预估工作量**: 2 天
**可并行**: 是（与 T39-T41 并行）

### 描述

实现 SpecForge CLI 命令，提供 Daemon 管理和工作流查看功能。

1. 实现 `packages/cli/src/cli.ts` 入口
2. Daemon 管理命令：
   - `specforge daemon start [--foreground]` — 启动 Daemon（默认 detached）
   - `specforge daemon stop` — 停止 Daemon
   - `specforge daemon status` — 查看状态（PID、端口、运行时间）
   - `specforge daemon restart` — 重启
3. 诊断命令：
   - `specforge doctor` — 系统自检（检查 Daemon 运行、配置、workflow 加载）
4. 工作流命令：
   - `specforge workflow list` — 列出所有 workflow
   - `specforge workflow show <id>` — 查看 workflow 定义
5. 配置命令：
   - `specforge config view` — 查看配置
   - `specforge config set <key> <value>` — 设置配置

### 验收标准
- [ ] `specforge daemon start` 启动 Daemon（CL-001）
- [ ] `specforge daemon stop` 停止 Daemon
- [ ] `specforge daemon status` 显示状态
- [ ] `specforge doctor` 系统自检（CL-002）
- [ ] `specforge workflow list` 列出 8 个 workflow

### verification_commands
```
检查 packages/cli/src/cli.ts 文件存在
检查 packages/cli/src/commands/start.ts 文件存在
检查 packages/cli/src/commands/stop.ts 文件存在
检查 packages/cli/src/commands/status.ts 文件存在
检查 packages/cli/src/cli.ts 或 commands 中包含 "daemon start"
检查 packages/cli/src/cli.ts 或 commands 中包含 "doctor"
npx tsc --noEmit --project packages/cli/tsconfig.json
```

### 目标文件
- `packages/cli/src/cli.ts` — CLI 入口
- `packages/cli/src/commands/start.ts` — daemon start
- `packages/cli/src/commands/stop.ts` — daemon stop
- `packages/cli/src/commands/status.ts` — daemon status
- `packages/cli/src/commands/workflow.ts` — workflow 命令

---

### TASK-43 opencode.json + 安装器调整

**Epic**: E7
**依赖**: T40, T42
**预估工作量**: 1 天
**可并行**: 否

### 描述

调整 opencode.json 配置文件，添加 Daemon 配置项，确保 Thin Plugin 正确注册。

1. 修改 `opencode.json`：
   - 保持 18 个 tool 文件引用路径不变（内容已改为 HTTP 壳）
   - 添加 Daemon 配置：
     ```json
     {
       "specforge": {
         "daemon": {
           "enabled": true,
           "port": 0,
           "autoStart": true,
           "detached": true,
           "idleTimeoutMs": 30000,
           "workflowsDir": "~/.config/specforge/workflows/builtin"
         }
       }
         }
     ```
2. 确保安装器正确部署：
   - 8 个 workflow JSON 文件复制到 `~/.config/specforge/workflows/builtin/`
   - 配置文件默认值正确
3. 目录迁移提示：
   - 如存在 `specforge/` 目录，提示用户重命名为 `.specforge/`

### 验收标准
- [ ] opencode.json 包含 specforge.daemon 配置
- [ ] 18 个 tool 路径引用正确
- [ ] Daemon 配置项完整
- [ ] 安装器正确部署 workflow JSON 文件

### verification_commands
```
检查 opencode.json 中包含 "specforge"
检查 opencode.json 中包含 "daemon"
检查 opencode.json 中包含 "autoStart"
检查 opencode.json 中包含 "workflowsDir"
验证 18 个 tool 文件路径引用存在
```

### 目标文件
- `opencode.json` — 配置文件调整
- `packages/configuration/` — 配置管理（如需修改）

---

### TASK-44 E7 集成测试 + e2e 端到端测试

**Epic**: E7
**依赖**: T41, T42, T43
**预估工作量**: 3 天
**可并行**: 否

### 描述

为 E7 编写集成测试和端到端测试，验证完整的 V6 系统工作。

1. Tool HTTP 壳集成测试：
   - 18 个工具逐一验证 HTTP 转发正确性（TH-001）
   - 每个工具壳文件大小 < 5KB 验证（TH-002）
   - Daemon 不可用降级测试（TH-003）
   - 超时处理测试（TH-004）
2. CLI 集成测试：
   - Daemon start/stop/status 生命周期
   - 健康检查
   - 端口冲突处理（CL-003）
3. 端到端工作流测试（E2E）：
   - E2E-001: Feature Spec 完整流程（intake → completed）
   - E2E-002: Bugfix Spec 完整流程
   - E2E-003: Change Request 完整流程
   - E2E-004: Quick Change 完整流程
   - E2E-005: Refactor 完整流程
   - E2E-006: Ops Task 完整流程
   - E2E-007: Investigation 完整流程
   - E2E-008: Design-First 完整流程
4. 旧代码删除验证：
   - 确认所有 V5 旧文件已删除
   - 确认无残留引用
   - 编译通过

### 验收标准
- [ ] 18 个工具 HTTP 调用全部正确
- [ ] 所有工具壳文件 < 5KB
- [ ] Feature Spec e2e 测试完整通过
- [ ] 至少 3 种其他工作流 e2e 测试通过
- [ ] V5 旧代码完全清除

### verification_commands
```
检查 e2e 测试文件存在
检查 e2e 测试文件中包含 "feature_spec" 和 "intake" 和 "completed"
检查 e2e 测试文件中包含 "bugfix_spec" 或 "quick_change"
运行 e2e 测试：npx vitest run tests/e2e/
验证编译通过：npx tsc --noEmit
验证 V5 旧文件不存在
```

### 目标文件
- `tests/e2e/feature-spec-workflow.test.ts` — Feature Spec e2e
- `tests/e2e/bugfix-spec-workflow.test.ts` — Bugfix Spec e2e
- `tests/e2e/tool-http-shells.test.ts` — Tool HTTP 壳测试
- `tests/e2e/cli-commands.test.ts` — CLI 集成测试
- `tests/e2e/v5-cleanup-verification.test.ts` — 旧代码清理验证

---

## 执行顺序摘要

### Phase 1: M1 基石 (T+4w)
| 任务 | Epic | 依赖 | 工作量 |
|------|------|------|--------|
| T01 | E1 | 无 | 3 天 |
| T02 | E1 | T01 | 3 天 |
| T03 | E1 | T02 | 2 天 |
| T04 | E1 | T02 | 2 天 |
| T05 | E1 | T01 | 1 天 |
| T06 | E1 | T01 | 2 天 |
| T07 | E1 | T01 | 1 天 |
| T08 | E1 | T02,T06,T07 | 3 天 |
| T09 | E1 | T03,T04,T05,T07,T08 | 2 天 |
| T10 | E1 | T09 | 3 天 |

**M1 总工作量**: ~22 天（串行约 4 周）

### Phase 2: M2 三向并行 (T+9w)
| 任务 | Epic | 依赖 | 工作量 |
|------|------|------|--------|
| T11-T16 | E2 | T10 | 各 1-2 天 |
| T17-T21 | E3 | T10 | 各 1-3 天 |
| T22-T31 | E4 | T10 | 各 1-3 天 |

**M2 总工作量**: ~35 天（3 个 Epic 并行约 5 周）

### Phase 3: M3 自动化收尾 (T+11w)
| 任务 | Epic | 依赖 | 工作量 |
|------|------|------|--------|
| T32-T34 | E5 | T31 | 各 1-2 天 |
| T35-T37 | E6 | T34 | 各 1-2 天 |

**M3 总工作量**: ~7 天（约 2 周）

### Phase 4: M4 切换发版 (T+14w)
| 任务 | Epic | 依赖 | 工作量 |
|------|------|------|--------|
| T38 | E7 | T37 | 3 天 |
| T39 | E7 | T38 | 2 天 |
| T40 | E7 | T39 | 3 天 |
| T41 | E7 | T40 | 1 天 |
| T42 | E7 | T38 | 2 天 |
| T43 | E7 | T40,T42 | 1 天 |
| T44 | E7 | T41,T42,T43 | 3 天 |

**M4 总工作量**: ~15 天（约 3 周）

---

## 测试覆盖映射

| 回归测试项 | 覆盖 Task |
|-----------|----------|
| ST-001~009 状态管理 | T02, T10, T24, T31, T44 |
| GT-001~004 Gate 检查 | T25, T31, T44 |
| TH-001~004 Tool HTTP 壳 | T40, T44 |
| E2E-001~008 端到端 | T44 |
| OB-001~005 Observability | T12, T13, T16 |
| PM-001~006 Permission | T17, T19, T21 |
| SK-001~005 Skill & Agent | T32, T33, T35, T36 |
| CL-001~003 CLI | T42, T44 |
