# WI-007 影响分析：SpecForge v1.1 Standard Alignment

> 本文档替代之前 Phase 3 (Property 21) 的影响分析。WI-007 范围已重新定义为 v1.1 标准对齐——将合并在大文件中的独立模块拆分为标准要求的独立 .ts 文件，并更新所有 Agent 定义、Skill 文件和用户级配置。

---

## 用户故事

作为 SpecForge 项目的维护者，我希望项目代码结构和文档完全符合 v1.1 标准的每一项要求，以便所有 v1.1 标准定义的模块、Agent、Skill 都能被准确引用和使用。

## 验收标准

1. [Ubiquitous] THE 系统 SHALL 为 v1.1 标准每个独立概念提供对应的 .ts 模块文件。
2. [Event-driven] WHEN v1.1 标准要求独立文件时，THE 系统 SHALL 将其从合并文件中拆分为独立模块并通过 re-export 保持向后兼容。
3. [Ubiquitous] THE 系统 SHALL 提供 `sf-extension.md` Agent 定义文件。
4. [Ubiquitous] 所有 Agent 定义文件 SHALL 反映 v1.1 的 Candidate/Delta/Gate/Trace/Evidence/Extension 概念。
5. [Ubiquitous] 所有 Skill 文件 SHALL 反映 v1.1 工作流路径和验证要求。
6. [State-driven] WHILE 整改过程中，94 个现有 v1.1 测试 SHALL 全部通过。
7. [Ubiquitous] 15 个包 SHALL 保持零 TypeScript 编译错误。

## 术语表

| 术语 | 定义 |
|------|------|
| v1.1 标准 | `specforge_final_fused_standard_v1_1_patch1_zh.md`，SpecForge 最终融合标准 v1.1 + 补丁1 |
| 独立模块 | 标准每个概念要求独立 .ts 文件，而非合并到大文件 |
| re-export | 从拆分后的文件重新导出，保持 import 路径不变 |
| Agent 定义 | `setup/userlevel-opencode/agents/*.md` 中定义 Agent 角色、职责、边界的 markdown 文件 |
| Skill | `~/.config/opencode/skills/` 中定义工作流执行协议的 markdown 文件 |
| Extension Subflow | 补丁1 定义的扩展注册子流程，需要独立的 sf-extension Agent |
| Candidate | v1.1 §8 定义的变更候选文件集 |
| Delta | v1.1 §8 定义的增量差异文件 |
| Gate | v1.1 §9 定义的质量门禁 |
| Trace | v1.1 §13 定义的追溯链 |

---

## 变更范围

### 1.1 代码模块 — 新建 24 个独立 .ts 文件

所有新建文件位于 `packages/daemon-core/src/tools/lib/`。

#### 1.1.1 从 workflow-path-selector-v11.ts（167 行）拆分

| # | 新建文件 | 变更类型 | 来源 | 标准章节 |
|---|----------|----------|------|----------|
| 1 | `change-classification.ts` | **CREATE** | §6.2 Classification 逻辑 | §6.2 |
| 2 | `impact-analysis.ts` | **CREATE** | §6.2 Impact Analysis 逻辑 | §6.2 |
| 3 | `trigger-result.ts` | **CREATE** | §6.3 MatchResultType + 路径匹配结果 | §6.3 |

拆分后 `workflow-path-selector-v11.ts` 保留 §6.4 workflow_path 枚举、§6.5 路径优先级、§6.6 unknown 升级规则、§6.7 code-only 约束，并 re-export 拆分模块的公开 API。

#### 1.1.2 新建模块（无现有拆分来源）

| # | 新建文件 | 变更类型 | 标准章节 | 说明 |
|---|----------|----------|----------|------|
| 4 | `required-files.ts` | **CREATE** | §8.2 | WI required_files 清单生成与校验 |
| 5 | `required-gates.ts` | **CREATE** | §9.1 | 每个状态所需的 Gate 列表定义 |

#### 1.1.3 从 gate-runner-v11.ts（910 行）拆分

| # | 新建文件 | 变更类型 | 来源 | 标准章节 |
|---|----------|----------|------|----------|
| 6 | `gate-report.ts` | **CREATE** | §9.4 Gate Report 生成逻辑 | §9.4 |
| 7 | `gate-summary.ts` | **CREATE** | §9.5 Gate Summary 生成逻辑 | §9.5 |
| 8 | `gate-chain.ts` | **CREATE** | §9.6 冻结规则 + Gate 链式执行 | §9.6 |

