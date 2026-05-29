# WI-011 Impact Analysis — SpecForge V6 目录结构治理 P1 代码全量切换与数据迁移

**工作流类型**：change_request
**阶段**：impact_analysis
**主输入文档**：`.specforge/specs/WI-011/intake.md`
**权威设计来源**：`docs/proposals/2026-05-29-directory-structure-governance.md`（方案 A）
**P0 前置**：`.specforge/specs/WI-010/refactor_analysis.md`（21 条不变行为约束）
**扫描时间**：2026-05-29
**扫描方法**：对全部 9 个目标范围执行 `Select-String` / `grep` 实证扫描

---

## 变更范围

### T1：daemon-core 路径切换（19 个文件，~63 处替换）

将 `packages/daemon-core/src/` 下所有硬编码字符串 `.specforge` / `specforge/` 替换为 `directory-layout.ts` 的常量调用。

#### tools/lib/ 子目录（15 个文件）

| # | 文件 | 替换数 | 模式分类 | 关键行 |
|---|------|--------|----------|--------|
| 1 | `sf_doctor_core.ts` | 5 | 混合（`.specforge` + `specforge/`） | L32 `join(baseDir, "specforge", "manifest.json")`; L40 错误消息; L92-93 相对路径 `"specforge/runtime/state.json"`, `"specforge/config/project.json"`; L232 `join(baseDir, ".specforge")` |
| 2 | `sf_artifact_write_core.ts` | 8 | 混合 | L92-96 模板字符串 `` `.specforge/specs/${wid}/...` `` 和 `` `.specforge/archive/agent_runs/${rid}/...` ``; L101-102 路径前缀 `".specforge/specs/"`, `".specforge/archive/agent_runs/"`; L265-266 `split("/specforge/")` 分割逻辑; L436 `join(baseDir, "specforge", "logs", "trace.jsonl")` |
| 3 | `sf_continuity_core.ts` | 7 | `specforge/`（不带点） | L621, L682, L1534 `join(baseDir, "specforge", "archive", "agent_runs")`; L650 `join(baseDir, "specforge", "runtime", "trace.jsonl")`; L702 常量 `"specforge"`; L707 `join(baseDir, "specforge", "runtime", "conversation.jsonl")`; L1474 `join(baseDir, "specforge", "config", "project.json")` |
| 4 | `sf_context_build_core.ts` | 5 | 混合 | L189 `join(this.baseDir, "specforge", "archive", "agent_runs")`; L312 `join(this.baseDir, ".specforge", "specs", ...) `; L711 `join(baseDir, "specforge", "config", "skill_fragments.json")`; L885, L896 `join(baseDir, "specforge", "config", "project.json")` |
| 5 | `sf_knowledge_graph_core.ts` | 5 | 混合 | L90-91 `join("specforge", "knowledge", "graph.json")` / `join("specforge", "config", "project.json")`; L977 `join(baseDir, ".specforge", "specs", workItemId)`; L1047, L1069, L1099 模板字符串 `` `.specforge/specs/${workItemId}/...` `` |
| 6 | `sf_requirements_gate_core.ts` | 3 | `.specforge`（带点） | L221, L272, L438 `join(baseDir, ".specforge", "specs", workItemId)` |
| 7 | `sf_knowledge_base_core.ts` | 2 | `specforge/`（不带点） | L144 常量 `"specforge"`; L180 `join(baseDir, "specforge", "config", "project.json")` |
| 8 | `utils.ts` | 5 | `specforge/`（不带点） | L149 常量 `"specforge/logs/error.log"`; L164 `join(baseDir, "specforge", "logs")`; L203 `join(baseDir, "specforge", "runtime", "events.jsonl")`; L204 `join(baseDir, "specforge", "logs", "error.log")` |
| 9 | `sf_safe_bash_core.ts` | 4 | `~/.specforge`（用户级） | L36 类型声明 `specforge: { ... }`; L43 `path.join(os.homedir(), ".specforge", "host-profile.json")`; L77 初始化 `path.join(os.homedir(), ".specforge")` + `"logs"`; L211 `profile.specforge.logs_dir` |
| 10 | `sf_cost_report_core.ts` | 2 | `specforge/`（不带点） | L279 `join(baseDir, "specforge", "logs", "cost.jsonl")`; L280 `join(baseDir, "specforge", "runtime", "events.jsonl")` |
| 11 | `sf_verification_gate_core.ts` | 2 | `.specforge`（带点） | L494, L694 `join(baseDir, ".specforge", "specs", workItemId)` |
| 12 | `sf_design_gate_core.ts` | 2 | `.specforge`（带点） | L234, L400 `join(baseDir, ".specforge", "specs", workItemId)` |
| 13 | `sf_tasks_gate_core.ts` | 1 | `.specforge`（带点） | L231 `join(baseDir, ".specforge", "specs", workItemId)` |
| 14 | `sf_trace_matrix_core.ts` | 1 | `.specforge`（带点） | L183 `join(baseDir, ".specforge", "specs", workItemId)` |
| 15 | `sf_doc_lint_core.ts` | 1 | `.specforge`（带点） | L52 `join(baseDir, ".specforge", "specs", workItemId)` |

