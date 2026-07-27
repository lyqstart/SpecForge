# 文档状态

- **状态**：Accepted / Implementation in Progress
- **决策记录**：[`ADR-007-architecture-consistency-governance.md`](../adr/ADR-007-architecture-consistency-governance.md)、[`ADR-008-new-project-governance-bootstrap.md`](../adr/ADR-008-new-project-governance-bootstrap.md)
- **权威性**：本文件是 SpecForge 架构一致性治理的现行目标设计与实施路线图。
- **取代**：`docs/archive/SpecForge治理架构完整修改方案-已取代.md`
- **审计日期**：2026-07-27
- **当前验证证据**：架构一致性治理主体定向测试 9 个测试文件、82 个测试通过；提交 `1904d72` 的新项目自举定向测试 5 个测试文件、18 个测试通过；deterministic workspace build 与 `git diff --check` 通过。
- **上线边界**：兼容模式先落地；Phase 11 必须完成真实全新项目在 OpenCode + SpecForge 中的首次治理自举端到端验证，随后 Phase 12 才能启用最终 Hard Enforcement。旧项目迁移不是当前版本交付目标。

> 本文件描述目标架构、实施顺序和验收标准；测试通过只证明当前已覆盖实现没有破坏所列定向回归，不等同于 Phase 11/12 已完成。

---


## 一、改造目标

本次只解决一件事：

> **保证用户需求最终形成的 Architecture、Data Model、Module Design、Contract、Task 和 Production Code 始终一致，并且任何偏离都能被机器阻断。**

最终主链：

```text
用户需求
↓
Requirement
↓
Impact Analysis
↓
Project Architecture
↓
Project Data Model
↓
Module Design
↓
Contract
↓
Task
↓
Code Permission
↓
Production Code
↓
Actual Scope Audit
↓
Verification
↓
Formal Version Gate
↓
Close
↓
Git Merge
```

Trace 贯穿整个过程。

不新建新的治理层。

不增加新的专业 Agent。

不增加 Project Spec Readiness Gate。

不增加新的 Requirement 治理体系。

不增加 CI。

---

# 二、现有 SpecForge 哪些东西继续保留

现有 SpecForge 已经具有完整的流程骨架：

```text
Intake
→ Classification
→ Impact Analysis
→ Candidate
→ Gate
→ User Decision
→ Merge
→ Code Permission
→ Implementation
→ Verification
→ Close
```

当前 Orchestrator 也已经明确了 `sf-requirements`、`sf-design`、`sf-task-planner`、`sf-executor`、`sf-verifier` 的专业职责，以及 Candidate、Merge、Code Permission、Changed Files Audit 的受控关系。

因此本次不是重造流程，而是把新的正式设计对象接进现有流程。

---

# 三、正式治理对象

最终只增加和强化下面这些对象。

## 1. Project Architecture

正式位置：

```text
.specforge/project/architecture.md
```

它是：

> **整个项目最高层的技术设计真相源。**

负责：

1. 系统整体结构；
2. Module 划分和职责；
3. Module 之间的调用和依赖；
4. 公共基础设施；
5. 整体数据架构；
6. 关键数据流；
7. 所有 Module 共同遵守的系统级约束。

重要规则使用稳定 ID：

```text
ARCH-<DOMAIN>-NNN
```

例如：

```text
ARCH-FILE-001
所有持久化文件路径必须由统一路径服务决定。
```

---

## 2. Project Data Model

新增正式位置：

```text
.specforge/project/data_model.md
```

它是：

> **整个项目的数据和数据库详细设计真相源。**

数据库必须从整个系统全局设计，不能先机械拆给各 Module。

负责：

* 核心业务实体；
* 实体之间关系；
* 数据库表及职责；
* 主要字段及业务含义；
* 主键、外键；
* 关键约束；
* 共享数据；
* 关联表；
* 历史、审计、汇总数据；
* 事务和一致性关系；
* 重要索引和性能设计；
* 数据生命周期；
* 数据所有权。

重要数据设计使用：

```text
DATA-<DOMAIN>-NNN
```

Architecture 与 Data Model 的边界：

```text
Architecture
= 数据系统总体怎么建设

Data Model
= 数据和数据库具体怎么设计
```

当前代码虽然预留了 `domain_model.md` 路径，但它没有进入当前正式 `spec_manifest.json`；正式清单目前也没有 `data_model`。

最终规则：

> `data_model.md` 是唯一正式项目级数据模型。

已有 `domain_model.md` 能力只保留兼容读取，不再发展成另一套正式数据治理体系，不双写、不双向同步。

---

## 3. Module Design

正式位置：

```text
.specforge/project/modules/<MODULE>/design.md
```

它是：

> **Module 在 Project Architecture 和 Project Data Model 约束下，具体如何完成自身职责的正式设计。**

继续沿用 SpecForge 当前已有的设计编号：

