# 需求文档 — SpecForge V3.4.0（用户级安装与迁移基础版）

## 简介

SpecForge V3.4.0 聚焦于**用户级安装基础能力**：将共享组件（Agent、Tool、Skill、Plugin）从项目级 `.opencode/` 迁移到用户级目录 `~/.config/opencode/`，实现一次安装、全局共享。项目级仅保留运行时数据目录 `specforge/`。

### 版本范围

**V3.4.0（本版本）包含：**
- 用户级目录结构定义
- install 命令改造
- opencode.json 合并式写入（含所有权判断）
- upgrade 命令改造
- verify 命令适配
- 版本兼容矩阵
- Manifest Schema 定义
- File_Registry 更新
- Windows/跨平台路径支持
- sf_doctor 工具适配
- 向后兼容与测试

**后续版本规划：**
- V3.4.1：项目级到用户级迁移（upgrade --to-user-level）、卸载命令重新定义（uninstall）
- V3.5：新工作流与状态机扩展（change_request、refactor、ops_task、investigation）
- V3.6：跨会话续接（checkpoint-first）

### 当前系统状态（V5.0 已合并）

- 9 个 Agent（1 primary sf-orchestrator + 8 subagent：sf-requirements、sf-design、sf-task-planner、sf-executor、sf-debugger、sf-reviewer、sf-verifier、sf-knowledge）
- 16 个 Custom Tool
- 5 个 Plugin
- 12 个 Skill
- 689 个单元测试

### V3.4.0 设计原则

1. **共享优先**：共享组件一次安装、全局生效，减少重复
2. **运行时隔离**：每个项目的运行时数据（状态、会话、归档、日志）完全隔离
3. **向后兼容**：支持 `--project-level` 兼容模式；拆为 CLI 兼容、文件布局兼容、工作流行为兼容、Agent 输出契约可向后兼容扩展（允许新增字段但不破坏旧字段）
4. **Manifest 驱动**：所有文件管理（安装、升级、验证）基于 Manifest/File_Registry，不依赖 sf-* 前缀删除
5. **原子写入与备份**：关键配置文件写入前备份，写入失败可回滚
6. **跨平台路径**：优先读取 OpenCode 实际配置目录；支持环境变量覆盖；fallback 到默认目录；所有路径通过 path API 归一化

所有变更必须保持与 V3.3 的向后兼容，689 个现有单元测试必须继续通过。

---

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 Agent、子 Agent、Skill、Tool、Plugin、权限等扩展机制
- **Orchestrator**：主 Agent（sf-orchestrator），负责项目管理、工作流推进、用户沟通和子 Agent 调度
- **Sub_Agent**：由 Orchestrator 调度的专业执行子 Agent，运行在独立 Session 中
- **User_Level_Directory**：用户级配置目录（默认 `~/.config/opencode/`），OpenCode 原生支持从此目录加载 Agent、Tool、Skill、Plugin。实际路径解析优先级：(a) 如设置 `OPENCODE_CONFIG_DIR` 环境变量，使用该目录（这是 OpenCode 原生支持的机制）；(b) 否则使用平台默认全局目录（Linux/macOS: `~/.config/opencode/`，Windows: `%APPDATA%/opencode/`）
- **Project_Level_Directory**：项目级配置目录 `.opencode/`，V3.3 兼容模式的安装目标目录
- **Runtime_Directory**：项目级运行时数据目录 `specforge/`，包含 state.json、sessions/、archive/、specs/、config/、knowledge/、logs/
- **Shared_Components**：安装到 User_Level_Directory 的共享组件，包括 Agent 定义文件、Custom Tool 文件、Skill 文件、Plugin 文件（不包括 opencode.json，opencode.json 为混合所有权文件，仅对 SpecForge 管理片段进行校验）
- **Installer**：SpecForge 统一安装器 CLI（`scripts/sf-installer.ts`），负责部署和管理 SpecForge 文件
- **Manifest**：安装清单文件，记录已部署文件的版本、校验和、schema_version。分为用户级 Manifest（`~/.config/opencode/specforge-manifest.json`）和项目级 Manifest（`specforge/manifest.json`）
- **File_Registry**：安装器中定义的 SpecForge 部署文件列表，分为 USER_LEVEL_REGISTRY 和 PROJECT_LEVEL_REGISTRY，用于 Manifest 驱动的文件管理
- **managed_agents**：用户级 Manifest 中记录的由 SpecForge 管理的 Agent 名称列表，用于 opencode.json 所有权判断
- **managed_agent_hashes**：用户级 Manifest 中记录的每个 SpecForge 管理 Agent 配置片段的 SHA-256 哈希（对该 Agent 的完整 JSON 对象计算），用于 opencode.json 局部校验
- **Install_Lock**：用户级安装锁文件（`{User_Level_Directory}/.specforge.lock`），用于串行化 install/upgrade/verify 对 User_Level_Directory 的写操作，防止多项目并发冲突
- **Version_Compatibility_Matrix**：版本兼容矩阵，项目 manifest 记录 required_shared_version_range 和 runtime_schema_version
- **assertCompatibility()**：统一兼容性检查函数，在运行时入口调用以确保共享组件版本与项目运行时版本兼容

