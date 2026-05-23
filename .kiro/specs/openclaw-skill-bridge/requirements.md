# Requirements Document

## Introduction

本 spec（**OpenClaw Skill Bridge**）定义 OpenClaw Skill 端的具体实现规范，作为 **OpenClaw Skill ↔ Daemon ↔ OpenCode** 三层架构中的客户端层（即 Skill 层）。它基于现有 `openclaw-integration` spec 定义的 HTTP API 契约，实现 OpenClaw 平台用户通过 IM 指令进行软件开发的完整流程。

**父规范**：本 spec 继承并实现父规范 **[v6-architecture-overview](../v6-architecture-overview/requirements.md)** 中定义的架构约束。

**依赖关系**：本 spec 依赖 [`openclaw-integration`](../openclaw-integration/requirements.md) spec 定义的 Daemon HTTP API 契约。任何引用 Daemon API 的端点都以 `openclaw-integration` Req OCI-3 的端点列表为准。

**Scope**：本 spec 是 **P0** 规范，其功能为 V6.0 发行所必需。具体 P0/P1 边界见文末 Notes。

## Glossary

- **OpenClaw_Skill**：部署在 OpenClaw 平台上的 skill 实现，负责解析用户 IM 指令并与 SpecForge Daemon 通信
- **IM_Command**：用户在 OpenClaw 平台发送的即时消息指令，如"开发五子棋"、"修复登录 bug"
- **IM_User_Id**：IM 平台侧用户的唯一标识（如 Telegram chat_id、微信 OpenID、Discord userId 等），用于"用户 ↔ 项目"归属映射
- **Project_Context**：项目上下文，包含项目路径、当前活跃会话、项目状态等信息
- **Command_Router**：命令路由器，负责将用户自然语言指令映射到具体的 Daemon API 调用
- **Session_Manager**：会话管理器，负责管理项目的会话生命周期和状态跟踪
- **Event_Subscriber**：事件订阅器，负责接收 Daemon 的 webhook 事件并转换为用户友好的反馈
- **Daemon_Client**：Daemon HTTP 客户端，封装所有与 SpecForge Daemon 的通信逻辑
- **Project_Registry**：项目注册表，维护用户可访问的项目列表、IM_User_Id ↔ projectPath 归属和权限信息
- **Gate**：Daemon 工作流中的人工审批检查点（如 requirements 通过、design 通过），由 Daemon 触发 `gate.required` 事件等待 Skill 收集用户决定后回传
- **Gate_Decision**：用户对某个 Gate 的批准/拒绝决定，由 Skill 通过 Daemon `POST /v1/project/:projectPath/gate/:gateId/decision` 端点回传（该端点为本 spec 对 `openclaw-integration` 的依赖项）
- **CAS_Blob_Reference**：内容寻址存储引用，形如 `{"$blob": "sha256:abc..."}`，用于在 webhook payload 中引用大于 64 KiB 的内容（见 `openclaw-integration` Req OCI-3 AC-3）
- **agentRole**：Daemon `/v1/workflow/start` 接受的工作流 Agent 角色名，本 spec 默认 `sf-orchestrator`（SpecForge 编排 agent，定义于 `.opencode/agents/sf-orchestrator.md`）
- **Schema_Version**：所有持久化 JSON/YAML 文件必须包含的版本字段，初始值 `"1.0"`（继承自父规范 Property 14 / REQ-18）

## Inherited Architectural Properties

本 spec 继承并必须实现以下来自父规范 **v6-architecture-overview** 的 **Correctness Properties**：

### Property 16: 三层架构边界（OpenClaw Skill / Daemon / OpenCode）

**For all** 由 `OpenClaw_Skill` 发起的对 OpenCode 行为的请求，请求路径必须经过 `Daemon HTTP API`；`OpenClaw_Skill` 不得直接调用 OpenCode Session API、不得自行启动 OpenCode 进程。`Daemon` 是 OpenCode 进程生命周期的唯一管理者；即使 Skill 与 Daemon 跨网络部署、即使 Skill 发现"自己启动更省事"，三层边界都不可被绕过。

**Validates**：Requirements 11、1（路由责任）、5（部署）、6.1（订阅来源）

### Property 14: schema_version 字段

**For all** 由 `OpenClaw_Skill` 写入磁盘的 JSON / YAML 持久化文件（包括但不限于配置文件、Project Registry 持久化文件、Webhook 注册表、用户权限映射文件），文件根对象必须包含 `schema_version` 字符串字段；缺失或非法的 `schema_version` 必须在加载时报错并要求迁移。

**Validates**：Requirements 19、5、7、10

### Property 4: Adapter 概念隔离

**For all** `OpenClaw_Skill` 公开的工具接口、错误码、用户消息和日志结构，其类型签名和运行时数据**不得**包含 OpenCode 内部概念（包括但不限于 OpenCode 的 `ctx`、`callID`、plugin hook shape、内部事件 schema）。即使 Daemon 透传了 OpenCode-specific 字段，Skill 在外发给用户/IM/上层日志前必须先剥离或翻译为 Daemon-neutral 表示。概念隔离义务的优先级**高于**便利性。

**Validates**：Requirements 1、2、4、6.2



## Requirements

### Requirement 1: OpenClaw Skill 工具定义

**User Story:** 作为 OpenClaw 平台用户，我希望通过标准的 skill 工具与 SpecForge 进行交互，以便在 IM 环境中进行软件开发。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 提供以下工具接口：
   - `startProject(projectPath: string, description: string, options?: { agentRole?: string })` - 启动新项目开发
   - `sendMessage(projectPath: string, message: string, attachments?: Attachment[])` - 向活跃项目发送开发指令
   - `listProjects()` - 列出**当前 IM_User_Id** 可访问的项目（不返回其他用户的项目）
   - `getProjectStatus(projectPath: string)` - 获取项目当前状态
   - `stopProject(projectPath: string, options?: { mode?: "graceful" | "immediate" | "force" })` - 停止项目开发会话
   - `getProjectHistory(projectPath: string, limit?: number)` - 获取项目开发历史
   - `resumeProject(projectPath: string)` - 续接最近一次活跃 session（详见 Req 16）
   - `respondToGate(projectPath: string, gateId: string, decision: "approve" | "reject", reason?: string)` - 响应 Gate 审批（详见 Req 14）

