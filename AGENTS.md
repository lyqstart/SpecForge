# AGENTS.md - SpecForge Agent 总览文档

> 本文件是 SpecForge 系统中所有 Agent、调用层级、权限模型和工作流的总览文档。

---

## 1. Agent 列表

| Agent 名称 | 类型 | 职责概述 | 模型 | 关键权限 |
|------------|------|----------|------|----------|
| sf-orchestrator | primary | 项目管理、用户沟通、意图判断、工作流选择、阶段推进、子 Agent 调度 | anthropic/claude-sonnet-4-20250514 | task=allow, edit=ask, bash=ask |
| sf-requirements | subagent | 需求分析与 requirements.md 文档生成 | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-design | subagent | 设计文档生成（design.md） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-task-planner | subagent | 任务拆分与规划（tasks.md） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-executor | subagent | 代码编写与任务执行 | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-debugger | subagent | 调试与问题修复 | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-reviewer | subagent | 代码与文档审查（只读） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=deny, bash=ask |
| sf-verifier | subagent | 验证与测试执行（只读） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=deny, bash=ask |
| sf-knowledge | subagent | 知识积累：会话复盘、知识提取、泛化抽象（V5.0 新增） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=allow |

---

## 2. 调用层级

```
Depth 0: 用户 / OpenCode 主会话
  └── Depth 1: sf-orchestrator (primary agent)
        ├── Depth 2: sf-requirements (subagent)
        ├── Depth 2: sf-design (subagent)
        ├── Depth 2: sf-task-planner (subagent)
        ├── Depth 2: sf-executor (subagent)
        ├── Depth 2: sf-debugger (subagent)
        ├── Depth 2: sf-reviewer (subagent)
        └── Depth 2: sf-verifier (subagent)
```

**调用规则：**
- 最大调用深度为 3 层（用户 → Orchestrator → Sub-Agent）
- 只有 sf-orchestrator 可以调度子 Agent（permission.task = allow）
- 子 Agent 之间不可互相调用（所有子 Agent 的 permission.task = deny）
- 用户只与 sf-orchestrator 直接交互，子 Agent 不可直接向用户提问

---

## 3. 权限模型

### 3.1 核心权限约束

| 权限维度 | sf-orchestrator | 其余 7 个子 Agent | sf-reviewer / sf-verifier 特殊限制 |
|----------|----------------|-------------------|-------------------------------------|
| permission.task | allow（可调度子 Agent） | deny（不可调度其他 Agent） | deny |
| permission.edit | ask | ask | **deny**（不可编辑文件） |
| permission.bash | ask | ask | ask |
| permission.skill | ask | ask | ask |

### 3.2 权限模型说明

1. **子 Agent 隔离（permission.task = deny）**
   - 所有 7 个子 Agent 的 task 权限设为 deny
   - OpenCode 不会在子 Agent 的工具描述中展示其他 Agent，使其无法感知其他 Agent 的存在
   - 防止子 Agent 之间形成调用闭环或不可控的 Agent 链

2. **只读 Agent（permission.edit = deny）**
   - sf-reviewer 和 sf-verifier 不可编辑文件
   - 确保审查和验证的独立性——审查者不能自行修改代码

3. **状态变更集中管控**
   - 所有工作流状态变更必须通过 `sf_state_transition` 工具执行
   - 任何 Agent 不得直接读写 `specforge/runtime/state.json`
   - 状态流转工具内置乐观锁验证和合法性检查

4. **全局底线规则**
   - 所有 Agent 遵守 `specforge/agents/AGENT_CONSTITUTION.md` 中定义的 9 条底线规则
   - 包括：不得绕过 Gate、不得伪造验证、不得把推测当事实、不得直接修改权威状态等

---

## 4. Feature Spec 工作流（Requirements-First）

### 4.1 完整阶段流程

```
intake → requirements → requirements_gate → design → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
```

