# ADR-007: Architecture Consistency Governance

- **Status**: Accepted
- **Date**: 2026-07-27
- **Decision owner**: Project governance decision
- **Related design**: [`../design/SpecForge架构一致性治理最终实施方案.md`](../design/SpecForge架构一致性治理最终实施方案.md)
- **Phase 11/12 execution decision**: [`ADR-008-new-project-governance-bootstrap.md`](ADR-008-new-project-governance-bootstrap.md)
- **Superseded proposal**: [`../archive/SpecForge治理架构完整修改方案-已取代.md`](../archive/SpecForge治理架构完整修改方案-已取代.md)

## Context

SpecForge 已具备 Requirement、Impact、Candidate、Gate、User Decision、Merge、Code Permission、Implementation、Verification、Close 等治理骨架，但项目级架构、项目级数据模型、模块内部 Contract、真实代码归属、实际变更范围和正式版本资格之间缺少统一的机器闭环。

本决策的目标是让 SpecForge 能够从 Requirement 向下追踪到 Production Code，也能够从真实修改文件反向确定其 Module、Design、Data Model、Architecture 和 Contract 约束，并在实际修改超出批准范围时阻断。

## Decision

### 1. 不新增独立 Project Governance 层

Project Architecture 统一承担项目整体结构、公共基础设施、Module 边界、调用/依赖关系及全项目必须共同遵守的系统级约束。

不增加：

- `.specforge/project/governance.md`
- `governance_changed`
- `governance_change_path`
- Governance Gate

### 2. 正式治理链

采用：

```text
Requirement
→ Impact Analysis
→ Project Architecture
→ Project Data Model
→ Module Design
→ Contract
→ Task
→ Code Permission
→ Production Code
→ Actual Scope Audit
→ Verification
→ Formal Version Gate
→ Close
→ Git Merge
```

Trace 贯穿该链路，不建立第二套 Trace 系统。

### 3. Project Architecture 是项目级最高技术设计真相源

正式文件：

```text
.specforge/project/architecture.md
```

稳定规则使用 `ARCH-<DOMAIN>-NNN`。

### 4. Project Data Model 是唯一正式项目级数据模型

正式文件：

```text
.specforge/project/data_model.md
```

稳定规则使用 `DATA-<DOMAIN>-NNN`。

旧 `domain_model.md` 只允许兼容读取，不作为第二个正式真相源，不双写、不双向同步。

### 5. Contract 分两级

Project/Public Contract 继续使用：

```text
.specforge/project/extension_registry.json
```

Module/Internal Contract 使用：

```text
.specforge/project/modules/<MODULE>/contracts.json
```

跨 Module 消费的规则必须进入 Project Contract；其他 Module 直接依赖 Module Contract 必须 BLOCK。

### 6. Module 必须能够确定真实代码归属

每个正式 Module 最终登记：

```text
module_file
requirements
design
contracts
trace
code_paths
```

一个生产代码文件必须唯一匹配一个 Module；匹配 0 个或多个 Module 都必须 BLOCK，不能猜测。

### 7. Impact Scope 是本次治理范围的权威边界

`trigger_result.json` 中的 `impact_scope` 固定包括：

```text
affected_modules
architecture_refs
data_model_refs
design_refs
project_contract_refs
module_contract_refs
planned_code_paths
```

Impact Scope 用于 Workflow Selection、Candidate 完整性、Code Permission 和 Actual Scope Audit。

### 8. Requirement 变化优先保持 Requirement 治理

Requirement 本身发生变化时始终走 `requirement_change_path`；即使同一 WI 同时需要修改 Architecture、Data Model、Design，也在同一 WI 内完成，不能因为下游架构变化绕过 Requirement 治理。

Requirement 不变时：

- Architecture / Module Boundary 变化 → `architecture_change_path`
- Data Model / Module Design / Module Contract 变化 → `design_change_path`
- Registry-only 且无代码实现的 Project Contract 变化 → `contract_change_path`
- 上层正式对象全部不变 → `code_only_fast_path`

不新增 Workflow。

### 9. Fast Path 仍受全部正式设计约束

Fast Path 只表示“不修改上层正式 Spec”，不表示“不遵守上层正式 Spec”。

Fast Path 必须检查现有 Architecture、Data Model、Design、Contract、Trace 和本次 Impact Scope 的一致性。

### 10. Code Permission 发放后冻结治理范围

Code Permission 必须绑定 Module、Allowed Files、ARCH/DATA/DD/Project Contract/Module Contract refs、Project Spec Version 和 Impact Scope hash。

仅当新增具体文件仍完全落在既有治理范围内时，Runtime 才能精确补充文件权限；进入新的治理对象范围必须 `SCOPE_EXPANSION_REQUIRED` 并重新治理。

### 11. Actual Scope 必须是 Approved Scope 的子集

实际修改以 Write Guard 事实记录和 Git Diff 为依据，通过 `code_paths` 解析实际 Module 和治理关系。

必须满足：

