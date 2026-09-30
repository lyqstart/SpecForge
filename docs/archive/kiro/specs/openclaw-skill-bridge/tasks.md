# Implementation Plan

## Overview

本文档给出 `openclaw-skill-bridge` 的可执行任务清单,基于 requirements.md(Req 1-22)和 design.md(10 个组件 + 6 个数据模型 + 3 条 PBT + 4 个待补依赖端点)。

**TDD 顺序**:每个组件先写测试再实现。**Wave 组织**:Wave 内任务可并行,跨 Wave 串行。**关键路径**约 9-10 天(见文末 Task Dependency Graph)。

**执行约定**:
- 任务状态用 `bun run scripts/sync-task-status.ts set openclaw-skill-bridge <taskId> <status>` 更新(禁止 task_update)
- PBT 结果用 `bun run scripts/sync-task-status.ts set-pbt openclaw-skill-bridge <taskId> <passed|failed>` 写入(禁止 update_pbt_status)
- 单任务交付验证:`bun test packages/openclaw-skill-bridge/tests/<your-new-test>.test.ts`(只跑你写的测试,不裸跑 `bun test`)
- 全量回归:`bun run test`
- 异步资源规范:每个 Disposable 类的测试 `afterEach` 必须断言 `getActiveXxxCount() === 0`

## Tasks

### Wave 0 — 基础设施

- [ ] 0.1 创建包骨架
  - **Files**: `packages/openclaw-skill-bridge/package.json`、`tsconfig.json`、`vitest.config.ts`、`README.md`、`.gitignore`
  - **Requirements**: project-structure 规范
  - **Acceptance**:
    - `package.json` 含 `"name": "@specforge/openclaw-skill-bridge"`、`"schema_version": "1.0"`、依赖 `fast-check`、`undici`、`vitest`
    - `vitest.config.ts` 含 `testTimeout: 10000`、`hookTimeout: 5000`、`pool: 'forks'`
    - `tsconfig.json` 启用 `strict: true`、`target: "ES2022"`、`module: "ESNext"`
    - 运行 `bun install` 在 `packages/openclaw-skill-bridge/` 内成功
  - **Effort**: S
  - **Depends-On**: —

- [ ] 0.2 注册到根 workspace
  - **Files**: 根 `package.json`(workspaces 字段),根 `tsconfig.json`(references)
  - **Acceptance**: 根目录跑 `bun install` 能解析新包;`bun run --filter @specforge/openclaw-skill-bridge ...` 可工作
  - **Effort**: S
  - **Depends-On**: 0.1

- [ ] 0.3 定义共享类型
  - **Files**: `packages/openclaw-skill-bridge/src/types/index.ts`(barrel)、`disposable.ts`、`attachment.ts`、`webhook.ts`、`tool-error.ts`、`session-status.ts`、`ownership.ts`、`pending-gate.ts`、`config.ts`
  - **Requirements**: design §3 全部组件接口签名
  - **Acceptance**:
    - 导出 `Disposable` / `AsyncDisposable` 接口(含 `[Symbol.dispose]` / `[Symbol.asyncDispose]`)
    - 导出 `AttachmentRef`(`inline` / `blob` 两种 kind 的 union)
    - 导出 `WebhookPayload` 含 `eventId / event / timestamp / projectPath / sessionId? / data`
    - 导出 `ToolError` class extends Error 含 `code / httpStatus / hint`
    - 导出 `SessionStatus` 联合类型(11 态:含 `disconnected`)
    - 类型编译通过 `bun run tsc --noEmit`
  - **Effort**: S
  - **Depends-On**: 0.1

- [ ] 0.4 创建 MockDaemonServer
  - **Files**: `tests/mocks/MockDaemonServer.ts`、`tests/mocks/fixtures/daemon-responses.ts`
  - **Acceptance**:
    - 基于 `node:http.createServer`,监听随机端口,返回端口号给测试
    - 支持注册路由(`onPost('/v1/workflow/start', handler)`)
    - 支持故障注入:`injectFault('500' | 'timeout' | 'tls-error' | 'rate-limit')`
    - 实现 `Disposable`(`dispose()` 关闭 server + 清待处理请求)
    - 提供 `getReceivedRequests()` 供测试断言
  - **Effort**: M
  - **Depends-On**: 0.3

- [ ] 0.5 创建 MockIMChannel
  - **Files**: `tests/mocks/MockIMChannel.ts`
  - **Acceptance**:
    - 实现 `IMChannel` 接口(`send(userId, message)` / `sendAttachment(userId, ref)`)
    - 内存数组捕获所有外发消息
    - 提供 `getMessagesForUser(userId)` 供断言
    - 提供 `clear()` 在 afterEach 重置
  - **Effort**: S
  - **Depends-On**: 0.3

---

### Wave 1 — 无依赖组件(可并行)

- [ ] 1.1 SchemaLoader
  - **Files**: `src/schema/SchemaLoader.ts`、`src/schema/SchemaVersionError.ts`、`tests/unit/schema/SchemaLoader.test.ts`
  - **Requirements**: Req 18(全部 AC)、Property 14
  - **Acceptance**:
    - `load<T>(path)` 校验根对象有 `schema_version` 且匹配 `^\d+\.\d+(\.\d+)?$`
    - 缺字段抛 `SchemaVersionError({ reason: 'missing' })`,非法值抛 `'invalid'`,major 不兼容抛 `'incompatible-major'`
    - `write(path, data)` 用 `copyFile + unlink` 原子写(避免 Windows fs watcher 竞态)
    - `getLoadFailures()` 暴露最近的失败列表(供 `/health` 503 判定)
    - 单测覆盖:正常加载、3 种错误路径、原子写中断恢复
    - 跑 `bun test tests/unit/schema/SchemaLoader.test.ts` 全绿
  - **Effort**: M
  - **Depends-On**: 0.3

- [ ] 1.2 NotificationFormatter
  - **Files**: `src/notification/NotificationFormatter.ts`、`src/notification/strip-internal.ts`、`tests/unit/notification/NotificationFormatter.test.ts`
  - **Requirements**: Req 6.2、Property 4
  - **Acceptance**:
    - `OPENCODE_INTERNAL_KEYS` 黑名单常量含 `ctx`、`callID`、`hookShape`、`hookId`、`_hookContext`、`__openCodeInternal`、`openCodeSessionId`、`pluginShape`
    - `strip(value)` 递归扫描嵌套对象/数组,删除任何匹配黑名单的 key
    - `format(event)` 返回 `{ userMessage: string, auditEntry: object }`,两者均已剥离
    - 模板覆盖 design §3.8 表格的 6 类事件 + `gate.required`(供 GateCoordinator 用)
    - 单测覆盖:深度嵌套黑名单字段、数组中的对象、模板渲染、Bearer token regex 检测
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 0.3

