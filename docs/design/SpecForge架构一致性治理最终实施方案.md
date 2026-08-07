# 文档状态

- **状态**：Accepted / Implementation in Progress
- **决策记录**：[`ADR-007-architecture-consistency-governance.md`](../adr/ADR-007-architecture-consistency-governance.md)、[`ADR-008-new-project-governance-bootstrap.md`](../adr/ADR-008-new-project-governance-bootstrap.md)
- **权威性**：本文件是 SpecForge 架构一致性治理（包括契约治理）的唯一当前权威源。
- **取代**：`docs/archive/SpecForge治理架构完整修改方案-已取代.md`
- **审计日期**：2026-08-01
- **当前验证证据**：架构一致性治理主体定向测试 9 个测试文件、82 个测试通过；提交 `1904d72` 的新项目自举定向测试 5 个测试文件、18 个测试通过；deterministic workspace build 与 `git diff --check` 通过。本次文件角色、Gate 最终状态、Contract 消费关系和 Phase 生命周期规则修订尚未完成对应源码对账、代码修复与回归测试。
- **产品完成边界**：本文件中的 Phase 1—12 是本次开发 SpecForge 架构一致性治理能力的一次性产品实施路线，不是业务项目每个 WI 的运行流程。最终交付的 SpecForge 必须把本文件的规则落实到程序、Tool、Skill、Agent、Gate、Runtime、项目模板和回归测试中；业务项目不直接读取本文件。首次宣布本能力完成前，必须完成 Phase 11 的真实全新项目端到端验收，并在 Phase 12 固化最终 Hard Enforcement。旧项目迁移不是当前版本交付目标。

> 本文件描述 SpecForge 产品的目标架构、产品实现顺序和产品验收标准；测试通过只证明当前已覆盖实现没有破坏所列定向回归，不等同于本次产品实施路线已完成。

> 状态：AUTHORITATIVE（唯一当前权威源）
>
> 本文件是 SpecForge 架构一致性治理（包括契约治理）的唯一当前权威源。
> 其他设计草案、专项说明、实施报告、交接文件和决策记录，只保存历史背景、实施证据或决策原因，不得作为并列设计权威。
> 任何其他文件与本文件冲突时，以本文件为准。任何新的架构或契约决策，必须先修订本文件，再修改实现。

<!-- SPECFORGE_AUTHORITY_PROTOCOL:START -->
## 〇、权威边界、开发模式与固定执行协议

### 0.1 唯一权威源

**GOV-AUTH-001：** SpecForge 架构一致性治理和契约治理只保留一个当前权威源：

```text
docs/design/SpecForge架构一致性治理最终实施方案.md
```

以下文件均为非权威历史或专项资料：

```text
docs/design/semantic-closure-contract-governance.md
docs/design/contract-model-followups-implementation-report.md
docs/design/contract-model-followups-handoff.md
docs/design/specforge-design-governance-contract-model.md
```

它们可以记录专项细节、实施事实、交接事项、备选方案和决策原因，但不能覆盖本文件。

架构或契约决策可以通过多个 ADR 或专题文件记录原因，但决策文件必须：

1. 引用本文件中的稳定规则 ID；
2. 说明决策日期、备选方案、选择原因和影响范围；
3. 说明替代了哪些旧规则；
4. 不复制形成第二套当前规则；
5. 最终把有效结论同步回本文件。

### 0.2 文件作用范围与两种开发模式

**GOV-ROLE-001：** 本文件是开发 SpecForge 产品中“架构一致性治理与契约治理能力”的设计依据，不是业务项目运行时直接读取或人工执行的项目治理手册。

本文件中的有效规则最终必须落实到：

```text
SpecForge 程序
Tool
Skill
Agent 说明
Gate
Runtime 状态约束
项目初始化模板
正式治理文件结构
自动化测试
```

完成后的业务项目直接遵守 SpecForge 已实现的程序性治理，以及该业务项目自己的 Architecture、Data Model、Module Design、Contract、Trace、Work Item 和 Task；业务项目不以读取本文件作为治理成立条件。

必须严格区分：

```text
开发 SpecForge 产品时怎样工作
≠
完成后的 SpecForge 怎样治理业务项目
≠
本次产品能力按哪些 Phase 实施和验收
```

