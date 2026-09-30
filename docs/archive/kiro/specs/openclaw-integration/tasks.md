# Tasks - OpenClaw Integration Layer

## Task Overview

| Phase | Task Count | Description |
|-------|------------|-------------|
| Phase 1 | 9 | Daemon HTTP API 端点实现（含 OCI-9/10/11/12 新端点） |
| Phase 2 | 3 | OpenCode 进程管理 |
| Phase 3 | 4 | Webhook 事件系统 |
| Phase 4 | 3 | OpenClaw Skill 模板 |
| Phase 5 | 2 | 集成测试与文档 |

---

## Phase 1: Daemon HTTP API 端点

### OCI-T1.1 实现项目路由中间件

**Description**: 实现基于 projectPath 的路由中间件

**Acceptance Criteria**:
- [ ] 解析 URL 编码的 projectPath
- [ ] 查找或创建 project context
- [ ] 注入 project context 到请求对象

**Dependencies**: None

**Estimated Effort**: 1 day

---

### OCI-T1.2 实现 Session CRUD API

**Description**: 实现 `/v1/project/:projectPath/session` 端点

**Acceptance Criteria**:
- [ ] POST /session - 创建新 session
- [ ] GET /session/:sessionId - 获取 session 状态
- [ ] POST /session/:sessionId/cancel - 取消 session
- [ ] 集成 Session Registry

**Dependencies**: OCI-T1.1

**Estimated Effort**: 2 days

---

### OCI-T1.3 实现消息发送 API

**Description**: 实现 `/v1/project/:projectPath/session/:sessionId/prompt` 端点

**Acceptance Criteria**:
- [ ] 接收用户消息
- [ ] 验证 session 状态
- [ ] 调用 OpenCodeAdapter.deliverPrompt()

**Dependencies**: OCI-T1.2

**Estimated Effort**: 1 day

---

### OCI-T1.4 实现事件流 SSE API

**Description**: 实现 `/v1/project/:projectPath/session/:sessionId/events` 端点

**Acceptance Criteria**:
- [ ] 使用 Server-Sent Events
- [ ] 从 Event Bus 订阅事件
- [ ] 正确处理连接断开

**Dependencies**: OCI-T1.2

**Estimated Effort**: 1 day

---

### OCI-T1.5 实现工作流快捷 API

**Description**: 实现 `/v1/workflow/start` 端点

**Acceptance Criteria**:
- [ ] 接收 workflowId + initialMessage
- [ ] 自动创建 session 并发送初始 prompt
- [ ] 返回 jobId 供轮询

**Dependencies**: OCI-T1.2, OCI-T1.3

**Estimated Effort**: 1 day

---

### OCI-T1.6 实现最近 Session 查询 API（OCI-9）

**Description**: 实现 `GET /v1/project/:projectPath/session/recent`，支持 OpenClaw Skill 的会话续接（resumeProject）

**Acceptance Criteria**:
- [ ] 实现 `RecentSessionResolver` 类（design.md §6）
- [ ] 已结束 session 按 endedAt 降序，未结束按 createdAt 降序，返回最近一条
- [ ] 摘要由 `EventSummarizer` 抽取最后 N 条 message.content + tool.result
- [ ] 摘要 ≤ 4 KiB inline；超长走 CAS blob 引用（依赖 OCI-T1.8）
- [ ] 无 session 返 404 + `error: "SESSION_NOT_FOUND"`
- [ ] Daemon 重启后从 events.jsonl 重建索引，返回结果与重启前字节级一致
- [ ] 单测覆盖：无 session、单 session、多 session 排序、跨重启字节相等

**Dependencies**: OCI-T1.2, OCI-T1.8

**Estimated Effort**: 2 days

---

### OCI-T1.7 实现 Gate 决定回传 API（OCI-10）

**Description**: 实现 `POST /v1/project/:projectPath/gate/:gateId/decision`，支持 OpenClaw Skill 的 Gate 双向交互

**Acceptance Criteria**:
- [ ] 实现 `GateRegistry` 类（design.md §7）
- [ ] 持久化 `gates.jsonl`（append-only，根对象含 `schema_version: "1.0"`）
- [ ] 幂等：同 `idempotencyKey` + 同 `decision` 重复请求返回 200，不重复推进工作流
- [ ] 冲突：同 gateId 已被另一不同 decision 终结返 409 + `recordedDecision` 字段
- [ ] 非法 decision（不是 approve/reject）返 400 + `error: "INVALID_DECISION"`
- [ ] gateId 不存在返 404 + `error: "GATE_NOT_FOUND"`
- [ ] 决定写入 events.jsonl（`gate.decided`）+ 推 webhook（`gate.approved` / `gate.rejected`）+ 通知 workflow 引擎继续
- [ ] 接受 `decision: "reject"` + `reason: "timeout-no-response"` 作为正常超时终结路径
- [ ] 单测覆盖：create + submit + 幂等 + 冲突 + 非法 decision + 不存在 + 超时 reject