- [ ] 1.3 CommandRouter
  - **Files**: `src/router/CommandRouter.ts`、`src/router/keyword-rules.ts`、`src/router/explicit-commands.ts`、`tests/unit/router/CommandRouter.test.ts`
  - **Requirements**: Req 2、Req 13(路径意图提取)、Req 14(显式 /approve)、Req 16(续接)
  - **Acceptance**:
    - `route(message, ctx)` 永不返回空候选(Req 2.3)
    - `parseExplicit("/approve [reason]")` 识别 `/approve`、`/reject`,返回 `RouteResult { isExplicit: true }`
    - 关键词命中:"开发X" → `startProject`、"修复" → `sendMessage`、"列表" → `listProjects`、"停止" → `stopProject`、"继续" → `resumeProject`
    - 路径意图提取:"放在 ~/games/" 提取为 `parentDir`
    - 中文/拼音化:"五子棋" → `gomoku`(简单字典或 pinyin lib)
    - 候选始终展示,意图明确时高亮 [0]
    - 单测覆盖:6 种命令模式、显式命令、路径提取、模糊意图候选展示
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 0.3

---

### Wave 2 — 中层组件(可并行)

- [ ] 2.1 AuthManager
  - **Files**: `src/auth/AuthManager.ts`、`src/auth/im-platform-adapters.ts`、`tests/unit/auth/AuthManager.test.ts`
  - **Requirements**: Req 7(全部)、Req 19(token 不泄漏)
  - **Acceptance**:
    - `getToken()` 优先级:env var > runtime/daemon.sock.json > 配置文件密钥路径
    - `refreshToken()` 401 触发,失败抛 `AUTH_FAILED`
    - `resolveUserId(platform, raw)` 适配 `telegram` / `wechat` / `discord` / `mock`,返回统一格式 `tg:xxx` / `wx:xxx` / `discord:xxx` / `mock:xxx`
    - `checkPermission(userId, projectPath, level)` 即使 `auth.enabled=false` 仍生效(Req 7.2)
    - 实现 `Disposable`(`dispose()` 清空内存 token 缓存)
    - 单测覆盖:4 种 IM 平台、auth 禁用下权限仍生效、token 不出现在审计日志
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 1.1

- [ ] 2.2 ProjectRegistry
  - **Files**: `src/registry/ProjectRegistry.ts`、`src/registry/slugify.ts`、`src/registry/path-validator.ts`、`tests/unit/registry/ProjectRegistry.test.ts`
  - **Requirements**: Req 13(全部)、Req 15(全部)、Property 14(持久化)
  - **Acceptance**:
    - `inferProjectName(userId, description, strategy)` slugify 结果稳定(同输入同输出)
    - 重名后缀:`gomoku` 已存在 → `gomoku-2` → `gomoku-3`
    - `validatePath(path)` 命中 `allowedPaths` glob 白名单
    - `assertOwnership(userId, projectPath)` 在"项目不存在"和"项目存在但非所有者"两种情况返回**字节级相同**的 `PROJECT_NO_ACCESS` 错误(防侧信道枚举,Req 15.3)
    - `listForUser(userId)` 仅返回该用户归属
    - 持久化文件 `project-registry.json` 含 `schema_version: "1.0"`
    - 实现 `Disposable`(`dispose()` 刷盘)
    - 单测覆盖:slugify 稳定性、重名 100 次、跨用户访问字节相等响应、glob 白名单边界(`..` 逃逸拒绝)
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 1.1, 2.1

- [ ] 2.3 AttachmentHandler
  - **Files**: `src/attachment/AttachmentHandler.ts`、`src/attachment/mime-whitelist.ts`、`src/attachment/extension-blacklist.ts`、`tests/unit/attachment/AttachmentHandler.test.ts`
  - **Requirements**: Req 17(全部)
  - **Acceptance**:
    - 64 KiB 阈值:`< 64 KiB` 走 inline base64,`>= 64 KiB` 走 CAS blob 上传
    - MIME 白名单:`image/jpeg|png|webp`、`application/pdf`、`text/plain|markdown`、代码 MIME
    - 扩展名黑名单:`.exe`、`.zip`、`.bat`、`.sh`、`.dll`、`.msi` 拒绝并返回 `ATTACHMENT_TYPE_NOT_ALLOWED`
    - `processOne` 用 try/finally 保证临时文件清理(无论成功失败)
    - 后台 setInterval(每日)扫 `tmpdir` 删除 mtime>24h 残留;`dispose()` 时 clearInterval
    - 上传失败重试 3 次(指数退避 1s/4s/16s),全失败返回 `ATTACHMENT_UPLOAD_FAILED`
    - 单测覆盖:阈值边界、6 种黑名单扩展、try/finally 清理(故意抛错验证 tmp 文件被删)、重试退避时序(用 fakeTimers)
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 0.4

---

### Wave 3 — 业务组件

### 3a. DaemonClient(串行内 3.1 → 3.2 → 3.3)

- [ ] 3.1 DaemonClient — HTTPS 强制 + 连接池
  - **Files**: `src/daemon/DaemonClient.ts`、`src/daemon/https-validator.ts`、`tests/unit/daemon/DaemonClient.https.test.ts`
  - **Requirements**: Req 19(全部)
  - **Acceptance**:
    - `init()` 启动期校验:非回环 endpoint 必须 `https://`,否则抛错拒绝启动
    - `https.Agent` 配 `rejectUnauthorized: true`、可选证书指纹比对
    - `undici.Pool` 实现 keepAlive 连接池
    - 实现 `Disposable`(`dispose()` 关闭 Pool + abort 所有 inflight)
    - `getActiveConnectionCount()` 暴露给测试
    - 单测覆盖:`http://` 非回环拒绝、`http://localhost` 接受、`https://` + 证书指纹失败拒绝、连接池复用、`dispose()` 后 count=0
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 2.1