2. THE 工具接口 SHALL 返回结构化的响应格式：
   ```json
   {
     "success": boolean,
     "data": any,
     "error": string | null,
     "timestamp": number,
     "projectPath": string | null
   }
   ```

3. THE 工具调用 SHALL 支持异步操作，长时间运行的操作返回 jobId 供后续查询。

4. THE 所有工具 SHALL 包含完整的 JSDoc 注释，说明参数、返回值和使用示例。

### Requirement 2: IM 命令解析和路由策略

**User Story:** 作为 OpenClaw 用户，我希望能够用自然语言描述开发需求，系统能够智能解析并路由到正确的操作。

#### Acceptance Criteria

1. THE Command_Router SHALL 支持以下命令模式识别：

| 用户指令示例 | 识别模式 | 路由目标 |
|-------------|----------|----------|
| "开发五子棋游戏" | 新项目创建 | `startProject()` |
| "修复登录 bug" | 现有项目开发 | `sendMessage()` |
| "查看项目状态" | 状态查询 | `getProjectStatus()` |
| "停止开发" | 会话终止 | `stopProject()` |
| "我的项目列表" | 项目管理 | `listProjects()` |
| "项目历史记录" | 历史查询 | `getProjectHistory()` |

2. THE Command_Router SHALL 使用以下解析策略：
   - 关键词匹配（"开发"、"修复"、"查看"、"停止"、"列表"、"历史"）
   - 上下文推断（当前是否有活跃项目）
   - 意图分类（创建、修改、查询、管理）
   - 参数提取（项目名称、描述、路径）

3. THE Command_Router SHALL **不论意图是否明确**都展示候选操作列表供用户选择（用于发现性 / 减少误识别），意图明确时把最可能的候选标为高亮，但不省略候选展示。

4. THE Command_Router SHALL 支持多轮对话，记住上下文信息（如当前活跃项目）。

### Requirement 3: 项目生命周期管理

**User Story:** 作为开发者，我希望系统能够管理项目的完整生命周期，包括创建、激活、暂停、归档等状态。

#### Acceptance Criteria

1. THE Session_Manager SHALL 维护以下项目状态：
   - `inactive` - 项目存在但无活跃会话
   - `initializing` - 项目正在初始化（创建会话中）
   - `active` - 项目有活跃的开发会话
   - `waiting` - 等待用户输入或确认
   - `processing` - 正在处理开发任务
   - `paused` - 会话已暂停
   - `completed` - 开发任务已完成
   - `failed` - 会话执行失败
   - `archived` - 项目已归档

2. THE Session_Manager SHALL 支持以下状态转换：
   ```
   inactive → initializing → active → processing → completed
                ↓              ↓         ↓
              failed        paused    waiting
                              ↓         ↓
                            active    active
   ```

3. THE Session_Manager SHALL 在状态转换时触发相应的用户通知：
   - 项目启动成功/失败
   - 任务开始/完成
   - 需要用户输入
   - 错误和异常情况

4. THE Session_Manager SHALL 支持并发管理多个项目，每个项目独立维护状态。

5. WHILE 一个项目的会话超时配置值大于 0 分钟，THE Session_Manager SHALL 在该项目检测到无活动且累计无活动时长达到该配置值时，**仅暂停该具体项目**的会话；其他项目的会话不受影响。

6. WHERE 会话超时配置值等于 0 分钟，THE Session_Manager SHALL 视为"禁用超时暂停"，不基于无活动时长触发暂停。

7. THE 默认会话超时值 SHALL 为 30 分钟，可在配置文件中按项目或全局覆盖。

### Requirement 4: 错误处理和用户反馈机制

**User Story:** 作为用户，我希望在出现错误时能够获得清晰的错误信息和可操作的解决建议。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 处理以下错误类型：

| 错误类型 | 用户友好消息 | 建议操作 |
|----------|-------------|----------|
| `PROJECT_NOT_FOUND` | "项目不存在或路径无效" | "请检查项目路径是否正确" |
| `PROJECT_NO_ACCESS` | "无权访问该项目" | "请联系项目管理员获取权限" |
| `SESSION_FAILED` | "开发会话执行失败" | "请查看错误详情并重试" |
| `DAEMON_UNREACHABLE` | "SpecForge 服务不可用" | "请检查服务状态或联系管理员" |
| `RATE_LIMITED` | "请求过于频繁" | "请稍后再试" |
| `INVALID_COMMAND` | "无法理解您的指令" | "请尝试更明确的描述" |

2. THE 错误处理 SHALL 实现分层重试机制：
   - 网络错误：自动重试 3 次，指数退避
   - 认证错误：自动刷新 token 后重试 1 次
   - 业务错误：不重试，直接返回用户友好消息
   - 未知错误：记录详细日志，返回通用错误消息

3. THE 用户反馈 SHALL 包含以下信息：
   - 操作结果（成功/失败）
   - 执行时间
   - 下一步建议
   - 相关链接（如项目地址、文档链接）

4. THE OpenClaw_Skill SHALL 支持调试模式，在调试模式下返回详细的技术错误信息。

### Requirement 5: 部署配置和环境集成

**User Story:** 作为系统管理员，我希望能够在 CentOS 8 环境中部署和配置 OpenClaw Skill，并与 systemd 集成。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 支持以下部署配置：
   ```json
   {
     "daemon": {
       "endpoint": "http://localhost:3000",
       "authToken": "${SPECFORGE_TOKEN}",
       "timeout": 30000,
       "retryAttempts": 3
     },
     "webhook": {
       "endpoint": "http://localhost:8080/webhook",
       "secret": "${WEBHOOK_SECRET}",
       "events": ["session.*", "message.*", "tool.*"]
     },
     "projects": {
       "defaultPath": "/opt/projects",
       "allowedPaths": ["/opt/projects/*", "/home/*/projects/*"],
       "maxConcurrentSessions": 5
     },
     "logging": {
       "level": "info",
       "file": "/var/log/openclaw-skill/app.log",
       "maxSize": "100MB",
       "maxFiles": 10
     }
   }
   ```