#### 模式 A：SpecForge 自身开发

**GOV-MODE-001：** SpecForge 自身修改必须遵守本文件的架构一致性与契约治理要求。

**GOV-SELF-001：** SpecForge 自身由 ChatGPT 或其他直接开发工具修改，不运行 SpecForge 自己的 Work Item、Workflow、Candidate、Gate、User Decision、Merge Runner、Code Permission 或 Close 流程，不采用“SpecForge 使用 SpecForge 治理自己”的自治理模式。

模式 A 必须执行：

```text
人工架构一致性治理
+ 契约治理
+ 修改范围治理
+ 普通软件工程验证
```

模式 A 中源代码可能暂时处于未完成的中间状态；中间状态只能用于产品开发和验证，不能被描述为完成后的业务项目治理规则，也不能作为正式产品完成依据。

#### 模式 B：完成后的 SpecForge 治理其他项目

完成后的 SpecForge 必须通过已经实现到程序、Tool、Skill、Agent、Gate 和 Runtime 中的能力，强制业务项目执行：

```text
Work Item
→ Impact Analysis
→ Architecture / Data Model / Module Design / Contract
→ Candidate
→ Gate
→ User Decision
→ Merge
→ Code Permission
→ OpenCode Implementation
→ Actual Scope Audit
→ Verification
→ Close
```

业务项目不直接读取本文件；OpenCode、Agent、Runtime、Gate 和 Write Guard 必须把本文件定义的架构一致性原则转化为可执行、可验证、失败关闭的产品行为。

### 0.3 新会话的远程权威入口

**GOV-REMOTE-001：** ChatGPT 不依赖跨会话记忆，也不把仓库根目录 `AGENTS.md` 当作当然入口。每次新的 SpecForge 自身开发会话，用户必须在提示词中明确要求 ChatGPT 从 GitHub 远程仓库读取本文件。

开始工作前必须记录：

```text
Repository URL
Remote branch
Remote HEAD commit SHA
Authority file path
Authority file所在 commit SHA
Local branch（如使用本地证据）
Local HEAD（如使用本地证据）
Working tree status（如使用本地证据）
```

远程文件、本地文件或用户上传副本不一致时，必须先报告差异并确定本次基线，禁止混用不同版本规则。

### 0.4 SpecForge 自身开发：修改前治理

**GOV-PRE-001：** 修改任何代码前，必须完成源码取证和治理前置结论。治理前置结论至少包含：

```text
任务目标：
当前事实和一手证据：
适用架构规则 ID：
受影响模块：
受影响 Project Architecture：
受影响 Project Data Model：
受影响 Module Design：
受影响 Project Contract：
受影响 Module Contract：
受影响生产者和消费者：
受影响 Workflow / Gate / Runtime：
允许修改文件：
明确不允许修改范围：
需要新增或修改的测试：
是否需要修订本权威文件：
证据不足项：
```

以下任一项未完成时，不得修改代码：

```text
未读取远程权威文件
未固定远程 commit SHA
未调查当前源码事实
未判断架构影响
未判断契约影响
未确定生产者和消费者
未确定修改范围
未确定验证计划
```

### 0.5 架构变化必须在同一任务/WI闭环

**ARCH-WI-001：** 一个需求或任务引起架构变化时，必须在同一个任务范围内完成 Architecture、Data Model、Module Design、Contract、Task、实现和验证的同步修改。

对于使用 SpecForge 开发其他项目的模式 B：

```text
同一个 WI 内扩大治理范围
→ Architecture Candidate
→ Data Model Candidate（需要时）
→ Module Design Candidate
→ Contract Candidate（需要时）
→ Task
→ 一次审批
→ 一次原子 Spec Merge
→ Implementation
→ Verification
```

不为同一个需求另建独立架构 WI。旧文件中“新建架构 WI，并依赖跨 WI 自动恢复原 WI”的要求已经废止。

### 0.6 两级契约模型

**GOV-CONTRACT-001：** 契约治理是架构一致性治理的必需组成部分。任何修改都必须完成契约分类、所有权、来源、消费者、兼容性、执行方式和回归验证检查。

