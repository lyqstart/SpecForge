# Requirements Document

## Introduction

SpecForge V6 是一次断代式重构。V5 及之前版本把 SpecForge 实现为 OpenCode 的插件（形态 A），运行时逻辑、状态、权限都寄生在 OpenCode 的进程生命周期和 Plugin Hook 中。V6 把形态反过来：**SpecForge V6 是一个独立的规格驱动 AI 开发控制引擎。它把 OpenCode 当作 LLM 执行后端，自己掌握身份、权限、工作流、可观测性和知识沉淀的完整主权。**

V5 与 V6 的根本差别：

- V5：OpenCode 是主进程，SpecForge 是寄生插件；身份、会话、上下文、工具调用的主权在 OpenCode。
- V6：SpecForge Daemon 是独立长生命周期进程，OpenCode 退化为 LLM Kernel（可被召唤、可 headless）；身份、权限、工作流、状态、事件、知识的 Source of Truth 全部在 Daemon。

本 spec 的性质：**纯架构文档 spec**。本 spec 的需求不是可执行代码的功能需求，而是对 V6 架构的原则、边界、模型、接口、范围、里程碑的约束性描述。验收标准以"设计文档 / 架构文档中包含某章节、定义了某概念、声明了某契约"等静态判定为主，不包含代码实现。

后续每一个具体模块（daemon-core、observability、permission-engine、opencode-adapter、multimodal、self-healing 等）会有自己独立的 spec，本文档作为它们的权威参考。

## Glossary

- **SpecForge V6**：SpecForge 的第 6 个大版本，架构形态为独立 Daemon 引擎 + OpenCode 作为 LLM Kernel。不兼容 V5。
- **形态 A**：V5 及之前的架构形态，SpecForge 作为 OpenCode 插件寄生运行。
- **形态 B**：V6 的架构形态，SpecForge 作为独立 Daemon 进程，OpenCode 降级为 LLM Kernel。
- **Daemon**：SpecForge V6 的独立长生命周期进程。机器上只有一个 Daemon 实例，维护多个 project context，是所有状态、权限、工作流、事件的 Source of Truth。
- **Source of Truth**：权威真相来源。V6 中 Daemon 是唯一 Source of Truth；任何组件不得绕过 Daemon 直接修改权威状态。
- **LLM Kernel**：LLM 执行内核。V6 中 OpenCode 扮演此角色，负责把 prompt 送入 LLM provider 并返回 token / tool call / event 流。
- **Thin Plugin**：部署在 `.opencode/` 目录下的极薄 OpenCode 插件，唯一职责是把 OpenCode 运行时事件上报 Daemon 并在需要时启动 Daemon。
- **LLMKernelAdapter**：LLM Kernel 抽象接口。定义 `spawnAgent`、`getSession`、`cancelSession`、`sendPrompt`、`subscribeEvents`、`getCapabilities` 六个方法。V6.0 唯一实现是 OpenCodeAdapter。
- **OpenCodeAdapter**：LLMKernelAdapter 针对 OpenCode 的实现，版本与 OpenCode 的某个 major 版本对应。
- **SpecForge Runtime Contract**：Daemon 对外暴露的稳定契约，包含 HTTP API、事件 schema、工具契约、文件格式、CLI 契约。优先级高于 OpenCode 内部行为。
- **Session Registry**：Daemon 内的会话身份注册表，管理 pending / active / history 三类记录，是"sessionID → AgentIdentity"的权威映射。
- **AgentIdentity**：一次 agent 会话的身份结构体，字段包含 `sessionId`、`agentRole`、`workflowRole`、`parentSessionId`、`workItemId`、`spawnIntentId`。
- **AgentRole**：Agent 的静态角色（如 sf-orchestrator、sf-requirements），由配置文件定义权限。
- **WorkflowRole**：Agent 在某个 workflow 实例里扮演的动态角色（如当前 feature_spec WI-042 的 requirements 阶段执行者）。
- **Session Tree**：同一个 workItem 下多个 session 形成的父子关系树，通过 `parentSessionId` 串联，为未来 nested subagent 预留。
- **Work Item**：工作项，对应 `.kiro/specs/{WI-XXX}/` 或 `.specforge/specs/{WI-XXX}/` 下的一个 spec 目录，拥有独立的 state machine。
- **Event Bus**：Daemon 内部的统一事件总线。所有跨层通信必须经过 Event Bus，不得直接函数调用跨越可观测性边界。
- **events.jsonl**：Event Bus 的持久化落盘文件，采用 WAL（Write-Ahead Log）语义，是状态重建的唯一事实来源。
- **state.json**：派生状态检查点文件，由 events.jsonl 推导得出，用于快速启动；崩溃恢复时以 events.jsonl 为准。
- **WAL**：Write-Ahead Log，先写日志再改状态的崩溃安全语义。
- **CAS**：Content-Addressable Storage，内容寻址存储。以内容 SHA-256 为地址存储 blob。
- **blob**：一段二进制或文本数据，存储在 CAS 中，通过 SHA-256 引用。大内容（图片、音频、PDF、长文本）不内嵌到 HTTP body 和 event payload 中，一律以 blob 引用。
- **UserMessage**：V6 统一的消息格式。`content` 为数组，元素类型包含 `text`、`image`、`audio`、`video`、`file`、`code`、`document`。
- **ModelCapabilities**：声明一个 LLM model 支持哪些模态（text / image / audio / video / file 等）的结构体。
- **模态适配 (Modality Adaptation)**：`prepareMessageForModel()` 函数依据 ModelCapabilities 把 UserMessage 降级为模型可接受的形式：原生支持则用原始 blob，不支持则用文本衍生物（OCR / 转写 / 摘要）。
- **Permission Engine**：Daemon 内的权限决策组件。输入（actor、action、resource、context）→ 输出（allow / deny + 原因）。所有决策写入事件日志。
- **Agent Constitution**：写死在代码里的 9 条 agent 底线硬规则（不得绕过 Gate、不得伪造验证等），不可被任何配置覆盖。
- **硬规则 / 内置策略 / 用户策略**：Permission Engine 的三层权限。硬规则 = 代码常量；内置策略 = SpecForge 自带配置文件；用户策略 = 用户 / 项目配置文件。
- **Configuration Layers**：四层配置（内置默认值 → 用户级 `~/.specforge/` → 项目级 `<project>/.specforge/` → 运行时 CLI / env）。
- **自愈闭环 (Self-Healing Loop)**：`Diagnose → Propose → Approve → Apply → Verify` 的状态机；V6.0 只实现 Diagnose；V6.x 实现完整闭环。
- **风险分级 (Risk Tier)**：自愈闭环中的批准等级。
  - **L1**：自动批准（补章节 / 格式修正等无损改动）。
  - **L2**：默认批准、可禁用（小代码改动 / 新增测试）。
  - **L3**：必须人工批准（大改动 / 删除 / 权限变更）。