**Dependencies**: OCI-T1.1, OCI-T3.2

**Estimated Effort**: 2 days

---

### OCI-T1.8 实现 CAS Blob 上传 API（OCI-12）

**Description**: 实现 `POST /v1/blob`，配合 OpenClaw Skill 的附件上传和大输出引用

**Acceptance Criteria**:
- [ ] 实现 `BlobStore.put()`（design.md §8）
- [ ] 接受 `application/octet-stream` + 自定义头（X-Content-Type / X-Original-Filename）
- [ ] 接受 `multipart/form-data`（含 file / mime / filename 字段）
- [ ] 计算 sha256，返回 `{hash, size, mime, createdAt}`
- [ ] 内容去重：同 hash 已存在返 200（不是 201）+ refCount++
- [ ] 单 blob ≤ 25 MiB（默认；可配置），超限返 413 + `error: "BLOB_TOO_LARGE"`
- [ ] MIME 黑名单（`application/x-msdownload` 等）返 415 + `error: "UNSUPPORTED_MIME"`
- [ ] CAS 存储后端抽象（V6.0 P0 用本地 fs，按 `<hash[0:2]>/<hash[2:]>` 分桶）
- [ ] 元数据持久化（`schema_version: "1.0"` 必填）
- [ ] 失败回滚：元数据写入失败时删除已写入的二进制
- [ ] 单测覆盖：去重幂等、超大拒绝、MIME 黑名单、回滚

**Dependencies**: OCI-T1.1

**Estimated Effort**: 2 days

---

### OCI-T1.9 实现 CAS Blob 解引用 API（OCI-11）

**Description**: 实现 `GET /v1/blob/:hash`，配合 OpenClaw Skill 的 webhook payload blob 解引用

**Acceptance Criteria**:
- [ ] 实现 `BlobStore.get()` 和 `BlobStore.getRange()`（design.md §8）
- [ ] hash 存在返 200 + 二进制流 + 头（Content-Type / X-Blob-Sha256 / X-Blob-Size）
- [ ] hash 不存在返 404 + `error: "BLOB_NOT_FOUND"`
- [ ] hash 历史存在但已 GC 返 410 + `error: "BLOB_GONE"`（与 404 区分）
- [ ] 完整性校验：返回流 sha256 ≠ 请求 hash 时返 500 + `error: "BLOB_INTEGRITY_FAIL"`，并记录磁盘损坏告警
- [ ] 支持 HTTP `Range` header
- [ ] 并发请求同 hash 内部缓存，避免重复磁盘 IO
- [ ] 单测覆盖：404 vs 410 区分、Range、完整性失败、并发只读一次

**Dependencies**: OCI-T1.8

**Estimated Effort**: 1 day

---

## Phase 2: OpenCode 进程管理

### OCI-T2.1 实现进程池

**Description**: 实现 OpenCode 进程池管理

**Acceptance Criteria**:
- [ ] 维护最小/最大进程数
- [ ] 按需启动新进程
- [ ] 进程空闲回收

**Dependencies**: OCI-T1.1

**Estimated Effort**: 2 days

---

### OCI-T2.2 实现端口分配器

**Description**: 实现端口池分配

**Acceptance Criteria**:
- [ ] 分配指定范围内的端口
- [ ] 跟踪已用端口
- [ ] 端口释放

**Dependencies**: None

**Estimated Effort**: 0.5 day

---

### OCI-T2.3 实现进程健康检查

**Description**: 实现 OpenCode 进程健康检查

**Acceptance Criteria**:
- [ ] 定期检查进程状态
- [ ] 进程异常退出时自动重启
- [ ] 记录健康事件

**Dependencies**: OCI-T2.1

**Estimated Effort**: 1 day

---

## Phase 3: Webhook 事件系统

### OCI-T3.1 实现 Webhook 注册 API

**Description**: 实现 `/v1/webhook/register` 端点

**Acceptance Criteria**:
- [ ] POST /webhook/register - 注册 webhook
- [ ] POST /webhook/unregister - 注销 webhook
- [ ] 支持事件过滤

**Dependencies**: OCI-T1.1

**Estimated Effort**: 1 day

---

### OCI-T3.2 实现 Webhook 投递

**Description**: 实现 webhook 事件投递

**Acceptance Criteria**:
- [ ] 从 Event Bus 订阅事件
- [ ] 投递到注册的 URL
- [ ] 支持签名验证

**Dependencies**: OCI-T3.1

**Estimated Effort**: 1 day

---

### OCI-T3.3 实现重试机制

**Description**: 实现 webhook 重试

**Acceptance Criteria**:
- [ ] 失败后指数退避重试
- [ ] 最多 3 次重试
- [ ] 记录重试日志

**Dependencies**: OCI-T3.2

**Estimated Effort**: 0.5 day

---

### OCI-T3.4 实现事件类型映射

**Description**: 定义事件类型和 payload schema

**Acceptance Criteria**:
- [ ] 定义所有事件类型
- [ ] 定义各事件 payload
- [ ] 文档化