拆分后 `gate-runner-v11.ts` 保留 §9.2 GateIdV11 枚举、§9.3 hard_gate/soft_gate 分类、核心 `runRequiredGates` 入口，并 re-export 拆分模块。

#### 1.1.4 从 user-decision-recorder-v11.ts（191 行）拆分 / 新建

| # | 新建文件 | 变更类型 | 来源 | 标准章节 |
|---|----------|----------|------|----------|
| 9 | `user-decision.ts` | **CREATE** | §10.3-§10.5 核心决策类型和状态机 | §10 |
| 10 | `waiver.ts` | **CREATE** | §10.6 Waiver 记录逻辑（新增） | §10.6 |

#### 1.1.5 Write Guard 相关拆分 / 新建

| # | 新建文件 | 变更类型 | 来源 | 标准章节 |
|---|----------|----------|------|----------|
| 11 | `allowed-write-files.ts` | **CREATE** | code-permission-service-v11.ts 中 allowed_write_files 校验逻辑 | §12.3 |
| 12 | `write-policy.ts` | **CREATE** | write-guard-v11.ts 中策略规则定义 | §12.5 |
| 13 | `command-write-audit.ts` | **CREATE** | §12.7 命令写入审计 | §12.7 |
| 14 | `changed-files-audit.ts` | **CREATE** | §12.8 变更文件审计 | §12.8 |

#### 1.1.6 安全执行环境新建

| # | 新建文件 | 变更类型 | 标准章节 | 说明 |
|---|----------|----------|----------|------|
| 15 | `tool-wrapper.ts` | **CREATE** | §12.4 | 工具调用包装层（统一入口） |
| 16 | `bash-guard.ts` | **CREATE** | §12.9 | Bash 命令安全守卫 |

#### 1.1.7 从 verification-evidence-v11.ts（310 行）拆分

| # | 新建文件 | 变更类型 | 来源 | 标准章节 |
|---|----------|----------|------|----------|
| 17 | `verification-report.ts` | **CREATE** | §13.3 verification_report.md 校验 | §13.3 |
| 18 | `evidence-manifest.ts` | **CREATE** | §13.4 evidence_manifest.json 校验 | §13.4 |
| 19 | `evidence.ts` | **CREATE** | §13.5 Evidence 核心类型和收集逻辑 | §13.5 |
| 20 | `close-gate.ts` | **CREATE** | §13.6 WI close gate 最终验证 | §13.6 |

#### 1.1.8 从 extension-subflow-v11.ts（377 行）拆分

| # | 新建文件 | 变更类型 | 来源 | 标准章节 |
|---|----------|----------|------|----------|
| 21 | `extension-registry.ts` | **CREATE** | Extension 注册表管理 | Patch1 §6 |
| 22 | `extension-request.ts` | **CREATE** | extension_request.json 校验与写入 | Patch1 §6 |
| 23 | `extension-gate.ts` | **CREATE** | Extension Gate 检查逻辑 | Patch1 §6 |

#### 1.1.9 路径服务拆分 / 新建

| # | 新建文件 | 变更类型 | 来源 | 标准章节 |
|---|----------|----------|------|----------|
| 24 | `path-service.ts` | **CREATE** | 各模块中的路径计算逻辑集中 | §3 |
| 25 | `path-policy.ts` | **CREATE** | §3.5 路径策略规则 | §3.5 |
| 26 | `project-layout.ts` | **CREATE** | §1-§2 项目布局常量与服务 | §1-§2 |

> **注**：intake 列出 24 个模块，实际枚举为 26 个（gate-chain 和 path-policy 为细化拆分）。取 intake 上限 24 为正式范围，具体实现时合并或拆分由设计阶段确定。

### 1.2 packages/types/src/ — 新建 2 个文件

| # | 文件路径 | 变更类型 | 说明 |
|---|----------|----------|------|
| 1 | `packages/types/src/schema.ts` | **CREATE** | v1.1 标准 JSON Schema 定义（Candidate、Delta、Gate 等） |
| 2 | `packages/types/src/constants.ts` | **CREATE** | v1.1 标准常量（版本号、状态枚举、路径模板等） |

### 1.3 Agent 定义文件 — 10 UPDATE + 1 CREATE

所有文件位于 `setup/userlevel-opencode/agents/`。

