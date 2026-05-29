# WI-031 变更影响分析：Daemon 存储架构重构 + 事件处理实现

## 文档信息

| 项目 | 内容 |
|------|------|
| Work Item ID | WI-031 |
| 分析日期 | 2026-05-27 |
| 工作流类型 | change_request |
| 变更层级 | A 层：存储路径重构 / B 层：事件处理实现 |
| 关联 WI | WI-033（ALL_STATES 状态完备性和状态验证覆盖全部工作流） |

---

## 变更范围

### 1.1 A 层：存储路径重构

#### 1.1.1 新增 `mode` 配置

**现状**：当前 daemon 无 `mode` 概念，所有运行态数据统一存入 `~/.specforge/` 目录。具体路径：
- `~/.specforge/runtime/handshake.json` — 握手文件（DaemonConfig.ts）
- `~/.specforge/projects/<hash>/state.json` — 项目状态（StateManager.ts）
- `~/.specforge/projects/<hash>/events.jsonl` — WAL 事件日志（WAL.ts）
- `~/.specforge/projects/<hash>/events.jsonl` — RecoverySubsystem 也引用此路径

**变更内容**：
- 新增 `mode` 配置项，支持 `personal`（默认）和 `enterprise` 两种模式
- `personal` 模式：所有数据写入项目目录下的 `.specforge/` 目录
- `enterprise` 模式：保持现有分层模型（`~/.specforge/projects/`），即向后兼容当前行为

#### 1.1.2 Personal 模式布局

**变更内容**：
在项目根目录创建 `.specforge/` 目录，布局如下：
```
project/.specforge/
├── .gitignore          ← daemon 自动维护
├── specs/              ← 进 Git（规格文档）
├── config/             ← 进 Git（项目配置）
├── archive/            ← 进 Git（Agent Run 归档）
└── runtime/            ← .gitignore 排除（运行态数据）
    ├── state.json
    ├── events.jsonl
    └── sessions/
```

**影响模块**：
- `DaemonConfig`：需新增 `mode` 字段解析和环境变量读取逻辑（如 `SPECFORGE_MODE`）
- `StateManager`：构造函数中 `statePath` 的路径计算逻辑需根据 mode 切换（当前硬编码使用 `~/.specforge/projects/<hash>/state.json`）
- `WAL`：构造函数中 `eventsPath` 路径计算逻辑需根据 mode 切换（当前硬编码使用 `~/.specforge/projects/<hash>/events.jsonl`）
- `RecoverySubsystem`：`eventsPath`/`statePath` 路径计算逻辑需根据 mode 切换（当前同样硬编码 `~/.specforge/projects/`）
- `ProjectManager`：`getProjectDataDir()` 方法路径计算逻辑需根据 mode 切换（当前硬编码 `~/.specforge/projects/<projectId>`）
- `Daemon`：构造函数中 `WAL` 和 `StateManager` 的实例化路径需适配 mode（当前使用 `runtimeDir` 变量）
- CLI `init` 命令：需在项目初始化时创建 `.specforge/` 目录结构并写入 `.gitignore`
- CLI `doctor` 命令：需新增对 personal 模式目录结构的健康检查

#### 1.1.3 daemon.json 迁移

**现状**：当前不存在实际的 `daemon.json` 文件（代码中未见引用），但文档 `docs/cli/openclaw-integration.md` 中提及 `~/.specforge/config/daemon.json`。

**变更内容**：
- 将 daemon 的项目路径清单从 `~/.specforge/daemon.json` 迁移到 `~/.config/opencode/daemon.json`
- 该文件仅存储已注册项目的路径清单，用于 daemon 重启后恢复项目上下文

**影响模块**：
- `ProjectManager`：需支持从 `~/.config/opencode/daemon.json` 读取/写入项目路径清单
- `Daemon`：启动流程中需增加从 daemon.json 恢复已注册项目的逻辑
- CLI `init`/`doctor`：需支持读写新路径

#### 1.1.4 ALL_STATES 补充

