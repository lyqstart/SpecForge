# 影响分析：SpecForge V6 一次性切换方案

**Work Item**: WI-001
**变更类型**: 架构级全面重写（Change Request）
**分析日期**: 2026-05-24
**分析人**: sf-requirements Agent

---

## 变更范围

### 1.1 总体描述

本次变更是 SpecForge V5 到 V6 的**一次性全量切换**，涉及系统架构的根本性重构：从当前的 `.opencode/` 内嵌 Plugin 架构（单进程、文件直写、硬编码状态机）迁移到独立 Daemon 进程 + Thin Plugin + 数据驱动 Workflow 架构。

变更覆盖 **7 个 Epic、14 个 packages、19 个 custom tools、9 个 agent 定义、17 个 skill 文件**，以及全部运行时数据格式的更换（`specforge/` → `.specforge/`）。

### 1.2 按 Epic 分析

---

#### E1: Daemon Core 基石

| 维度 | 详情 |
|------|------|
| **功能范围** | 建立独立 Daemon 进程，提供 HTTP/SSE API 作为所有工具的统一后端；实现 WAL（Write-Ahead Log）状态管理、崩溃恢复（Recovery）、多项目支持（Multi-project）、内容寻址存储（CAS） |
| **涉及模块** | `packages/daemon-core/`（全新 package） |
| **受影响的现有文件** | 所有 `sf_*_core.ts`（当前直接读写文件系统 → 改为 HTTP 客户端） |
| **依赖关系** | 无前置依赖；是 E2/E3/E4 的基础 |
| **边界** | 不涉及 OpenCode Adapter（E7 负责）；不涉及 Workflow 定义格式（E4 负责） |

**关键变更点**：
- 当前 `sf_specforge_plugin_entry.ts`（2904 行，~102 KB）承担了初始化、修复、迁移、manifest 管理等全部职责 → 拆分为 Daemon Core 中的多个独立模块
- 当前状态存储在 `specforge/runtime/state.json`（单文件 JSON）→ 迁移到 WAL + CAS 模式
- 当前 `utils.ts` 中的 `appendJsonl`/`writeLog`/`recordGateResult` 直接写入文件系统 → 改为 Daemon HTTP API 调用

---

#### E2: Observability 子系统

| 维度 | 详情 |
|------|------|
| **功能范围** | 建立统一 Event schema，实现三级模式（silent/normal/verbose），重写 Conversation 记录器，注入 agent 身份信息，新增 sf-analyst 分析工具 |
| **涉及模块** | `packages/observability/`（全新 package） |
| **受影响的现有文件** | `sf_conversation_recorder_core.ts`（312 行，完全重写）、`utils.ts` 中的日志相关函数 |
| **依赖关系** | 依赖 E1（Daemon Core 提供 HTTP/SSE 端点） |
| **边界** | 不涉及权限控制（E3 负责）；不修改 agent 定义文件本身 |

**关键变更点**：
- 当前 `sf_conversation_recorder_core.ts` 将 OpenCode SDK `session.messages()` 转换为 JSONL → 需完全重写为通过 Daemon API 提交事件
- 当前 `specforge/runtime/events.jsonl` 的写入方式 → 通过 Daemon Event API
- 当前 Conversation 记录中 `agent=unknown` 问题 → 需在事件注入环节解决 agent 身份识别

---

#### E3: Permission Engine + Scope Gate

| 维度 | 详情 |
|------|------|
| **功能范围** | 实现三层规则合并器（global → project → session），发出决策事件（允许/拒绝），控制 Tool/File/Agent 三类边界 |
| **涉及模块** | `packages/permission-engine/`、`packages/scope-gate/`（2 个 package） |
| **受影响的现有文件** | 当前 V5 无独立权限引擎，权限逻辑散落在各 tool core 中 |
| **依赖关系** | 依赖 E1（Daemon Core 作为执行引擎） |
| **边界** | 不涉及 Workflow 定义（E4）；不改变现有 tool 的参数签名 |

**关键变更点**：
- 当前 `sf_specforge_plugin_entry.ts` 中的 `PermissionGuard` 使用简单检查 → 需替换为完整的三层规则合并器
- 当前 agent 调用权限无法正确识别（`agent=unknown`）→ 需在 Daemon 层面注入 agent 上下文

---

#### E4: Workflow Runtime（数据驱动）