### 4.2 各阶段说明

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 | Gate 工具 |
|------|---------------|-------------|------|-----------|
| intake | —（Orchestrator 自行收集） | — | intake.md, spec.json | — |
| requirements | sf-requirements | superpowers-brainstorming | requirements.md | sf_requirements_gate |
| requirements_gate | — | — | Gate 判定结果。Gate pass 后自动同步 KG（scope=requirements） | sf_requirements_gate |
| design | sf-design | — | design.md | sf_design_gate |
| design_gate | — | — | Gate 判定结果。Gate pass 后自动同步 KG（scope=design） | sf_design_gate |
| tasks | sf-task-planner | — | tasks.md | sf_tasks_gate |
| tasks_gate | — | — | Gate 判定结果。Gate pass 后自动同步 KG（scope=tasks） | sf_tasks_gate |
| development | sf-executor | — | 代码文件（支持独立 Task 并行调度，V3.3） | — |
| review | sf-reviewer | — | 审查意见 | — |
| verification | sf-verifier | superpowers-verification-before-completion | 验证报告 | sf_verification_gate |
| verification_gate | — | — | Gate 判定结果。Gate pass 后自动同步 KG（scope=verification） | sf_verification_gate |

### 4.3 Gate 结果处理

| Gate 结果 | 动作 |
|-----------|------|
| pass | 状态流转到下一阶段 |
| fail | 回退到 Gate 对应的前一阶段，重新调度子 Agent 修订 |
| blocked | 状态流转到 blocked，向用户报告阻塞原因并等待指示 |

### 4.4 失败重试策略

- **executor 失败**：最多重试 2 次（首次 + 1 次重试）
- **debugger 介入**：executor 重试耗尽后调度 sf-debugger，最多 1 次
- **review repair loop**：review 发现问题时最多 1 次修复循环
- **并行失败重试**：并行批次中失败的 Task 移出批次后按串行方式重试，不阻塞后续批次（V3.3 新增）
- **超过限制**：标记 task 为 blocked，停止自动重试，等待用户指示

---

## 5. 可用 Custom Tools

| 工具名 | 文件路径 | 用途 |
|--------|----------|------|
| sf_state_read | `.opencode/tools/sf_state_read.ts` | 读取 Work Item 当前工作流状态 |
| sf_state_transition | `.opencode/tools/sf_state_transition.ts` | 执行状态流转（含乐观锁验证和合法性检查） |
| sf_doc_lint | `.opencode/tools/sf_doc_lint.ts` | 检查规格文档的结构合规性 |
| sf_requirements_gate | `.opencode/tools/sf_requirements_gate.ts` | 检查 requirements.md 质量 |
| sf_design_gate | `.opencode/tools/sf_design_gate.ts` | 检查 design.md 质量 |
| sf_tasks_gate | `.opencode/tools/sf_tasks_gate.ts` | 检查 tasks.md 质量 |
| sf_verification_gate | `.opencode/tools/sf_verification_gate.ts` | 检查验证阶段测试结果 |
| sf_knowledge_graph | `.opencode/tools/sf_knowledge_graph.ts` | Knowledge Graph 节点和边的 CRUD 操作 |
| sf_knowledge_query | `.opencode/tools/sf_knowledge_query.ts` | Knowledge Graph 查询和影响分析 |
| sf_context_build | `.opencode/tools/sf_context_build.ts` | 构建 Task Context 和 Capability Broker 推荐 |
| sf_knowledge_base | `.opencode/tools/sf_knowledge_base.ts` | 全局知识库 CRUD、检索、去重、效果反馈、质量管理（V5.0 新增） |

---

## 6. 可用 Skills