- **OpenClaw**：开源网关，把 Telegram / WhatsApp / Discord 等即时通讯桥接到本地 AI agent。V6 通过对机器人友好的 CLI（`--json`、异步 job、webhook）对接，项目自身不做 Telegram 直接集成。
- **Thin Plugin Bootstrap**：OpenCode 启动时 Thin Plugin 按需拉起 Daemon 的机制。
- **北极星目标 (North Star)**：V6 的核心可验证目标——**5 分钟内从发生问题定位到根因**，覆盖 10 类排障场景。
- **P0 / P1 / P2**：V6 版本范围优先级。
  - **P0**：V6.0 必做（27 项）。
  - **P1**：V6.1 做（15 项）。
  - **P2**：V6.x 做。
- **M1–M9**：V6.0 的 9 个里程碑（Daemon 骨架 → 身份与权限 → 可观测性基础 → 核心工作流 → 分析能力 → 崩溃恢复 → 分发与迁移 → Telegram 集成 → 北极星验证）。
- **sf-analyst**：V6 新增 Agent，负责读 observability 数据并生成结构化分析结果。由 sf-debugger 或用户调度。
- **Agent Roster**：V6.0 的 10 个内置 Agent 的集合。
- **Gate**：工作流关卡，作为 Tool 的特殊子类，实现 `check()` 返回 `GateResult`。
- **compositeGate**：Gate 的组合结构，支持 `sequential` / `parallel` 两种执行模式和 `fail_fast` / `collect_all` 两种失败策略。
- **Skill / Tool / Workflow 三层覆盖**：内置 < 用户级 < 项目级 的覆盖优先级。
- **schema_version**：每个持久化文件头部的版本号字段，支持自动迁移（`code > file` 时）和拒绝启动（`file > code` 时）。

## Requirements

### Requirement 1: 产品定位与核心设计原则

**User Story:** 作为 SpecForge 架构决策者，我希望 V6 的产品定位和核心设计原则被明确地落在权威文档中，以便所有后续模块的决策都有统一的判准。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 在"Introduction"章节包含 V6 的一句话定位："SpecForge V6 是一个独立的规格驱动 AI 开发控制引擎。它把 OpenCode 当作 LLM 执行后端，自己掌握身份、权限、工作流、可观测性和知识沉淀的完整主权。"
2. THE Requirements_Document SHALL 列出以下 5 条核心设计原则，且顺序与编号一致：
   - 原则 1：Daemon 是唯一的 Source of Truth。
   - 原则 2：SpecForge Runtime Contract 的优先级高于 OpenCode 内部行为。
   - 原则 3：程序硬控优先于 Prompt 控制（继承 V5）。
   - 原则 4：可观测性是一级组件，不是附加能力。
   - 原则 5：扩展性优先于完备性。
3. WHERE 某个具体模块 spec 与本文档的 5 条核心设计原则冲突，THE Module_Spec SHALL 显式引用本文档并说明偏离理由，不得隐式偏离。
4. IF 本文档的一句话定位在后续被修改，THEN THE Requirements_Document SHALL 在同一次修改中同步更新 Glossary 中 "SpecForge V6" 的定义。

### Requirement 2: V6 不做的边界

**User Story:** 作为 V6 开发成员，我希望 V6 明确列出"不做"的边界，以便在后续需求讨论中迅速拒绝超出范围的提案，避免范围蔓延。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6 不做以下 6 项能力，并把每项写入"不做边界"章节：
   - LLM Provider 层
   - IDE / 编辑器插件
   - 多租户协作
   - 云服务
   - 自动化部署 DevOps
   - LLM 评估 / 微调
2. WHEN 后续模块 spec 或 ADR 中出现上述 6 项的实现计划，THE Review_Process SHALL 判定该 spec 或 ADR 需先修改本文档的"不做边界"章节后方可继续。
3. THE Requirements_Document SHALL 声明 V5 遗留概念全部保留但重新组织位置（下沉到 Daemon 内部或作为扩展），不在 V6.0 删除任何 V5 既有语义。

### Requirement 3: 北极星目标

**User Story:** 作为产品负责人，我希望 V6 有一个可度量的北极星目标，以便版本质量门槛有明确的可验证入口。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明北极星目标："5 分钟内从发生问题定位到根因"。
2. THE Requirements_Document SHALL 列出北极星目标必须覆盖的 10 类排障场景：
   - Gate 反复失败
   - Agent 偏离 prompt
   - Tool 调用错误
   - 权限拒绝
   - 升级 / 安装失败
   - 状态机卡住
   - 并发死锁
   - Skill 是否被调用
   - Workflow 是否按预期执行
   - Workflow 执行结果偏离预期
3. THE Requirements_Document SHALL 在 REQ-27 的质量门槛章节显式把"10 类场景在 5 分钟内定位根因"列为 V6.0 发版必过项。
4. WHEN 某类排障场景无法在 5 分钟内定位根因，THE Observability_Subsystem SHALL 被判定为不满足 V6.0 质量门槛。

### Requirement 4: Daemon 进程模型

**User Story:** 作为系统架构师，我希望 V6 的 Daemon 进程模型被明确定义，以便后续 daemon-core spec 能在一致的前提下展开。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 规定机器上同一时刻只有一个 Daemon 实例；一个 Daemon 实例维护多个 project context。
2. THE Requirements_Document SHALL 列出 Daemon 支持的三种启动方式：
   - Thin Plugin 按需启动（当 OpenCode 启动且本机无运行 Daemon 时）。
   - CLI 启动（`specforge` 命令首次使用时按需拉起）。
   - 手动启动（`specforge daemon start --detach`）。
