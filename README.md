# SpecForge

运行在 OpenCode 上的规格驱动 AI 开发控制系统（v1.1）。

每个 Work Item（WI）经过：Intake → Classification → Impact Analysis → Candidate 准备 → Gate 检查 → User Decision → Merge → Post-Merge Verify → Close。整个过程由 Write Guard 默认拒绝、Gate 五层检查、Changed Files Audit 审计三重控制保障。

---

## 核心特性

- **主链路工作流**：Intake → Gates → User Decision → Merge → Post-Merge Verify → Close，状态机驱动（v1.1）
- **Write Guard**：程序级写入拦截，默认拒绝，只有声明角色可写对应路径（§12.5-§12.6）
- **Gate 检查**：Gate Summary Gate / Merge Ready Gate / Post-Merge Gate / Code Permission Release Gate / Close Gate — 五层 Gate（§15）
- **Changed Files Audit**：审计所有变更文件，路径+操作双重匹配，越界写入阻断 Close Gate（§12.7）
- **状态机驱动**：WI 状态由 daemon WorkflowEngine 管理，通过 seal transition 机制强制执行；关键状态推进由 sf_gate_run / sf_close_gate / sf_merge_run 间接触发
- **Legacy 只读**：旧 specs/、config/、knowledge/、manifest.json 路径仅供读取，新流程走 project/ + work-items/
- **完整留痕**：trace.jsonl / events.jsonl / tool_calls.jsonl / cost.jsonl 自动记录
- **失败重试闭环**：executor 重试 → debugger 介入 → blocked 报告用户

---

## 前提条件

