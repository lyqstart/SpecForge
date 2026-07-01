# SpecForge Unified Standard v1.3 Final Review Candidate（最终审查候选版）

> 状态：final-review-candidate / design-freeze-candidate
> 用途：作为 SpecForge v1.3 设计冻结候选标准，不直接替代 v1.2-stable 运行基线。
> 裁决原则：以 v1.1 final executable-standard 的控制面 hard rules 为主干，吸收 v1.14 Project Spec 多视角与架构治理内容；任何新增视角、专题文件、专题 Gate、artifact_type、workflow_path 都必须受 extension_registry.json 管控。
> 审查结论：文档级终审为“有条件通过”；进入代码实现前仍必须执行 Agent / Skill / Tool / Runtime / Installer 职责映射审查。

---

## 0A. 本融合版的硬裁决

1. 本文件不是上一版短稿的修补版，而是以 v1.1 正式执行标准为主干的完整融合版。
2. v1.1 的 hard control 不得被删减：Work Item、Candidate、Gate、User Decision、Merge Runner、Write Guard、changed_files_audit、close_gate、rollback、superseded、Agent 边界等规则必须保留。
3. v1.14 的 Project Spec Architecture 内容不得作为并列标准存在，只能作为 Project Spec 多视角与架构治理内容融入。
4. v1.14 中能转成路径、字段、文件职责、Gate、Trace、Candidate、Merge、Agent 操作约束的内容，进入本文件。
5. v1.14 中长篇方法论解释、示例、重复论证、独立标准定位、与 v1.1 控制面冲突的内容，不进入本文件正文，应转入 playbook、examples 或删除。
6. 新增视角、专题文件、专题 Gate、artifact_type、workflow_path 必须通过 `.specforge/project/extension_registry.json` 受控登记。
7. Agent 只能提出候选；Gate 只能检查；User Decision 只能审批；Merge Runner 才能写正式 Project Spec。

---

## 0B. 最终审查裁决

本版本经过文档级终审，形成以下最终裁决：

1. v1.1 的 Work Item、Candidate、Gate、User Decision、Merge Runner、Write Guard、changed_files_audit、close_gate、Evidence、Trace、状态权威模型均保留为 hard control。
2. v1.14 的 Project Spec 多视角内容只在转化为路径、字段、Gate、Trace、Candidate、Merge、Agent 操作约束后进入正文。
3. `extension_registry.json` 是所有新增 view_type、gate_type、artifact_type、workflow_path 的统一登记源；任何未登记扩展不得进入正式规格。
4. `.specforge/project/views/**` 是 Project-level 多视角专题规格位置；`.specforge/project/modules/<MODULE_CODE>/**` 是模块级详细规格位置；`.specforge/work-items/<WI-ID>/**` 是过程事务位置。
5. `.specforge/reports/**` 是允许写入的非真相源报告区；它不得替代 WI evidence、verification_report、merge_report、gate_summary 或 changed_files_audit。
6. `decisions.md` 保留为 Core 决策总索引；`decisions/ADR-*.md` 是 Conditional ADR Detail Extension，必须先登记再创建。
7. 本标准通过文档级冻结审查，但不声明当前代码已经全部实现 v1.3；实现状态以 `specforge_v1_3_implementation_gap_matrix.md` 和后续代码职责映射审查为准。

---

## 0. 总则

### 0.1 SpecForge 的目标

SpecForge 不是简单的文档生成器，而是面向 AI 编程流程的规格驱动工作流系统。

它的核心目标是：

```text
任何变更只能通过 Work Item 事务进入系统；
正式规格只能通过 Candidate + Gate + User Decision + Merge Runner 合并；
代码只能在 code_permission + allowed_write_files + Write Guard 下修改；
关闭只能在 verification、evidence、trace、audit、merge 或 not_applicable 全部闭环后通过 close_gate。
```

### 0.2 最高约束

所有 Agent、工具、脚本、命令、Formatter、Generator、Merge、Migration、Rollback 都必须遵守本标准。

任何实现不得依赖 Agent 自觉执行关键控制。关键控制必须落到：

```text
Runtime
State Machine
Path Service
Path Policy
Gate Runner
User Decision Recorder
Merge Runner
code_permission_service
Write Guard
changed_files_audit
close_gate
```

### 0.3 有效规则优先级

当旧文档、旧代码、历史讨论、旧施工手册与本标准冲突时，优先级固定为：

```text
本文件 v1.3
> v1.1 final fused standard + Patch 1 的有效控制规则
> v1.14 Project Spec Architecture Standard 中被吸收的多视角与架构治理规则
> v0.48-normalized 中的最终有效规则
> v0.48 原始讨论成果
> v1.0 草案
> 旧代码行为
> Agent 自行判断
```

旧规则不得因为“代码当前就是这样”而继续保留。旧行为只能作为 legacy input，不得作为新标准依据。

---

## 1. 目录边界与路径治理

### 1.1 两层责任模型

SpecForge 目录分为两层：

```text
OpenCode 扩展层
项目级 .specforge 工作区
```

OpenCode 扩展层用于放置 SpecForge 的 Agent、Tool、Plugin、Skill 和扩展私有数据。项目级 `.specforge/` 只保存被管理项目的规格事实、Work Item 事务和 runtime 临时状态。

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
5. `sf-user/` 保存 SpecForge 扩展私有用户数据。
6. 新版本不得默认写入 `~/.specforge/`。
7. `~/.specforge/` 只作为 legacy read-only 来源。

### 1.3 用户项目 `.specforge/` v1.3 顶层目录边界

v1.3 标准下，用户项目 `.specforge/` 的顶层目录边界为：

```text
<project>/.specforge/
  project/
  work-items/
  runtime/
  reports/
```

含义：

| 目录 | 职责 | 是否真相源 |
|---|---|---|
| `.specforge/project/` | 项目级正式规格 | 是 |
| `.specforge/work-items/` | 每次变更事务 | 否，除 Candidate 待合并内容外均为过程产物 |
| `.specforge/runtime/` | 临时状态、缓存、索引、日志 | 否 |
| `.specforge/reports/` | 项目级报告、发布记录、人工/自动验收报告的非真相源输出区 | 否 |

v1.3 标准下，默认禁止创建以下历史或非受控顶层目录：

```text
.specforge/standards/
.specforge/archive/
.specforge/state/
.specforge/gates/
.specforge/snapshots/
```

### 1.3.1 状态权威模型

SpecForge 的运行状态只能有一个权威来源：

```text
events.jsonl / StateManager = 唯一权威状态事件源
runtime/state.json = 从权威状态投影生成的运行缓存
work_item.json = Work Item 元数据档案，不是状态源
```

规则：

1. 状态迁移必须由 Runtime State Machine / State Coordinator 统一完成。
2. Gate Runner、User Decision Recorder、Merge Runner、close_gate 只能产出证据并请求状态迁移，不得直接把 `runtime/state.json` 或 `work_item.json.status` 当作权威状态改写。
3. `runtime/state.json` 是 projection cache，可由 `events.jsonl / StateManager` 重建；当它与权威状态不一致时，以权威状态为准。
4. `work_item.json` 只保存 WI 元数据、流程路径、权限范围、创建信息等档案字段；不得作为 Gate / Decision / Merge / Close 的状态判断依据。
5. 历史 `work_item.json.status` 字段如存在，只能作为 legacy display field 兼容读取；任何治理判断不得读取它作为当前状态。
6. 后续状态治理完成后，应删除 `work_item.json.status` 的生成、写入和读取代码，避免旧状态源长期遗留。
7. 工具运行时查询当前状态，应通过 StateManager / State Coordinator 获取内存态；不得每次全量 replay `events.jsonl`，也不得由各工具自行解析多个状态文件。


### 1.4 治理标准文件位置

SpecForge 治理标准文件不属于用户项目 `.specforge/`。

正式位置：

```text
SpecForge/docs/standards/
  fused_standard.md
  implementation_playbook.md
  source_mapping.md
```

用户项目不得生成：

```text
.specforge/standards/fused_standard.md
.specforge/standards/implementation_playbook.md
.specforge/standards/source_mapping.md
```

### 1.5 Path Service

`directory-layout.ts` 不能只是路径常量表，必须升级为路径治理体系。

Path Service 负责生成所有关键路径。Agent 不得自由拼接正式规格路径、Work Item 关键路径、Candidate 路径、Gate 路径、User Decision 路径、Merge Report 路径。

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
projectView(viewType)
projectDecisionsRoot()
projectDecisionLog()
projectAdr(adrId)
projectReportsRoot()
projectModulesRoot()
moduleRoot(moduleCode)
moduleJson(moduleCode)
moduleRequirements(moduleCode)
moduleDesign(moduleCode)
moduleTrace(moduleCode)
workItemsRoot()
workItemRoot(workItemId)
workItemJson(workItemId)
workItemIntake(workItemId)
workItemRuntimeLog(workItemId)
```

### 1.6 Path Policy

Path Policy 负责判断路径能否创建、读取、写入和由谁写入。

所有路径必须满足：

1. 使用项目根目录相对路径。
2. 使用 POSIX 风格 `/`。
3. 不允许绝对路径。
4. 不允许 `..`。
5. 不允许 `~`。
6. 不允许 Windows 反斜杠 `\`。
7. 引用项目规格文件必须带 `.specforge/` 前缀。

### 1.7 Legacy Paths

旧路径：

```text
.specforge/specs/<WI-ID>/
```

只允许 legacy read-only。

规则：

1. 新 WI 不得写入旧路径。
2. 旧 specs 不能作为当前规格真相源。
3. 旧 specs 迁移必须通过 `spec_migration_path`。
4. 不得静默把旧 specs 和新 project specs 混写。

---

## 2. 项目级正式规格真相源

### 2.1 正式规格目录结构

v1.3 项目级正式规格分为 Core、Conditional Extension 与 Optional Extension。Core 文件在项目初始化时必须存在；Conditional / Optional 文件不得机械创建，必须先由 `extension_registry.json` 登记，再通过 WI Candidate、Gate、User Decision、Merge Runner 创建或更新。

Core 结构固定为：

```text
.specforge/project/
  spec_manifest.json
  extension_registry.json
  requirements_index.md
  design_index.md
  architecture.md
  glossary.md
  trace_matrix.md
  decisions.md
  modules/
    <MODULE_CODE>/
      module.json
      requirements.md
      design.md
      trace.md
```

Conditional Extension 结构统一放在受控目录下：

```text
.specforge/project/
  views/
    <view_file>.md
  decisions/
    decision_log.md
    ADR-0001-title.md