#### daemon/ 子目录（3 个文件）

| # | 文件 | 替换数 | 关键行 |
|---|------|--------|--------|
| 16 | `daemon/path-resolver.ts` | 5 | L132 `path.join(projectPath, '.specforge', 'runtime')`; L148 `path.join(os.homedir(), '.specforge', 'runtime')`; L181 `path.join(os.homedir(), '.specforge', 'projects', hash)`; L197 `path.join(os.homedir(), '.specforge', 'runtime')`; JSDoc 中 2 处路径描述 |
| 17 | `daemon/Daemon.ts` | 2 | L204-205 legacy 迁移代码 `path.join(runtimeDir, '.specforge', 'runtime', 'state.json')` / `'events.jsonl'` |
| 18 | `daemon/HandshakeManager.ts` | 0 | 仅 JSDoc 注释 `~/.specforge/runtime/daemon.lock`，无代码改动 |

#### handlers/ 子目录（1 个文件）

| # | 文件 | 替换数 | 关键行 |
|---|------|--------|--------|
| 19 | `tools/handlers/sf-state-transition.ts` | 2 | L17 `join(baseDir, '.specforge', 'manifest.json')`; L24 错误消息中 `.specforge/manifest.json` |

**T1 汇总**：19 个文件，约 63 处替换。其中有 3 种模式：
- **Pattern A**：项目级路径 `join(baseDir, ".specforge", "specs", ...)` → `specPath(baseDir, wi, file)` 或 `resolveProjectPath(baseDir, 'specs', ...)`
- **Pattern B**：项目级路径 `join(baseDir, "specforge", ...)` → `resolveProjectPath(baseDir, key, ...)`
- **Pattern C**：用户级路径 `path.join(os.homedir(), ".specforge", ...)` — 这些**不能**用 `resolveProjectPath`（该函数是项目级的），需要引入新的用户级路径构造函数或在 `directory-layout.ts` 中新增

**⚠️ 发现问题 1**：`directory-layout.ts` 当前只提供**项目级**路径构造函数（`resolveProjectPath` / `specPath` / `agentRunArchivePath`），但 daemon-core 中有大量**用户级**路径（`~/.specforge/...`），包括：
- `sf_safe_bash_core.ts`: `~/.specforge/host-profile.json`, `~/.specforge/logs/`
- `path-resolver.ts`: `~/.specforge/runtime/`, `~/.specforge/projects/`

P0 的 `directory-layout.ts` **未覆盖用户级路径**，T1 需要先扩展 Schema 或确认用户级路径不纳入本次切换范围。

---

### T2：部署态 tools 路径切换（28 个文件）

`.opencode/tools/lib/` 下的部署态文件。与 T1 的 `packages/daemon-core/src/tools/lib/` 文件高度重叠但有差异。