| 维度 | 详情 |
|------|------|
| **功能范围** | 用 JSON workflow 定义替代硬编码状态机；实现 WorkflowEngine 和 GateRunner；Markdown 文档从 workflow 定义自动生成 |
| **涉及模块** | `packages/workflow-runtime/`（全新 package） |
| **受影响的现有文件** | `state_machine.ts`（235 行，完全删除）、8 个 `SKILL.md` 中的硬编码阶段表 |
| **依赖关系** | 依赖 E1（Daemon Core 提供 Workflow 执行环境） |
| **边界** | 不修改业务逻辑本身，仅改变定义和执行方式 |

**关键变更点**：
- 当前 `state_machine.ts` 包含 **8 张硬编码流转表**（`VALID_TRANSITIONS`, `BUGFIX_SPEC_TRANSITIONS`, `DESIGN_FIRST_TRANSITIONS`, `QUICK_CHANGE_TRANSITIONS`, `CHANGE_REQUEST_TRANSITIONS`, `REFACTOR_TRANSITIONS`, `OPS_TASK_TRANSITIONS`, `INVESTIGATION_TRANSITIONS`）→ 全部迁移为 JSON workflow 定义文件
- 当前 8 个 workflow SKILL.md 中的阶段表需要手动维护 → 改为 `scripts/render-workflow-docs.ts` 自动生成
- 新增 `~/.config/specforge/workflows/builtin/*.json`（8 个 workflow 定义文件）

**当前 8 个硬编码工作流类型**：
1. `feature_spec` — Feature Spec (Requirements-First)
2. `bugfix_spec` — Bugfix Spec
3. `feature_spec_design_first` — Feature Spec (Design-First)
4. `quick_change` — Quick Change
5. `change_request` — Change Request
6. `refactor` — Refactor
7. `ops_task` — Ops Task
8. `investigation` — Investigation

---

#### E5: Skill Loader 强制化

| 维度 | 详情 |
|------|------|
| **功能范围** | 建立 Skill Registry，在 phase-enter 时强制加载对应 skill，按 phase 自动注入 |
| **涉及模块** | 跨 package 的横切功能 |
| **受影响的现有文件** | 17 个 SKILL.md 文件（阶段表改为 auto-generated） |
| **依赖关系** | 依赖 E4（数据驱动 Workflow 提供 phase 定义） |
| **边界** | 不改变 skill 的内容逻辑，仅改变加载和注入机制 |

**关键变更点**：
- 当前 skill 加载依赖 LLM 自觉调用 `skill` tool → 改为 phase-enter 时由系统自动强制加载
- 当前 17 个 skill 文件中 8 个 workflow SKILL.md 包含硬编码阶段表 → 需改为从 workflow JSON 自动生成

**当前 17 个 skill 文件清单**：

| 类型 | 文件 | 受影响程度 |
|------|------|-----------|
| Workflow | `sf-workflow-feature-spec/SKILL.md` | 阶段表重写 |
| Workflow | `sf-workflow-design-first/SKILL.md` | 阶段表重写 |
| Workflow | `sf-workflow-bugfix-spec/SKILL.md` | 阶段表重写 |
| Workflow | `sf-workflow-quick-change/SKILL.md` | 阶段表重写 |
| Workflow | `sf-workflow-change-request/SKILL.md` | 阶段表重写 |
| Workflow | `sf-workflow-refactor/SKILL.md` | 阶段表重写 |
| Workflow | `sf-workflow-ops-task/SKILL.md` | 阶段表重写 |
| Workflow | `sf-workflow-investigation/SKILL.md` | 阶段表重写 |
| Superpowers | `superpowers-brainstorming/SKILL.md` | 注入机制变更 |
| Superpowers | `superpowers-code-review/SKILL.md` | 注入机制变更 |
| Superpowers | `superpowers-engineering-lessons/SKILL.md` | 注入机制变更 |
| Superpowers | `superpowers-subagent-driven-development/SKILL.md` | 注入机制变更 |
| Superpowers | `superpowers-systematic-debugging/SKILL.md` | 注入机制变更 |
| Superpowers | `superpowers-tdd/SKILL.md` | 注入机制变更 |
| Superpowers | `superpowers-verification-before-completion/SKILL.md` | 注入机制变更 |
| Superpowers | `superpowers-writing-plans/SKILL.md` | 注入机制变更 |
| Superpowers | `superpowers-knowledge-extraction/SKILL.md` | 注入机制变更 |

