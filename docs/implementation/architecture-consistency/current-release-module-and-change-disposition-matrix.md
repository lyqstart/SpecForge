# SpecForge 当前发布模块与修改处置矩阵

## 1. 文件职责

本文是《当前发布边界与模块收敛详细实施方案》Step 5 的冻结产物，负责把已经确认的 V6 当前发布边界转成可执行的模块、运行入口、部署资产和既有修改处置结论。

本文不改变产品范围。发生冲突时，权威顺序仍为：

1. `.kiro/specs/v6-architecture-overview/requirements.md`；
2. `.kiro/specs/v6-architecture-overview/design.md`；
3. `docs/adr/ADR-013-current-release-boundary-and-no-legacy-compatibility.md`；
4. 架构一致性治理总方案与 module specs；
5. 本矩阵；
6. 代码、测试、构建、安装器和部署现场。

本矩阵只授权 Step 6 按冻结结论实施，不授权跳过测试先行、删除历史治理证据、提交、推送或部署。

```text
BASELINE_BRANCH=main
BASELINE_HEAD=45a0cfee54306a3f29a8ca06dfa827b385b25e50
EXPERIENCE_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-001,EXP-004,EXP-007,EXP-008,EXP-011,EXP-016,EXP-017,EXP-020,EXP-025,EXP-026,EXP-033,EXP-040,EXP-043,EXP-044,EXP-045,EXP-058,EXP-059,EXP-060,EXP-063,EXP-065,EXP-074,EXP-086,EXP-087,EXP-094
REPEATED_ERROR_CHECK=PASS
```

## 2. 处置词义

| 结论 | 含义 | Step 6 行为 |
|---|---|---|
| `KEEP` | 属于当前发布且已有真实生产责任 | 保留能力；移除同一模块内的 legacy、重复实现和未获准子集 |
| `ENABLE` | V6 当前发布明确需要，但当前缺少生产调用、部署或发布验证 | 先加当前合同测试，再完成唯一调用链、artifact、installer 和验证闭环 |
| `REMOVE` | 不属于当前发布，或与唯一责任重复 | 从 exports、build、registry、loader、installer、manifest 和运行入口退出；历史记录不删除 |
| `HISTORICAL_ONLY` | 仅用于审计和追溯 | 保留不可变历史字节，但禁止成为 Runtime、构建或发布决策输入 |

`KEEP` 不表示“现状不变”，`ENABLE` 也不表示通过 feature flag 打开已有全部能力。启用只允许启用本文列出的当前发布子集。

## 3. Package 与发布表面最终矩阵

### 3.1 十六个 package

| ID | 当前发布职责 | 最终结论 | Step 6 必须完成的边界 |
|---|---|---|---|
| `@specforge/types` | 中立类型、路径和 Runtime Contract | `KEEP` | 删除旧布局消费者；不得承载业务状态机 |
| `@specforge/daemon-core` | Daemon、HTTP/SSE、Session、Tool、Gate、WAL/state owner | `KEEP` | 产出唯一 `specforged`；删除旧项目自动识别/修复分支和版本化 public alias |
| `@specforge/cli` | 人/机命令客户端 | `KEEP` | 只经 Daemon/受控服务边界工作；删除 legacy paths 和重复 Scope Gate 真相 |
| `@specforge/workflow-runtime` | `feature_spec` 编排与统一 Work Item 生命周期 | `KEEP` | 解除对 daemon-core 的反向依赖；loader 只接纳当前获准 workflow |
| `@specforge/permission-engine` | Permission、Hard Rule、PEP、可追溯拒绝 | `KEEP` | 保留 rich actor/resource/context；所有写路径 fail closed |
| `@specforge/configuration` | 当前四层配置合并 | `KEEP` | 使用统一 `.specforge` 路径合同；配置经 Daemon 接纳后生效 |
| `@specforge/service-management` | daemon/OpenCode 服务规格与优雅关闭 | `KEEP` | 对齐唯一 `specforged` artifact，不再引用不存在或旧版 binary |
| `@specforge/host-profile` | 当前主机能力与项目初始化环境 | `KEEP` | 只使用当前 `~/.specforge` 和 `<project>/.specforge` 边界 |
| `@specforge/version-unification` | 仓库代码版本唯一读取入口 | `KEEP` | 只保留 `getCodeVersion()`；installer manifest、release set 和项目 schema migration 分别由 installer、Scope Gate、`@specforge/migration` 拥有 |
| `@specforge/plugin-loader` | P0 插件清单静态检查和权限声明验证 | `KEEP` | 只保留 P0 checker；运行时插件加载、热加载、sandbox/IPC 和动态 PluginRegistry 退出当前 artifact |
| `@specforge/observability` | 共享事件/CAS/查询合同 | `KEEP` | 与 daemon 内部重复实现合并为一个责任边界；Daemon 继续独占 WAL/project state |
| `@specforge/opencode-adapter` | 唯一 LLMKernelAdapter 实现 | `ENABLE` | 接入 Daemon 的真实生产调用和部署验证；不得由 Plugin 直连替代 |
| `@specforge/self-healing` | Gate 失败后的只读 Diagnose | `ENABLE` | 合并 daemon 重复 Recovery 责任；只允许 `triggered → diagnosing → blocked/END`，其他状态退出 exports/build |
| `@specforge/multimodal` | 统一 UserMessage、文本入口、非文本 fail closed | `ENABLE` | 接入 Daemon ingest 和 OpenCodeAdapter；OCR、解析、转写退出当前 artifact |
| `@specforge/migration` | owner 登记的当前产品线 per-file schema 链、备份和失败恢复 | `ENABLE_IN_PROGRESS` | Project Spec manifest precheck 已接 `ProjectManager.registerProject()`；继续登记其他 owner 并接 installer upgrade，禁止全局版本和固定目录猜测 |
| `@specforge/scope-gate` | requirements/design/matrix 与 release artifact 集合一致性 | `ENABLE` | 替换 CLI bridge；只作为 release/build gate，不进入业务 Runtime，不允许 P1/P2 feature flags |

冻结结果：十一个 package `KEEP`，五个 package `ENABLE`；没有整个 package 直接删除。删除发生在明确的 legacy、P1/P2、重复或无消费者子模块上。

### 3.2 非 package 发布表面