| # | 文件 | 与 T1 对应文件 | 额外替换点 |
|---|------|--------------|-----------|
| 1-15 | 与 T1 的 1-15 号文件同名 | 相同（部署态副本） | 部分文件有差异（见下） |
| 16 | `thin-client.ts` | 无 | L38 `path.join(home, '.specforge', 'runtime', 'handshake.json')` — 用户级路径 |
| 17 | `sf_verifier_execution_core.ts` | 无 | 无 `specforge` 引用（已确认） |
| 18-28 | 其余类型/解析器文件 | 无 | 无 `specforge` 引用 |

**差异点（daemon-core vs 部署态）**：

部署态 `.opencode/tools/lib/` 存在以下 daemon-core 没有的额外硬编码：
- `sf_doctor_core.ts` L40: `"项目 specforge/manifest.json 存在但 JSON 解析失败"` — 错误消息用不带点
- `sf_context_build_core.ts` L189: `join(this.baseDir, "specforge", "archive", "agent_runs")` — 不带点
- `sf_artifact_write_core.ts` L265-266: `split("/specforge/")` 分割逻辑 — 不带点

**T2 汇总**：28 个文件中 16 个含硬编码路径（其余 12 个为纯类型/解析器，无路径引用）。替换总量约 45-50 处。

**⚠️ 发现问题 2**：`.opencode/tools/lib/` 和 `.opencode-/tools/lib/`（废弃备份）内容几乎相同。T2 只需处理 `.opencode/tools/lib/`（无尾横线），`.opencode-/` 将在 T11 删除。

---

### T3：8 个 SKILL.md 路径修正（8 个文件，~21 处替换）

所有 8 个 `sf-workflow-*/SKILL.md` 使用 `specforge/specs/`（不带点），需统一为 `.specforge/specs/`（带点）。

| # | 文件 | 替换数 | 行号 |
|---|------|--------|------|
| 1 | `sf-workflow-bugfix-spec/SKILL.md` | 4 | L62, L92, L120, L145 |
| 2 | `sf-workflow-change-request/SKILL.md` | 3 | L82, L132, L164 |
| 3 | `sf-workflow-design-first/SKILL.md` | 2 | L135, L160 |
| 4 | `sf-workflow-feature-spec/SKILL.md` | 4 | L63, L90, L119, L144 |
| 5 | `sf-workflow-investigation/SKILL.md` | 2 | L98, L168 |
| 6 | `sf-workflow-ops-task/SKILL.md` | 2 | L114, L154 |
| 7 | `sf-workflow-quick-change/SKILL.md` | 2 | L76, L247 |
| 8 | `sf-workflow-refactor/SKILL.md` | 2 | L86, L135 |

**改动性质**：纯文本替换 `specforge/specs/` → `.specforge/specs/`，无逻辑变更。

**⚠️ 发现问题 3**：这 8 个文件路径在 `.opencode/skills/` 和 `.opencode-/skills/` 两处各有一份（共 16 份副本）。T3 只需处理 `.opencode/skills/`（无尾横线），`.opencode-/skills/` 在 T11 删除。但需确保安装脚本（sf-installer）部署时也使用正确路径。

---

### T4：Agent prompt 路径修正（4 个文件，7 处替换）

4 个 Agent prompt 文件使用 `specforge/specs/`（不带点），需统一为 `.specforge/specs/`（带点）。

| # | 文件 | 替换数 | 行号 | 内容 |
|---|------|--------|------|------|
| 1 | `sf-task-planner.md` | 2 | L157, L196 | 目录描述 + files_changed 示例 |
| 2 | `sf-requirements.md` | 2 | L187, L211 | 目录描述 + files_changed 示例 |
| 3 | `sf-design.md` | 2 | L207, L228 | 目录描述 + files_changed 示例 |
| 4 | `sf-knowledge.md` | 1 | L91 | 目录描述 |

**其余 5 个 Agent 文件**（`sf-orchestrator.md`, `sf-executor.md`, `sf-debugger.md`, `sf-reviewer.md`, `sf-verifier.md`）经扫描不含 `specforge/specs/` 路径，无需修改。其中 `sf-orchestrator.md` L254 有 `specforge/agents/AGENT_CONSTITUTION.md`，但这是 Agent prompt 自身的加载路径，属于 opencode 框架约定，不在本次切换范围。

**改动性质**：纯文本替换，无逻辑变更。

