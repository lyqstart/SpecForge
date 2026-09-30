# Requirements Document - OpenClaw Integration Layer

## Introduction

本 spec 定义 OpenClaw Skill ↔ Daemon ↔ OpenCode 三层架构的接口契约。它是 [v6-architecture-overview/requirements.md REQ-30 Property 16](../v6-architecture-overview/requirements.md) 的具体实现。

## Glossary

- **OpenClaw Skill**：部署在 OpenClaw 平台上的 skill，负责与 SpecForge Daemon 通信。
- **Project Path**：项目根目录的绝对路径，作为 OpenClaw Skill 与 Daemon 之间的 join key。
- **Session ID**：OpenCode session 的唯一标识，由 Daemon 生成并管理。
- **Job ID**：长时间运行操作的任务 ID，用于轮询状态。
- **Webhook Endpoint**：事件回调端点，由 OpenClaw 注册以接收 SpecForge 事件。

## Requirements

### Requirement OCI-1: 三层架构定义

**User Story:** 作为架构师，我希望明确定义 OpenClaw Skill、Daemon、OpenCode 三层的职责边界，以便实现清晰的关注点分离。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 定义为**基础设施层**，负责：
   - 接收 OpenClaw 平台的用户指令
   - 解析并提取 projectPath 和用户消息
   - 向 Daemon 发起 HTTP 请求
   - 处理 webhook 回调并转发到 OpenClaw 平台

2. THE Daemon SHALL 定义为**应用层**，负责：
   - 管理所有 project context 的状态
   - 维护 Session Registry（sessionId ↔ AgentIdentity 映射）
   - 编排工作流（创建 session、发送 prompt、获取事件流）
   - 权限判定和事件记录
   - 响应 OpenClaw Skill 的 HTTP 请求

3. THE OpenCode SHALL 定义为**执行层**（headless LLM Kernel），负责：
   - 被 Daemon 按需召唤启动
   - 执行 LLM 推理
   - 执行 Agent 工具调用
   - 产生事件流（session.started、tool.called、message 等）

### Requirement OCI-2: 消息流约束

**User Story:** 作为安全架构师，我希望业务消息必须经过 Daemon，以确保所有状态变更都被正确记录和授权。

#### Acceptance Criteria

1. THE 业务消息流 SHALL 遵循以下路径：
   ```
   用户指令 → OpenClaw Skill → Daemon HTTP API → OpenCode Session → 事件流 → Daemon → Webhook → OpenClaw Skill → 用户
   ```

2. THE OpenClaw_Skill SHALL **禁止**直接调用 OpenCode Session API（如 `POST /session/{id}/prompt`），所有业务消息必须经过 Daemon HTTP API。

3. THE Daemon SHALL 作为所有状态变更的唯一 Source of Truth，任何状态变更必须落入 `events.jsonl`。

### Requirement OCI-3: Daemon HTTP API 端点

**User Story:** 作为 OpenClaw Skill 开发者，我希望 Daemon 提供完整的 HTTP API 以支持所有业务操作。

#### Acceptance Criteria