- [ ] 3.2 DaemonClient — 重试 + 限流处理
  - **Files**: `src/daemon/retry-policy.ts`、`src/daemon/rate-limit-handler.ts`、`tests/unit/daemon/DaemonClient.retry.test.ts`
  - **Requirements**: Req 4(分层重试)、Req 21(429 + Retry-After)
  - **Acceptance**:
    - 网络瞬态(ECONNRESET、5xx 503/502/504)指数退避重试 3 次(1s/2s/4s)
    - 401 触发 `AuthManager.refreshToken()` 重试 1 次
    - 429 不自动重试,透传 `Retry-After` header 到 ToolError
    - 业务错误(400/403/404/409 + 已知 code)不重试
    - 每次重试有独立超时 + finally clearTimeout(对齐 lessons C1)
    - 单测覆盖:4 种错误分类、重试时序(fakeTimers)、429 透传、Promise.race 后 timer 全清理
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.1

- [ ] 3.3 DaemonClient — API 端点封装
  - **Files**: `src/daemon/api-methods.ts`、`tests/unit/daemon/DaemonClient.api.test.ts`、`tests/integration/daemon-client-roundtrip.test.ts`
  - **Requirements**: design §5.1(对齐 OCI-3)、§5.2(4 个待补端点)
  - **Acceptance**:
    - 实现 12 个核心端点方法:`createSession` / `sendPrompt` / `cancelSession` / `getSessionStatus` / `startWorkflow` / `getJob` / `registerWebhook` / `unregisterWebhook` / `getProjectState` / `health`
    - 实现 4 个待补端点:`postGateDecision` / `getRecentSession` / `getBlob` / `uploadBlob`
    - 大请求体 ≥ 64 KiB 自动走 CAS blob 引用
    - 所有方法返回 Promise,失败抛 `ToolError`
    - 单测用 MockDaemonServer 覆盖每个端点的 happy path + 错误响应
    - 集成测试覆盖 4 个待补端点的契约对齐
    - 跑测试全绿
  - **Effort**: L
  - **Depends-On**: 3.2, 0.4

### 3b. SessionManager(串行内 3.4 → 3.5 → 3.6 → 3.7)

- [ ] 3.4 SessionManager — 状态机 + 单 active session
  - **Files**: `src/session/SessionManager.ts`、`src/session/state-machine.ts`、`tests/unit/session/SessionManager.state.test.ts`
  - **Requirements**: Req 3(状态机)、Req 20(单 active 约束)
  - **Acceptance**:
    - 实现 11 态状态机(含 `disconnected`,见 design §3.3)
    - `transition(projectPath, to, reason)` 拒绝非法转换(如 `completed` → `active`)
    - `start()` 同 projectPath 已有 active session 时抛 `PROJECT_BUSY`
    - `enqueueMessage` 复用现有 active session,不创建新的
    - 状态变更后调 `NotificationFormatter.format` 推送通知
    - 单测覆盖:每条合法转换、非法转换拒绝、PROJECT_BUSY 触发
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.3, 1.2

- [ ] 3.5 SessionManager — stopProject 三种 mode
  - **Files**: `src/session/stop-modes.ts`、`tests/unit/session/SessionManager.stop.test.ts`
  - **Requirements**: Req 16(stopProject mode)
  - **Acceptance**:
    - `graceful`(默认):不发新 prompt,等当前 tool 完成,状态转 `paused`
    - `immediate`:调 `DaemonClient.cancelSession`,可能留半成品文件
    - `force`:调 cancel 端点 + `force: true`
    - 取消后状态转 `cancelled`,事件原因含 mode 和时刻
    - 通知用户"已停止开发,请检查项目目录"(Req 16.3)
    - 单测覆盖:3 种 mode 的状态转换、Daemon API 调用参数正确
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.4

- [ ] 3.6 SessionManager — resumeProject 续接
  - **Files**: `src/session/resume.ts`、`tests/unit/session/SessionManager.resume.test.ts`
  - **Requirements**: Req 16(续接)
  - **Acceptance**:
    - `resume(userId, projectPath)` 按 `lastActiveAt` 找最近项目
    - 调 `DaemonClient.getRecentSession`,active 状态直接复用 sessionId
    - 非 active 状态(completed/cancelled/failed)创建新 session,把 `summary` 作为初始 prompt
    - `parentSessionId` 传给 Daemon 用于审计追溯
    - 单测覆盖:活跃复用、跨日重建、无最近 session 返回错误
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.5

- [ ] 3.7 SessionManager — inactivity timer
  - **Files**: `src/session/inactivity-timer.ts`、`tests/unit/session/SessionManager.timer.test.ts`
  - **Requirements**: Req 3.5、Req 3.6、Req 3.7
  - **Acceptance**:
    - 每个 active session 持有独立 setTimeout
    - 任何活动(transition / enqueueMessage)重置 timer
    - timeout=0 不创建 timer(Req 3.6)
    - 触发后**仅暂停**该项目(状态转 `paused`),不影响其他项目
    - `getActiveTimerCount()` 暴露,测试断言 dispose 后 count=0
    - 单测用 `vi.useFakeTimers()` 覆盖:0 不创建、活动重置、超时仅影响自身、`dispose()` 清零
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.6

### 3c. GateCoordinator(串行内 3.8 → 3.9)

- [ ] 3.8 GateCoordinator — submitDecision 幂等
  - **Files**: `src/gate/GateCoordinator.ts`、`src/gate/submit-decision.ts`、`tests/unit/gate/GateCoordinator.submit.test.ts`
  - **Requirements**: Req 14(全部)
  - **Acceptance**:
    - `onGateRequired(payload)` 持久化到 `gate-pending.json`(SchemaLoader.write)
    - `submitDecision(userId, projectPath, gateId, decision, reason?)` 调 `DaemonClient.postGateDecision`
    - 携带 `idempotencyKey: "${gateId}:${decision}"`,Daemon 端去重
    - 同 gateId 相同 decision 重复回传幂等(返回 200);不同 decision 抛 `GATE_ALREADY_DECIDED`
    - 自然语言 + `/approve`、`/reject` 两条入口都流到此函数
    - 单测覆盖:happy path、相同 decision 幂等、不同 decision 冲突、自然语言 + 显式两入口
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.3, 1.1

- [ ] 3.9 GateCoordinator — 24h 超时 + 周期提醒
  - **Files**: `src/gate/timer-management.ts`、`tests/unit/gate/GateCoordinator.timer.test.ts`
  - **Requirements**: Req 14(超时 + 提醒)
  - **Acceptance**:
    - `armReminder(gate)` setInterval 4h 提醒一次
    - `armTimeout(gate)` setTimeout 24h 自动 reject(原因 `"timeout-no-response"`)
    - 用户提交决定 / 超时触发 / 项目销毁 / session 终态 → 全部清理 timer
    - `getActiveTimerCount()` 暴露;`dispose()` 后必须为 0
    - 单测用 fakeTimers 覆盖:reminder 触发、24h 自动 reject、四种清理路径
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.8