```text
DD-*
```

不再另造 `DES-*`。

Module Design 必须说明：

* 模块内部组成；
* 业务处理流程；
* 状态变化；
* 内部数据流；
* 如何使用公共基础设施；
* 如何使用项目数据模型；
* 错误处理；
* 边界条件；
* 实现约束；
* 验证方式。

它不能自行重新设计项目级数据库，也不能违反 Project Architecture。

---

## 4. Project Contract

继续使用：

```text
.specforge/project/extension_registry.json
```

定义：

> 跨 Module 或全项目共同依赖、必须由机器强制的规则。

继续复用现有 Contract 模型：

```text
shared_enums
invariants
public_interfaces
extension_points
```

当前这些类型已经是正式机器 Contract 模型。

增加统一元数据：

```text
source_refs
enforcement
```

其中：

```text
source_refs
```

必须指出 Contract 来源于哪条：

```text
ARCH-*
DATA-*
```

---

## 5. Module Contract

新增：

```text
.specforge/project/modules/<MODULE>/contracts.json
```

定义：

> 只被同一个 Module 内部共同依赖、需要机器强制的规则。

包括适合机器验证的：

* 内部枚举；
* 状态；
* 错误码；
* 数据结构；
* 内部接口约束；
* 不变量。

复用现有 Contract 的基础数据结构，不另建完全不同的 Contract 系统。

边界只有一条：

```text
所有消费者属于同一个 Module
→ Module Contract

出现其他 Module 消费者
→ Project Contract
```

其他 Module 直接依赖 Module Contract：

```text
BLOCK
```

Module Contract 的 `owner_module` 必须和目录所属 Module 一致。

其 `source_refs` 必须来自：

```text
DD-*
```

---

# 四、Module 与代码归属

当前 Module Schema 只有：

```text
module_file
requirements
design
trace
```

没有 Contract 和代码归属。

增加：

```text
contracts
code_paths
```

最终每个 Module：

```text
module_file
requirements
design
contracts
trace
code_paths
```

例如：

```text
SYNC
code_paths:
  - packages/sync/**
```

`code_paths` 的作用只有一个：

> 根据真实代码文件确定它属于哪个 Module。

规则：

```text
一个生产代码文件
→ 必须唯一匹配一个 Module
```

出现：

```text
0 个 Module
或
多个 Module
```

都不能自动猜：

```text
BLOCK
```

项目公共代码也必须明确归属于某个正式 Module，例如 PLATFORM、CORE 等，不能成为无人管理区域。

---

# 五、各对象谁生产、依据什么生产、谁消费

这是本次方案最重要的规则。

| 对象                   | 生产者                   | 必须依据                                         | 强制消费者                                        |
| -------------------- | --------------------- | -------------------------------------------- | -------------------------------------------- |
| Requirement          | `sf-requirements`     | 用户需求、事实                                      | Impact、Design                                |
| Project Architecture | `sf-design`           | Requirement、现有系统事实、环境、决策                     | Data Model、Module Design、Impact、Verification |
| Project Data Model   | `sf-design`           | Requirement、Architecture、现有数据库事实             | Module Design、Task、Verification              |
| Module Design        | `sf-design`           | Requirement、Architecture、Data Model、Contract | Task、Executor、Verification                   |
| Project Contract     | 受控 Contract 写入        | Architecture/Data Model                      | Design、Task、Executor、Verification            |
| Module Contract      | `sf-design`           | Module Design                                | Task、Executor、Verification                   |
| Task                 | `sf-task-planner`     | 已批准 Design、Contract、Impact Scope             | Executor、Verifier                            |
| Impact Scope         | Agent 分析 + Runtime 推导 | Classification、Spec、Trace、code_paths         | Workflow、Candidate、Code Permission、Audit     |
| Trace                | 现有 Trace 系统受控维护       | 正式 ID 和引用                                    | Impact、Gate、Code Permission、Verification     |

核心原则：

> **一个正式对象如果没有明确的生产者和后续消费者，就不应该成为治理对象。**

---

# 六、sf-design 的正式职责

不增加 Architecture Agent。

不增加 Data Agent。

统一由现有：

```text
sf-design
```

负责设计。

当前 `sf-design` 已经负责系统架构、数据模型、接口、验证设计，并要求设计有 Requirement 和真实实现依据。

需要把正式生产顺序固定下来：

```text
Requirement
↓
读取现有 Project Architecture
↓
决定 Architecture 保持 / 建立 / 修改
↓
读取现有 Project Data Model
↓
决定 Data Model 保持 / 建立 / 修改
↓
确定受影响 Module
↓
建立或修改 Module Design
↓
识别需要机器强制的 Contract
```

---

# 七、第一次开发项目时怎么做

不存在额外的 Project Spec Readiness Gate。

设计规则本身解决这个问题。

例如第一次真正开发功能时：