| Skill 名称 | 文件路径 | 用途 | 加载时机 |
|------------|----------|------|----------|
| superpowers-brainstorming | `.opencode/skills/superpowers-brainstorming/SKILL.md` | 指导 Agent 从 7 个维度进行需求头脑风暴 | requirements 阶段（sf-requirements 加载） |
| superpowers-verification-before-completion | `.opencode/skills/superpowers-verification-before-completion/SKILL.md` | 要求 Agent 在声明完成前提供验证证据 | verification 阶段（sf-verifier 加载） |
| sf-workflow-feature-spec | `.opencode/skills/sf-workflow-feature-spec/SKILL.md` | Feature Spec 工作流阶段执行协议 | 意图分类为 feature_spec 后（Orchestrator 加载） |
| sf-workflow-bugfix-spec | `.opencode/skills/sf-workflow-bugfix-spec/SKILL.md` | Bugfix Spec 工作流阶段执行协议 | 意图分类为 bugfix_spec 后（Orchestrator 加载） |
| sf-workflow-design-first | `.opencode/skills/sf-workflow-design-first/SKILL.md` | Design-First 工作流阶段执行协议 | 意图分类为 feature_spec_design_first 后（Orchestrator 加载） |
| sf-workflow-quick-change | `.opencode/skills/sf-workflow-quick-change/SKILL.md` | Quick Change 工作流阶段执行协议 | 意图分类为 quick_change 后（Orchestrator 加载） |
| superpowers-knowledge-extraction | `.opencode/skills/superpowers-knowledge-extraction/SKILL.md` | 知识提取框架流程（6 Phase）（V5.0 新增） | Work Item completed 后（sf-knowledge 加载） |
| sf-workflow-change-request | `.opencode/skills/sf-workflow-change-request/SKILL.md` | Change Request 工作流阶段执行协议（V3.6 新增） | 意图分类为 change_request 后（Orchestrator 加载） |
| sf-workflow-refactor | `.opencode/skills/sf-workflow-refactor/SKILL.md` | Refactor 工作流阶段执行协议，含双路径状态机（V3.6 新增） | 意图分类为 refactor 后（Orchestrator 加载） |
| sf-workflow-ops-task | `.opencode/skills/sf-workflow-ops-task/SKILL.md` | Ops Task 工作流阶段执行协议，含安全执行协议（V3.6 新增） | 意图分类为 ops_task 后（Orchestrator 加载） |
| sf-workflow-investigation | `.opencode/skills/sf-workflow-investigation/SKILL.md` | Investigation 工作流阶段执行协议，含用户接受确认流程（V3.6 新增） | 意图分类为 investigation 后（Orchestrator 加载） |

---

## 7. 工作流 Skill 加载协议（V3.2 新增）

### 7.1 加载时机

Orchestrator 在以下两种场景加载 Workflow Skill：

1. **新工作流**：意图分类完成 → 确定 Workflow_Type → 加载 Skill → 创建 Work Item
2. **会话恢复**：检测到进行中的 Work Item → 读取 workflow_type → 加载 Skill → 继续执行

### 7.2 路由映射

| Workflow_Type | Workflow_Skill |
|---------------|---------------|
| feature_spec | sf-workflow-feature-spec |
| bugfix_spec | sf-workflow-bugfix-spec |
| feature_spec_design_first | sf-workflow-design-first |
| quick_change | sf-workflow-quick-change |
| change_request | sf-workflow-change-request |
| refactor | sf-workflow-refactor |
| ops_task | sf-workflow-ops-task |
| investigation | sf-workflow-investigation |

### 7.3 加载规则

- 每次工作流执行只加载一个 Workflow_Skill
- 加载失败时停止工作流，不降级
- Workflow_Skill 中不包含共享协议（Gate、重试等），这些保留在路由层

---

## 8. 并行任务调度（V3.3 新增）

### 8.1 概述

V3.3 为 development 阶段引入并行 executor 调度能力。当 tasks.md 中的多个 Task 修改不同文件且无依赖关系时，Orchestrator 可以在同一消息中发起多个 `task` 工具调用，实现并行执行。

### 8.2 Independence_Analysis

Orchestrator 在 development 阶段开始前分析 tasks.md 中各 Task 的独立性：
- **文件冲突检测**：两两比较 `修改文件` 列表，交集非空即为冲突
- **依赖关系检测**：检查显式依赖声明
- **独立性判定**：无文件冲突且无依赖关系