| # | 文件 | 变更类型 | 更新内容 |
|---|------|----------|----------|
| 1 | `_AGENT_BASE.md` | **UPDATE** | 添加 v1.1 Candidate/Delta/Gate/Trace/Evidence 基础概念引用 |
| 2 | `sf-orchestrator.md` | **UPDATE** | 添加 WI 生命周期管理、状态机推进、Extension Subflow 调度 |
| 3 | `sf-design.md` | **UPDATE** | 添加 Design Delta / Candidate 生成要求、Gate 自检 |
| 4 | `sf-requirements.md` | **UPDATE** | 添加 Requirements Delta / Candidate 生成、Trace 链起始 |
| 5 | `sf-verifier.md` | **UPDATE** | 添加 Verification Report / Evidence Manifest / Close Gate 职责 |
| 6 | `sf-executor.md` | **UPDATE** | 添加 code_permission 遵守、allowed_write_files 声明、变更审计 |
| 7 | `sf-debugger.md` | **UPDATE** | 添加调试场景下的 Write Guard 豁免规则 |
| 8 | `sf-reviewer.md` | **UPDATE** | 添加 Review 的 Gate 集成、Candidate 校验 |
| 9 | `sf-task-planner.md` | **UPDATE** | 添加 Task 的 Trace 链维护要求 |
| 10 | `sf-knowledge.md` | **UPDATE** | 添加 KG 与 v1.1 概念的同步点 |
| 11 | `sf-extension.md` | **CREATE** | 新 Agent：Extension Subflow 执行者（Patch 1 新增） |

### 1.4 Skill 文件 — ~12 UPDATE

所有文件位于 `setup/userlevel-opencode/skills/`。

需要更新的 Skill（8 个工作流 Skill 必须更新，4 个 superpowers Skill 按需更新）：

| # | 文件 | 变更类型 | 更新内容 |
|---|------|----------|----------|
| 1 | `sf-workflow-feature-spec/SKILL.md` | **UPDATE** | 添加 Candidate/Delta/Gate 检查点 |
| 2 | `sf-workflow-design-first/SKILL.md` | **UPDATE** | 添加 Design Delta 生成步骤 |
| 3 | `sf-workflow-bugfix-spec/SKILL.md` | **UPDATE** | 添加 Bugfix Delta/Candidate 流程 |
| 4 | `sf-workflow-change-request/SKILL.md` | **UPDATE** | 添加 Change Request 影响分析 Gate |
| 5 | `sf-workflow-investigation/SKILL.md` | **UPDATE** | 添加 Investigation Close Gate |
| 6 | `sf-workflow-ops-task/SKILL.md` | **UPDATE** | 添加 Ops Task 审计要求 |
| 7 | `sf-workflow-refactor/SKILL.md` | **UPDATE** | 添加 Refactor 行为不变性 Evidence |
| 8 | `sf-workflow-quick-change/SKILL.md` | **UPDATE** | 添加 Quick Change 轻量验证模式 |
| 9 | `sf-intake/SKILL.md` | **UPDATE** | 添加 intake 阶段 required_files 生成 |
| 10 | `superpowers-subagent-driven-development/SKILL.md` | **UPDATE** | 添加 Write Guard / code_permission 遵守指令 |
| 11 | `superpowers-verification-before-completion/SKILL.md` | **UPDATE** | 添加 Evidence Manifest 校验 |
| 12 | `superpowers-writing-plans/SKILL.md` | **UPDATE** | 添加 Trace 链维护指令 |

### 1.5 用户级配置 — 1 UPDATE

| # | 文件 | 变更类型 | 更新内容 |
|---|------|----------|----------|
| 1 | `AGENT_CONSTITUTION.md`（`~/.config/opencode/agents/`） | **UPDATE** | 添加 v1.1 Candidate/Delta/Gate/Trace/Evidence/Extension 概念定义和 Agent 底线规则 |

### 1.6 Handler 文件 — 5 UPDATE

所有文件位于 `packages/daemon-core/src/tools/handlers/`。