```text
architecture.md 尚未形成有效架构
data_model.md 尚未形成有效设计
```

同一个 WI 内：

```text
Requirement
↓
sf-design 建立 Architecture Candidate
↓
基于该 Architecture Candidate
建立 Data Model Candidate
↓
基于 Architecture + Data Model
建立 Module Design Candidate
↓
Contract Candidate（如需要）
↓
Task
↓
Gate
↓
User Decision
↓
一次性 Merge
↓
Code Permission
↓
Implementation
```

不拆成多个 WI。

---

# 八、后续需求时怎么做

每次设计仍然先消费现有正式设计。

例如：

```text
Architecture 不变
Data Model 不变
Module Design 要变
```

则：

```text
正式 Architecture
+
正式 Data Model
↓
新的 Module Design Candidate
```

如果：

```text
Architecture 要变
Data Model 也要变
```

则同一个 WI 内：

```text
新的 Architecture Candidate
↓
新的 Data Model Candidate
↓
新的 Module Design Candidate
```

下层设计永远基于本次即将生效的上层设计，而不是旧版本。

---

# 九、Impact Scope

扩展现有：

```text
trigger_result.json
```

增加：

```text
impact_scope
```

固定结构：

```text
affected_modules

architecture_refs

data_model_refs

design_refs

project_contract_refs

module_contract_refs

planned_code_paths
```

Impact Scope 定义：

> **本次变化需要治理的正式范围。**

---

# 十、Impact Scope 怎么产生

不能完全相信 Agent。

流程：

```text
Agent 根据 Requirement 和实际系统提出初步范围
↓
Runtime 根据正式 Spec、Trace、code_paths 自动解析
↓
补全能够确定的正式关系
↓
形成 trigger_result.json 中的权威 Impact Scope
```

Runtime 自动完成：

```text
代码路径
→ Module

Module
→ Design

Design
→ Architecture / Data Model

Architecture / Data Model / Design
→ Contract
```

如果发现：

```text
路径无法确定 Module
一个路径属于多个 Module
引用 ID 不存在
关系无法唯一确定
```

则不能猜：

```text
BLOCK
```

---

# 十一、Impact Scope 的四个用途

## 1. 选择治理路径

不是 Impact Scope 直接调用 Skill。

关系是：

```text
Impact Scope
↓
Classification
↓
workflow_path / workflow_type
↓
对应 Workflow Skill
```

---

## 2. 决定必须产生哪些 Candidate

例如：

```text
architecture_changed=true
→ 必须有 Architecture Candidate

data_model_changed=true
→ 必须有 Data Model Candidate

design_changed=true
→ 必须有 Module Design Candidate

module_contract_changed=true
→ 必须有 Module Contract Candidate
```

这就是“该做的必须做到”。

不是增加 Readiness Gate。

而是现有 Candidate 完整性和 Gate 根据 Impact Scope 强制要求对应产物。

---

## 3. 形成 Code Permission

Impact Scope 再经过正式 Spec Merge 和 Task 精确化以后，形成最终开发许可。

---

## 4. 开发后验证有没有越界

```text
Approved Scope
vs
Actual Scope
```

必须：

```text
Actual Scope ⊆ Approved Scope
```

---

# 十二、Classification 修改

当前 Classification 已有：

```text
requirement_changed
acceptance_criteria_changed
business_rule_changed
user_visible_behavior_changed
data_semantics_changed
design_changed
module_boundary_changed
api_contract_changed
architecture_changed
unknowns
```

但是当前 `canUseCodeOnlyFastPath()` **没有检查 `architecture_changed`**。

增加：

```text
data_model_changed
module_contract_changed
```

并修复 Fast Path：

```text
requirement_changed = false
acceptance_criteria_changed = false
business_rule_changed = false
user_visible_behavior_changed = false
data_semantics_changed = false
design_changed = false
module_boundary_changed = false
api_contract_changed = false
architecture_changed = false
data_model_changed = false
module_contract_changed = false
unknowns = []
```

缺一个条件都不能进入 Fast Path。

---

# 十三、Workflow 路由最终规则

继续使用现有 Workflow，不增加新的 Workflow。

但是调整路由职责。

## Requirement 本身发生变化

例如：

```text
新功能
业务要求变化
验收标准变化
```

继续：

```text
requirement_change_path
```

即使同一个需求同时需要修改 Architecture、Data Model、Design，也仍在这个 WI 内完成。

Impact Scope 决定 Candidate 中还需要哪些正式对象。

这样 Requirement 治理不会因为 Architecture 变化而被绕过。

---

## Requirement 不变，但 Architecture 或 Module Boundary 变化

```text
architecture_change_path
```

---

## Requirement 不变，Architecture 不变，但 Data Model / Module Design / Module Contract 变化

```text
design_change_path
```

---

## 只有 Project Contract Registry 变化，而且没有代码实现