---

#### E6: Agent Roster 自动化触发

| 维度 | 详情 |
|------|------|
| **功能范围** | 实现重试计数硬执行（不再依赖自然语言指令），实现 completed 后自动触发 sf-knowledge 知识提取 |
| **涉及模块** | Agent 编排层 |
| **受影响的现有文件** | 9 个 agent.md 定义文件（阶段表改为 auto-generated） |
| **依赖关系** | 依赖 E5（Skill Loader 提供 phase-aware 上下文） |
| **边界** | 不改变 agent 的职责定义，仅改变触发和重试机制 |

**当前 9 个 agent 定义文件**：
1. `sf-orchestrator.md`
2. `sf-requirements.md`
3. `sf-design.md`
4. `sf-task-planner.md`
5. `sf-executor.md`
6. `sf-debugger.md`
7. `sf-reviewer.md`
8. `sf-verifier.md`
9. `sf-knowledge.md`

**关键变更点**：
- 当前重试机制依赖 orchestrator prompt 中的自然语言指令 → 改为 Daemon 级别的硬执行计数
- 当前 knowledge 提取依赖手动调度 → 改为 completed 状态到达时自动触发

---

#### E7: Adapter & Thin Plugin Cutover

| 维度 | 详情 |
|------|------|
| **功能范围** | 实现 OpenCodeAdapter，将 19 个 `sf_*.ts` tool 改为 <5KB 的 HTTP 客户端壳；删除所有 V5 老代码；提供 CLI 启动/停止 Daemon |
| **涉及模块** | `packages/opencode-adapter/`、`packages/plugin-loader/`、`packages/cli/`（3 个 package） |
| **受影响的现有文件** | 19 个 tool 文件全部重写，1 个大文件完全删除 |
| **依赖关系** | 依赖 E1-E6 全部完成 |
| **边界** | 这是最终切换 Epic，完成后 V5 代码完全移除 |

**关键变更点**：
- `sf_specforge_plugin_entry.ts`（2904 行，~102 KB）→ 完全删除
- 18 个 `sf_*.ts` tool 文件（当前包含完整业务逻辑）→ 改为 <5KB HTTP 客户端壳
- `state_machine.ts`（235 行）→ 完全删除
- `sf_state_transition_core.ts`（397 行）→ 完全删除
- `sf_state_read_core.ts` → 完全删除
- `sf_conversation_recorder_core.ts`（312 行）→ 完全删除
- `utils.ts` 中的 `appendJsonl`/`recordGateResult`/`writeLog` → 删除（功能迁移到 Daemon）

**当前 18+1 个 tool 文件清单**：

| 文件 | 当前职责 | V6 变更 |
|------|---------|---------|
| `sf_state_transition.ts` | 状态流转 | HTTP 壳 |
| `sf_state_read.ts` | 状态读取 | HTTP 壳 |
| `sf_artifact_write.ts` | 产物写入 | HTTP 壳 |
| `sf_context_build.ts` | 上下文构建 | HTTP 壳 |
| `sf_continuity.ts` | 跨会话续接 | HTTP 壳 |
| `sf_cost_report.ts` | 成本报告 | HTTP 壳 |
| `sf_knowledge_base.ts` | 知识库操作 | HTTP 壳 |
| `sf_knowledge_graph.ts` | 知识图谱写 | HTTP 壳 |
| `sf_knowledge_query.ts` | 知识图谱查 | HTTP 壳 |
| `sf_design_gate.ts` | 设计门禁 | HTTP 壳 |
| `sf_requirements_gate.ts` | 需求门禁 | HTTP 壳 |
| `sf_tasks_gate.ts` | 任务门禁 | HTTP 壳 |
| `sf_verification_gate.ts` | 验证门禁 | HTTP 壳 |
| `sf_doc_lint.ts` | 文档检查 | HTTP 壳 |
| `sf_trace_matrix.ts` | 追溯矩阵 | HTTP 壳 |
| `sf_batch_verify.ts` | 批量验证 | HTTP 壳 |
| `sf_doctor.ts` | 系统诊断 | HTTP 壳 |
| `sf_safe_bash.ts` | 安全命令 | HTTP 壳 |
| `sf_specforge_plugin_entry.ts` | 统一入口 | **完全删除** |