| 表面 | 最终结论 | 当前差异与完成标准 |
|---|---|---|
| `specforged` daemon artifact | `ENABLE` | 当前 producer、binary、handshake 和 live process 均缺失；必须由正式 build 生产并由 installer/service 消费 |
| `specforge` CLI artifact | `ENABLE` | package 可构建但当前 userlevel 安装不含 CLI；必须进入正式 artifact 和 smoke test |
| installer + release manifest | `ENABLE` | 从只复制 userlevel assets 收敛为 CLI、Daemon、Thin Plugin、获准 agents/skills/tools/`feature_spec` 的唯一安装集合 |
| OpenCode Thin Plugin | `KEEP` | 只上报事件、展示恢复状态和按需启动 Daemon；事件上报包含 ADR-012 要求的官方 `experimental.session.compacting` → Daemon `session.compacting` 有界 checkpoint 桥，Plugin 只做传输与诊断，不保存业务状态；删除本地 WriteGuard、shadow state、write/edit/apply_patch 业务判定 |
| 当前项目/用户配置和 handshake | `ENABLE` | 由 installer/Daemon 生成，hash/size 和 ownership 可验证 |
| ERR、Gate Attempt、审计记录、历史报告、Git history | `HISTORICAL_ONLY` | 保留字节；Runtime 不读取其旧行为作为兼容合同 |
| `.specforge/specs/**`、旧 `domain_model.md` 等旧布局 | `HISTORICAL_ONLY` | 仓库历史可保留；当前 Runtime、init、migration 和 installer 禁止读取/导入 |

## 4. 动态运行集合最终矩阵

### 4.1 Workflow

| 集合 | 最终结论 | 生产调用者 | 测试影响 | 部署影响 | 恢复影响 |
|---|---|---|---|---|---|
| `feature_spec` | `KEEP` | Workflow Runtime、Daemon start API | 保留并补充唯一-workflow loader 与 E2E | 进入 installer/manifest | 当前 schema 的活动 Work Item 可按权威状态恢复 |
| `architecture_change`、`bugfix_spec`、`change_request`、`contract_change`、`feature_spec_design_first`、`investigation`、`ops_task`、`quick_change`、`refactor`、`spec_migration` | `REMOVE` | 当前 loader 会目录扫描加载；无获准 V6 当前业务入口 | 旧 workflow 正向测试退出当前回归；保留 loader 拒绝/排除测试 | 从 build、loader 搜索集合、installer 和 manifest 排除 | 不支持恢复这些旧 workflow 的活动业务状态；发现时 fail closed，不自动转换为 `feature_spec` |

十个被移除 workflow 的 JSON/Skill 可以保留在 Git 历史或明确历史区，但不得继续位于可执行 builtin 搜索目录。

### 4.2 Agent roster

| 集合 | 最终结论 | 说明 |
|---|---|---|
| `sf-orchestrator`、`sf-requirements`、`sf-design`、`sf-task-planner`、`sf-executor`、`sf-debugger`、`sf-reviewer`、`sf-verifier`、`sf-knowledge` | `KEEP` | 当前 10-Agent roster 中已存在的九项；`sf-knowledge` 仅保留有限骨架 |
| `sf-analyst` | `ENABLE` | V6 当前 roster 必需；只读 observability 并输出结构化分析 |
| `sf-investigator`、`sf-evidence-collector`、`sf-extension` | `REMOVE` | 不在 V6 当前 10-Agent roster；其必要调查、证据和契约责任回归现有九个角色及 Daemon 治理链，不保留第二套 owner |
| `_AGENT_BASE` | `KEEP` | 作为共享模板，不计入 10 个运行 Agent |

删除三项额外 Agent 时，必须同步：orchestrator 的调度表、artifact owner 校验、agent schema/tests、installer manifest 和 live managed files。历史 handoff 中的 agent 名称只作为 `HISTORICAL_ONLY` 保留；不自动改写旧证据。

### 4.3 Skill 集合

| 集合 | 最终结论 | 消费者与删除闭包 |
|---|---|---|
| `sf-intake`、`sf-workflow-feature-spec` | `KEEP` | 当前 intake 和唯一产品 workflow |
| `superpowers-brainstorming`、`superpowers-writing-plans`、`superpowers-systematic-debugging`、`superpowers-code-review`、`superpowers-verification-before-completion`、`superpowers-knowledge-extraction` | `KEEP` | 被保留 Agent 或 `feature_spec` Skill 直接引用 |
| `sf-workflow-architecture-change`、`sf-workflow-bugfix-spec`、`sf-workflow-change-request`、`sf-workflow-contract-change`、`sf-workflow-design-first`、`sf-workflow-investigation`、`sf-workflow-ops-task`、`sf-workflow-quick-change`、`sf-workflow-refactor`、`sf-workflow-spec-migration` | `REMOVE` | 对应被移除的十个 builtin workflow；同步 Agent 路由、Skill loader tests、installer/manifest 和 live files |
| `superpowers-subagent-driven-development`、`superpowers-tdd`、`superpowers-engineering-lessons` | `REMOVE` | 当前保留 Agent/Skill 集合无直接引用；删除其 loader/manifest 正向断言，保留未知 Skill fail-closed 测试 |

### 4.4 Tool handler 与 wrapper 集合

当前冻结原则是“一个公开 Tool 名称、一个 Daemon owner、一个薄 wrapper”。内部 HTTP 路由可以调用非公开 handler，但必须有唯一、列明的 HTTP consumer，不得通过别名制造第二个公开合同。