| # | 文件 | 变更类型 | 更新内容 |
|---|------|----------|----------|
| 1 | `sf-v11-gate-run.ts` | **UPDATE** | import 路径从 gate-runner-v11 改为拆分后的子模块 |
| 2 | `sf-v11-merge.ts` | **UPDATE** | import 路径适配 merge-runner-v11 重导出 |
| 3 | `sf-v11-verification.ts` | **UPDATE** | import 路径从 verification-evidence-v11 改为拆分后的子模块 |
| 4 | `sf-v11-extension.ts` | **UPDATE** | import 路径从 extension-subflow-v11 改为拆分后的子模块 |
| 5 | `sf-v11-decision.ts` | **UPDATE** | import 路径适配 user-decision-recorder-v11 重导出 |

### 1.7 项目初始化 — 1 UPDATE

| # | 文件 | 变更类型 | 更新内容 |
|---|------|----------|----------|
| 1 | `packages/daemon-core/src/tools/lib/sf_project_init_core.ts` | **UPDATE** | 添加 v1.1 新目录结构初始化（candidates/、gates/、evidence/ 等目录） |

### 1.8 现有 -v11.ts 大文件 — 13 UPDATE（re-export）

拆分后原大文件必须保留并 re-export 拆分模块的公开 API，确保现有 handler 的 import 不中断。

| # | 文件 | 行数 | 变更类型 | 变更内容 |
|---|------|------|----------|----------|
| 1 | `workflow-path-selector-v11.ts` | 167 | **UPDATE** | 拆出 change-classification/impact-analysis/trigger-result，re-export |
| 2 | `gate-runner-v11.ts` | 910 | **UPDATE** | 拆出 gate-report/gate-summary/gate-chain，re-export |
| 3 | `user-decision-recorder-v11.ts` | 191 | **UPDATE** | 拆出 user-decision/waiver，re-export |
| 4 | `verification-evidence-v11.ts` | 310 | **UPDATE** | 拆出 verification-report/evidence-manifest/evidence/close-gate，re-export |
| 5 | `extension-subflow-v11.ts` | 377 | **UPDATE** | 拆出 extension-registry/extension-request/extension-gate，re-export |
| 6 | `code-permission-service-v11.ts` | 103 | **UPDATE** | 拆出 allowed-write-files，re-export |
| 7 | `write-guard-v11.ts` | 231 | **UPDATE** | 拆出 write-policy/command-write-audit/changed-files-audit，re-export |
| 8 | `state-machine-v11.ts` | 239 | **UPDATE** | 可能拆出 path-service 相关常量 |
| 9 | `merge-runner-v11.ts` | 287 | **UPDATE** | import 适配拆分模块 |
| 10 | `rollback-runner-v11.ts` | 313 | **UPDATE** | import 适配拆分模块 |
| 11 | `agent-handoff-v11.ts` | 220 | **UPDATE** | 添加 tool-wrapper / bash-guard 引用 |
| 12 | `spec-migration-v11.ts` | 353 | **UPDATE** | import 适配拆分模块 |
| 13 | `work-item-lifecycle-v11.ts` | 207 | **UPDATE** | 添加 required-files 生成调用 |

### 1.9 packages/types/src/index.ts — 1 UPDATE

| # | 文件 | 变更类型 | 更新内容 |
|---|------|----------|----------|
| 1 | `packages/types/src/index.ts` | **UPDATE** | 添加 schema.ts 和 constants.ts 的 re-export |

### 1.10 变更量级统计

| 类别 | 文件数 | 变更类型 |
|------|--------|----------|
| 新建独立模块（packages/daemon-core/src/tools/lib/） | 24 | CREATE |
| 新建类型文件（packages/types/src/） | 2 | CREATE |
| 新建 Agent 定义 | 1 | CREATE |
| 更新现有 -v11.ts 大文件（re-export） | 13 | UPDATE |
| 更新 Handler 文件 | 5 | UPDATE |
| 更新 Agent 定义 | 10 | UPDATE |
| 更新 Skill 文件 | 12 | UPDATE |
| 更新用户级配置 | 1 | UPDATE |
| 更新项目初始化 | 1 | UPDATE |
| 更新 types index | 1 | UPDATE |
| **合计** | **70** | **26 CREATE + 44 UPDATE** |

---

## 风险评估

**总体风险等级：中**

### 2.1 风险矩阵