---

## CLI 行为矩阵

| 命令 | 行为 |
|------|------|
| `install` | 用户级共享组件 + 当前项目 runtime（共享组件损坏时失败退出） |
| `install --target <path>` | 用户级共享组件 + 指定项目 runtime |
| `install --project-level [--target <path>]` | 完整项目级安装（V3.3 兼容模式） |
| `install --runtime-only` | 仅初始化当前项目 runtime，跳过共享组件检查（用于已知共享组件损坏但需急救项目运行时） |
| `upgrade` | 升级用户级共享组件 + 补充项目级新增配置项 |
| `upgrade --force` | 强制升级（覆盖用户修改过的文件） |
| `verify` | 校验用户级共享组件 + 项目级运行时完整性 |

禁止模糊组合（如 `install --project-level --global`、`install --runtime-only --project-level`），错误提示明确。

---

## 需求

---

### 需求 1：用户级目录结构定义

**用户故事：** 作为 SpecForge 用户，我希望 SpecForge 的共享组件安装到用户级目录，以便所有项目自动共享同一份 Agent、Tool、Skill、Plugin，无需重复安装。

#### 验收标准

1. THE Installer SHALL 将 Agent 定义文件部署到 `{User_Level_Directory}/agents/`（9 个 Agent 文件：sf-orchestrator.md、sf-requirements.md、sf-design.md、sf-task-planner.md、sf-executor.md、sf-debugger.md、sf-reviewer.md、sf-verifier.md、sf-knowledge.md）
2. THE Installer SHALL 将 Custom Tool 文件部署到 `{User_Level_Directory}/tools/`（16 个 Tool 文件及 `lib/` 子目录，含 18 个 lib 文件）
3. THE Installer SHALL 将 Skill 文件部署到 `{User_Level_Directory}/skills/`（12 个 Skill 目录）
4. THE Installer SHALL 将 Plugin 文件部署到 `{User_Level_Directory}/plugins/`（5 个 Plugin 文件）
5. THE Installer SHALL 将 `opencode.json` 配置文件部署到 `{User_Level_Directory}/opencode.json`，包含所有 sf-* Agent 的注册信息
6. THE Installer SHALL 在项目中仅初始化 Runtime_Directory（`specforge/`），包含以下子目录和文件：runtime/（state.json、events.jsonl、checkpoints/）、sessions/、archive/agent_runs/、specs/、config/（project.json、risk_policy.json、skill_fragments.json）、knowledge/、logs/
7. THE Installer SHALL 将 `AGENTS.md` 和 `specforge/agents/`（AGENT_CONSTITUTION.md、contracts/）部署到项目级目录，因为这些是项目特定的文档
8. THE User_Level_Directory 路径解析 SHALL 遵循以下规则：(a) 如设置 `OPENCODE_CONFIG_DIR` 环境变量，使用该目录（OpenCode 原生支持的自定义配置目录机制）；(b) 否则使用平台默认全局目录（Linux/macOS: `~/.config/opencode/`，Windows: `%APPDATA%/opencode/`）；(c) 所有路径通过 `path.resolve()` / `path.normalize()` 归一化，确保 Windows/macOS/Linux 兼容；(d) 不读取 `~/.config/opencode/config.json` 或 `configDir` 字段（OpenCode 无此原生机制）