| 集合 | 最终结论 | Step 6 动作 |
|---|---|---|
| `sf_artifact_write`、`sf_batch_verify`、`sf_changed_files_audit`、`sf_close_gate`、`sf_code_permission`、`sf_contract_register`、`sf_design_gate`、`sf_doc_lint`、`sf_doctor`、`sf_gate_run`、`sf_hard_stop_resolve`、`sf_knowledge_base`、`sf_merge_run`、`sf_project_init`、`sf_requirements_gate`、`sf_safe_bash`、`sf_semantic_closure_run`、`sf_state_read`、`sf_state_transition`、`sf_tasks_gate`、`sf_trace_matrix`、`sf_user_decision_record`、`sf_verification_gate` | `KEEP` | 保留为当前治理与 `feature_spec` 集合；`sf_knowledge_base` 只提供 V6 当前有限骨架 |
| `sf_work_item_repair_closure` | `REMOVE` | 仅提供旧顶层 tasks/trace 的兼容审计且不执行修复；当前 Candidate-first + Gate/Verification 已覆盖有效职责，ADR-013 不保留旧项目兼容入口 |
| `sf_git_agent_lock_acquire/release`、`sf_git_auth_profile_config`、`sf_git_branch_plan/create`、`sf_git_checkpoint_commit`、`sf_git_ignore_analyze/decision_record`、`sf_git_merge_plan/run`、`sf_git_post_merge_verify`、`sf_git_preflight`、`sf_git_push_branch`、`sf_git_release_tag_plan/create`、`sf_git_remote_config/probe` | `KEEP` | 保留当前 Git 受控变更、合并、验证和发布所需集合 |
| HTTP 内部的 work-item create、rollback、handoff、verification | `KEEP` | 保留能力，统一为无版本内部名；只允许已列明的 HTTP route 消费，不额外部署 wrapper |
| `sf_context_build`、`sf_continuity`、`sf_cost_report`、`sf_knowledge_graph`、`sf_knowledge_query` | `REMOVE` | 属于 REQ-25 P1 或完整知识能力；从 handler、wrapper、plugin 暴露、Agent/Skill 引用、tests、installer/manifest 同步退出 |
| `sf_spec_migration` / `sf_v11_spec_migration` | `REMOVE` | 旧 Project Spec 修复身份；当前 schema 升级只由 `@specforge/migration` 在 startup/upgrade 受控执行 |
| `sf_git_pr_plan`、`sf_git_stacked_branch_plan`、`sf_git_worktree_plan/create` | `REMOVE` | 当前 `feature_spec` 和 V6 发布闭环无消费者；PR/并行分支工作不进入当前 artifact |
| `sf_git_project_adopt` | `REMOVE` | 旧/既有项目接管路径与“只支持当前新项目/当前结构”边界冲突 |
| `sf_git_changed_files_audit` | `REMOVE` | 与权威 `sf_changed_files_audit` 重复；测试和调用者迁移到唯一审计实现 |
| `sf_write_guard_preflight` | `REMOVE` | Plugin 本地 WriteGuard 入口；写权限必须由 Daemon `sf_code_permission` 和正式 WriteGuard 决定 |
| `sf_v11_*` public alias map | `REMOVE` | 能力本身按上表保留或删除；所有保留能力统一无版本公开名，旧 alias 不兼容保留 |

Tool 删除闭包统一要求：生产引用（Plugin whitelist、HTTP route、Agent/Skill 文本、Tool registry）、单元/属性/集成测试、userlevel wrapper、`tools/lib` 副本、installer manifest 和 live managed files必须同时对账。恢复时遇到旧 Tool 名称必须明确拒绝，不静默映射。

### 4.5 Plugin、ExtensionLoader 与 userlevel lib

| 集合 | 最终结论 | 删除/启用闭包 |
|---|---|---|
| Plugin manifest 静态检查、权限声明验证 | `KEEP` | 由 `@specforge/plugin-loader` P0 checker 提供并接入 Daemon extension boundary |
| PluginRegistry 运行时装载、热加载、sandbox/IPC、process manager | `REMOVE` | plugin loading 当前明确关闭且属 P2；删除 exports/build/registry/tests/installer 正向消费者；失败恢复只返回不支持 |
| ExtensionLoader 的 Skill/Tool/Gate `loaded: true` 占位 | `REMOVE` | 不允许占位成功；当前获准静态资产由 installer/manifest 管理，未知动态扩展 fail closed |
| OpenCode `sf_specforge.ts` | `KEEP` | 收敛为 Thin Plugin；保留 ADR-012 的 project re-register + bounded compaction event bridge，checkpoint owner 仍是 Daemon RecoverySubsystem；删除本地业务规则、shadow state 和 write/edit/apply_patch 权威判断 |
| `tools/lib/*_core.ts` 本地业务副本 | `REMOVE` | wrapper 统一只经 thin client 调 Daemon；不再部署重复 Gate、WriteGuard、knowledge、context、verification 等 owner |
| `thin-client.ts` 与只读连接/展示所需最小 observability client | `KEEP` | 不写 project truth，不实现业务状态机 |

## 5. Legacy-only 与历史证据最终矩阵

| 集合 | 最终结论 | 生产调用者 | 测试 | 部署 | 恢复 |
|---|---|---|---|---|---|
| daemon 旧项目探测、自动 manifest/Project Spec 修复 | `REMOVE` | ProjectManager/init 当前仍有分支 | 删除旧项目成功路径测试，新增 fail-closed 当前结构测试 | 不进入 daemon artifact | 不自动升级旧项目；报告 unsupported layout |
| CLI `legacyPaths` 和 setup compatibility cleanup/adapter | `REMOVE` | CLI/init/installer | 删除兼容正向测试，保留拒绝未知布局测试 | installer 不扫描/搬运旧目录 | 不回退、不猜测、不重建 |
| version-unification `legacy/**`、旧 manifest adapter | `REMOVE` | CLI dynamic import/installer | 当前 manifest/schema tests 替代旧格式迁移 tests | exports/build/manifest 排除 | 未知/旧 manifest fail closed |
| migration 的旧项目 discovery/heuristic | `REMOVE` | 当前无合法生产调用；installer 有另一旧 migrator | 只保留当前 schema 链、单调性、备份/恢复测试 | 只部署当前 schema scripts | 失败回滚当前升级，不恢复旧业务行为 |
| `legacy_latest_snapshot` Gate 证据升级 | `KEEP` | Gate Attempt 历史证据读取器 | 只验证受支持当前 schema 链 | 不作为业务兼容模块部署 | 仅升级审计证据结构，不导入旧产品项目 |
| ERR、Gate Attempt、审计、历史报告 | `HISTORICAL_ONLY` | 无产品 Runtime caller | 完整性/不可变性测试可以保留 | 不进入运行决策集合 | 只用于追溯 |

### 5.1 当前发布集合机器投影

下列唯一机器块是本矩阵前述人工可读决策的结构化投影，不是新的产品范围权威。`@specforge/scope-gate` 只允许从该块生成逐项 release set，并在生成时绑定 V6 requirements、V6 design 和本矩阵的当前字节 SHA256。块内禁止自行声明 `sources`；缺失、重复、空组、重复 ID、未知分类、未知表面或 `complete=false` 一律失败关闭。