**CON-MODEL-001：** 契约采用两级模型：

```text
Project / Public Contract
→ .specforge/project/extension_registry.json

Module / Internal Contract
→ .specforge/project/modules/<MODULE>/contracts.json
```

**CON-PROJ-001：** 跨 Module 或全项目共同依赖、必须由机器强制的规则属于 Project / Public Contract，存放于 `.specforge/project/extension_registry.json`。

**CON-MOD-001：** 只被同一个 Module 内部共同依赖、需要机器强制的规则属于 Module / Internal Contract，存放于 `.specforge/project/modules/<MODULE>/contracts.json`。

旧设计中把全部契约统一存放在 `extension_registry.json` 的要求已经废止。

固定边界：

```text
所有消费者属于同一个 Module
→ Module Contract

出现其他 Module 消费者
→ 必须升级为 Project Contract

其他 Module 直接引用 Module Contract
→ BLOCK
```

**CON-PROM-001：** Module Contract 一旦出现其他 Module 消费者，必须在同一个 WI 内升级为 Project Contract，并同步更新受影响设计、消费者、Trace、验证和迁移内容；禁止其他 Module 直接消费 Internal Contract。

**CON-CONS-SOURCE-001：** Contract 的正式消费者关系只以现有 Trace 系统为真相源，不在 Contract 文件、Module 定义或其他文档中再维护一份可独立修改的消费者列表。

固定登记方式：

```text
具体 Module Design 规则（DD-*）
constrained_by
Contract ID
```

Module 消费者由该 `DD-*` 所属 Module 自动推导。不得只登记模糊的“某 Module 消费某 Contract”，也不得通过人工搜索或 Agent 猜测代替正式关系。

**CON-CONS-DELTA-001：** Contract 消费关系的增加、取消和变更必须进入同一个 WI 的 `trace_delta.md`：

```text
新增关系 → ADD
取消关系 → REMOVE
变更关系 → REMOVE 旧关系 + ADD 新关系
```

Runtime 必须以“当前正式 Trace + ADD - REMOVE”形成 Prospective Trace，并对合并后的关系执行完整性检查；ADD 与 REMOVE 必须随本次 Spec Merge 原子生效。

**CON-CONS-DELTA-CANON-001：** Governance Relation Delta 只表达“正式 Trace 边本身发生变化”，并且必须使用正式 Trace 的规范模型：

```text
Operation = ADD | REMOVE
From / To = 正式治理对象 ID
Relation = constrained_by | enforces
```

固定规则：

1. `From` / `To` 必须是可在 Prospective Architecture / Data Model / Module Design / Contract 中解析的正式 ID，不得写说明文字、值快照或人工标签；
2. Contract 消费关系固定表达为 `DD-* constrained_by <Contract ID>`；
3. Contract 的 `owner_module`、`source_refs`、枚举成员、schema 字段等 Contract 内容不得伪造为 `owned_by`、`consumed_by-*` 或其他 Trace Relation；
4. Contract 值、schema、枚举成员发生变化，但正式 Trace 边集合没有变化时，不得生成 Governance Relation Delta；
5. 只有消费者 DD、source/enforcement 正式对象或其他真实 Trace 边发生增加、删除、替换时，才生成对应 `ADD` / `REMOVE`；
6. Planner 在写入 Candidate 前必须逐行验证四列、Relation 枚举和正式 ID；无法证明合法时必须 Fail Closed。

**CON-CODE-CONS-001：** 生产代码的实际 Contract 消费不得建立第二套治理机制。现有 `contract_integrity_gate` 必须结合 Module `code_paths`、Impact Scope、Code Permission、Changed Files Audit 和验证阶段取得的实际依赖证据，对账“Trace 声明的正式消费者”与“生产代码的实际 Module 依赖”。无法证明实际依赖完整时必须 Fail Closed，不得猜测。

Module Contract 升级为 Project Contract 时，Prospective Project Spec 必须同时包含：

```text
新的 Project Contract
原 Module Contract 的废弃、删除或替代说明
全部消费者关系的 REMOVE / ADD
受影响 Module Design 更新
Trace 更新
兼容性或迁移说明
验证与回归测试
```

缺少任一项，`contract_integrity_gate` 必须 BLOCK。