```text
contract_change_path
```

当前这条路径本来就是 Registry-only、无 Code Permission 的纯规格工作流。

如果 Project Contract 修改同时要求消费者代码变化：

```text
不能使用 contract_change_path
```

必须进入正常 Requirement / Design / Architecture 工作流。

---

## 上层所有正式对象都不变

```text
code_only_fast_path
```

---

# 十四、Candidate 阶段职责重新统一

当前存在一个明确问题：

例如 `feature_spec` 当前 Candidate 阶段由 `sf-requirements` 同时产生 `requirements_delta.md`、`tasks.md`、`trace_delta.md` 和 Candidate Manifest；而 Orchestrator 的正式职责又规定 Task 和 Trace 只能由 `sf-task-planner` 负责。

必须统一。

最终固定为：

```text
sf-requirements
→ Requirement Candidate

sf-design
→ Architecture Candidate
→ Data Model Candidate
→ Module Design Candidate
→ Module Contract Candidate

受控 Project Contract writer
→ Project Contract Candidate

sf-task-planner
→ tasks.md
→ 现有 Requirement/Task Trace

Runtime
→ candidate_manifest.json
→ derived indexes
→ Trace prospective calculation
```

Candidate Manifest 不让 Agent 自己猜目标路径。

现有 Orchestrator 已经明确“Candidate 路径发现和规范化属于 Runtime”。

---

# 十五、Candidate 的正式目录

统一：

```text
candidates/project/architecture.md

candidates/project/data_model.md

candidates/project/extension_registry.json

candidates/project/modules/<MODULE>/design.md

candidates/project/modules/<MODULE>/contracts.json
```

需要新增 Module 或改变 `code_paths` 时，由 Runtime 生成相应：

```text
spec_manifest.json Candidate
```

所有正式 Spec 变更：

```text
一次 Gate
↓
一次 User Decision
↓
一次原子 Merge
↓
Project Spec Version +1
```

不能一部分 Architecture 已经生效、另一部分 Data Model 还没有生效。

---

# 十六、requirements_index 和 design_index

它们是索引，不是独立设计真相源。

最终改成：

```text
requirements_index.md
→ Runtime 根据正式 Requirements 自动生成

design_index.md
→ Runtime 根据正式 Module Design 自动生成
```

不让 Agent 重复手工维护。

---

# 十七、glossary.md

它只保存：

> 整个项目多个模块共同需要理解的正式业务和技术术语。

由 `sf-design` 在真正新增或改变项目公共术语时产生 Candidate。

不要求每个 WI 修改。

它不能覆盖 Requirement、Architecture 或 Data Model 中的正式规则。

---

# 十八、decisions.md

它记录：

> 已经批准的重要项目级技术决策及其理由。

由 `sf-design` 在存在重要 Architecture / Data Model 决策时产生 Candidate。

Architecture 仍然是“现在必须遵守什么”的真相源。

Decisions 负责：

> “为什么当时这样决定”。

二者职责不重复。

---

# 十九、Trace：只保留一套

当前 SpecForge 已有 Requirement → Design → Task 的追踪能力，其核心实现就是检查 requirements、design、tasks 的覆盖关系。

这一套继续保留，不重构 Requirement Trace。

在同一个 Trace 系统中增加新的治理关系：

```text
Architecture
↔ Data Model
↔ Module Design
↔ Contract
```

不建立第二套 Trace 文件。

仍然使用：

```text
.specforge/project/trace_matrix.md

.specforge/project/modules/<MODULE>/trace.md

.specforge/work-items/<WI>/trace_delta.md
```

---

# 二十、新增 Trace 关系保持极简

正式治理关系只增加两种：

```text
constrained_by
enforces
```

### constrained_by

下层设计受哪个上层正式对象约束。

例如：

```text
DATA-ORDER-001
constrained_by
ARCH-DATA-001
```

```text
DD-ORDER-003
constrained_by
ARCH-MODULE-002
```

```text
DD-ORDER-003
constrained_by
DATA-ORDER-001
```

### enforces

Contract 机器强制哪条正式规则。

例如：

```text
PCON-001
enforces
ARCH-API-002
```

```text
MCON-ORDER-001
enforces
DD-ORDER-003
```

通过正反查询即可回答上下游关系，不增加更多 Relation 名称。

---

# 二十一、Trace Delta

现有 Requirement/Task Trace 继续按当前 Requirement 治理规则工作。

新增的 Architecture/Data/Contract 关系：

```text
只有关系变化
→ 才增加对应 Delta
```

Fast Path：

```text
正式关系没有变化
→ 不要求制造新的治理关系 Delta
```

当前 Quick Change 强制要求 `trace_delta.md`，这一形式主义要求需要取消。

---

# 二十二、Trace Gate

当前 Trace 主要检查 Requirement → Design → Task 覆盖，不具备本方案要求的架构关系语义验证。