---

### T5：permission-engine 与其他模块路径切换（7 个文件，~10 处替换）

| # | 文件 | 替换数 | 模式 | 关键行 |
|---|------|--------|------|--------|
| 1 | `services/builtin-policy-loader.ts` | 1 | `specforge/config` | L44 `path.join(process.cwd(), 'specforge', 'config', 'builtin-policies')` |
| 2 | `services/static-api-checker.ts` | 1 | `specforge/observability` | L394 `'./specforge/observability/events.jsonl'` |
| 3 | `services/plugin-permission-validator.ts` | 1 | `specforge/observability` | L95 `'./specforge/observability/events.jsonl'` |
| 4 | `services/plugin-loader-integration.ts` | 1 | `specforge/observability` | L164 `'./specforge/observability/events.jsonl'` |
| 5 | `index.ts` | 2 | `specforge/observability` | L80, L306 `` `./specforge/observability/events.jsonl` `` |
| 6 | `services/user-policy-loader.ts` | 1 | `.specforge` | L62 `'.specforge'`（目录名判断） |
| 7 | `hard-rules.ts` | 2 | `.specforge/` | L117 `'.specforge/'`（核心系统文件保护）; L278 `'file:.specforge/*'`（删除保护模式） |

**⚠️ 发现问题 4**：`specforge/observability/events.jsonl` 路径在 `directory-layout.ts` 的 LAYOUT 中**不存在对应 key**。按方案 A §4.1 的规划，`observability/events.jsonl` 将被拆分为 `runtime/wal.jsonl` + `logs/telemetry.jsonl`。permission-engine 的 `eventsFilePath` 默认值需要明确是替换为 `LAYOUT.runtimeWal` 还是 `LAYOUT.logsTelemetry`——这需要 design 阶段决策，不是 impact_analysis 的职责，但需标记为待决策项。

**不含路径引用的文件**（仅含 `@specforge/` 包名引用或纯注释）：`types/events.ts`, `types/user-policies.ts`, `types/builtin-policies.ts`, `services/two-step-confirmation.ts`, `services/remote-access-guard.ts`, `services/event-logger.ts`, `services/bearer-token-validator.ts`, `services/daemon-integration.ts`, `services/api-key-manager.ts`, `services/policy-enforcement-point.ts`, `services/user-binding.ts`。这些不需要修改。

---

### T6：setup/ 目录搬迁（新建目录结构 + git mv）

新建 `setup/` 目录，从 3 个来源搬迁安装源文件：

| 来源 | 目标 | 预估文件数 |
|------|------|-----------|
| `.opencode/` (agents/, tools/, skills/, plugins/) | `setup/userlevel-opencode/` | ~50 文件 |
| `scripts/lib/`（部署态依赖部分） | `setup/userlevel-scripts-lib/` | ~10 文件 |
| `templates/`（如果存在） | `setup/userlevel-templates/` | ~5 文件 |

**额外工作**：
- 创建 `setup/README.md`（总清单）
- 使用 `git mv` 保证历史可追溯
- 更新 `.gitignore`（如果 setup/ 下的 node_modules/ 需忽略）

**⚠️ 发现问题 5**：`.opencode/` 目录下有 `bun.lock` / `package-lock.json` / `node_modules/`，搬迁时需确认哪些是运行时依赖、哪些是构建产物。`node_modules/` 不应搬迁。

---

### T7：sf-installer.ts 改造（1 个主文件 + 8 个 lib 文件）

**主文件**：`scripts/sf-installer.ts`
- L148-151: `getUserLevelDir()` 返回 `~/.specforge/`
- L154, L326, L526: 模板部署路径 `~/.specforge/templates/`
- L612: 安装锁 `.specforge.lock`
- 需改为从 `setup/` 目录读取安装源

**lib/ 支撑文件**：