每次修改必须检查：

1. **CON-OWN-001：** 每条契约必须有明确 owner；历史名称 `CON-OWNER-001` 视为本规则的别名，不再新增引用；
2. **CON-REF-001：** 每条契约必须有可验证的 `source_refs`；Project Contract 来源于 ARCH/DATA，Module Contract 来源于 DD；历史名称 `CON-SOURCE-001` 视为本规则的别名，不再新增引用；
3. **CON-CONS-001：** 全部生产者和消费者必须识别完整；
4. **CON-COMPAT-001：** 必须判断变更属于兼容新增、兼容修改、破坏性修改、废弃还是迁移，并明确消费者处理方式；
5. **CON-PROM-001：** 必须检查 Module Contract 是否产生跨模块消费者，并执行升级或阻断；
6. **CON-ENFORCE-001：** 必须明确由哪个 Gate、Verifier、类型检查、静态分析或 Runtime 机制执行；
7. **CON-TEST-001：** 必须具备合法、非法、兼容、悬空引用、删除和跨模块边界回归测试；
8. **CON-REVIEW-001：** 机器无法确定执行的规则必须明确标记为“人工审查契约”。

只有文字说明、没有确定执行机制的规则，不得声称已经机器强制。

### 0.7 实施过程中的范围冻结

**GOV-SCOPE-001：** 实施过程中必须：

```text
只修改前置结论批准的范围
不临时扩大任务目标
不绕过现有架构
不自行发明跨模块契约
不为通过测试而削弱正式规则
不把测试兼容逻辑误写成生产规则
```

发现新的架构、契约、模块、消费者或文件影响时，必须停止扩大修改，重新执行治理前置分析并更新允许范围。

### 0.8 修改后治理闭环

**GOV-POST-001：** 修改完成后必须逐项验证：

```text
实际修改文件是否超出批准范围
是否符合 Project Architecture
是否符合 Project Data Model
是否符合 Module Design
是否破坏 Project Contract
是否破坏 Module Contract
是否遗漏生产者或消费者
是否破坏 Workflow / Gate / Runtime 状态边界
权威文件是否需要同步且已经同步
```

同时执行所有适用的普通软件工程验证：

```text
单元测试
属性测试（适用时）
集成测试（适用时）
端到端测试（适用时）
回归测试
TypeScript no-emit 检查
相关 package 构建
全仓确定性构建（达到集成或发布边界时）
git diff --check
git status --short
```

工程验证不是治理的全部内容。完整闭环是：

```text
架构一致性
+ 契约一致性
+ 实际范围审计
+ 功能与工程验证
+ 唯一权威文件同步
```

最终报告必须包含：

```text
实际修改：
架构一致性结论：
契约一致性结论：
实际范围审计：
测试结果：
构建和类型检查结果：
git diff/status 结果：
权威文件同步情况：
仍未解决的问题：
证据不足项：
```

### 0.9 Fail Closed 与“完全做到”的保证机制

**GOV-EVID-001：** 任何必需事实、验证或契约证据不足时，必须标记 `INSUFFICIENT_EVIDENCE`，不得猜测、提交、推送或宣布完成。

出现以下任一情况，不得进入完成边界：

```text
架构未对账
契约未对账
实际范围未核对
生产者或消费者未查全
必需测试未完成或失败
必需构建或类型检查未完成或失败
应更新权威文件但尚未更新
存在未解决治理缺陷
存在 INSUFFICIENT_EVIDENCE
```

“每次完全做到”不依赖模型记忆，而由四个机制共同保证：

```text
用户提示词强制读取远程权威文件
+ 远程 commit SHA 固定本次规则版本
+ 修改前/修改后固定输出结构
+ Fail Closed 完成条件
```

如未来增加结构性回归测试，该测试只能检查本文件的唯一权威声明、必要章节、规则 ID 和旧文件非权威声明是否仍然存在；它属于普通仓库回归测试，不是 SpecForge 自治理流程。

### 0.10 新会话固定提示词

每次新会话至少使用以下提示词：

