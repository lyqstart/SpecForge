# Intake: Daemon 存储架构重构 + 事件处理实现

## 变更背景

当前 daemon 存在两个层面的问题：

### 存储层
分层存储模型（项目目录 + `~/.specforge/projects/`）在个人场景下不必要地复杂。经讨论确认：个人用户优先简单、Git 干净度由 daemon 自动维护 `.gitignore` 解决。

### 事件处理层
插件（`.opencode/plugins/sf_specforge.ts`）只转发事件到 daemon，daemon 的 `/api/v1/ingest/event` 端点只返回 200 不做任何处理。v6.0 原插件的实际功能（权限拦截、参数修改、事件路由到子系统等）在 daemon 侧全部缺失。

## 变更目标

### A 层：存储路径重构
1. **新增 `mode` 配置**：`personal`（默认）全放项目目录；`enterprise` 分层模型
2. **personal 模式布局**：
   ```
   project/.specforge/
   ├── .gitignore          ← daemon 自动维护
   ├── specs/              ← 进 Git
   ├── config/             ← 进 Git
   ├── archive/            ← 进 Git
   └── runtime/            ← .gitignore 排除
       ├── state.json
       ├── events.jsonl
       └── sessions/
   ```
3. **daemon.json 迁移**：`~/.specforge/daemon.json` → `~/.config/opencode/daemon.json`（仅存项目路径清单）
4. **状态机修复**：`ALL_STATES` 补充 change_request/bugfix/refactor 等工作流专用状态

### B 层：daemon 事件处理实现
1. **插件增强**：每个事件附带 `projectPath`（从 `PluginInput.directory` 获取）
2. **注册端点**：`POST /api/v1/ingest/register` — 插件启动时注册项目，建立 sessionId ↔ projectPath 绑定
3. **ingest 处理**：`POST /api/v1/ingest/event` 解析事件类型，路由到对应子系统：
   - `tool.invoking` → PermissionEngine + SessionRegistry
   - `tool.invoked` → EventLogger
   - `opencode.event` → 按 session.created/idle/error 等路由到 SessionRegistry
   - `session.compacting` → RecoverySubsystem.saveCheckpoint()
   - `chat.params/headers` → EventLogger
4. **插件补注册 `shell.env` hook**

## v6.0 功能覆盖（更新后）

| v6.0 原插件行为 | 当前状态 | 本次实现 |
|---|---|---|
| `tool.execute.before`：修改 args、权限拦截 | 仅转发事件名 | ✅ 解析事件 → PermissionEngine → 可修改 args |
| `tool.execute.after`：修改 output、记录结果 | 仅转发事件名 | ✅ 解析事件 → EventLogger |
| `event`：路由 opencode 事件 | 仅转发事件名 | ✅ 解析事件类型 → SessionRegistry |
| `session.compacting`：触发作续接 | 仅转发事件名 | ✅ RecoverySubsystem.saveCheckpoint() |
| `chat.params/headers`：记录 LLM 参数 | 仅转发事件名 | ✅ EventLogger |
| `shell.env`：注入环境变量 | 未注册 | ✅ 插件注册 + daemon 处理 |

## 受影响模块

### A 层
- `daemon-core`: Daemon.ts, DaemonConfig, ProjectManager, StateManager, SessionRegistry, WAL, RecoverySubsystem
- `cli`: init/doctor 命令
- `configuration`: mode 配置解析
- `state_machine.ts`: ALL_STATES 补充

### B 层
- `.opencode/plugins/sf_specforge.ts`：添加 projectPath、注册逻辑、shell.env hook
- `daemon-core/HTTPServer.ts`：实现 `/api/v1/ingest/register` 和 `/api/v1/ingest/event` 处理逻辑
- `daemon-core/SessionRegistry.ts`：事件驱动状态变更
- `daemon-core/PermissionEngine`：接入 tool.invoking 流程
- `daemon-core/RecoverySubsystem`：接入 session.compacting 流程

## 项目路径传递方案

```
插件启动 → POST /api/v1/ingest/register { projectPath }
daemon → ProjectManager.registerProject() → 返回 sessionId
后续事件 → POST /api/v1/ingest/event { sessionId, type, data }
```