- [OpenCode](https://opencode.ai) v1.1+
- [Bun](https://bun.sh) — JavaScript/TypeScript 运行时
- 至少一个 AI Provider 已配置（如 Anthropic、OpenAI、Google 等）

---

## 安装

### 安装（一次性）

```bash
cd /path/to/specforge-repo
bun scripts/sf-installer.ts install
```

这会将共享组件（Agent、Tool、Skill、Plugin）部署到 OpenCode 用户配置目录。默认目录为 `~/.config/opencode/`；设置 `OPENCODE_CONFIG_DIR` 时以该目录为准。组件数量由安装器运行时自动扫描确定，无需硬编码。

安装完成后，先确保 SpecForge daemon 已由部署环境启动并保持可用，再打开项目的 OpenCode。Plugin 负责连接 daemon、注册项目并自动初始化项目运行时（`.specforge/` 目录），但不负责启动、停止、重启或替换 daemon。

### 用户级与项目级路径边界

| 数据类型 | 标准位置 | 归属 |
|---|---|---|
| 安装 Manifest | `<OpenCode config>/specforge-manifest.json` | 安装器 |
| Agent、Tool、Skill、Plugin | `<OpenCode config>/agents`、`tools`、`skills`、`plugins` | 所有项目共享 |
| daemon 握手、锁和桥接日志 | `<OpenCode config>/sf-user/runtime` | 共享 daemon |
| 个人模式 checkpoint | `<project>/.specforge/runtime/checkpoints` | 当前项目 |
| 企业模式 checkpoint | `<OpenCode config>/sf-user/projects/<project-hash>/checkpoints` | 当前项目的用户级隔离副本 |

`~/.specforge` 只允许作为旧版本迁移读取来源。新安装、升级、daemon 运行和项目压缩不得创建或写入该目录。共享 daemon 没有明确项目绑定时不得生成 checkpoint。

### Daemon 运行模型

SpecForge daemon 是独立的共享治理服务，生命周期由部署环境负责管理：

- 本地开发环境可以先启动 daemon，再启动 OpenCode。
- 服务器环境可以使用长期运行的 daemon，由多个 OpenCode 实例共同连接。
- OpenCode Plugin 只作为 daemon 客户端，不接管 daemon 生命周期。
- daemon 不可用时，Plugin 必须失败关闭并报告连接问题，不能绕过 daemon 继续执行治理写操作。

若使用 SpecForge CLI 管理 daemon，可使用：

```bash
specforge daemon start
specforge daemon status
```

服务器环境也可以使用既有的服务管理方式启动 daemon。

### 升级

```bash
bun scripts/sf-installer.ts upgrade         # 常规升级（保留用户自定义）
bun scripts/sf-installer.ts upgrade --force  # 强制覆盖（覆盖用户自定义）
```

**升级特性：**
- ✅ **原子升级**：要么全部成功，要么回滚到之前状态
- ✅ **降级检测**：如果源版本低于已安装版本，会提示降级警告
- ✅ **用户自定义保护**：检测用户修改，避免意外覆盖
- ✅ **孤儿文件清理**：自动清理新版本中移除的文件
- ✅ **并发安全**：锁机制防止并发操作

### 校验

```bash
bun scripts/sf-installer.ts verify
```

**校验特性：**
- ✅ **完整性检查**：验证所有文件的 SHA-256 校验和
- ✅ **Manifest 验证**：检查 Manifest 完整性
- ✅ **只读操作**：不修改任何文件
- ✅ **详细报告**：报告缺失、损坏或不匹配的文件

### 卸载

```bash
bun scripts/sf-installer.ts uninstall
```

**卸载特性：**
- ✅ **完整清理**：删除 Manifest 中记录的所有文件
- ✅ **配置清理**：从 `opencode.json` 中移除 sf-* agent 条目
- ✅ **安全保留**：保留用户其他配置不变
- ✅ **残留检测**：报告未在 Manifest 中记录的 sf-* 文件

### 完整卸载（含用户级运行数据）

上面的 `uninstall` 命令只移除 Manifest 管理的共享组件，并保留 `<OpenCode config>/sf-user` 中的运行数据、模板、备份和项目隔离数据。彻底清理前必须先关闭全部 OpenCode 并停止 daemon。

**macOS / Linux：**
```bash
bun scripts/sf-installer.ts uninstall
OPEN_CODE_ROOT="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
rm -rf "$OPEN_CODE_ROOT/sf-user"
```

**Windows PowerShell：**
```powershell
bun scripts/sf-installer.ts uninstall

$OpenCodeRoot = $env:OPENCODE_CONFIG_DIR
if ([string]::IsNullOrWhiteSpace($OpenCodeRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($env:XDG_CONFIG_HOME)) {
        $OpenCodeRoot = Join-Path $env:XDG_CONFIG_HOME "opencode"
    } else {
        $OpenCodeRoot = Join-Path $HOME ".config\opencode"
    }
}

Remove-Item -LiteralPath (Join-Path $OpenCodeRoot "sf-user") -Recurse -Force -ErrorAction SilentlyContinue
```

> ⚠️ **警告**：此操作不可逆。不要删除用户主目录下的 `~/.specforge` 作为正常卸载步骤；该目录是旧版本遗留路径，不是当前用户级数据目录。上述命令也不会删除任何项目的 `<project>/.specforge`。项目目录包含正式规格、Work Item 和项目运行数据，是否删除必须逐项目单独决定。

### 版本信息

```bash
bun scripts/sf-installer.ts --version
```

显示已安装的 SpecForge 版本、安装时间、更新时间和已部署文件数量。

### 安装后

先确认 daemon 已运行，再启动 OpenCode：

```bash
specforge daemon status

cd <你的项目>
opencode             # 启动 OpenCode
# Plugin 连接现有 daemon 并自动初始化项目运行时
# 按 Tab 切换到 sf-orchestrator
```

如果 daemon 尚未启动，先按当前部署环境的方式启动 daemon。服务器上可以由一个长期运行的 daemon 同时服务多个 OpenCode 实例。

**注意：** 安装/升级后需要重启 OpenCode 才能加载新版 Plugin；重启 OpenCode 不等于重启 daemon。

### 安装器设计优势

1. **零维护**：文件增删无需修改代码，运行时自动扫描 `.opencode/` 目录
2. **统一引擎**：install/upgrade/repair 共用同一个 Reconcile 函数
3. **幂等性**：多次执行相同操作不产生额外变更
4. **原子性**：每个文件写入都是原子的（temp + SHA-256 验证 + rename）
5. **作用域隔离**：用户级 vs 项目级使用不同策略
6. **完整测试**：16 个正确性属性 + 端到端测试覆盖

---

## 目录结构

### 本仓库（开发视角）

```
SpecForge/                        # 仓库根目录
├── .kiro/
│   ├── specs/                   # 设计文档（requirements/design/tasks）
│   │   ├── v6-architecture-overview/  # 父规范
│   │   ├── daemon-core/         # 各模块 spec（只放文档）
│   │   ├── configuration/
│   │   ├── ...
│   │   └── _archive/            # 历史 spec（V1–V5）
│   └── steering/                # AI 开发规则
├── packages/                    # V6 模块源码（monorepo）
│   ├── daemon-core/
│   ├── configuration/
│   ├── permission-engine/
│   ├── observability/
│   ├── scope-gate/
│   ├── workflow-runtime/
│   └── types/
├── .opencode/                   # SpecForge 框架（Agent/Tool/Skill/Plugin）
├── scripts/                     # 安装器脚本
├── tests/                       # 跨模块集成/e2e 测试
└── docs/archive/                # 历史设计文档
```

### 安装后（用户项目视角）

```
~/.config/opencode/              # OpenCode 用户配置根目录
├── opencode.json                # sf-* Agent 注册
├── specforge-manifest.json      # 安装清单（固定在配置根目录）
├── agents/                      # sf-* Agent 定义
├── tools/ + tools/lib/          # sf_* Tool 文件
├── skills/                      # sf-* Skill
├── plugins/                     # 统一 Plugin
└── sf-user/                     # SpecForge 用户级数据根目录
    ├── runtime/                 # daemon handshake、锁、桥接日志
    ├── lib/                     # 用户级运行依赖
    ├── templates/               # 模板
    ├── backups/                 # 备份
    └── projects/                # 企业模式项目隔离数据

project-root/                    # 项目级（Plugin 自动初始化）
├── AGENTS.md                    # Agent 总览（自动生成）
└── .specforge/
    ├── project/                 # 项目级 spec 真相源（§2.1）
    │   ├── spec_manifest.json
    │   ├── extension_registry.json
    │   ├── requirements_index.md
    │   ├── design_index.md
    │   ├── architecture.md
    │   ├── glossary.md
    │   ├── decisions.md
    │   ├── trace_matrix.md
    │   └── modules/
    ├── work-items/              # Work Item 事务目录（§4.2）
    │   └── <WI-ID>/
    │       ├── work_item.json
    │       ├── intake.md
    │       └── ...
    ├── runtime/                 # 运行时状态（gitignored）
    │   ├── state.json
    │   ├── wal.jsonl
    │   ├── checkpoints/
    │   └── logs/
    ├── config/                  # [LEGACY READ-ONLY §1.7] — 新流程不走此目录
    ├── specs/                   # [LEGACY READ-ONLY §1.7] — 新流程走 project/
    ├── knowledge/               # [LEGACY READ-ONLY §1.7] — 不再写入
    └── manifest.json            # [LEGACY READ-ONLY §1.7] — 仅供读取
```

<!-- BEGIN: directory-layout -->
> ⚠️ 本文档由 `scripts/render-layout.ts` 从 `packages/types/src/directory-layout.ts` 自动生成。
> 不要手动编辑。

## 项目目录名

```
SPEC_DIR_NAME = '.specforge'
```

## v1.1 Active Paths (.specforge/)

### committed 区（提交到 Git）

| Key | 路径 | 说明 |
|-----|------|------|
| project | `project` | 项目级正式规格目录 — `<root>/.specforge/project/` |
| workItems | `work-items` | Work Item 事务根目录 — `<root>/.specforge/work-items/` |

### projectFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| projectFiles.specManifest | `project/spec_manifest.json` | — |
| projectFiles.extensionRegistry | `project/extension_registry.json` | — |
| projectFiles.requirementsIndex | `project/requirements_index.md` | — |
| projectFiles.designIndex | `project/design_index.md` | — |
| projectFiles.architecture | `project/architecture.md` | — |
| projectFiles.glossary | `project/glossary.md` | — |
| projectFiles.decisions | `project/decisions.md` | — |
| projectFiles.traceMatrix | `project/trace_matrix.md` | — |
| projectFiles.modulesRoot | `project/modules` | — |

### workItemFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| workItemFiles.workItemJson | `work_item.json` | — |
| workItemFiles.intake | `intake.md` | — |
| workItemFiles.changeClassification | `change_classification.md` | — |
| workItemFiles.impactAnalysis | `impact_analysis.md` | — |
| workItemFiles.triggerResult | `trigger_result.json` | — |
| workItemFiles.requirementsDelta | `requirements_delta.md` | — |
| workItemFiles.designDelta | `design_delta.md` | — |
| workItemFiles.tasks | `tasks.md` | — |
| workItemFiles.traceDelta | `trace_delta.md` | — |
| workItemFiles.candidateManifest | `candidate_manifest.json` | — |
| workItemFiles.candidates | `candidates` | — |
| workItemFiles.gates | `gates` | — |
| workItemFiles.gateSummary | `gate_summary.md` | — |
| workItemFiles.userDecision | `user_decision.json` | — |
| workItemFiles.verificationReport | `verification_report.md` | — |
| workItemFiles.mergeReport | `merge_report.md` | — |
| workItemFiles.evidence | `evidence` | — |
| workItemFiles.evidenceManifest | `evidence/evidence_manifest.json` | — |
| workItemFiles.extensionRequest | `extension_request.json` | — |
| workItemFiles.extensionDelta | `extension_delta.md` | — |

### gitignored 区（运行时数据）

| Key | 路径 | 说明 |
|-----|------|------|
| runtime | `runtime` | 运行时状态目录（gitignored）— `<root>/.specforge/runtime/` |

### runtimeFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| runtimeFiles.wal | `runtime/wal.jsonl` | — |
| runtimeFiles.state | `runtime/state.json` | — |
| runtimeFiles.checkpoints | `runtime/checkpoints` | — |
| runtimeFiles.logs | `runtime/logs` | — |

## Legacy Paths (read-only / deprecated)

> ⚠️ 以下路径已从 LAYOUT 移除，仅供 legacy readers 读取，新代码不得使用这些路径进行写入。

### 项目级 Legacy Paths

| Key | 路径 | 说明 |
|-----|------|------|
| specsReadOnly | `specs` | 旧规格目录（legacy read-only）— `<root>/.specforge/specs/` |
| manifest | `manifest.json` | 旧根级 manifest — `<root>/.specforge/manifest.json` |
| config | `config` | 旧配置目录 — `<root>/.specforge/config/` |
| knowledge | `knowledge` | 旧知识目录 — `<root>/.specforge/knowledge/` |
| knowledgeGraph | `knowledge/graph.json` | 旧知识图谱 — `<root>/.specforge/knowledge/graph.json` |

#### legacyPaths.configFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| configFiles.projectRules | `config/project-rules.md` | — |
| configFiles.prodEnv | `config/prod-environment.md` | — |
| configFiles.project | `config/project.json` | — |
| configFiles.riskPolicy | `config/risk_policy.json` | — |
| configFiles.skillFragments | `config/skill_fragments.json` | — |

### 用户级 Legacy Paths (~/.specforge/) — v1.0 遗留，v1.1 不再默认写入

> **v1.1 变更**：daemon handshake 已迁移到 `$OPENCODE_CONFIG_DIR/sf-user/runtime/handshake.json`。以下路径仅作为 read-only fallback 保留，不得作为新写入目标。

| Key | 路径 | 说明 |
|-----|------|------|
| runtime | `runtime` | 运行时状态目录 — `~/.specforge/runtime/`（legacy read-only） |
| runtimeHandshake | `runtime/handshake.json` | 握手文件 — `~/.specforge/runtime/handshake.json`（legacy fallback） |
| runtimeState | `runtime/state.json` | 持久化状态 — `~/.specforge/runtime/state.json`（legacy） |
| runtimeEvents | `runtime/events.jsonl` | 事件日志 — `~/.specforge/runtime/events.jsonl`（legacy） |
| runtimeDaemonLock | `runtime/daemon.lock` | Daemon 锁文件 — `~/.specforge/runtime/daemon.lock`（legacy） |
| hostProfile | `host-profile.json` | 主机配置文件 — `~/.specforge/host-profile.json`（legacy） |
| logs | `logs` | 日志目录 — `~/.specforge/logs/`（legacy） |
| projects | `projects` | 项目目录 — `~/.specforge/projects/`（legacy） |
| templates | `templates` | 模板目录 — `~/.specforge/templates/`（legacy） |
| backups | `backups` | 备份目录 — `~/.specforge/backups/`（legacy） |

---
<!-- END: directory-layout -->

---

## 工作流路径（v1.1）

所有 WI 必须在 classification 阶段确定 workflow_path，后续状态机由路径决定。

| workflow_path | 触发条件 | 说明 |
|---|---|---|
| `requirement_change_path` | 需求变更 — 需求→候选→Gate→User Decision→Merge→Verify→Close | 标准需求变更路径 |
| `design_change_path` | 设计变更 — 设计→候选→Gate→User Decision→Merge→Verify→Close | 架构/设计变更路径 |
| `architecture_change_path` | 架构变更 — 架构评估→候选→Gate→User Decision→Merge→Verify→Close | 大范围架构调整路径 |
| `task_change_path` | 任务变更 — 任务调整→候选→Gate→User Decision→Merge→Verify→Close | 任务级别变更路径 |
| `code_only_fast_path` | 纯代码修改 — 跳过部分 Gate，直接 Code Permission→Implement→Verify→Close | 小范围代码修复（14 文件校验） |
| `spec_migration_path` | 规格迁移 — 旧 specs/ 结构迁移到 project/ + work-items/ | v1.0→v1.1 迁移路径 |
| `rollback_path` | 回滚 — 逆向 Merge 恢复到变更前状态 | 紧急回滚路径 |

> **deprecated**: `quick_change` 类型已废弃，等效于 `code_only_fast_path`。系统不再独立处理 quick_change 工作流。

---

## Agent 体系

| Agent | v1.1 角色 | 职责 |
|-------|-----------|------|
| sf-orchestrator | 主控 | WI 管理、意图判断、workflow_path 选择、阶段推进 |
| sf-requirements | 子 Agent | 需求分析、EARS 格式 AC 编写、Classification |
| sf-design | 子 Agent | 架构设计、Candidate 准备 |
| sf-task-planner | 子 Agent | 任务拆分、验证要求定义 |
| sf-executor | 子 Agent | 代码编写（受 Write Guard + code_permission 控制） |
| sf-debugger | 子 Agent | 调试、问题修复 |
| sf-reviewer | 子 Agent | 代码与文档审查（只读） |
| sf-verifier | 子 Agent | 测试执行、验收确认、changed_files_audit 生成 |

---

## v1.1 控制链路

```
Intake → Classification → Impact Analysis → Candidate 准备
  → Gate Summary Gate (gates/gate_summary_gate.json)
  → User Decision (user_decision.json approved/waived)
  → Merge Ready Gate (gates/merge_ready_gate.json)
  → Merge Runner → merge_report.md
  → Post-Merge Gate (gates/post_merge_gate.json)
  → Code Permission Release (code_permission_release_gate)
  → Implementation (Write Guard: path + operation 匹配)
  → Verification → verification_report.md + changed_files_audit.md
  → Close Gate (gates/close_gate.json)
  → Closed
```

- **Write Guard**: 默认拒绝，未知 actor 一律 block。每个资源只有声明角色可写。
- **Gate 检查**: 不只检查文件存在，检查 gate JSON status=passed / decision status=approved/waived。
- **Changed Files Audit**: 路径+操作双重匹配。越界写入 → close_gate 不通过。

---

## Custom Tools

| 工具 | 用途 |
|------|------|
| sf_gate_run | v1.1 统一 Gate Runner（替代旧独立 Gate 工具） |
| sf_user_decision_record | 记录结构化用户决策到 user_decision.json |
| sf_merge_run | 合并 Candidate 到正式规格 |
| sf_code_permission | 释放/撤销代码写入权限 + allowed_write_files |
| sf_changed_files_audit | 审计实际文件变更 vs allowed_write_files |
| sf_close_gate | WI 关闭前 17 项完整性检查 |
| sf_state_read | 读取 Work Item 状态（legacy compatibility / 调试） |
| sf_state_transition | daemon 内部状态流转（legacy compatibility） |
| sf_doc_lint | 文档结构检查 |
| sf_trace_matrix | 需求→设计→任务追溯检查 |
| sf_doctor | 系统健康检查 |
| sf_artifact_write | 代写产物（供只读 Agent 使用） |
| sf_batch_verify | 批量验证命令执行 |
| sf_context_build | 构建 Task Context + 能力推荐 |
| sf_cost_report | 成本日志聚合分析 |
| sf_continuity | 跨会话续接引擎 |

---

## 测试

```bash
bun run test           # 运行所有测试
bun run test:watch     # 监听模式
bun run test:coverage  # 带覆盖率
```

Windows 上可在隔离的临时 OpenCode 配置目录中执行完整安装生命周期验收，不会修改当前用户的正式 OpenCode 配置：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-userlevel-installer-lifecycle-acceptance.ps1
```

---

## 配置模型

编辑用户级 `~/.config/opencode/opencode.json`，替换为你实际可用的模型：

```json
{
  "agent": {
    "sf-orchestrator": { "model": "anthropic/claude-sonnet-4-20250514" },
    "sf-executor": { "model": "anthropic/claude-sonnet-4-20250514" }
  }
}
```

---

## 安装器详细使用指南

### 基本命令

```bash
# 安装 SpecForge 共享组件
bun scripts/sf-installer.ts install

# 升级 SpecForge 共享组件
bun scripts/sf-installer.ts upgrade
bun scripts/sf-installer.ts upgrade --force  # 强制覆盖用户自定义

# 校验安装完整性
bun scripts/sf-installer.ts verify

# 卸载 SpecForge 共享组件
bun scripts/sf-installer.ts uninstall

# 显示版本信息
bun scripts/sf-installer.ts --version

# 显示帮助信息
bun scripts/sf-installer.ts --help
```

### 使用示例

#### 完整安装流程
```bash
# 1. 首次安装
bun scripts/sf-installer.ts install

# 2. 验证安装
bun scripts/sf-installer.ts verify

# 3. 启动或确认 SpecForge daemon
specforge daemon status
# 未运行时，按当前部署方式启动；使用 CLI 管理时可执行：
# specforge daemon start

# 4. 重启 OpenCode 加载 Plugin
# Plugin 连接已经运行的 daemon
```

#### 升级流程
```bash
# 1. 常规升级（保留用户自定义）
bun scripts/sf-installer.ts upgrade

# 2. 强制升级（覆盖所有文件）
bun scripts/sf-installer.ts upgrade --force

# 3. 验证升级结果
bun scripts/sf-installer.ts verify

# 4. 按部署计划管理 daemon，并重启 OpenCode 加载新版 Plugin
# OpenCode Plugin 不会自动停止、替换或重启 daemon
```

#### 故障排查
```bash
# 检查安装状态
bun scripts/sf-installer.ts --version

# 验证完整性
bun scripts/sf-installer.ts verify

# 如果验证失败，重新安装
bun scripts/sf-installer.ts upgrade --force
```

### 安装位置

**用户级共享组件与运行数据目录：**
```
<OpenCode config>/
├── agents/                     # sf-* Agent 定义文件
├── tools/                      # sf_* Tool + lib 文件
├── skills/                     # sf-* Skill 目录
├── plugins/                    # 统一 Plugin (sf_specforge.ts)
├── opencode.json               # Agent 注册配置
├── specforge-manifest.json     # 用户级 Manifest（固定在配置根目录）
└── sf-user/
    ├── runtime/                # daemon handshake、锁、桥接日志
    ├── lib/                    # 用户级运行依赖
    ├── templates/              # 模板
    ├── backups/                # 备份
    └── projects/               # 企业模式 checkpoint 等项目隔离数据
```

**项目级运行时目录（Plugin 自动初始化）：**
```
项目根目录/.specforge/
├── project/          # 项目级 spec 真相源（§2.1）
├── work-items/       # Work Item 事务目录（§4.2）
└── runtime/          # 运行时状态
    # Legacy: config/, specs/, knowledge/ 为 read-only
```

### 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 通用错误 |
| 2 | 源文件缺失 |
| 3 | 校验和不匹配 |
| 4 | 磁盘空间不足 |
| 5 | 并发锁冲突 |
| 6 | 降级检测（需要 --force） |

### 设计原理

安装器采用 **声明式期望状态 + 自动协调（Reconcile）** 架构：

1. **自动发现机制**：运行时扫描 `.opencode/` 目录，无需手动维护注册表
2. **三方哈希比较**：源文件 vs 目标文件 vs Manifest 记录，精确检测用户修改
3. **原子写入**：temp 文件 + SHA-256 验证 + rename，确保文件完整性
4. **提交中断恢复**：partial_commit.journal 机制，崩溃后自动恢复
5. **孤儿文件清理**：自动清理新版本中移除的 `sf-*` 和 `sf_*` 文件

### 注意事项

1. **重启要求**：安装/升级后需要重启 OpenCode 才能加载新版 Plugin
2. **并发安全**：安装器使用心跳锁机制防止并发操作
3. **向后兼容**：支持从旧版 Manifest 格式迁移
4. **性能保证**：Plugin 启动时间 < 500ms（硬断言）
5. **错误处理**：详细的错误代码和退出码

## 详细文档

- [AGENTS.md](AGENTS.md) — Agent 体系、权限模型、工作流、工具、Skill 完整总览
- [CHANGELOG.md](CHANGELOG.md) — 版本演进记录
- [docs/archive/](docs/archive/) — 历史设计文档
