# 需求文档 — SpecForge V3.5（统一 Plugin 架构重构）

## 简介

SpecForge V3.5 统一 Plugin 架构重构。将当前 5 个独立 Plugin（sf_checkpoint、sf_cost_tracker、sf_event_logger、sf_permission_guard、sf_session_recorder）合并为 1 个统一的 SpecForge Plugin（`sf_specforge.ts`），同时简化 CLI 安装器（`sf-installer.ts`）为纯用户级操作工具，并将项目级运行时初始化完全自动化到 Plugin 中。

核心变更：
- CLI 仅负责用户级共享组件的 install/upgrade/verify/uninstall
- Plugin 在 OpenCode 启动时自动检测并初始化项目运行时（需满足启用条件）
- 删除所有旧格式（V3.3 LegacyManifest）兼容代码和已废弃参数

## 术语表

- **Unified_Plugin**: 合并后的单一 SpecForge Plugin 入口文件（`sf_specforge.ts`），允许引用内部 lib 模块；对外只部署/注册一个 Plugin
- **CLI_Installer**: 安装器脚本（`scripts/sf-installer.ts`），仅负责用户级共享组件管理
- **User_Level_Directory**: 用户级共享组件目录，所有平台统一为 `~/.config/opencode/`（`~` 在 Windows 下解析为 `%USERPROFILE%`）
- **Project_Runtime**: 项目级运行时数据目录（`specforge/`），包含 state.json、config/、sessions/、archive/、knowledge/、logs/、specs/
- **Shared_Components**: 部署到 User_Level_Directory 的共享文件，包括 9 Agent、16 Tool + 18 lib、12 Skill、1 Plugin
- **SHARED_COMPONENT_REGISTRY**: 安装器中定义的用户级共享组件文件清单（替代旧版 FILE_REGISTRY），仅包含用户级文件，不包含项目级 runtime 文件
- **Runtime_Manifest**: 项目级 Manifest 文件（`specforge/manifest.json`），记录 runtime_schema_version 和兼容性信息
- **User_Manifest**: 用户级 Manifest 文件（`~/.config/opencode/specforge-manifest.json`），记录共享组件版本、文件校验和（SHA-256）、组件类型
- **specforge_version**: SpecForge 共享组件版本号（来自 package.json 的 version 字段）
- **runtime_schema_version**: 项目运行时数据结构版本号，独立于 specforge_version 演进
- **Runtime_Migration**: 项目运行时升级操作，包括 config field supplement、目录补齐、manifest 升级、schema migration
- **OpenCode_Startup**: OpenCode 应用启动时触发 Plugin 初始化的时机
- **Merge_Write**: 对 opencode.json 的合并式写入策略，仅操作 sf-* Agent 条目和 plugin 注册，保留用户其他配置

### OpenCode 组件注册机制

| 组件类型 | 注册方式 | 说明 |
|----------|----------|------|
| Agent | opencode.json `agent` 对象显式注册 | 每个 Agent 需要 mode、model、prompt、permission 字段 |
| Tool | `tools/` 目录文件系统自动发现 | 放入 tools/ 目录即可，无需配置 |
| Skill | `skills/` 目录文件系统自动发现 | 放入 skills/{name}/SKILL.md 即可 |
| Plugin | opencode.json `plugin` 数组显式注册 | 需要在 plugin 数组中添加路径 |

---

## 需求

---

### 需求 1：CLI 简化为纯用户级操作

**用户故事：** 作为 SpecForge 用户，我希望 CLI 安装器只负责用户级共享组件管理，以便安装流程更简单，项目级操作完全自动化。

#### 验收标准