### 3d. WebhookServer(串行内 3.10 → 3.11 → 3.12)

- [ ] 3.10 WebhookServer — HTTP server + HMAC 验签
  - **Files**: `src/webhook/WebhookServer.ts`、`src/webhook/hmac-verify.ts`、`tests/unit/webhook/WebhookServer.signing.test.ts`
  - **Requirements**: Req 6(订阅)
  - **Acceptance**:
    - `start()` 启动 `node:http` server 在配置端口(默认 8080)
    - 每个请求验 `X-Hub-Signature-256` HMAC,失败返 401
    - 实现 `Disposable`(`dispose()` 关 server + cancel inflight)
    - `getInflightCount()` 暴露
    - 单测覆盖:验签通过/失败、并发请求计数、dispose 关闭
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 1.2

- [ ] 3.11 WebhookServer — 去重表 + LRU 后台清理
  - **Files**: `src/webhook/DedupStore.ts`、`tests/unit/webhook/DedupStore.test.ts`
  - **Requirements**: Req 6.4(幂等)、Req 18(schema_version)
  - **Acceptance**:
    - `event-dedup.json` 持久化,根 `schema_version: "1.0"`
    - 同 `eventId` + `userId` 复合 key 已投递 → skip 通知投递,但**仍处理事件本身**(Req 6.4)
    - LRU:超过 10000 条按 `deliveredAt` 升序淘汰最旧 1000
    - 后台 setInterval 1h 扫描清理 `expiresAt < now`(TTL 24h)
    - `dispose()` 时 clearInterval(对齐 lessons A4)
    - 单测覆盖:幂等去重、LRU 淘汰、TTL 清理、`dispose` 后 timer 清零
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.10, 1.1

- [ ] 3.12 WebhookServer — Blob 解引用 + 分片
  - **Files**: `src/webhook/blob-resolver.ts`、`src/webhook/im-fragment.ts`、`tests/unit/webhook/blob-resolution.test.ts`
  - **Requirements**: Req 22(全部)
  - **Acceptance**:
    - `resolveBlobs(payload)` 递归扫描 `{"$blob": "sha256:..."}`,并行解引用(最多 5 路)
    - 每路解引用用 `withTimeout` 包装,finally clearTimeout(对齐 C1)
    - 解引用结果 LRU 缓存(256 条目,TTL 10min)
    - 内容超 IM 单条限制 → 按平台分片,失败再降级附件
    - 解引用失败保留原 `{"$blob"}` 占位 + 追加"⚠️ 部分内容暂时无法显示"
    - 单测覆盖:正常解引用、并发 5 路、超时 race、缓存命中、降级附件、失败占位
    - 跑测试全绿
  - **Effort**: L
  - **Depends-On**: 3.11, 3.3

---

### Wave 4 — 集成 + 进程入口

- [ ] 4.1 进程入口 src/index.ts
  - **Files**: `src/index.ts`、`src/bootstrap.ts`、`tests/integration/bootstrap.test.ts`
  - **Requirements**: design §9.1(组件装配 + 逆序 dispose)
  - **Acceptance**:
    - 装配顺序:Config → SchemaLoader → AuthManager → ProjectRegistry → DaemonClient.init() → NotificationFormatter → AttachmentHandler → SessionManager → GateCoordinator → WebhookServer.start()
    - 注册 webhooks 通过 `DaemonClient.registerWebhook`
    - 接 SIGTERM:逆序 `Promise.all([webhookServer, gateCoordinator, sessionManager, attachmentHandler, daemonClient, projectRegistry, authManager].map(c => c.dispose()))`
    - 测试覆盖:启动后所有组件 ready;SIGTERM 后所有 `getActiveXxxCount() === 0`
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 3.7, 3.9, 3.12, 2.2, 2.3

- [ ] 4.2 健康检查 /health
  - **Files**: `src/admin/health-server.ts`、`tests/unit/admin/health.test.ts`
  - **Requirements**: Req 9(监控端点)、Req 18(schema 失败 503)
  - **Acceptance**:
    - 端口 8081 暴露 `GET /health`
    - 检查项:`schemaLoader`(无 load failures)、`daemonReachable`(健康 ping ≤ 1s)、`webhookListening`(端口被监听)、`tokenAvailable`
    - 任一失败 → 返 503;全部通过 → 返 200 + JSON 体
    - 单测覆盖:happy 200、各 check 失败的 503
    - 跑测试全绿
  - **Effort**: S
  - **Depends-On**: 4.1

- [ ] 4.3 监控 /metrics
  - **Files**: `src/admin/metrics-server.ts`、`tests/unit/admin/metrics.test.ts`
  - **Requirements**: Req 9.2
  - **Acceptance**:
    - Prometheus 文本格式
    - 指标:`openclaw_skill_requests_total{tool,success}`、`openclaw_skill_request_duration_seconds`、`openclaw_skill_active_sessions`、`openclaw_skill_active_timers`、`openclaw_skill_daemon_connection_errors_total`
    - 单测覆盖:格式合法、计数器递增
    - 跑测试全绿
  - **Effort**: S
  - **Depends-On**: 4.1

- [ ] 4.4 集成测试 — 场景 A 端到端
  - **Files**: `tests/integration/end-to-end-startProject.test.ts`
  - **Requirements**: design §10 场景 A
  - **Acceptance**:
    - 启动 MockDaemonServer + Skill 进程 + MockIMChannel
    - IM 输入 "开发五子棋" → ProjectRegistry 推断 `gomoku` → DaemonClient.startWorkflow
    - 模拟 Daemon webhook 推 `session.started` → MockIMChannel 收到 "🚀 开发会话已启动"
    - 模拟 `tool.called`、`tool.result`、`session.completed` → 用户依次收到通知
    - 断言:agentRole 默认 `sf-orchestrator`、projectPath 落在 allowedPaths 内
    - 跑 `bun test tests/integration/end-to-end-startProject.test.ts` 全绿
  - **Effort**: M
  - **Depends-On**: 4.1

