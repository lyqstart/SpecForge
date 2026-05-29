# TASK-11 工作日志：实现 HTTPServer Ingest 事件路由

## 任务摘要

在 `HTTPServer.ts` 中新增精确路由 `POST /api/v1/ingest/event`，实现 7 种事件类型到子系统的分发路由，补全 v6.0 原插件在 daemon 侧缺失的事件处理功能。

## 执行过程

### 1. 阅读上下文文件
- 读取 `design_delta.md` 了解 DD-B2/B3/B5/B7 段设计
- 读取当前 `HTTPServer.ts` 了解现有路由架构、依赖注入模式
- 读取 `SessionRegistry.ts` 确认 `touch()`, `getProjectPath()`, `handleOpenCodeEvent()`, `registerPluginSession()` 接口
- 读取 `DaemonConfig.ts` 确认 `getMode()` 接口
- 读取 `RecoverySubsystem.ts` 确认 `saveCheckpoint()` 接口
- 读取 `types.ts` 了解 Event 类型结构

### 2. 编写测试（TDD）
在 `http.test.ts` 中新增 `HTTPServer Ingest Event Endpoint` describe 块，共 12 个测试用例：
- 400 invalid JSON
- tool.invoking → PermissionEngine.evaluate() + SessionRegistry.touch()
- tool.invoked → EventLogger.append()
- opencode.event → SessionRegistry.handleOpenCodeEvent()
- session.compacting → RecoverySubsystem.saveCheckpoint()
- chat.params → EventLogger.append()
- chat.headers → EventLogger.append()
- shell.env → 返回环境变量
- 向后兼容：无 sessionId 仍返回 200
- 未知事件类型 → 200 + WARNING
- 子系统失败 → 仍返回 200
- 需要认证

每个测试使用真实 HTTP 请求验证响应码和数据，Mock 依赖追踪子系统调用。

### 3. 实现代码

#### HTTPServerDeps 接口扩展
- 新增 `recoverySubsystem?: any` 字段

#### 路由注册
- 在 `registerDefaultRoutes()` 中新增 `this.addExactRoute('POST', '/api/v1/ingest/event', this.handleIngestEvent.bind(this))`

#### handleIngestEvent（CP-4 15s 超时）
- 解析JSON，400 非法格式
- 无 sessionId → 记录 WARNING 并兜底处理
- 使用 `responded` 标志防止双重响应（15s 超时 vs 正常处理）
- `Promise.race` 确保 15s 内返回
- 事件路由失败不返回 500，记录 ERROR 后返回 200

#### routeIngestEvent（事件类型→子系统分发）
- switch on type，调用对应 handler
- shell.env 特殊处理：返回 env 数据附加到响应中
- 未知类型 → console.warn

#### 7 个 handler 方法
| Handler | 子系统调用 | 超时 | 失败策略 |
|---------|-----------|------|---------|
| handleToolInvoking | PE.evaluate() + SR.touch() | 5s | 默认 allow |
| handleToolInvoked | EL.append() | 3s | 丢失日志 |
| handleOpenCodeEvent | SR.handleOpenCodeEvent() | 2s | 记录 WARNING |
| handleSessionCompacting | RS.saveCheckpoint() | 10s | 记录 ERROR |
| handleChatParams | EL.append() | 3s | 丢失日志 |
| handleChatHeaders | EL.append() | 3s | 丢失日志 |
| handleShellEnv | 返回 env vars | 2s | 返回 {} |

#### withTimeout 工具方法
- 使用 `Promise.race` + `setTimeout` 实现超时
- 超时或异常时返回 fallback 值

### 4. 验证
- 运行 `npx vitest run tests/unit/http.test.ts — 全部 Ingest Event Endpoint 12 个测试通过
- 仅 1 个预存在测试失败：`should return 413 for payload exceeding 64 KiB`（CAS reference 格式从 `cas://` 变为 `blob://`，与本任务无关）
- R7 硬编码检查通过

## 遇到的问题

无。

## 最终结论

任务完成。所有 7 种事件类型正确处理，CP-4 15s 超时满足，向后兼容性验证通过。

## 产出文件
- `packages/daemon-core/src/http/HTTPServer.ts`（修改）
- `packages/daemon-core/tests/unit/http.test.ts`（修改）

## 工具调用统计
- read: 6
- write/edit: 5
- bash: 3
- grep: 5
- glob: 2