2. THE 部署包 SHALL 包含以下组件：
   - OpenClaw Skill 主程序
   - systemd service 文件
   - 配置文件模板
   - 安装/卸载脚本
   - 健康检查脚本

3. THE systemd 集成 SHALL 支持：
   - 自动启动和重启
   - 日志轮转
   - 资源限制（内存、CPU）
   - 优雅关闭

4. THE 安装脚本 SHALL 执行以下操作：
   - 创建专用用户和用户组
   - 设置文件权限
   - 配置防火墙规则（如需要）
   - 注册 systemd 服务
   - 验证安装完整性

### Requirement 6: Webhook 事件订阅和处理

**User Story:** 作为集成开发者，我希望能够订阅 SpecForge 的实时事件，以便向用户提供及时的状态更新。

#### Acceptance Criteria

1. THE Event_Subscriber SHALL 订阅以下 Daemon 事件：
   - `session.started` - 会话启动
   - `session.completed` - 会话完成
   - `session.failed` - 会话失败
   - `message.created` - 新消息创建
   - `message.content` - 消息内容更新
   - `tool.called` - 工具调用
   - `tool.result` - 工具执行结果
   - `gate.approved` - 门控通过
   - `gate.rejected` - 门控拒绝
   - `error` - 错误事件

2. THE Event_Subscriber SHALL 将 Daemon 事件转换为用户友好的通知：

| Daemon 事件 | 用户通知 |
|-------------|----------|
| `session.started` | "🚀 开发会话已启动" |
| `message.content` | "💬 AI 回复：{content}" |
| `tool.called` | "🔧 正在执行：{toolName}" |
| `tool.result` | "✅ 执行完成" / "❌ 执行失败" |
| `session.completed` | "🎉 开发任务已完成" |
| `session.failed` | "⚠️ 会话执行失败：{reason}" |

3. THE Event_Subscriber SHALL 支持事件过滤和聚合：
   - 按项目过滤事件
   - 合并连续的相同类型事件
   - 限制通知频率（防止刷屏）
   - 支持用户自定义通知偏好

4. WHEN Webhook 收到的 Daemon 事件具有相同的事件 ID（即重复投递），THE Webhook 处理器 SHALL：
   - **仍然处理**事件本身（用于审计 / 状态机推进 / 内部聚合统计）
   - 但**保证通知投递层面的幂等性**：同一事件 ID 对同一用户、同一 IM 通道，最多投递一次用户可见通知
   - 已投递的事件 ID 必须持久化到去重表（以事件 ID 为 key），TTL 不少于 24 小时

### Requirement 7: 安全和权限控制

**User Story:** 作为安全管理员，我希望 OpenClaw Skill 具备完善的安全机制，确保只有授权用户能够访问相应的项目。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 实现以下认证机制：
   - Bearer Token 认证（与 Daemon 通信）
   - OpenClaw 平台用户身份验证
   - 项目级权限验证

2. THE Project_Registry SHALL 维护用户权限映射；WHERE 认证机制被禁用（开发 / 测试模式 `auth.enabled=false`），THE Project_Registry SHALL **仍然维护并生效**权限映射表（即权限隔离不依赖认证开关）；禁用认证仅影响"如何识别 IM_User_Id"，不影响"识别后该 user 能访问哪些项目"。

   ```json
   {
     "schema_version": "1.0",
     "userId": "user123",
     "permissions": {
       "/opt/projects/project-a": ["read", "write", "execute"],
       "/opt/projects/project-b": ["read"],
       "/home/user/my-project": ["read", "write", "execute", "admin"]
     }
   }
   ```

3. THE 权限控制 SHALL 支持以下权限级别：
   - `read` - 查看项目状态和历史
   - `write` - 发送开发指令
   - `execute` - 启动和停止会话
   - `admin` - 管理项目配置

4. THE OpenClaw_Skill SHALL 记录所有用户操作的审计日志：
   - 用户 ID
   - 操作类型
   - 项目路径
   - 时间戳
   - 操作结果
   - IP 地址（如适用）

### Requirement 8: 性能和可扩展性

**User Story:** 作为系统架构师，我希望 OpenClaw Skill 能够支持多用户并发使用，并具备良好的性能表现。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 支持以下性能指标：
   - 单个 skill 实例支持最多 100 个并发用户
   - API 响应时间 < 200ms（不含 Daemon 处理时间）
   - 内存使用 < 512MB（正常负载）
   - CPU 使用 < 50%（正常负载）
   - 在负载增加时定义现实的性能降级曲线，确保在最大容量下仍能维持可接受的服务质量

2. THE Daemon_Client SHALL 实现连接池管理：
   - HTTP 连接复用
   - 连接超时和重试
   - 负载均衡（如有多个 Daemon 实例）

3. THE OpenClaw_Skill SHALL 支持水平扩展：
   - 无状态设计（状态存储在 Daemon）
   - 支持负载均衡器
   - 支持容器化部署

4. THE 缓存策略 SHALL 包括：
   - 项目状态缓存（TTL 30 秒）
   - 用户权限缓存（TTL 5 分钟）
   - API 响应缓存（适用于只读操作）

### Requirement 9: 监控和诊断

**User Story:** 作为运维工程师，我希望能够监控 OpenClaw Skill 的运行状态，并在出现问题时快速诊断。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 提供以下监控端点：
   - `/health` - 健康检查
   - `/metrics` - Prometheus 格式指标
   - `/status` - 详细状态信息
   - `/debug/connections` - 连接状态
   - `/debug/cache` - 缓存状态

2. THE 监控指标 SHALL 包括：
   - 请求计数和响应时间
   - 错误率和错误类型分布
   - 活跃用户数和会话数
   - 内存和 CPU 使用率
   - Daemon 连接状态