### 8.3 Execution_Plan

基于分析结果生成执行计划：
- 独立 Task 分组为 Parallel_Batch（每批次 ≤ max_parallel_executors）
- 有依赖的 Task 按顺序串行执行
- 全部冲突时回退到串行（Serial_Fallback）

### 8.4 配置

| 配置项 | 文件 | 默认值 | 说明 |
|--------|------|--------|------|
| max_parallel_executors | specforge/config/project.json | 3 | 单批次最大并行 executor 数量，设为 1 等同于禁用并行 |

---

## 9. Knowledge Graph 自动维护协议（V4.0 新增）

### 9.1 概述

V4.0 为 SpecForge 引入 Knowledge Graph（知识图谱），将需求→设计→任务→代码之间的关系显式化为可查询的有向图。Knowledge Graph 通过 `knowledge_graph_enabled` 配置项控制启用/禁用（默认 true）。

### 9.2 自动同步机制

Knowledge Graph 在工作流推进过程中由 Gate 工具自动维护：

| Gate 工具 | 同步范围（scope） | 同步内容 |
|-----------|------------------|----------|
| sf_requirements_gate | requirements | requirement 节点 |
| sf_design_gate | design | design_decision 节点 + traces_to 边 |
| sf_tasks_gate | tasks | task/code_file 节点 + decomposes_to/modifies 边 + implements 推导 |
| sf_verification_gate | verification | 全量同步 + implements 最终确认 |

同步在 Gate 判定为 pass 后自动执行。同步失败不影响 Gate 结果（仅记录警告）。

### 9.3 Context Builder 集成

Orchestrator 在调度子 Agent 前调用 `sf_context_build` 构建精准上下文：
- development 阶段：构建 Task Context（KG 追溯 + Archive 历史经验）+ Capability Broker 推荐
- requirements/design/tasks 阶段：构建跨 Work Item 参考上下文
- 调用失败时回退到 V3.3 协议

### 9.4 配置

| 配置项 | 文件 | 默认值 | 说明 |
|--------|------|--------|------|
| knowledge_graph_enabled | specforge/config/project.json | true | 启用/禁用 Knowledge Graph 功能 |

### 9.5 数据存储

| 文件 | 说明 |
|------|------|
| specforge/knowledge/graph.json | Knowledge Graph 持久化存储（自动创建） |
| specforge/config/skill_fragments.json | Skill Fragment 索引配置 |

---

## 10. 用户级安装模式（V3.5.0）

### 10.1 概述

V3.5.0 将共享组件（Agent、Tool、Skill、Plugin）部署到用户级目录 `~/.config/opencode/`，实现一次安装、全局共享。项目级运行时由统一 Plugin 在 OpenCode 启动时自动初始化，无需手动操作。

**核心变更（V3.5 vs V3.4）：**
- 5 个独立 Plugin 合并为 1 个统一 Plugin（`sf_specforge.ts`）
- CLI 仅负责用户级共享组件管理（install/upgrade/verify/uninstall）
- 项目级运行时初始化完全由 Plugin 自动完成
- 移除 `--target`、`--project-level`、`--runtime-only` 参数

### 10.2 安装命令

| 命令 | 行为 |
|------|------|
| `install` | 部署共享组件到 `~/.config/opencode/` |
| `upgrade` | 原子升级共享组件 |
| `upgrade --force` | 强制升级（覆盖用户修改） |
| `verify` | 校验共享组件完整性 |
| `uninstall` | 卸载共享组件 |

### 10.3 Plugin 自动初始化

统一 Plugin（`sf_specforge.ts`）在 OpenCode 启动时自动执行：

| 流程 | 触发条件 | 行为 |
|------|----------|------|
| initialize | `specforge/` 不存在 | 创建完整目录结构和初始文件 |
| repair | `specforge/` 存在但部分文件缺失 | 补齐缺失项，不覆盖已有文件 |
| migrate | manifest 有效但 schema 版本旧 | 执行 Runtime_Migration |
| skip | manifest 有效且 schema 最新 | 直接注册事件处理器 |
| degraded | 版本不兼容 | 仅 error logging + permission_guard |