1. CLI_Installer 应当仅支持四个子命令：`install`、`upgrade`、`verify`、`uninstall`
2. 当执行 `install` 子命令时，CLI_Installer 应当将 Shared_Components 部署到 User_Level_Directory，写入 User_Manifest，并在 opencode.json 中注册 sf-* Agent 和 Plugin
3. 当执行 `upgrade` 子命令时，CLI_Installer 应当采用原子升级策略：先写入临时目录，校验成功后切换；升级前备份 User_Manifest；失败时自动回滚到备份状态
4. 当执行 `verify` 子命令时，CLI_Installer 应当通过比对文件 SHA-256 校验和与 User_Manifest 来验证 Shared_Components 完整性；若检测到 `.specforge.lock` 存在，应当提示"安装正在进行，校验结果可能不准确"
5. 当执行 `uninstall` 子命令时，CLI_Installer 应当仅删除 User_Manifest 中记录且校验归属 SpecForge 的文件；对于未在 Manifest 中记录的 sf-* 文件，仅输出提示信息，不自动删除
6. CLI_Installer 不应当接受 `--target`、`--project-level` 或 `--runtime-only` 参数
7. 当提供已移除的参数时，CLI_Installer 应当输出错误信息，说明该参数已不再支持
8. CLI_Installer 不应当包含任何 LegacyManifest（V3.3 格式）兼容代码
9. CLI_Installer 在写入 User_Level_Directory 中的 opencode.json 时应当使用 Merge_Write 策略，写入前创建 `.bak.<timestamp>` 备份
10. install/upgrade 完成后，CLI_Installer 应当显示提示："需要重启 OpenCode 才能加载新版 Plugin"
11. CLI_Installer 应当定义以下错误码，每个错误码对应固定的退出码和建议修复方法：E_INVALID_JSON（12）、E_LOCK_TIMEOUT（14）、E_CHECKSUM_MISMATCH（15）、E_PERMISSION_DENIED（10）、E_DISK_FULL（11）

---

### 需求 2：5 个 Plugin 合并为统一 Plugin

**用户故事：** 作为 SpecForge 开发者，我希望所有 Plugin 功能整合到单一入口中，以便维护更简单，Plugin 能协调跨切面关注点。

#### 验收标准

1. `sf_specforge.ts` 是唯一 Plugin 入口文件，允许引用内部 lib 模块（如 `tools/lib/` 下的文件）；对外只部署/注册一个 Plugin
2. Unified_Plugin 应当包含所有检查点功能：会话压缩上下文注入、状态快照、恢复摘要生成、对话快照保存
3. Unified_Plugin 应当包含所有成本追踪功能：从 StepFinishPart 和 assistant 消息中提取 cost/tokens，写入 cost.jsonl；若标准字段缺失，写入 `unknown`，不得抛异常阻断 Plugin
4. Unified_Plugin 应当包含所有事件日志功能：工具执行追踪、Agent 调度追踪、会话事件记录到 trace.jsonl 和 tool_calls.jsonl
5. Unified_Plugin 应当包含所有权限守卫功能：文件编辑权限检查、工具调用权限检查、守卫日志记录
6. Unified_Plugin 应当包含所有会话记录功能：task 工具完成时保存子会话、session.idle 时保存主会话
7. Unified_Plugin 应当导出单一命名导出 `sf_specforge`，符合 OpenCode Plugin 接口
8. Plugin 内部 hook 执行顺序应当固定：权限守卫 → 事件日志 → 成本追踪 → 会话记录 → 检查点
9. 每个子模块失败必须隔离记录（写入 error.log），不得阻断其他非依赖模块的执行；权限守卫拒绝操作除外（该场景应阻断后续执行）
10. 当 Unified_Plugin 被部署时，CLI_Installer 应当部署恰好一个 Plugin 文件（`plugins/sf_specforge.ts`）而非五个独立文件

---

### 需求 3：Plugin 自动初始化项目运行时

**用户故事：** 作为 SpecForge 用户，我希望 Plugin 在我打开 OpenCode 进入新项目时自动初始化项目运行时，以便我永远不需要手动执行项目级安装命令。

#### 启用条件

自动初始化仅在以下条件全部满足时执行：
- 用户级 SpecForge 已安装（`specforge-manifest.json` 存在于 User_Level_Directory）
- 环境变量 `SPECFORGE_AUTO_INIT` 未设置为 `false`
- 项目根目录不是用户 home 目录、系统目录或 `~/.config/opencode` 本身

#### 项目根目录检测规则

优先使用 Git 仓库根目录（通过查找 `.git` 目录）；若不在 Git 仓库中，使用当前工作目录。可通过 `SPECFORGE_PROJECT_ROOT` 环境变量覆盖。

#### 验收标准