---

### 需求 2：安装器改造（install 命令）

**用户故事：** 作为 SpecForge 用户，我希望 `install` 命令改为部署共享组件到用户级目录并在项目中初始化运行时目录，以便一次安装后所有项目都能使用 SpecForge。

#### 验收标准

1. WHEN 用户执行 `bun scripts/sf-installer.ts install` 时，THE Installer SHALL 将 Shared_Components 部署到 User_Level_Directory
2. WHEN 用户执行 `bun scripts/sf-installer.ts install` 时，THE Installer SHALL 在当前项目目录初始化 Runtime_Directory（`specforge/`），创建必要的子目录和初始文件
3. WHEN 用户执行 `bun scripts/sf-installer.ts install --target <path>` 时，THE Installer SHALL 将用户级共享组件部署到当前用户的 User_Level_Directory，并在指定路径初始化 Runtime_Directory
4. WHEN 用户执行 `bun scripts/sf-installer.ts install --project-level [--target <path>]` 时，THE Installer SHALL 按 V3.3 兼容模式执行完整项目级安装
5. WHEN 出现禁止的模糊组合（如 `--project-level --global`）时，THE Installer SHALL 输出明确的错误提示并退出，不执行任何操作
6. WHEN User_Level_Directory 中已存在 SpecForge 共享组件时，THE Installer SHALL 执行完整性检查：(a) 检查 Manifest 是否存在；(b) 检查版本是否匹配；(c) 检查 SHA-256 校验和是否一致。三项均通过才跳过部署并报告"共享组件已存在且完整，跳过部署"
7. WHEN 完整性检查发现不一致时，THE Installer SHALL 按以下默认行为处理：(a) 输出详细的不一致报告；(b) 以非零退出码退出，不初始化项目 runtime；(c) 提示用户执行 `upgrade` 修复；(d) 用户可通过 `install --runtime-only` 显式跳过共享组件检查，仅初始化项目 runtime（用于已知共享组件损坏但急需恢复项目运行时的场景）
8. THE Installer SHALL 在 User_Level_Directory 中创建用户级 Manifest 文件（`{User_Level_Directory}/specforge-manifest.json`），记录共享组件的版本、SHA-256 校验和、install_mode、schema_version
9. THE Installer SHALL 在项目级 Runtime_Directory 中创建项目级 Manifest 文件（`specforge/manifest.json`），记录运行时目录的初始化状态、关联的 required_shared_version_range、runtime_schema_version
10. IF User_Level_Directory 不存在，THEN THE Installer SHALL 自动创建目录及其子目录（agents/、tools/、tools/lib/、skills/、plugins/）
11. THE Installer SHALL 对所有关键文件写入采用原子写入策略：先写入临时文件，成功后 rename 到目标路径，失败时不留下半写文件

---

### 需求 3：opencode.json 合并式写入

**用户故事：** 作为 SpecForge 用户，我希望安装器在写入 opencode.json 时保留我已有的配置，以便 SpecForge 安装不会覆盖我的自定义设置。

#### 验收标准

1. WHEN User_Level_Directory 中已存在 `opencode.json` 时，THE Installer SHALL 在写入前备份原文件到 `{User_Level_Directory}/.backup/opencode.json.bak.<timestamp>`（timestamp 格式为 `YYYYMMDD-HHMMSS`），确保多次安装不会互相覆盖备份
2. THE Installer SHALL 只写入 sf-* 相关配置（agent 节点中的 sf-* Agent 注册），保留用户已有的非 sf-* 配置不变
3. THE Installer SHALL 按以下所有权判断逻辑处理 opencode.json 中已存在的 sf-* 条目：
   - (a) 如果该条目在用户级 Manifest 的 `managed_agents` 列表中登记过 → 视为 SpecForge 管理，可以升级/覆盖
   - (b) 如果不在 Manifest 的 `managed_agents` 中但名字是 sf-* → 视为用户自定义冲突，默认跳过并输出警告
   - (c) 仅当指定 `--force` 时才覆盖非 Manifest 管理的 sf-* 条目