```text
继续 SpecForge 自身开发。

在采取任何修改行动前，必须先从 GitHub 远程仓库读取：
docs/design/SpecForge架构一致性治理最终实施方案.md

该文件是 SpecForge 架构一致性治理和契约治理的唯一当前权威源。请记录远程仓库、分支、HEAD commit SHA 和该文件对应版本，并严格执行文件中的固定执行协议。

本次是 SpecForge 自身直接开发：必须执行人工架构一致性治理、契约治理、修改范围治理和普通软件工程验证；不得运行 SpecForge 自身的 Work Item、Workflow、Candidate、Gate、User Decision、Merge Runner、Code Permission 或 Close 流程。

先调查远程仓库和当前代码事实，再输出治理前置结论。治理前置结论必须至少包括：任务目标、适用架构规则、受影响模块、Architecture、Data Model、Module Design、Project/Module Contract、生产者和消费者、Workflow/Gate/Runtime、允许修改文件、不允许修改范围、验证计划、是否需要修订权威文件和证据不足项。

治理前置结论完成前不得修改代码。修改后必须完成架构对账、契约对账、实际范围审计、单元/回归测试、适用的属性/集成/端到端测试、TypeScript 检查、构建、git diff --check、git status，并同步唯一权威文件。任何必需证据不足时标记 INSUFFICIENT_EVIDENCE，不得猜测、提交、推送或宣布完成。
```

用户在上述固定提示词后追加本次具体任务、仓库地址、目标分支和已知基线。
<!-- SPECFORGE_AUTHORITY_PROTOCOL:END -->

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

> 权威说明：旧文件中将所有契约统一存放于 `extension_registry.json` 的方案已被替代。当前必须采用 Project / Public Contract 与 Module / Internal Contract 两级模型。

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

> 权威说明：架构变化必须在同一个 WI 内扩大治理范围并闭环，不为同一需求另建独立架构 WI。

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

# 二十一、Trace Delta 与唯一关系真相源

现有 Requirement/Task Trace 继续按当前 Requirement 治理规则工作。

Trace 只保留一个逻辑真相源：

```text
.specforge/project/trace_matrix.md
= 当前正式关系的项目级权威矩阵

.specforge/project/modules/<MODULE>/trace.md
= 从项目级权威矩阵按 Module 形成的受控视图，不得独立产生另一套关系事实

.specforge/work-items/<WI>/trace_delta.md
= 本次 WI 对正式关系提出的变更输入
```

Contract 消费关系必须登记为：

```text
DD-*
constrained_by
Contract ID
```

其所属 Module 由 `DD-*` 的正式归属自动推导。

`trace_delta.md` 必须明确支持：

```text
ADD
REMOVE
```

关系变更统一表达为：

```text
REMOVE 旧关系
+
ADD 新关系
```

Runtime 必须计算：

```text
Current Trace
+ ADD
- REMOVE
= Prospective Trace
```

Trace Gate、Spec Consistency Gate 和 Contract Integrity Gate 检查的是 Prospective Trace；通过审批和原子 Spec Merge 后，Prospective Trace 才成为新的正式 Trace。

新增的 Architecture/Data/Contract 关系只有真正发生变化时才要求对应 Delta。

Fast Path：

```text
正式关系没有变化
→ 不要求制造新的治理关系 Delta
```

当前 Quick Change 强制要求 `trace_delta.md`，这一形式主义要求需要取消；但声称关系没有变化时，Gate 仍必须根据 Impact Scope 和实际修改范围验证该声明。

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

不增加第二个 Contract Gate。现有 Gate 必须在两个边界执行同一套 Contract 规则：

```text
Candidate 合并前
→ 检查 Prospective Project Spec 和 Prospective Trace

实现与验证后
→ 结合 code_paths、Code Permission、Changed Files Audit 和实际依赖证据复核生产代码消费者
```

必须检查：

```text
Module Contract Schema
owner_module 正确
source_refs 存在
enforcement 已声明
消费者关系来自 Trace 唯一真相源
ADD / REMOVE 合法且原子
Internal Contract 没有跨 Module 消费
Project Contract 变化后的全部消费者已同步
Module → Project Contract Promotion 完整
删除 Contract 后不存在悬空关系
Trace 声明消费者与生产代码实际 Module 依赖一致
```

出现以下任一情况必须 BLOCK：