3. THE 日志记录 SHALL 遵循结构化格式：
   ```json
   {
     "timestamp": "2024-01-15T10:30:00Z",
     "level": "info",
     "component": "command-router",
     "userId": "user123",
     "projectPath": "/opt/projects/my-app",
     "action": "startProject",
     "duration": 150,
     "success": true,
     "message": "Project started successfully"
   }
   ```

4. THE 诊断工具 SHALL 支持：
   - 实时日志查看
   - 性能分析
   - 错误追踪
   - 配置验证

### Requirement 10: 向后兼容和升级

**User Story:** 作为系统维护者，我希望 OpenClaw Skill 支持平滑升级，并与不同版本的 Daemon 保持兼容。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 支持 API 版本协商：
   - 检测 Daemon API 版本
   - 使用兼容的 API 端点
   - 优雅降级不支持的功能

2. THE 配置文件 SHALL 支持版本迁移：
   - 自动检测配置文件版本
   - 执行必要的配置迁移
   - 备份原始配置文件

3. THE 升级过程 SHALL 包括：
   - 数据备份
   - 配置验证
   - 服务重启
   - 健康检查
   - 回滚机制（如升级失败）

4. THE OpenClaw_Skill SHALL 维护向后兼容性至少 2 个主版本。

### Requirement 11: OpenCode 进程启动责任边界

**User Story:** 作为架构维护者，我希望三层架构边界（OpenClaw Skill / Daemon / OpenCode）不被任何捷径绕过，以保证 V6 对 OpenCode 的耦合只发生在 Daemon 一处。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL **禁止**自行启动 OpenCode 进程；具体禁止行为包括：
   - 直接 spawn `opencode` 子进程或调用 `opencode serve` / `opencode run`
   - 直接调用 OpenCode 的 Session API（如 `POST /session/{id}/prompt`）
   - 通过 SSH / 远程 shell 在 Daemon 主机上启动 OpenCode

2. THE OpenClaw_Skill SHALL **仅**通过 Daemon HTTP API（见 `openclaw-integration` Req OCI-3 端点列表）间接触发 OpenCode 启动；当 OpenCode 未运行时，由 Daemon 决定按需拉起，Skill 不感知该过程。

3. THE Daemon SHALL 是 OpenCode 进程生命周期的**唯一管理者**（启动 / 健康检查 / 优雅关闭 / 强制结束）。

4. IF OpenClaw_Skill 检测到 Daemon 不可用，THEN THE OpenClaw_Skill SHALL 向用户返回 `DAEMON_UNREACHABLE` 错误（见 Req 4），**不得**降级为"自己启动 OpenCode 试试"。

5. THE 本需求 SHALL 是父规范 Property 16 的具体落地；违反任一条 SHALL 视为 Property 16 不通过。

### Requirement 12: 默认 agentRole 配置

**User Story:** 作为 IM 端用户，我希望直接说"开发五子棋"就能启动 SpecForge 编排工作流，不需要手动指定底层参数。

#### Acceptance Criteria

1. THE startProject SHALL 在未显式传入 `options.agentRole` 时，默认使用 `sf-orchestrator` 作为 agentRole 调用 Daemon `POST /v1/workflow/start`。

2. WHERE 用户在 `startProject` 调用时显式传入 `options.agentRole`（高级用户场景，例如直接跑 `sf-debugger`），THE OpenClaw_Skill SHALL 使用用户指定值覆盖默认值。

3. THE 配置文件 SHALL 支持 `defaults.agentRole` 字段，用于设置组织级 / 部署级默认 agentRole；优先级：调用时显式参数 > 配置文件默认值 > 内置默认值（`sf-orchestrator`）。

4. IF 解析后的 agentRole 在 Daemon 端不存在或不可用，THEN THE OpenClaw_Skill SHALL 返回 `INVALID_AGENT_ROLE` 错误，列出 Daemon 当前可用的 agentRole 集合。

5. THE OpenClaw_Skill SHALL 在每一次工作流启动事件（`session.started`）的审计日志中记录最终生效的 agentRole 值（用于追溯）。

### Requirement 13: 项目目录推断和命名策略

**User Story:** 作为 IM 端用户，我希望直接说"开发五子棋"就能自动得到一个合理命名的项目根目录，不需要预先创建目录或纠结路径。

#### Acceptance Criteria

1. WHEN 用户消息触发 `startProject` 但未显式提供 `projectPath`，THE Project_Registry SHALL 按以下算法推断项目名：
   - 从用户消息中提取关键词（如"五子棋" → `gomoku`、"博客系统" → `blog-system`）
   - 对中文关键词使用拼音化或英文翻译（实现层可选 pinyin / 简单字典）
   - 对结果执行 slugify（小写、连字符、去特殊字符）

2. WHERE 推断出的项目名在该用户的命名空间下已存在，THE Project_Registry SHALL：
   - **默认**：自动追加序号后缀（如 `gomoku-2`、`gomoku-3`）使其唯一
   - **可选**：通过配置 `projects.duplicateNameStrategy: "ask"` 切换为先问用户

3. WHERE 用户消息中显式包含路径意图（例如"做个游戏放在 `~/games/`"），THE Command_Router SHALL 提取该路径作为父目录，并将推断出的项目名拼到其下。

4. THE 项目根目录 SHALL 默认放在配置文件 `projects.defaultPath` 指向的目录下（见 Req 5），且最终路径必须落在 `projects.allowedPaths` 白名单内。

5. WHERE 配置项 `projects.gitInit` 为 `true`（默认 `true`），THE OpenClaw_Skill SHALL 在项目目录创建后调用 Daemon API 触发 `git init`；为 `false` 时跳过。

6. IF 项目目录创建失败（权限不足、磁盘满、路径非法），THEN THE OpenClaw_Skill SHALL：
   - 向用户返回明确错误（`PROJECT_DIR_CREATE_FAILED` + 失败子类）
   - 不创建半成品目录（如已部分创建则回滚）
   - 在日志中记录原始系统错误（errno、磁盘可用空间快照）

### Requirement 14: Gate 双向交互

**User Story:** 作为开发者，我希望在 SpecForge 工作流命中需求审批 / 设计审批等 Gate 时，能在 IM 里直接看到摘要并给出批准 / 拒绝决定，不需要离开 IM 环境。

