# SpecForge Unified Standard v1.3（草案）

> 状态：draft / design-freeze-candidate  
> 生成日期：2026-06-30  
> 来源：`specforge_final_fused_standard_v1_1_patch1_zh.md`、`specforge_project_spec_architecture_standard_v1_14_consolidated.md`、`SpecForge_v1.2_设计标准差距审查与后续规划.md`  
> 定位：本文件用于统一 SpecForge 运行治理标准、Project Spec 真相源标准、Project Spec 多视角架构标准、Extension Subflow 标准。  
> 语言规则：正文使用中文；文件名、路径、字段名、Agent、Gate、workflow_path、ID、Candidate、Merge、Trace、Evidence、User Decision 等术语保留英文。

---

## 0. 标准定位

### 0.1 本标准解决什么问题

SpecForge 不是普通 OpenCode 插件，也不是文档生成器。SpecForge 是规格驱动 AI 编程工作流系统。

本标准统一四类规则：

```text
1. 运行治理规则：Work Item、State Machine、Gate、User Decision、Merge Runner、Write Guard、Close Gate。
2. Project Spec 真相源规则：.specforge/project/** 的结构、版本、模块、Trace、Manifest。
3. Project Spec 多视角规则：业务价值、用户旅程、UI/UX、架构、API、数据、安全、可靠性、部署、决策等视角。
4. 扩展治理规则：extension_registry、Extension Subflow、条件触发专题文件与专题 Gate。
```

### 0.2 最高约束

任何变更必须进入 Work Item。

正式规格只能通过：

```text
Candidate
→ Gate
→ User Decision
→ Merge Runner
```

代码只能通过：

```text
code_permission
→ allowed_write_files
→ Write Guard
→ changed_files_audit
```

关闭只能通过：

```text
verification
→ evidence
→ trace
→ audit
→ merge 或 not_applicable
→ close_gate
```

任何实现不得依赖 Agent 自觉执行关键控制。关键控制必须落到 Runtime、State Machine、Path Service、Path Policy、Gate Runner、User Decision Recorder、Merge Runner、code_permission_service、Write Guard、changed_files_audit、close_gate。

### 0.3 标准优先级

冲突裁决优先级固定为：

```text
SpecForge Unified Standard v1.3
> SpecForge final fused standard v1.1 + Patch 1/2 的有效控制规则
> Project Spec Architecture Standard v1.14 中已被本标准吸收的多视角规则
> v1.2 当前实现
> 旧代码行为
> Agent 自行判断
```

旧行为只能作为 legacy input，不得作为新标准依据。

---

## 1. 目录边界

### 1.1 两层责任模型

SpecForge 目录分为两层：

```text
OpenCode 扩展层
用户项目 .specforge 工作区
```

OpenCode 扩展层用于放置 Agent、Tool、Plugin、Skill 和 SpecForge 用户级私有数据。用户项目 `.specforge/` 只保存被管理项目的规格事实、Work Item 事务和 runtime 临时状态。

### 1.2 OpenCode 扩展层

推荐结构：

```text
~/.config/opencode/
  agents/
  tools/
  plugins/
  skills/
  sf-user/
```

规则：

1. `agents/` 保存 SpecForge Agent 提示词。
2. `tools/` 保存 SpecForge 工具程序。
3. `plugins/` 保存 OpenCode 插件。
4. `skills/` 保存技能文件。
5. `sf-user/` 保存 SpecForge 用户级私有数据。
6. 新版本不得默认写入 `~/.specforge/`。
7. `~/.specforge/` 只作为 legacy read-only 来源。

### 1.3 用户项目 `.specforge/` 目录

用户项目固定三大区：

```text
<project>/.specforge/
  project/
  work-items/
  runtime/
```

| 目录 | 职责 | 是否真相源 |
|---|---|---|
| `.specforge/project/` | 项目级正式规格、Project Spec 多视角正式文件 | 是 |
| `.specforge/work-items/` | 每次变更事务、delta、candidate、gate、decision、evidence | 过程产物；其中 Candidate 是待合并候选规格 |
| `.specforge/runtime/` | 状态投影、缓存、日志、临时索引 | 否 |

禁止在用户项目直接创建：

```text
.specforge/standards/
.specforge/archive/
.specforge/state/
.specforge/gates/
.specforge/reports/     # 除非已被 v1.2 Write Guard 明确放行用于报告输出
.specforge/snapshots/
```

说明：如果 v1.2 当前实现已允许 `.specforge/reports/**` 用于报告输出，属于兼容例外；它不得成为正式规格真相源。

### 1.4 治理标准文件位置

SpecForge 治理标准文件属于仓库，不属于用户项目。

正式位置：

```text
SpecForge/docs/standards/
  specforge_unified_standard_v1_3.md
  specforge_unified_standard_v1_3_conflict_matrix.md
  specforge_unified_standard_v1_3_source_mapping.md
```

用户项目不得生成：