```text
生产代码实际消费 Contract，但 Trace 未登记
Trace 登记消费，但 Contract 不存在或已删除
其他 Module 消费 Internal Contract
Promotion 缺少 Contract、Design、消费者、Trace、兼容性或测试中的任一项
无法取得足够证据证明消费者完整
```

---

# 二十五、Gate 的硬阻断与产品完成边界

**GATE-HARD-001：** Soft / Hard 描述的是 Gate 失败后是否由程序阻断流程：

```text
Soft
= 发现问题并记录，但不形成最终硬阻断

Hard
= 发现问题后立即阻断 Candidate Merge、Code Permission 或后续状态推进
```

必须区分：

```text
开发 SpecForge 产品时的中间代码状态
≠
完成后的 SpecForge 治理业务项目时的正式行为
```

开发过程中，源代码可以暂时存在部分 Gate 为 Soft 的中间状态，以便完成实现和验证；该状态只表示产品尚未完成，不能发布为本能力的正式完成版本，也不能设计成“某业务项目第一个 WI 完成后自动切换”。

**GATE-FINAL-001：** 本能力最终完成后，SpecForge 治理任何业务项目时，从第一个 WI、后续 WI 到 Fast Path，以下三个 Gate 必须始终全部为 Hard：

```text
spec_consistency_gate = hard
trace_gate = hard
contract_integrity_gate = hard
```

不存在按项目、按 WI 或按“第一个 WI 是否完成”从 Soft 自动切换到 Hard 的状态机。

最终 Hard 状态必须由现有机制共同保证，不新增平行配置体系：

```text
Gate 注册定义
→ 三个 Gate 的 severity 全部为 hard

Workflow Required Gates
→ 所有适用 Workflow 和 Fast Path 必须调用三个 Gate

Runtime 状态推进
→ 任一 Gate 失败，不得 Merge、不得发 Code Permission、不得继续推进

普通回归测试
→ 固定断言三个 Gate 的 severity、Workflow 覆盖和失败阻断行为
```

任一层不满足，SpecForge 不得宣布本能力完成或发布对应正式版本。

Phase 11 必须在候选实现已经具备上述最终 Hard 行为时进行真实端到端验收；Phase 12 不是让业务项目自行切换，而是确认、固化并发布这一最终产品行为。


<!-- SPECFORGE_GATE_ATTEMPT_EVIDENCE:START -->
### 25.1 Gate Attempt 证据不可变性

**GATE-ATTEMPT-001：** 每次 Gate 运行必须形成一个独立、追加式、完成后不可修改的 Gate Attempt：

```text
.specforge/work-items/<WI>/gate_attempts/attempt-NNNN/
├── attempt-start.json
├── gates/<gate_id>.json
├── gate_summary.md
└── attempt-result.json
```

固定规则：

1. `attempt-NNNN` 单调递增，同一个 WI 内不得复用；
2. `attempt-start.json`、每个 Gate Report、`gate_summary.md` 和 `attempt-result.json` 使用独占创建，完成后不得覆盖；
3. Gate 失败、修正 Candidate 后重跑、部分 Gate 重跑和完整 Gate 重跑都必须创建新 Attempt；
4. 后续 Attempt 不得删除、修改或替换旧 Attempt；
5. Agent、Runtime 和人工审计必须报告 `attempt_id` 与 `attempt_path`，不能只报告可变的 latest 文件。

**GATE-LATEST-001：** 现有路径继续保留：

```text
.specforge/work-items/<WI>/gates/<gate_id>.json
.specforge/work-items/<WI>/gate_summary.md
```

它们只表示“当前最新兼容视图”，供既有 Merge、Verification、Close 和读取消费者继续使用；它们不是历史审计真相源。历史审计必须读取 `gate_attempts/attempt-NNNN`。

**GATE-MIGRATION-001：** 升级前已经存在 latest Gate 文件、但尚无 `gate_attempts` 时，第一次升级后 Gate 运行前，Runtime 必须先把现有 latest 文件完整复制为 `attempt-0001` legacy snapshot，再创建新的 Attempt。无法证明被更早覆盖的历史内容时必须标记 `INSUFFICIENT_EVIDENCE`，不得伪造或声称已恢复。
<!-- SPECFORGE_GATE_ATTEMPT_EVIDENCE:END -->

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