扩展现有 Trace Gate，不新建 Gate。

新增检查：

```text
From ID 是否存在

To ID 是否存在

Relation 是否为固定类型

关系方向是否合法

Module 是否正确

DATA 引用是否存在

Architecture 引用是否存在

Contract source 是否存在

Module Contract 是否被其他 Module 使用

删除正式对象后是否产生悬空关系

Current Trace + Trace Delta
形成的 Prospective Trace 是否仍然闭合
```

---

# 二十三、Spec Consistency Gate

继续扩展现有：

```text
spec_consistency_gate
```

负责整个正式设计链一致性：

```text
Impact Scope
↔ Architecture
↔ Data Model
↔ Module
↔ Module Design
↔ Contract
↔ Trace
```

例如：

```text
Impact Scope 说 Data Model 要变化
但是没有 Data Model Candidate
→ BLOCK
```

```text
Module Design 引用了不存在的 DATA ID
→ BLOCK
```

```text
Design 违反当前 Architecture
→ BLOCK
```

---

# 二十四、Contract Integrity Gate

继续扩展现有：

```text
contract_integrity_gate
```

当前它已经针对 `extension_registry.json` Candidate 做 Schema 和消费者完整性检查。

增加：

```text
Module Contract Schema

owner_module 正确

source_refs 存在

enforcement 已声明

Internal Contract 没有跨 Module 消费

Project Contract 变化后的消费者完整性

Module → Project Contract Promotion 完整性
```

不增加第二个 Contract Gate。

---

# 二十五、Gate 的硬阻断

当前：

```text
spec_consistency_gate
trace_gate
```

仍然被定义为 Soft Gate。

最终必须：

```text
spec_consistency_gate = hard
trace_gate = hard
contract_integrity_gate = hard
```

但是不能马上切换。

必须等 Phase 11 的真实全新项目首次治理自举端到端验证通过，并确认兼容行为没有被破坏以后再切换。

---

# 二十六、Fast Path 的正确含义

Fast Path：

> **只是不修改上层正式 Spec，不是不遵守上层正式 Spec。**

当前 `code_only_fast_path` 的 Candidate Gates 明确没有：

```text
spec_consistency_gate
trace_gate
```

最终 Fast Path 必须执行：

```text
schema_gate
path_policy_gate
candidate_manifest_gate

spec_consistency_gate
contract_integrity_gate
trace_gate
```

其中后面三个验证的是：

```text
当前正式 Architecture
当前 Data Model
当前 Module Design
当前 Contract
当前 Trace
+
本次 Impact Scope
```

全部通过以后才能发 Code Permission。

---

# 二十七、Code Permission

当前 Code Permission 主要只有：

```text
allowed_write_files
```

运行时根据它限制 Executor，并在发放时保存文件系统基线。

需要扩展成真正的治理冻结边界：

```text
affected_modules

allowed_write_files

architecture_refs

data_model_refs

design_refs

project_contract_refs

module_contract_refs

project_spec_version

impact_scope_hash
```

这些内容不能由 Executor 提交。

Runtime 根据：

```text
正式 Merge 后的 Project Spec
+
Impact Scope
+
tasks.md
```

自动形成。

---

# 二十八、Code Permission 发放以后范围冻结

Executor 不允许自行扩大治理范围。

如果需要增加一个文件：

### 文件仍属于已经批准的治理范围

例如：

```text
还是原 Module
还是原 Design
还是原 Architecture / Data Model / Contract
```

Runtime 可以允许增加具体文件权限。

这只是把已有范围具体化，不是扩大治理范围。

### 文件导致新的治理对象进入范围

例如：

```text
新的 Module
新的 Design
新的 Data Model
新的 Contract
```

则：

```text
BLOCK
SCOPE_EXPANSION_REQUIRED
```

必须重新正式治理。

不能因为代码已经需要它，就修改 Classification 直接放行。

---

# 二十九、Task

`sf-task-planner` 继续负责 Task。

当前它已经要求：

```text
Task 引用 Requirement / Design
明确文件
明确约束
明确完成条件
明确验证方式
```

增加强制引用：

```text
DD refs

DATA refs（涉及数据时）

Contract refs

allowed_write_files
```

Architecture 一般通过 DD 继承。

如果 Task 直接落实 Architecture 系统级工作，则允许直接引用 ARCH。

---

# 三十、Executor 怎么保证消费正式设计

不能只靠 Task 文本转述。

现有 `sf_context_build` 要扩展。

Executor 被调度时，Runtime 根据：

```text
Code Permission
+
Task refs
```

自动构造上下文：

```text
Task
+
对应 DD
+
对应 DATA
+
对应 ARCH
+
对应 Project / Module Contract
```

只提供本任务真正相关的内容，不把整个项目文档全部塞进去。

所以：

