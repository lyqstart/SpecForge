# ADR-008：新项目首次治理自举闭环

- 状态：Accepted
- 日期：2026-07-27
- 基线：`e2075f7883e3460312e26c60f7202d7d825cc50c`
- 影响范围：ADR-007 与《SpecForge架构一致性治理最终实施方案》中 Phase 11 / Phase 12 的执行定义

## 1. 决策背景

SpecForge 产品本身不使用 SpecForge / OpenCode 自治理开发。SpecForge 由外部开发工具直接维护，因此不存在“SpecForge 用 SpecForge 开发自己”或“SpecForge 自身 Project Spec 迁移”的产品目标。

旧项目升级迁移也不是当前版本的交付目标。已有旧项目可以继续保留原状态；需要采用最新治理模型时，可以用当前版本重新建立项目。现有 `spec_migration_path` 保留已有能力，但本阶段不为历史项目兼容继续扩展。

当前真正需要闭环的是：一个全新的业务项目第一次使用 SpecForge 时，能否从初始化状态自然建立完整的新治理模型，并在后续开发中受该模型约束。

## 2. Phase 11 新定义

Phase 11 定义为“新项目首次治理自举闭环”。

目标链路：

```text
新项目初始化
→ 第一个正式 Requirement
→ Impact Analysis
→ Project Architecture
→ Project Data Model（或有事实依据的不适用声明）
→ 已声明 Module 的真实 code_paths
→ Module Design
→ Module Contract
→ Trace
→ Gate
→ 原子 Merge
→ 新治理模型 active=true
→ 后续正常开发
```

Requirement 变化继续拥有同一个 Work Item。首次需求即使同时需要建立 Architecture / Data Model，也不改变 Requirement 治理优先规则，不新增专门的初始化 Workflow。

## 3. 自举原则

1. 初始化器只建立可运行骨架，不凭空编造真实 Architecture、Data Model 或代码归属。
2. 第一个正式 Requirement 的 Impact Analysis 确定本次真实影响范围。
3. `sf-design` 在同一个 WI 中建立缺失的 Architecture Candidate、Data Model Candidate，并基于真实设计补充已声明 Module 的 `code_paths`、Module Design 和 Module Contract。
4. 所有上述产物必须通过现有受控 `sf_artifact_write` 写入 Candidate 区；禁止 Agent 直接写正式 Project Spec。
5. Architecture / Data Model / Module Contract Candidate 由 `sf-design` 独占产出，Executor 不得写这些治理产物。
6. Runtime 在 Candidate Manifest 规范化阶段只补入当前 WI 中真实存在的治理 Candidate，避免 Agent 手工维护路径映射；Gate、Approval、Merge 继续使用现有统一链路。
7. 现有 Hard `contract_integrity_gate` 在 Merge 前校验 Module Contract Candidate 的结构、`owner_module`、`source_refs` 和 `enforcement`，不新增第二个 Contract Gate。
8. Module Contract 的 `source_refs` 必须引用同一 Module 的 `DD-*`；跨 Module 的内部 Contract 消费继续由现有 Project Governance 一致性检查约束。
9. Merge 后，只有 Module Contract 已存在且 `code_paths` 非空时，正式 Manifest 才声明对应治理字段。

## 4. 本阶段最小实现

本阶段只补齐已有链路中缺少的受控入口：

- `candidate_architecture` → `candidates/project/architecture.candidate.md`
- `candidate_data_model` → `candidates/project/data_model.candidate.md`
- `candidate_module_contract` → `candidates/project/modules/<MODULE>/contracts.candidate.json`
- 已声明 Module 的标准 `contracts.json` 被视为合法正式治理目标
- Module Contract 的 `owner_module` 用于确定 Candidate 的唯一 Module 归属
- Candidate Manifest 规范化时自动登记当前 WI 中真实存在的 Architecture / Data Model / Module Definition / Requirements / Design / Module Contract / Trace Candidate
- 现有 `contract_integrity_gate` 增加 Module Contract Candidate 的 Merge 前完整性校验，不新增 Gate

不修改：

- Requirement 优先路由
- Workflow 数量
- 专业 Agent 数量
- Gate 数量或当前 Gate 强度
- CI
- 历史项目迁移范围
- SpecForge 产品自身开发方式

## 5. Phase 12 新定义

Phase 12 定义为“最终 Hard Enforcement”。

只有 Phase 11 在真实新项目中完成端到端验证，并证明首次治理自举、后续开发、Verification、Formal Version Gate、Close 均能稳定闭环后，才允许把计划中的核心一致性 Gate 切换到最终 Hard Enforcement。

Phase 12 不再依赖任何“SpecForge 自迁移”。

## 6. 验证要求

代码合入前至少验证：

1. deterministic workspace build 通过；
2. 架构治理定向回归测试通过；
3. `git diff --check` 通过；
4. 新增回归测试证明三个首次治理 Candidate 具有受控写入入口及明确产物所有权；
5. 新增回归测试证明已声明 Module 的 `contracts.json` 可以作为合法 Merge 目标；
6. 新增单元测试证明 Module Contract Candidate 缺失 `source_refs` / `enforcement`、owner 不匹配或跨 Module DD 来源时会在 Merge 前失败；
7. 后续使用一个全新业务测试项目执行真实端到端 Phase 11 验证。

## 7. 与既有文档的关系

ADR-007 以及《SpecForge架构一致性治理最终实施方案》中已经确定的治理模型、治理链、Trace、Scope、Formal Version Gate 等架构决策继续有效。

仅以下旧解释由本 ADR 取代：

- “Phase 11 = SpecForge 自身 Project Spec 迁移”
- “Phase 12 必须等待 SpecForge 自迁移完成”

新的权威解释为：

```text
Phase 11 = 新业务项目首次治理自举闭环
Phase 12 = Phase 11 实际验证通过后的最终 Hard Enforcement
```