**现状**：`state_machine.ts` 中的 `ALL_STATES` 数组已包含以下工作流的专用状态：
- Change Request: `impact_analysis`, `impact_analysis_gate`, `design_delta`
- Bugfix Spec: `bugfix_analysis`, `bugfix_gate`, `fix_design`
- Refactor: `refactor_analysis`, `refactor_analysis_gate`, `refactor_plan`, `refactor_plan_gate`
- Ops Task: `ops_plan`, `ops_plan_gate`, `execution`
- Investigation: `investigation_plan`, `investigation_plan_gate`, `research`, `findings_report`, `findings_report_gate`

**变更内容**：
与 WI-033 联动，确认以下两点：
1. `ALL_STATES` 中已声明的状态是否与各工作流转换表中实际引用的状态完全一致（无遗漏、无多余）
2. `StateManager.isValidStateName()` 仅校验状态名是否在 `ALL_STATES` 中（不校验工作流级别的转换合法性），确保 `ALL_STATES` 是"所有工作流所有合法状态的并集"

**潜在发现**：当前 `ALL_STATES` 从代码审查看已经完备，所有 8 种工作流的转换表引用的状态都能在 `ALL_STATES` 中找到。但如果存在仅在转换表中引用而未在 `ALL_STATES` 声明的新增状态（如未来某个工作流），则会导致 `StateManager.isValidStateName()` 拒绝合法状态名。此变更需要在 WI-033 的验证框架下完成完整性校验。

**影响模块**：
- `state_machine.ts`：`ALL_STATES` 数组
- `StateManager.ts`：引用 `ALL_STATES` 作为 `VALID_STATES` 的来源

#### 1.1.5 A 层变更文件清单

| 模块 | 文件 | 变更类型 |
|------|------|----------|
| daemon-core | `DaemonConfig.ts` | 修改：新增 mode 字段和解析逻辑 |
| daemon-core | `Daemon.ts` | 修改：适配 mode 依赖的路径注入 |
| daemon-core | `ProjectManager.ts` | 修改：getProjectDataDir 路径切换、daemon.json 读写 |
| daemon-core | `StateManager.ts` | 修改：statePath 路径切换 |
| daemon-core | `WAL.ts` | 修改：eventsPath 路径切换 |
| daemon-core | `RecoverySubsystem.ts` | 修改：eventsPath/statePath 路径切换 |
| daemon-core | `state_machine.ts` | 修改：ALL_STATES 完备性验证 |
| cli | `init` 命令 | 修改：创建 .specforge/ 目录结构和 .gitignore |
| cli | `doctor` 命令 | 修改：新增目录结构健康检查 |
| configuration | mode 配置解析模块 | 新增：mode 解析逻辑 |

### 1.2 B 层：daemon 事件处理实现

#### 1.2.1 插件增强：projectPath 传递

**现状**：插件 `sf_specforge.ts` 的 `sf_specforge(input: PluginInput)` 函数接收 `PluginInput`，其中包含 `directory` 字段（即项目路径），但当前**未将 `projectPath` 传递给 daemon**。所有事件通过 `daemonClient.postEvent(type, data)` 发送，`data` 中不包含 `projectPath`。

**变更内容**：
- 从 `PluginInput.directory` 提取 `projectPath`
- 在插件启动时调用 `POST /api/v1/ingest/register` 注册项目，获取 `sessionId`
- 后续所有事件附带 `sessionId`（替代或补充 `projectPath`），实现 session-project 绑定

**影响模块**：
- `.opencode/plugins/sf_specforge.ts`：修改 `sf_specforge()` 入口函数

#### 1.2.2 注册端点：`POST /api/v1/ingest/register`

**现状**：HTTPServer 中 `ingest` 路径通过前缀路由（prefix route）`/api/v1/ingest/` 注册，但处理方法为通用的 `handleApiEndpoint`，仅返回 200 和占位消息，无实际逻辑。不存在专门的 `/api/v1/ingest/register` 端点。