<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:START -->
```json
{
  "schemaVersion": "1.0",
  "releaseId": "specforge-v6-current",
  "complete": true,
  "itemGroups": [
    {
      "ids": ["@specforge/daemon-core", "@specforge/cli", "@specforge/workflow-runtime", "@specforge/permission-engine", "@specforge/observability", "@specforge/opencode-adapter"],
      "classification": "CURRENT_RELEASE_CORE",
      "requiredSurfaces": ["package_export", "clean_build", "release_manifest"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/requirements.md", ".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["@specforge/types", "@specforge/configuration", "@specforge/service-management", "@specforge/host-profile", "@specforge/version-unification", "@specforge/plugin-loader", "@specforge/self-healing", "@specforge/multimodal", "@specforge/migration", "@specforge/scope-gate"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["package_export", "clean_build", "release_manifest"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/requirements.md", ".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["runtime:specforged", "runtime:specforge", "plugin:sf_specforge"],
      "classification": "CURRENT_RELEASE_CORE",
      "requiredSurfaces": ["clean_build", "installer_asset", "release_manifest", "runtime_entry"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["release:installer", "release:release-manifest"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["clean_build", "release_manifest", "runtime_entry"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["runtime:current-config"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["installer_asset", "release_manifest"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["runtime:handshake"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["runtime_entry"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["workflow:feature_spec"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["dynamic_registry", "installer_asset", "release_manifest"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["workflow:architecture_change", "workflow:bugfix_spec", "workflow:change_request", "workflow:contract_change", "workflow:feature_spec_design_first", "workflow:investigation", "workflow:ops_task", "workflow:quick_change", "workflow:refactor", "workflow:spec_migration"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["agent:sf-orchestrator", "agent:sf-requirements", "agent:sf-design", "agent:sf-task-planner", "agent:sf-executor", "agent:sf-debugger", "agent:sf-reviewer", "agent:sf-verifier", "agent:sf-knowledge", "agent:sf-analyst"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["dynamic_registry", "installer_asset", "release_manifest"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["agent-template:_AGENT_BASE"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["installer_asset", "release_manifest"],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["agent:sf-investigator", "agent:sf-evidence-collector", "agent:sf-extension"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["skill:sf-intake", "skill:sf-workflow-feature-spec", "skill:superpowers-brainstorming", "skill:superpowers-writing-plans", "skill:superpowers-systematic-debugging", "skill:superpowers-code-review", "skill:superpowers-verification-before-completion", "skill:superpowers-knowledge-extraction"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["dynamic_registry", "installer_asset", "release_manifest"],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["skill:sf-workflow-architecture-change", "skill:sf-workflow-bugfix-spec", "skill:sf-workflow-change-request", "skill:sf-workflow-contract-change", "skill:sf-workflow-design-first", "skill:sf-workflow-investigation", "skill:sf-workflow-ops-task", "skill:sf-workflow-quick-change", "skill:sf-workflow-refactor", "skill:sf-workflow-spec-migration", "skill:superpowers-subagent-driven-development", "skill:superpowers-tdd", "skill:superpowers-engineering-lessons"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_artifact_write", "tool:sf_batch_verify", "tool:sf_changed_files_audit", "tool:sf_close_gate", "tool:sf_code_permission", "tool:sf_contract_register", "tool:sf_design_gate", "tool:sf_doc_lint", "tool:sf_doctor", "tool:sf_gate_run", "tool:sf_hard_stop_resolve", "tool:sf_knowledge_base", "tool:sf_merge_run", "tool:sf_project_init", "tool:sf_requirements_gate", "tool:sf_safe_bash", "tool:sf_semantic_closure_run", "tool:sf_state_read", "tool:sf_state_transition", "tool:sf_tasks_gate", "tool:sf_trace_matrix", "tool:sf_user_decision_record", "tool:sf_verification_gate"],
      "classification": "CURRENT_RELEASE_CORE",
      "requiredSurfaces": ["dynamic_registry", "installer_asset", "release_manifest"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_git_agent_lock_acquire", "tool:sf_git_agent_lock_release", "tool:sf_git_auth_profile_config", "tool:sf_git_branch_plan", "tool:sf_git_branch_create", "tool:sf_git_checkpoint_commit", "tool:sf_git_ignore_analyze", "tool:sf_git_ignore_decision_record", "tool:sf_git_merge_plan", "tool:sf_git_merge_run", "tool:sf_git_post_merge_verify", "tool:sf_git_preflight", "tool:sf_git_push_branch", "tool:sf_git_release_tag_plan", "tool:sf_git_release_tag_create", "tool:sf_git_remote_config", "tool:sf_git_remote_probe"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["dynamic_registry", "installer_asset", "release_manifest"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_work_item_create", "tool:sf_rollback", "tool:sf_handoff", "tool:sf_verification"],
      "classification": "CURRENT_RELEASE_CORE",
      "requiredSurfaces": ["dynamic_registry", "clean_build"],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_context_build", "tool:sf_continuity", "tool:sf_cost_report", "tool:sf_knowledge_graph", "tool:sf_knowledge_query"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/requirements.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_spec_migration", "tool:sf_v11_spec_migration", "tool:sf_work_item_repair_closure"],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_git_pr_plan", "tool:sf_git_stacked_branch_plan", "tool:sf_git_worktree_plan", "tool:sf_git_worktree_create"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_git_project_adopt"],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_git_changed_files_audit", "tool:sf_write_guard_preflight"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["tool:sf_v11_work_item_create", "tool:sf_v11_gate_run", "tool:sf_v11_merge", "tool:sf_v11_decision", "tool:sf_v11_code_permission", "tool:sf_v11_rollback", "tool:sf_v11_handoff", "tool:sf_v11_verification", "tool:sf_v11_semantic_closure_run"],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["plugin-loader:static-check"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["package_export", "clean_build"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["plugin-loader:runtime-registry", "plugin-loader:hot-reload", "plugin-loader:sandbox-ipc", "plugin-loader:process-manager"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["self-healing:diagnose"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["package_export", "clean_build"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["self-healing:propose", "self-healing:approve", "self-healing:apply", "self-healing:verify"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["multimodal:text-input", "multimodal:nontext-rejection"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["package_export", "clean_build"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["multimodal:ocr", "multimodal:parser", "multimodal:transcription"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["migration:current-schema"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["package_export", "clean_build"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["migration:legacy-discovery", "migration:legacy-heuristic"],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["scope-gate:release-validator"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["package_export", "clean_build"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["scope-gate:runtime-feature-flags"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/requirements.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["thin-plugin:event-reporting", "thin-plugin:recovery-display", "thin-plugin:daemon-start"],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": ["installer_asset", "release_manifest", "runtime_entry"],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["thin-plugin:local-writeguard", "thin-plugin:shadow-state", "thin-plugin:business-state"],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": ["docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["legacy:daemon-project-auto-detection", "legacy:cli-legacy-paths", "legacy:setup-compatibility-cleanup", "legacy:version-manifest-adapter", "legacy:migration-project-discovery"],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/requirements.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    },
    {
      "ids": ["history:error-ledger", "history:gate-attempts", "history:audit", "history:reports"],
      "classification": "HISTORICAL_EVIDENCE_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [".kiro/specs/v6-architecture-overview/requirements.md", ".kiro/specs/v6-architecture-overview/design.md", "docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md"]
    }
  ]
}
```
<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:END -->

## 6. “原 19 项修改”最终矩阵

### 6.1 数量口径纠正