#### Acceptance Criteria

1. WHEN Daemon 推送 `gate.required` 事件到 Webhook，THE Event_Subscriber SHALL：
   - 把 gate 详情（gate 类型、关联文档摘要、可选项 approve/reject、超时时间）转换为 IM 用户可读消息
   - 通过 IM 通道推送给项目所有者（按 IM_User_Id 路由）

2. THE OpenClaw_Skill SHALL 接受用户至少两种响应方式：
   - **自然语言**：如"批准 requirements 文档"、"我觉得 X 段需要改"、"拒绝"，由 Command_Router 解析为 Gate_Decision
   - **显式命令**：`/approve [reason]` 和 `/reject [reason]`，绕过自然语言解析直接构造 Gate_Decision

3. THE OpenClaw_Skill SHALL 把解析出的 Gate_Decision 通过 `POST /v1/project/:projectPath/gate/:gateId/decision` 端点回传给 Daemon。

4. IF 上述 Daemon 端点尚未实现（属于本 spec 对 `openclaw-integration` 的依赖项），THEN THE OpenClaw_Skill SHALL 在启动时通过 Daemon 健康检查发现该端点缺失，并在 IM 中提示用户："当前 Daemon 不支持 Gate 双向交互，请升级 Daemon 至支持 `/v1/project/:projectPath/gate/:gateId/decision` 的版本"。**该端点列入 `openclaw-integration` 的待补充契约项**。

5. WHILE 一个 Gate 处于 pending 状态，THE OpenClaw_Skill SHALL 周期性提醒用户（默认每 4 小时一次，可配置）。

6. WHERE 用户在 `gate.timeoutAt`（默认 24 小时，可配置）前未给出决定，THE OpenClaw_Skill SHALL 自动构造一次 `reject` 决定回传 Daemon，原因字段填 `"timeout-no-response"`，并通知用户。

7. THE Gate_Decision 回传 SHALL 是幂等的：同一 gateId 重复回传相同 decision 不产生额外效果；回传不同 decision 应被 Daemon 端拒绝（由 `openclaw-integration` 保证）。

### Requirement 15: 用户 ↔ 项目所有权映射

**User Story:** 作为多用户 IM 系统的运营者，我希望严格保证用户 A 不能通过任何途径看到或操作用户 B 的项目，避免隐私事故。

#### Acceptance Criteria

1. THE Project_Registry SHALL 维护 IM_User_Id → projectPath 的归属表（持久化文件，含 `schema_version` 字段）：
   ```json
   {
     "schema_version": "1.0",
     "ownerships": [
       { "userId": "tg:1234567", "projectPath": "/opt/projects/user1/gomoku", "createdAt": 1700000000000 },
       { "userId": "wx:abcd...", "projectPath": "/opt/projects/user2/blog", "createdAt": 1700001000000 }
     ]
   }
   ```

2. THE listProjects SHALL 仅返回当前调用上下文中 IM_User_Id 拥有归属的项目。

3. WHEN 任意工具（`sendMessage` / `getProjectStatus` / `stopProject` / `getProjectHistory` / `resumeProject` / `respondToGate`）接收的 `projectPath` 不属于当前 IM_User_Id，THE OpenClaw_Skill SHALL 返回 `PROJECT_NO_ACCESS` 错误，**且错误消息中不得泄露该项目是否存在**（避免侧信道枚举）。

4. THE 用户隔离 SHALL 不依赖 IM 平台层的隔离假设；即使两个 IM_User_Id 在同一群组聊天，也必须各自只能操作自己的项目。

5. WHERE 跨用户项目共享（多人协作）属于 P1 范围，THE OpenClaw_Skill SHALL **本期不实现**，但归属表设计 SHALL 为未来添加 collaborators 字段预留扩展位（不强制现在写入）。

### Requirement 16: 任务中断和会话续接语义

**User Story:** 作为开发者，我希望能精细控制开发任务的取消方式（柔性 / 立即 / 强杀），并希望中断后能续接上次的项目继续干活。

#### Acceptance Criteria

1. WHEN 用户调用 `stopProject(projectPath, options)`，THE Session_Manager SHALL 按 `options.mode` 执行：
   - **`graceful`（默认）**：等待当前 OpenCode tool 调用完成，不再发送下一个 prompt；session 状态转 `paused`
   - **`immediate`**：立即调 Daemon `/v1/project/:projectPath/session/:sessionId/cancel`，可能留下半成品文件
   - **`force`**：调 Daemon 的强制终止端点（如可用）触发 SIGKILL OpenCode 进程，作为最后手段

2. WHEN 用户在 `stopProject` 后查询状态，THE Session_Manager SHALL 把状态转换为 `cancelled`，并在 `events.jsonl` 写入 `session.cancelled` 事件，原因字段记录 `mode` 和触发时刻。

3. THE 部分写入文件的清理策略 SHALL 默认**保留**（不自动删除）；THE OpenClaw_Skill SHALL 在 `cancelled` 通知中提示用户："已停止开发，请检查项目目录是否有未完成的文件"。

4. WHEN 用户消息匹配"继续刚才的" / "恢复 X 项目"等续接意图，THE OpenClaw_Skill SHALL：
   - 通过 `listProjects()` 找到该 IM_User_Id 最近活跃（按 `lastActiveAt` 排序）的项目
   - 调用 Daemon `/v1/project/:projectPath/session/recent` 获取最近一次 session
   - 如果 session 仍处于活跃状态（未 cancelled / failed / completed），直接复用 `sessionId`
   - 如果 session 已结束，根据 `events.jsonl` 摘要后创建新 session，并把上次结束位置作为 context 传入新 session 的初始 prompt

5. WHERE Daemon 中途重启过（跨日 / 跨进程），THE OpenClaw_Skill SHALL 仍然能通过 `events.jsonl` 重建续接所需的 context（依赖 Daemon 持久化保证）。