**变更内容**：
- 新增精确路由 `POST /api/v1/ingest/register`
- 接收 `{ projectPath }` 请求体
- 调用 `ProjectManager.registerProject(projectPath)` 创建项目上下文
- 调用 `SessionRegistry` 创建 session 并绑定 projectPath
- 返回 `sessionId` 给插件

**影响模块**：
- `HTTPServer.ts`：新增精确路由和处理函数
- `ProjectManager.ts`：`registerProject()` 方法已存在，需确认其返回值和 session 绑定逻辑
- `SessionRegistry.ts`：需新增基于 projectPath 创建 session 的方法

#### 1.2.3 ingest 事件处理路由

**现状**：`POST /api/v1/ingest/event` 当前同样被前缀路由捕获，`handleApiEndpoint` 仅返回 200 占位响应。插件发送的所有事件（`tool.invoking`、`tool.invoked`、`opencode.event`、`session.compacting`、`chat.params`、`chat.headers`）**在 daemon 端完全未处理**。

**变更内容**：新增实际的事件处理逻辑，根据事件 `type` 字段路由到不同子系统：

| 事件类型 | 路由目标 | 处理逻辑 |
|---------|---------|---------|
| `tool.invoking` | PermissionEngine + SessionRegistry | 权限拦截判断（允许/拒绝/修改 args）；记录 session 活跃时间 |
| `tool.invoked` | EventLogger | 记录工具执行结果（output、耗时等） |
| `opencode.event` | SessionRegistry | 按 `session.created`/`session.idle`/`session.error` 等子类型更新 session 状态 |
| `session.compacting` | RecoverySubsystem | 调用 `saveCheckpoint()` 保存会话快照，用于续接 |
| `chat.params` | EventLogger | 记录 LLM 调用参数 |
| `chat.headers` | EventLogger | 记录 HTTP 请求头（已做脱敏处理） |

**影响模块**：
- `HTTPServer.ts`：新增 `POST /api/v1/ingest/event` 精确路由和处理函数，实现事件分发逻辑
- `PermissionEngine`：接入 `tool.invoking` 流程（当前 PermissionEngine 已实例化但未接入 ingest 管道，仅在 ToolDispatcher 中使用）
- `SessionRegistry`：接入 `opencode.event` 事件驱动的状态变更（当前 SessionRegistry 通过 EventBus 监听 `session.*` 事件，需新增对 OpenCode 事件的映射）
- `EventLogger`：接入 `tool.invoked`/`chat.params`/`chat.headers` 事件日志（当前 EventLogger 已实例化，`event.log` API 端点已有实现，但 ingest 路径未对接）
- `RecoverySubsystem`：预留 `saveCheckpoint()` 方法，接入 `session.compacting` 事件（当前 RecoverySubsystem 有 `checkAndRepair()` 和 `reconnectOldSessions()` 方法，但缺少显式的 checkpoint 保存方法）

#### 1.2.4 插件补注册 `shell.env` hook

**现状**：`sf_specforge.ts` 的 `sf_specforge()` 返回值中**未注册** `shell.env` hook。v6.0 功能覆盖表中标注"未注册"。

**变更内容**：
- 在插件的返回值（`Hooks` 对象）中新增 `shell.env` hook
- `shell.env` hook 触发时，向 daemon 发送 `shell.env` 事件
- Daemon 端处理该事件，注入 SpecForge 需要的环境变量（如 `SPECFORGE_DAEMON_PORT`、`SPECFORGE_SESSION_ID` 等）

**影响模块**：
- `.opencode/plugins/sf_specforge.ts`：新增 `shell.env` hook 注册
- `HTTPServer.ts`：在 ingest 事件分发中新增对 `shell.env` 事件的处理

#### 1.2.5 B 层变更文件清单

| 模块 | 文件 | 变更类型 |
|------|------|----------|
| plugin | `.opencode/plugins/sf_specforge.ts` | 修改：projectPath 传递、注册逻辑、shell.env hook |
| daemon-core | `HTTPServer.ts` | 修改：新增 `/api/v1/ingest/register` 和事件处理逻辑 |
| daemon-core | `PermissionEngine` | 修改：接入 ingest 管道 |
| daemon-core | `SessionRegistry.ts` | 修改：OpenCode 事件映射 |
| daemon-core | `EventLogger` | 修改：接入 ingest 管道 |
| daemon-core | `RecoverySubsystem.ts` | 修改：新增 saveCheckpoint() 方法 |