# 三十七、完成后的 SpecForge：新项目首次治理自举

本节定义的是完成后的 SpecForge 治理业务项目时的目标产品行为，不是开发 SpecForge 时每次修改都要执行的 Phase，也不要求业务项目直接读取本文件。

SpecForge 产品本身不使用 SpecForge / OpenCode 自治理开发，因此不存在“SpecForge 自迁移”这一产品目标。旧项目升级迁移也不是当前版本交付目标；现有 `spec_migration_path` 保留已有能力，但本阶段不为历史项目兼容继续扩展。

一个全新的业务项目第一次使用完成后的 SpecForge 时，必须能够在第一个正式 WI 内自然建立完整治理模型。

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

从第一个 WI 开始，三个核心 Gate 就必须按最终产品规则全部 Hard；第一个 WI 完成后不发生 Gate 严格度切换。后续 WI 必须消费已经生效的正式 Architecture、Data Model、Module Design、Contract 和 Trace，并按同一套 Hard Gate 继续治理。

Phase 11 是开发 SpecForge 产品时对上述目标行为进行的真实端到端验收；代码级单元/行为测试通过只能证明实现具备对应能力，不能替代真实项目链路验收。

---

# 三十八、SpecForge 产品正式实施阶段

**PHASE-LIFE-001：** Phase 1—12 是本次开发 SpecForge 架构一致性治理能力的一次性产品实施与验收路线，不是业务项目的 WI 流程，也不是以后每次普通代码修改都从 Phase 1 重新执行。

首次完成本能力时按 Phase 1—12 推进。完成并发布后，后续修改按影响范围决定验证深度：

```text
不影响治理主链的局部修改
→ 定向单元测试、回归测试、类型检查、构建和架构/契约对账

影响项目初始化、Impact、Architecture、Data、Module、Contract、Trace、Candidate、Gate、Merge、Code Permission、Audit、Verification 或 Close
→ 追加全新临时项目的首个 WI 端到端回归

影响真实 OpenCode、Agent 协作、daemon 生命周期、用户审批交互或安装后运行路径
→ 发布前追加真实环境验收

改变三个核心 Gate 的 severity、阻断条件、调用范围或绕过规则
→ 必须重新执行完整的 Phase 11 等价验收
```

已经进入最终 Hard 状态后，普通修改不得把任一核心 Gate 静默降级为 Soft；验证未通过时应阻止新版本发布，而不是降低治理强度。

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

开发过程中可以先完成检查、报告和定向测试能力；本能力最终完成时必须满足 `GATE-FINAL-001`，不得把中间状态作为业务项目的正式治理模式。

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

## Phase 11：最终 Hard 行为的真实新项目验收

Phase 11 是首次宣布本能力完成前的一次性产品验收阶段。候选实现此时必须已经把三个核心 Gate 全部设为 Hard，并在真实全新业务项目中使用实际 OpenCode + SpecForge 完整执行第一个正式 Requirement，验证：

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

同时验证：

```text
三个核心 Gate 的合法场景全部通过
三个核心 Gate 的非法场景全部真实阻断
任何 Gate 失败都不能 Merge 或发 Code Permission
Fast Path 不能绕过三个 Gate
旧项目兼容读取行为没有被破坏
```

首次完成后，不要求每次普通修改都重新创建长期真实业务项目；后续按 `PHASE-LIFE-001` 的影响触发规则执行相应级别的端到端或真实环境回归。

---

## Phase 12：最终 Hard Enforcement 固化与发布边界

确认 Phase 11 真实端到端验收和全部相关测试通过后，检查并固化：

```text
Gate 注册：三个核心 Gate 全部 hard
Workflow：所有适用流程和 Fast Path 必须调用三个 Gate
Runtime：任一失败都阻断 Merge、Code Permission 和状态推进
测试：severity、调用覆盖、合法通过和非法阻断全部有回归测试
```

Phase 12 是 SpecForge 产品完成和发布边界，不是业务项目内部的状态切换。完成后的业务项目从第一个 WI 开始即执行三个 Hard Gate，后续所有 WI 保持相同行为。

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