6. THE 会话续接 SHALL 支持的 P0 范围**仅**为"简单续接"（拉最近一次 session 复用或重建）；**完整跨会话语义**（多 session 合并、跨用户授权续接、半结束态恢复）属于 P1 范围，本期不实现。

7. THE Daemon 端 `/v1/project/:projectPath/session/recent` 端点 SHALL 列入本 spec 对 `openclaw-integration` 的依赖项（见文末 Notes）。

### Requirement 17: IM 附件处理

**User Story:** 作为用户，我希望能在 IM 里发图片 / PDF / 代码片段给项目，让 SpecForge 据此辅助开发。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 支持以下 IM 附件类型转发到 Daemon：
   - **图片**：JPG、PNG、WebP，单文件 ≤ 10 MB
   - **文档**：PDF、DOCX、Markdown、纯文本 TXT，单文件 ≤ 25 MB
   - **代码片段**：以 `text` 形式（IM 直接粘贴的代码块）或 `.py` / `.ts` / `.json` 等小文件附件传入

2. WHERE 任意单个附件大小 ≥ 64 KiB，THE OpenClaw_Skill SHALL 上传到 Daemon CAS blob 存储并以 `{"$blob": "sha256:..."}` 引用形式传给 Daemon API（见 `openclaw-integration` Req OCI-3 AC-3）；< 64 KiB 可直接 inline 传输。

3. THE 附件流程 SHALL 完整覆盖：
   - IM 平台附件元数据获取
   - IM 附件二进制流下载到临时文件（限定路径，使用结束后清理）
   - 上传到 Daemon CAS blob 端点
   - 把返回的 blob 引用拼到 `sendMessage` 的 `attachments` 数组传给 Daemon

4. IF 附件上传到 Daemon CAS 失败（网络中断、blob 端点 5xx），THEN THE OpenClaw_Skill SHALL：
   - 在 30 秒内重试最多 3 次（指数退避：1s / 4s / 16s）
   - 全部失败后向用户返回 `ATTACHMENT_UPLOAD_FAILED` 错误，提示用户重新发送

5. IF 附件 MIME 类型或扩展名不在白名单内（典型的危险类型 `.exe`、`.zip`、`.bat`、`.sh`、`.dll`、`.msi`），THEN THE OpenClaw_Skill SHALL 拒绝转发，向用户返回 `ATTACHMENT_TYPE_NOT_ALLOWED` 错误。

6. THE 临时文件 SHALL 在附件上传完成（成功或失败）后删除，无论成功与否；删除失败的文件应在每日清理任务中兜底删除。

### Requirement 18: schema_version 字段强制

**User Story:** 作为系统维护者，我希望所有持久化文件都携带 schema_version，以便未来的数据迁移和向前 / 向后兼容工作有抓手。

#### Acceptance Criteria

1. THE OpenClaw_Skill 写入磁盘的所有 JSON / YAML 文件 SHALL 在根对象包含 `schema_version` 字符串字段，至少包括但不限于：
   - 配置文件（默认 `/etc/openclaw-skill/config.json`）
   - Project Registry 持久化文件（项目列表 + 归属表 + 权限表）
   - Webhook 注册表
   - 用户权限映射文件
   - Webhook 事件去重表（见 Req 6.4）
   - Gate 等待状态表（见 Req 14）

2. THE 默认初始 schema_version 值 SHALL 为 `"1.0"`。

3. WHEN 加载持久化文件时未发现 `schema_version` 字段或字段值无法解析，THE OpenClaw_Skill SHALL：
   - 拒绝继续加载该文件（不"宽容地默认 1.0"，避免悄无声息的数据漂移）
   - 记录明确的迁移错误（错误码 `SCHEMA_VERSION_MISSING` / `SCHEMA_VERSION_INVALID`）
   - 在日志中给出迁移指引（如运行 `openclaw-skill migrate <file>`）
   - 在系统启动期间触发健康检查失败（HTTP `/health` 返回 503）

4. THE schema_version 字段 SHALL 遵循 SemVer 形式（`"<major>.<minor>"` 或 `"<major>.<minor>.<patch>"`）；不兼容的 major 升级 SHALL 强制走迁移流程，向前兼容的 minor 升级 SHALL 自动接受。

5. THE 本需求 SHALL 是父规范 Property 14 / REQ-18 的具体落地。

### Requirement 19: 跨网络部署网络层硬约束

**User Story:** 作为部署架构师，当 OpenClaw Skill（云端）与 Daemon（客户机房）跨网络部署时，我希望网络层的安全和容错有硬性保证。

#### Acceptance Criteria

1. WHERE OpenClaw_Skill 与 Daemon 跨网络部署（即不在同一台主机的回环网络），THE OpenClaw_Skill SHALL：
   - **必须**使用 HTTPS（TLS 1.2+）；显式拒绝降级为 HTTP，即使配置文件传入了 `http://` 也要拒绝启动并报错
   - 验证服务端证书（不允许 `tlsRejectUnauthorized=false` 等绕过）
   - 在握手日志中记录证书指纹用于审计

2. THE Daemon 端 SHALL 配置 IP 白名单（由部署方维护），仅允许白名单内来源访问。

3. WHILE 网络中断或 Daemon 不可达，THE OpenClaw_Skill SHALL：
   - 在 60 秒内自动重连（指数退避，最多 5 次尝试）
   - 累计断开 ≤ 60 秒视为瞬态故障，恢复后续接 SSE 流
   - 累计断开 > 60 秒，THE Session_Manager SHALL 将受影响 session 标记为 `disconnected`，并通知用户

4. THE 网络超时 SHALL 分层配置：
   - **连接超时** `connectTimeoutMs`：默认 5000 ms
   - **请求超时** `requestTimeoutMs`：默认 30000 ms
   - **SSE 心跳超时** `sseHeartbeatTimeoutMs`：默认 15000 ms（超过该值未收到任何事件视为 SSE 断流，触发重连）

5. THE Req 5 中配置示例的 `daemon.endpoint: "http://localhost:3000"` SHALL 仅作为本机开发示例；生产配置文件 SHALL 在文档中明确标注"生产环境必须 HTTPS + 公网域名 + IP 白名单"。