### 1.3 A 层与 B 层的依赖关系

```
A 层（存储重构）
├── mode 配置 ───── 影响 B 层子系统数据存储路径 ──────┐
├── personal 布局 ── 影响 WAL/StateManager 路径 ──────┤
├── daemon.json ─── 影响项目注册恢复路径 ─────────────┤
└── ALL_STATES ──── 影响 StateManager 状态校验 ────────┤
                                                       │
                                    ┌──────────────────┘
                                    ▼
B 层（事件处理）
├── projectPath 传递 ── 依赖 A 层的 projectPath 概念
├── register 端点 ──── 依赖 ProjectManager（A 层已修改）
├── ingest 事件路由 ── 依赖 SessionRegistry/EventLogger 数据路径（A 层提供）
└── shell.env ──────── 依赖 ProjectManager 的 session 绑定（A 层提供）
```

**依赖分析**：
- **强依赖**：B 层的 `/api/v1/ingest/register` 端点依赖 A 层 ProjectManager 的 `registerProject()` 方法。如果 A 层的路径重构改变了 ProjectManager 的行为（如 dataDir 位置），B 层必须同步适配。
- **弱依赖**：B 层的事件处理子系统（PermissionEngine、EventLogger、SessionRegistry）的数据存储路径受 A 层的 mode 配置影响，但这些子系统本身不关心数据存在哪里，只要接口一致即可。
- **无依赖**：A 层的 daemon.json 迁移和 ALL_STATES 补充与 B 层事件处理完全解耦。
- **推荐实施顺序**：先 A 后 B。A 层的路径重构先完成并验证（确保现有功能不受影响），再实施 B 层的事件处理逻辑（依赖 A 层提供的稳定基础）。

---

## 风险评估

### 2.1 整体风险等级：**高**

**理由**：本次变更同时触及存储层（核心数据持久化路径）和事件处理层（插件-daemon 通信链路），影响面覆盖 daemon 启动流程、数据存储、插件交互等关键路径。任何一层的缺陷都可能导致 daemon 无法启动、数据丢失或插件功能完全失效。

### 2.2 A 层存储重构风险

**风险等级：高**

| 风险项 | 风险描述 | 影响范围 | 缓解措施 |
|--------|---------|---------|---------|
| 路径迁移数据丢失 | 从 `~/.specforge/projects/` 迁移到 `.specforge/runtime/` 时，如果迁移逻辑有缺陷，可能导致已有项目状态丢失 | 所有已注册项目的 WAL 事件和状态数据 | 迁移前备份；先复制后删除；提供 dry-run 模式 |
| enterprise→personal 切换不兼容 | 已有 enterprise 模式项目切换到 personal 模式时，需要找到正确的项目路径并迁移数据 | 已有项目 | 明确模式切换是单向的；personal 模式下忽略 `~/.specforge/projects/` 旧数据 |
| .gitignore 自动维护冲突 | daemon 自动修改 `.gitignore` 可能与用户手动编辑冲突 | 项目 Git 仓库 | 使用标记注释块（如 `# SpecForge managed`）隔离 daemon 管理的条目 |
| 状态文件路径不一致 | StateManager、WAL、RecoverySubsystem 三个模块各自独立计算路径，改一处漏一处会导致状态不一致 | 状态重建和恢复 | 统一通过 DaemonConfig 提供路径，避免各模块独立硬编码 |
| 跨平台路径问题 | Windows 和 Unix 路径分隔符差异可能导致 statePath/eventsPath 计算错误 | Windows 用户 | 使用 `path.join()` 统一处理；增加跨平台测试 |
| ALL_STATES 修改引入回归 | 修改 ALL_STATES 数组后，如果某个工作流转换表引用了未声明的状态，StateManager 会拒绝合法状态转换 | 所有工作流的状态流转 | 与 WI-033 联动进行完备性验证；增加 ALL_STATES 与转换表的交叉一致性单元测试 |