---

### 1.3 数据格式变更

| 数据类别 | V5 格式 | V6 格式 | 迁移策略 |
|----------|---------|---------|---------|
| 项目级目录 | `specforge/` | `.specforge/` | 无迁移，V5 全部废弃 |
| 状态文件 | `specforge/runtime/state.json`（单文件 JSON） | Daemon WAL + CAS | 无迁移，格式不兼容 |
| 事件日志 | `specforge/runtime/events.jsonl`（手动追加） | Daemon Event API | 无迁移 |
| 错误日志 | `specforge/logs/error.log`（手动追加） | Daemon Log API | 无迁移 |
| Checkpoints | `specforge/runtime/checkpoints/` | Daemon Recovery | 无迁移 |
| 知识图谱 | `specforge/knowledge/` | Daemon Knowledge Store | 无迁移 |
| Specs | `specforge/specs/WI-*/` | `.specforge/specs/WI-*/` | 目录重命名 |

### 1.4 受影响 packages（14个）

| Package | 所属 Epic | 变更类型 | 影响程度 |
|---------|----------|---------|---------|
| `packages/daemon-core/` | E1 | **全新** | 核心创建 |
| `packages/observability/` | E2 | **全新** | 核心创建 |
| `packages/permission-engine/` | E3 | **全新** | 核心创建 |
| `packages/scope-gate/` | E3 | **全新/重写** | 核心创建 |
| `packages/workflow-runtime/` | E4 | **全新** | 核心创建 |
| `packages/opencode-adapter/` | E7 | 重写 | 高 |
| `packages/plugin-loader/` | E7 | 重写 | 高 |
| `packages/cli/` | E7 | 重写 | 高 |
| `packages/self-healing/` | E1 | 适配 | 中 |
| `packages/multimodal/` | E2 | 适配 | 中 |
| `packages/types/` | 全局 | 扩展 | 中 |
| `packages/configuration/` | E1 | 重写 | 高 |
| `packages/migration/` | E7 | 适配 | 中 |
| `packages/version-unification/` | 全局 | 适配 | 低 |

---

## 风险评估

### 总体风险等级：🔴 **高（HIGH）**

### 2.1 风险评定理由

| 风险维度 | 评级 | 理由 |
|----------|------|------|
| **变更规模** | 🔴 高 | 涉及 7 个 Epic、14 个 packages、~4000+ 行代码删除、全新架构创建，是系统级全面重写 |
| **架构断裂性** | 🔴 高 | 从内嵌 Plugin 架构（单进程文件直写）到独立 Daemon + HTTP API 架构，属于根本性架构变更，无向后兼容 |
| **数据不兼容** | 🔴 高 | V5 所有运行时数据（state.json、events.jsonl、knowledge/ 等）格式全部废弃，22 个 WI 数据无法迁移 |
| **依赖链长度** | 🔴 高 | E1 → E2/E3/E4 → E5 → E6 → E7 线性依赖链长达 5 层，任何前置 Epic 延迟都会级联影响后续 |
| **单点故障** | 🔴 高 | E1 Daemon Core 是整个方案的基石，如果 Daemon 进程不稳定，所有上层功能全部不可用 |
| **测试覆盖** | 🟡 中 | 当前代码库中测试文件较少（仅发现 `scripts/` 下部分 `.test.ts`），重写后需要大量新测试 |
| **回滚难度** | 🔴 高 | 一次性切换意味着回滚需要完整恢复 V5 代码 + V5 数据，且 V5/V6 数据格式不兼容 |
| **并行开发风险** | 🟡 中 | E2/E3/E4 并行开发需要共享 E1 的 API 契约，接口不稳定时会导致大量返工 |

### 2.2 关键风险项

#### R1: Daemon 进程稳定性（风险：高）
- **描述**: 独立 Daemon 进程引入了进程间通信、端口管理、进程守护等新复杂度
- **影响**: Daemon 崩溃 = 全系统不可用
- **缓解**: 需在 M1 里程碑充分验证 Daemon 稳定性，包括崩溃恢复（Recovery）和 WAL 正确性