3. WHEN OpenCode 进程关闭且 Daemon 由 Thin Plugin 或 CLI 按需启动，THE Daemon SHALL 在空闲 30 秒后自动退出。
4. WHERE Daemon 由 `specforge daemon start --detach` 手动启动，THE Daemon SHALL 忽略 30 秒空闲退出规则，持续运行直到显式 `specforge daemon stop`。
5. THE Requirements_Document SHALL 声明 OpenCode 支持 headless 模式由 Daemon 按需召唤，用于 Telegram / OpenClaw 等无 UI 场景。

### Requirement 5: 通信协议

**User Story:** 作为 Daemon 与 Thin Plugin / CLI / 未来 Web UI 的集成方，我希望通信协议被一次性定义清楚，以便所有客户端共用同一契约。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 规定 Daemon 对外通信协议为 HTTP/1.1 + SSE。
2. THE Daemon SHALL 监听 127.0.0.1 的动态端口（运行时随机分配）。
3. WHEN Daemon 启动成功，THE Daemon SHALL 在 `~/.specforge/runtime/daemon.sock.json` 写入握手文件，握手文件至少包含字段 `pid`、`port`、`token`，文件权限为 `0600`。
4. WHEN 客户端向 Daemon 发起 HTTP 请求，THE Client SHALL 在 `Authorization: Bearer <token>` 头中携带握手文件中的 `token`。
5. IF HTTP 请求未携带有效 Bearer Token，THEN THE Daemon SHALL 返回 HTTP 401 并记录权限拒绝事件。
6. WHERE 请求或响应体包含大于 64 KiB 的内容（图片 / 音频 / 视频 / 长文本等），THE Daemon SHALL 以 CAS blob 引用（`blob://<sha256>`）替代内联数据。
7. THE Requirements_Document SHALL 声明未来 Web UI 复用同一 HTTP 端口，不再引入第二套监听端口。

### Requirement 6: Session Registry 与身份模型

**User Story:** 作为 Permission Engine 和 Observability 的使用方，我希望 Daemon 能稳定地回答"当前调用者是哪个 agent"，以便权限判定和事件归因都有确定性来源。

#### Acceptance Criteria

1. THE Session_Registry SHALL 采用"预登记 + 首次接触绑定"策略：由 Daemon 先生成 `spawnIntentId` 并登记 pending 记录，由 Thin Plugin / Adapter 在首次事件到达时绑定真实 `sessionId`。
2. THE Session_Registry SHALL 维护三类记录：`pending`、`active`、`history`。
3. THE AgentIdentity SHALL 至少包含以下字段：`sessionId`、`agentRole`、`workflowRole`、`parentSessionId`、`workItemId`、`spawnIntentId`。
4. THE Session_Registry SHALL 支持 Session Tree 结构（通过 `parentSessionId` 串联），为未来 nested subagent 预留能力。
5. IF OpenCode Plugin Hook 输入中不存在稳定的 `agent` 字段，THEN THE Session_Registry SHALL 使用 `sessionId` 作为唯一身份键查表，不得依赖 OpenCode 自身传入 agent 名称。
6. WHEN Daemon 异常重启，THE Session_Registry SHALL 通过 events.jsonl 重建状态，以 state.json 作为加速检查点。

### Requirement 7: Permission Engine 三层权限

**User Story:** 作为安全决策者，我希望 V6 的权限体系分层清晰、不可被配置颠覆、每次决策可追溯。

#### Acceptance Criteria

1. THE Permission_Engine SHALL 实现三层权限模型：
   - 第一层：**硬规则（Agent Constitution 9 条底线）**，写死在代码里。
   - 第二层：**内置策略**，以配置文件形式随 SpecForge 发布，默认 agent role 权限（如 reviewer 只读）。
   - 第三层：**用户策略**，用户或项目自定义角色与规则。
2. THE Permission_Engine SHALL 由 Daemon 集中判定，OpenCode 原生 permission 作为兜底层存在。
3. THE Permission_Engine SHALL 对每一次决策（allow / deny）写入事件日志，日志条目必须包含 actor、action、resource、matched_rule、rule_layer、reason 六字段。
4. THE Permission_Engine SHALL 按以下顺序合并规则：
   - 硬规则永远胜过任何配置。
   - 更具体的规则胜过更一般的规则。
   - 同优先级下 deny 胜 allow。
5. IF 用户配置试图放宽硬规则（例如允许绕过 Gate），THEN THE Permission_Engine SHALL 拒绝加载该配置并在启动日志中报告冲突。
6. WHEN Daemon 启动且配置成功加载，THE Permission_Engine SHALL 在启动日志中报告所检测到的任何潜在硬规则冲突，即使配置未实际放宽硬规则也必须报告。
7. IF Permission_Engine 在启动完成后检测到新的硬规则冲突（例如配置热加载引入冲突），THEN THE Permission_Engine SHALL 报告该冲突但继续以已加载的问题配置运行，不触发停机。
8. THE Requirements_Document SHALL 在 Glossary 列出 Agent Constitution 的 9 条底线（或引用具体文档位置），覆盖至少包含"不得绕过 Gate"和"不得伪造验证"两项。

### Requirement 8: OpenCode Adapter 隔离

**User Story:** 作为架构维护者，我希望 OpenCode 的版本变化只影响一个隔离层，以便降低 V6 对 OpenCode 内部行为演化的耦合。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 定义 `LLMKernelAdapter` 抽象接口，至少包含以下方法：`spawnAgent`、`getSession`、`cancelSession`、`sendPrompt`、`subscribeEvents`、`getCapabilities`。
2. THE Requirements_Document SHALL 声明 `OpenCodeAdapter` 是 V6.0 唯一的 LLMKernelAdapter 实现。
3. THE Requirements_Document SHALL 允许未来扩展其他 Adapter（例如 `ClaudeCodeAdapter`），但不列入 V6.0 范围。
4. THE Requirements_Document SHALL 规定每个 OpenCodeAdapter 版本对应 OpenCode 的一个 major 版本；OpenCode major 升级时 Adapter 必须显式升级版本号。
5. WHEN OpenCode 对外行为发生变化（如事件 schema 变更、tool hook 参数变化），THE OpenCodeAdapter SHALL 吸收该变化，Daemon 核心及其他模块不得感知该变化。
6. IF OpenCodeAdapter 未能完全吸收某次 OpenCode 行为变更，THEN THE OpenCodeAdapter SHALL 仍然阻止 OpenCode 特有概念泄漏到 Daemon 核心或 Tool Context（概念隔离义务优先于变更吸收义务）。
7. THE Adapter_Layer SHALL 不把 OpenCode 特有概念（例如 OpenCode 的 `ctx`、`callID` 结构）泄漏到 Daemon 核心或 Tool Context。