> **正式设计不是“要求 Executor 自己去找”，而是 Runtime 强制把应该消费的内容送到 Executor。**

---

# 三十一、Actual Scope Audit

当前 Changed Files Audit 已经可以根据真实 Write Guard 记录和文件系统 Diff 判断文件是否超出 `allowed_write_files`。

不新建另一套 Changed Files Audit。

直接扩展现有能力。

当前：

```text
Actual File
vs
Allowed File
```

扩展为：

```text
Actual File
↓
code_paths
↓
Module
↓
DD
↓
DATA
↓
ARCH
↓
Contract
```

然后与 Code Permission 中冻结的治理范围比较。

必须：

```text
Actual Governance Scope
⊆
Approved Governance Scope
```

否则：

```text
Changed Files Audit = FAILED
```

---

# 三十二、Verification

Verifier 不再只证明程序能工作。

Runtime 同样根据真实修改构建验证上下文。

Verification 必须证明：

```text
1. 功能正确

2. Requirement / Acceptance Criteria 满足

3. 实现符合 Module Design

4. 实现符合 Project Data Model

5. 实现符合 Project Architecture

6. Project Contract 未违反

7. Module Contract 未违反

8. Actual Scope 未超过 Code Permission
```

继续复用当前：

```text
verification_report
evidence_manifest
semantic_closure
verification_gate
```

不建立第二套 Verification。

当前 Verification Gate 已经是验证、证据、Semantic Closure 后才进入 `verification_done` 的正式入口。

---

# 三十三、Formal Version Gate

这是本次唯一新增的 Gate：

```text
formal_version_gate
```

位置：

```text
Verification Gate
↓
formal_version_gate
↓
Close Gate
↓
Closed
```

它不再检查业务是否正确。

业务正确性已经由 Verification 负责。

Formal Version Gate 只回答：

> **这个 WI 是否有资格作为正式版本进入默认主分支。**

检查：

```text
workflow_type / workflow_path 合法

本 Workflow 要求的 Gate 全部通过

Gate 仍然有效，没有过期

User Decision 与当前 Candidate 一致

需要 Merge 的 Candidate 已正确 Merge

Fast Path 的 Merge 正确为 N/A

Post-Merge Gate 通过

Code Permission 合法

Changed Files Audit 通过

Verification Gate 通过

Semantic Closure 通过

不存在未解决 Hard Stop

不存在未治理 Extension Request

Git Diff 与本 WI 的实际变更一致

不存在本 WI 未治理的额外修改
```

输出：

```text
.specforge/work-items/<WI>/gates/formal_version_gate.json
```

---

# 三十四、Close Gate

Close Gate 不再重复做正式版本资格判断。

它只负责最后封口：

```text
权威状态 = verification_done

formal_version_gate = passed

Code Permission 已撤销

没有未解决 Hard Stop

关闭证据完整
```

然后：

```text
closed
```

当前 `sf_close_gate` 已经要求 `verification_done`、验证报告、Candidate、Merge、Audit 等证据并独占关闭操作，因此直接收敛职责即可。

---

# 三十五、Git Merge

SpecForge 的正式 Git Merge 入口最终增加硬条件：

```text
WI = closed
AND
formal_version_gate = passed
AND
Formal Version Gate 对应的 Git Diff 没有变化
```

否则：

```text
Git Merge BLOCK
```

因此任何绕过 SpecForge 治理形成的工作区修改，都不能成为 SpecForge 正式版本。

---

# 三十六、Project Spec 初始化与兼容

Schema 修改采用向后兼容方式。

新增字段解析阶段先允许旧项目缺失：

```text
project.data_model

module.contracts

module.code_paths
```

不能因为升级 SpecForge 就让旧项目立即无法读取。

但是：

```text
新初始化项目
→ 使用新结构

完成 Spec Migration 的项目
→ 使用新结构
```

新治理规则只认：

```text
data_model.md
```

旧 `domain_model.md` 只兼容读取。

---

# 三十七、新项目首次治理自举

SpecForge 产品本身不使用 SpecForge / OpenCode 自治理开发，因此不存在“SpecForge 自迁移”这一产品目标。旧项目升级迁移也不是当前版本交付目标；现有 `spec_migration_path` 保留已有能力，但本阶段不为历史项目兼容继续扩展。

Phase 11 真正需要验证的是：一个全新的业务项目第一次使用 SpecForge 时，能否自然建立完整的新治理模型。

顺序必须是：

```text
新项目初始化
↓
第一个正式 Requirement
↓
Impact Analysis
↓
Project Architecture
↓
Project Data Model（或有事实依据的不适用声明）
↓
已声明 Module 的真实 code_paths
↓
Module Design
↓
Module Contract
↓
Trace
↓
现有 Gate / User Decision / 原子 Merge
↓
新治理模型 active=true
↓
后续正常开发
```