```text
.specforge/standards/specforge_unified_standard_v1_3.md
```

---

## 2. 状态权威模型

SpecForge 运行状态只能有一个权威来源：

```text
events.jsonl / StateManager = 唯一权威状态事件源
runtime/state.json = 从权威状态投影生成的运行缓存
work_item.json = Work Item 元数据档案，不是状态源
```

规则：

1. 状态迁移必须由 Runtime State Machine / State Coordinator 统一完成。
2. Gate Runner、User Decision Recorder、Merge Runner、close_gate 只能产出证据并请求状态迁移，不得直接把 `runtime/state.json` 或 `work_item.json.status` 当作权威状态改写。
3. `runtime/state.json` 是 projection cache，可由 `events.jsonl / StateManager` 重建。
4. `work_item.json.status` 如历史存在，只能作为 legacy display field。
5. Gate / Decision / Merge / Close 不得读取 `work_item.json.status` 作为治理判断依据。
6. 后续状态治理完成后，应删除 `work_item.json.status` 的生成、写入和兼容读取代码。

---

## 3. Path Service 与 Path Policy

### 3.1 Path Service 职责

Path Service 负责生成所有关键路径。Agent、Skill、Tool 不得自由拼接正式规格路径、Work Item 关键路径、Candidate 路径、Gate 路径、User Decision 路径、Merge Report 路径。

最低能力：

```text
projectRoot()
projectSpecManifest()
projectExtensionRegistry()
projectRequirementsIndex()
projectDesignIndex()
projectArchitecture()
projectGlossary()
projectDecisions()
projectTraceMatrix()
projectViewsRoot()
projectView(viewId)
projectDecisionsRoot()
projectAdr(adrId)
projectDiagramsRoot()
projectDiagram(diagramId)
projectModulesRoot()
moduleRoot(moduleCode)
moduleJson(moduleCode)
moduleRequirements(moduleCode)
moduleDesign(moduleCode)
moduleTrace(moduleCode)
moduleViewsRoot(moduleCode)
moduleView(moduleCode, viewId)
workItemsRoot()
workItemRoot(workItemId)
workItemJson(workItemId)
workItemIntake(workItemId)
workItemCandidateRoot(workItemId)
workItemCandidateProjectRoot(workItemId)
workItemGateRoot(workItemId)
workItemEvidenceRoot(workItemId)
```

### 3.2 Path Policy 基础规则

所有路径必须满足：