1. THE Daemon SHALL 提供以下 HTTP API 端点：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/v1/project/:projectPath/session` | POST | 创建新的 OpenCode session |
| `/v1/project/:projectPath/session/:sessionId/prompt` | POST | 向 session 发送用户消息 |
| `/v1/project/:projectPath/session/:sessionId/cancel` | POST | 取消 session |
| `/v1/project/:projectPath/session/:sessionId/events` | GET | 获取 session 事件流（SSE） |
| `/v1/project/:projectPath/session/:sessionId/status` | GET | 获取 session 状态 |
| `/v1/project/:projectPath/session/recent` | GET | 获取最近活跃 session（用于会话续接，详见 OCI-9） |
| `/v1/project/:projectPath/gate/:gateId/decision` | POST | 提交 Gate 审批决定（详见 OCI-10） |
| `/v1/blob/:hash` | GET | 解引用 CAS blob（详见 OCI-11） |
| `/v1/blob` | POST | 上传 CAS blob（详见 OCI-12） |
| `/v1/workflow/start` | POST | 启动工作流（创建 session + 发送初始 prompt） |
| `/v1/job/:jobId` | GET | 查询异步 job 状态 |
| `/v1/webhook/register` | POST | 注册 webhook 回调 |
| `/v1/webhook/unregister` | POST | 注销 webhook 回调 |
| `/v1/project/:projectPath/state` | GET | 获取项目状态 |
| `/v1/health` | GET | 健康检查 |

2. THE API SHALL 使用 Bearer Token 认证，token 在 Daemon 握手文件中（`~/.specforge/runtime/daemon.sock.json`）。

3. THE API SHALL 支持 JSON 请求和响应，大于 64 KiB 的内容使用 CAS blob 引用。

4. THE API SHALL 对所有端点返回一致的错误格式：
   ```json
   {
     "error": "ERROR_CODE",
     "message": "人类可读的错误描述",
     "hint": "可操作的解决建议（可选）"
   }
   ```

### Requirement OCI-4: Project Path 路由

**User Story:** 作为多项目用户，我希望 Daemon 能够根据 projectPath 正确路由请求到对应的项目上下文。

#### Acceptance Criteria

1. THE Daemon SHALL 使用 `projectPath`（URL 编码的项目根目录绝对路径）作为路由 key。

2. THE `/v1/project/:projectPath/*` 的所有请求 SHALL 路由到对应的 project context。

3. THE Daemon SHALL 在 project context 首次被访问时创建必要的目录结构（`~/.specforge/runtime/{projectHash}/`、`{project}/.specforge/`）。

4. THE OpenClaw_Skill SHALL 在请求中传递有效的 `projectPath`，无效的 projectPath 应返回 400 错误。

### Requirement OCI-5: Webhook 事件订阅

**User Story:** 作为 OpenClaw 集成者，我希望能够订阅 SpecForge 的事件以便实时获取工作流状态更新。

#### Acceptance Criteria

1. THE Daemon SHALL 支持 webhook 注册，事件包括：
   - `session.started`
   - `session.completed`
   - `session.failed`
   - `session.cancelled`
   - `message.created`
   - `message.content`
   - `tool.called`
   - `tool.result`
   - `gate.approved`
   - `gate.rejected`
   - `error`

2. THE Webhook Payload SHALL 包含以下字段：
   ```json
   {
     "event": "session.completed",
     "timestamp": 1747910400000,
     "projectPath": "/path/to/project",
     "sessionId": "ses_abc123",
     "data": { ... }
   }
   ```

3. THE Daemon SHALL 对 webhook 回调失败实现重试机制（指数退避，最多 3 次）。

### Requirement OCI-6: OpenCode 进程管理

**User Story:** 作为系统架构师，我希望 Daemon 能够管理 OpenCode 进程的生命周期，以便在 headless 环境下运行。

#### Acceptance Criteria

1. THE Daemon SHALL 支持按需启动 OpenCode 进程（headless 模式）。

2. THE Daemon SHALL 维护 OpenCode 进程池，根据负载自动扩缩容。

3. THE Daemon SHALL 在 OpenCode 进程异常退出时自动重启，并在事件日志中记录。

4. THE OpenCode 进程 SHALL 与 Daemon 通过内部 HTTP 通信，不暴露端口到 localhost 之外。

### Requirement OCI-7: 会话生命周期管理

**User Story:** 作为工作流编排者，我希望 Daemon 能够管理完整的会话生命周期。

#### Acceptance Criteria

1. THE Daemon SHALL 支持以下会话状态：
   - `pending`：session 已创建，等待 OpenCode 响应
   - `initializing`：OpenCode 正在启动
   - `running`：session 正常运行
   - `waiting_for_input`：等待用户输入
   - `completed`：session 正常完成
   - `failed`：session 执行失败
   - `cancelled`：session 被取消

2. THE Session_Registry SHALL 记录每个 session 的元数据：
   - `sessionId`
   - `projectPath`
   - `agentRole`
   - `workflowRole`
   - `parentSessionId`（如果有）
   - `workItemId`
   - `spawnIntentId`
   - `createdAt`
   - `updatedAt`
   - `status`

### Requirement OCI-8: 错误处理与重试

**User Story:** 作为集成开发者，我希望有清晰的错误处理规范，以便构建健壮的集成。

#### Acceptance Criteria

1. THE Daemon SHALL 返回以下错误码：

| 错误码 | HTTP 状态码 | 描述 | 重试建议 |
|--------|-------------|------|----------|
| `PROJECT_NOT_FOUND` | 404 | projectPath 不存在 | 检查 projectPath 是否正确 |
| `PROJECT_NO_ACCESS` | 403 | 无权访问该项目 | 检查权限配置 |
| `SESSION_NOT_FOUND` | 404 | session 不存在或已过期 | 重���创建 session |
| `SESSION_NOT_ACTIVE` | 400 | session 当前不活跃 | 等待 session 变为 active |
| `SESSION_FAILED` | 500 | session 执行失败 | 查看错误详情 |
| `DAEMON_UNREACHABLE` | 503 | Daemon 不可达 | 检查 Daemon 是否运行 |
| `AUTH_FAILED` | 401 | 认证失败 | 检查 token 是否有效 |
| `RATE_LIMITED` | 429 | 请求过于频繁 | 指数退避重试 |
| `GATE_NOT_FOUND` | 404 | gate 不存在或已过期（OCI-10） | 等待新审批通知 |
| `GATE_ALREADY_DECIDED` | 409 | gate 已被另一不同 decision 终结（OCI-10） | 不重试，由用户重新审视 |
| `INVALID_DECISION` | 400 | gate decision 字段非法（OCI-10） | 修正客户端代码 |
| `BLOB_NOT_FOUND` | 404 | blob hash 不存在（OCI-11） | 不重试，降级显示 |
| `BLOB_GONE` | 410 | blob 已被删除/GC（OCI-11） | 不重试 |
| `BLOB_INTEGRITY_FAIL` | 500 | blob 完整性校验失败（OCI-11） | 重新请求一次；持续失败上报运维 |
| `BLOB_TOO_LARGE` | 413 | blob 超过上限（OCI-12） | 客户端先压缩或拆分 |
| `UNSUPPORTED_MIME` | 415 | MIME 不允许上传（OCI-12） | 客户端检查类型白名单 |
| `BLOB_STORAGE_FAIL` | 500 | CAS 存储失败（OCI-12） | 指数退避重试 3 次 |

2. THE Daemon SHALL 对瞬态错误（503、429）实现自动重试，客户端不需要实现重试逻辑。

### Requirement OCI-9: 最近 Session 查询（会话续接支持）

**User Story:** 作为 OpenClaw Skill 实现者，我希望通过单次 API 调用获取某项目最近的 session 摘要，以便实现"继续刚才的项目"这类自然续接场景；同时希望该接口在 Daemon 中途重启过的跨日场景下仍能基于 events.jsonl 重建摘要返回。

#### Acceptance Criteria

1. THE Daemon SHALL 提供端点 `GET /v1/project/:projectPath/session/recent`，认证方式同 OCI-3 AC-2（Bearer Token）。

2. WHEN 该项目存在过任意 session（含已结束的 completed / failed / cancelled），THE Daemon SHALL 返回 200 + JSON：
   ```json
   {
     "sessionId": "ses_abc123",
     "status": "completed",
     "createdAt": 1700000000000,
     "endedAt": 1700050000000,
     "summary": "上次完成了 5 个文件的实现，最后停在 src/game.ts 的 checkWin 函数",
     "lastEventIndex": 142,
     "agentRole": "sf-orchestrator"
   }
   ```
   其中 `summary` 由 Daemon 基于 `events.jsonl` 摘要生成（最后 N 条 message.content / tool.result 聚合），`lastEventIndex` 指向 `events.jsonl` 中最后处理的事件序号。

3. WHEN 该项目从未有过 session，THE Daemon SHALL 返回 404 + `error: "SESSION_NOT_FOUND"`。

4. WHERE Daemon 中途重启过（events.jsonl 是真值），THE Daemon SHALL 在启动时按需 reload `events.jsonl` 重建 session 索引，使本端点返回的数据与重启前**字节级一致**（前提：events.jsonl 未被外部篡改）。

5. THE summary 字段长度 SHALL 不超过 4 KiB；超长内容 SHALL 通过 CAS blob 引用（详见 OCI-11、OCI-3 AC-3）。

6. THE 端点 SHALL 与 OCI-7 定义的 session 状态枚举完全对齐（`pending` / `initializing` / `running` / `waiting_for_input` / `completed` / `failed` / `cancelled`）。

7. WHEN 同一 projectPath 存在多个 session（含历史归档），THE Daemon SHALL 按 `endedAt` 降序排列，返回最近一条；若所有 session 都未结束，按 `createdAt` 降序排列。

### Requirement OCI-10: Gate 决定回传（双向交互）

**User Story:** 作为 OpenClaw Skill 实现者，我希望在用户对工作流 Gate（如 requirements 审批、design 审批）作出决定后，能通过单次幂等 API 把决定回传给 Daemon，让工作流继续推进。

#### Acceptance Criteria

1. THE Daemon SHALL 提供端点 `POST /v1/project/:projectPath/gate/:gateId/decision`，认证同 OCI-3。

2. THE 请求体 SHALL 形如：
   ```json
   {
     "decision": "approve",
     "reason": "需求看起来合理",
     "decidedBy": "tg:1234567",
     "idempotencyKey": "gate_req_001:approve"
   }
   ```
   其中 `decision` 取值 `"approve"` 或 `"reject"`；`reason` 可选；`decidedBy` 为 IM 平台用户标识用于审计；`idempotencyKey` 用于幂等保护。

3. THE 成功响应 (200) SHALL 形如：
   ```json
   {
     "gateId": "gate_req_001",
     "state": "approved",
     "decidedAt": 1700050000000
   }
   ```

4. WHEN 同一 `idempotencyKey` 重复请求且 `decision` 相同，THE Daemon SHALL 返回 200（不重复推进工作流，幂等）。

5. WHEN 同一 gate 已被另一个不同的 decision 终结（即收到的 `decision` 与已记录的不同），THE Daemon SHALL 返回 409 + `error: "GATE_ALREADY_DECIDED"`，并在响应中包含已记录的 `decision` 字段供客户端核对。

6. WHEN gateId 不存在或已过期，THE Daemon SHALL 返回 404 + `error: "GATE_NOT_FOUND"`。

7. WHEN `decision` 字段非法（不是 `"approve"` / `"reject"`），THE Daemon SHALL 返回 400 + `error: "INVALID_DECISION"`。

8. THE Daemon SHALL 在事件日志 `events.jsonl` 中记录 `gate.decided` 事件，含完整决定信息（gateId、decision、decidedBy、reason、idempotencyKey、decidedAt）。

9. THE 决定记录 SHALL 触发 Daemon 推送 `gate.approved` 或 `gate.rejected` webhook 事件（见 OCI-5），让所有订阅方感知。

10. WHILE 一个 gate 处于 pending 状态超过其 `timeoutAt`（由 Daemon 工作流逻辑设置，默认 24 小时），THE Daemon SHALL 接受 `decision: "reject"` + `reason: "timeout-no-response"` 的回传作为正常终结（用于 Skill 端超时自动 reject 场景）。

### Requirement OCI-11: CAS Blob 解引用

**User Story:** 作为 OpenClaw Skill 或其他客户端，当我从 webhook payload 或 API 响应中收到 `{"$blob": "sha256:..."}` 引用时，我希望通过单次 GET 解引用拿到完整原始内容。

#### Acceptance Criteria

1. THE Daemon SHALL 提供端点 `GET /v1/blob/:hash`，认证同 OCI-3。

2. THE 路径参数 `:hash` SHALL 为完整的 hash 字符串（含算法前缀，如 `sha256:abc123...`），URL-safe encoded。

3. WHEN blob 存在，THE Daemon SHALL 返回 200 + 原始二进制流，HTTP 头包含：
   - `Content-Type`: blob 上传时记录的 MIME（默认 `application/octet-stream`）
   - `Content-Length`: 字节数
   - `X-Blob-Sha256`: 完整 hash 供客户端校验
   - `X-Blob-Size`: 等同 Content-Length，方便日志

4. WHEN hash 不存在，THE Daemon SHALL 返回 404 + `error: "BLOB_NOT_FOUND"`。

5. WHEN blob 已被显式删除或 GC，THE Daemon SHALL 返回 410 Gone + `error: "BLOB_GONE"`（与 404 区分，告知客户端该 hash 历史上存在但现已不可恢复）。

6. THE Daemon SHALL 计算并校验返回流的 SHA-256 与请求 hash 一致；不一致 SHALL 返回 500 + `error: "BLOB_INTEGRITY_FAIL"` 并在日志中记录。

7. THE 单个 blob 大小 SHALL 不超过 25 MiB（默认；可配置）。

8. THE 端点 SHALL 支持 HTTP `Range` header 用于大文件分片下载。

9. WHILE 同一 hash 被多个客户端并发请求，THE Daemon SHALL 内部缓存 / 共享读取，避免重复磁盘 IO。

### Requirement OCI-12: CAS Blob 上传

**User Story:** 作为 OpenClaw Skill 或其他需要上传附件的客户端，我希望通过单次 POST 把二进制内容上传到 Daemon 的 CAS 存储，并拿到其 sha256 hash 用作后续 API 调用的引用。

#### Acceptance Criteria

1. THE Daemon SHALL 提供端点 `POST /v1/blob`，认证同 OCI-3。

2. THE 请求 SHALL 接受以下两种格式：
   - **格式 A**：`Content-Type: application/octet-stream` + 原始二进制 body；元数据通过自定义头传递：
     - `X-Content-Type`: 期望的 MIME 类型（默认 `application/octet-stream`）
     - `X-Original-Filename`: 原始文件名（可选，用于日志/审计）
   - **格式 B**：`Content-Type: multipart/form-data`，含字段 `file`、`mime`（可选）、`filename`（可选）

3. THE 成功响应 (201) SHALL 形如：
   ```json
   {
     "hash": "sha256:abc123...",
     "size": 1234567,
     "mime": "image/png",
     "createdAt": 1700050000000
   }
   ```

4. WHEN 单个 blob 大小超过配置上限（默认 25 MiB），THE Daemon SHALL 返回 413 + `error: "BLOB_TOO_LARGE"`。

5. WHEN MIME 在 Daemon 黑名单内（`application/x-msdownload`、`application/x-msi`、`application/x-bat` 等可执行类型），THE Daemon SHALL 返回 415 + `error: "UNSUPPORTED_MIME"`。

6. WHEN 同一内容（hash 相同）已存在，THE Daemon SHALL 返回 200（**注意是 200 不是 201**）+ 已有的 blob 元数据（去重幂等）。

7. THE Daemon SHALL 在 CAS 存储成功后才返回 hash；存储失败 SHALL 返回 500 + `error: "BLOB_STORAGE_FAIL"`，并保证不留下半成品 blob。

8. THE Daemon SHALL 把 CAS 存储位置作为内部细节封装；客户端**不应**感知存储后端（本地文件系统 / S3 / 其他）。

9. THE blob 默认保留期 SHALL 与所属 project context 一致；project 归档时 blob 列入 GC 候选。

10. WHILE 客户端通过 `Range` 或多请求 chunked 上传时，THE Daemon SHALL **不**支持断点续传（V6.0 P0 范围内单请求完整上传）；超大文件分片上传留待 P1。

## Non-Functional Requirements

### Performance

1. THE API 响应时间 SHALL 小于 100ms（不含业务处理）。
2. THE 事件流延迟 SHALL 小于 500ms。

### Security

1. THE 所有 API SHALL 使用 Bearer Token 认证。
2. THE 远程访问 SHALL 支持 IP 白名单。
3. THE 敏感操作 SHALL 支持二步确认。

### Reliability

1. THE Daemon 崩溃后 SHALL 通过 events.jsonl 恢复状态。
2. THE Webhook 回调失败 SHALL 重试最多 3 次。