4. WHEN 用户指定 `--force` 选项时，THE Installer SHALL 允许覆盖所有 sf-* 冲突条目（包括非 Manifest 管理项）
5. THE 用户级 `opencode.json` 中 Agent 的 `prompt` 字段 SHALL 使用相对于 User_Level_Directory 的路径引用（如 `{file:./agents/sf-orchestrator.md}`）
6. WHEN 项目级 `opencode.json` 中也存在 sf-* Agent 注册时，THE OpenCode 平台的行为 SHALL 以项目级配置优先（用户级为默认值，项目级可覆盖）
7. THE Installer SHALL 在合并写入完成后验证 JSON 格式有效性，无效时回滚到备份文件
8. THE 用户级 Manifest SHALL 维护 `managed_agents` 字段（字符串数组），记录由 SpecForge 安装器管理的 Agent 名称列表，install 和 upgrade 时自动更新
9. THE 用户级 Manifest SHALL 维护 `managed_agent_hashes` 字段（对象，键为 Agent 名称，值为该 Agent 配置片段的 SHA-256），记录每个 SpecForge 管理 Agent 在 opencode.json 中的配置片段哈希。哈希计算对象为 `opencode.json.agent[<name>]` 整个子对象的规范化 JSON 字符串（按键名排序、无多余空白）
10. THE Installer 对 opencode.json 的校验 SHALL 采用局部校验而非整文件 SHA-256：仅校验 `managed_agents` 列表中每个 Agent 的配置片段是否存在、字段是否完整、哈希是否与 `managed_agent_hashes` 记录一致。用户对非 sf-* 配置的修改不影响校验结果
11. THE Installer 备份 opencode.json 时 SHALL 使用带时间戳的备份文件名（如 `opencode.json.bak.20260506-153000`），避免多次安装互相覆盖。备份文件统一存放在 `{User_Level_Directory}/.backup/` 目录

---

### 需求 4：升级命令改造（upgrade 命令）

**用户故事：** 作为 SpecForge 用户，我希望 `upgrade` 命令能同时升级用户级共享组件和项目级运行时配置，以便保持所有组件版本一致。

#### 验收标准

1. WHEN 用户执行 `bun scripts/sf-installer.ts upgrade` 时，THE Installer SHALL 比较源目录版本与 User_Level_Directory 中的 Manifest 版本，如果源版本更新则升级共享组件
2. WHEN 共享组件升级时，THE Installer SHALL 按文件 SHA-256 校验和判断哪些文件需要更新，仅更新有变化的文件
3. WHEN 用户修改过 User_Level_Directory 中的文件（当前校验和与 Manifest 记录不一致）时，THE Installer SHALL 发出警告并跳过该文件（除非指定 `--force`）
4. THE Installer SHALL 同时检查项目级 Runtime_Directory 中的配置文件（project.json、risk_policy.json 等），如有新增配置项则补充（保留用户已有配置值）
5. WHEN 升级完成后，THE Installer SHALL 更新 User_Level_Directory 和项目级的 Manifest 文件
6. THE Installer SHALL 在升级前备份即将被覆盖的文件（备份到 `{User_Level_Directory}/.backup/` 目录，按时间戳命名）

---

### 需求 5：验证命令适配（verify 命令）

**用户故事：** 作为 SpecForge 用户，我希望 `verify` 命令能同时校验用户级共享组件和项目级运行时目录的完整性，以便快速发现安装问题。

#### 验收标准