### Requirement 9: 配置四层

**User Story:** 作为使用者，我希望配置来源清晰、合并规则可预期、敏感字段不会被项目级配置意外泄漏到仓库。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 定义四层配置，按覆盖顺序排列：
   - Layer 1：内置默认值。
   - Layer 2：用户级（`~/.specforge/`）。
   - Layer 3：项目级（`<project>/.specforge/`）。
   - Layer 4：运行时（CLI flags / 环境变量）。
2. THE Configuration_Subsystem SHALL 按以下规则合并四层：
   - 简单值：后一层覆盖前一层。
   - 对象：深合并。
   - 数组：默认替换（不拼接）。
3. THE Requirements_Document SHALL 列出一个敏感字段清单（至少包含 `apiKeys`、`providerCredentials`、`bearerTokens`）。
4. IF 项目级配置试图覆盖敏感字段清单中的字段，THEN THE Configuration_Subsystem SHALL 拒绝该覆盖并在日志中报告越级写入。
5. WHEN 用户修改配置文件且随后有新的工作流或新的 work item 启动，THE Configuration_Subsystem SHALL 强制立即生效新配置值（热加载）；新值必须在该新工作流 / 新 work item 启动时应用，不允许延迟或跳过；但对已在运行中的 work item 不生效。

### Requirement 10: 目录布局

**User Story:** 作为使用者与维护者，我希望 V6 的目录布局与 V5 明确切割，不再寄生在 `~/.config/opencode/` 下，且项目级目录与 `.git` 风格一致。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 规定用户级根目录为 `~/.specforge/`，并包含以下顶层子目录：`config/`、`runtime/`、`knowledge/`、`observability/`、`skills/`、`agents/`、`tools/`、`migrations/`、`backups/`。
2. THE Requirements_Document SHALL 规定项目级根目录为 `<project>/.specforge/`（带点，与 `.git` 风格一致），并包含以下顶层子目录：`config/`、`specs/{WI-XXX}/`、`runtime/`、`knowledge/`、`observability/`、`skills/`、`agents/`、`tools/`。
3. THE `.opencode/` 目录 SHALL 在 V6 中仅保留 Thin Plugin，不再承载 agents / tools / skills / plugins / runtime 等 SpecForge 资产。
4. THE Requirements_Document SHALL 声明 V5 的 `specforge/` 目录在 V6 中迁移到 `<project>/.specforge/`，并在 REQ-26 的"不做清单"中说明 V5→V6 自动迁移工具不做。
5. IF 某资产同时存在于 `~/.specforge/` 和 `<project>/.specforge/`（如同名 skill），THEN THE Loader SHALL 按"内置 < 用户级 < 项目级"顺序覆盖。
6. IF 项目级资产加载失败（例如文件损坏、schema 非法、解析错误），THEN THE Loader SHALL 报错并拒绝加载该资产，不得回退到用户级或内置版本；precedence 顺序必须始终被尊重。

### Requirement 11: CLI 双模式

**User Story:** 作为人类使用者和 OpenClaw / 机器人集成者，我希望 CLI 同时支持"交互式、彩色"和"机器友好、结构化"两种模式。

#### Acceptance Criteria

1. THE CLI SHALL 对每一条命令都支持 `--json` 参数，输出为单一 JSON 对象或 JSON 数组，不混入彩色 escape 序列和交互提示。
2. WHEN 用户未指定 `--json`，THE CLI SHALL 默认使用彩色交互式输出。
3. WHERE 某个命令属于异步操作（例如"创建 spec"、"执行 workflow"），THE CLI SHALL 支持立即返回 `jobId` 并可通过 `specforge job <id>` 查询状态。
4. THE CLI SHALL 对异步命令支持 `--wait` 参数，`--wait` 会阻塞到 job 结束再返回终态 JSON。
5. THE CLI SHALL 支持 `specforge webhook register --url <url> --events "<pattern>"` 命令，用于订阅事件（如 `gate.*`）。
6. THE Requirements_Document SHALL 声明 SpecForge 不直接集成 Telegram；Telegram / WhatsApp / Discord 等场景由 OpenClaw 调用 CLI 完成。

### Requirement 12: 崩溃恢复

**User Story:** 作为系统可靠性负责人，我希望 Daemon 崩溃或机器断电后，可以从磁盘重建一致状态，不丢失用户数据。

#### Acceptance Criteria

1. THE Daemon SHALL 对所有状态变更采用 WAL 语义：先把事件追加到 `events.jsonl` 并 `fsync`，然后再更新 `state.json`。
2. WHEN Daemon 启动，THE Daemon SHALL 从 `events.jsonl` 重建状态，并以 `state.json` 作为加速检查点对齐。
3. IF 启动时检测到 `state.json` 与 `events.jsonl` 不一致（例如 state 记录 design 阶段但 `design.md` 不存在），THEN THE Daemon SHALL 按预定义修复规则回退到一致状态（例如回退到 requirements 阶段）并记录修复事件。
4. WHEN Daemon 重启后发现之前绑定的 OpenCode session 仍然存活，THE Daemon SHALL 尝试重连该 session 而不是新建。
5. THE Daemon SHALL 仅在启动过程（启动时的一次性检查）中尝试重连之前绑定的 OpenCode session；启动完成后即使检测到存活的旧 session，也不得自动重连。
6. WHILE Daemon 处于 RECOVERING 或 RECONNECTING_SESSION 状态，THE Thin_Plugin SHALL 对用户显示"Daemon 重连中..."状态，且通常在 5 秒内恢复。
7. THE Requirements_Document SHALL 在 REQ-27 质量门槛中声明崩溃恢复测试目标：在 10 次随机 kill 测试中 0 数据丢失。

### Requirement 13: 多项目支持

**User Story:** 作为同时维护多个仓库的开发者，我希望一个 Daemon 能同时服务多个项目，既省资源又便于跨项目知识共享。

#### Acceptance Criteria