6. WHILE Skill 与 Daemon 部署在同一主机（回环或 Unix socket），THE OpenClaw_Skill MAY 接受 HTTP，但仍 SHALL 拒绝任何来自非回环来源的请求绕过 HTTPS 强制规则。

### Requirement 20: 同项目多 Session 并发约束

**User Story:** 作为系统设计者，我希望明确"一个项目同时只能有一个 active session"的语义，避免并发指令互相打架。

#### Acceptance Criteria

1. WHILE 一个 projectPath 已存在 active session，THE Session_Manager SHALL **拒绝**为同一 projectPath 创建第二个 active session（P0 范围内同 projectPath 任意时刻最多一个 active session）。

2. WHEN 用户在该项目已有 active session 时通过 `sendMessage` 发送新消息，THE OpenClaw_Skill SHALL **默认**把消息追加到当前 session 的 prompt 队列（即不创建新 session，复用现有 session）。

3. IF 用户对一个已有 active session 的 projectPath 显式调用 `startProject`，THEN THE OpenClaw_Skill SHALL 返回 `PROJECT_BUSY` 错误，提示用户先调用 `stopProject` 或使用 `sendMessage`。

4. THE "同项目多 active session"（如主任务 + 后台子任务并行）属于 P1 范围，本期不实现。

5. WHEN 一个 session 进入 `cancelled` / `completed` / `failed` 终态后，THE Session_Manager SHALL 允许同 projectPath 创建新的 active session。

### Requirement 21: 限流阈值

**User Story:** 作为运营方，我希望对单用户和单项目的请求频率有明确上限，防止滥用和资源耗尽。

#### Acceptance Criteria

1. THE OpenClaw_Skill SHALL 对单 IM_User_Id 的所有工具调用累加计数，每分钟上限默认为 30 次（可在配置 `rateLimit.perUser.requestsPerMinute` 中调整）。

2. THE OpenClaw_Skill SHALL 对单 projectPath 的 `sendMessage` 调用累加计数，每分钟上限默认为 60 次（可在配置 `rateLimit.perProject.sendMessagePerMinute` 中调整）。

3. THE Webhook 事件投递重试（Daemon 主动重试给 Skill 的 webhook）SHALL **不计入**上述限流。

4. WHEN 任一限流阈值被突破，THE OpenClaw_Skill SHALL：
   - 返回 HTTP 429 状态码（如果是 HTTP 接口）
   - 在响应中包含 `Retry-After` header，单位秒，值为重置该限流窗口剩余的秒数
   - 在工具返回结构中填充 `error: "RATE_LIMITED"` 和 `data.retryAfterSeconds`

5. THE 限流计数器 SHALL 使用滑动窗口或令牌桶实现（不强制要求具体算法），但必须保证短时突发不会因为窗口边界产生显著抖动。

### Requirement 22: 大输出 CAS blob 解引用

**User Story:** 作为用户，我希望 Daemon 返回的大段 AI 回复或代码不会因为太大而被截断或导致 IM 投递失败。

#### Acceptance Criteria

1. WHEN Webhook payload 中遇到 CAS_Blob_Reference（形如 `{"$blob": "sha256:abc..."}`），THE Event_Subscriber SHALL 调用 Daemon `GET /v1/blob/:hash` 端点解引用拿到完整内容。

2. WHEN 解引用后的内容长度超过当前 IM 平台的单条消息限制，THE Event_Subscriber SHALL：
   - **优先**：按 IM 平台规则分片发送（如 Telegram 4096 字符、微信 2048 字节）
   - **降级**：将完整内容转为附件（`.txt` 或 `.md` 文件）发送
   - **保留**：在分片或附件消息中保留 blob 引用 ID，允许用户后续按需查看完整内容（命令 `/blob <hash>`）

3. WHERE 同一 webhook payload 中含多个 blob 引用，THE Event_Subscriber SHALL 并行解引用（最多 5 路并发），缩短端到端延迟。

4. IF blob 解引用失败（hash 不存在 / 网络错误 / 校验失败），THEN THE Event_Subscriber SHALL：
   - 在用户通知中保留原 blob 引用占位（不丢失上下文位置感）
   - 在通知尾部追加一行："⚠️ 部分内容暂时无法显示，请用 `/blob <hash>` 重试"
   - 记录详细错误到日志

5. THE blob 解引用结果 SHALL 在内存中临时缓存（LRU，默认上限 256 个条目，TTL 10 分钟），减少同一会话内重复解引用的开销。

## Non-Functional Requirements

### Performance

1. THE API 响应时间 SHALL 小于 200ms（95th percentile）
2. THE 内存使用 SHALL 小于 512MB（正常负载）
3. THE 支持并发用户数 SHALL 不少于 100

### Security

1. THE 跨网络部署的 Skill ↔ Daemon 通信 SHALL 使用 HTTPS（TLS 1.2+）和 Bearer Token 认证（详细规则见 Req 19）；同主机回环可放宽为 HTTP，但仍需 Bearer Token 认证
2. THE 用户输入 SHALL 进行安全验证和清理
3. THE 敏感信息 SHALL 加密存储
4. THE Daemon 端 SHALL 配置 IP 白名单作为跨网络部署的额外防护层（详见 Req 19 AC-2）
5. THE Skill SHALL 不在日志或 IM 通知中明文输出 Bearer Token、Webhook secret 或证书私钥指纹

### Reliability

1. THE 服务可用性 SHALL 达到 99.9%
2. THE 错误恢复时间 SHALL 小于 30 秒
3. THE 数据一致性 SHALL 通过事务机制保证

### Usability

1. THE 用户指令识别准确率 SHALL 达到 95%
2. THE 错误消息 SHALL 提供可操作的解决建议
3. THE 响应时间感知 SHALL 小于 3 秒

## Testing Strategy

### Property-Based Tests

本 spec 必须为继承的每条 Correctness Property 实现 PBT：