1. WHEN 用户执行 `bun scripts/sf-installer.ts verify` 时，THE Installer SHALL 校验 User_Level_Directory 中所有共享组件文件的存在性和 SHA-256 校验和（与 Manifest 记录比对）。opencode.json 不参与整文件 SHA-256 校验
2. THE Installer SHALL 校验项目级 Runtime_Directory 中必要目录和文件的存在性
3. THE Installer SHALL 对 User_Level_Directory 中 `opencode.json` 执行局部校验：(a) `managed_agents` 列表中每个 Agent 的注册是否存在；(b) 每个 Agent 配置片段的必填字段（mode、model、prompt、permission）是否完整；(c) 每个 Agent 配置片段的 SHA-256 是否与 `managed_agent_hashes` 记录一致（不一致时报告用户修改，非错误）
4. WHEN 校验发现缺失或损坏的文件时，THE Installer SHALL 输出详细的问题列表，包括文件路径、预期校验和、实际校验和（或"文件缺失"）
5. THE Installer SHALL 在校验结果中区分"共享组件问题"和"项目运行时问题"，便于用户定位修复范围
6. WHEN 所有校验通过时，THE Installer SHALL 输出"SpecForge 安装完整性校验通过"及版本信息
7. THE Installer SHALL 执行版本兼容性检查：比对项目 Manifest 中的 required_shared_version_range 与用户级 Manifest 中的实际版本，不兼容时报告错误

---

### 需求 6：版本兼容矩阵

**用户故事：** 作为 SpecForge 维护者，我希望系统能检测共享组件版本与项目运行时版本的兼容性，以便在版本不匹配时阻止运行并给出明确提示。

#### 验收标准

1. THE 项目级 Manifest（`specforge/manifest.json`）SHALL 记录以下版本兼容字段：`required_shared_version_range`（如 `">=3.4.0 <4.0.0"`）、`runtime_schema_version`（如 `"1.0"`）
2. THE 用户级 Manifest（`specforge-manifest.json`）SHALL 记录 `shared_version`（如 `"3.4.0"`）和 `schema_version`（如 `"1.0"`）
3. THE 系统 SHALL 提供统一兼容性检查函数 `assertCompatibility()`，在以下入口调用：sf_state_read、sf_state_transition、所有 Gate 工具（sf_requirements_gate、sf_design_gate、sf_tasks_gate、sf_verification_gate）、sf_knowledge_graph、sf_knowledge_query、sf_context_build、sf_doctor
4. WHEN `assertCompatibility()` 检测到版本不兼容时，THE 系统 SHALL 禁止运行并输出明确错误："项目要求共享组件版本 {range}，当前安装版本 {version}，请执行 upgrade"
5. THE Installer 在 `install` 和 `upgrade` 完成时 SHALL 自动设置正确的版本兼容字段

---

### 需求 7：Manifest Schema 定义

**用户故事：** 作为 SpecForge 维护者，我希望 Manifest 文件有明确的 schema 定义，以便安装器能可靠地解析和验证 Manifest 内容。

#### 验收标准

1. THE 用户级 Manifest（`specforge-manifest.json`）SHALL 遵循以下 schema：
   ```json
   {
     "schema_version": "1.0",
     "shared_version": "<semver>",
     "install_mode": "user_level",
     "installed_at": "<ISO8601>",
     "updated_at": "<ISO8601>",
     "managed_agents": ["sf-orchestrator", "sf-requirements", "..."],
     "managed_agent_hashes": {
       "sf-orchestrator": "<sha256>",
       "sf-requirements": "<sha256>"
     },
     "files": { "<relative_path>": { "sha256": "<hash>", "size": 12345 } }
   }
   ```
2. THE 项目级 Manifest（`specforge/manifest.json`）SHALL 遵循以下 schema：
   ```json
   {
     "schema_version": "1.0",
     "runtime_schema_version": "1.0",
     "install_mode": "user_level | project_level",
     "required_shared_version_range": "<semver_range>",
     "initialized_at": "<ISO8601>",
     "updated_at": "<ISO8601>",
     "project_files": { "<relative_path>": { "sha256": "<hash>", "size": 12345 } }
   }
   ```