```text
Actual Governance Scope ⊆ Approved Governance Scope
```

否则 Changed Files Audit / Verification 必须失败。

### 12. 只新增 Formal Version Gate

不新增 Project Spec Readiness Gate，不新增第二套 Contract Gate、Trace Gate 或 Verification。

唯一新增正式 Gate：

```text
formal_version_gate
```

它位于 Verification 之后、Close 之前，判断 WI 是否有资格进入正式版本。

Git Merge 必须要求：WI 已关闭、Formal Version Gate 通过，并且 Gate 对应的 Git Diff 未变化。

### 13. 不新增 Agent，不增加 CI

继续使用现有专业 Agent：

- `sf-requirements`
- `sf-design`
- `sf-task-planner`
- `sf-executor`
- `sf-verifier`

本决策阶段不增加 CI。

### 14. 采用兼容上线，不立即硬切换

新 Schema 先兼容旧项目缺少 `data_model`、`contracts`、`code_paths`。旧项目迁移不是当前版本交付目标；现有 `spec_migration_path` 保留已有能力，但本阶段不为历史项目兼容继续扩展。

按照 ADR-008，必须先完成真实全新项目的首次治理自举端到端验证，确认第一个正式 Requirement 能在同一个 WI 中建立 Architecture、Data Model、Module `code_paths`、Module Design、Module Contract 和 Trace，并通过现有 Gate / Merge 使新治理模型正式激活。验证通过后，才能把：

```text
spec_consistency_gate
trace_gate
contract_integrity_gate
```

切换为最终 Hard Enforcement。旧项目继续由兼容行为处理，不以完成迁移作为 Hard Enforcement 的前置条件。

## Alternatives Rejected

### 独立 Project Governance 层

拒绝。它会和 Project Architecture 形成职责重叠，增加新的正式对象、路径、Gate 和迁移复杂度，不能提供与复杂度相称的额外治理价值。

### 新增 Architecture/Data 专业 Agent

拒绝。现有 `sf-design` 已承担设计职责，扩展其输入、输出和机器约束即可闭环。

### 为 Data Model 新增 Workflow

拒绝。Data Model 是正式设计对象，不需要成为独立工作流；是否需要 Data Model Candidate 由 Impact Scope 决定。

### 立即开启全部 Hard Gate

拒绝。真实全新项目的首次治理自举尚未完成端到端验证；在合法 Candidate 生产、Gate、Merge 和治理激活链未被真实运行证明前，不应提前切换最终 Hard Enforcement。

### 为 Fast Path 跳过上层设计检查

拒绝。Fast Path 只减少无意义 Candidate，不改变 Architecture/Data/Design/Contract 对代码的约束。

## Consequences

### Positive

- 正式设计对象有唯一职责和明确真相源。
- Requirement 到 Code、Code 到 Architecture 可双向追溯。
- Implementation 不能反向扩大已批准治理范围。
- Fast Path 保留效率，同时不牺牲设计一致性。
- 复用现有 Agent、Workflow、Gate 和 Trace 主体，降低新增复杂度。

### Costs / Constraints

- 旧项目可继续保持兼容状态；当前版本不要求为了进入最终 Hard Enforcement 而先完成历史项目迁移。
- Module 必须补齐明确的 `code_paths`，否则真实代码归属无法安全推导。
- 在 Phase 11 真实新项目端到端验证完成前，需要保留兼容行为，不能把“运行时支持新模型”或“代码级行为测试通过”误认为“新项目完整治理链已经在真实 OpenCode 环境中验证”。

## Implementation and Audit Boundary

2026-07-27 架构一致性治理主体改造已取得以下本地验证证据：

```text
Deterministic workspace build: PASS
git diff --check: PASS
Governance targeted tests: 9 files passed / 82 tests passed
```

随后在提交 `1904d72`（`feat(governance): bootstrap new project governance`）中补齐了新项目首次治理自举所需的受控 Candidate 入口和 Module Contract 完整性检查，并取得：

```text
Deterministic workspace build: PASS
git diff --check: PASS
Bootstrap targeted tests: 5 files passed / 18 tests passed
New-project governance bootstrap behavior test: PASS
```

这些证据证明当前代码级新项目自举行为已通过定向构建和回归测试。它们**不代表**真实 OpenCode 环境中的首次项目开发端到端流程已经完成，也不代表最终 Hard Enforcement 已经启用。Phase 11 / Phase 12 的现行执行定义以 ADR-008 为准。

## Follow-up

1. 将当前 `main` 安装/升级到实际 OpenCode 用户级运行环境。
2. 使用干净的新业务项目执行第一个正式 Requirement，完整验证 Architecture、Data Model、Module `code_paths`、Module Design、Module Contract、Trace、Gate、Merge 和治理激活。
3. Phase 11 验收通过后，把 spec consistency、trace、contract integrity 切换为最终 Hard Enforcement。
4. 完成 Phase 12 后更新实施状态和验证证据；旧项目迁移继续保持非当前交付目标。