#### R2: HTTP API 延迟（风险：中）
- **描述**: 当前 V5 tool 直接函数调用（进程内），V6 改为 HTTP 调用（进程间），引入网络延迟
- **影响**: 每次 tool 调用增加 ~1-10ms 延迟，高频调用场景可能累积
- **缓解**: 本地 Daemon + localhost 通信可将延迟控制在可接受范围

#### R3: 状态机迁移正确性（风险：高）
- **描述**: 8 张硬编码流转表迁移为 JSON 定义，需要保证语义完全一致
- **影响**: 任何流转表错误都可能导致工作流中断或非法状态跳转
- **缓解**: 需要对 8 种工作流逐一进行迁移验证测试

#### R4: 并行开发接口契约（风险：中）
- **描述**: E2/E3/E4 并行开发需要共享 E1 的 Daemon API 契约
- **影响**: API 变更会导致并行模块返工
- **缓解**: 在 E1 完成后冻结 Daemon API 契约，或提供 API mock

#### R5: Thin Plugin 体积约束（风险：低-中）
- **描述**: 每个 tool 文件需控制在 <5KB
- **影响**: 如果某些 tool 的 HTTP 客户端逻辑复杂，可能超出限制
- **缓解**: 严格限制 tool 壳为纯参数转发 + 响应解析

#### R6: 目录迁移风险（风险：低）
- **描述**: `specforge/` → `.specforge/` 目录名变更
- **影响**: 所有引用 `specforge/` 路径的脚本和配置都需要更新
- **缓解**: 使用全局搜索替换，风险可控

---

## 回归测试范围

### 3.1 必须回归的功能模块

#### 模块 A: 状态管理（优先级：P0）

| 测试项 | 测试内容 | 关联 Epic |
|--------|---------|----------|
| ST-001 | 8 种工作流类型的状态创建 | E1, E4 |
| ST-002 | 所有合法状态流转的正确性（覆盖 8 张流转表的每条边） | E1, E4 |
| ST-003 | 非法状态流转的拦截和错误返回 | E1, E4 |
| ST-004 | 状态并发写入的正确性（乐观锁） | E1 |
| ST-005 | WAL 写入和恢复（模拟 Daemon 崩溃后重启） | E1 |
| ST-006 | CAS 内容寻址存储的读写一致性 | E1 |
| ST-007 | 多项目隔离（不同项目的状态互不干扰） | E1 |
| ST-008 | `sf_state_read` 单 WI 查询和全量查询 | E1, E7 |
| ST-009 | `sf_state_transition` 全参数组合（含 transition_context） | E1, E7 |

#### 模块 B: Gate 检查（优先级：P0）

| 测试项 | 测试内容 | 关联 Epic |
|--------|---------|----------|
| GT-001 | `sf_requirements_gate` 通过和失败场景 | E4, E7 |
| GT-002 | `sf_design_gate` 通过和失败场景 | E4, E7 |
| GT-003 | `sf_tasks_gate` 通过和失败场景 | E4, E7 |
| GT-004 | `sf_verification_gate` 通过和失败场景 | E4, E7 |
| GT-005 | Gate 结果的事件记录（通过 Observability） | E2, E4 |
| GT-006 | Gate 特定模式参数（如 `gate_mode: change_request`） | E4 |

#### 模块 C: Observability（优先级：P1）

| 测试项 | 测试内容 | 关联 Epic |
|--------|---------|----------|
| OB-001 | Event schema 一致性（结构化事件输出） | E2 |
| OB-002 | 三级模式切换（silent/normal/verbose） | E2 |
| OB-003 | Conversation 记录完整性（agent 身份、tool 调用链） | E2 |
| OB-004 | 成本报告聚合准确性 | E2 |
| OB-005 | 错误日志脱敏（敏感信息过滤） | E2 |

#### 模块 D: Permission & Scope（优先级：P1）

| 测试项 | 测试内容 | 关联 Epic |
|--------|---------|----------|
| PM-001 | 三层规则合并（global → project → session） | E3 |
| PM-002 | Tool 边界控制（禁止 tool 调用） | E3 |
| PM-003 | File 边界控制（禁止文件访问） | E3 |
| PM-004 | Agent 边界控制（禁止 agent 调度） | E3 |
| PM-005 | 决策事件审计（每次权限判断都记录） | E3 |
| PM-006 | agent 身份正确识别（不再出现 `agent=unknown`） | E3 |

#### 模块 E: Skill & Agent 系统（优先级：P1）