启用条件（全部满足才自动初始化）：
- `specforge-manifest.json` 存在于 User_Level_Directory
- 环境变量 `SPECFORGE_AUTO_INIT` 未设置为 `false`
- 项目根目录不是 home 目录、系统目录或 `~/.config/opencode` 本身

### 10.4 安装锁机制

安装锁（`{User_Level_Directory}/.specforge.lock`）串行化并发 install/upgrade 操作：
- lock_id（UUID）+ PID + hostname 所有权校验
- Heartbeat 每 5 秒刷新，stale 二次确认
- 最大等待 30 秒，锁超时 10 分钟
- `verify` 不获取锁

### 10.5 目录结构

| 位置 | 内容 |
|------|------|
| `~/.config/opencode/agents/` | 9 个 sf-* Agent 定义文件 |
| `~/.config/opencode/tools/` | 16 个 Tool + 19 个 lib 文件 |
| `~/.config/opencode/skills/` | 12 个 Skill 目录 |
| `~/.config/opencode/plugins/` | 1 个统一 Plugin（sf_specforge.ts） |
| `~/.config/opencode/opencode.json` | Agent 注册配置（合并写入） |
| `~/.config/opencode/specforge-manifest.json` | 用户级 Manifest |
| 项目 `specforge/` | 运行时数据（Plugin 自动初始化） |

---

## 11. 四种新工作流（V3.6 新增）

### 11.1 工作流列表

| 工作流 | Workflow_Type | 适用场景 | 状态机 |
|--------|--------------|----------|--------|
| Change Request | `change_request` | 修改已有业务功能，含影响分析 | intake → impact_analysis → impact_analysis_gate → design_delta → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed |
| Refactor | `refactor` | 纯结构性改善，不改变行为，含双路径 | intake → refactor_analysis → refactor_analysis_gate → refactor_plan → refactor_plan_gate → development → [review（高风险）] → verification → verification_gate → completed |
| Ops Task | `ops_task` | 部署/运维操作，含安全执行协议 | intake → ops_plan → ops_plan_gate → tasks → tasks_gate → execution → verification → verification_gate → completed |
| Investigation | `investigation` | 调查/研究/技术选型，无代码变更 | intake → investigation_plan → investigation_plan_gate → research → findings_report → findings_report_gate → completed |

### 11.2 新工作流特殊规则

**Refactor 双路径：**
- `refactor_plan_gate` pass 时读取风险等级，记录到 `metadata.risk_path`
- `risk_path="high"` → development 后必须经过 review
- `risk_path="low"` → development 后直接进入 verification
- `sf_state_transition` 守卫强制执行路径约束

**Investigation 用户接受确认：**
- `findings_report_gate` pass 后，必须向用户展示报告摘要并获得明确确认
- 流转到 `completed` 时必须传入 `transition_context.user_accepted: true`
- `sf_state_transition` 守卫强制执行此约束

**Investigation 不同步 KG：**
- investigation 工作流不建立结构化可追溯链，不触发 KG 同步

**Investigation 知识提取使用 candidate 状态：**
- investigation 产出的知识条目默认 `status="candidate"`，`confidence="medium"`

### 11.3 新工作流 KG 同步矩阵

| 工作流 | Gate | scope | 同步内容 |
|--------|------|-------|----------|
| change_request | impact_analysis_gate | requirements | requirement 节点 + affects 边 |
| change_request | design_gate | design | design_decision 节点 + traces_to 边 |
| change_request | tasks_gate | tasks | task/code_file 节点 + modifies 边 |
| change_request | verification_gate | verification | 全量同步 |
| refactor | refactor_analysis_gate | requirements | refactor_target 节点 |
| refactor | refactor_plan_gate | tasks | code_file 节点 + modifies 边（替代 tasks_gate） |
| refactor | verification_gate | verification | 全量同步 |
| ops_task | ops_plan_gate | design | ops_action 节点 |
| ops_task | tasks_gate | tasks | task 节点 |
| ops_task | verification_gate | verification | 全量同步 |
| investigation | — | — | 不同步 KG |