- [ ] 4.5 集成测试 — Gate 双向交互
  - **Files**: `tests/integration/gate-bidirectional.test.ts`
  - **Requirements**: Req 14、design §10 场景 B
  - **Acceptance**:
    - 子场景 1:Daemon 推 `gate.required` → IM 收到摘要 → 用户回 `/approve` → Skill 调 postGateDecision
    - 子场景 2:用户回自然语言"批准 requirements" → CommandRouter 解析 → 同上
    - 子场景 3:用户回 `/reject 需要改 X` → reason 字段透传给 Daemon
    - 子场景 4:24h 超时(fakeTimers 推进)→ 自动 reject 原因 `timeout-no-response`
    - 子场景 5:同 gateId 相同 decision 重复提交 → 幂等返回成功;不同 decision → `GATE_ALREADY_DECIDED`
    - 跑测试全绿
  - **Effort**: L
  - **Depends-On**: 4.1

- [ ] 4.6 集成测试 — 跨日续接
  - **Files**: `tests/integration/resume-cross-day.test.ts`
  - **Requirements**: Req 16、design §10 场景 C
  - **Acceptance**:
    - 子场景 1:同日活跃 session → resumeProject 复用 sessionId
    - 子场景 2:跨日 session 已完成 → MockDaemon 模拟 events.jsonl 摘要 → 创建新 session 把摘要作为 initialMessage
    - 子场景 3:MockDaemon 模拟"重启过"(persistence reload),续接仍可工作
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 4.1

- [ ] 4.7 集成测试 — 多用户隔离
  - **Files**: `tests/integration/multi-user-isolation.test.ts`
  - **Requirements**: Req 15(全部)
  - **Acceptance**:
    - 用户 A(`tg:111`)和用户 B(`tg:222`)各创建项目
    - 用户 A 调 `listProjects` 不返回 B 的项目
    - 用户 A 用 B 的 projectPath 调 `sendMessage` / `getProjectStatus` / `stopProject` / `resumeProject` / `respondToGate` 全部返回 `PROJECT_NO_ACCESS`
    - 用户 A 用不存在的 projectPath 也返回 `PROJECT_NO_ACCESS`
    - **断言两种情况的错误响应字节级相同**(防侧信道)
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 4.1

- [ ] 4.8 集成测试 — 附件流
  - **Files**: `tests/integration/attachment-upload.test.ts`
  - **Requirements**: Req 17
  - **Acceptance**:
    - 子场景 1:< 64 KiB PNG 走 inline base64
    - 子场景 2:≥ 64 KiB PDF 走 CAS blob 上传 → 验证 `POST /v1/blob` 被调
    - 子场景 3:`.exe` 附件 → `ATTACHMENT_TYPE_NOT_ALLOWED`
    - 子场景 4:上传失败 3 次 → `ATTACHMENT_UPLOAD_FAILED`
    - 子场景 5:任何路径下临时文件最终删除(扫 tmpdir 验证)
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 4.1

- [ ] 4.9 集成测试 — 限流
  - **Files**: `tests/integration/rate-limit.test.ts`
  - **Requirements**: Req 21
  - **Acceptance**:
    - 子场景 1:单用户每分钟 31 次请求 → 第 31 次返 429 + `Retry-After`
    - 子场景 2:单项目每分钟 61 次 sendMessage → 第 61 次同上
    - 子场景 3:Webhook 投递重试不计入限流
    - 子场景 4:滑动窗口边界稳定(不抖动)
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 4.1

- [ ] 4.10 集成测试 — Blob 解引用降级
  - **Files**: `tests/integration/blob-deref.test.ts`
  - **Requirements**: Req 22
  - **Acceptance**:
    - 子场景 1:webhook payload 含 `{"$blob": "sha256:..."}` → 解引用成功 → 内容嵌入 IM 消息
    - 子场景 2:内容超 IM 限制 → 分片
    - 子场景 3:超大内容 → 降级 `.txt` 附件
    - 子场景 4:blob 404 → 占位 + "⚠️ 部分内容暂时无法显示"
    - 子场景 5:并发 5 个 blob 引用 → 并行解引用
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 4.1

---

### Wave 5 — Property-Based Tests

- [ ] 5.1 PBT — Property 16:三层架构边界
  - **Files**: `tests/property/three-layer-boundary.property.test.ts`
  - **Property**: 16
  - **Test Tag**: `Feature: openclaw-skill-bridge, Property 16: 三层架构边界(OpenClaw Skill / Daemon / OpenCode); Derived-From: v6-architecture-overview Property 16`
  - **Requirements Validated**: Req 11.1、11.2、11.3、11.4、11.5
  - **numRuns**: ≥ 1000(安全关键)
  - **Acceptance**:
    - 用 fast-check 生成随机的工具调用序列(`startProject` / `sendMessage` / `stopProject` / `resumeProject` / `respondToGate` 任意排列)
    - 含故障注入(Daemon 503 / 超时 / TLS 错误 / 限流)
    - 每条 property 验证三个 invariant:
      - (a) 所有外发 `https.request` / `fetch` 的 host:port = 配置的 daemon.endpoint(用 `vi.spyOn` 全局监听)
      - (b) `child_process.spawn` 永不被以 `argv[0]` 含 `opencode` 调用
      - (c) Daemon 不可达时返回 `DAEMON_UNREACHABLE`,绝不存在替代路径(检查 spawn 调用列表为空)
    - PBT 失败时用 `bun run scripts/sync-task-status.ts set-pbt openclaw-skill-bridge 5.1 failed --failing="<example>"` 写入
    - 通过后用 `set-pbt openclaw-skill-bridge 5.1 passed`
    - 跑 `bun test tests/property/three-layer-boundary.property.test.ts` 全绿
  - **Effort**: L
  - **Depends-On**: 4.10

- [ ] 5.2 PBT — Property 14:schema_version 字段
  - **Files**: `tests/property/schema-version.property.test.ts`
  - **Property**: 14
  - **Test Tag**: `Feature: openclaw-skill-bridge, Property 14: schema_version 字段强制; Derived-From: v6-architecture-overview Property 14`
  - **Requirements Validated**: Req 18.1、18.2、18.3、18.4、18.5
  - **numRuns**: ≥ 100
  - **Acceptance**:
    - 用 fast-check 生成随机状态变更序列(注册项目 / 注册 webhook / 写去重表 / 写 gate-pending / 更新权限)
    - 落盘后扫描 `/var/lib/openclaw-skill/*.json` + `/etc/openclaw-skill/*.json`
    - 每个文件根对象必含 `schema_version` 且匹配 `^\d+\.\d+(\.\d+)?$`
    - Fixture 注入缺字段 / 非法字符串 → `SchemaLoader.load` 必抛 `SchemaVersionError`
    - 注入失败的文件 → `/health` 必返 503
    - 通过后用 `set-pbt openclaw-skill-bridge 5.2 passed`
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 4.2