### 2.3 B 层事件处理实现风险

**风险等级：中高**

| 风险项 | 风险描述 | 影响范围 | 缓解措施 |
|--------|---------|---------|---------|
| 插件-daemon 通信协议变更 | 引入 `sessionId` 和 `/api/v1/ingest/register` 后，旧版插件无法与新 daemon 通信 | 所有 OpenCode 会话 | 保持向后兼容：支持无 sessionId 的事件（回退到旧路径）；插件版本号检查 |
| 事件处理阻塞 daemon | PermissionEngine 权限判断如果是同步阻塞操作，可能阻塞 daemon 事件循环 | daemon 整体响应性能 | 所有事件处理使用异步管道；PermissionEngine 引入超时机制（如 `<timeout: 5s>`） |
| PermissionEngine 状态不一致 | 首次接入 `tool.invoking` 流程时，权限判断逻辑未经过充分测试，可能导致工具被错误拦截或放行 | Agent 工具调用 | 先以"仅记录不拦截"模式上线，逐步启用拦截 |
| SessionRegistry 事件映射遗漏 | OpenCode 事件类型映射不完整，导致某些 session 事件未被处理 | 会话生命周期管理 | 基于 OpenCode 事件文档建立完整映射表；未匹配事件记录 WARNING 日志 |
| RecoverySubsystem saveCheckpoint 缺失 | 当前 RecoverySubsystem 无 `saveCheckpoint()` 方法，需要新增，但 checkpoint 的存储格式和恢复逻辑需要与现有 rebuildState 逻辑一致 | 会话续接功能 | 基于现有 WAL + state.json 机制设计 checkpoint；复用现有 rebuildState |
| shell.env hook 注入冲突 | `shell.env` hook 注入的环境变量可能与用户或 OpenCode 自身设置的环境变量冲突 | Agent 执行环境 | 使用 `SPECFORGE_` 前缀隔离；在 hook 中检查并合并而非覆盖 |

### 2.4 整体耦合风险

**风险等级：中**

- **存储层与事件层的耦合**：B 层的实际事件数据（如 EventLogger 写的日志）最终存储在 A 层定义的路径上。如果 A 层的 mode 切换在 B 层实施后才完成，B 层的数据可能写入错误位置。
- **StateManager 双重消费**：StateManager 同时被 A 层（WAL 路径管理）和 B 层（ingest 事件处理中的状态变更）修改，需要确保两层的修改不产生竞态条件。
- **插件与 daemon 双端修改**：插件和 daemon 的修改需要同步上线，否则会出现通信协议不匹配（如插件发送 `sessionId` 但 daemon 不识别的场景）。

### 2.5 回滚可行性

**风险等级：低（回滚可行）**

| 层面 | 回滚策略 | 回滚难度 |
|------|---------|---------|
| A 层路径重构 | 将 `mode` 默认值设为 `enterprise`（当前行为），personal 模式作为 opt-in 特性。出问题时用户切换回 enterprise 模式即可 | 低 |
| A 层 daemon.json 迁移 | 同时读写新旧两个路径，新路径写入失败时 fallback 到旧路径 | 低 |
| B 层事件处理 | 以 feature flag 控制是否启用实际的事件处理逻辑（默认关闭=仅记录日志），出问题时关闭 flag 恢复旧行为 | 低 |
| B 层插件增强 | 插件向后兼容：daemon 返回 404 时（未实现 `/register` 端点）跳过注册，后续事件仍使用旧格式 | 低 |

**回滚推荐**：使用 feature flag 控制 B 层新功能，A 层以 `enterprise` 为默认模式。两层均可独立回滚。

---

## 回归测试范围

### 3.1 现有功能验证（确保不引入回归）

#### daemon 启动与生命周期