1. 当 OpenCode 启动且满足启用条件且项目根目录中不存在 `specforge/` 目录时，Unified_Plugin 应当执行 initialize 流程：创建完整的 Project_Runtime 目录结构
2. 当执行 initialize 时，Unified_Plugin 应当创建以下子目录：`specforge/runtime/checkpoints`、`specforge/sessions`、`specforge/archive/agent_runs`、`specforge/specs`、`specforge/knowledge`、`specforge/logs`、`specforge/config`、`specforge/agents/contracts`
3. 当执行 initialize 时，Unified_Plugin 应当创建初始文件：`specforge/runtime/state.json`、`specforge/runtime/events.jsonl`、`specforge/config/project.json`、`specforge/config/risk_policy.json`、`specforge/config/skill_fragments.json`
4. 当执行 initialize 时，若项目根目录已存在 `AGENTS.md`，Unified_Plugin 不应当覆盖；应当创建 `AGENTS.specforge.md` 作为 SpecForge 项目规则文件，并在 `specforge/logs/app.log` 中提示用户可手动在 AGENTS.md 中引用。若 `AGENTS.md` 不存在，则直接创建包含 SpecForge 规则的 `AGENTS.md`
5. 当执行 initialize 时，Unified_Plugin 应当部署 `specforge/agents/AGENT_CONSTITUTION.md` 及所有 Agent 契约文件
6. 当执行 initialize 时，Unified_Plugin 应当写入 Runtime_Manifest，记录初始化时间戳和 runtime_schema_version
7. 当 `specforge/` 目录存在但部分必需文件/目录缺失时（半初始化状态），Unified_Plugin 应当执行 repair 流程：补齐缺失的目录和文件，不覆盖已有文件，修复行为记录到 `specforge/logs/app.log`
8. 初始化或修复过程中的任何异常不得导致 OpenCode 崩溃；必须降级为记录错误到 stderr 和 `specforge/logs/error.log`，然后继续正常 Plugin 事件处理
9. Unified_Plugin 应当在不需要任何用户交互的情况下完成项目运行时初始化

---

### 需求 4：Plugin 版本兼容性检查与运行时迁移

**用户故事：** 作为 SpecForge 用户，我希望 Plugin 自动检测版本不匹配并处理升级，以便我的项目运行时始终与共享组件兼容。

#### 版本模型

- `specforge_version`：共享组件版本（来自 User_Manifest 的 `shared_version` 字段）
- `runtime_schema_version`：项目运行时数据结构版本（记录在 Runtime_Manifest 中）
- 兼容性判断：Runtime_Manifest 中的 `required_shared_version_range` 定义项目要求的共享组件版本范围

#### 验收标准

1. 当 OpenCode 启动且 `specforge/` 目录存在时，Unified_Plugin 应当读取 Runtime_Manifest 并将 `required_shared_version_range` 与当前 specforge_version 进行比对
2. 如果 specforge_version 不满足 `required_shared_version_range`，则 Unified_Plugin 应当进入**安全降级模式**：将警告记录到 `specforge/logs/error.log` 和 stderr；仅允许 error logging 模块运行；禁止写入 runtime 状态（state.json）、checkpoint、session archive、cost.jsonl，直到用户升级共享组件
3. 迁移触发条件：当 Runtime_Manifest 中的 `runtime_schema_version` 小于 Plugin 内置的 `CURRENT_RUNTIME_SCHEMA_VERSION` 常量时，执行 Runtime_Migration。迁移路径由 `MIGRATIONS[from_version → to_version]` 注册表决定，不使用 specforge_version 间接比较
4. Runtime_Migration 应当支持：配置字段补充（新字段加默认值，不改已有值）、目录补齐、manifest 字段升级、schema migration
5. Runtime_Migration 完成后，Unified_Plugin 应当更新 Runtime_Manifest 的 `updated_at` 时间戳和 `runtime_schema_version` 字段
6. 如果 Runtime_Manifest 文件缺失或 JSON 损坏，Unified_Plugin 应当：先备份损坏文件（若存在）；根据现有目录和配置推断当前 schema 版本；无法推断时标记 `recovery_required`，只做安全补齐，不直接升级到最新版本；记录恢复操作到 app.log
7. 版本检查和迁移过程中的任何异常不得导致 OpenCode 崩溃；必须降级为记录错误并进入安全降级模式
8. 版本不兼容的输出渠道为 stderr 和 `specforge/logs/error.log`（不依赖 OpenCode UI API）

---

### 需求 5：路径统一

**用户故事：** 作为任何平台上的 SpecForge 用户，我希望用户级目录路径一致，以便文档和脚本在所有操作系统上行为相同。

#### 验收标准