---

## 12. 跨会话续接（Cross-Session Continuity，V3.6 新增）

### 12.1 概述

当子 Agent 因上下文耗尽中断时，Orchestrator 自动检测并启动续接流程：
1. 检测上下文耗尽（双条件：run failed + trace 含耗尽模式）
2. 检查续接次数限制（max_continuations，默认 1，最大 2）
3. 提取 Context_Snapshot（从 tool_calls.jsonl、trace.jsonl、work_log.md）
4. 生成续接 prompt（含完整 Context_Snapshot）
5. 调度新子 Agent 续接执行
6. 合并 Archive（files_changed 并集，duration 求和，tool_calls 拼接）

### 12.2 续接配置

| 配置项 | 文件 | 默认值 | 说明 |
|--------|------|--------|------|
| continuity.max_continuations | specforge/config/project.json | 1 | 最大续接次数（1 或 2） |
| continuity.key_messages_count | specforge/config/project.json | 20 | 关键消息过滤数量上限 |

### 12.3 续接工具

| 工具名 | 文件路径 | 用途 |
|--------|----------|------|
| sf_continuity | `.opencode/tools/sf_continuity.ts` | 续接引擎：检测耗尽、提取 snapshot、生成 prompt、合并 Archive、检查限制 |

---

## 13. KG 类型扩展（V3.6 新增）

### 13.1 新增 NodeType

| NodeType | 说明 | 适用工作流 |
|----------|------|-----------|
| `refactor_target` | 重构目标节点，含 smell_type、risk_level、target_files | refactor |
| `ops_action` | 运维操作节点，含 action_type、target_environment、rollback_defined | ops_task |

### 13.2 新增 EdgeType

| EdgeType | 说明 | 适用场景 |
|----------|------|---------|
| `affects` | 影响关系边，用于 change_request 的影响分析 | change_request |

---

## 14. Gate Mode 扩展（V3.6 新增）

### 14.1 概述

V3.6 为现有 4 个 Gate 工具引入 `mode` 参数，通过策略表分发到不同检查逻辑。不传 mode 时行为与 V3.5 完全一致（向后兼容）。

### 14.2 sf_requirements_gate mode 定义

| mode | 检查文件 | 必需 sections |
|------|----------|--------------|
| 无（默认） | requirements.md | 用户故事、验收标准、术语表 |
| `"change_request"` | impact_analysis.md | 变更范围、风险评估、回归测试范围、KG 关联 |
| `"refactor"` | refactor_analysis.md | 代码问题识别、重构目标、不变行为声明、风险评估 |
| `"investigation"` | investigation_plan.md | 调查目标、调查范围、调查方法、预期产出格式 |

### 14.3 sf_design_gate mode 定义

| mode | 检查文件 | 必需 sections |
|------|----------|--------------|
| 无（默认） | design.md | 需求引用 |
| `"change_request"` | design_delta.md | 增量设计描述、受影响模块、兼容性影响、回归风险、KG 追溯关系 |
| `"ops_task"` | ops_plan.md | 操作目标、前置条件、操作步骤、回滚方案、回滚触发条件、风险评估、影响范围 |
| `"refactor"` | refactor_plan.md | 重构策略、步骤顺序、风险等级判定 |
| `"investigation"` | findings_report.md | 调查结论、数据和证据、建议、限制 |

### 14.4 sf_verification_gate mode 定义

| mode | 额外检查 |
|------|----------|
| 无（默认） | 现有逻辑不变 |
| `"refactor"` | 所有现有测试通过（行为不变性）+ 代码质量指标改善 |
| `"ops_task"` | 操作结果与 ops_plan.md 预期结果一致 |
| `"change_request"` | 回归测试覆盖 impact_analysis.md 声明的受影响区域 |