- [ ] 5.3 PBT — Property 4:Adapter 概念隔离
  - **Files**: `tests/property/concept-isolation.property.test.ts`
  - **Property**: 4
  - **Test Tag**: `Feature: openclaw-skill-bridge, Property 4: Adapter 概念隔离; Derived-From: v6-architecture-overview Property 4`
  - **Requirements Validated**: Req 1.2、4.1、6.2
  - **numRuns**: ≥ 100
  - **Acceptance**:
    - fast-check 生成器把 OpenCode 内部字段(`ctx`、`callID`、`hookShape`、`hookId`、`_hookContext`、`__openCodeInternal`、`pluginShape`)随机注入到 webhook payload 的任意嵌套层
    - 经 `NotificationFormatter.format` + WebhookServer 处理后:
      - (a) `userMessage` 字符串不出现这些字段名
      - (b) `auditEntry` JSON 递归扫描后不含这些字段名作为 key
      - (c) MockIMChannel 拦截到的所有外发消息不含这些字段名
    - 通过后用 `set-pbt openclaw-skill-bridge 5.3 passed`
    - 跑测试全绿
  - **Effort**: M
  - **Depends-On**: 4.10

---

### Wave 6 — 部署 + 文档 + 最终验收

- [ ] 6.1 systemd unit 文件 + CentOS 8 安装脚本
  - **Files**: `packages/openclaw-skill-bridge/deployment/openclaw-skill.service`、`deployment/install.sh`、`deployment/uninstall.sh`
  - **Requirements**: Req 5
  - **Acceptance**:
    - systemd unit 含 `Type=notify`、`Restart=on-failure`、`MemoryMax=512M`、`CPUQuota=50%`、`TimeoutStopSec=30s`、`PrivateTmp=yes`、`ProtectSystem=strict`
    - `install.sh` 创建用户 `openclaw`、目录 `/etc/openclaw-skill /var/lib/openclaw-skill /var/log/openclaw-skill`、注册 systemd、启动服务、跑健康检查
    - `uninstall.sh` 优雅关闭服务、卸载 systemd、可选删除数据目录
    - 在 CentOS 8 容器中跑 `install.sh && systemctl status openclaw-skill` 显示 active(running)
  - **Effort**: M
  - **Depends-On**: 4.1, 4.2

- [ ] 6.2 配置文件模板
  - **Files**: `deployment/config.template.json`、`deployment/env.template`、`deployment/permissions.template.json`
  - **Requirements**: design §4
  - **Acceptance**:
    - `config.template.json` 含完整字段(daemon、webhook、projects、defaults、auth、rateLimit、gate、logging),所有路径用占位符
    - `env.template` 含 `SPECFORGE_TOKEN`、`WEBHOOK_SECRET` 等敏感字段占位
    - `permissions.template.json` 给出 user 示例
    - 所有 JSON 含 `schema_version: "1.0"`
  - **Effort**: S
  - **Depends-On**: 6.1

- [ ] 6.3 logrotate 配置
  - **Files**: `deployment/logrotate.d/openclaw-skill`
  - **Acceptance**:
    - 每日轮转 `/var/log/openclaw-skill/*.log`
    - 保留 30 天 + 压缩
    - `postrotate` 调 `systemctl kill -s HUP openclaw-skill.service`
  - **Effort**: S
  - **Depends-On**: 6.1

- [ ] 6.4 README + 部署文档
  - **Files**: `packages/openclaw-skill-bridge/README.md`、`docs/integrations/openclaw-skill-bridge.md`
  - **Acceptance**:
    - README 含安装、配置、CentOS 8 部署、IM 平台接入示例(Telegram / 微信 / Discord)、故障排查
    - docs/integrations 含三层架构图、IM 命令清单、Gate 交互流程、附件支持矩阵、错误码表
    - 引用本 spec 的 requirements + design 路径
  - **Effort**: M
  - **Depends-On**: 6.1

- [ ] 6.5 最终验收 — 全量测试绿
  - **Files**: 无新增,跑根目录命令
  - **Acceptance**:
    - `bun run --filter @specforge/openclaw-skill-bridge test` 全绿
    - 单测 + 集成测试 + PBT 全部通过
    - `bun run scripts/sync-task-status.ts list` 显示 openclaw-skill-bridge 全部任务 completed
  - **Effort**: S
  - **Depends-On**: 5.1, 5.2, 5.3

- [ ] 6.6 最终验收 — PBT 全绿
  - **Files**: 无新增
  - **Acceptance**:
    - `bun test tests/property/` 全绿
    - Property 16 实际 numRuns ≥ 1000(读测试输出确认)
    - Property 14、Property 4 实际 numRuns ≥ 100
    - `tasks.meta.json` 中 5.1、5.2、5.3 的 pbtStatus 全为 `passed`
  - **Effort**: S
  - **Depends-On**: 5.1, 5.2, 5.3

- [ ] 6.7 最终验收 — schema_version 缺失场景 /health 503
  - **Files**: `tests/integration/health-schema-failure.test.ts`
  - **Requirements**: Req 18.3
  - **Acceptance**:
    - 故意写入缺 `schema_version` 的 `project-registry.json`
    - 启动 Skill 进程
    - `curl http://localhost:8081/health` 返回 503
    - 响应体含 `checks.schemaLoader.ok: false` + 失败文件路径
    - 跑测试全绿
  - **Effort**: S
  - **Depends-On**: 4.2, 1.1

- [ ] 6.8 最终验收 — 跨网络 HTTPS 强制
  - **Files**: `tests/integration/https-enforcement.test.ts`
  - **Requirements**: Req 19.1、Req 19.5
  - **Acceptance**:
    - 配置 `daemon.endpoint = "http://203.0.113.10:3000"`(非回环 + http)
    - 启动 Skill 进程 → 立刻退出 + stderr 含"必须使用 HTTPS"
    - 配置 `daemon.endpoint = "http://localhost:3000"` → 启动成功(回环允许 http)
    - 跑测试全绿
  - **Effort**: S
  - **Depends-On**: 4.1

---

## Task Dependency Graph

下列 JSON 给出可被工具读取的 wave 定义(机器可读),后跟人类可读的 ASCII 图。