1. 默认 User_Level_Directory 在所有平台（包括 Windows）上统一为 `~/.config/opencode/`；`~` 在 Windows 下解析为 `%USERPROFILE%`（即 `C:\Users\<username>\.config\opencode\`）
2. 若设置了 `OPENCODE_CONFIG_DIR` 环境变量，以环境变量为最高优先级，覆盖默认路径
3. CLI_Installer 和 Unified_Plugin 应当使用相同的路径解析逻辑
4. 所有内部存储使用平台原生路径（native path）；User_Manifest 中记录的文件路径使用 POSIX 风格相对路径（`/` 分隔符）

---

### 需求 6：opencode.json 合并式写入

**用户故事：** 作为有自定义 OpenCode 配置的 SpecForge 用户，我希望安装器只修改 opencode.json 中 SpecForge 相关的条目，以便我的其他配置被保留。

#### opencode.json 目标结构

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": "allow",
  "agent": {
    "sf-orchestrator": { "mode": "primary", "model": "...", "prompt": "...", "permission": {...} },
    "sf-requirements": { ... },
    ...
  },
  "plugin": [
    "plugins/sf_specforge.ts"
  ]
}
```

- `agent` 对象：由 CLI_Installer 管理 sf-* 条目
- `plugin` 数组：由 CLI_Installer 管理 `plugins/sf_specforge.ts` 条目
- Tool 和 Skill：由文件系统自动发现（`tools/`、`skills/` 目录），无需配置注册

#### 验收标准

1. 写入 opencode.json 时，CLI_Installer 应当仅添加、更新或删除 `agent` 对象中 `sf-` 前缀的条目
2. 写入 opencode.json 时，CLI_Installer 应当确保 `plugin` 数组中包含 `plugins/sf_specforge.ts`（install 时添加，uninstall 时移除）
3. 写入 opencode.json 时，CLI_Installer 应当保持所有非 sf-* 的 agent 条目、非 SpecForge 的 plugin 条目、以及其他顶层键（`$schema`、`permission`、自定义键）不变
4. 如果 opencode.json 不存在，CLI_Installer 应当创建最小可运行配置：包含 `$schema`、sf-* Agent 注册、Plugin 注册
5. 如果 opencode.json 包含无效 JSON，CLI_Installer 应当报告错误（E_INVALID_JSON）并中止，不修改文件
6. 写入 opencode.json 前，CLI_Installer 应当创建 `.backup/opencode.json.bak.<YYYYMMDD-HHMMSS>` 备份

---

### 需求 7：旧代码清除

**用户故事：** 作为 SpecForge 维护者，我希望所有已废弃的 V3.3 兼容代码被移除，以便代码库干净可维护。

#### 验收标准

1. CLI_Installer 生产代码不应当包含 `LegacyManifest` 接口或任何读写 V3.3 manifest 格式的代码（测试和文档中可出现）
2. CLI_Installer 生产代码不应当包含 `--project-level` 参数处理代码
3. CLI_Installer 生产代码不应当包含 `--runtime-only` 参数处理代码
4. CLI_Installer 生产代码不应当包含 `--target` 参数处理代码
5. CLI_Installer 生产代码不应当包含 `cmdInstallProjectLevel` 函数或项目级文件部署逻辑
6. CLI_Installer 生产代码不应当包含 `cmdInstallRuntimeOnly` 函数
7. CLI_Installer 应当使用 `SHARED_COMPONENT_REGISTRY`（仅包含用户级共享组件文件清单）替代旧版 `FILE_REGISTRY`
8. Shared_Components 部署应当包含恰好一个 Plugin 文件（`sf_specforge.ts`）而非五个独立 Plugin 文件

---

### 需求 8：用户体验流程

**用户故事：** 作为新的 SpecForge 用户，我希望安装流程极简，以便我能快速在任何项目中开始使用 SpecForge。

#### 验收标准

1. 当用户首次执行 `bun scripts/sf-installer.ts install` 时，CLI_Installer 应当在单次命令执行中将所有 Shared_Components 部署到 User_Level_Directory
2. 当用户在共享组件安装后打开一个没有 `specforge/` 目录的项目时（且满足需求 3 的启用条件），Unified_Plugin 应当自动初始化项目运行时，无需任何额外用户操作
3. 当用户执行 `bun scripts/sf-installer.ts upgrade` 时，CLI_Installer 应当更新 Shared_Components，Unified_Plugin 应当在下次 OpenCode 启动时处理项目级 Runtime_Migration
4. CLI_Installer 在 install 或 upgrade 完成后应当显示成功摘要：已部署的 Shared_Components 文件数量（不含 manifest 和 opencode.json）、User_Level_Directory 路径、"需要重启 OpenCode 才能加载新版 Plugin"提示
5. CLI_Installer 在任何操作失败时应当显示错误码、错误描述和建议修复方法

---

### 需求 9：安装锁机制