1. THE Daemon SHALL 在单实例内维护多个 project context，按项目根路径（绝对路径）进行隔离。
2. THE Daemon SHALL 对每个 project context 独立维护 `state.json`、`events.jsonl`、`runtime/` 等项目级文件。
3. THE Daemon SHALL 对每个 project context 维护一把 per-project 写锁；跨 project 的读写不相互阻塞。
4. WHERE 两个 OpenCode 会话同时操作同一 project 的同一 work item，THE Daemon SHALL 使用 per-project 锁串行化写入，避免数据竞争。
5. THE Requirements_Document SHALL 声明跨项目知识共享由共享 `~/.specforge/knowledge/` 自然实现，不在 V6.0 做自动抽取。

### Requirement 14: 多模态消息层

**User Story:** 作为用户，我希望向 SpecForge 提交需求、bug、设计输入时可以附带图片、音频、视频、文件、代码片段，系统自动处理并按模型能力适配。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 定义统一 `UserMessage` 格式；`content` 为数组，元素类型支持：`text`、`image`、`audio`、`video`、`file`、`code`、`document`。
2. THE Ingestion_Subsystem SHALL 把所有原始模态数据存入 CAS，以 blob 引用在 UserMessage 中流转，不内联原始字节。
3. THE Ingestion_Subsystem SHALL 提供基础解析器：
   - PDF / DOCX / XLSX：文本提取。
   - 图片：OCR 文本衍生物。
   - 音频：转写文本衍生物（通过外部服务）。
4. THE Requirements_Document SHALL 定义 `ModelCapabilities` 结构，声明某模型支持的模态集合。
5. WHEN `prepareMessageForModel(userMessage, modelCapabilities)` 被调用，THE Modality_Adapter SHALL 按以下规则输出模型输入：
   - 若模型原生支持该模态，使用原始 blob 引用。
   - 若模型不支持该模态，使用已缓存的文本衍生物（OCR / 转写 / 摘要）。
6. THE Observability_Subsystem SHALL 记录每次模态适配的决策（输入模态、目标模型、是否降级、使用的衍生物 blob 引用）。
7. THE Requirements_Document SHALL 声明 V6.0 只做多模态基础链路骨架；完整多模态支持属于 P2（REQ-25）。
8. IF 用户在 V6.0 提交包含多模态内容（image / audio / video 等非文本模态）的 UserMessage，THEN THE Ingestion_Subsystem SHALL 阻止该提交并返回错误，直到 P2 提供完整多模态支持；V6.0 不允许多模态内容被存储后"延迟处理"。
9. THE V6_Architecture SHALL 保证 P2 多模态完整支持依赖于 V6.0 基础链路骨架的存在；IF V6.0 基础多模态框架未按 REQ-14.1 至 REQ-14.6 实现，THEN P2 的多模态完整能力 SHALL 不得被启用。

### Requirement 15: 自愈闭环

**User Story:** 作为维护者，我希望 V6 架构预留自愈闭环的完整路径，但在 V6.0 只落地诊断部分，避免过早自动化带来破坏性。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 定义自愈闭环状态机：`triggered → diagnosing → proposing → approving → applying → verifying → (loop or completed/blocked)`。
2. THE Requirements_Document SHALL 列出允许触发自愈的条件：
   - Gate 失败且错误类型在"自愈允许清单"内。
   - 用户显式请求 `specforge heal <workItemId>`。
3. THE Requirements_Document SHALL 列出不自动触发自愈的情况：涉及用户确认、需要外部资源、严重破坏性操作。
4. THE Self_Healing_Subsystem SHALL 在单个 work item 上限制最多 3 轮自愈迭代；超出则标记 blocked。
5. WHEN Self_Healing_Subsystem 进入 `applying` 状态，THE Self_Healing_Subsystem SHALL 先创建回滚点；IF 回滚点创建失败，THEN THE Self_Healing_Subsystem SHALL 阻止进入 `applying` 阶段并把该轮自愈标记为 blocked，不得继续执行任何变更；IF `verifying` 失败，THEN THE Self_Healing_Subsystem SHALL 自动回滚到该回滚点。
6. THE Self_Healing_Subsystem SHALL 按风险分级决定批准策略：
   - L1（补章节 / 格式修正）：自动批准。
   - L2（小代码改动 / 新增测试）：默认批准，用户可禁用。
   - L3（大改动 / 删除 / 权限变更）：必须人工批准。
7. THE Requirements_Document SHALL 声明 V6.0 只实现 `Diagnose` 阶段；`Propose / Approve / Apply / Verify` 完整闭环属于 V6.x（P2）。

### Requirement 16: Telegram / OpenClaw 集成与远程访问安全层

**User Story:** 作为希望用 Telegram 远程驱动 SpecForge 的用户，我希望 V6 通过 OpenClaw 提供完整 spec 创建和执行能力，并在开启远程访问时有强制安全层。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 SpecForge 本身不做 Telegram / WhatsApp / Discord 直接集成；集成由 OpenClaw 调用 SpecForge CLI 完成。
2. THE Daemon SHALL 默认绑定 127.0.0.1，不对外暴露。
3. WHEN 用户执行 `specforge daemon config --bind 0.0.0.0 --require-auth`，THE Daemon SHALL 显式开启远程访问模式。
4. WHERE 远程访问模式开启，THE Daemon SHALL 强制要求长期 API key（区别于本地 Bearer Token），并支持 IP 白名单。
5. WHERE 远程访问模式开启，THE Daemon SHALL 对敏感操作（删除 work item、权限变更、配置重置）强制要求用户二步确认。
6. THE Daemon SHALL 支持"用户绑定机制"：OpenClaw 发来的请求必须绑定到一个已注册的 SpecForge 用户身份。
7. THE Requirements_Document SHALL 在质量门槛（REQ-27）中列出"OpenClaw 端到端完整 spec 创建和执行"作为发版必过项。

### Requirement 17: 插件沙箱

**User Story:** 作为安全审计者，我希望第三方插件不能随意访问系统资源，V6.0 先用静态检查与权限声明兜底，V6.x 再上运行时隔离。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6.0 插件沙箱策略：
   - 静态检查（禁止敏感 API 调用）。
   - 权限声明（`requires: ["filesystem.read", ...]`）。