```json
{
  "schema_version": "1.0",
  "waves": [
    {
      "wave": 0,
      "title": "基础设施",
      "tasks": ["0.1", "0.2", "0.3", "0.4", "0.5"],
      "parallelGroups": [["0.4", "0.5"]]
    },
    {
      "wave": 1,
      "title": "无依赖组件",
      "tasks": ["1.1", "1.2", "1.3"],
      "parallelGroups": [["1.1", "1.2", "1.3"]]
    },
    {
      "wave": 2,
      "title": "中层组件",
      "tasks": ["2.1", "2.2", "2.3"],
      "parallelGroups": [["2.1", "2.3"]]
    },
    {
      "wave": 3,
      "title": "业务组件",
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12"],
      "parallelGroups": [
        ["3.1", "3.8", "3.10"],
        ["3.4"]
      ],
      "serialChains": [
        ["3.1", "3.2", "3.3"],
        ["3.4", "3.5", "3.6", "3.7"],
        ["3.8", "3.9"],
        ["3.10", "3.11", "3.12"]
      ]
    },
    {
      "wave": 4,
      "title": "集成 + 进程入口",
      "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10"],
      "parallelGroups": [["4.2", "4.3"], ["4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10"]]
    },
    {
      "wave": 5,
      "title": "Property-Based Tests",
      "tasks": ["5.1", "5.2", "5.3"],
      "parallelGroups": [["5.1", "5.2", "5.3"]]
    },
    {
      "wave": 6,
      "title": "部署 + 文档 + 最终验收",
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8"],
      "parallelGroups": [["6.2", "6.3", "6.4"], ["6.5", "6.6", "6.7", "6.8"]]
    }
  ],
  "criticalPath": [
    "0.1", "0.3", "1.1", "2.1", "3.1", "3.2", "3.3",
    "3.4", "3.5", "3.6", "3.7", "4.1", "4.5", "5.1", "6.5"
  ]
}
```

### 人类可读 ASCII 图

```
Wave 0 (基础设施)
  0.1 包骨架
   ├──> 0.2 workspace 注册
   └──> 0.3 共享类型 ──┬──> 0.4 MockDaemonServer
                      └──> 0.5 MockIMChannel

Wave 1 (无依赖,可并行)
  0.3 ──> 1.1 SchemaLoader
  0.3 ──> 1.2 NotificationFormatter
  0.3 ──> 1.3 CommandRouter

Wave 2 (中层,可并行)
  1.1 ──> 2.1 AuthManager
  1.1, 2.1 ──> 2.2 ProjectRegistry
  0.4 ──> 2.3 AttachmentHandler

Wave 3 (业务组件)
  ── 3a. DaemonClient (串行) ──
    2.1 ──> 3.1 DaemonClient HTTPS+连接池
    3.1 ──> 3.2 DaemonClient 重试+限流
    3.2, 0.4 ──> 3.3 DaemonClient API 端点

  ── 3b. SessionManager (串行) ──
    3.3, 1.2 ──> 3.4 SessionManager 状态机
    3.4 ──> 3.5 stopProject 三 mode
    3.5 ──> 3.6 resumeProject
    3.6 ──> 3.7 inactivity timer

  ── 3c. GateCoordinator (串行) ──
    3.3, 1.1 ──> 3.8 GateCoordinator submitDecision
    3.8 ──> 3.9 GateCoordinator timer

  ── 3d. WebhookServer (串行) ──
    1.2 ──> 3.10 WebhookServer HTTP+HMAC
    3.10, 1.1 ──> 3.11 WebhookServer 去重表
    3.11, 3.3 ──> 3.12 WebhookServer Blob

Wave 4 (集成)
  3.7, 3.9, 3.12, 2.2, 2.3 ──> 4.1 进程入口
  4.1 ──> 4.2 /health
  4.1 ──> 4.3 /metrics
  4.1 ──> 4.4 集成 端到端
  4.1 ──> 4.5 集成 Gate 双向
  4.1 ──> 4.6 集成 跨日续接
  4.1 ──> 4.7 集成 多用户隔离
  4.1 ──> 4.8 集成 附件流
  4.1 ──> 4.9 集成 限流
  4.1 ──> 4.10 集成 Blob 降级

Wave 5 (PBT)
  4.10 ──> 5.1 PBT Property 16 (numRuns≥1000)
  4.2 ──> 5.2 PBT Property 14 (numRuns≥100)
  4.10 ──> 5.3 PBT Property 4 (numRuns≥100)

Wave 6 (部署+验收)
  4.1, 4.2 ──> 6.1 systemd + 安装脚本
  6.1 ──> 6.2 配置模板
  6.1 ──> 6.3 logrotate
  6.1 ──> 6.4 README + 文档
  5.1, 5.2, 5.3 ──> 6.5 全量测试绿
  5.1, 5.2, 5.3 ──> 6.6 PBT 全绿
  4.2, 1.1 ──> 6.7 schema 缺失 /health 503
  4.1 ──> 6.8 HTTPS 强制
```

### 关键路径(Critical Path)

最长路径(预计 9-10 天):

```
0.1 ──> 0.3 ──> 1.1 ──> 2.1 ──> 3.1 ──> 3.2 ──> 3.3 ──> 3.4 ──> 3.5 ──> 3.6 ──> 3.7
       ──> 4.1 ──> 4.5 ──> 5.1 ──> 6.5
```

并发优化机会:Wave 1 三任务并行 + Wave 2 三任务并行 + Wave 3 中 3a/3b/3c/3d 四组并行 + Wave 4 集成测试可全部并行(基础就绪后)。

### Wave 完成度建议

每完成一个 Wave 调用 `bun run scripts/sync-task-status.ts list openclaw-skill-bridge` 查看进度,通过 Wave 后再进入下一 Wave。

---

## Acceptance & Validation

整个 spec 的最终验收清单:

### 功能验收

- [ ] 全部 22 项 Requirement 至少有一个 task 覆盖(交叉引用见各 task 的 Requirements 字段)
- [ ] design 中 10 个组件全部实现并通过单测
- [ ] design 中 6 个数据模型全部含 `schema_version` 字段
- [ ] design 中 4 个待补 Daemon 端点(`gate/decision`、`session/recent`、`GET /v1/blob/:hash`、`POST /v1/blob`)在 DaemonClient 中已封装(此 spec 假定它们存在;openclaw-integration 端实现完成后做契约对齐回归)
- [ ] design 中 3 条数据流场景(开发五子棋 / Gate 审批 / 跨日续接)全部有对应的集成测试

### 质量验收

- [ ] `bun run --filter @specforge/openclaw-skill-bridge test` 全绿(单测 + 集成 + PBT)
- [ ] PBT Property 16 实际 numRuns ≥ 1000
- [ ] PBT Property 14、Property 4 实际 numRuns ≥ 100
- [ ] `tasks.meta.json` 中 5.1、5.2、5.3 三条 PBT 的 pbtStatus 均为 `passed`
- [ ] 全部异步资源类的 `getActiveXxxCount() === 0` 在测试 afterEach 通过(对齐 lessons T1)
- [ ] vitest.config.ts 含 `pool: 'forks'`(必填,对齐 lessons T3)