`ORIGINAL_19` 是 SFV529 时点“15 个 stable-core 路径 + 4 个 edge 路径”的历史批次标识。当前可复核 Phase12 `ROOT_RESULTS_JSON` 在同一 HEAD 下明确列出 18 个产品/测试 dirty path；后续 ERR-881 和 ERR-796/C2 又形成独立修改。历史记录没有保存一份可直接重放的“当前仍 dirty 的 19 个产品路径”数组。

因此，本节不伪造第 19 个产品文件：前 18 行是当前 Phase12 快照可逐路径复核的修改，第 19 行是历史批次标识的治理纠正。后续文档应写“`ORIGINAL_19` 历史批次；当前 18 个可复核路径”，不得继续把历史计数当成当前 `git diff` 数量。

### 6.2 十九项决策

| # | 修改对象 | 对应责任/ERR | 决策 | 业务与架构理由 |
|---:|---|---|---|---|
| 1 | `packages/configuration/tests/integration.test.ts` | ERR-703 | `KEEP` | 测试消费统一 `.specforge` 当前路径，不是旧项目兼容 |
| 2 | `packages/configuration/tests/property/property-11.test.ts` | ERR-704 | `KEEP` | 修复生成器未真正保证唯一配置层的测试缺陷 |
| 3 | `packages/daemon-core/tests/property/path-resolver.property.test.ts` | ERR-723 | `KEEP` | 过滤含 `..` 的生成值，避免把非法路径当合法前置条件 |
| 4 | `packages/migration/tests/property/schema-version-monotonicity.property.test.ts` | ERR-725 | `KEEP` | 当前 schema 链仍必须满足单调性；不等于兼容旧项目 |
| 5 | `packages/observability/src/types/event-utils.ts` | ERR-724 | `KEEP` | `migration` 是当前事件合同的一部分；validator 必须与类型一致 |
| 6 | `packages/permission-engine/src/hard-rules.ts` | ERR-705 | `KEEP` | 身份维度不能被静态 action/resource allow 规则放宽 |
| 7 | `packages/permission-engine/src/index.ts` | ERR-707 | `KEEP` | 保留 actor/resource/context，符合 Permission 当前核心责任 |
| 8 | `packages/permission-engine/src/services/event-logger.ts` | ERR-707 | `KEEP` | 审计事件不能丢失结构化决策上下文 |
| 9 | `packages/permission-engine/src/services/policy-enforcement-point.ts` | ERR-707 | `KEEP` | PEP 到 PDP 必须传递真实 actor/resource/context |
| 10 | `packages/permission-engine/src/services/rule-merging-engine.ts` | ERR-705/707 | `KEEP` | Hard Rule、policy merge、cache 和 trace 使用同一结构化输入 |
| 11 | `packages/permission-engine/src/types/index.ts` | ERR-707 | `KEEP` | 为当前 Permission Contract 提供中立结构类型 |
| 12 | `packages/permission-engine/tests/property/hard-rule-immutability-simple.test.ts` | ERR-706 | `KEEP` | 测试与当前 hard-rule ID/语义映射一致 |
| 13 | `packages/permission-engine/tests/property/permission-decision-traceability-property-10.test.ts` | ERR-706/707/876 | `KEEP` | 验证当前拒绝与 trace 合同；尾随空格修复不改语义 |
| 14 | `packages/permission-engine/tests/unit/event-logging.test.ts` | ERR-706/707 | `KEEP` | 验证结构化 permission event 和当前 rule IDs |
| 15 | `packages/permission-engine/tests/unit/permission-engine.test.ts` | ERR-706 | `KEEP` | 删除旧编号语义，覆盖当前九条 Hard Rule |
| 16 | `packages/plugin-loader/tests/property/static-check-consistency.property.test.ts` | ERR-726 | `KEEP` | P0 静态检查属于当前 plugin-loader 子集；修复生成源码作用域冲突 |
| 17 | `packages/plugin-loader/tests/registry/plugin-registry-property.test.ts` | ERR-731 | `REMOVE` | 修复历史上真实，但测试对象是当前发布明确排除的运行时 PluginRegistry；随 P2 registry 退出，不以改测试掩盖产品缺陷 |
| 18 | `packages/service-management/tests/property/service-management-property-4-graceful-shutdown-no-event-loss.property.test.ts` | ERR-708 | `KEEP` | 测试只刷新 microtask，不提前触发生产 watchdog，验证当前 service 生命周期 |
| 19 | `ORIGINAL_19` 历史批次标识 | ERR-916 | `ADJUST` | 保留历史 count 事实，同时把当前可重放集合明确为 18 path；禁止发明缺失路径或改写旧记录 |

结果：十七项 `KEEP`、一项 `REMOVE`、一项治理口径 `ADJUST`。第 17 项只在 Step 6 与 PluginRegistry 生产代码、exports、tests 和部署闭包一起退出；在闭包完成前不单独删除测试。

### 6.3 后续独立修改

| 修改组 | 决策 | 理由 |
|---|---|---|
| ERR-881：三个现役 Work Item ID 消费者、测试和 userlevel plugin 对齐 | `KEEP` | 当前发布明确不保留旧 ID；最终 Plugin 收敛时把同一校验移到 Daemon 唯一 owner |
| ERR-796/C2：`state-concurrency.test.ts` 废止状态夹具同步 | `KEEP` | 当前 Runtime 状态消费者修复，不恢复旧状态名 |

## 7. Step 6 实施顺序与停止条件

Step 6 必须分批实施，不能一次删除全部模块后再补测试：

1. 固定 release-set、唯一 workflow、Agent/Skill/Tool 名称和 no-legacy 的正反合同；
2. 收敛 Tool registry、wrapper、Thin Plugin 和 userlevel `tools/lib`；
3. 收敛 workflow/Agent/Skill 集合；
4. 删除 daemon/CLI/version/setup/migration legacy paths；
5. 接入 opencode-adapter、self-healing Diagnose、multimodal P0、current migration、scope-gate release validator；
6. 生产 `specforged`、CLI、完整 installer/manifest；
7. 删除 PluginRegistry P2 子集及其第 17 项测试修改；
8. 进入 Step 7 分层验证。

```text
STEP_5_STATUS=FROZEN
PACKAGE_DISPOSITION=11_KEEP;5_ENABLE
WORKFLOW_DISPOSITION=1_KEEP;10_REMOVE
AGENT_DISPOSITION=9_KEEP;1_ENABLE;3_REMOVE;1_SHARED_TEMPLATE_KEEP
ORIGINAL_19_DECISIONS=17_KEEP;1_REMOVE;1_ADJUST
CODE_CHANGE_AUTHORIZED_NEXT=STEP_6_ONLY_WITH_TEST_FIRST_AND_BATCHED_CLOSURE
COMMIT_PUSH_DEPLOY_AUTHORIZED=NO
```