| 测试项 | 测试内容 | 关联 Epic |
|--------|---------|----------|
| SK-001 | Skill Registry 注册和查询 | E5 |
| SK-002 | Phase-enter 强制 skill 加载（每个 phase 都验证） | E5 |
| SK-003 | 8 个 workflow SKILL.md 自动生成内容与 V5 一致性 | E4, E5 |
| SK-004 | Agent 重试计数硬执行 | E6 |
| SK-005 | Completed 后 sf-knowledge 自动触发 | E6 |

#### 模块 F: Tool HTTP 壳（优先级：P0）

| 测试项 | 测试内容 | 关联 Epic |
|--------|---------|----------|
| TH-001 | 18 个 sf_*.ts tool 的 HTTP 调用正确性 | E7 |
| TH-002 | 每个 tool 壳文件大小 < 5KB | E7 |
| TH-003 | HTTP 错误处理（Daemon 不可用时的降级） | E7 |
| TH-004 | 超时处理（长耗时操作的 SSE 流） | E7 |

#### 模块 G: CLI & Daemon 管理（优先级：P1）

| 测试项 | 测试内容 | 关联 Epic |
|--------|---------|----------|
| CL-001 | Daemon 启动/停止/重启 | E1, E7 |
| CL-002 | Daemon 健康检查 | E1 |
| CL-003 | Daemon 端口冲突处理 | E1 |

#### 模块 H: 端到端工作流（优先级：P0）

| 测试项 | 测试内容 | 关联 Epic |
|--------|---------|----------|
| E2E-001 | Feature Spec 完整流程（intake → completed） | 全部 |
| E2E-002 | Bugfix Spec 完整流程 | 全部 |
| E2E-003 | Change Request 完整流程（含 impact_analysis） | 全部 |
| E2E-004 | Quick Change 完整流程 | 全部 |
| E2E-005 | Refactor 完整流程（含风险路径判定） | 全部 |
| E2E-006 | Ops Task 完整流程（含安全检查） | 全部 |
| E2E-007 | Investigation 完整流程 | 全部 |
| E2E-008 | Design-First 完整流程 | 全部 |

### 3.2 回归测试统计

| 分类 | 测试项数量 |
|------|-----------|
| 状态管理 | 9 |
| Gate 检查 | 6 |
| Observability | 5 |
| Permission & Scope | 6 |
| Skill & Agent | 5 |
| Tool HTTP 壳 | 4 |
| CLI & Daemon | 3 |
| 端到端工作流 | 8 |
| **合计** | **46** |

### 3.3 测试优先级排序

1. **P0 — 阻断性**（M1 里程碑必须通过）：ST-001~009, GT-001~004, TH-001~004, E2E-001
2. **P1 — 关键**（M2 里程碑必须通过）：OB-001~005, PM-001~006, SK-001~005, CL-001~003, E2E-002~008
3. **P2 — 重要**（发版前必须通过）：GT-005~006, 全量端到端测试

---

## KG 关联

### 4.1 受影响的 KG 概念节点

以下列出与本次变更直接相关的知识图谱概念节点，按变更类型分类：

#### 核心架构节点（需要新增/重定义）

| 节点 ID | 节点类型 | 标签 | 变更类型 |
|---------|---------|------|---------|
| `concept:daemon-core` | concept | Daemon Core 进程 | 新增 |
| `concept:http-api` | concept | HTTP/SSE API | 新增 |
| `concept:wal` | concept | Write-Ahead Log | 新增 |
| `concept:cas` | concept | Content-Addressable Storage | 新增 |
| `concept:thin-plugin` | concept | Thin Plugin (<5KB) | 新增 |
| `concept:workflow-engine` | concept | WorkflowEngine | 新增 |
| `concept:gate-runner` | concept | GateRunner | 新增 |
| `concept:skill-registry` | concept | Skill Registry | 新增 |
| `concept:permission-engine` | concept | 三层规则合并器 | 新增 |
| `concept:event-schema` | concept | 统一 Event Schema | 新增 |

#### 状态管理节点（需要更新）