**Dependencies**: None

**Estimated Effort**: 0.5 day

---

## Phase 4: OpenClaw Skill 模板

### OCI-T4.1 创建 OpenClaw Skill 模板

**Description**: 创建 OpenClaw skill 模板

**Acceptance Criteria**:
- [ ] SKILL.md 定义
- [ ] metadata.json 定义
- [ ] 核心逻辑 TypeScript 模板

**Dependencies**: OCI-T1.5

**Estimated Effort**: 1 day

---

### OCI-T4.2 实现 Skill 配置加载

**Description**: 实现 skill 配置管理

**Acceptance Criteria**:
- [ ] 读取 Daemon URL
- [ ] 读取/刷新 token
- [ ] 处理配置变更

**Dependencies**: OCI-T4.1

**Estimated Effort**: 0.5 day

---

### OCI-T4.3 实现消息处理

**Description**: 实现用户消息处理逻辑

**Acceptance Criteria**:
- [ ] 解析用户命令
- [ ] 提取 projectPath
- [ ] 调用 Daemon API

**Dependencies**: OCI-T4.2

**Estimated Effort**: 1 day

---

## Phase 5: 集成测试与文档

### OCI-T5.1 端到端集成测试

**Description**: 完整集成测试

**Acceptance Criteria**:
- [ ] OpenClaw Skill → Daemon → OpenCode 完整流程
- [ ] 多项目隔离测试
- [ ] 并发请求测试

**Dependencies**: OCI-T2.3, OCI-T4.3

**Estimated Effort**: 2 days

---

### OCI-T5.2 编写集成文档

**Description**: 编写用户集成文档

**Acceptance Criteria**:
- [ ] OpenClaw Skill 安装指南
- [ ] Daemon 配置指南
- [ ] 故障排查指南

**Dependencies**: None

**Estimated Effort**: 1 day

---

## Task Dependencies Graph

```
Phase 1 (API)
├── OCI-T1.1 ──┬── OCI-T1.2 ──┬── OCI-T1.3
│             │              ├── OCI-T1.4
│             │              └── OCI-T1.6 (recent session)
│             ├── OCI-T1.5
│             ├── OCI-T1.7 (gate decision) ── (依赖 OCI-T3.2 webhook 投递)
│             └── OCI-T1.8 (blob upload) ──> OCI-T1.9 (blob get) + OCI-T1.6
│
Phase 2 (Process)
├── OCI-T2.1 ──┬── OCI-T2.3
│             └── OCI-T1.1
├── OCI-T2.2
│
Phase 3 (Webhook)
├── OCI-T3.1 ──┬── OCI-T3.2 ──┬── OCI-T3.3
│             │              └── OCI-T1.7 (gate decision)
│             └── OCI-T3.4
│
Phase 4 (Skill)
├── OCI-T4.1 ──┬── OCI-T4.2 ──┬── OCI-T4.3
│             └── OCI-T1.5
│
Phase 5 (Test & Docs)
└── OCI-T5.1 ── OCI-T5.2
```

---

## Wave Allocation

| Wave | Tasks | Start After |
|------|-------|-------------|
| Wave 1 | OCI-T1.1, OCI-T2.2, OCI-T3.4 | M3 (可观测性基础) |
| Wave 2 | OCI-T1.2, OCI-T1.3, OCI-T1.4, OCI-T1.8 | Wave 1 |
| Wave 3 | OCI-T1.5, OCI-T1.6, OCI-T1.9, OCI-T2.1, OCI-T2.3 | Wave 2 |
| Wave 4 | OCI-T3.1, OCI-T3.2, OCI-T3.3, OCI-T1.7 | Wave 2（OCI-T1.7 还需 OCI-T3.2） |
| Wave 5 | OCI-T4.1, OCI-T4.2, OCI-T4.3 | Wave 3 |
| Wave 6 | OCI-T5.1, OCI-T5.2 | Wave 5 |

---

## Skill 端依赖对齐

下列新增任务为 `openclaw-skill-bridge` spec 假定存在的 Daemon 端点提供实现，跨 spec 对齐关系：

| OCI 任务 | 端点 | Skill 端依赖任务（openclaw-skill-bridge） |
|---|---|---|
| OCI-T1.6 | `GET /v1/project/:projectPath/session/recent` | T3.3 / T3.6 / T4.6 |
| OCI-T1.7 | `POST /v1/project/:projectPath/gate/:gateId/decision` | T3.3 / T3.8 / T4.5 |
| OCI-T1.8 | `POST /v1/blob` | T3.3 / T2.3 / T4.8 |
| OCI-T1.9 | `GET /v1/blob/:hash` | T3.3 / T3.12 / T4.10 |

完成 OCI-T1.6 ~ OCI-T1.9 后，跑 `openclaw-skill-bridge/tests/integration/daemon-client-roundtrip.test.ts`（Skill 端 T3.3 的契约对齐回归测试）作为联调入口。