### 架构边界验收

- [ ] PBT Property 16 通过 → Skill 永不直连 OpenCode、永不 spawn opencode、Daemon 不可达只返 `DAEMON_UNREACHABLE`
- [ ] PBT Property 14 通过 → 所有持久化文件含 schema_version,缺失场景 `/health` 返 503
- [ ] PBT Property 4 通过 → 任意 OpenCode 内部字段被剥离,不出现在用户消息或审计日志

### 部署验收

- [ ] CentOS 8 容器中 `install.sh` 一键安装成功
- [ ] systemd 启动后 `/health` 返 200
- [ ] HTTPS 强制:`http://` 非回环 endpoint 启动失败并报错
- [ ] schema_version 缺失:`/health` 返 503

### 安全验收

- [ ] 跨用户访问验证:用户 A 访问用户 B 的项目返回 `PROJECT_NO_ACCESS` 且响应**字节级相同**于"项目不存在"
- [ ] Bearer Token 不出现在审计日志、IM 通知、stderr 中
- [ ] 证书指纹审计:配置 `tlsCertFingerprintSha256` 后启动期校验生效

### 文档验收

- [ ] README 含 IM 平台接入示例(至少 Telegram + 一种)
- [ ] docs/integrations/openclaw-skill-bridge.md 含三层架构图
- [ ] CHANGELOG.md 记录 V6.0 首次发布

### 待对端补全的依赖

本 spec 假定下列 Daemon 端点存在,openclaw-integration spec 必须补充实现并保证契约一致:

- `POST /v1/project/:projectPath/gate/:gateId/decision`(Req 14)
- `GET /v1/project/:projectPath/session/recent`(Req 16)
- `GET /v1/blob/:hash`(Req 22)
- `POST /v1/blob`(Req 17)

对端补全后,跑 `tests/integration/daemon-client-roundtrip.test.ts`(T3.3)做契约对齐回归。

---

## Notes

### 关键约束(每个执行 sub-agent 都必读)

1. **任务状态管理工具**:用 `bun run scripts/sync-task-status.ts`(set / batch / sync),禁止 Kiro 内置 `task_update`(Windows 上必报 EPERM)
2. **PBT 状态写入**:用 `set-pbt`,禁止 `update_pbt_status`
3. **测试配置**:`packages/openclaw-skill-bridge/vitest.config.ts` 必须含 `pool: 'forks'` + `testTimeout: 10000`(无此配置 = 单文件资源泄漏会拖垮整个 `bun test`)
4. **路径规范**:源码 `packages/openclaw-skill-bridge/src/`,测试 `tests/`,**禁止**在 `.kiro/specs/` 下放代码
5. **schema_version 强制**:所有持久化 JSON 根对象必含 `schema_version: "1.0"`,缺失场景 `/health` 必返 503
6. **异步资源 Disposable**:每个持有 timer / connection / subscription 的类必须实现 `dispose()` + `[Symbol.dispose]` / `[Symbol.asyncDispose]`,Promise.race 必须 finally clearTimeout(对齐 lessons C1)
7. **概念隔离**:NotificationFormatter 必须递归 strip OpenCode 内部字段(黑名单 + Bearer token regex)
8. **跨网络 HTTPS**:`init()` 阶段强制校验,非回环 endpoint 必须 `https://`,否则启动失败
9. **跨用户隔离**:`PROJECT_NO_ACCESS` 错误响应在"项目不存在"和"无权访问"两种情况字节级相同,防侧信道枚举

### Wave 转 Wave 的 Checkpoint

每完成一个 Wave 后检查:

| Wave | Checkpoint |
|------|-----------|
| 0 | `bun install` 在 monorepo 根成功;types 编译通过 |
| 1 | 三个无依赖组件单测全绿,`getActive*Count()` 在 dispose 后为 0 |
| 2 | 三个中层组件单测全绿,跨用户字节相等响应已验证 |
| 3 | 12 个业务组件单测全绿,`Promise.race` finally clearTimeout 全部生效 |
| 4 | 进程入口装配成功,SIGTERM 下所有组件 dispose 干净;7 个集成测试全绿 |
| 5 | 3 条 PBT 全绿,Property 16 实际 numRuns ≥ 1000 |
| 6 | CentOS 8 容器一键安装通过;`/health` 200;HTTPS 强制生效;schema 缺失 503 |

### 与 openclaw-integration 的协同

本 spec 假定下列 Daemon 端点存在,**openclaw-integration 必须先实现这 4 个端点**才能跑通端到端集成测试:

- `POST /v1/project/:projectPath/gate/:gateId/decision`(对应本 spec Req 14、Task 4.5)
- `GET /v1/project/:projectPath/session/recent`(对应本 spec Req 16、Task 4.6)
- `GET /v1/blob/:hash`(对应本 spec Req 22、Task 4.10)
- `POST /v1/blob`(对应本 spec Req 17、Task 4.8)

在 openclaw-integration 端点未实现前:
- 单元测试(Wave 1-3)可独立完成
- 集成测试(Wave 4)用 MockDaemonServer 替身,模拟这些端点
- 生产部署前必须做 contract roundtrip(Task 3.3 的 `tests/integration/daemon-client-roundtrip.test.ts`)

### P0 / P1 边界

- **P0(本任务清单完整覆盖)**:Req 1-22 全部
- **P1(不在本任务清单)**:跨用户协作、多 active session、分布式去重、多模态附件流(详见 requirements.md Notes 章节)

### 任务工作量预估

| Wave | 任务数 | 预计 days(单人,顺序执行) | 并发优化后(多人 / sub-agent) |
|------|--------|---------------------------|---------------------------------|
| 0 | 5 | 1.5 | 1.0 |
| 1 | 3 | 2.0 | 1.0(三任务并行) |
| 2 | 3 | 1.5 | 1.0(三任务并行) |
| 3 | 12 | 6.0 | 3.0(四组并行) |
| 4 | 10 | 4.0 | 2.0(集成测试并行) |
| 5 | 3 | 2.0 | 1.0(三 PBT 并行) |
| 6 | 8 | 2.0 | 1.5 |
| **总计** | **44** | **19 天** | **10.5 天** |

实际可能因 PBT 收敛、Daemon 端点对齐等额外耗时浮动 ±20%。