## 8. Step 8 剩余 daemon-core 红灯的当前发布必要性判定

### 8.1 判定规则

本节以第 3～5 节冻结的当前发布集合为权威，不以测试文件的历史存在本身证明其仍是发布门禁：

- `CURRENT_REQUIRED`：直接验证当前发布入口或核心业务闭环，必须修复并纳入全量回归；
- `CURRENT_INVARIANT`：验证当前能力跨实现长期成立的性质，必须保留，但夹具必须消费当前权威；
- `LEGACY_ONLY`：只验证已经明确退出当前发布的 workflow/module/runtime 行为，从可执行测试面删除；
- `INVALID_OR_DUPLICATE`：依赖本机现场、硬编码路径或重复验证旧入口，不能作为可重放门禁，从自动回归面删除；
- `DEFERRED_CONFLICT`：测试揭示权威文件之间的真实冲突，在用户延期治理前保持显式，不通过修改测试消除。

### 8.2 ERR-1122 第二次全量基线剩余 24 文件

| 测试文件 | 判定 | 当前业务/架构责任 | 处理决定 |
|---|---|---|---|
| `tests/design-governance-orchestrator-closure.test.ts` | `DEFERRED_CONFLICT` | 当前 Design Governance 与 Orchestrator 契约 | 保留；ERR-1186 明确延期，禁止掩盖 1 个预期红灯 |
| `tests/investigation-no-code-lifecycle.test.ts` | `LEGACY_ONLY` | 已退出的 `investigation` workflow | 删除可执行测试；不恢复 workflow |
| `tests/performance.test.ts` | `CURRENT_REQUIRED` | 当前 Daemon/State/Event 性能底线 | 保留并按当前 API、临时根和当前状态修复 |
| `tests/production-daemon-startup-recovery-e2e.test.ts` | `CURRENT_REQUIRED` | 当前 daemon handshake、重连与恢复 | 保留并对齐当前 handshake owner/schema |
| `tests/project-init-module-registry-normalization.test.ts` | `CURRENT_REQUIRED` | 当前 Project 初始化与 Module Registry | 保留并修复当前夹具或产品首次偏离 |
| `tests/v11-full-daemon-startup-writeguard-e2e.test.ts` | `CURRENT_REQUIRED` | 当前 daemon 启动与 Write Guard | 保留；文件名版本标签不决定去留，按真实当前调用链修复 |
| `tests/v11-production-daemon-writeguard-e2e.test.ts` | `INVALID_OR_DUPLICATE` | 测试内自建 HTTP server 并读取旧 `work_item.json.status`，未经过生产 HTTPServer | 删除可执行测试；当前真实链路由 `v11-full-daemon-startup-writeguard-e2e.test.ts` 覆盖 |
| `src/http/HTTPServer.test.ts` | `CURRENT_REQUIRED` | 当前 HTTP 边界 | 保留并使用可注入临时配置/路径 |
| `src/session/SessionRegistry.test.ts` | `CURRENT_INVARIANT` | 当前 Session 注册与身份一致性 | 保留并对齐当前生命周期合同 |
| `tests/property/property-1.test.ts` | `CURRENT_INVARIANT` | 当前 Event/WAL 顺序与一致性 | 保留，移除旧事件/Session 假设 |
| `tests/property/property-30.test.ts` | `CURRENT_INVARIANT` | 当前事件唯一性、schema 与 WAL | 保留并消费当前事件权威 |
| `tests/property/property-5.test.ts` | `CURRENT_INVARIANT` | 当前 Session identity/lifecycle | 保留并对齐当前 Session owner |
| `tests/property/property-6.test.ts` | `CURRENT_INVARIANT` | 当前 WAL/State 恢复确定性 | 保留并对齐 fail-closed 恢复合同 |
| `tests/property/register-idempotent.property.test.ts` | `CURRENT_INVARIANT` | 当前项目/Session 注册幂等性 | 保留并对齐当前注册前置条件 |
| `tests/property/startup-flow-ordering.property.test.ts` | `INVALID_OR_DUPLICATE` | 读取本机已部署 orchestrator 文档并断言旧 root manifest | 删除；当前启动与治理顺序由仓库内可重放 contract/E2E 覆盖 |
| `tests/unit/daemon.test.ts` | `CURRENT_REQUIRED` | 当前 Daemon 生命周期 | 保留并按当前依赖注入边界修复 |
| `tests/integration/api-endpoints.test.ts` | `CURRENT_REQUIRED` | 当前 HTTP API | 保留并隔离配置与用户目录 |
| `tests/integration/chaos-recovery.test.ts` | `CURRENT_INVARIANT` | 当前 WAL 崩溃恢复 | 保留并对齐当前恢复权威 |
| `tests/integration/daemon-integration.test.ts` | `CURRENT_REQUIRED` | 当前 daemon/session/project/recovery 集成 | 保留；拆除旧 API 夹具，不恢复旧实现 |
| `tests/integration/daemon-lifecycle.test.ts` | `CURRENT_REQUIRED` | 当前 Daemon 启停和恢复 | 保留并按当前 lifecycle owner 修复 |
| `tests/integration/extension-loader.test.ts` | `LEGACY_ONLY` | 已退出的动态 plugin/skill/tool/gate `loaded:true` 占位能力 | 删除；当前负边界由 `current-release-extension-boundary.test.ts` 覆盖 |
| `tests/integration/v11-daemon-live.test.ts` | `INVALID_OR_DUPLICATE` | 依赖本机已安装 daemon、硬编码项目与旧通用创建协议 | 删除自动回归；当前 HTTP/daemon E2E 使用隔离可重放环境 |
| `src/tools/lib/new-project-governance-bootstrap.test.ts` | `CURRENT_REQUIRED` | 当前 greenfield governance bootstrap | 保留并定位当前 trace 首次偏离 |
| `src/tools/lib/project-governance-greenfield-code-permission.test.ts` | `CURRENT_REQUIRED` | 当前 greenfield Code Permission | 保留并定位当前跨模块测试许可首次偏离 |

### 8.3 执行统计与边界

```text
ERR1122_REMAINING_CLASSIFIED_FILES=24
CURRENT_REQUIRED=11
CURRENT_INVARIANT=7
LEGACY_ONLY=2
INVALID_OR_DUPLICATE=3
DEFERRED_CONFLICT=1
EXECUTABLE_TESTS_TO_REMOVE=5
HISTORICAL_GOVERNANCE_RECORDS_TO_REMOVE=0
PRODUCT_BEHAVIOR_TO_RESTORE_FOR_LEGACY=0
NEXT_LEGAL_ACTION=RUN_FRESH_FULL_DAEMON_CORE_REGRESSION_TO_REBASE_ERR1122_THEN_CONTINUE_ROOT_AND_RELEASE_ARTIFACT_PROOF
```