| # | 风险项 | 概率 | 影响 | 风险等级 | 缓解措施 |
|---|--------|------|------|----------|----------|
| R1 | **94 个 v1.1 测试在模块重构后失败** | 中 | 高 | **中** | 拆分后原文件 re-export 全部公开 API；测试 import 路径不变则无影响；若测试直接引用内部符号则需更新 import |
| R2 | **import 路径断裂导致编译失败** | 中 | 高 | **中** | 所有原 -v11.ts 文件保留 re-export，现有消费者 import 路径不需要改变；TypeScript 编译器即时捕获 |
| R3 | **15 个包构建链断裂** | 低 | 高 | **中** | packages/types 新增 export 需确保 index.ts 正确导出；`npx tsc --noEmit` 逐包验证 |
| R4 | **Agent 定义变更影响在线 opencode 行为** | 中 | 中 | **中** | Agent MD 变更在 opencode 下次启动时生效；无热加载风险；但行为变化可能影响用户已熟悉的交互模式 |
| R5 | **循环依赖引入** | 中 | 中 | **中** | 拆分后子模块可能互相引用；设计阶段必须明确依赖方向（单向） |
| R6 | **re-export 遗漏导致运行时 TypeError** | 低 | 高 | **低** | 每个原文件的 re-export 必须覆盖所有原有 export；使用 `export * from` 模式 |
| R7 | **sf_project_init_core.ts 遗漏新目录** | 低 | 低 | **低** | 新增的 candidates/、gates/ 等目录若未加入初始化，Daemon 启动后功能正常但目录需手动创建 |

### 2.2 风险论证

**为何评为"中"而非"低"**：
1. 涉及 70 个文件的批量变更，其中 26 个为全新文件，任何遗漏都可能引发构建或运行时错误。
2. 94 个已有测试是硬约束——拆分必须保持所有测试绿灯，不能因重构降低覆盖率。
3. 15 个包的构建链意味着 packages/types 的变更会级联影响所有下游包。

**为何不评为"高"**：
1. 不涉及业务逻辑变更——纯结构性拆分和文档更新。
2. re-export 策略提供了向后兼容的保底方案——即使拆分不完美，原文件仍可作为单一入口使用。
3. TypeScript 编译器提供了即时的静态验证，不需要运行时才能发现问题。
4. 约束明确：现有功能不得删除，只可拆分/重导出。

### 2.3 最大风险场景

**最坏情况**：gate-runner-v11.ts（910 行）拆分为 3 个子模块后，handler `sf-v11-gate-run.ts` 的 import 路径发生变化，且 re-export 遗漏了 `GateIdV11` 类型，导致 94 个测试中引用该类型的用例全部编译失败。

**恢复策略**：回退到原 gate-runner-v11.ts 单文件模式，重新规划拆分边界。

---

## 回归测试范围

### 3.1 必须通过的 v1.1 测试（94 tests, 4 files）

| # | 测试文件 | 测试数 | 验证内容 | 风险点 |
|---|----------|--------|----------|--------|
| 1 | `packages/daemon-core/tests/v11-section21-acceptance.test.ts` | ~25 | §21 完整验收测试 | 可能 import 各模块内部类型 |
| 2 | `packages/daemon-core/tests/v11-daemon-e2e-http.test.ts` | ~20 | Daemon HTTP API 端到端 | 通过 handler 间接引用，风险低 |
| 3 | `packages/daemon-core/tests/v11-e2e-test.test.ts` | ~25 | 完整工作流端到端 | 综合性测试，覆盖面广 |
| 4 | `packages/daemon-core/tests/v11-runtime-integration.test.ts` | ~24 | 运行时集成测试 | 直接 import 各 -v11.ts 模块 |

### 3.2 必须通过的全量构建

| # | 验证项 | 命令 | 预期 |
|---|--------|------|------|
| 1 | 15 包 TypeScript 编译 | `npx tsc --noEmit`（逐包） | 零错误 |
| 2 | daemon-core 编译 | `cd packages/daemon-core && npx tsc --noEmit` | 零错误（新模块必须通过严格模式） |
| 3 | types 编译 + 下游 | `cd packages/types && npx tsc --noEmit` | 新 export 不破坏下游 |

**15 个包清单**：
1. `packages/types` — 新增 schema.ts / constants.ts
2. `packages/daemon-core` — 主要变更目标
3. `packages/workflow-runtime`
4. `packages/version-unification`
5. `packages/service-management`
6. `packages/scope-gate`
7. `packages/permission-engine`
8. `packages/observability`
9. `packages/host-profile`
10. `packages/configuration`
11. `packages/cli`
12. `packages/opencode-adapter`
13. `packages/self-healing`
14. `packages/plugin-loader`
15. `packages/multimodal`
16. `packages/migration`