| # | 文件 | 替换数 | 关键内容 |
|---|------|--------|---------|
| 1 | `scripts/lib/project_runtime.ts` | ~25 | 大量 `specforge/` 相对路径定义（L52-81 的目录和文件清单），全量需要改为 `.specforge/` + LAYOUT 常量 |
| 2 | `scripts/lib/runtime_manifest.ts` | 2 | L22 `"specforge/runtime-manifest.json"`, L75 注释 |
| 3 | `scripts/lib/types.ts` | 2 | L208, L217 JSDoc 注释 |
| 4 | `scripts/lib/compatibility.ts` | 2 | L56 JSDoc, L104 错误消息 |
| 5 | `scripts/lib/install_lock.ts` | 2 | L159, L252 `join(userLevelDir, ".specforge.lock")` |
| 6 | `scripts/lib/lock.ts` | 1 | L64 `join(targetDir, ".specforge.lock")` |
| 7 | `scripts/lib/host-profile/scanner.ts` | 3 | L32 `~/.specforge/host-profile.json`, L133-134 `~/.specforge/`, `~/.specforge/logs` |
| 8 | `scripts/cleanup-project-runtime.ts` | ~15 | 全文大量 `specforge/` 引用 |

---

### T8：文档生成器 render-layout.ts（新增 1 个文件）

- 新建 `scripts/render-layout.ts`
- 读取 `packages/types/src/directory-layout.ts` 的 LAYOUT 常量
- 生成 `docs/conventions/directory-layout.md`
- 维护 `<!-- BEGIN: layout -->` / `<!-- END: layout -->` marker

**不涉及现有文件修改**（除非 README.md / AGENTS.md 中已有 marker 段落需要更新）。

---

### T9：specs/README.md 自动渲染机制（新增 1 个文件 + 基础设施）

- 新建 `scripts/render-specs-readme.ts`
- 读取所有 `WI-XXX/_meta.json`
- 渲染 `.specforge/specs/README.md`
- 需要与 daemon 的 `sf_state_transition` 集成（每次流转后触发重渲染）

**前置依赖**：所有现有 WI 需有 `_meta.json`。扫描发现当前 WI 目录可能部分缺少此文件，需要补全或处理缺失情况。

---

### T10：数据迁移实际执行（运行时操作，无代码改动）

执行 P0 产出的迁移脚本：
1. `scripts/migrations/v6-dir-backup.ts` — 备份仓库自身的 `specforge/` 目录
2. `scripts/migrations/v6-dir-rename.ts` — 将 `specforge/` → `.specforge/` 合并

**前提条件**：
- T1-T5 代码切换已完成（否则新代码会找不到旧路径数据）
- 仓库当前同时存在 `.specforge/` 和 `specforge/` 两个目录
- 迁移前需验证备份完整性

**⚠️ 发现问题 6**：迁移脚本是 P0 产物，但 P0 refactor_analysis.md 明确声明"P0 阶段**只生成代码、不执行迁移**"。这些脚本是否经过充分测试（dry-run）需要确认。

---

### T11：清理废弃备份（删除操作）

| 目标 | 类型 | 说明 |
|------|------|------|
| `.opencode-/`（带尾横线） | 目录 | 废弃备份，完整删除 |
| `opencode.json`（根目录） | 文件 | 空文件，无内容无引用 |
| 根目录临时文件 | 文件 | `test-error.txt`, `test-output.txt`, `test-output2.txt`, `test-output3.txt`, `test-help-output.ts`, `test-init.ps1`, `run-concurrent-init.ps1`, `run-init-test.js`, `task-4.7-completion-summary.md` |
| `agents/`（根目录） | 目录 | 空目录 |

**风险**：极低。这些文件/目录在 T1-T7 完成后已经没有引用。

---

## 风险评估

### 总体风险等级：**中高**

P1 涉及 40+ 文件的核心路径切换 + 数据迁移，任何一个文件的路径拼接错误都可能导致 daemon 无法启动或工作流中断。但风险可通过批次执行和充分回滚准备来管控。

### 各任务风险细分