| 节点 ID | 节点类型 | 标签 | 变更类型 |
|---------|---------|------|---------|
| `concept:state-machine` | concept | 状态机 | 重定义（硬编码 → 数据驱动） |
| `concept:state-transition` | concept | 状态流转 | 更新（文件直写 → HTTP API） |
| `concept:workflow-state` | concept | 工作流状态 | 更新（JSON 格式变更） |
| `concept:gate` | concept | Gate 门禁 | 更新（执行引擎变更） |
| `concept:recovery` | concept | 崩溃恢复 | 更新（新增 WAL 恢复） |

#### Agent & Skill 节点（需要更新）

| 节点 ID | 节点类型 | 标签 | 变更类型 |
|---------|---------|------|---------|
| `agent:sf-orchestrator` | agent | Orchestrator | 更新（触发机制变更） |
| `agent:sf-requirements` | agent | Requirements Agent | 更新（tool 调用方式变更） |
| `agent:sf-design` | agent | Design Agent | 更新 |
| `agent:sf-task-planner` | agent | Task Planner Agent | 更新 |
| `agent:sf-executor` | agent | Executor Agent | 更新 |
| `agent:sf-debugger` | agent | Debugger Agent | 更新 |
| `agent:sf-reviewer` | agent | Reviewer Agent | 更新 |
| `agent:sf-verifier` | agent | Verifier Agent | 更新 |
| `agent:sf-knowledge` | agent | Knowledge Agent | 更新（自动触发） |

#### 需要废弃的节点

| 节点 ID | 节点类型 | 标签 | 原因 |
|---------|---------|------|------|
| `concept:plugin-entry` | concept | Plugin Entry 大文件 | 被拆分为 Daemon + Thin Plugin |
| `concept:conversation-recorder` | concept | Conversation Recorder (V5) | 被 Observability 子系统替代 |
| `concept:permission-guard-v5` | concept | Permission Guard (V5) | 被 Permission Engine 替代 |

### 4.2 KG 边关系变更

| 源节点 | 目标节点 | 边类型 | 变更 |
|--------|---------|--------|------|
| `concept:daemon-core` | `concept:http-api` | provides | 新增 |
| `concept:daemon-core` | `concept:wal` | uses | 新增 |
| `concept:daemon-core` | `concept:cas` | uses | 新增 |
| `concept:workflow-engine` | `concept:state-machine` | replaces | 新增 |
| `concept:gate-runner` | `concept:gate` | executes | 新增 |
| `concept:permission-engine` | `concept:permission-guard-v5` | replaces | 新增 |
| `concept:thin-plugin` | `concept:http-api` | calls | 新增 |
| `concept:skill-registry` | `concept:event-schema` | emits | 新增 |

### 4.3 V5 → V6 概念映射

| V5 概念 | V6 概念 | 映射关系 |
|---------|---------|---------|
| `sf_specforge_plugin_entry.ts` | Daemon Core + Thin Plugin | 1 → N 拆分 |
| `state_machine.ts` 硬编码表 | `workflows/builtin/*.json` | 代码 → 数据 |
| `utils.ts` 文件写入 | Daemon HTTP API | 本地函数 → 远程调用 |
| `events.jsonl` 手动追加 | Observability Event API | 手动 → 自动 |
| `PermissionGuard` | Permission Engine + Scope Gate | 简单检查 → 三层合并 |
| Skill 手动加载 | Skill Registry 强制注入 | 依赖 LLM → 程序化保证 |
| Agent 手动触发 | Agent Roster 自动触发 | 自然语言 → 硬执行 |

---

## 附录 A: 文件变更清单

### 完全删除的文件（6 个）

| 文件路径 | 行数 | 说明 |
|----------|------|------|
| `.opencode/tools/lib/sf_specforge_plugin_entry.ts` | 2904 | V5 统一入口 |
| `.opencode/tools/lib/sf_state_transition_core.ts` | 397+ | 状态流转核心 |
| `.opencode/tools/lib/sf_state_read_core.ts` | - | 状态读取核心 |
| `.opencode/tools/lib/state_machine.ts` | 235 | 硬编码状态机 |
| `.opencode/tools/lib/sf_conversation_recorder_core.ts` | 312 | 会话记录核心 |
| `.opencode/tools/lib/utils.ts`（部分函数） | 259 | 共享工具（删除 3 个函数） |

### 重写的文件（18 个 tool）