1. 使用项目根目录相对路径。
2. 使用 POSIX 风格 `/`。
3. 不允许绝对路径。
4. 不允许 `..`。
5. 不允许 `~`。
6. 不允许 Windows 反斜杠 `\`。
7. 引用项目规格文件必须带 `.specforge/` 前缀。
8. Candidate Manifest、Trace、Gate Report、Merge Report 中不得出现裸 `project/...` 路径。

### 3.3 正式路径统一

正式 Project Spec 路径：

```text
.specforge/project/**
```

WI 过程路径：

```text
.specforge/work-items/<WI-ID>/**
```

Candidate 路径：

```text
.specforge/work-items/<WI-ID>/candidates/project/**
```

Runtime 路径：

```text
.specforge/runtime/**
```

---

## 4. 命名、ID 与字段规则

### 4.1 MODULE_CODE

唯一规范模块标识为 `MODULE_CODE`。

```text
MODULE_CODE = [A-Z][A-Z0-9]{1,11}
```

规则：

1. 2 到 12 位。
2. 必须以大写字母开头。
3. 只允许大写字母和数字。
4. 不允许中文、小写、短横线、下划线。
5. `module_id`、`prefix`、`moduleName` 不得作为正式主键。
6. `display_name` 可以是中文或小写英文，但不得参与路径、ID、Trace 主键。

### 4.2 固定 ID 正则

```regex
WI-[0-9]{4}
REQ-[A-Z][A-Z0-9]{1,11}-[0-9]{3}
AC-[A-Z][A-Z0-9]{1,11}-[0-9]{3}-[0-9]{2}
DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}
TASK-WI-[0-9]{4}-[0-9]{3}
ADR-[0-9]{4}
```

扩展 ID：

```regex
VIEW-[a-z][a-z0-9_]{2,48}
GATE-[a-z][a-z0-9_]{2,48}
ANALYSIS-[a-z][a-z0-9_]{2,48}
```

### 4.3 文件与字段命名

1. Markdown 文件统一 `lower_snake_case.md`。
2. JSON 字段统一 `snake_case`。
3. 系统固定目录统一 lower-kebab 或 lower_snake；本标准采用 lower-kebab 与既有目录兼容，例如 `work-items/`。
4. Module 目录必须使用 `MODULE_CODE` 大写。

---

## 5. Project / Module / Work Item 三层责任模型

### 5.1 Project 管全局事实

Project 负责：

```text
项目规格版本
全局需求索引
全局设计索引
系统架构边界
跨模块规则
术语
决策
项目级 Trace
已登记扩展视角
```

Project 不负责保存单个 WI 的过程状态。

### 5.2 Module 管当前完整模块事实

Module 负责：

```text
模块元数据
模块详细需求
模块详细设计
模块内部追溯
模块局部视角
```

Module 不负责保存跨 WI 的过程证据。

### 5.3 Work Item 管一次变更事务

Work Item 负责：

```text
用户原始输入
分类
影响分析
delta
candidate
gate evidence
user decision
merge report
verification
close evidence
```

Work Item 不是正式规格真相源。

---

## 6. Project Spec Core 真相源

### 6.1 Core 目录

Core 文件默认存在：

```text
.specforge/project/
  spec_manifest.json
  extension_registry.json
  requirements_index.md
  design_index.md
  architecture.md
  glossary.md
  decisions.md
  trace_matrix.md
  modules/
    <MODULE_CODE>/
      module.json
      requirements.md
      design.md
      trace.md
```

### 6.2 Core 文件职责

| 文件 | 职责 | 是否真相源 |
|---|---|---|
| `spec_manifest.json` | 项目规格总索引、版本、模块定位、视角定位、最近 Merge 来源 | 是，索引真相源 |
| `extension_registry.json` | 扩展类型、视角类型、专题 Gate、分析类型登记 | 是，扩展治理真相源 |
| `requirements_index.md` | 需求域、模块、需求文件、跨模块需求索引 | 是，索引真相源 |
| `design_index.md` | 设计域、模块设计、跨模块设计索引 | 是，索引真相源 |
| `architecture.md` | 架构总纲、上下文、模块边界、部署/安全/质量约束索引 | 是 |
| `glossary.md` | 统一术语、业务口径、枚举、状态、权限名 | 是 |
| `decisions.md` | 决策索引与 MVP 决策日志 | 是 |
| `trace_matrix.md` | 项目级 REQ / AC / DD / TASK / FILE / TEST / EVIDENCE 追溯 | 是 |
| `modules/<MODULE_CODE>/module.json` | 模块元数据、状态、路径归属 | 是 |
| `modules/<MODULE_CODE>/requirements.md` | 模块级详细需求 | 是 |
| `modules/<MODULE_CODE>/design.md` | 模块级详细设计 | 是 |
| `modules/<MODULE_CODE>/trace.md` | 模块内部追溯 | 是 |

### 6.3 `spec_manifest.json`

`spec_manifest.json` 必须记录：

1. `schema_version`。
2. `project_spec_version`。
3. `project_name`。
4. Core 文件路径。
5. 已启用 Project View 路径。
6. 已启用 Module 列表及模块文件路径。
7. 最近一次正式规格 Merge 来源。

不得记录：

```text
runtime 状态
Gate 执行结果
User Decision 详情
OpenCode 扩展路径
active_work_items
```

示例：

```json
{
  "schema_version": "1.3",
  "project_spec_version": "PSV-0001",
  "project_name": "",
  "project": {
    "extension_registry": ".specforge/project/extension_registry.json",
    "requirements_index": ".specforge/project/requirements_index.md",
    "design_index": ".specforge/project/design_index.md",
    "architecture": ".specforge/project/architecture.md",
    "glossary": ".specforge/project/glossary.md",
    "decisions": ".specforge/project/decisions.md",
    "trace_matrix": ".specforge/project/trace_matrix.md"
  },
  "views": [
    {
      "view_id": "business_value",
      "view_type": "business_value",
      "path": ".specforge/project/views/business_value.md",
      "status": "active"
    }
  ],
  "modules": [
    {
      "module_code": "AUTH",
      "display_name": "认证模块",
      "path": ".specforge/project/modules/AUTH",
      "module_file": ".specforge/project/modules/AUTH/module.json",
      "requirements": ".specforge/project/modules/AUTH/requirements.md",
      "design": ".specforge/project/modules/AUTH/design.md",
      "trace": ".specforge/project/modules/AUTH/trace.md"
    }
  ],
  "last_merged_work_item": "WI-0007",
  "last_merged_at": "2026-06-30T00:00:00Z"
}
```

### 6.4 版本规则

1. 旧版本依赖 Git 保存。
2. `project_spec_version` 标识当前项目规格版本。
3. 每次正式规格 Merge 必须递增 `project_spec_version`。
4. `last_merged_work_item` 与 `last_merged_at` 说明当前版本来源。
5. Snapshot / Archive / 自动 rebase 后置。

---

## 7. Project Spec Extension Registry

### 7.1 定位

`extension_registry.json` 是正式 Project Spec 的一部分，是扩展治理真相源。

它登记：

```text
view_types
gate_types
analysis_types
candidate_entry_types
trace_link_types
schema_versions
compatibility_rules
```

任何新增 Project View、专题 Gate、专题分析文件、候选文件类型、Trace 关系类型，都必须先登记。

### 7.2 最小结构

```json
{
  "schema_version": "1.3",
  "project_spec_version": "PSV-0001",
  "view_types": [
    {
      "view_type": "business_value",
      "default_path": ".specforge/project/views/business_value.md",
      "status": "registered",
      "trigger": "business goal, cost, efficiency, data capability, decision support changed"
    }
  ],
  "gate_types": [
    {
      "gate_type": "viewpoint_gate",
      "status": "registered",
      "trigger": "new or changed stakeholder concern / viewpoint / view"
    }
  ],
  "analysis_types": [
    {
      "analysis_type": "quality_attribute_analysis",
      "default_wi_path": ".specforge/work-items/<WI-ID>/quality_attribute_analysis.md",
      "status": "registered"
    }
  ],
  "updated_by_work_item": null,
  "updated_at": null
}
```

### 7.3 Extension Subflow

当 Agent 判断需要创建未知 view_type、gate_type、analysis_type、trace_link_type 时，必须触发 Extension Subflow。

链路：

```text
Extension Request
→ extension_delta.md
→ Extension Candidate
→ extension_gate
→ User Decision
→ Merge Runner 更新 extension_registry.json
→ 主 Work Item 恢复
```

禁止事项：

1. Agent 不得直接创建未登记扩展文件。
2. Gate 不得接受未登记 gate_type。
3. Trace 不得引用未登记 trace_link_type。
4. Extension Subflow 不能绕过 User Decision。

---

## 8. Project Spec 多视角体系

### 8.1 核心链路

多视角不是多写几个 Markdown 文件，而是利益相关方关切驱动的规格表达模型。

固定链路：

```text
Stakeholder
→ Concern
→ Viewpoint
→ View
→ Spec File
→ Gate
→ Trace
```

AI 在创建或更新任何架构视角前，必须回答：

1. 谁关心这个问题。
2. 他关心的业务、使用、技术、运行或治理问题是什么。
3. 应该用哪个视角回答。
4. 该视角观察的对象和颗粒度是什么。
5. 最终落到哪个规格文件。
6. 如何通过 Gate 检查完整性。
7. 如何进入 Trace 追溯链。

### 8.2 视角分级

| 级别 | 含义 | 示例 | 规则 |
|---|---|---|---|
| Core | 项目规格真相和变更流程最小闭环 | manifest、requirements_index、design_index、architecture、trace_matrix、module requirements/design/trace | MUST 存在 |
| Conditional | 触发条件成立时才必须存在 | business_value、user_journeys、api_contracts、quality_attributes、ADR、SRE 分析 | 触发后 MUST 通过 Candidate 创建或更新 |
| Optional | 高复杂度项目启用 | 团队拓扑、组织治理、复杂平台治理 | MAY 启用，必须登记 |

AI 不得因为标准列出了文件，就机械生成空文件。

### 8.3 统一 Project View 路径

Project 级视角统一放在：

```text
.specforge/project/views/<view_file>.md
```

建议登记的内置 view_type：

| View Type | 文件 | 主要 Concern |
|---|---|---|
| `business_value` | `.specforge/project/views/business_value.md` | 业务目标、成本、效率、数据能力、决策能力 |
| `user_journey` | `.specforge/project/views/user_journeys.md` | 用户如何完成业务任务 |
| `ui_ux` | `.specforge/project/views/ui_experience_design.md` | 页面、表单、按钮组合、状态、提示是否好用 |
| `frontend_architecture` | `.specforge/project/views/frontend_design.md` | 路由、状态、组件边界、权限控制 |
| `integration` | `.specforge/project/views/integration_design.md` | 模块、外部系统、同步/异步协作 |
| `api_contract` | `.specforge/project/views/api_contracts.md` | API 请求、响应、错误码、版本 |
| `data` | `.specforge/project/views/data_model.md` | 实体、数据 owner、共享模型、生命周期 |
| `database` | `.specforge/project/views/database_design.md` | 表、索引、迁移、事务、兼容 |
| `event_runtime` | `.specforge/project/views/event_flows.md` | 事件、状态机、流程、补偿、幂等 |
| `security` | `.specforge/project/views/security_design.md` | 身份、权限、密钥、审计、敏感字段 |
| `reliability` | `.specforge/project/views/reliability_design.md` | 故障模式、恢复、降级、容灾 |
| `observability` | `.specforge/project/views/observability_design.md` | 日志、指标、链路、告警、Dashboard |
| `deployment` | `.specforge/project/views/deployment_design.md` | 环境、部署单元、资源、网络、配置 |
| `quality_attribute` | `.specforge/project/views/quality_attributes.md` | 性能、安全、成本、可维护性、用户体验取舍 |
| `risk` | `.specforge/project/views/architecture_risks.md` | 技术风险、业务风险、依赖风险、债务 |
| `crosscutting` | `.specforge/project/views/crosscutting_concepts.md` | API、数据、安全、日志、错误、前端交互等横切规则 |

### 8.4 Decision View

v1.2 / MVP 兼容：

```text
.specforge/project/decisions.md
```

v1.3 扩展：

```text
.specforge/project/decisions/
  ADR-0001-title.md
```

裁决规则：

1. `decisions.md` 保留，作为 Decision Index 与 MVP 决策日志。
2. `decisions/ADR-*.md` 属于 Conditional Extension。
3. 只有 `adr_detail` 类型在 `extension_registry.json` 登记后，才能创建 `decisions/` 目录。
4. 每个 ADR 文件只承载一个重要架构决策。
5. `decisions.md` 必须索引所有正式 ADR。

### 8.5 Diagram View

图不是真相源，只是视图辅助表达。图必须引用正式规格文件，不得成为唯一事实来源。

路径：

```text
.specforge/project/diagrams/
  c1_system_context.md
  c2_container_view.md
  c3_component_view_<MODULE_CODE>.md
  deployment_view.md
  dynamic_view_<FLOW_CODE>.md
```

创建规则：

1. 必须登记 diagram view type。
2. 必须通过 Candidate 创建。
3. 必须在 Trace 或 Architecture 中有引用。
4. 不得脱离 Project Spec 单独维护。

### 8.6 颗粒度规则

AI 选择视角颗粒度时必须遵守：

1. Business Value 以业务目标、业务任务、成本、效率、数据能力和决策能力为颗粒度。
2. User Journey 以用户完成端到端业务任务为颗粒度。
3. UI/UX 以页面和业务操作单元为颗粒度。
4. Frontend Architecture 以路由域、页面模块、状态边界、组件组、数据加载策略为颗粒度。
5. Module View 以业务能力、职责边界、数据 owner、规则内聚和依赖关系为颗粒度。
6. API View 以跨边界契约为颗粒度。
7. Data View 以业务实体、数据归属、共享模型、表、字段和生命周期为颗粒度。
8. Runtime / Event View 以业务流程、事件、状态迁移、失败补偿和幂等为颗粒度。
9. Deployment View 以部署单元、环境、资源、网络、配置和运行依赖为颗粒度。
10. Quality / Risk / Decision View 以可验证场景、权衡、风险项和 ADR 为颗粒度。

处理顺序：

```text
Business Task
→ User Journey
→ UI Operation Unit
→ Requirement / AC
→ Module Responsibility
→ API / Data / Event Contract
→ Task / Code / Test
→ Evidence
```

---

## 9. Work Item 事务模型

### 9.1 WI 本质

Work Item 是一次受控变更事务，不是规格真相源。

所有用户请求，无论需求变更、设计变更、架构重构、任务调整、代码修复、测试补充、回滚、迁移，都必须先进入 WI。

禁止无 WI 直接修改代码或正式规格。

### 9.2 WI 目录

```text
.specforge/work-items/<WI-ID>/
  work_item.json
  intake.md
  change_classification.md
  impact_analysis.md
  trigger_result.json
  requirements_delta.md
  design_delta.md
  architecture_delta.md
  trace_delta.md
  tasks.md
  candidate_manifest.json
  candidates/
  gates/
  gate_summary.md
  user_decision.json
  verification_report.md
  merge_report.md
  evidence/
    evidence_manifest.json
```

不同 `workflow_path` 可让部分文件 `not_applicable`，但不得破坏闭环文件要求。

### 9.3 workflow_path

固定路径：

```text
requirement_change_path
design_change_path
architecture_change_path
task_change_path
code_only_fast_path
spec_migration_path
rollback_path
extension_subflow_path
```

### 9.4 code-only 不是免流程

只有全部满足才允许 `code_only_fast_path`：

```text
requirement_changed = false
acceptance_criteria_changed = false
business_rule_changed = false
user_visible_behavior_changed = false 或仅视觉表现且无业务语义
data_semantics_changed = false
design_changed = false
module_boundary_changed = false
api_contract_changed = false
unknowns = []
```

即使进入 `code_only_fast_path`，也必须有 WI、impact_analysis、tasks、allowed_write_files、Write Guard、verification、evidence、changed_files_audit、close_gate。

---

## 10. Candidate、Delta 与 Manifest

### 10.1 Delta

Delta 是本次 WI 对正式规格或代码计划的变化说明。Delta 不是真相源。

常见 Delta：

```text
requirements_delta.md
design_delta.md
architecture_delta.md
trace_delta.md
extension_delta.md
```

### 10.2 Candidate

Candidate 是拟写入正式规格真相源的完整候选文件，不是 patch。

Candidate 路径：

```text
.specforge/work-items/<WI-ID>/candidates/project/**
```

Candidate 合并目标必须是：

```text
.specforge/project/**
```

### 10.3 Candidate Manifest

`candidate_manifest.json` 必须绑定：

```text
work_item_id
base_project_spec_version
entries[].candidate_path
entries[].target_path
entries[].operation
entries[].content_hash
entries[].entry_type
entries[].view_type / module_code / trace_link_type
```

示例：

```json
{
  "schema_version": "1.3",
  "work_item_id": "WI-0007",
  "base_project_spec_version": "PSV-0001",
  "entries": [
    {
      "entry_type": "project_view",
      "view_type": "business_value",
      "operation": "replace",
      "candidate_path": ".specforge/work-items/WI-0007/candidates/project/views/business_value.md",
      "target_path": ".specforge/project/views/business_value.md",
      "content_hash": "sha256:..."
    }
  ]
}
```

### 10.4 Manifest 规则

1. Manifest 外正式规格写入必须阻断。
2. Candidate hash 不匹配必须阻断。
3. `base_project_spec_version` 过期必须阻断。
4. 未登记的 `entry_type`、`view_type`、`gate_type` 必须阻断。
5. `target_path` 必须在 `.specforge/project/**` 下。
6. `candidate_path` 必须在当前 WI 的 candidates 下。

---

## 11. Gate 体系

### 11.1 Gate 分类

基础 Gate 默认适用于所有 WI：

| Gate | 作用 |
|---|---|
| Intake Gate | 检查输入、目标、范围和用户确认是否清晰 |
| Impact Gate | 检查影响范围、触发的专题分析和风险识别是否完整 |
| Candidate Consistency Gate | 检查候选规格与当前 Project / Module 规格是否冲突 |
| Trace Gate | 检查 REQ / AC / DD / Task / Test / Evidence 追溯关系 |
| Merge Ready Gate | 检查用户确认、base version、manifest、hash、path 是否满足合并条件 |
| Post Merge Gate | 检查合并后 manifest、version、trace、无越界写入 |
| Verification Gate | 检查验证报告和 evidence 是否满足 |
| Close Gate | 检查全过程闭环后关闭 WI |

专题 Gate 按条件触发：

| Gate | 触发条件 |
|---|---|
| Viewpoint Gate | 涉及新增/调整 stakeholder concern、viewpoint、view |
| ADR Gate | 涉及重要架构决策、替代旧决策或多个候选方案 |
| ATAM Gate | 涉及性能、安全、可靠性、成本、可维护性等质量属性取舍 |
| Domain Boundary Gate | 涉及模块创建、拆分、合并、重命名、职责或数据 owner 变化 |
| Service Boundary Gate | 涉及模块升级为独立服务或服务边界变化 |
| Resilience Pattern Gate | 涉及跨边界调用、外部依赖、异步事件、最终一致性、补偿/对账 |
| Runtime Delivery Gate | 涉及配置、依赖、环境、构建、发布、运行、日志、健康检查、迁移 |
| SRE / Operational Readiness Gate | 涉及 SLO、告警、可靠性目标、事故响应、运行就绪 |
| Architecture Evolution Gate | 涉及目标架构路线、适应度函数、架构漂移、废弃或迁移 |
| Extension Gate | 涉及新增或修改扩展类型 |

### 11.2 Gate 触发规则

1. AI 必须在 `impact_analysis.md` 中输出本次 WI 的 Gate 清单。
2. 未触发的专题 Gate 不得被机械执行。
3. 设计内容实际触发专题 Gate 时，AI 不得以“未声明触发”为理由绕过。
4. 专题 Gate 类型必须已登记在 `extension_registry.json`。

---

## 12. User Decision

User Decision 是用户对 Candidate / Gate 结果 / 风险 / 影响范围的显式决策记录。

必须绑定：

```text
work_item_id
candidate_manifest_hash
gate_summary_hash
base_project_spec_version
user_response_quote
decision_status
created_at
```

状态枚举：

```text
approved
rejected
needs_revision
superseded
```

禁止：

1. 用 Agent 总结替代用户原文。
2. Gate 未完成时记录 approved。
3. Candidate 变更后复用旧 User Decision。
4. User Decision 后直接写正式规格，必须通过 Merge Runner。

---

## 13. Merge Runner

### 13.1 定义

Merge Runner 是唯一允许写入 `.specforge/project/**` 的受控执行器。

普通 Agent、专业 Agent、bash、formatter、generator、native Write、edit、apply_patch 不得直接写正式 Project Spec。

### 13.2 合并前检查

Merge Runner 必须检查：

```text
user_decision.status = approved
candidate_manifest_hash 未变化
gate_summary_hash 未变化
base_project_spec_version 与当前一致
candidate_path 存在且 hash 匹配
target_path 合法且属于 .specforge/project/**
entry_type / view_type / gate_type 已登记
```

### 13.3 合并后检查

Merge Runner 必须生成 `merge_report.md`，并检查：

```text
project_spec_version 已递增
spec_manifest.json 已更新
extension_registry.json 如受影响则已更新
trace_matrix.md 如受影响则已更新
所有 target_path 与 manifest 一致
无 manifest 外正式规格写入
```

---

## 14. Write Guard 与 code_permission

### 14.1 code_permission

代码修改必须由 `code_permission_service` 释放。

释放条件：

```text
WI 存在
workflow_path 允许代码修改
impact_analysis 完成
allowed_write_files 明确
必要 Gate 通过
没有未处理 hard_stop
```

### 14.2 allowed_write_files

`allowed_write_files` 必须精确到文件或受控 glob。不得用项目根目录或宽泛 `**/*` 替代。

### 14.3 Write Guard

Write Guard 必须拦截：

1. 未授权 native Write / edit / apply_patch。
2. out-of-scope 写入。
3. 直接写 `.specforge/project/**`。
4. 无 WI 上下文的受控写入。
5. 被 hard_stop 阻断 WI 的继续写入。

### 14.4 changed_files_audit

关闭前必须检查实际变更文件与 `allowed_write_files`、Candidate Manifest、Merge Report 一致。

---

## 15. Trace、Verification、Evidence、Close Gate

### 15.1 Trace

Trace 必须建立：

```text
REQ
→ AC
→ DD
→ TASK / WI
→ FILE
→ TEST
→ EVIDENCE
```

项目级 Trace：

```text
.specforge/project/trace_matrix.md
```

模块级 Trace：

```text
.specforge/project/modules/<MODULE_CODE>/trace.md
```

WI Trace Delta：

```text
.specforge/work-items/<WI-ID>/trace_delta.md
```

### 15.2 Verification

`verification_report.md` 必须说明：

```text
验证目标
验证命令或操作
验证结果
失败原因
证据路径
未覆盖风险
```

### 15.3 Evidence

`evidence/evidence_manifest.json` 必须登记所有证据文件、hash、来源、用途。

### 15.4 Close Gate

Close Gate 必须检查：

1. WI 权威状态允许关闭。
2. 必要文件存在。
3. Gate Summary 完成。
4. User Decision 满足要求或 not_applicable 合法。
5. Merge Report 满足要求或 not_applicable 合法。
6. Verification Report 满足要求。
7. Evidence Manifest 满足要求。
8. changed_files_audit 通过。
9. 无 hard_stop。
10. 无 out-of-scope 写入。

---

## 16. 行业实践吸收规则

### 16.1 总原则

行业实践不得作为概念装饰，必须转化为目录、文件、字段、流程、Gate、模板或 Agent 操作约束。

吸收关系：

| 实践 | SpecForge 中的定位 |
|---|---|
| ISO 42010 | 视角来源：谁关心什么 |
| arc42 | 文档结构：文件应该怎么组织 |
| C4 | 抽象层级：当前应该看到哪一层 |
| ADR | 决策治理：为什么选择这个方案 |
| ATAM | 质量属性权衡：取舍、风险、验证 |
| DDD | 模块边界、统一语言、数据 owner |
| 微服务最佳实践 | 模块升级服务的门槛 |
| 云架构模式 | 分布式失败治理、韧性、补偿、一致性 |
| Twelve-Factor App | 配置、构建、发布、运行纪律 |
| SRE | SLI/SLO、错误预算、告警、事故响应、运行证据 |
| Evolutionary Architecture | 增量演进、适应度函数、架构漂移检测 |

### 16.2 防过度设计规则

```text
Project / Module / Work Item 是固定骨架；
专题文件和专题 Gate 按触发条件启用；
未触发的实践不得强制生成文件；
触发后必须生成足够证据并通过对应 Gate。
```

### 16.3 架构设计操作顺序

AI 做架构设计时必须按顺序执行：

```text
1. 读取 intake 和现有 Project Spec。
2. 判断 stakeholder concern。
3. 判断触发哪些 viewpoint。
4. 用 C4 判断抽象层级。
5. 用 DDD 判断模块边界和数据 owner。
6. 用 ADR 记录重要选择。
7. 用 ATAM 处理质量属性取舍。
8. 用 Trace 绑定 REQ / AC / DD / Task / Test / Evidence。
9. 生成 delta 和 candidate。
10. 进入 Gate / User Decision / Merge Runner。
```

---

## 17. Legacy Migration

### 17.1 Legacy Paths

旧路径：

```text
.specforge/specs/<WI-ID>/
```

只允许 legacy read-only。

规则：

1. 新 WI 不得写入旧路径。
2. 旧 specs 不能作为当前规格真相源。
3. 旧 specs 迁移必须通过 `spec_migration_path`。
4. 不得静默把旧 specs 和新 Project Spec 混写。

### 17.2 v1.2 到 v1.3 迁移

v1.2 项目只有最小 Project Spec Store。

v1.3 项目可以按触发条件启用：

```text
.specforge/project/views/
.specforge/project/decisions/
.specforge/project/diagrams/
.specforge/project/modules/<MODULE_CODE>/views/
```

迁移规则：

1. 不自动创建所有视角文件。
2. 不自动把 `decisions.md` 拆成 ADR 文件。
3. 需要启用新视角时，通过 Extension Subflow 登记。
4. 需要迁移历史决策时，通过 `spec_migration_path` 创建 WI。
5. 迁移必须生成 candidate、gate、user decision、merge report、trace evidence。

---

## 18. Agent / Skill / Tool 职责边界

### 18.1 sf-orchestrator

负责统一入口、WI 创建、分类、路径选择、Agent 调度、状态推进请求。

不得直接写正式 Project Spec。

### 18.2 Requirements Agent

负责需求分析、需求 delta、需求 candidate。

不得绕过 Gate 直接写 `.specforge/project/**`。

### 18.3 Design Agent

负责设计分析、架构影响、设计 delta、设计 candidate、多视角 candidate。

不得临时创造未登记 view_type。

### 18.4 Task Planner

负责把已批准设计转化为任务和 `allowed_write_files` 建议。

不得释放 code_permission。

### 18.5 Gate Runner

负责运行 Gate、生成 Gate Report、Gate Summary、请求状态推进。

不得直接改正式规格。

### 18.6 User Decision Recorder

负责记录用户显式决策。

不得替用户做决定。

### 18.7 Merge Runner

唯一正式 Project Spec 写入者。

### 18.8 code_permission_service / Write Guard

负责代码写入授权和拦截。

### 18.9 close_gate

负责关闭前最终一致性检查。

---

## 19. Live Acceptance

v1.3 多视角体系必须至少通过以下正向和负向用例。

### 19.1 正向用例

```text
用户提出一个影响业务价值、用户旅程、模块需求、API 和数据的需求变更
→ 创建 WI
→ impact_analysis 识别 view_type
→ 生成 requirements_delta / design_delta / trace_delta
→ 生成 views/** 和 modules/** candidate
→ Gate 通过
→ 用户审批
→ Merge Runner 合并
→ project_spec_version 递增
→ trace_matrix 更新
→ close_gate closed
```

### 19.2 负向用例

必须阻断：

1. Agent 直接写 `.specforge/project/**`。
2. Candidate Manifest 中出现裸 `project/...` 路径。
3. `module_id` / `MODULE_CODE` 混用导致 ID 不合法。
4. 未登记 view_type 创建 `views/*.md`。
5. 未登记 gate_type 被执行。
6. `decisions/ADR-*.md` 在未登记时被创建。
7. `base_project_spec_version` 过期仍尝试 merge。
8. Candidate hash 不匹配。
9. Trace 缺 REQ / AC / DD / TEST / EVIDENCE。
10. changed_files_audit 发现 manifest 外正式规格写入。

---

## 20. 禁止事项总表

1. 禁止无 WI 修改代码或正式规格。
2. 禁止 Agent 直接写 `.specforge/project/**`。
3. 禁止 native Write / edit / apply_patch 绕过 Write Guard。
4. 禁止把 `.specforge/runtime/**` 当真相源。
5. 禁止把 `work_item.json.status` 当权威状态。
6. 禁止 Candidate 使用 patch 替代完整候选文件。
7. 禁止裸 `project/...` 路径进入机器字段。
8. 禁止小写模块目录作为正式模块主键。
9. 禁止未登记扩展视角、Gate、分析文件。
10. 禁止为小变更机械生成所有多视角文件。
11. 禁止把页面、按钮、数据库表直接当模块边界。
12. 禁止用代码目录反向决定业务模块。
13. 禁止跳过 User Decision 合并正式规格。
14. 禁止 close_gate 在 verification、evidence、trace、audit 不完整时关闭。

---

## 21. 本标准的实施阶段

### 21.1 v1.2.x 维护期

只修真实运行暴露的 P0/P1，不做大架构改造。

### 21.2 v1.3 设计冻结

先冻结本标准，再实现：

```text
Project Spec 多视角模型
Extension Registry 完整治理
Project Spec Validator
Cross View Validator
Candidate / Merge 强校验
Automated Live Acceptance
```

### 21.3 v1.3 实现顺序

```text
1. 标准融合 docs-only 包
2. conflict matrix 与 source mapping
3. schema / path / naming 统一
4. Project Spec 多视角服务层
5. Gate 接入
6. Merge Runner 接入
7. Live Acceptance 自动化
```

---

## 22. 最终闭环主链路

```text
User Request
→ sf-orchestrator
→ Work Item
→ intake.md
→ change_classification.md
→ impact_analysis.md
→ trigger_result.json
→ delta
→ candidate_manifest.json
→ candidates/project/**
→ Gate Runner
→ gate_summary.md
→ User Decision
→ Merge Runner
→ spec_manifest.json / extension_registry.json / Project Spec 更新
→ post_merge_gate
→ code_permission_service 如需要
→ Write Guard
→ changed_files_audit
→ verification_report.md
→ evidence_manifest.json
→ trace_matrix.md / module trace.md
→ close_gate
→ closed
```

这是 SpecForge Unified Standard v1.3 的最低闭环。任何新能力都不得绕开这条链路。