| 测试用例 | 验证目标 | 优先级 |
|---------|---------|--------|
| daemon 正常启动 | `Daemon.start()` 在 enterprise 模式下正常完成启动流程 | Must |
| daemon 正常关闭 | `Daemon.stop()` 正常完成资源释放 | Must |
| 握手文件生成 | `~/.specforge/runtime/handshake.json` 正常生成且包含有效的 token 和端口 | Must |
| 单实例强制 | 重复启动 daemon 时正确拒绝 | Must |
| SSE 连接 | SSE 客户端能正常连接和接收事件 | Must |

#### 状态管理

| 测试用例 | 验证目标 | 优先级 |
|---------|---------|--------|
| state/read API | 查询已有 Work Item 状态返回正确结果 | Must |
| state/transition API | 特征规格工作流的状态流转正常（intake→requirements→...→completed） | Must |
| 乐观锁 | 并发状态转换时乐观锁正确拒绝不一致的 from_state | Must |
| WAL 重建 | daemon 重启后从 WAL 正确重建所有 Work Item 状态 | Must |
| ALL_STATES 校验 | 所有 8 种工作流的全部合法状态名均通过 isValidStateName 校验 | Must |

#### 项目管理

| 测试用例 | 验证目标 | 优先级 |
|---------|---------|--------|
| registerProject | 新项目注册后 context 正常创建 | Must |
| getProject | 已有项目直接返回 context | Must |
| 多项目管理 | 同时注册多个项目不互相干扰 | Should |

#### 插件功能

| 测试用例 | 验证目标 | 优先级 |
|---------|---------|--------|
| 工具钩子转发 | `tool.execute.before` 和 `tool.execute.after` 事件正常发送到 daemon | Must |
| 事件钩子转发 | `opencode.event` 事件正常转发 | Must |
| 会话压缩钩子 | `session.compacting` 事件正常转发 | Must |
| 聊天参数钩子 | `chat.params` 和 `chat.headers` 正常转发 | Must |
| 插件降级 | daemon 不可用时插件正常工作而不抛出异常 | Must |
| 插件重连 | daemon 重启后插件自动重连 | Must |

#### permission.denied 事件

| 测试用例 | 验证目标 | 优先级 |
|---------|---------|--------|
| 未授权访问 | 无 token 请求返回 401 并记录 permission.denied 事件 | Must |
| 错误 token | 错误 token 请求返回 401 并记录 permission.denied 事件 | Must |

#### 恢复子系统

| 测试用例 | 验证目标 | 优先级 |
|---------|---------|--------|
| 一致性检查 | `checkAndRepair()` 正确识别 state_mismatch | Must |
| 恢复修复 | 修复后 `rebuild(events) == s'` 成立（Property 20） | Must |
| 启动阶段重连 | `reconnectOldSessions()` 在启动阶段正确重连旧会话（Property 21） | Must |
| 启动后禁止重连 | 启动完成后不自动重连 | Must |

### 3.2 新增功能验证

#### A 层：存储重构

| 测试用例 | 验证目标 | 优先级 |
|---------|---------|--------|
| personal 模式启动 | `mode=personal` 时 daemon 将数据写入 `project/.specforge/runtime/` | Must |
| enterprise 模式启动 | `mode=enterprise` 时 daemon 将数据写入 `~/.specforge/projects/`（现有行为） | Must |
| 默认模式 | 未指定 mode 时默认使用 personal | Must |
| .gitignore 自动维护 | daemon 自动在 `.specforge/.gitignore` 中添加 `runtime/` 排除规则 | Must |
| daemon.json 新路径 | 项目清单正确读写 `~/.config/opencode/daemon.json` | Must |
| daemon.json 旧路径兼容 | 新路径不存在时回退读取 `~/.specforge/daemon.json` | Should |
| CLI init 创建目录 | `sf init` 在 personal 模式下创建 `.specforge/` 完整目录结构 | Must |
| CLI doctor 检查 | `sf doctor` 检查 personal 模式目录结构健康状态 | Should |
| 模式切换数据迁移 | 从 enterprise 切换到 personal 时提示用户数据迁移 | Could |
| ALL_STATES 完备性 | 新增自动化测试遍历所有 8 种工作流转换表，验证每个引用状态都在 ALL_STATES 中 | Must |