| 文件路径 | 变更方式 |
|----------|---------|
| `.opencode/tools/sf_state_transition.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_state_read.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_artifact_write.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_context_build.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_continuity.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_cost_report.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_knowledge_base.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_knowledge_graph.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_knowledge_query.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_design_gate.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_requirements_gate.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_tasks_gate.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_verification_gate.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_doc_lint.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_trace_matrix.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_batch_verify.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_doctor.ts` | 改为 HTTP 壳 |
| `.opencode/tools/sf_safe_bash.ts` | 改为 HTTP 壳 |

### 重写的文件（9 个 agent + 8 个 workflow skill）

| 文件路径 | 变更方式 |
|----------|---------|
| `.opencode/agents/sf-orchestrator.md` | 阶段表改为 auto-generated |
| `.opencode/agents/sf-requirements.md` | 阶段表改为 auto-generated |
| `.opencode/agents/sf-design.md` | 阶段表改为 auto-generated |
| `.opencode/agents/sf-task-planner.md` | 阶段表改为 auto-generated |
| `.opencode/agents/sf-executor.md` | 阶段表改为 auto-generated |
| `.opencode/agents/sf-debugger.md` | 阶段表改为 auto-generated |
| `.opencode/agents/sf-reviewer.md` | 阶段表改为 auto-generated |
| `.opencode/agents/sf-verifier.md` | 阶段表改为 auto-generated |
| `.opencode/agents/sf-knowledge.md` | 阶段表改为 auto-generated |
| `.opencode/skills/sf-workflow-feature-spec/SKILL.md` | 阶段表改为 auto-generated |
| `.opencode/skills/sf-workflow-design-first/SKILL.md` | 阶段表改为 auto-generated |
| `.opencode/skills/sf-workflow-bugfix-spec/SKILL.md` | 阶段表改为 auto-generated |
| `.opencode/skills/sf-workflow-quick-change/SKILL.md` | 阶段表改为 auto-generated |
| `.opencode/skills/sf-workflow-change-request/SKILL.md` | 阶段表改为 auto-generated |
| `.opencode/skills/sf-workflow-refactor/SKILL.md` | 阶段表改为 auto-generated |
| `.opencode/skills/sf-workflow-ops-task/SKILL.md` | 阶段表改为 auto-generated |
| `.opencode/skills/sf-workflow-investigation/SKILL.md` | 阶段表改为 auto-generated |

### 新增的文件

| 文件路径 | 说明 |
|----------|------|
| `packages/daemon-core/src/**/*.ts` | Daemon Core 完整实现 |
| `packages/workflow-runtime/src/WorkflowEngine.ts` | 工作流引擎 |
| `packages/observability/src/**/*.ts` | Observability 子系统 |
| `packages/permission-engine/src/**/*.ts` | 权限引擎 |
| `packages/scope-gate/src/**/*.ts` | Scope Gate |
| `~/.config/specforge/workflows/builtin/feature_spec.json` | Feature Spec workflow 定义 |
| `~/.config/specforge/workflows/builtin/bugfix_spec.json` | Bugfix Spec workflow 定义 |
| `~/.config/specforge/workflows/builtin/design_first.json` | Design-First workflow 定义 |
| `~/.config/specforge/workflows/builtin/quick_change.json` | Quick Change workflow 定义 |
| `~/.config/specforge/workflows/builtin/change_request.json` | Change Request workflow 定义 |
| `~/.config/specforge/workflows/builtin/refactor.json` | Refactor workflow 定义 |
| `~/.config/specforge/workflows/builtin/ops_task.json` | Ops Task workflow 定义 |
| `~/.config/specforge/workflows/builtin/investigation.json` | Investigation workflow 定义 |
| `scripts/render-workflow-docs.ts` | Workflow Markdown 自动生成脚本 |

---

## 附录 B: 里程碑依赖图

```
M1 (T+4w)          M2 (T+9w)              M3 (T+11w)     M4 (T+14w)
┌─────────┐    ┌───────────────────┐    ┌───────────┐   ┌───────────┐
│ E1      │    │ E2  E3  E4       │    │ E5  E6    │   │ E7        │
│ Daemon  │───▶│ Obs Perm WF-Rt   │───▶│ Skill Agt │──▶│ Cutover   │──▶ V6.0
│ Core    │    │ (并行开发)         │    │           │   │ Delete V5 │
└─────────┘    └───────────────────┘    └───────────┘   └───────────┘
```

**关键路径**: E1 → E4 → E5 → E6 → E7（最长链，决定最短工期）