3. THE Installer SHALL 在读取 Manifest 时验证 `schema_version`，不兼容的 schema_version 触发升级提示
4. THE Installer SHALL 在写入 Manifest 时确保所有必填字段完整

---

### 需求 8：安装器 File_Registry 更新

**用户故事：** 作为 SpecForge 维护者，我希望安装器的 File_Registry 更新以反映用户级安装的文件分布，以便安装器能正确追踪和管理所有 SpecForge 文件。

#### 验收标准

1. THE Installer SHALL 维护两份 File_Registry：`USER_LEVEL_REGISTRY`（部署到 User_Level_Directory 的文件列表）和 `PROJECT_LEVEL_REGISTRY`（部署到项目目录的文件列表）
2. THE `USER_LEVEL_REGISTRY` SHALL 包含：9 个 Agent 文件、16 个 Tool 文件（含 lib/ 子目录 18 个文件）、12 个 Skill 目录、5 个 Plugin 文件。**opencode.json 不纳入 USER_LEVEL_REGISTRY 的整文件校验**（因其为混合所有权文件），由需求 3 的 managed_agent_hashes 机制单独管理
3. THE `PROJECT_LEVEL_REGISTRY` SHALL 包含：AGENTS.md、specforge/agents/AGENT_CONSTITUTION.md、specforge/agents/contracts/*.contract.md、specforge/config/project.json、specforge/config/risk_policy.json、specforge/config/skill_fragments.json、specforge/runtime/state.json、specforge/runtime/events.jsonl
4. THE Installer SHALL 为 User_Level_Directory 和项目目录分别维护独立的 Manifest 文件，各自记录对应 Registry 中文件的校验和
5. THE Installer 的所有文件删除操作 SHALL 基于 Manifest/File_Registry 驱动，sf-* 前缀仅作辅助检测手段（用于发现 Manifest 中未记录的遗留文件）

---

### 需求 9：Windows/跨平台路径支持

**用户故事：** 作为在 Windows 上使用 SpecForge 的用户，我希望安装器能正确处理跨平台路径差异，以便在任何操作系统上都能正常安装和运行。

#### 验收标准

1. THE Installer SHALL 使用 Node.js/Bun 的 `path` API（path.resolve、path.join、path.normalize）处理所有文件路径，不硬编码路径分隔符
2. THE Installer SHALL 按以下 User_Level_Directory 解析规则：(a) 如设置 `OPENCODE_CONFIG_DIR` 环境变量，使用该目录（OpenCode 原生支持）；(b) 否则使用平台默认全局目录（Linux/macOS: `~/.config/opencode/`，Windows: `%APPDATA%/opencode/`）；不读取 `~/.config/opencode/config.json.configDir`（OpenCode 无此原生机制）
3. THE Manifest 文件中记录的路径 SHALL 使用 POSIX 风格（`/` 分隔符），运行时通过 path API 转换为平台路径
4. THE Installer SHALL 在 Windows 上正确处理长路径（>260 字符）场景，使用 `\\?\` 前缀或依赖 Node.js 的 long path 支持

---

### 需求 10：sf_doctor 工具适配

**用户故事：** 作为 SpecForge 用户，我希望 `sf_doctor` 健康检查工具能适配用户级安装模式，以便在新模式下也能正确检测 SpecForge 的安装完整性。

#### 验收标准

1. WHEN `sf_doctor` 执行健康检查时，THE sf_doctor 工具 SHALL 同时检查 User_Level_Directory 和项目级 Runtime_Directory 的完整性
2. THE sf_doctor SHALL 检查 User_Level_Directory 中的关键文件是否存在：opencode.json、至少 1 个 sf-* Agent 文件、至少 1 个 sf_* Tool 文件
3. THE sf_doctor SHALL 检查项目级 Runtime_Directory 中的关键文件是否存在：specforge/runtime/state.json、specforge/config/project.json
4. WHEN 检测到项目同时存在用户级和项目级安装时，THE sf_doctor SHALL 报告"混合安装模式"警告，建议执行迁移（V3.4.1 提供迁移命令）
5. THE sf_doctor 的输出格式 SHALL 保持不变（overall: healthy/issues_found），仅在 issues 列表中新增用户级目录相关的检查项
6. THE sf_doctor SHALL 调用 `assertCompatibility()` 执行版本兼容性检查，不兼容时在 issues 中报告

---

### 需求 11：向后兼容与测试

**用户故事：** 作为 SpecForge 维护者，我希望 V3.4.0 的所有变更保持与 V3.3 的向后兼容，以便现有项目不受影响、现有测试继续通过。

#### 验收标准

1. THE `install --project-level` 命令 SHALL 保持与 V3.3 完全一致的行为，部署所有文件到项目 `.opencode/` 目录
2. THE 689 个现有单元测试 SHALL 在 V3.4.0 变更后继续通过，不允许因用户级安装改造而破坏现有测试
3. WHEN 项目使用项目级安装模式时（Manifest 中 `install_mode: "project_level"`），THE 所有运行时工具 SHALL 从项目 `.opencode/` 目录加载配置，行为与 V3.3 一致
4. WHEN 项目使用用户级安装模式时（Manifest 中 `install_mode: "user_level"`），THE 所有运行时工具 SHALL 从 User_Level_Directory 加载共享组件配置
5. THE `assertCompatibility()` 函数 SHALL 在项目级安装模式下跳过用户级版本检查（因为所有文件都在项目本地）
6. THE V3.4.0 SHALL 新增以下测试覆盖：
   - 用户级安装完整流程测试
   - opencode.json 合并式写入测试（含所有权判断三种情况 + managed_agent_hashes 校验）
   - opencode.json 局部校验测试（用户修改非 sf-* 配置后 verify 仍通过）
   - 跨平台路径解析测试（模拟 Windows/macOS/Linux + OPENCODE_CONFIG_DIR 覆盖）
   - 版本兼容性检查测试（兼容/不兼容场景）
   - verify 命令完整性校验测试
   - sf_doctor 用户级模式检查测试
   - 共享组件损坏时 install 失败退出测试
   - `install --runtime-only` 跳过共享组件检查测试
   - 并发安装锁测试（两个进程同时 install/upgrade 时的互斥行为）

---

### 需求 12：用户级安装并发锁

**用户故事：** 作为 SpecForge 维护者，我希望多项目并发执行 install/upgrade 时能正确串行化对用户级目录的写操作，以便避免 Manifest 与实际文件不一致、备份相互覆盖等并发问题。

#### 验收标准

1. THE Installer SHALL 在对 User_Level_Directory 进行任何写操作（install / upgrade）前获取安装锁：`{User_Level_Directory}/.specforge.lock`
2. THE 锁文件内容 SHALL 为 JSON 格式：`{ "pid": <number>, "command": "install|upgrade", "acquired_at": "<ISO8601>", "hostname": "<string>" }`
3. WHEN 锁文件已存在且持有者 PID 存活时，THE Installer SHALL 最多等待 30 秒（每 1 秒重试一次）；超时仍未获取到锁则以 `E_INSTALL_LOCKED` 错误码失败退出，提示锁持有者信息
4. WHEN 锁文件已存在但持有者 PID 不存活（通过 `process.kill(pid, 0)` 检查）时，THE Installer SHALL 视为过期锁并强制接管（删除旧锁后重新获取）
5. WHEN 锁文件已存在且 `acquired_at` 超过 10 分钟时，THE Installer SHALL 视为过期锁并强制接管
6. THE Installer SHALL 在 install/upgrade 正常完成或异常退出时释放锁（通过 try-finally 确保释放）
7. THE `verify` 命令 SHALL 不获取写锁，但在检测到写锁存在时输出警告"安装/升级进行中，校验结果可能不准确"
8. THE 锁文件获取和释放 SHALL 使用原子操作（`writeFile` 带 `flag: "wx"` 排他创建，`unlink` 释放）
9. THE 锁机制 SHALL 对 `install --project-level` 模式不生效（项目级安装不写用户级目录）