```

规则：

1. `.specforge/project/views/**` 只保存 Project-level 多视角专题规格，不保存模块级详细规格。
2. `.specforge/project/decisions/**` 只在 ADR Detail Extension 启用后创建。
3. `.specforge/project/decisions.md` 始终保留，作为 MVP 决策日志与 v1.3 决策总索引。
4. `modules/<MODULE_CODE>/` 使用 canonical `MODULE_CODE`，不得使用小写模块名、短横线或 `MOD-*` 作为目录名。
5. 任何正式规格路径必须写为 `.specforge/project/...`，不得在机器字段中使用 `project/...` 简写。

### 2.2 文件职责

| 文件 | 职责 | 是否真相源 | 分级 |
|---|---|---|---|
| `spec_manifest.json` | 项目规格总索引、版本、模块定位、视角登记引用、最近 Merge 来源 | 是，索引真相源 | Core |
| `extension_registry.json` | view_type、gate_type、artifact_type、workflow_path 等扩展登记源 | 是，扩展登记真相源 | Core |
| `requirements_index.md` | 需求域、模块、需求文件、跨模块需求索引 | 是，索引真相源 | Core |
| `design_index.md` | 设计域、模块设计、跨模块设计索引 | 是，索引真相源 | Core |
| `architecture.md` | 模块边界、数据所有权、部署/安全/架构约束总纲 | 是 | Core |
| `glossary.md` | 统一术语、业务口径、枚举、状态、权限名 | 是 | Core |
| `trace_matrix.md` | 项目级 REQ / AC / DD / VIEW / ADR / TASK / FILE / TEST / EVIDENCE 追溯 | 是 | Core |
| `decisions.md` | 决策总索引、MVP 决策日志、ADR Detail Extension 的总入口 | 是 | Core |
| `views/<view_file>.md` | Project-level 多视角专题规格 | 是 | Conditional / Optional Extension |
| `decisions/decision_log.md` | ADR 明细索引 | 是 | Conditional Extension |
| `decisions/ADR-*.md` | 单条架构决策记录 | 是 | Conditional Extension |
| `modules/<MODULE_CODE>/module.json` | 模块元数据、状态、路径归属 | 是 | Core per active module |
| `modules/<MODULE_CODE>/requirements.md` | 模块级详细需求 | 是 | Core per active module |
| `modules/<MODULE_CODE>/design.md` | 模块级详细设计 | 是 | Core per active module |
| `modules/<MODULE_CODE>/trace.md` | 模块内部追溯 | 是 | Core per active module |

### 2.3 `spec_manifest.json`

`spec_manifest.json` 负责：

1. 记录 schema 版本。
2. 记录当前 `project_spec_version`。
3. 记录项目名称。
4. 记录项目级规格文件路径。
5. 记录 `extension_registry.json` 路径。
6. 记录模块列表和模块规格文件路径。
7. 记录已启用的 Project-level view 文件路径。
8. 记录 ADR Detail Extension 的启用状态与索引路径。
9. 记录当前规格版本来源的最近一次 Merge。

不得记录：

```text
standard_version
active_work_items
runtime 状态
Gate 执行结果
User Decision
OpenCode 扩展路径
```

示例：

```json
{
  "schema_version": "1.0",
  "project_spec_version": "PSV-0001",
  "project_name": "",
  "project": {
    "extension_registry": ".specforge/project/extension_registry.json",
    "requirements_index": ".specforge/project/requirements_index.md",
    "design_index": ".specforge/project/design_index.md",
    "architecture": ".specforge/project/architecture.md",
    "glossary": ".specforge/project/glossary.md",
    "trace_matrix": ".specforge/project/trace_matrix.md",
    "decisions": ".specforge/project/decisions.md"
  },
  "views": [],
  "adr_extension": {
    "enabled": false,
    "decision_log": null
  },
  "modules": [
    {
      "module_code": "AUTH",
      "path": ".specforge/project/modules/AUTH",
      "module_file": ".specforge/project/modules/AUTH/module.json",
      "requirements": ".specforge/project/modules/AUTH/requirements.md",
      "design": ".specforge/project/modules/AUTH/design.md",
      "trace": ".specforge/project/modules/AUTH/trace.md"
    }
  ],
  "last_merged_work_item": "WI-0007",
  "last_merged_at": "2026-06-07T00:00:00Z"
}
```

### 2.4 版本保存规则

MVP 不实现 `.specforge/archive/project-spec-snapshots/`。

版本规则：

1. 旧版本依赖 Git 保存。
2. `project_spec_version` 标识当前项目规格版本。
3. 每次正式规格 Merge 必须递增 `project_spec_version`。
4. `last_merged_work_item` 与 `last_merged_at` 说明当前版本来源。
5. Snapshot / Archive / 自动 rebase 后置。

---

## 2A. v1.3 Project Spec 多视角体系

### 2A.1 融合定位

v1.3 将 `specforge_project_spec_architecture_standard_v1_14_consolidated.md` 中的 Project Spec 多视角、架构治理、专题 Gate、行业实践吸收规则，纳入本统一标准。

融合后，v1.14 不再作为并列上位标准存在。它被吸收为 Project Spec 多视角与架构治理章节，必须服从本文件的 Work Item、Candidate、Gate、User Decision、Merge Runner、Write Guard、close_gate 与 Extension Subflow 规则。

固定裁决：

```text
v1.1 hard control 不得被 v1.14 覆盖；
v1.14 只能补充 Project Spec 表达体系、视角体系、架构治理和专题 Gate；
新增视角、专题文件、专题 Gate、workflow_path、artifact_type 必须通过 extension_registry.json 登记；
任何正式 Project Spec 修改只能通过 Candidate + Gate + User Decision + Merge Runner 进入 .specforge/project/**。
```

### 2A.2 Project / Module / Work Item 三层职责

Project Spec、Module Spec 与 Work Item 的职责固定为：

```text
Project 管全局设计、索引、跨模块规则和技术架构约束；
Module 管当前完整需求和模块内部设计；
Work Item 管每一次变更过程、delta、任务、证据、合并记录和迁移记录。
```

补充约束：

1. Project 与 Module 是当前正式规格真相源。
2. Work Item 是变更事务，不是长期规格真相源。
3. Work Item 中的 Delta 只描述变更，不保存完整规格。
4. Candidate 是将 Delta 应用于当前正式规格后生成的完整候选文件，不是 patch。
5. Candidate 通过 Gate、User Decision 与 Merge Runner 后，才允许写入 Project / Module 当前规格。

### 2A.3 架构设计的治理定义

架构设计不是画图，也不是写一个孤立的 `design.md`，而是一个有视角、有依据、有权衡、有决策、有验证、有演进记录的工程治理过程。

任何架构结论必须至少落到以下对象之一：

```text
.specforge/project/architecture.md
.specforge/project/views/*.md
.specforge/project/modules/<MODULE_CODE>/design.md
.specforge/project/decisions.md
.specforge/project/decisions/ADR-*.md
.specforge/project/trace_matrix.md
.specforge/work-items/<WI-ID>/*_delta.md
.specforge/work-items/<WI-ID>/candidate_manifest.json
.specforge/work-items/<WI-ID>/gates/**
.specforge/work-items/<WI-ID>/evidence/**
```

禁止只在聊天、临时说明或 Agent handoff 中形成架构结论而不进入规格治理链。

### 2A.4 多视角总链路

SpecForge 采用以下链路组织 Project Spec 多视角：

```text
Stakeholder → Concern → Viewpoint → View → Spec File → Gate → Trace
```

规则：

1. 创建或更新任何视角前，必须说明 stakeholder 与 concern。
2. 每个 viewpoint 必须有明确 observation target 与 granularity。
3. 每个 view 必须落到 `.specforge/project/**` 或当前 WI 的 candidate 文件。
4. 每个 view 必须进入 Gate 检查。
5. 每个 active REQ / AC / DD / ADR / VIEW 必须能进入 Trace。
6. AI 不得因为存在某个文件名就机械创建视角；视角必须服务明确的 stakeholder concern。

### 2A.5 Core / Conditional / Optional 文件分级

Project Spec 文件分为三类：

| 级别 | 含义 | 创建规则 |
|---|---|---|
| Core | 项目规格真相源和事务闭环最小必备文件 | 项目初始化时必须创建或由标准初始化流程补齐 |
| Conditional | 触发条件成立时必须创建 | 必须先在 `extension_registry.json` 登记，再通过 WI Candidate 创建 |
| Optional | 项目复杂度较高时启用 | 必须通过 Extension Subflow 或明确项目配置启用 |

Core 文件固定为：

```text
.specforge/project/spec_manifest.json
.specforge/project/extension_registry.json
.specforge/project/requirements_index.md
.specforge/project/design_index.md
.specforge/project/architecture.md
.specforge/project/glossary.md
.specforge/project/decisions.md
.specforge/project/trace_matrix.md
.specforge/project/modules/<MODULE_CODE>/module.json
.specforge/project/modules/<MODULE_CODE>/requirements.md
.specforge/project/modules/<MODULE_CODE>/design.md
.specforge/project/modules/<MODULE_CODE>/trace.md
```

Conditional 多视角文件统一放入：

```text
.specforge/project/views/
```

典型 Conditional 文件：

```text
.specforge/project/views/business_value.md
.specforge/project/views/user_journeys.md
.specforge/project/views/ui_experience_design.md
.specforge/project/views/frontend_design.md
.specforge/project/views/integration_design.md
.specforge/project/views/api_contracts.md
.specforge/project/views/data_model.md
.specforge/project/views/database_design.md
.specforge/project/views/event_flows.md
.specforge/project/views/security_design.md
.specforge/project/views/reliability_design.md
.specforge/project/views/observability_design.md
.specforge/project/views/deployment_design.md
.specforge/project/views/quality_attributes.md
.specforge/project/views/architecture_risks.md
.specforge/project/views/crosscutting_concepts.md
.specforge/project/views/domain_model.md
.specforge/project/views/context_map.md
.specforge/project/views/service_catalog.md
.specforge/project/views/resilience_patterns.md
.specforge/project/views/configuration_design.md
.specforge/project/views/dependency_manifest.md
.specforge/project/views/environment_matrix.md
.specforge/project/views/release_strategy.md
.specforge/project/views/slo_catalog.md
.specforge/project/views/incident_response.md
.specforge/project/views/operational_readiness.md
.specforge/project/views/architecture_roadmap.md
.specforge/project/views/fitness_functions.md
.specforge/project/views/deprecation_policy.md
```

禁止事项：

```text
禁止因为视角存在就默认创建空文件；
禁止因为专题 Gate 存在就默认执行；
禁止因为方法论存在就强制生成分析文件；
禁止绕过 extension_registry.json 临时创造 view_type / gate_type / artifact_type。
```

### 2A.6 Project Spec v1.3 目录

v1.3 目标目录如下：

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
  views/
    <conditional-view-files>.md
  decisions/
    decision_log.md
    ADR-0001-title.md
  modules/
    <MODULE_CODE>/
      module.json
      requirements.md
      design.md
      trace.md
```

兼容裁决：

1. `.specforge/project/decisions.md` 是 Core 决策总索引，必须保留。
2. `.specforge/project/decisions/` 是 Conditional ADR Detail Extension，不是 Core。
3. 只有 `extension_registry.json` 登记 `adr_detail` / `adr_directory` 后，才允许创建 `.specforge/project/decisions/`。
4. `views/` 只保存 Project-level Conditional View，不保存模块级详细规格。
5. 模块级详细规格仍保存在 `.specforge/project/modules/<MODULE_CODE>/`。
6. `.specforge/project/diagrams/` 如启用，必须是 Optional Extension，图不得成为唯一事实源。

### 2A.7 多视角契约

| Viewpoint | 主要 Stakeholder | Concern | 观察对象 | 典型颗粒度 | SpecForge 文件 | 分级 |
|---|---|---|---|---|---|---|
| Project Overview | 用户、orchestrator、Agent | 当前规格版本、模块、视角登记 | 项目规格索引 | 项目 | `.specforge/project/spec_manifest.json` | Core |
| Requirement View | 用户、Requirements Agent、测试 | 系统要做什么 | 需求、AC、模块需求 | 项目 / 模块 / REQ | `requirements_index.md` + module `requirements.md` | Core |
| Design View | Design Agent、Executor、Reviewer | 如何实现 | 设计决策、模块内部设计 | 项目 / 模块 / DD | `design_index.md` + module `design.md` | Core |
| Architecture View | 架构师、Reviewer、Agent | 系统边界、架构约束 | 系统、模块、部署、安全、横切规则 | 系统 / 模块 / 运行单元 | `architecture.md` | Core |
| Traceability View | QA、Verifier、close_gate | 是否闭环 | REQ/AC/DD/TASK/FILE/TEST/EVIDENCE | Trace row | `trace_matrix.md` + module `trace.md` | Core |
| Decision View | 用户、Reviewer、维护者 | 为什么这样设计 | 决策、候选方案、后果 | Decision / ADR | `decisions.md`；可扩展 `decisions/ADR-*.md` | Core + Conditional |
| Glossary View | 所有 Agent | 术语一致性 | 业务术语、状态、枚举、权限名 | Term | `glossary.md` | Core |
| Business Value View | 业务负责人、甲方、用户 | 系统为什么有价值 | 业务目标、成本、效率、数据能力 | 项目 / 业务任务 | `views/business_value.md` | Conditional |
| User Journey View | 最终用户、业务专家、产品 | 用户如何完成业务 | 用户角色、业务场景、任务链路 | 端到端任务 | `views/user_journeys.md` | Conditional |
| UI/UX View | 用户、产品、前端、测试 | 页面是否好用、流程是否顺 | 页面、表单、按钮、列表、状态 | 页面 / 操作单元 | `views/ui_experience_design.md` | Conditional |
| Frontend Architecture View | 前端、架构师、Agent | 前端如何组织和运行 | 路由、页面模块、状态管理 | 路由域 / 页面模块 | `views/frontend_design.md` | Conditional |
| Integration View | 后端、集成方、测试 | 模块如何协作 | 调用链、同步/异步协作 | 模块关系 / 集成场景 | `views/integration_design.md` | Conditional |
| API Contract View | 前端、后端、集成方 | 接口如何对接 | API、消息、错误码 | Endpoint / Message | `views/api_contracts.md` | Conditional |
| Data View | 后端、DBA、数据分析、安全 | 数据归属和共享边界 | 实体、表、字段、生命周期 | 实体 / 表 / 字段 | `views/data_model.md` / `views/database_design.md` | Conditional |
| Event / Runtime View | 后端、架构师、测试 | 运行时状态如何变化 | 事件、状态机、补偿、幂等 | Flow / Event / State | `views/event_flows.md` | Conditional |
| Security View | 安全、运维、架构师 | 如何保护系统和数据 | 身份、权限、密钥、审计、敏感字段 | 安全场景 / 权限点 | `views/security_design.md` | Conditional |
| Reliability View | 运维、SRE、用户 | 故障时如何保持可用 | 故障模式、恢复策略、降级、容灾 | 故障场景 / SLO | `views/reliability_design.md` | Conditional |
| Observability View | 运维、开发、SRE | 如何发现和定位问题 | 日志、指标、链路、告警 | 信号 / 告警规则 | `views/observability_design.md` | Conditional |
| Deployment View | 运维、DevOps、架构师 | 系统如何部署运行 | 环境、节点、配置、网络、资源 | 环境 / 部署单元 | `views/deployment_design.md` | Conditional |
| Quality Attribute View | 架构师、业务负责人、测试 | 性能、安全、成本、可维护性取舍 | 质量属性、场景、目标值 | 质量场景 / Trade-off | `views/quality_attributes.md` | Conditional |
| Risk View | 架构师、项目经理、用户 | 架构风险和未决问题 | 风险、假设、债务 | 风险项 | `views/architecture_risks.md` | Conditional |
| Crosscutting View | 架构师、Agent、开发 | 跨模块共同规则 | API、错误、审计、日志、权限、命名 | 横切规则 | `views/crosscutting_concepts.md` | Conditional |

### 2A.8 视角颗粒度规则

1. 业务价值视角必须以业务目标、业务任务、成本、效率、数据能力和决策能力为颗粒度，不得以按钮、表、接口作为主要颗粒度。
2. 用户旅程视角必须以用户完成一个端到端业务任务为颗粒度。
3. UI/UX 视角必须以页面和业务操作单元为颗粒度；单个按钮或字段只有影响业务任务完成、权限、安全或数据质量时，才单独成为设计对象。
4. 前端架构视角必须以路由域、页面模块、状态边界、组件组、数据加载策略为颗粒度，不得替代 UI/UX 的业务操作说明。
5. 模块视角必须以业务能力、职责边界、数据 owner、规则内聚和依赖关系为颗粒度，不得用页面、按钮或数据库表直接决定模块边界。
6. API 视角必须以跨边界契约为颗粒度；页面需要的数据不等于 API 应按页面一比一设计。
7. 数据视角必须以业务实体、数据归属、共享模型、表、字段和生命周期为颗粒度；字段级设计只有涉及共享、敏感、安全、索引、兼容或数据质量时才必须显式记录。
8. 运行时 / 事件视角必须以业务流程、事件、状态迁移、失败补偿和幂等为颗粒度。
9. 部署视角必须以部署单元、环境、资源、网络、配置和运行依赖为颗粒度；模块不自动等于部署单元。
10. 质量、风险和决策视角必须以可验证场景、权衡、风险项和 ADR 为颗粒度。

当一个 Work Item 涉及多个颗粒度时，AI 必须保持从业务到技术的顺序：

```text
Business Task → User Journey → UI Operation Unit → Requirement / AC → Module Responsibility → API/Data/Event Contract → Task / Code / Test → Evidence
```

### 2A.9 行业实践到 SpecForge 机制映射

行业实践不得作为孤立方法论罗列，必须转化为目录、文件、字段、流程、Gate、模板或 Agent 操作约束。

| 行业实践 | v1.3 吸收机制 | 触发输出 | Gate |
|---|---|---|---|
| ISO 42010 | stakeholder / concern / viewpoint / view / trace 链路 | viewpoint impact | `viewpoint_gate` |
| arc42 | `architecture.md` 结构化章节与引用入口 | architecture candidate | `architecture_structure_gate` |
| C4 Model | C1/C2/C3/C4 层级影响字段，防止从需求跳代码 | `c4_impact` in `impact_analysis.md` | `c4_layer_gate` |
| ADR | 重要架构选择的决策治理 | `adr_draft.md` + optional ADR candidate | `adr_gate` |
| ATAM | 质量属性取舍分析 | `quality_attribute_analysis.md` | `atam_gate` |
| DDD | 模块边界、领域模型、数据 owner 治理 | `domain_analysis.md` / `module_boundary_analysis.md` | `domain_boundary_gate` |
| Microservices | 模块升级为服务的门槛治理 | `service_candidate_matrix.md` / `service_catalog.md` | `service_boundary_gate` |
| Cloud Architecture Patterns | 跨边界失败、重试、补偿、最终一致性治理 | `resilience_analysis.md` | `resilience_pattern_gate` |
| Twelve-Factor App | 配置、依赖、环境、构建/发布/运行治理 | `runtime_delivery_analysis.md` | `runtime_delivery_gate` |
| SRE | SLO、告警、运行就绪、事故响应和运行证据 | `sre_impact_analysis.md` | `sre_operational_readiness_gate` |
| Evolutionary Architecture | 受控增量演进、适应度函数、架构漂移和废弃策略 | `architecture_evolution_plan.md` | `architecture_evolution_gate` |

### 2A.10 专题 Gate 分级

基础 Gate 默认适用于所有 Work Item：

| Gate | 作用 |
|---|---|
| `intake_gate` | 检查 WI 输入、目标、范围和用户确认是否清晰 |
| `impact_gate` | 检查影响范围、触发专题分析和风险识别是否完整 |
| `trace_gate` | 检查 REQ / AC / DD / Task / Test / Evidence 追溯关系 |
| `candidate_consistency_gate` | 检查候选规格与当前 Project / Module 规格是否冲突 |
| `merge_gate` | 检查合并报告、用户确认、文件更新和证据是否闭环 |

专题 Gate 按条件触发，且必须登记于 `extension_registry.json`：

| Gate | 触发条件 |
|---|---|
| `viewpoint_gate` | 涉及新增/调整架构视角、用户旅程、UI/UX、前端或跨视角设计 |
| `adr_gate` | 涉及重要架构决策、替代旧决策或多个候选方案 |
| `atam_gate` | 涉及性能、安全、可靠性、成本、可维护性等质量属性取舍 |
| `domain_boundary_gate` | 涉及模块创建、拆分、合并、重命名、职责或数据 owner 变化 |
| `service_boundary_gate` | 涉及模块升级为独立服务或服务边界变化 |
| `resilience_pattern_gate` | 涉及跨边界调用、外部依赖、异步事件、最终一致性或补偿/对账 |
| `runtime_delivery_gate` | 涉及配置、依赖、环境、构建、发布、运行、日志、健康检查、迁移 |
| `sre_operational_readiness_gate` | 涉及 SLO、告警、可靠性目标、事故响应、运行就绪 |
| `architecture_evolution_gate` | 涉及目标架构路线、适应度函数、架构漂移、废弃或迁移 |
| `c4_layer_gate` | 涉及系统上下文、运行单元、组件或代码层级影响判断 |
| `architecture_structure_gate` | 涉及 `architecture.md` 结构、上下文、构建块、运行时、部署、质量、风险 |

AI 必须在 `impact_analysis.md` 中输出本次 WI 的 Gate 清单。未触发的专题 Gate 不得强制执行；如果实际设计内容触发该 Gate，AI 不得以“未声明触发”为理由绕过。

### 2A.11 `impact_analysis.md` v1.3 多视角字段

`impact_analysis.md` 必须新增或兼容以下机器可读字段：

```yaml
project_spec_multiview_impact:
  affected_viewpoints: []
  affected_project_files: []
  affected_modules: []
  required_conditional_views: []
  required_extension_registry_entries: []
  required_gates: []
  c4_impact:
    c1_system_context: not_affected
    c2_container: not_affected
    c3_component: not_affected
    c4_code: not_affected
    reason: ""
  architecture_practice_triggers:
    adr_required: false
    atam_required: false
    domain_boundary_required: false
    service_boundary_required: false
    resilience_required: false
    runtime_delivery_required: false
    sre_required: false
    architecture_evolution_required: false
```

如果字段为 `unknown`，不得进入 `code_only_fast_path`；必须升级到相应 workflow_path 或专题 Gate。

### 2A.12 ADR 兼容规则

Core 决策文件：

```text
.specforge/project/decisions.md
```

Conditional ADR Detail Extension：

```text
.specforge/project/decisions/decision_log.md
.specforge/project/decisions/ADR-0001-title.md
```

规则：

1. `decisions.md` 是决策总索引与 MVP 决策日志，不得删除。
2. `decisions/ADR-*.md` 只有在 `extension_registry.json` 登记 ADR Detail Extension 后才允许创建。
3. WI 中可以先生成 `.specforge/work-items/<WI-ID>/adr_draft.md`。
4. 正式 ADR 必须通过 Candidate、`adr_gate`、User Decision、Merge Runner 合并。
5. Accepted ADR 不得原地改写；必须通过 supersedes / superseded_by 机制替代。
6. ADR 必须进入 Trace，并被后续 Agent 读取。

### 2A.13 Service 与 Module 的区别

SpecForge Module 是规格治理边界；Service 是可独立运行、部署、观测、维护的运行边界。模块不自动等于服务。

规则：

1. `spec_manifest.json` 管模块注册。
2. `views/service_catalog.md` 管服务注册。
3. 一个服务可以包含一个或多个模块。
4. 一个模块可以在不同阶段保持为单体内模块，也可以经过服务化流程升级为独立服务。
5. 服务化必须触发 `service_boundary_gate`，并要求 ADR / ATAM / Deployment / Observability / SLO 证据。

### 2A.14 多视角 Trace 规则

`trace_matrix.md` 必须能够表达：

```text
REQ → AC → DD → VIEW → ADR → TASK → FILE → TEST → EVIDENCE
```

规则：

1. 每个 active REQ 必须进入 Trace。
2. 每个 active AC 必须有验证方式。
3. 每个 active DD 必须至少引用一个 REQ。
4. 每个 Conditional View 如果影响需求、设计、架构、运行、安全、可靠性或部署，必须进入 Trace。
5. 每个 ADR 必须进入 Trace。
6. 每个 changed file 必须能回溯到 DD、TASK 或 WI。
7. 没有 Trace 的实现不允许 close。

### 2A.15 v1.14 内容裁决规则

v1.14 内容融入 v1.3 时，按以下规则裁决：

```text
KEEP_AS_IS：原则本身已经是可执行规则，且不与 v1.1 控制面冲突。
KEEP_WITH_MODIFICATION：方向正确，但路径、命名、职责、Gate、Merge、extension_registry 需要统一。
MOVE_TO_PLAYBOOK：示例、模板、行业实践解释、教学型材料、复杂专题展开。
DELETE：独立标准定位、重复论证、长篇方法论、和 v1.1 控制面冲突、暗示默认生成所有文件的内容。
```

---

## 3. ID 与基础格式规则

### 3.1 MODULE_CODE

```text
MODULE_CODE = [A-Z][A-Z0-9]{1,11}
```

规则：

1. 2 到 12 位。
2. 必须以大写字母开头。
3. 只允许大写字母和数字。
4. 不允许中文、小写、短横线、下划线。

### 3.2 固定 ID 正则

```regex
WI-[0-9]{4}
REQ-[A-Z][A-Z0-9]{1,11}-[0-9]{3}
AC-[A-Z][A-Z0-9]{1,11}-[0-9]{3}-[0-9]{2}
DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}
TASK-WI-[0-9]{4}-[0-9]{3}
```

### 3.3 集中实现

ID 规则必须集中实现，建议位置：

```text
tools/lib/id-rules.ts
```

禁止每个 Gate、Parser、Agent 工具各写一套正则。

---

## 4. Work Item 事务模型

### 4.1 WI 的本质

Work Item 是一次受控变更事务，不是规格真相源。

所有用户请求，无论是需求变更、设计变更、架构重构、任务调整、代码修复、样式调整、测试补充、回滚、迁移，都必须先进入 WI。

禁止无 WI 直接修改代码或正式规格。

### 4.2 WI 目录

MVP WI 目录：

```text
.specforge/work-items/<WI-ID>/
  work_item.json
  intake.md
  change_classification.md
  impact_analysis.md
  trigger_result.json
  requirements_delta.md
  design_delta.md
  tasks.md
  trace_delta.md
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

不同 `workflow_path` 可以让部分文件 `not_applicable`，但不能破坏闭环文件要求。

### 4.3 所有 WI 必须存在的闭环文件

所有 WI 最终关闭前必须有：

```text
work_item.json
intake.md
change_classification.md
impact_analysis.md
trigger_result.json
tasks.md
trace_delta.md
candidate_manifest.json
gate_summary.md
verification_report.md
merge_report.md
evidence/evidence_manifest.json
```

`code_only_fast_path` 也必须有 `candidate_manifest.json` 与 `merge_report.md`，但应标记：

```text
candidate_manifest.entries = []
merge_report.status = not_applicable
```

### 4.4 `work_item.json` 最小结构

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-0001",
  "workflow_path": null,
  "code_change_allowed": false,
  "allowed_write_files": [],
  "created_at": "2026-06-07T00:00:00Z",
  "updated_at": "2026-06-07T00:00:00Z",
  "created_by": "sf-orchestrator"
}
```

`work_item.json` 是 WI 元数据档案，不是状态源。它不得保存或驱动当前治理状态。

兼容规则：

1. 历史 `status` 字段如已存在，只能作为 legacy display field。
2. Gate / Decision / Merge / Close 不得读取 `work_item.json.status` 作为治理判断依据。
3. 新代码不得新增依赖 `work_item.json.status` 的状态判断。
4. 状态治理完成后，必须删除 `work_item.json.status` 的生成、写入和兼容读取代码，保持代码干净。

后续可扩展：

```text
required_files
required_gates
classification
impact_analysis
trigger_result
manifest_hash
candidate_hash
gate_summary_hash
base_spec_version
merge_status
verification_status
close_status
```

### 4.5 `intake.md`

`intake.md` 必须原样保存用户原始请求。

规则：

1. 用户原始请求不能被 Agent 改写后覆盖。
2. 可增加 Normalized Summary，但不能替代 Original User Request。
3. 后续 classification 与 impact_analysis 必须引用 intake。

---

## 5. 状态机

### 5.1 主状态枚举

MVP 主状态必须支持：

```text
created
intake_ready
impact_analyzing
impact_analyzed
workflow_selected
candidate_preparing
candidate_prepared
gates_running
gates_failed
approval_required
approved
merge_ready
merging
merged
post_merge_verified
implementation_ready
implementation_running
implementation_done
verification_running
verification_done
closed
blocked
rejected
superseded
```

### 5.2 禁止跳转

必须禁止：

```text
created → implementation_running
intake_ready → implementation_running
impact_analyzing → implementation_running
impact_analyzed → implementation_running
workflow_selected → implementation_running
candidate_prepared → merging
approval_required → merging
approval_required → closed
merged → closed
closed → any
blocked → closed
rejected → closed
```

### 5.3 状态推进主体

普通 Agent 不得直接推进 WI 状态。

状态推进只能由：

```text
sf-orchestrator
Runtime State Machine
Gate Runner
User Decision Recorder
Merge Runner
code_permission_service
close_gate
```

在各自权限范围内完成。

### 5.4 恢复机制

中断恢复必须通过 `resume_check` 与 `resume_plan`。

恢复时必须检查：

1. 当前 WI 状态。
2. 必需文件是否存在。
3. 文件 hash 是否匹配。
4. Candidate / Gate / User Decision 是否失效。
5. code_permission 是否仍有效。
6. 是否存在越界写入。
7. 是否需要回退到更早状态。

---

## 6. 用户请求入口、分类与路径选择

### 6.1 统一入口

SpecForge 只有一个主入口：

```text
sf-orchestrator
```

所有用户请求必须先：

```text
User Request
→ create WI
→ intake.md
→ change_classification.md
→ impact_analysis.md
→ trigger_result.json
→ workflow_path
```

### 6.2 Classification 与 Impact 的分工

`change_classification.md` 负责判断变化层级与推荐 `workflow_path`。

它回答：

```text
这次变更可能触及需求、设计、架构、任务还是代码实现？
```

`impact_analysis.md` 负责展开影响范围。

它回答：

```text
这次变更影响哪些正式规格、模块、Trace、测试、证据、代码区域和后续文件？
```

`trigger_result.json` 是机器可读的路径选择结果。

### 6.3 匹配结果类型

MVP 固定 6 类：

```text
exact_match
partial_match
related_match
conflict_match
no_match
spec_gap_match
```

匹配结果写入：

```text
.specforge/work-items/<WI-ID>/impact_analysis.md
```

固定章节：

```markdown
## Existing Spec Match
```

### 6.4 workflow_path 枚举

MVP 固定：

```text
requirement_change_path
design_change_path
architecture_change_path
task_change_path
code_only_fast_path
spec_migration_path
rollback_path
```

### 6.5 路径优先级

普通路径优先级：

```text
architecture_change_path
requirement_change_path
design_change_path
task_change_path
code_only_fast_path
```

特殊路径：

```text
spec_migration_path
rollback_path
```

由明确触发条件进入，不参与普通降级排序。

### 6.6 unknown 升级规则

只要关键字段为 `unknown`，不得选择 `code_only_fast_path`。

升级规则：

```text
架构边界 unknown → architecture_change_path
需求语义 unknown → requirement_change_path
设计契约 unknown → design_change_path
任务范围 unknown → task_change_path
```

### 6.7 code-only 不是免流程

只有全部满足，才允许进入 `code_only_fast_path`：

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

## 7. Workflow Path 标准

### 7.1 requirement_change_path

触发条件：

1. 用户可见行为变化。
2. 业务规则变化。
3. 验收标准变化。
4. 数据语义变化。
5. 权限规则变化。
6. 流程状态变化。
7. 需求缺失或冲突。

必须生成：

```text
requirements_delta.md
完整 requirements candidate
trace_delta.md
candidate_manifest.json
Gate Report
gate_summary.md
user_decision.json
merge_report.md
verification_report.md
evidence_manifest.json
```

必须经过：

```text
requirements_gate
trace_gate
gate_summary_gate
User Decision
merge_ready_gate
Merge Runner
post_merge_gate
close_gate
```

### 7.2 design_change_path

触发条件：

1. 需求已存在但设计缺失。
2. 模块内部设计变化。
3. 接口契约变化。
4. 数据结构变化。
5. 错误处理、兼容策略、状态机内部设计变化。
6. 实现方式影响设计文档。

如果发现需求缺失或需求变化，必须升级到 `requirement_change_path`。

### 7.3 architecture_change_path

触发条件：

1. 模块边界变化。
2. 数据所有权变化。
3. 服务拆分或合并。
4. 部署模型变化。
5. 安全边界变化。
6. 技术路线变化。
7. 跨模块依赖方向变化。

必须优先于需求和设计路径。

### 7.4 task_change_path

触发条件：

1. 正式 requirements/design 已覆盖。
2. 只是任务拆分、实现范围或测试补充变化。
3. 不改变正式规格语义。

可以 `merge_report.status = not_applicable`，但必须有 tasks、trace_delta、verification、evidence、changed_files_audit、close_gate。

### 7.5 code_only_fast_path

触发条件：

1. 不改变需求。
2. 不改变设计。
3. 不改变架构。
4. 不改变验收标准。
5. 不改变数据语义。
6. 不改变接口契约。
7. 不存在 unknown。

仍必须生成：

```text
change_classification.md
impact_analysis.md
trigger_result.json
tasks.md
trace_delta.md
candidate_manifest.json
gate_summary.md
verification_report.md
merge_report.md
evidence_manifest.json
changed_files_audit
```

其中：

```text
candidate_manifest.entries = []
merge_report.status = not_applicable
```

### 7.6 spec_migration_path

用于 legacy specs 向项目级正式规格真相源迁移。

规则：

1. 不得静默迁移。
2. 必须生成 migration inventory / migration plan / migration conflicts。
3. 必须生成完整 project spec candidate。
4. 必须经过 Gate、User Decision、Merge Runner。
5. 默认不释放 code_permission。

### 7.7 rollback_path

用于已合并正式规格的受控反向变更。

规则：

1. 必须创建新的 rollback WI。
2. 不得原地修改旧 WI。
3. 不得回退 `project_spec_version`，只能递增新版本。
4. rollback 不得混入代码回滚；代码回滚必须另建实现 WI，除非标准明确允许并受同一权限控制。
5. 必须修复 Trace。

---

## 8. Candidate、Delta 与 Manifest

### 8.1 Delta

Delta 解释变化，不是最终写入对象。

常见 Delta：

```text
requirements_delta.md
design_delta.md
trace_delta.md
rollback_delta.md
```

Delta 说明：

1. 为什么变。
2. 改了什么。
3. 影响哪些正式规格。
4. 旧内容如何处理。
5. 是否需要 User Decision。

### 8.2 Candidate

Candidate 是拟写入正式规格真相源的完整候选文件，不是 patch。

规则：

1. Candidate 必须是完整目标文件。
2. Candidate 路径位于当前 WI 的 `candidates/` 下。
3. Candidate 不能直接覆盖 `.specforge/project/**`。
4. Candidate 必须绑定 `base_spec_version`。
5. Candidate 必须计算 hash。
6. Candidate 只有经过 Gate、User Decision、Merge Runner 才能进入正式规格。

### 8.3 Candidate Manifest

`candidate_manifest.json` 是 Candidate 合并控制清单。

所有 WI 必须生成。

最小结构：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-0001",
  "workflow_path": "requirement_change_path",
  "base_spec_version": "PSV-0001",
  "merge_required": true,
  "entries": [
    {
      "candidate_path": ".specforge/work-items/WI-0001/candidates/project/modules/AUTH/requirements.md",
      "target_path": ".specforge/project/modules/AUTH/requirements.md",
      "operation": "replace",
      "candidate_hash": "sha256:...",
      "target_base_hash": "sha256:..."
    }
  ],
  "manifest_hash": "sha256:..."
}
```

### 8.4 Manifest 规则

1. `candidate_path` 必须指向当前 WI 的 `candidates/**`。
2. `target_path` 必须指向 `.specforge/project/**`。
3. 非规格路径不得写入 Manifest entries。
4. `code_only_fast_path` 的 entries 必须为空。
5. Merge Runner 只能按 Manifest 合并。
6. Merge Runner 禁止扫描 `candidates/**` 自行决定写入范围。

---

## 9. Gate、Gate Report 与 Gate Summary

### 9.1 Gate 的定义

Gate 是流程准入检查点，只能由 Gate Runner 或 sf-orchestrator 执行。

Gate 不等于建议，不等于 Agent 自评，不等于用户确认。

### 9.2 Gate 分类

MVP 至少支持：

```text
entry_gate
workflow_selection_gate
required_files_gate
candidate_manifest_gate
path_policy_gate
schema_gate
spec_consistency_gate
trace_gate
workflow_specific_gate
gate_summary_gate
merge_ready_gate
post_merge_gate
verification_gate
close_gate
```

### 9.3 hard_gate 与 soft_gate

`hard_gate` 失败不得进入下一步。

`soft_gate` 可以通过 waiver 继续，但 waiver 必须进入 `user_decision.json`，并且必须有原因、风险、有效期和 follow-up WI。

Hard Gate 不允许 waiver。

### 9.4 Gate Report

Gate Report 是单个 Gate 的机器可校验结果。

路径：

```text
.specforge/work-items/<WI-ID>/gates/<gate_id>.json
```

最小结构：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-0001",
  "gate_id": "candidate_manifest_gate",
  "gate_type": "hard_gate",
  "required": true,
  "status": "passed",
  "input_files": [],
  "checks": [],
  "blocking_issues": [],
  "warnings": [],
  "waiver_allowed": false,
  "waiver_required": false,
  "waiver_ids": [],
  "started_at": "2026-06-07T00:00:00Z",
  "finished_at": "2026-06-07T00:00:00Z",
  "runner": "Gate Runner"
}
```

### 9.5 Gate Summary

Gate Summary 是 User Decision 前的汇总决策包。

路径：

```text
.specforge/work-items/<WI-ID>/gate_summary.md
```

Gate Summary 必须回答：

1. Candidate 是什么。
2. 哪些 Gate 通过。
3. 哪些 Gate 阻断。
4. 哪些 Gate 有 warning。
5. 是否存在 waiver。
6. 用户现在能做什么决策。

`overall_status` 固定枚举：

```text
passed
passed_with_waiver_required
failed
blocked
expired
invalidated
```

### 9.6 冻结规则

`gate_summary_gate` 通过后，以下对象必须冻结：

```text
candidate_manifest.json
candidates/**
gates/**
gate_summary.md
work_item.json 中与 Candidate / Gate / workflow_path 相关字段
```

冻结后只允许写：

```text
user_decision.json
可选 user_decision.md
runtime 状态日志
```

冻结后若需修改，必须回退到 candidate_preparing / gates_running，并重新生成 Candidate、Gate Reports、Gate Summary、hash、User Decision。

---

## 10. User Decision

### 10.1 定义

User Decision 是 Gate Summary 之后、Merge Runner 之前的结构化审批事实。

它不是聊天里的“同意”。用户聊天回复只能触发 User Decision Recorder 写入结构化文件。

路径：

```text
.specforge/work-items/<WI-ID>/user_decision.json
```

### 10.2 必须绑定的数据

`user_decision.json` 必须绑定：

```text
work_item_id
workflow_path
base_spec_version
candidate_manifest_path
manifest_hash
candidate_hash
gate_summary_path
gate_summary_hash
decision_status
decision_type
decided_by
decided_at
expires_at
decision_scope
waivers
```

### 10.3 状态枚举

固定为：

```text
pending
approved
rejected
request_changes
waived
expired
invalidated
```

禁止使用旧状态：

```text
needs_revision
deferred
```

旧状态必须映射：

```text
needs_revision → request_changes
deferred → pending 或 expired，视上下文而定
```

### 10.4 规则

1. 只有 `approved` 和合法 `waived` 可进入 `merge_ready_gate`。
2. `rejected` 阻止 Merge，不释放 code_permission。
3. `request_changes` 使旧 Candidate、Gate Summary、User Decision 失效。
4. `waived` 只允许覆盖 soft_gate 风险。
5. `expired` 表示审批过期。
6. `invalidated` 表示绑定对象或 base_spec_version 变化。
7. hard_gate 不能 waiver。
8. User Decision 失效后不能原地恢复，必须生成新的 decision_id。

### 10.5 写入主体

只能由 User Decision Recorder 写入。

普通 Agent 禁止创建、修改、删除 `user_decision.json`。

Merge Runner 禁止读取聊天记录判断是否合并，只能读取 `user_decision.json`。

---

## 11. Merge Runner 与版本更新

### 11.1 Merge Runner 定义

Merge Runner 是唯一允许写入正式规格真相源的受控执行器。

普通 Agent、专业 Agent、bash、formatter、generator 不得写入：

```text
.specforge/project/**
```

### 11.2 merge_ready_gate

Merge Runner 执行前必须通过 `merge_ready_gate`。

必查：

1. `user_decision.json` 存在且状态为 approved / waived。
2. User Decision 未过期。
3. work_item_id / workflow_path 匹配。
4. `base_spec_version` 等于当前 `project_spec_version`。
5. `candidate_manifest.json` 存在。
6. manifest_hash、candidate_hash、gate_summary_hash 匹配。
7. gate_summary 未 invalidated。
8. required Gate Report 未 invalidated。
9. waiver 合法且未过期。
10. target_path 合法且在 `.specforge/project/**`。
11. candidate_path 在当前 WI `candidates/**`。
12. manifest entries 与 Candidate 文件一一对应。
13. Merge Runner 具备正式规格专用写权限。
14. 普通 Agent 无正式规格写权限。

### 11.3 Merge Runner 执行规则

1. 只能按 `candidate_manifest.json` 合并。
2. 禁止扫描 `candidates/**` 自行决定合并对象。
3. 禁止自动忽略 hash 不匹配。
4. 禁止自动延长 User Decision。
5. 禁止在 base_spec_version 冲突时“尝试合并看看”。
6. 禁止合并 manifest 外文件。

### 11.4 `merge_report.md`

每次 Merge 必须生成：

```text
.specforge/work-items/<WI-ID>/merge_report.md
```

必须包含：

```text
Summary
Inputs
Merged Files
Spec Manifest Update
Trace Update
Evidence
```

`code_only_fast_path` / 无规格合并路径必须写：

```text
Merge Status: not_applicable
Reason: This WI does not change project specs.
Spec Impact Evidence: impact_analysis.md + change_classification.md + diff_semantic_scan
```

### 11.5 project_spec_version

只要正式规格被修改，必须：

1. 递增 `project_spec_version`。
2. 更新 `last_merged_work_item`。
3. 更新 `last_merged_at`。
4. 更新必要 Trace。
5. 记录 merge_report。

禁止多个 WI 合并到同一个 project_spec_version。

### 11.6 post_merge_gate

Merge Runner 执行后必须通过 `post_merge_gate`。

必查：

1. merge_report 存在。
2. manifest/candidate/gate_summary_hash 与 User Decision 一致。
3. 每个 manifest entry 有 merge 结果。
4. 无 manifest 外正式规格写入。
5. target_path 写入后 hash 等于 Candidate hash。
6. spec_manifest 已更新。
7. project_spec_version 已递增。
8. Trace 已按 trace_delta 更新或说明无变化。
9. Write Guard 日志显示正式规格写入主体为 Merge Runner。
10. 普通 Agent 无 `.specforge/project/**` 写入。

---

## 12. code_permission、allowed_write_files 与 Write Guard

### 12.1 code_permission

`code_permission` 是控制代码写入的硬开关。

核心字段：

```json
{
  "code_change_allowed": false,
  "allowed_write_files": []
}
```

默认必须为：

```text
code_change_allowed=false
allowed_write_files=[]
```

### 12.2 释放主体

代码权限只能由 `code_permission_service` 释放。

普通 Agent 不得自行修改 `code_change_allowed`。

### 12.3 释放条件

释放前必须满足：

1. WI 存在。
2. workflow_path 已确定。
3. impact_analysis 完成。
4. required_files 已生成或 not_applicable。
5. required_gates 已通过或有合法 waiver。
6. tasks.md 已生成。
7. allowed_write_files 已生成并通过 write_scope_gate。
8. 需要规格变更的路径已完成 Candidate / Gate / User Decision / Merge，或明确 Merge not_applicable。
9. Write Guard 已启用。

### 12.4 allowed_write_files

`allowed_write_files` 是本 WI 实现阶段允许写入的精确文件白名单。

规则：

1. 必须来源于 tasks.md 和 impact_analysis。
2. 必须写入 work_item.json 或受控 permission 文件。
3. 必须包含 operation，如 create / modify / delete。
4. 只能覆盖本 WI 实现所需文件。
5. 扩大白名单必须走 change_request / Gate / User Decision 或受控扩大流程。
6. close_gate 前必须撤销或失效。

### 12.5 Write Guard

Write Guard 是程序级写入拦截器，必须覆盖所有写入入口：

```text
edit 工具
SpecForge 写文件工具
bash
formatter
generator
package manager
snapshot update
Git 相关写入
```

所有可能写文件的命令必须声明：

```text
expected_write_files
```

无声明则默认只读或阻断。

### 12.6 Write Guard 拦截规则

必须阻断：

1. 无 active WI 写代码。
2. `code_change_allowed=false` 写代码。
3. 写入不在 `allowed_write_files` 内的代码文件。
4. 普通 Agent 写 `.specforge/project/**`。
5. 普通 Agent 写 `user_decision.json`。
6. 普通 Agent 写 `gates/**`。
7. 普通 Agent 写 `gate_summary.md`。
8. 普通 Agent 写 `merge_report.md`。
9. 冻结后修改 Candidate / Manifest / Gate Summary。
10. closed WI 继续写入。

### 12.7 changed_files_audit

实现后必须执行 `changed_files_audit`。

检查：

1. 实际修改文件列表。
2. 是否全部在 allowed_write_files。
3. 间接写入副作用。
4. formatter / generator / package manager 写入。
5. 是否写入正式规格区。
6. 是否出现 escaped_write_incident。

越界写入必须 blocked，不得继续 close。

---

## 13. Trace、Verification 与 Evidence

### 13.1 Trace

Trace 必须贯穿：

```text
REQ
AC
DD
TASK
FILE
TEST
EVIDENCE
```

所有 WI 都必须生成：

```text
trace_delta.md
```

Trace 不变也必须写：

```text
Trace Impact: none
Reason: ...
```

### 13.2 trace_delta.md

`trace_delta.md` 说明本 WI 对 Trace 的影响。

可能包括：

1. 新增 Trace。
2. 修改 Trace。
3. 删除 Trace。
4. Trace 不变。
5. 需要更新 module trace。
6. 需要更新 project trace_matrix。

### 13.3 verification_report.md

`verification_report.md` 证明验证结论。

所有 WI 关闭前必须有验证报告，即使只是 code-only。

验证报告不得只写“已验证”。必须引用 Evidence。

### 13.4 evidence_manifest.json

所有证据必须登记到：

```text
.specforge/work-items/<WI-ID>/evidence/evidence_manifest.json
```

Evidence 可包括：

```text
测试输出
构建日志
审查记录
截图
命令输出
Write Guard 日志
changed_files_audit
Gate Report
Merge Report
```

### 13.5 verification_gate

`verification_gate` 必查：

1. verification_report 存在。
2. evidence_manifest 存在。
3. verification_report 中的声明有 Evidence 支撑。
4. required tests 已执行或明确 not_applicable。
5. changed_files_audit 已完成。
6. Trace 与 Evidence 可连接。

---

## 14. Agent 职责边界

### 14.1 受控主体

受控主体包括：

```text
sf-orchestrator
Gate Runner
User Decision Recorder
Merge Runner
code_permission_service
Write Guard
```

它们负责状态推进、Gate、User Decision、Merge、权限释放、写入拦截。

### 14.2 普通 Agent

普通 Agent 是专业内容生成者，不是流程控制者。

普通 Agent 可以生成：

```text
requirements_delta.md
design_delta.md
tasks.md
trace_delta.md
Candidate 内容
verification_report.md
handoff
evidence
```

但不能：

```text
推进 WI 状态
释放 code_permission
写 .specforge/project/**
写 user_decision.json
写 gates/**
写 gate_summary.md
写 merge_report.md
关闭 WI
绕过 Gate
```

### 14.3 Agent handoff

Agent 每次执行后必须生成结构化 handoff。

最小内容：

```text
Inputs Read
Outputs Written
Findings
Unknowns
Escalation Signals
Next Step Recommendation
Boundary Statement
```

### 14.4 unknown 与 escalation

Agent 发现不确定、冲突、缺少规格、可能升级路径、可能越界、权限不足时，必须输出 escalation signal，不得自行降级处理。

---

## 15. close_gate 与 WI 关闭

### 15.1 close_gate 定义

`close_gate` 是 WI 关闭前最后一道锁。

User Decision 通过不等于可以关闭。Merge Runner 执行完成不等于可以关闭。post_merge_gate 通过也不等于可以关闭。

### 15.2 close_gate 必查

所有 WI 关闭前必须检查：

1. required_files 存在或 not_applicable 合法。
2. required_gates 通过或合法 waiver。
3. workflow_path 合法。
4. User Decision 合法或本路径明确不需要。
5. merge_report 存在。
6. Merge required 时 post_merge_gate 通过。
7. Merge not_applicable 时理由充分。
8. verification_report 存在。
9. evidence_manifest 存在。
10. trace_delta 存在。
11. changed_files_audit 通过。
12. Write Guard 无未处理 violation。
13. code_permission 已撤销。
14. allowed_write_files 不再可写。
15. 无 pending 用户决策。
16. 无 unresolved blocking issue。
17. waiver follow-up WI 已登记。

### 15.3 closed 后规则

WI closed 后不得修改：

```text
work_item.json 核心状态
Candidate
Gate Report
Gate Summary
User Decision
Merge Report
Evidence Manifest
```

发现问题必须创建：

```text
repair WI
rollback WI
follow-up WI
```

不得原地修改 closed WI。

---

## 16. 回滚与 superseded

### 16.1 rollback WI

回滚必须通过新的 rollback WI 完成。

规则：

1. 必须引用被回滚的 work_item_id / project_spec_version。
2. 必须生成 rollback_plan。
3. 必须生成 rollback_delta。
4. 必须生成完整 rollback Candidate。
5. 必须经过 Gate、User Decision、Merge Runner。
6. project_spec_version 必须递增。
7. Trace 必须修复。

### 16.2 superseded

一个 WI 被替代时，必须标记：

```text
status = superseded
superseded_by = <WI-ID>
```

superseded 不能删除原 WI，也不能把原 WI 当作成功 closed。

---

## 17. MVP 必须实现能力

MVP 是否成立，不看功能多少，而看是否形成不可绕过的受控变更闭环。

MVP 必须实现：

1. 所有变更进入 WI。
2. intake / classification / impact_analysis / workflow_path。
3. 项目级正式规格真相源。
4. Candidate 完整文件模型。
5. candidate_manifest。
6. Gate Report。
7. Gate Summary。
8. User Decision Recorder。
9. Merge Runner。
10. project_spec_version 递增。
11. code_permission_service。
12. allowed_write_files。
13. Write Guard。
14. Trace / Evidence / Verification。
15. changed_files_audit。
16. close_gate。
17. legacy specs read-only。

### 17.1 不能后置的 hard checks

```text
WI 存在
workflow_path
required_files
candidate_manifest hash
candidate hash
gate_summary hash
base_spec_version
target_path 合法
正式规格写入主体
allowed_write_files
actual_changed_files
project_spec_version 递增
verification_report 存在
evidence_manifest 存在
close_gate passed
```

### 17.2 可以弱实现但不能删除

```text
spec_consistency_gate
design_quality_gate
trace_gate
diff_semantic_scan
verification_gate
```

---

## 18. 后置能力

以下能力后置，不进入 MVP：

```text
多用户审批
角色签名
审批 UI
撤回 UI
评论线程
组织权限模型
自动 rebase
三方合并
并发 merge queue
复杂冲突自动解决
长期 snapshot / archive
Gate DAG 可视化
插件市场
ATAM 全量评审
SRE readiness 自动化
安全威胁建模自动化
图数据库 Trace
跨仓库 Trace
Evidence 长期仓库
CI/CD 深度集成
分布式锁
后台队列
Web 控制台
```

后置能力不得提前创建 MVP 禁止目录。

说明：`.specforge/reports/**` 在 v1.3 中属于允许写入的非真相源报告目录，可用于发布记录、审查报告、验收报告等输出；它不能替代 `.specforge/work-items/<WI-ID>/evidence/**`、`verification_report.md`、`merge_report.md` 或 `gate_summary.md`。

---

## 19. 禁止事项总表

### 19.1 目录禁止

```text
用户项目 .specforge/standards/**
用户项目 .specforge/archive/**
用户项目 .specforge/snapshots/**
用户项目 .specforge/state/**
```

### 19.2 写入禁止

```text
无 WI 写代码
code_change_allowed=false 写代码
普通 Agent 写 .specforge/project/**
普通 Agent 写 user_decision.json
普通 Agent 写 gates/**
普通 Agent 写 gate_summary.md
普通 Agent 写 merge_report.md
Merge Runner 扫描 candidates/** 自行合并
直接修改 closed WI
```

### 19.3 流程禁止

```text
聊天 approval 替代 user_decision.json
Gate Summary 替代 Gate Report
Gate Report 替代 Gate Summary
Candidate 使用 patch 模型
base_spec_version 冲突时尝试合并
unknown 降级为 code_only_fast_path
rollback 降级为 task/code-only
code-only 跳过 WI / tasks / verification / evidence / close_gate
```

---

## 20. 施工手册约束

### 20.1 施工手册定位

施工手册不是重新定义标准，而是把本标准拆成可执行 Round。

每个 Round 必须明确：

```text
输入边界
允许修改边界
禁止修改边界
验收边界
```

### 20.2 Round 输出

每个 Round 必须输出：

```text
round_plan.md
round_report.md
test_report.md
changed_files_audit.md
```

`round_report.md` 必须包含：

```text
Round Scope
Files Changed
Standard Rules Implemented
Explicitly Not Implemented
Tests Run
Evidence
Known Gaps
Next Round Preconditions
```

### 20.3 Round Gate

每个 Round 必须有：

```text
round_<N>_acceptance_gate
```

用于检查：

1. 本轮范围。
2. 禁止项。
3. 测试。
4. 证据。
5. changed_files_audit。
6. 未实现项登记。
7. 是否引入与本标准冲突的目录、字段、状态、权限。

### 20.4 推荐 Round 顺序

```text
Round 0：标准文件归位与实施基线
Round 1：目录模型 + 状态机 + Orchestrator 最小硬阻断
Round 2：Change Classification + Impact Analysis + Workflow Path
Round 3：Requirements Candidate + Candidate Manifest + 基础 Gate
Round 4：Design / Architecture Candidate + Trace 联动 Gate
Round 5：Tasks + code_permission + allowed_write_files + Write Guard
Round 6：Gate Report + Gate Summary + User Decision + Evidence / Verification
Round 7：Merge Runner + merge_ready_gate + post_merge_gate + versioning
Round 8：Legacy specs read-only + spec_migration_path
Round 9：端到端闭环测试 + close_gate 硬化
```

---

## 21. 端到端验收场景

MVP 必须至少通过以下端到端场景。

### 21.1 requirement_change_path

输入：

```text
给订单增加“已归档”状态。
```

期望：

1. 进入 requirement_change_path。
2. 生成 requirements_delta。
3. 生成完整 requirements candidate。
4. Gate / User Decision / Merge / Trace / Verification / Evidence / close_gate 闭环。

### 21.2 design_change_path

输入：

```text
登录失败后增加指数退避策略。
```

期望：

1. 若需求已有，进入 design_change_path。
2. 若需求缺失，升级 requirement_change_path。
3. 生成 design_delta 与完整 design candidate。

### 21.3 code_only_fast_path

输入：

```text
把保存按钮颜色调深一点。
```

期望：

1. 确认不影响业务语义。
2. 进入 code_only_fast_path。
3. candidate_manifest.entries = []。
4. merge_report.status = not_applicable。
5. 仍完成 tasks、allowed_write_files、Write Guard、verification、evidence、changed_files_audit、close_gate。

### 21.4 越界写入

输入：

```text
Agent 尝试修改 allowed_write_files 之外的文件。
```

期望：

1. Write Guard 阻断。
2. 记录 violation。
3. changed_files_audit 失败或 blocked。
4. close_gate 不通过。

### 21.5 User Decision 失效

输入：

```text
User Decision approved 后，Candidate 或 base_spec_version 变化。
```

期望：

1. User Decision invalidated。
2. merge_ready_gate failed。
3. 重新生成 Candidate / Gate Summary / User Decision。

---

## 22. 最终闭环主链路

标准主链路固定为：

```text
User Request
→ sf-orchestrator creates WI
→ intake.md
→ change_classification.md
→ impact_analysis.md
→ trigger_result.json
→ workflow_path
→ required_files / required_gates
→ Agent generates delta / tasks / trace_delta / candidate
→ candidate_manifest.json
→ Gate Runner generates gates/<gate_id>.json
→ Gate Runner generates gate_summary.md
→ gate_summary_gate
→ freeze Candidate / Manifest / Gate Reports / Gate Summary
→ User Decision Recorder writes user_decision.json
→ merge_ready_gate
→ Merge Runner writes .specforge/project/** and merge_report.md
→ post_merge_gate
→ code_permission_service releases implementation permission if required
→ Agent implements within allowed_write_files
→ Write Guard controls writes
→ verification_report.md
→ evidence_manifest.json
→ changed_files_audit
→ code_permission revoke
→ close_gate
→ closed
```

对 `task_change_path` 和 `code_only_fast_path`，正式规格 Merge 可以 `not_applicable`，但必须显式记录并通过 close_gate。

---

## 23. 本标准的使用方式

### 23.1 给 Agent

Agent 必须把本标准作为行为边界，不得自行放宽规则。

Agent 遇到不确定、冲突、缺少权限、路径越界、需求/设计/架构可能变化时，必须升级，不得降级。

### 23.2 给 Runtime

Runtime 必须把本标准转化为状态机、路径策略、权限控制、Gate 调度、写入拦截和审计逻辑。

### 23.3 给 Gate

Gate 必须用本标准判断文件是否存在、路径是否合法、状态是否合法、hash 是否匹配、Trace/Evidence 是否闭环、权限是否关闭、是否存在绕过写入。

### 23.4 给施工手册

施工手册必须以本标准为上位规则。

施工手册只能拆分实现顺序，不能改变本标准的目录边界、状态机、Gate、User Decision、Merge Runner、Write Guard、close_gate 等规则。


---

# 附录 A：v1.1 Patch 1 原始补丁吸收记录（extension_registry.json 与 Extension Subflow）

> 本附录是来源补丁的保真吸收记录。其有效规则已融入正文；如附录原始表述与正文 v1.3 裁决冲突，以正文、0A/0B 裁决、Path Policy、extension_registry 规则为准。

## 1. extension_registry.json 的定位

`extension_registry.json` 是项目级正式规格的一部分。

正式路径：

```text
.specforge/project/extension_registry.json
```

它用于登记项目允许使用的扩展类型、扩展枚举、扩展 Gate 类型、扩展验证类型等。

它不是 runtime 文件，也不是 Agent 临时记事文件。

它属于：

```text
.specforge/project/**
```

因此：

```text
只能通过 Candidate + Gate + User Decision + Merge Runner 修改；
普通 Agent 不得直接写入；
不得在工作过程中临时创造未登记类型。
```

## 2. 项目级规格目录必须包含 extension_registry.json

用户项目 MVP 正式规格目录必须包含：

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
```

`extension_registry.json` 即使当前为空，也必须存在。

## 3. spec_manifest.json 必须登记 extension_registry

`spec_manifest.json` 的 `project` 字段必须登记：

```json
{
  "project": {
    "extension_registry": ".specforge/project/extension_registry.json",
    "requirements_index": ".specforge/project/requirements_index.md",
    "design_index": ".specforge/project/design_index.md",
    "architecture": ".specforge/project/architecture.md",
    "glossary": ".specforge/project/glossary.md",
    "decisions": ".specforge/project/decisions.md",
    "trace_matrix": ".specforge/project/trace_matrix.md"
  }
}
```

禁止把 extension_registry 放在：

```text
.specforge/runtime/**
.specforge/work-items/**
.specforge/standards/**
```

## 4. extension_registry.json 最小结构

MVP 最小结构：

```json
{
  "schema_version": "1.0",
  "project_spec_version": "PSV-0001",
  "namespaces": {
    "requirement_types": [],
    "design_types": [],
    "task_types": [],
    "verification_types": [],
    "gate_types": []
  },
  "updated_by_work_item": null,
  "updated_at": null
}
```

说明：

1. `schema_version` 标识 registry 文件结构版本。
2. `project_spec_version` 必须与当前项目规格版本一致。
3. `namespaces` 保存扩展命名空间。
4. `updated_by_work_item` 记录最近一次修改该文件的 WI。
5. `updated_at` 记录最近一次正式合并时间。

## 5. 扩展类型使用规则

Agent 在生成 requirements、design、tasks、verification、Gate 产物时，必须先确认所使用的类型是否已在正式 `extension_registry.json` 中登记。

禁止：

```text
临时创造 requirement type
临时创造 design type
临时创造 task type
临时创造 verification type
临时创造 gate type
把未知类型直接写入正式规格 Candidate
把未知类型只写进 runtime 后继续执行
```

如果缺少必要扩展类型，必须触发 Extension Subflow。

## 6. Extension Subflow 的触发条件

任一 Agent 发现以下情况时，必须停止当前主流程并输出扩展请求：

```text
缺少必要 requirement type
缺少必要 design type
缺少必要 task type
缺少必要 verification type
缺少必要 gate type
缺少必要枚举值
缺少必要 pattern
缺少必要可解析结构
```

输出文件：

```text
.specforge/work-items/<WI-ID>/extension_request.json
```

## 7. extension_request.json

最小结构：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-0001",
  "requested_by_agent": "sf-design",
  "requested_namespace": "design_types",
  "requested_key": "retry_policy",
  "reason": "",
  "blocking_current_flow": true,
  "created_at": ""
}
```

规则：

1. `extension_request.json` 只能由发现缺口的 Agent 写入当前 WI。
2. 写入后，Agent 必须停止继续生成依赖该扩展类型的正式产物。
3. `blocking_current_flow=true` 时，sf-orchestrator 必须阻断主流程。
4. 普通 Agent 不得自行修改 `extension_registry.json`。
5. 普通 Agent 不得自行启动子 Agent 或 Extension Subflow。

## 8. Extension Subflow 的发起主体

只有 `sf-orchestrator` 可以发起 Extension Subflow。

触发流程：

```text
Agent 发现扩展缺口
→ 写 extension_request.json
→ handoff 中报告 extension_required
→ sf-orchestrator 将主 WI 标记为 blocked 或 extension_required
→ sf-orchestrator 调度 sf-extension
```

注意：

```text
如果当前环境的子 Agent 不能再启动子 Agent，则 Extension Subflow 必须由 sf-orchestrator 直接调度 sf-extension，而不能由设计 Agent 自行发起。
```

## 9. sf-extension Agent

`sf-extension` 是扩展设计专用 Agent。

职责：

```text
读取 extension_request.json
判断扩展是否必要
生成 extension_delta.md
生成 candidates/project/extension_registry.json
更新 candidate_manifest.json
输出 handoff
```

`sf-extension` 不得：

```text
直接写 .specforge/project/extension_registry.json
直接推进 WI 状态
直接释放 code_permission
直接关闭 WI
```

## 10. extension_delta.md

路径：

```text
.specforge/work-items/<WI-ID>/extension_delta.md
```

最小内容：

```markdown
# Extension Delta

Work Item: WI-0001

## 1. Extension Request

## 2. Current Registry State

## 3. Proposed Extension

## 4. Reason

## 5. Impacted Standards

## 6. Compatibility

## 7. Candidate Files

## 8. Risks
```

## 11. Extension Candidate

Extension Subflow 必须生成完整候选文件：

```text
.specforge/work-items/<WI-ID>/candidates/project/extension_registry.json
```

Candidate 必须是完整 `extension_registry.json`，不是 patch。

`candidate_manifest.json` 必须包含该 entry：

```json
{
  "candidate_path": ".specforge/work-items/WI-0001/candidates/project/extension_registry.json",
  "target_path": ".specforge/project/extension_registry.json",
  "operation": "replace",
  "content_hash": "",
  "spec_type": "extension_registry",
  "module": null
}
```

## 12. Extension Gate

Extension Subflow 必须执行：

```text
extension_gate
```

检查项：

```text
extension_request.json 存在
extension_delta.md 存在
extension_registry candidate 存在
candidate_manifest entry 合法
target_path 指向 .specforge/project/extension_registry.json
新增 namespace 合法
新增 key 不重复
新增 key 命名合法
reason 非空
兼容性说明存在
未修改非相关 registry 内容
```

Extension Gate 是 hard_gate。

## 13. Extension Subflow 的 User Decision

修改 `extension_registry.json` 属于正式规格变更，必须经过 User Decision。

用户需要确认：

```text
是否接受新增扩展类型；
是否接受该扩展类型的含义；
是否允许后续主流程使用该类型。
```

聊天中的“同意”仍然不能直接作为合并依据，必须由 User Decision Recorder 写入：

```text
.specforge/work-items/<WI-ID>/user_decision.json
```

## 14. Extension Subflow 的 Merge

Extension Subflow 合并仍使用 Merge Runner。

规则：

```text
Merge Runner 只按 candidate_manifest.json 合并；
正式写入 .specforge/project/extension_registry.json；
合并后 project_spec_version 必须递增；
merge_report.md 必须记录 extension_registry 更新；
post_merge_gate 必须验证写入后的 hash。
```

## 15. Extension Subflow 完成后的主流程恢复

Extension Subflow 完成后，sf-orchestrator 必须恢复原 WI 主流程。

恢复要求：

```text
重新读取 extension_registry.json；
重新调度原 Agent；
原 Agent 不得复用旧的依赖未知类型的输出；
必要时重新生成 delta / candidate / Gate Summary；
如果 extension_registry 变更影响已有 Candidate，原 Candidate 必须 invalidated。
```

## 16. Extension Subflow 与状态机

可使用以下状态表达：

```text
blocked
```

并在 `blocked_reason` 中写：

```text
extension_required
```

或者后续扩展状态机时增加：

```text
extension_required
extension_running
extension_merged
```

MVP 不强制新增状态，但必须能表达阻断和恢复。

## 17. Extension Subflow 与 Write Guard

Write Guard 必须阻止：

```text
普通 Agent 写 .specforge/project/extension_registry.json
普通 Agent 写 candidates/project/extension_registry.json 以外的正式 registry
普通 Agent 绕过 extension_request.json 直接使用未知扩展类型
Merge Runner 以外主体写正式 extension_registry
```

## 18. Extension Subflow 与 close_gate

close_gate 必须检查：

```text
是否存在未处理 extension_request.json
是否存在 blocking_current_flow=true 的扩展请求
extension_registry candidate 是否已合并
extension_gate 是否通过
extension User Decision 是否完成
原主流程是否已基于最新 extension_registry 重新执行
```

存在未处理 extension request 时，不得 closed。

## 19. 端到端验收场景

输入：

```text
设计过程中发现缺少 design type：retry_policy
```

期望：

```text
sf-design 写 extension_request.json
sf-design 停止继续写依赖 retry_policy 的设计产物
sf-orchestrator 阻断主流程
sf-orchestrator 调度 sf-extension
sf-extension 生成 extension_delta.md
sf-extension 生成 extension_registry candidate
candidate_manifest 登记 extension_registry
extension_gate 通过
Gate Summary 生成
User Decision approved
Merge Runner 写 .specforge/project/extension_registry.json
post_merge_gate 通过
sf-orchestrator 恢复原 WI 主流程
sf-design 基于最新 extension_registry 重新生成设计产物
```

## 20. 禁止事项补充

禁止：

```text
extension_registry.json 可选
Agent 临时创造扩展类型
把未知类型写入 Candidate 后等 Gate 再说
sf-design 直接启动 Extension Subflow
sf-extension 直接写正式 extension_registry
Extension Subflow 不经过 User Decision
Extension Subflow 不经过 Merge Runner
主流程不重新读取 extension_registry 就继续执行
```

---

# Patch 1 结论

`extension_registry.json` 与 Extension Subflow 是 SpecForge v1.1 的正式组成部分。

它们用于解决标准演进中的受控扩展问题，防止 Agent 在设计或实现过程中临时创造未登记类型，导致规格结构失控。

本补丁应同步纳入：

```text
specforge_final_fused_standard_v1_1_zh.md
specforge_complete_implementation_plan_v1_1_zh.md
specforge_fusion_source_mapping_v1_1_zh.md
```

---

# 附录 B：v1.1 Patch 2 原始补丁吸收记录（状态权威模型）

> 本补丁是 v1.1 的正式标准补丁。
> 目的：修正 post-P0 hardening 中暴露的状态源一致性问题。
> 适用范围：Runtime State Machine、StateManager、Gate Runner、User Decision Recorder、Merge Runner、close_gate、sf_state_read、sf_state_transition。
> 优先级：若正文中关于 `work_item.json.status`、`runtime/state.json` 或状态读取/写入的旧表述与本补丁冲突，以本补丁为准。

## 1. 状态权威模型

SpecForge 的运行状态只能有一个权威来源：

```text
events.jsonl / StateManager = 唯一权威状态事件源
runtime/state.json = 从权威状态投影生成的运行缓存
work_item.json = Work Item 元数据档案，不是状态源
```

## 2. 责任划分

1. `events.jsonl / StateManager` 保存并维护权威状态事件。
2. `runtime/state.json` 是 projection cache，只用于快速查询和恢复，可由权威事件重建。
3. `work_item.json` 只保存 WI 元数据、流程路径、权限范围、创建信息等档案字段。
4. `gate_summary.md`、`user_decision.json`、`merge_report.md`、`close_gate.json` 等文件是状态迁移证据，不是状态源。

## 3. 工具边界

Gate Runner、User Decision Recorder、Merge Runner、close_gate 不得直接把 `runtime/state.json` 或 `work_item.json.status` 当作权威状态改写。

它们只能：

```text
产出证据
请求状态迁移
等待 StateManager / State Coordinator 完成迁移
```

状态迁移必须通过 Runtime State Machine / State Coordinator / StateManager 完成。

## 4. `work_item.json.status` 兼容规则

历史 `work_item.json.status` 字段如存在，只能作为 legacy display field。

禁止：

```text
Gate 读取 work_item.json.status 判断是否可推进
Decision 读取 work_item.json.status 判断是否可审批
Merge 读取 work_item.json.status 判断是否可合并
close_gate 读取 work_item.json.status 判断是否可关闭
```

新代码不得新增依赖 `work_item.json.status` 的状态判断。

状态治理完成后，必须删除 `work_item.json.status` 的生成、写入和兼容读取代码，避免旧状态源长期遗留。

## 5. `runtime/state.json` 规则

`runtime/state.json` 是 projection cache。它可以存在，但不能作为最终治理判断依据。

当 `runtime/state.json` 与 `events.jsonl / StateManager` 不一致时：

```text
以 events.jsonl / StateManager 为准
重建或更新 runtime/state.json
记录 projection 修复证据
```

## 6. 运行效率规则

工具运行时查询当前状态，应通过 StateManager / State Coordinator 获取内存态。

禁止每个工具自行：

```text
全量 replay events.jsonl
同时读取多个状态文件并自行裁决
从 work_item.json.status fallback 当前状态
```

## 7. Gate passed 后的状态推进

当 candidate Gate 全部通过，且 workflow_path 需要审批时：

```text
Gate Runner 只能请求状态迁移到 approval_required
State Coordinator / StateManager 校验证据后追加状态事件
runtime/state.json 由 projection 更新
work_item.json 不作为状态判断来源
```

这用于修复：

```text
Gate passed
但 runtime/state.json / work_item.json.status 滞后
导致 User Decision 无法落盘
Merge 因缺 user_decision.json 失败
```

## 8. User Decision 后的状态推进

User Decision Recorder 只能在治理前置条件通过后写入 `user_decision.json`。

当 `decision_status=approved` 且 `decision_type=user_approved` 时：

```text
User Decision Recorder 请求 approval_required → approved
State Coordinator / StateManager 校验证据后推进
```

User Decision Recorder 不得直接手写 `runtime/state.json` 或 `work_item.json.status`。

## 9. 后续清理要求

本补丁允许短期兼容历史 `work_item.json.status` 字段，但它必须退出治理判断。

治理完成后必须删除：

```text
work_item.json.status 生成逻辑
work_item.json.status 写入逻辑
work_item.json.status 治理读取逻辑
直接写 runtime/state.json 的状态推进逻辑
```

不得以 deprecated 名义长期遗留旧状态源代码。