2. THE Plugin_Loader SHALL 在加载时读取插件的 `requires` 字段，与用户授权对比；IF 权限未授权，THEN THE Plugin_Loader SHALL 拒绝加载。
3. THE Plugin_Loader SHALL 对插件源码执行静态检查，禁止以下敏感 API：直接 `child_process.exec`、`fs` 越界路径、未声明的网络访问。
4. THE Requirements_Document SHALL 声明子进程隔离 + 资源限额 + 文件系统白名单属于 V6.x（P2），不在 V6.0 实现。

### Requirement 18: 数据迁移框架

**User Story:** 作为长期使用者，我希望 SpecForge 的持久化文件格式可演进，新旧版本切换不会破坏用户数据。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 规定每个 SpecForge 持久化文件头部必须包含 `schema_version` 字段。
2. WHEN Daemon 启动且 `code_schema_version > file_schema_version`，THE Migration_Subsystem SHALL 自动运行迁移脚本。
3. WHEN Daemon 启动且 `file_schema_version == code_schema_version`，THE Daemon SHALL 正常启动，不显示升级提示。
4. IF `file_schema_version > code_schema_version`，THEN THE Daemon SHALL 先向用户显示升级提示（说明需要升级 SpecForge），再拒绝启动；仅在严格大于的情况下触发拒绝。
5. THE Migration_Subsystem SHALL 在 `~/.specforge/migrations/` 查找版本间迁移脚本（例如 `v1.0-to-v1.1.ts`）。
6. WHEN 迁移脚本执行前，THE Migration_Subsystem SHALL 把当前文件备份到 `~/.specforge/backups/<timestamp>/`。
7. THE Requirements_Document SHALL 声明 V5→V6 的数据迁移工具不在本版本范围（REQ-26 不做清单）。

### Requirement 19: 多机同步预留

**User Story:** 作为未来多设备 / 团队同步的考虑者，我希望 V6 的架构预留同步接口，而不是等到要做时再重构事件体系。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6.0 不实现多机同步能力。
2. THE Requirements_Document SHALL 声明 Event Bus 与 events.jsonl 的 schema 在设计时必须支持未来多机同步（事件全局唯一 ID、单调时间戳、project 维度可聚合）。
3. THE Requirements_Document SHALL 列出未来可能的多机同步路径（Git / CRDT / 中心服务器），作为架构演化参考，但不做实现选型。

### Requirement 20: Agent Roster（10 个内置 Agent）

**User Story:** 作为 workflow 设计者，我希望 V6.0 的 10 个 Agent 职责清晰、不重不漏。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 列出 V6.0 的 10 个内置 Agent 及其模式（primary / subagent）：
   - sf-orchestrator（primary）。
   - sf-requirements（subagent，支持多模态）。
   - sf-design（subagent，支持多模态，包含架构图识别）。
   - sf-task-planner（subagent）。
   - sf-executor（subagent）。
   - sf-debugger（subagent）。
   - sf-reviewer（subagent）。
   - sf-verifier（subagent）。
   - sf-knowledge（subagent）。
   - sf-analyst（subagent，新增）。
2. THE Requirements_Document SHALL 规定 sf-analyst 的职责为"读 observability 数据 → 生成结构化分析结果"；其调度者为 sf-debugger 和用户。
3. THE Requirements_Document SHALL 规定 sf-debugger 与 sf-analyst 分离（不合并）：sf-debugger 修复代码问题，sf-analyst 做架构层面感官分析。
4. WHERE V6.0 未实现 sf-knowledge 的完整知识库能力，THE Agent_Roster SHALL 保留 sf-knowledge 角色占位并提供有限能力（例如基础读写接口骨架），该占位与有限能力的交付即视为 V6.0 满足 Agent Roster 10 个内置 Agent 的声明；sf-knowledge 完整能力交付属于 V6.1（P1）。

### Requirement 21: Skill 扩展机制

**User Story:** 作为希望扩展 SpecForge 方法论的使用者，我希望 Skill 有明确的目录结构、元数据、按需加载和覆盖机制。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 定义 Skill 目录结构：
   - `SKILL.md`（必需）。
   - `metadata.json`（必需）。
   - `fragments/`（可选）。
   - `hooks/`（可选）。
2. THE Requirements_Document SHALL 规定 `metadata.json` 必须包含字段：`version`、`compatible`、`applicableFor`、`dependencies`、`loading`。
3. THE Skill_Loader SHALL 支持 fragment 按需加载：`core` fragment 默认加载；`examples` / `edge-cases` 等其他 fragment 按需加载。
4. THE Skill_Loader SHALL 按"内置 < 用户级 < 项目级"三层覆盖加载 skill。
5. THE Skill_Loader SHALL 支持 `extends` 字段，允许 skill 继承并扩展另一个 skill。
6. WHEN Skill 目录内容发生变化，THE Skill_Loader SHALL 在下次加载时生效（热加载）；不中断运行中的 work item。

### Requirement 22: Tool 三层

**User Story:** 作为 Tool 提供者，我希望清楚区分内置 Tool、用户自定义 Tool、MCP Tool，并且所有 Tool 的 context 与 OpenCode 内部概念解耦。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 定义 Tool 三层：
   - Tier 1：Daemon 内置 Tool（如 `sf_state_*`、`sf_knowledge_*`）。
   - Tier 2：用户自定义 Tool（TypeScript，带权限声明）。
   - Tier 3：MCP Tool（V6.0 支持 stdio 和 http MCP servers）。
2. THE Requirements_Document SHALL 规定用户自定义 Tool 必须包含以下字段：`id`、`displayName`、`version`、`permissions`、`inputSchema`、`outputSchema`、`execute`。
3. THE Tool_Context SHALL 不暴露任何 OpenCode 特有概念（如 OpenCode `ctx`、`callID`）；所有跨层字段由 Adapter 翻译为 Daemon 中立字段。
4. THE Agent_Role_Config SHALL 决定该 role 可用的 Tool 集合；Permission Engine 在每次调用时再次校验。
5. THE Requirements_Document SHALL 声明用户自定义 Tool 在 V6.0 只提供"受限的只读 / 副作用可声明"子集作为默认发布能力；WHERE 用户自定义 Tool 的完整 Tier 2 能力已在代码库中实现，THE Tool_Runtime SHALL 允许用户访问并使用这些能力，即使在 V6.0 分支内；完整 Tier 2 能力的正式发版声明属于 V6.1（P1）。