1. **Property 16 测试（三层架构边界）**：用 `fast-check` 生成随机的工具调用序列（含合法 / 非法的 projectPath、agentRole、attachments 等），断言：
   - 每一次外发 HTTP 请求的 host:port 都命中 Daemon endpoint，**永不**指向 OpenCode Session API（如 `:port/session/...`）
   - 进程列表中**永不**出现由 Skill 直接 spawn 的 `opencode` 子进程
   - 即使在 Daemon 不可用时，Skill 也不会"自动降级"为直接调 OpenCode（详见 Req 11 AC-4）
   - 迭代次数 ≥ 1000（安全关键）

2. **Property 14 测试（schema_version 字段）**：生成多个 Skill 持久化文件写入操作（配置、Project Registry、Webhook 注册表、归属表、去重表、Gate 等待表），断言：
   - 每个被写入磁盘的 JSON / YAML 根对象都包含 `schema_version` 字段且符合 SemVer
   - 加载缺失 `schema_version` 的文件时返回 `SCHEMA_VERSION_MISSING` 错误且 `/health` 返回 503
   - 迭代次数 ≥ 100

3. **Property 4 测试（Adapter 概念隔离）**：随机生成 Daemon webhook payload（含合法 + 故意夹带 OpenCode 内部字段如 `ctx`、`callID`、`hookShape`、内部事件 schema 字段），断言：
   - Skill 转发给 IM 通道的用户消息字符串不出现这些 OpenCode 内部字段名
   - Skill 写出的工具返回结构（`success/data/error/...`）的 `data` 字段不包含 OpenCode 内部字段
   - Skill 写出的审计日志结构不包含 OpenCode 内部字段
   - 迭代次数 ≥ 100

### Unit Tests

1. **Command_Router 测试**：命令解析准确性（关键词匹配、上下文推断、意图分类、参数提取）；候选展示对所有意图清晰度生效（验证 Req 2.3）
2. **Event_Subscriber 测试**：事件聚合 / 过滤 / 频率限制；webhook 重复事件处理但通知幂等（验证 Req 6.4）
3. **Project_Registry 测试**：项目名推断 + slugify、重名处理、归属表读写、跨用户 PROJECT_NO_ACCESS（验证 Req 13、15）
4. **Session_Manager 测试**：状态机转换、`stopProject` 三种 mode、超时暂停只影响超时项目（验证 Req 3.5、16）
5. **Daemon_Client 测试**：连接池、HTTPS 强制、超时分层、重连退避（验证 Req 19）
6. **错误处理与重试测试**：分层重试机制、限流响应（429 + Retry-After，验证 Req 21）、CAS blob 解引用失败降级（验证 Req 22）
7. **Schema 加载测试**：缺失 / 非法 `schema_version` 的拒绝路径（验证 Req 18）

### Integration Tests

1. **端到端**：IM 命令 → Daemon → OpenCode → 事件流 → 用户通知（典型路径）
2. **Gate 双向交互**：用户审批 / 拒绝 / 超时未响应（默认 24h 自动 reject）三类场景，覆盖自然语言 + 显式命令两种响应方式（验证 Req 14）
3. **多用户并发隔离**：用户 A 和用户 B 同时操作各自项目，断言用户 A 任何工具都无法看到或操作用户 B 的项目（验证 Req 15）
4. **会话续接**：同日 / 跨日（Daemon 重启过）两类场景的 `resumeProject` 行为（验证 Req 16）
5. **附件流**：图片 / PDF / 代码片段 / 不允许类型 `.exe`（拒绝路径），含大文件（≥ 64 KiB）走 CAS blob（验证 Req 17）

## Notes

- 本 spec 实现 V6 架构中的 **OpenClaw Skill** 端，与 [`openclaw-integration`](../openclaw-integration/requirements.md) spec 配对：本 spec 是 Skill 客户端契约，对方是 Daemon HTTP API 契约。
- **P0 边界**（V6.0 必须实现）：Req 1–22 全部，含三层架构边界（Req 11）、默认 agentRole（Req 12）、项目目录推断（Req 13）、Gate 双向交互（Req 14）、用户 ↔ 项目归属（Req 15）、取消 / 续接（Req 16，简单续接）、附件（Req 17）、schema_version（Req 18）、跨网络网络层（Req 19）、同项目单 session（Req 20）、限流（Req 21）、blob 解引用（Req 22）。
- **P1 边界**（本期不实现）：跨用户项目协作（Req 15.5）、多 session 并发（Req 20.4）、完整跨会话语义（Req 16.6 中超出"简单续接"的部分）。
- **对 `openclaw-integration` 的依赖项**：以下 Daemon 端点是本 spec 假定存在的契约，必须由 `openclaw-integration` spec 补充并实现：
  - `POST /v1/project/:projectPath/gate/:gateId/decision`：Gate 决定回传（Req 14）
  - `GET /v1/project/:projectPath/session/recent`：获取最近活跃 session（Req 16）
  - `GET /v1/blob/:hash`：CAS blob 解引用（Req 22）
  - `POST /v1/blob`（或等价的上传端点）：附件上传（Req 17）
- **错误处理契约**：本 spec 列出的错误码（`PROJECT_NOT_FOUND` / `PROJECT_NO_ACCESS` / `PROJECT_BUSY` / `RATE_LIMITED` / `INVALID_AGENT_ROLE` / `SCHEMA_VERSION_MISSING` / `ATTACHMENT_UPLOAD_FAILED` / `ATTACHMENT_TYPE_NOT_ALLOWED` / `PROJECT_DIR_CREATE_FAILED` / `DAEMON_UNREACHABLE` / `INVALID_COMMAND` / `SESSION_FAILED`）遵循父规范 v6-architecture-overview 的 Error Handling 契约：用户友好消息 + 可操作建议 + 不泄露内部实现。
- **三层架构边界优先级**：当便利性与三层架构边界（Property 16 / Req 11）冲突时，三层架构边界优先；不允许"为了减少一次往返就让 Skill 直接调 OpenCode"。
- **概念隔离边界优先级**：当 Daemon 透传了 OpenCode-specific 字段时，Skill 必须先剥离再外发，**即使**该剥离会损失一些细节信息（与 opencode-adapter 的概念隔离义务保持一致）。