### 8.4 ERR-1223 证据驱动重分类

初始分类仅依据文件名和测试描述把 `v11-production-daemon-writeguard-e2e.test.ts` 视为生产链路。当前 handshake 对齐后的并行验证证明，该文件 23/23 通过的是测试自建服务器和旧 metadata 生命周期读取；真实生产 `HTTPServer` 则由 `v11-full-daemon-startup-writeguard-e2e.test.ts` 覆盖并已 11/11 通过。因此本矩阵按一手调用链证据修正分类，不把“测试通过”误计为当前发布证明。

```text
RECLASSIFIED_FILE=tests/v11-production-daemon-writeguard-e2e.test.ts
FROM=CURRENT_REQUIRED
TO=INVALID_OR_DUPLICATE
REASON=SELF_BUILT_SERVER_AND_RETIRED_WORK_ITEM_STATUS_AUTHORITY
CURRENT_PRODUCTION_CHAIN=tests/v11-full-daemon-startup-writeguard-e2e.test.ts
```

## 9. Step 8 非 Daemon package 回归必要性判定

### 9.1 Plugin Loader

权威边界是第 3.1 与 4 节：当前 package 只保留 manifest、permission declaration 和 P0 static checker。是否曾经实现、测试是否绿色、README 是否曾公开，均不能把动态加载能力带回当前发布。

| 表面 | 判定 | 处理 |
|---|---|---|
| `current-release.ts`、manifest、permission declaration、StaticChecker 及其 AST/rules/path/reporter 闭包 | `CURRENT_REQUIRED` | 保留；修复 `process.env` 复合成员检测；16 文件/330 测试通过 |
| runtime PluginLoader、discovery、PluginRegistry、hot reload | `LEGACY_ONLY` | 删除源码、测试和运行示例；不恢复 |
| sandbox、IPC、process/resource manager | `LEGACY_ONLY` | 删除源码和测试；不恢复 |
| Plugin Loader 自有 grants/config/audit/recovery/events/tool integration | `DUPLICATE_OR_NONCURRENT_OWNER` | 删除；权限、配置、审计、恢复和 Tool Registry 由当前各自 owner 持有 |
| daemon 的旧 `@specforge/plugin-loader` ambient runtime declaration | `INVALID_OR_DUPLICATE` | 无现役源码消费者，删除 |
| `artifacts/CHANGELOG.md` | `HISTORICAL_ONLY` | 保留历史记录，不作为 Runtime 合同 |

```text
PLUGIN_LOADER_CURRENT_TESTS=16_FILES_330_PASS_0_FAIL
PLUGIN_LOADER_RETIRED_TEST_FILES_REMOVED=77
PLUGIN_LOADER_RETIRED_SOURCE_FILES_REMOVED=30
DAEMON_STALE_AMBIENT_DECLARATION_REMOVED=1
PLUGIN_LOADER_OLD_EXAMPLE_AND_CONFIG_DOC_SURFACES_REMOVED=13
HISTORICAL_GOVERNANCE_RECORDS_REMOVED=0
NEXT_NON_DAEMON_PACKAGE=WORKFLOW_RUNTIME
```

### 9.2 Workflow Runtime

权威边界是当前唯一 `feature_spec` 的有限治理状态推进、Gate 调度、事件顺序、持久化及 Work Item evidence/actor 约束。旧夹具不能要求失败 Gate 沿未分支的 string `next` 继续，也不能生成无法终止的循环图冒充当前有效工作流。

| 表面 | 判定 | 处理 |
|---|---|---|
| `WorkflowEngine`、`AgentWorkflowEngine`、当前 state/gate/event/persistence 路径 | `CURRENT_REQUIRED` | 保留；产品 fail-closed 与 evidence/actor/ownership guard 不削弱 |
| acceptance、persistence、evidence guard 失败项 | `CURRENT_REQUIRED_FIXTURE_DRIFT` | 对齐当前 `{pass,fail}`、metadata 1.1、seal actor 与真实临时文件系统错误；3 文件/63 测试通过 |
| event-ordering property | `CURRENT_INVARIANT` | 保留 100 次随机验证；生成有限前向图，失败 Gate 按当前拒绝语义验证拒绝前事件有序 |
| `WorkflowDefinitionLoader` 对 schema 2.0 的接纳及相反单测 | `DEFERRED_CONFLICT` | ERR-1234 保持显式红灯；等待四文档治理决定，不通过改测试消除 |
| 历史其他 workflow 定义/工厂 | `LEGACY_ONLY` 或 `BUILT_NOT_ENABLED` | 已按当前唯一 workflow 边界退出，不因本次回归恢复 |

```text
WORKFLOW_RUNTIME_TARGET_FIXTURES=3_FILES_63_PASS
WORKFLOW_RUNTIME_EVENT_ORDERING=1_FILE_16_PASS
WORKFLOW_RUNTIME_PROPERTY=10_FILES_156_PASS
WORKFLOW_RUNTIME_FULL=74_FILES_1589_PASS_1_FAIL
WORKFLOW_RUNTIME_WORKER_OOM=NONE_AFTER_FINITE_GENERATOR_FIX
WORKFLOW_RUNTIME_TYPECHECK=PASS
WORKFLOW_RUNTIME_BUILD=PASS
SOLE_REMAINING_FAILURE=ERR1234_DEFERRED_SCHEMA_AUTHORITY_CONFLICT
PRODUCT_GUARDS_WEAKENED=NONE
NEXT_NON_DAEMON_PACKAGE=CLI
```

### 9.3 CLI

CLI 是当前核心的人/机双模式客户端，只消费 Daemon、配置、服务与中立类型契约，不持有项目业务状态。隔离失败的七个文件均验证当前职责；本批只删除了一个错误归属于 help middleware、且已有专门 version owner 覆盖的重复用例。

| 表面 | 判定 | 处理 |
|---|---|---|
| Help/Mode/version/unknown command | `CURRENT_REQUIRED` | 保留真实 owner；help 测试启用 strictCommands 与生产同构 `.version(false)`，重复 help-version 用例删除 |
| JobWaiter | `CURRENT_REQUIRED` | 默认终态统一为 `completed/failed/blocked/cancelled`，自定义终态能力保留 |
| Interactive progress | `CURRENT_REQUIRED` | 产品输出不变；测试分别观察 stdout 渲染和 console 完成消息 |
| Init resource check/rollback | `CURRENT_REQUIRED` | 保留阈值、永不抛错与逆序回滚；用显式系统 seam/hoisted mock 替代不可变 ESM spy |
| Installation record | `CURRENT_REQUIRED` | SchemaVersionManager baseline 为唯一落盘 schema 权威，调用者 record 不可覆盖 |
| Release smoke | `CURRENT_REQUIRED` | 每场景恢复受控 process/fs mock；禁止单测真实卸载 |
| 四个未收集文件 | `CURRENT_REQUIRED_TEST_HARNESS` | 统一 Vitest runner 并使用 hoisted mock state，78/78 测试真实执行 |