### Requirement 23: Workflow 数据驱动

**User Story:** 作为希望自定义工作流的用户，我希望 Workflow 可以通过 JSON 数据定义，而不是改代码。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 规定 Workflow 定义格式为 JSON，字段包含 `id`、`displayName`、`intent`、`stateMachine`、`artifacts`。
2. THE `stateMachine` 字段 SHALL 包含 `initial` 与 `states`；每个状态至少包含 `agent`、`gate`、`skills` 字段。
3. THE Requirements_Document SHALL 允许用户定义新状态机、新转换规则、挂载自定义 Gate、指定 Agent、加载自定义 Skill。
4. THE Requirements_Document SHALL 声明 V6.0 只包含"内置 feature_spec workflow"；Workflow 数据驱动扩展（用户自定义 workflow 文件加载）属于 V6.1（P1）。

### Requirement 24: Gate 扩展与组合

**User Story:** 作为 Gate 提供者，我希望 Gate 作为 Tool 的特殊子类，能够组合执行、按策略失败。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 规定 Gate 为 Tool 的特殊子类，必须实现 `check()` 方法并返回 `GateResult`。
2. THE Gate SHALL 可选实现 `syncKnowledgeGraph()` 方法；若实现，则 Gate 通过时自动同步知识图谱。
3. THE Requirements_Document SHALL 定义 `compositeGate` 组合结构，支持以下执行模式：`sequential`、`parallel`。
4. THE `compositeGate` SHALL 支持失败策略 `fail_fast` 与 `collect_all`。
5. WHERE `compositeGate.mode = parallel` 且 `failPolicy = fail_fast`，THE Gate_Runner SHALL 在任一子 Gate 失败时取消其余尚未完成的 Gate 并返回失败。
6. THE Requirements_Document SHALL 声明 Gate 组合能力属于 V6.1（P1）；V6.0 只需内置 4 个基础 Gate（requirements / design / tasks / verification），不提供用户自定义 Gate 组合。

### Requirement 25: V6.0 开发范围边界（P0 / P1 / P2）

**User Story:** 作为 V6.0 的项目经理，我希望范围被明确切分为 P0 / P1 / P2，避免"边做边加"。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 以列表形式列出 V6.0 P0 必做项（共 27 项），分组为：
   - 基础设施（Daemon、通信、Session Registry、Permission、Adapter、Config、Directory、CLI、Recovery、Multi-project，共 10 项）。
   - 核心能力（10 Agent、Feature Spec workflow、4 Gate、state.json、events.jsonl、Thin Plugin，共 6 项）。
   - 可观测性基础（Event Bus、CAS、三级模式、基础日志、sf-analyst，共 5 项）。
   - 扩展机制骨架（Skill 加载、Tool 注册、内置 Workflow，共 3 项）。
   - 分发（npm 包、安装向导、`schema_version` + 迁移框架，共 3 项）。
2. THE Requirements_Document SHALL 以列表形式列出 V6.1 P1 项（共 15 项），包含 bugfix workflow、design-first workflow、quick change workflow、Knowledge Graph、全局知识库 + sf-knowledge、Context Builder、成本追踪、并行任务调度、跨会话续接、Telegram Webhook 通知、用户自定义 Tool、用户自定义 Skill、sf-debugger 自愈闭环、Workflow 数据驱动扩展、Gate 组合。
3. THE Requirements_Document SHALL 以列表形式列出 V6.x P2 项，包含多模态完整支持、自愈完整闭环、V3.6 四工作流（change_request / refactor / ops_task / investigation）、插件沙箱、多机同步、Web UI、跨项目自动学习。
4. WHEN 某项被明确列入 P1 或 P2，THE V6_0_Scope SHALL 禁止在 V6.0 交付该项。
5. THE Requirements_Document SHALL 允许在 ADR（记录在 design.md）中调整 P0 / P1 / P2 归属，但必须同步更新本文档。

### Requirement 26: V6.0 不做清单

**User Story:** 作为需求守门人，我希望 V6 有一个显式的"不做"清单，用来快速否决范围蔓延。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 列出 V6 明确不做的项目：
   - V5→V6 数据迁移工具（用户需新项目启动或手动迁移）。
   - 国际化。
   - Web UI（V6.0）。
   - 多租户、云服务。
2. THE Requirements_Document SHALL 说明"Telegram 直接集成"也不做；由 OpenClaw 桥接（与 REQ-16 呼应）。
3. WHEN 后续需求提到"国际化"、"Web UI（V6.0 内）"或"多租户"，THE Review_Process SHALL 拒绝并指向本清单。

### Requirement 27: V6.0 质量门槛

**User Story:** 作为发版负责人，我希望 V6.0 的发版标准可度量、可自动验证。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 把以下 6 条列为 V6.0 发版必过门槛：
   - 门槛 1：feature_spec workflow 端到端测试通过。
   - 门槛 2：北极星验证——10 类场景在 5 分钟内定位根因。
   - 门槛 3：崩溃恢复——10 次随机 kill 测试 0 数据丢失。
   - 门槛 4：Telegram 集成——OpenClaw 端到端完整 spec 创建和执行。
   - 门槛 5：性能——Daemon 启动时间小于 3 秒；事件记录开销小于 5 ms/event；standard 模式事件文件大小小于 1 GB/天。
   - 门槛 6：文档完整——架构文档 + 用户手册齐全。
2. WHEN 任一门槛未通过，THE Release_Process SHALL 拒绝打出 V6.0 stable tag。
3. THE Requirements_Document SHALL 允许 6 条门槛在 ADR 中细化阈值（如每秒事件数），但不得删除任何一条门槛。

### Requirement 28: 平台与环境

**User Story:** 作为使用者，我希望 V6.0 的支持平台与最低 / 推荐硬件被明确声明，以便评估是否可用。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6.0 支持的操作系统：
   - Windows 10 或更高版本。
   - macOS 12 或更高版本。
   - Linux 主流发行版（Ubuntu / Debian / Fedora / Arch 等）。