**用户故事：** 作为有多个项目的用户，我希望并发的 install/upgrade 操作被串行化，以便共享组件不会因竞争条件而损坏。

#### 验收标准

1. 当执行 `install` 或 `upgrade` 子命令时，CLI_Installer 应当在修改共享组件前获取安装锁 `{User_Level_Directory}/.specforge.lock`
2. 锁获取应当使用原子创建（`writeFile` 带 `flag: "wx"` 排他创建）；锁文件内容为 JSON：`{ pid, hostname, command, created_at, last_heartbeat }`
3. 持锁进程应当每 5 秒刷新锁文件的 `last_heartbeat` 字段
4. 如果安装锁被其他进程持有且 `last_heartbeat` 在 10 分钟内，CLI_Installer 应当最多等待 30 秒（每 1 秒重试）
5. 如果安装锁等待超过 30 秒，CLI_Installer 应当报告超时错误（E_LOCK_TIMEOUT）并显示锁元数据：PID、hostname、command、created_at、last_heartbeat
6. 如果锁文件存在但 `last_heartbeat` 超过 10 分钟无更新，视为 stale 锁，强制接管
7. 当执行 `verify` 子命令时，CLI_Installer 不应当获取安装锁，但应当检测锁是否存在并提示"安装正在进行，校验结果可能不准确"
8. 当执行 `uninstall` 子命令时，CLI_Installer 应当在删除文件前获取安装锁
9. 锁释放时应当校验所有权（pid + hostname 匹配才删除），防止误删其他进程的锁

---

### 需求 10：Plugin 初始化幂等性

**用户故事：** 作为 SpecForge 用户，我希望 Plugin 启动可以安全地重复运行，以便重启 OpenCode 永远不会导致数据丢失或损坏。

#### Plugin 启动流程分类

| 流程 | 触发条件 | 行为 |
|------|----------|------|
| initialize | `specforge/` 不存在 | 创建完整目录结构和初始文件 |
| repair | `specforge/` 存在但部分必需文件/目录缺失 | 补齐缺失项，不覆盖已有文件 |
| migrate | `specforge/` 存在且 manifest 有效，但 schema 版本旧 | 执行 Runtime_Migration |
| skip | `specforge/` 存在且 manifest 有效且 schema 最新 | 跳过创建/迁移/修复，直接注册事件处理器 |

#### 验收标准

1. 当 OpenCode 启动且 `specforge/` 目录已存在并有有效的 Runtime_Manifest 且 schema 为最新版本时，Unified_Plugin 应当跳过 initialize/repair/migrate，直接注册事件处理器进入正常 Plugin 功能
2. 当 OpenCode 启动且 `specforge/` 目录已存在时，Unified_Plugin 不应当重新创建或覆盖已有的运行时文件（state.json、events.jsonl、config/*.json 等）
3. 执行 repair 或 migrate 时，Unified_Plugin 不应当修改配置文件中已有字段的值
4. Unified_Plugin 应当将启动流程类型（initialize/repair/migrate/skip）和具体操作记录到 `specforge/logs/app.log` 以便审计
5. 无论执行哪种启动流程，Unified_Plugin 都应当在完成后注册事件处理器；但若处于安全降级模式（版本不兼容），则仅注册 error logging 处理器，不注册 checkpoint/cost/session 等写入型处理器

---

### 需求 11：非功能需求

**用户故事：** 作为 SpecForge 维护者，我希望系统有明确的技术约束和质量要求。

#### 验收标准

1. CLI_Installer 不得引入外部 npm 依赖；只能使用 Bun runtime 和 Node.js 标准库兼容 API（node:fs、node:path、node:crypto、node:os）
2. 修改用户已有文件（opencode.json、AGENTS.md、manifest）前，必须创建 `.bak.<timestamp>` 备份；失败时恢复到备份状态
3. 新增以下测试类型覆盖：单元测试（各模块函数）、集成测试（install→verify→upgrade 流程）、跨平台路径测试、opencode.json merge 测试、锁并发测试、Plugin 启动幂等测试、旧 Plugin 行为回归测试
4. User_Manifest 结构应当包含：`schema_version`、`shared_version`（specforge_version）、`install_mode: "user_level"`、`installed_at`、`updated_at`、`managed_agents`（Agent 名称列表）、`managed_agent_hashes`（Agent 配置 SHA-256）、`files`（Record<path, {sha256, size, type}>），其中 type 为 `agent | tool | tool_lib | skill | plugin`
5. checksum 算法统一为 SHA-256