```text
CLI_INITIAL=961_TESTS_921_PASS_40_FAIL_PLUS_4_COLLECTION_FAILURES
CLI_SEVEN_FILE_TARGET=114_TESTS_114_PASS
CLI_COLLECTION_TARGET=32_SUITES_78_TESTS_ALL_PASS
CLI_FULL=386_SUITES_1038_TESTS_ALL_PASS
CLI_TYPECHECK=PASS
CLI_BUILD=PASS
CURRENT_PRODUCT_FIX=INSTALLATION_RECORD_SCHEMA_MANAGER_BASELINE
INVALID_DUPLICATE_TEST_CASES_REMOVED=1
LEGACY_PRODUCT_BEHAVIOR_RESTORED=0
NEXT_NON_DAEMON_PACKAGE=OBSERVABILITY
```

### 9.4 Observability

Observability 是当前 Event/CAS/query/analysis 能力，但不是第二个 project WAL owner。Daemon 先持久化 `events.jsonl` 并确认，再由 EventLogger track/index；QueryAPI、sf-analyst 与 North Star 读取该权威日志。

| 表面 | 判定 | 处理 |
|---|---|---|
| Event/CAS contract、ModeSwitch、QueryAPI、sf-analyst、North Star | `CURRENT_REQUIRED` | 保留；当前 consumer 测试模拟 Daemon WAL producer 顺序 |
| EventLogger initialize/track/query/index | `CURRENT_SUPPORTING` | 保留；不得创建空 WAL，不得直接写 events/state；新增 3 项 owner 边界测试 |
| EventLogger 自写/fsync/recovery WAL 的 crash/unit 测试 | `WRONG_OWNER_LEGACY` | 删除 4 个可执行测试文件；Daemon WAL/recovery 回归继续持有责任 |
| root North Star report generation test | `INVALID_OR_DUPLICATE` | 删除 1 个固定仓库目录写入测试；integration 场景保留 |
| Minimal decision action set | `CURRENT_REQUIRED` | 统一 Gate passed/failed/checked、Permission evaluated、Workflow start/complete/fail/transition |
| Query actor filter fixtures | `CURRENT_FIXTURE_DRIFT` | 使用当前完整 AgentIdentity 与 sessionId，不增加旧 id 兼容 |

```text
OBSERVABILITY_INITIAL=206_SUITES_458_TESTS_347_PASS_111_FAIL
RETIRED_OR_DUPLICATE_TEST_FILES_REMOVED=5
CURRENT_OWNER_BOUNDARY_TESTS_ADDED=3
INTERMEDIATE=169_SUITES_363_TESTS_316_PASS_47_FAIL
CURRENT_CONSUMER_TARGET=136_TESTS_136_PASS
OBSERVABILITY_FULL=169_SUITES_363_TESTS_ALL_PASS
OBSERVABILITY_TYPECHECK=PASS
OBSERVABILITY_BUILD=PASS
SECOND_WAL_WRITER_RESTORED=NO
HISTORICAL_GOVERNANCE_RECORDS_REMOVED=0
NEXT_NON_DAEMON_PACKAGE=SCOPE_GATE
```

### 9.5 Scope Gate

Scope Gate 当前只属于构建/发布验证层：读取 V6 requirements、design、当前模块矩阵及 package/build/runtime/manifest/owner evidence，生成发布前 fail-closed 判定。它不进入业务 Runtime，也不再持有 P1/P2 feature flag、runtime scope registry 或重复 CLI 权威。

| 表面 | 判定 | 处理 |
|---|---|---|
| release-set validator、authority projection、artifact inventory、owner snapshot/surface producer、precheck | `CURRENT_REQUIRED` | 保留九个当前 release 模块；正式 precheck 和 114 项 package 回归通过 |
| Registry、RuntimeChecker、scope configuration/tag、REQ-25 loader/parser、AuditLogger/generator | `LEGACY_ONLY_OR_DUPLICATE` | 删除源码、exports 和可执行测试；不恢复 runtime scope 模型 |
| capability/feature-flag/scope-context/scope-validate CLI | `LEGACY_ONLY_OR_DUPLICATE` | 删除；当前唯一入口为 root release scripts |
| CLI scope-gate bridge 与顶层 `enable_*` runtime flags | `CONTRACT_CONFLICT` | 删除 bridge；默认配置不再生成，validator 对任何该类 flag 失败关闭 |
| 历史 package 文档 | `HISTORICAL_ONLY` | 保留并标明非当前权威，不删除治理历史 |

```text
SCOPE_GATE_INITIAL=1099_TESTS_1024_PASS_75_FAIL
SCOPE_GATE_CURRENT=24_FILES_114_TESTS_ALL_PASS
SCOPE_GATE_CURRENT_SOURCE_MODULES=9
SCOPE_GATE_TYPECHECK=PASS
SCOPE_GATE_CLEAN_BUILD=PASS
SCOPE_GATE_RETIRED_RUNTIME_OR_CLI_SURFACES_REMOVED=YES
CLI_RUNTIME_SCOPE_FLAGS_REMOVED=YES
LEGACY_COMPATIBILITY_RESTORED=NO
HISTORICAL_GOVERNANCE_RECORDS_REMOVED=0
```

### 9.6 确定性根回归门禁

原根脚本并发启动全部 workspace，使共享临时目录、文件系统和性能阈值相互污染。当前根门禁复用构建的冻结 package 顺序，逐包运行；无 test script 的 package 显式跳过；Vitest 1 使用 `maxWorkers=1/minWorkers=1`，Vitest 3/4 使用 `maxWorkers=1`。门禁保留任何真实非零退出，不提高测试 timeout，也不放宽产品断言。

```text
ROOT_TEST_EXECUTION=SEQUENTIAL_FROZEN_PACKAGE_ORDER
PACKAGE_INTERNAL_WORKERS=1_VERSION_AWARE
PACKAGES_WITHOUT_TEST_SCRIPT=EXPLICIT_SKIP
FAILURES_AGGREGATED_BEFORE_ROOT_EXIT=YES
TEST_TIMEOUTS_RELAXED=NO
```