2. THE Requirements_Document SHALL 声明 OpenCode 最低版本为发版时的最新版本（当前参考为 1.14.41 或更高）。
3. THE Requirements_Document SHALL 声明运行时：首选 Bun，其次 Node.js（LTS）。
4. THE Requirements_Document SHALL 声明最低硬件要求为：4 核 CPU、4 GB 内存、40 GB 硬盘。
5. THE Requirements_Document SHALL 声明推荐硬件为：8 核 CPU、16 GB 内存、200 GB 硬盘。
6. IF 运行环境低于最低硬件要求，THEN THE Installation_Wizard SHALL 警告用户但允许继续安装。

### Requirement 29: 里程碑规划（M1–M9）

**User Story:** 作为项目管理者，我希望 V6.0 的交付节奏按照 9 个里程碑推进，每个里程碑有明确主题。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 列出 V6.0 的里程碑及其主题；基准里程碑为以下 9 个（M1–M9）：
   - M1：Daemon 骨架。
   - M2：身份与权限（Session Registry + Permission Engine）。
   - M3：可观测性基础（Event Bus + CAS + 三级模式 + 基础日志）。
   - M4：核心工作流（10 Agent + feature_spec + 4 Gate + Thin Plugin）。
   - M5：分析能力（sf-analyst + 基础 observability 查询）。
   - M6：崩溃恢复（WAL + 重连 + 一致性修复）。
   - M7：分发与迁移（npm 包 + 安装向导 + schema_version 框架）。
   - M8：Telegram 集成（CLI `--json` + webhook + OpenClaw 端到端）。
   - M9：北极星验证（10 类场景 5 分钟定位根因）。
2. WHERE 项目范围扩展需要增减里程碑数量，THE Requirements_Document SHALL 允许里程碑数量灵活调整（允许 9 个以外的数量，例如 10 或 11 个），但必须在本文档中同步更新里程碑列表并保持每个里程碑有明确主题，文档化里程碑的强制要求不变。
2. THE Requirements_Document SHALL 规定每个里程碑完成时必须输出里程碑报告（文档形式），记录该里程碑覆盖的 P0 项。
3. IF M9 北极星验证不通过，THEN THE Release_Process SHALL 不允许打 V6.0 stable tag（与 REQ-27 呼应）。

### Requirement 30: Correctness Properties（架构一致性属性）

**User Story:** 作为架构守门人，我希望本 spec 给出一组"架构一致性属性"，作为后续所有子模块 spec 的不变式，任何模块设计都不得违反。

说明：本 spec 是纯架构文档 spec，Correctness Properties 不是可执行属性测试，而是"架构不变式"：每一条必须能被文档静态检查或模块 spec 审查校验。后续模块 spec 可以把这些不变式细化为可执行的 property-based tests。

#### Acceptance Criteria

1. **Single Source of Truth Property**：THE V6_Architecture SHALL 保证任何组件（Thin Plugin / CLI / Web UI / Adapter / Tool）不得绕过 Daemon 直接修改权威状态；所有状态变更必须经由 Daemon 的 HTTP API 或内部 Tool 调用落入 events.jsonl。
2. **Event Bus Traversal Property**：THE V6_Architecture SHALL 保证所有跨层通信（Agent→Daemon、Daemon→Observability、Daemon→自愈子系统）必须经过 Event Bus；不得通过直接函数调用跨越可观测性边界。
3. **Hard Rule Immutability Property**：THE V6_Architecture SHALL 保证 Permission Engine 的硬规则（Agent Constitution 9 条）不可被任何配置层覆盖；用户配置试图覆盖时必须被拒绝并记录。
4. **Adapter Encapsulation Property**：THE V6_Architecture SHALL 保证 OpenCode 特有概念（OpenCode 的 `ctx`、`callID`、内部事件 schema 等）仅存在于 OpenCodeAdapter 内部；Daemon 核心与 Tool Context 不得引用这些概念。
5. **Session Identity Stability Property**：THE V6_Architecture SHALL 保证身份由 `sessionId` 作为唯一键落入 Session Registry；不得依赖 OpenCode Plugin Hook 输入中未公开承诺的 `agent` 字段。
6. **Idempotent Recovery Property**：THE V6_Architecture SHALL 保证重复回放 events.jsonl 得到相同 state.json；即 `rebuild(events) == rebuild(events)` 对任意一致状态成立。
7. **WAL Ordering Property**：THE V6_Architecture SHALL 保证"先 events.jsonl fsync → 再 state.json 更新"的顺序不可颠倒；任何写路径违反此顺序即为架构违例。
8. **Round-trip Property for Serialization**：对所有持久化文件（state.json、events.jsonl、spec.json、metadata.json 等）THE V6_Architecture SHALL 保证 `parse(serialize(x)) == x`（序列化-反序列化往返一致）。此属性在子模块 spec 中必须以 property-based test 验证。
9. **CAS Content Addressing Property**：THE V6_Architecture SHALL 保证相同内容的 blob 具有相同的 SHA-256 地址；`store(content).id == sha256(content)` 恒成立。
10. **Permission Decision Traceability Property**：THE V6_Architecture SHALL 保证每一次 Permission Engine 决策都产生一条事件；给定任意 deny 结果，可以通过事件日志回溯到规则 ID、层级、匹配上下文。
11. **Configuration Merge Monotonicity Property**：THE V6_Architecture SHALL 保证配置合并结果只依赖四层的内容与顺序，不依赖加载时间；即"相同四层输入永远得到相同合并结果"。
12. **Adapter Version Alignment Property**：THE V6_Architecture SHALL 保证 `OpenCodeAdapter.version` 与兼容的 OpenCode major 版本区间一一对应；Daemon 启动时若检测到 OpenCode 版本超出 Adapter 支持区间，必须拒绝绑定并提示升级。
13. **Modality Adaptation Determinism Property**：THE V6_Architecture SHALL 保证 `prepareMessageForModel(userMessage, modelCapabilities)` 对相同输入（同 blob 引用 + 同 capabilities）得到相同输出决策。
14. **Schema Version Monotonicity Property**：THE V6_Architecture SHALL 保证同一文件的 `schema_version` 随版本演进单调不减；任何 migration 脚本执行后写入的 `schema_version` 必须等于或高于迁移前。
15. **Scope Boundary Property**：THE V6_Architecture SHALL 保证 REQ-25 中标记为 P1 / P2 的能力不在 V6.0 发版分支中启用（可存在死代码或 feature flag，但默认关闭）。