首次 Requirement 即使需要同时建立上层设计，也继续遵守 Requirement 治理优先规则，并在同一个 WI 内完成；不新增初始化 Workflow，不新增专业 Agent，不允许直接写正式 Project Spec。

Phase 11 必须在真实 OpenCode + SpecForge 环境中完成端到端验证。代码级单元/行为测试通过只能证明实现具备对应能力，不能替代真实项目链路验收。

---

# 三十八、正式实施阶段

## Phase 1：建立数据结构

修改：

```text
work-item / project schema
directory layout
contract model
gate ids
trigger result
classification
```

实现：

```text
data_model

contracts

code_paths

impact_scope

data_model_changed

module_contract_changed

formal_version_gate
```

先保持向后兼容。

---

## Phase 2：建立正式对象解析能力

实现：

```text
ARCH ID parser

DATA ID parser

现有 DD parser 继续复用

Contract source ref resolver

code_paths → Module resolver

Project Spec graph resolver
```

不建设复杂 Markdown AST。

只解析治理真正需要的稳定 ID、引用和固定表格。

---

## Phase 3：改造 sf-design 和上下文

修改：

```text
sf-design
sf-orchestrator
sf_context_build
相关 Workflow Skills
```

实现：

```text
Architecture 生产规则

Data Model 生产规则

Module Design 强制消费上层设计

Contract 提取规则

按 Impact Scope 构建 Design Context
```

---

## Phase 4：改造 Candidate

统一专业产物所有权：

```text
Requirements → sf-requirements

Architecture/Data/Module Design/Module Contract
→ sf-design

Task/现有交付 Trace
→ sf-task-planner

Candidate Manifest / Index / Prospective Spec
→ Runtime
```

修复目前 Workflow 配置与正式 Agent 职责不一致的问题。

---

## Phase 5：扩展 Contract 与 Trace

实现：

```text
Module Contract reader / validator

source_refs

Internal Contract scope

Project Contract promotion checks

Architecture/Data/Design governance trace

Prospective Trace
```

不建立第二套 Contract 或 Trace。

---

## Phase 6：扩展 Gate

扩展：

```text
spec_consistency_gate

contract_integrity_gate

trace_gate
```

先支持兼容模式。

---

## Phase 7：修复 Fast Path

完成：

```text
architecture_changed Fast Path 漏检修复

data_model_changed 检查

module_contract_changed 检查

Fast Path 增加：
spec_consistency
contract_integrity
trace

删除无关系变化时强制治理 Trace Delta
```

---

## Phase 8：Code Permission 与 Actual Scope

扩展：

```text
Code Permission frozen governance scope

code_paths Module resolution

Changed Files Audit governance scope calculation

Actual Scope ⊆ Approved Scope
```

---

## Phase 9：Verification

扩展现有：

```text
sf-verifier
verification_gate
semantic closure
```

增加 Architecture / Data / Design / Contract / Scope 的正式验证。

---

## Phase 10：Formal Version Gate

新增：

```text
formal_version_gate
```

接到：

```text
verification_gate
↓
formal_version_gate
↓
sf_close_gate
↓
Git Merge Guard
```

---

## Phase 11：新项目首次治理自举闭环

在真实全新业务项目中，使用实际 OpenCode + SpecForge 完整执行第一个正式 Requirement，验证：

```text
Requirement
→ Impact Analysis
→ Architecture
→ Data Model
→ Module code_paths
→ Module Design
→ Module Contract
→ Trace
→ Gate
→ User Decision
→ 原子 Merge
→ governance active=true
```

同时确认旧项目兼容行为没有被破坏。

---

## Phase 12：正式 Hard Enforcement

确认 Phase 11 真实端到端验收和全部相关测试通过后：

```text
spec_consistency_gate → HARD

trace_gate → HARD

contract_integrity_gate → HARD
```

从此正式执行新闭环。

---

# 三十九、核心修改文件范围

## 类型和正式路径

重点修改：

```text
packages/types/src/work-item-types.ts
packages/types/src/contract-model.ts
packages/types/src/directory-layout.ts
packages/types/src/gate-ids.ts
```

---

## Classification / Impact

重点修改：

```text
packages/daemon-core/src/tools/lib/change-classification.ts
packages/daemon-core/src/tools/lib/impact-analysis.ts
packages/daemon-core/src/tools/lib/trigger-result.ts
packages/daemon-core/src/tools/lib/workflow-path-selector-v11.ts
```

---

## Project Spec / Context

重点修改：

```text
sf_project_init_core.ts
spec-migration-v11.ts
sf_context_build_core.ts
sf_design_gate_core.ts
```

并增加轻量：

```text
project-spec graph / id resolver
module code-path resolver
data-model parser
```

---

## Contract / Trace

重点修改：

```text
contract-integrity.ts
contracts-registry.ts
sf_trace_matrix_core.ts
verification-evidence-v11.ts
```

---

## Gates