#### B 层：事件处理

| 测试用例 | 验证目标 | 优先级 |
|---------|---------|--------|
| register 端点 | `POST /api/v1/ingest/register { projectPath }` 返回 sessionId | Must |
| register 重复注册 | 同一 projectPath 重复注册返回已有 sessionId（幂等） | Must |
| ingest tool.invoking | 工具调用前事件触发 PermissionEngine 评估 | Must |
| ingest tool.invoked | 工具调用后事件被 EventLogger 记录 | Must |
| ingest opencode.event | session.created/idle/error 事件触发 SessionRegistry 状态变更 | Must |
| ingest session.compacting | 会话压缩事件触发 RecoverySubsystem.saveCheckpoint() | Must |
| ingest chat.params/headers | LLM 参数和请求头被 EventLogger 记录 | Should |
| shell.env hook | `shell.env` hook 正确注入 SPECFORGE_* 环境变量 | Must |
| 未知事件类型 | 收到未识别的事件类型时返回 400 或记录 WARNING | Should |
| 向后兼容：无 sessionId | 插件发送不带 sessionId 的事件时 daemon 仍可处理（降级模式） | Must |

### 3.3 集成测试范围

| 测试场景 | 覆盖层级 | 优先级 |
|---------|---------|--------|
| personal 模式端到端 | 插件→daemon→EventLogger 完整链路，数据写入 `.specforge/runtime/` | Must |
| enterprise 模式端到端 | 插件→daemon→EventLogger 完整链路，数据写入 `~/.specforge/projects/` | Must |
| 多项目并行 | 两个不同项目同时使用 personal 和 enterprise 模式 | Should |
| daemon 崩溃恢复 | personal 模式下 daemon 崩溃后重启，WAL 重建状态正确 | Must |
| 插件重连后注册 | daemon 重启后插件重连并重新 register，sessionId 正确绑定 | Must |
| PermissionEngine 集成 | tool.invoking 事件→PermissionEngine 评估→允许/拒绝 完整流程 | Should |

### 3.4 手动验证步骤

1. **personal 模式验证**：
   - 在一个干净项目中运行 `sf init`，验证 `.specforge/` 目录结构创建正确
   - 启动 daemon 并触发一次 agent 执行
   - 检查 `.specforge/runtime/events.jsonl` 和 `.specforge/runtime/state.json` 是否存在且有内容
   - 验证 `.specforge/.gitignore` 包含 `runtime/` 排除规则

2. **daemon.json 迁移验证**：
   - 在 enterprise 模式下注册一个项目
   - 检查 `~/.config/opencode/daemon.json` 是否包含该项目路径
   - 重启 daemon 后验证项目自动恢复

3. **事件处理验证**：
   - 启动 daemon 和 OpenCode
   - 触发一次工具调用，验证 `tool.invoking` 和 `tool.invoked` 事件被正确处理
   - 检查 EventLogger 日志中是否包含相应事件记录

4. **shell.env 验证**：
   - 在 OpenCode 会话中执行 shell 命令
   - 检查环境变量中是否包含 `SPECFORGE_DAEMON_PORT` 等注入变量

---

## KG 关联

### 4.1 已有需求节点（跨 WI 引用）

| 节点 ID | 标签 | 来源 WI | 关联说明 |
|---------|------|---------|---------|
| `WI-033:requirement:1` | ALL_STATES 状态完备性 | WI-033 | WI-031 的 ALL_STATES 修改直接影响此需求：需确保 ALL_STATES 包含本次变更涉及的全部状态。如果 WI-031 新增了任何工作流状态（虽然当前未见需要新增），必须同步更新 ALL_STATES |
| `WI-033:requirement:2` | 状态验证覆盖全部工作流 | WI-033 | 与 WI-031 的 StateManager 状态校验相关：WI-031 对 ALL_STATES 的修改会影响所有 8 种工作流的状态校验覆盖范围 |

### 4.2 已知的设计节点

> 以下为建议同步到 KG 的设计决策节点：