### 3.3 现有集成测试（需回归确认）

| # | 测试文件 | 验证内容 | 影响评估 |
|---|----------|----------|----------|
| 1 | daemon-lifecycle 相关集成测试 | Daemon 启动/关闭流程 | sf_project_init_core 变更可能影响初始化行为 |
| 2 | handler 集成测试 | 各 handler 端到端功能 | import 路径变更可能影响 |

### 3.4 建议新增的验证

| # | 验证项 | 目的 |
|---|--------|------|
| 1 | 新模块独立编译验证 | 确认每个新建 .ts 文件可独立通过 `tsc --noEmit` |
| 2 | re-export 完整性验证 | 对比原文件 export 列表与 re-export 列表，确保无遗漏 |
| 3 | Agent 定义加载验证 | 确认 opencode 能正确解析更新后的 Agent MD 文件 |
| 4 | Skill 加载验证 | 确认 opencode 能正确加载更新后的 Skill 文件 |

---

## KG 关联

### 4.1 受影响的 KG 节点 — v1.1 运行时模块

| # | 节点类型 | 节点标识 | 变更类型 | 关联说明 |
|---|----------|----------|----------|----------|
| 1 | code_module | state-machine-v11 | UPDATE | §5 WI 状态机，可能拆出 path-service 相关 |
| 2 | code_module | workflow-path-selector-v11 | UPDATE | §6 路径选择，拆分 3 个子模块 |
| 3 | code_module | gate-runner-v11 | UPDATE | §9 Gate 运行器，拆分 3 个子模块 |
| 4 | code_module | user-decision-recorder-v11 | UPDATE | §10 决策记录器，拆分 2 个子模块 |
| 5 | code_module | code-permission-service-v11 | UPDATE | §12 代码权限，拆分 allowed-write-files |
| 6 | code_module | write-guard-v11 | UPDATE | §12.5 写入守卫，拆分 3 个子模块 |
| 7 | code_module | merge-runner-v11 | UPDATE | §11 合并运行器，import 适配 |
| 8 | code_module | verification-evidence-v11 | UPDATE | §13 验证证据，拆分 4 个子模块 |
| 9 | code_module | extension-subflow-v11 | UPDATE | Patch1 §6 扩展子流，拆分 3 个子模块 |
| 10 | code_module | rollback-runner-v11 | UPDATE | §16 回滚运行器，import 适配 |
| 11 | code_module | agent-handoff-v11 | UPDATE | §14.3 Agent 交接，添加引用 |
| 12 | code_module | spec-migration-v11 | UPDATE | §7.6 规格迁移，import 适配 |
| 13 | code_module | work-item-lifecycle-v11 | UPDATE | §4 WI 生命周期，添加 required-files |

### 4.2 受影响的 KG 节点 — Agent 定义

| # | 节点类型 | 节点标识 | 变更类型 | 关联说明 |
|---|----------|----------|----------|----------|
| 1 | agent_definition | sf-orchestrator | UPDATE | 添加 WI 生命周期、Extension Subflow 调度 |
| 2 | agent_definition | sf-design | UPDATE | 添加 Design Delta / Candidate / Gate |
| 3 | agent_definition | sf-requirements | UPDATE | 添加 Requirements Delta / Candidate / Trace |
| 4 | agent_definition | sf-verifier | UPDATE | 添加 Verification Report / Evidence / Close Gate |
| 5 | agent_definition | sf-extension | **CREATE** | 新 Agent：Extension Subflow 执行者 |
| 6 | agent_definition | sf-executor | UPDATE | 添加 code_permission / Write Guard 遵守 |
| 7 | agent_definition | sf-debugger | UPDATE | 添加 Write Guard 豁免 |
| 8 | agent_definition | sf-reviewer | UPDATE | 添加 Gate 集成 / Candidate 校验 |
| 9 | agent_definition | sf-task-planner | UPDATE | 添加 Trace 链维护 |
| 10 | agent_definition | sf-knowledge | UPDATE | 添加 KG 同步点 |
| 11 | agent_definition | _AGENT_BASE | UPDATE | 添加 v1.1 基础概念 |

### 4.3 受影响的 KG 节点 — 工作流 Skill

