# Intake: Daemon 存储架构重构

## 变更背景
当前 daemon（daemon-core）采用分层存储模型：
- 规格文档 → 项目目录 `project/.specforge/specs/`
- 运行时状态 → 用户目录 `~/.specforge/projects/<id>/`

经讨论确认，**个人用户场景下**全放项目目录是更优方案（简单优先、Git 问题由 daemon 自动维护 .gitignore 解决）。

## 变更目标

### 1. 默认模式改为 project-local（全放项目目录）
```
project/
└── .specforge/
    ├── .gitignore          ← daemon 自动维护
    ├── specs/              ← 进 Git（不变）
    ├── config/             ← 进 Git（不变）
    ├── archive/            ← 进 Git（不变）
    └── runtime/            ← .gitignore 排除（新增）
        ├── state.json
        ├── events.jsonl
        └── sessions/
```

### 2. 保留 mode 开关
- `personal`（默认）：全放项目目录
- `enterprise`：分层模型（项目目录 + `~/.specforge/projects/`）

### 3. daemon.json 移至 opencode 配置目录
- 从 `~/.specforge/daemon.json` → `~/.config/opencode/daemon.json`
- 内容极简：仅项目路径清单 + last_active

### 4. 确保 v6.0 所有功能迁移
原 v6.0 插件中实现的功能必须在 daemon 中完整覆盖。

## 受影响模块
- `packages/daemon-core/src/daemon/Daemon.ts` — 存储路径配置
- `packages/daemon-core/src/project/ProjectManager.ts` — 项目注册逻辑
- `packages/daemon-core/src/state/StateManager.ts` — state.json 路径
- `packages/daemon-core/src/session/SessionRegistry.ts` — 会话存储路径
- `packages/daemon-core/src/wal/WAL.ts` — events.jsonl 路径
- `packages/daemon-core/src/recovery/RecoverySubsystem.ts` — checkpoints 路径
- `packages/cli/src/` — CLI 命令（init、doctor 等）
- `packages/configuration/` — mode 配置项解析
- `packages/migration/` — schema 版本升级（可能需要适配）

## v6.0 功能对照清单

| v6.0 插件功能 | daemon 对应 | 是否已有 | 需适配 |
|---|---|---|---|
| Session 生命周期记录 | SessionRegistry | ✅ 有 | 存储路径 |
| 事件日志 (EventLogger) | EventBus → EventLogger | ✅ 有 | 存储路径 |
| 权限管理 | PermissionEngine | ✅ 有 | — |
| 工具参数拦截 (tool.execute.before) | ToolDispatcher | ✅ 有 | — |
| 工具结果后处理 (tool.execute.after) | ToolDispatcher | ✅ 有 | — |
| Shell 环境注入 (shell.env) | sf_safe_bash | ✅ 有 | — |
| 会话续接 (compaction hooks) | RecoverySubsystem | ✅ 有 | 存储路径 |
| Work Item 状态管理 | StateManager + WAL | ✅ 有 | 存储路径 |
| Knowledge Graph | KG 子系统 | ✅ 有 | — |
| Gate 检查 | Gate tools | ✅ 有 | — |
| Skill 加载 | SkillRegistry | ✅ 有 | — |
| 扩展/插件加载 | ExtensionLoader | ✅ 有 | — |
| Agent 间通信 (Event Bus) | EventBus | ✅ 有 | — |
| 自定义 tool 注册 | ToolRegistry | ✅ 有 | — |
| 成本追踪 | sf_cost_report | ✅ 有 | — |
| 文档 lint | sf_doc_lint | ✅ 有 | — |

## 期望结果
1. 默认 personal 模式下，daemon 所有数据写入项目 `.specforge/` 目录
2. `.specforge/.gitignore` 由 daemon 自动维护
3. `~/.config/opencode/daemon.json` 仅存项目路径索引
4. enterprise 模式保持当前分层行为不变
5. 所有 v6.0 功能在两种模式下均正常工作