| 任务 | 风险等级 | 理由 |
|------|---------|------|
| **T1** daemon-core 路径切换 | **高** | 核心 daemon 代码，63 处替换，3 种模式混合，涉及用户级路径（directory-layout.ts 未覆盖），一处错误可导致 daemon 全功能失效 |
| **T2** 部署态 tools 切换 | **中** | 是 T1 的副本，逻辑相同但部署态无类型检查保护；thin-client.ts 的 handshake 路径若出错则 daemon 通信中断 |
| **T3** SKILL.md 修正 | **低** | 纯文档文本替换，`specforge/` → `.specforge/`，无逻辑影响 |
| **T4** Agent prompt 修正 | **低** | 同 T3，纯文本替换 |
| **T5** permission-engine | **中** | `specforge/observability/events.jsonl` 路径在 LAYOUT 中无对应 key，需 design 决策；hard-rules.ts 的保护路径若改错可能导致安全策略失效 |
| **T6** setup/ 搬迁 | **中** | git mv 操作本身安全，但 sf-installer 的安装源路径需同步更新，否则新安装会失败 |
| **T7** sf-installer 改造 | **中** | 安装器是用户首次接触的入口，project_runtime.ts 有 25+ 处路径定义需全部切换 |
| **T8** render-layout.ts | **低** | 纯新增文件，不影响现有功能 |
| **T9** render-specs-readme.ts | **低** | 纯新增文件，但需集成到 daemon 流程中 |
| **T10** 数据迁移执行 | **高** | 最高风险：直接操作磁盘数据，合并双目录不可逆（虽然有备份）。必须在 T1-T7 全部验证通过后执行 |
| **T11** 清理废弃文件 | **极低** | 删除无引用文件，可随时 git checkout 恢复 |

### 关键风险缓解措施

1. **T1 的用户级路径问题**：在 development 开始前，需先扩展 `directory-layout.ts` 增加用户级路径常量（如 `SPEC_USER_DIR`、`resolveUserPath()`），或明确用户级路径不在 T1 范围内
2. **T10 的数据安全**：执行前必须 `--dry-run` 验证，备份后必须验证备份完整性
3. **批次间回归测试**：每完成一个批次必须跑 `bun run test` 确认无回归

---

## 回归测试范围

### 必须回归的模块

| 模块 | 测试命令 | 覆盖范围 | 说明 |
|------|---------|---------|------|
| daemon-core 全量 | `bun run test`（根目录） | 所有 unit/integration test | 核心路径切换后必须全量通过 |
| packages/types | `bun run test packages/types/` | directory-layout.test.ts + meta-schema.test.ts | 确认 LAYOUT 常量和构造函数正确 |
| packages/permission-engine | `bun run test packages/permission-engine/` | 权限检查、事件日志路径 | 验证 observability 路径替换后事件记录正常 |
| sf-installer | `bun scripts/sf-installer.ts verify` | 安装验证 | 确认安装源路径正确 |
| 8 种工作流端到端 | 手动验证或现有 e2e test | 各工作流完整流程 | 最小验证：创建 WI → requirements → design → tasks |
| daemon 启动 + plugin 加载 | 手动启动 daemon | Daemon.ts, HandshakeManager.ts | 确认 handshake 和路径解析正常 |

### 测试优先级

1. **P0（阻塞性）**：`bun run test` 全量通过 — 任何失败都必须立即修复
2. **P1（高优先级）**：`bun scripts/sf-installer.ts verify` — 安装器功能验证
3. **P2（中优先级）**：手动启动 daemon 验证 handshake — 通信路径验证
4. **P3（低优先级）**：SKILL.md / Agent prompt 内容审查 — 纯文档

### 已知测试债务

- `daemon-core` SessionRegistry 有 5 个 pre-existing 失败测试（WI-010 refactor_analysis.md 已记录），不属于本 WI 引入，不阻塞
- 迁移脚本的 `--dry-run` 测试需在 T10 执行前完成

---

## KG 关联

### 与 WI-010 的依赖关系

| 维度 | 关系 | 详情 |
|------|------|------|
| **产物依赖** | P1 消费 P0 产物 | `directory-layout.ts`（T1 核心依赖）、`meta-schema.ts`（T9 依赖）、`v6-dir-rename.ts` + `v6-dir-backup.ts`（T10 依赖） |
| **行为约束继承** | P1 继承 P0 的 21 条不变行为 | daemon 启动、Plugin 加载、工作流端到端、MCP I/O schema、测试基线（见 WI-010 refactor_analysis.md §不变行为声明） |
| **风险等级升级** | P0 低 → P1 中高 | P0 纯新增零修改，P1 全量切换 + 数据迁移 |
| **回滚依赖** | P1 回滚依赖 P0 备份机制 | T10 使用 `v6-dir-backup.ts` 的备份恢复 |