| # | 节点类型 | 节点标识 | 变更类型 | 关联说明 |
|---|----------|----------|----------|----------|
| 1 | workflow_skill | sf-workflow-feature-spec | UPDATE | 添加 Candidate/Delta/Gate 检查点 |
| 2 | workflow_skill | sf-workflow-design-first | UPDATE | 添加 Design Delta 生成 |
| 3 | workflow_skill | sf-workflow-bugfix-spec | UPDATE | 添加 Bugfix Delta/Candidate |
| 4 | workflow_skill | sf-workflow-change-request | UPDATE | 添加影响分析 Gate |
| 5 | workflow_skill | sf-workflow-investigation | UPDATE | 添加 Close Gate |
| 6 | workflow_skill | sf-workflow-ops-task | UPDATE | 添加审计要求 |
| 7 | workflow_skill | sf-workflow-refactor | UPDATE | 添加行为不变性 Evidence |
| 8 | workflow_skill | sf-workflow-quick-change | UPDATE | 添加轻量验证模式 |

### 4.4 新增 KG 边

| # | 源节点 | 目标节点 | 边类型 | 说明 |
|---|--------|----------|--------|------|
| 1 | sf-extension (agent) | extension-subflow-v11 (code) | agent_consumes | 新 Agent 消费 Extension Subflow 模块 |
| 2 | sf-orchestrator (agent) | sf-extension (agent) | dispatches_to | Orchestrator 调度 Extension Agent |
| 3 | sf-verifier (agent) | verification-report (code) | agent_consumes | Verifier 消费验证报告模块 |
| 4 | sf-verifier (agent) | evidence-manifest (code) | agent_consumes | Verifier 消费证据清单模块 |
| 5 | sf-executor (agent) | allowed-write-files (code) | agent_consumes | Executor 消费写入文件许可模块 |
| 6 | sf-executor (agent) | bash-guard (code) | agent_consumes | Executor 消费 Bash 守卫模块 |

---

## 5. 执行建议

### 5.1 建议分批执行顺序

**Phase A — 类型基础（无风险）**：
1. `packages/types/src/schema.ts` — 新建
2. `packages/types/src/constants.ts` — 新建
3. `packages/types/src/index.ts` — 更新 re-export
4. 验证：15 包 `tsc --noEmit` 全通过

**Phase B — 模块拆分（中风险）**：
1. 从最大文件开始：gate-runner-v11.ts → gate-report/gate-summary/gate-chain
2. verification-evidence-v11.ts → verification-report/evidence-manifest/evidence/close-gate
3. extension-subflow-v11.ts → extension-registry/extension-request/extension-gate
4. workflow-path-selector-v11.ts → change-classification/impact-analysis/trigger-result
5. 其他拆分
6. 每拆一个文件立即运行：`npx tsc --noEmit` + 94 测试

**Phase C — 新建模块（低风险）**：
1. required-files / required-gates / waiver 等全新模块
2. path-service / path-policy / project-layout
3. tool-wrapper / bash-guard
4. 验证：编译 + 测试

**Phase D — Handler 更新（低风险）**：
1. 5 个 handler 文件 import 路径适配
2. sf_project_init_core.ts 更新
3. 验证：编译 + 94 测试 + HTTP API 测试

**Phase E — Agent/Skill 文档（低风险，不影响编译）**：
1. 10 个 Agent MD 更新
2. sf-extension.md 新建
3. 12 个 Skill 文件更新
4. AGENT_CONSTITUTION.md 更新
5. 验证：opencode 加载测试

### 5.2 回滚策略

- 每个拆分文件保留原文件的完整 re-export
- 若某拆分导致测试失败，可立即回退：删除新文件，恢复原文件的完整实现
- packages/types 的新增文件不影响现有功能（新 export 需显式 import）
- Agent/Skill 文档变更是纯文本，可 git revert 无副作用

### 5.3 验证检查点

| 检查点 | 验证内容 | 通过标准 |
|--------|----------|----------|
| CP-1 | types 包编译 | `npx tsc --noEmit` 零错误 |
| CP-2 | 每次拆分后编译 | `npx tsc --noEmit` 零错误 |
| CP-3 | 每次拆分后测试 | 94/94 tests passed |
| CP-4 | 全量构建 | 15 包 `tsc --noEmit` 全零错误 |
| CP-5 | re-export 完整性 | 原文件 export 数量 = re-export 数量 |
| CP-6 | 最终全量验证 | 94 tests + 15 builds + integration tests |