重点修改：

```text
required-gates.ts
gate-runner-v11.ts
close-gate.ts
sf_verification_gate_core.ts
```

增加 Formal Version Gate 核心实现。

---

## Permission / Audit / Merge

重点修改：

```text
code-permission-service-v11.ts
sf-v11-code-permission.ts
changed-files-audit.ts
sf-changed-files-audit.ts
merge-runner-v11.ts
Git governance merge guard
```

---

## Agent

修改：

```text
sf-orchestrator.md
sf-design.md
sf-task-planner.md
sf-executor.md
sf-verifier.md
```

不增加 Agent。

---

## Workflow / Skills

修改已有：

```text
feature_spec
bugfix_spec
change_request
feature_spec_design_first
architecture_change
quick_change
contract_change
spec_migration
```

以及对应 Workflow Skill。

不增加 Data Model Workflow。

---

# 四十、必须通过的验收场景

## A. 第一个功能，项目没有 Architecture

结果：

```text
同一个 WI 自动先产生 Architecture
再产生 Data Model / Design
PASS
```

不能直接跳到 Module Design。

---

## B. Architecture 已存在且不变

新的 Module Design：

```text
必须引用并遵守现有 Architecture
PASS
```

---

## C. 数据库全局模型变化

```text
Data Model Candidate
↓
受影响 Module Design
↓
Task
↓
Code
```

全部闭合才 PASS。

---

## D. Module 私有 Contract

只有本 Module 使用：

```text
PASS
```

---

## E. 其他 Module 引用 Internal Contract

```text
BLOCK
```

---

## F. Module Contract 升级成 Project Contract

必须完成：

```text
Project Contract
消费者更新
Trace 更新
Design 更新（需要时）
```

缺一个：

```text
BLOCK
```

---

## G. 普通 Fast Path

所有正式上层对象不变：

```text
PASS
```

不产生 Spec Candidate。

---

## H. Fast Path 实际违反 Architecture

```text
BLOCK
```

---

## I. Fast Path 实际需要改变 Data Model

```text
不能继续 Fast Path
```

---

## J. 代码文件没有 Module 归属

```text
BLOCK
```

---

## K. 一个代码文件匹配两个 Module

```text
BLOCK
```

---

## L. Implementation 多修改一个文件，但仍属于批准治理范围

Runtime 可以精确补充文件许可。

不能增加新的治理对象。

---

## M. Implementation 需要进入新的治理范围

```text
SCOPE_EXPANSION_REQUIRED
BLOCK
```

---

## N. 实际已经产生越界修改

```text
Changed Files Audit FAILED
Verification BLOCK
Close BLOCK
```

---

## O. Project Contract 删除但消费者未更新

```text
Contract Integrity BLOCK
```

---

## P. Trace 出现不存在的 ID

```text
Trace Gate BLOCK
```

---

## Q. WI 所有功能测试都通过，但治理未完整

```text
Formal Version Gate BLOCK
```

---

## R. Formal Version Gate 后工作区又出现修改

```text
Git Merge BLOCK
```

---

# 四十一、最终完成标准

改造完成后，对任意实际修改文件，SpecForge 必须能自动回答：

```text
这个文件属于哪个 Module？

为什么允许修改？

它落实哪个 DD？

它受哪些 DATA 设计约束？

它受哪些 ARCH 规则约束？

它受哪些 Project / Module Contract 强制？

本次 WI 是否批准了这些范围？

实际修改有没有越界？

功能和设计一致性是否验证通过？

它是否有资格进入正式版本？
```

反方向也必须能够回答：

```text
一个 Requirement 变化
↓
需要不要改变 Architecture？
↓
需要不要改变 Data Model？
↓
影响哪些 Module Design？
↓
影响哪些 Contract？
↓
最终允许修改哪些代码？
```

最终形成真正完整的：

```text
Requirement
↓
Architecture
↓
Data Model
↓
Module Design
↓
Contract
↓
Task
↓
Code
↓
Verification
↓
Formal Version
```

双向可追溯、机器可验证、违规可阻断的 SpecForge 治理闭环。

---

# 四十二、最终设计原则

整个实施过程中坚持以下原则：

```text
能复用现有能力，就不新增能力。

能扩展现有 Gate，就不新增 Gate。

除 Formal Version Gate 外，不增加新的 Gate。

不增加新的 Workflow。

不增加新的 Agent。

不增加新的治理层。

不把数据库机械拆成 Module 私有设计。

不让 Agent 手工维护能够机器推导的索引。

不让 Agent 决定机器能够确定的 Module / Trace / Candidate 路径。

不因为 Fast Path 而跳过 Architecture / Data / Contract 一致性。

不允许 Implementation 反过来修改已经批准的治理范围。

不为了形式制造无意义的 Candidate 或 Trace。

Requirement 现有治理继续保留。

越简单，越稳定。
```