### WI-011 内部 KG 节点

| 节点 | 类型 | 说明 |
|------|------|------|
| `directory-layout.ts` | code_file | 单一真相源 Schema |
| `meta-schema.ts` | code_file | `_meta.json` zod schema |
| `v6-dir-rename.ts` | code_file | 迁移脚本 |
| `v6-dir-backup.ts` | code_file | 备份脚本 |
| T1-T11 | task | 11 个执行任务 |

---

## 待决策项（design 阶段需确认）

以下问题在 impact_analysis 中发现，需要在 design 阶段做出明确决策：

| ID | 问题 | 影响 | 建议处理方式 |
|----|------|------|-------------|
| **D1** | 用户级路径（`~/.specforge/...`）是否纳入 T1 切换范围？ | T1 汇总中约 10 处用户级路径 | 如纳入，需先扩展 `directory-layout.ts` 增加用户级路径常量 |
| **D2** | permission-engine 的 `specforge/observability/events.jsonl` 默认值应替换为哪个 LAYOUT key？ | T5 的 5 处替换 | 方案 A §4.1 规划拆分为 `runtime/wal.jsonl` + `logs/telemetry.jsonl`，需明确 permission-engine 用哪个 |
| **D3** | `.opencode-/`（废弃备份）在 T11 删除前，是否需要保留 git blame 历史？ | T11 | 当前计划是直接删除，如需保留历史可先 `git mv` 到 archive/ |
| **D4** | `scripts/lib/project_runtime.ts` 的 25+ 处 `specforge/` 路径是项目初始化代码，切换后对已安装用户的影响？ | T7 | 需确认是否需要向后兼容旧项目（已用 `specforge/` 初始化的项目） |
| **D5** | setup/ 搬迁后，`.opencode/` 目录保留还是删除？ | T6 + T11 | 方案 A §3.1 提到"选项 X：彻底干净"，但需确认对开发工作流的影响 |

---

## 影响统计

| 指标 | 数值 |
|------|------|
| **影响文件总数** | ~67（含部署态副本），其中 ~39 个唯一源码文件 |
| **代码替换总处数** | ~180-200 处（排除注释和 JSDoc） |
| **新增文件数** | 2（render-layout.ts, render-specs-readme.ts）+ setup/ 目录结构 |
| **删除文件/目录数** | ~15+（T11 清理） |
| **涉及包/模块** | daemon-core, types, permission-engine, scripts, .opencode 部署态 |
| **风险等级** | 中高（T1 + T10 为高风险点） |
| **回滚方案** | git revert + P0 备份恢复机制 |

---

## 附录：扫描范围与命中统计

| 扫描范围 | 文件数 | 命中文件数 | 命中行数 |
|---------|--------|-----------|---------|
| `packages/daemon-core/src/tools/lib/*.ts` | 26 | 15 | 63 |
| `packages/daemon-core/src/daemon/*.ts` | 3 | 3 | 10 |
| `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` | 1 | 1 | 2 |
| `packages/permission-engine/src/**/*.ts` | 18 | 7 | 10 |
| `.opencode/tools/lib/*.ts` | 28 | 16 | ~50 |
| `.opencode/skills/sf-workflow-*/SKILL.md` | 8 | 8 | 21 |
| `.opencode/agents/sf-*.md` | 9 | 4 | 7 |
| `scripts/sf-installer.ts` | 1 | 1 | 6 |
| `scripts/lib/*.ts` + 子目录 | ~10 | 8 | ~55 |
| **合计** | **~104** | **~63** | **~224** |

注：`@specforge/xxx` 包名引用（import 语句）不计入命中，因为它们是 npm 包名而非文件路径。JSDoc 注释中引用的路径仅作标记参考，替换优先级低于代码行。