| 建议节点 ID | 设计决策 | 关联需求 |
|------------|---------|---------|
| `WI-031:design:mode_config` | mode 配置（personal/enterprise）的设计方案和默认值选择 | A 层所有需求 |
| `WI-031:design:storage_layout` | personal 模式下的 `.specforge/` 目录布局设计 | A 层路径重构 |
| `WI-031:design:ingest_router` | ingest 事件类型→子系统路由表设计 | B 层事件处理 |
| `WI-031:design:plugin_session_binding` | 插件 sessionId ↔ projectPath 绑定方案 | B 层注册端点 |
| `WI-031:design:backward_compat` | 向后兼容策略（旧插件/旧事件格式） | A+B 集成 |

### 4.3 受影响的模块节点

以下为 WI-001 中已通过 Task 建立的模块节点，本次变更将修改这些模块：

| 节点 ID | 模块 | WI-001 Task | 变更影响 |
|---------|------|------------|---------|
| `WI-001:task:1` | Daemon HTTP Server 基础框架 | Task 1 | 新增 ingest/register 端点、事件处理逻辑 |
| `WI-001:task:2` | State Manager（WAL + state.json 派生） | Task 2 | 路径切换、ALL_STATES 校验 |
| `WI-001:task:3` | Recovery 子系统 | Task 3 | 路径切换、新增 saveCheckpoint() |
| `WI-001:task:4` | Multi-project Manager | Task 4 | 路径切换、daemon.json 读写 |
| `WI-001:task:5` | Session Registry | Task 5 | OpenCode 事件映射、projectPath 绑定 |
| `WI-001:task:9` | Daemon 启动/关闭/握手 | Task 9 | 路径适配、mode 配置初始化 |
| `WI-001:task:18` | Permission.evaluated 事件 | Task 18 | 接入 tool.invoking 流程 |
| `WI-001:task:39` | Thin Plugin 实现（<5KB） | Task 39 | projectPath 传递、register 逻辑、shell.env |

### 4.4 建议新增的 KG 节点

| 建议节点 ID | 类型 | 标签 | 来源文件 |
|------------|------|------|---------|
| `WI-031:requirement:mode_config` | requirement | mode 配置支持 personal 和 enterprise 两种模式 | impact_analysis.md |
| `WI-031:requirement:personal_layout` | requirement | personal 模式下 .specforge/ 目录布局 | impact_analysis.md |
| `WI-031:requirement:daemon_json_migration` | requirement | daemon.json 从 ~/.specforge/ 迁移到 ~/.config/opencode/ | impact_analysis.md |
| `WI-031:requirement:all_states_completeness` | requirement | ALL_STATES 与转换表交叉一致性 | impact_analysis.md |
| `WI-031:requirement:ingest_register` | requirement | POST /api/v1/ingest/register 端点 | impact_analysis.md |
| `WI-031:requirement:ingest_event_routing` | requirement | ingest 事件类型→子系统路由 | impact_analysis.md |
| `WI-031:requirement:shell_env_hook` | requirement | 插件注册 shell.env hook | impact_analysis.md |
| `WI-031:requirement:project_path_in_events` | requirement | 每个事件附带 projectPath/sessionId | impact_analysis.md |
| `WI-031:requirement:backward_compat` | requirement | 向后兼容旧插件和旧事件格式 | impact_analysis.md |

### 4.5 建议新增的跨 WI 边（edges）

| 源节点 | 目标节点 | 边类型 | 说明 |
|--------|---------|--------|------|
| `WI-031:requirement:all_states_completeness` | `WI-033:requirement:1` | `traces_to` | ALL_STATES 完备性需求追溯 |
| `WI-031:requirement:all_states_completeness` | `WI-033:requirement:2` | `traces_to` | 状态验证覆盖全部工作流 |
| `WI-031:requirement:ingest_event_routing` | `WI-001:task:18` | `modifies` | 修改 Permission.evaluated 事件的触发路径 |

---

*本文档由 sf-requirements Agent 在 impact_analysis 阶段生成。*
