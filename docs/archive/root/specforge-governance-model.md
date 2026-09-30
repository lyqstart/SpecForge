# SpecForge Governance Model：依据、承接、验证、融合

> 状态：v0.1 草案  
> 目的：统一 SpecForge 的 Agent MD、Workflow、产物、Gate 的职责模型，防止规则继续散乱叠加。  
> 适用范围：所有 Work Item、所有内置 workflow、所有 sf-* Agent / Skill / Gate。

---

## 1. 为什么需要这份模型

SpecForge 当前已经具备较完整的流程骨架：

```text
Intake → Classification → Impact Analysis → Candidate 准备 → Gate 检查 → User Decision → Merge → Post-Merge Verify → Implementation → Verification → Close
```

项目运行时也已经区分：

```text
.specforge/project/      项目级正式规格真相源
.specforge/work-items/   Work Item 事务目录
.specforge/runtime/      运行时状态与日志
```

当前主要问题不是“流程没有”，而是：

1. Agent MD 文件没有把每个角色作为高级专业人员应该如何工作写透；
2. Gate 检查偏机械，容易检查文件、报告、命令是否存在，而不是检查用户实际目标是否完成；
3. 规则散落在 Agent、Skill、Workflow、Tool、Gate、文档中，缺少统一的分层模型；
4. Agent 容易在缺乏依据时替用户做决策，或者把合理猜测写成事实；
5. 下游产物可能只覆盖上游的一部分要求，但没有显式暴露遗漏；
6. verification_report 可能用构建成功、文件存在、编译通过冒充用户结果完成。

本模型用四个词统一治理规则：

```text
依据 → 承接 → 验证 → 融合
```

以后新增规则、修改 Agent MD、修改 Gate，都必须回到这四个问题上。

---

## 2. 四问模型

每个 Agent、每个产物、每个 Gate 都必须回答四个问题。

### 2.1 依据：我凭什么这么判断？

所有结论必须有依据。依据可以来自用户、项目规格、代码观察、运行观察、环境观察、用户批准，或者从这些依据中推导。

没有依据时，Agent 只能：

```text
ask_user
investigate
mark_unknown
block
```

不得凭经验、喜好或猜测继续推进。

### 2.2 承接：我有没有接住上游责任？

下游不需要覆盖上游所有文字，但必须承接上游的责任项和约束项。

上游内容分三类：

| 类型 | 是否必须承接 | 说明 |
|---|---:|---|
| 责任项 | 必须 | 用户目标、Must 需求、设计决策、系统边界、必需证据、关闭阻断项 |
| 约束项 | 必须遵守 | 兼容性、安全、成本、不能引入的组件、必须复用的架构 |
| 背景/解释 | 不要求承接 | 只作为依据，不要求形成 task 或测试 |

核心规则：

```text
承接的是责任项和约束项，不是覆盖上游所有文本。
```

### 2.3 验证：证据能不能证明用户目标？

验证不能只证明“文件存在、编译通过、构建成功”。

证据必须能回答：

```text
用户要的结果是否真实发生？
最终落点是否可观察？
失败路径是否被处理？
证据等级是否匹配需求风险？
```

### 2.4 融合：本 WI 对项目长期规格有什么影响？

每个 WI 都必须说明自己对项目级真相源的影响。

它可能是：

```text
spec_change       修改正式需求
architecture      修改架构/关键设计决策
design_change     修改设计
trace_update      更新追踪关系
evidence_only     只追加验证证据
knowledge_only    只沉淀知识或故障经验
no_project_change 不改变项目级规格，但必须说明理由
```

不是每个 WI 都必须修改 `.specforge/project/`，但每个 WI 都必须说明为什么改或为什么不改。

---

## 3. 依据模型

### 3.1 依据类型

| 类型 | 含义 | 能否支撑关键决策 |
|---|---|---:|
| USER_EXPLICIT | 用户明确说过 | 是 |
| USER_APPROVED | 用户明确批准过 | 是 |
| PROJECT_SPEC | 项目级规格已有 | 是 |
| PROJECT_RULE | 项目规则已有 | 是 |
| CODE_OBSERVED | 代码实际扫描证明 | 是 |
| RUNTIME_OBSERVED | 运行结果证明 | 是 |
| ENV_OBSERVED | 环境探测证明 | 是 |
| DERIVED | 从强依据推导 | 有条件 |
| INDUSTRY_DEFAULT | 行业默认/最佳实践 | 只支持低风险默认 |
| UNKNOWN | 未知 | 否 |
| ASSUMPTION | 假设 | 否 |

### 3.2 依据使用规则

1. `UNKNOWN` 和 `ASSUMPTION` 不能支撑 Must 需求、关键设计决策、实现范围、关闭条件；
2. `DERIVED` 必须写明 `derived_from` 和推导理由；
3. `INDUSTRY_DEFAULT` 只能用于低风险默认，不能覆盖用户目标；
4. 涉及成本、安全、数据归属、外部服务、不可逆架构、用户体验取舍时，必须用户确认；
5. 如果当前依据不足，Agent 必须阻断或调查，不能替用户决定。

---

## 4. 承接模型

### 4.1 责任项定义

以下内容属于上游责任项，下游必须承接或明确阻断：

```text
用户结果
Must Requirement
Non-functional Requirement
Design Decision
System Boundary
Data Flow
External Dependency
Required Evidence
Close Blocker
Safety / Security / Compliance Constraint
```

以下内容不要求逐项承接：

```text
背景说明
术语解释
设计理由文字
备选方案说明
示例
非约束性建议
```

### 4.2 承接状态

| 状态 | 含义 |
|---|---|
| covered | 已由下游明确处理 |
| covered_by_constraint | 作为约束被遵守，不单独形成任务 |
| covered_by_integration | 多个任务共同覆盖，并由集成验证收口 |
| inherited | 已由现有项目规格或代码覆盖，必须有证据 |
| deferred | 延后处理，必须有用户批准或 workflow 允许 |
| blocked | 因未知项阻塞，不能假装覆盖 |
| not_applicable | 不适用，必须说明理由 |
| uncovered | 未覆盖，Gate 必须失败 |

### 4.3 架构图如何承接

架构图本身不整体作为一个覆盖对象。

必须从架构图中提取：

```text
组件
边界
数据流
外部依赖
存储落点
失败路径
验证钩子
```

下游 task 覆盖这些责任项，而不是笼统写“按架构图实现”。

---

## 5. 验证模型

### 5.1 证据等级

| 等级 | 含义 | 示例 |
|---|---|---|
| L1_FILE | 文件存在 | 创建 Logger.ts |
| L2_BUILD | 编译/构建通过 | tsc pass、APK build success |
| L3_UNIT | 单元行为验证 | Logger.flush 调用 transport 的测试 |
| L4_INTEGRATION | 集成链路验证 | App 调用后端接口成功 |
| L5_E2E | 用户结果或最终落点可观察 | 服务器日志文件中看到本次 sessionId |

### 5.2 验证规则

1. 涉及远程、服务器、上传、同步、数据库、部署、用户可见结果的 Must 需求，不能只用 L1/L2 证据关闭；
2. 涉及“最终保存到某处”的需求，必须有 L5 证据；
3. verification_report 不能自己写 PASS，必须基于 required evidence 计算；
4. 构建成功不能证明用户目标完成；
5. 证据必须声明支持哪些 OUT/REQ/DD/TASK。

---

## 6. 融合模型

### 6.1 Work Item 不是孤岛

Work Item 目录保存过程材料；项目级目录保存长期真相。

```text
.specforge/work-items/<WI-ID>/   过程、候选、验证、审计
.specforge/project/              正式需求、设计、架构、决策、追踪
```

### 6.2 每个 WI 必须声明项目影响

每个 WI 的 `merge_report.md` 或等价结构必须说明：

```text
requirements_changed: yes/no
design_changed: yes/no
architecture_changed: yes/no
trace_updated: yes/no
decision_appended: yes/no
evidence_summary_appended: yes/no
no_project_change_reason: ...
```

如果 WI 不改变项目级规格，必须说明理由。

### 6.3 不同类型 WI 的融合方式

| WI 类型 | 融合要求 |
|---|---|
| feature / requirement_change | 通常更新 requirements/design/trace |
| design_change / architecture_change | 更新 design/architecture/decisions/trace |
| bugfix / code_only | 绑定已有 REQ/BUG，追加 evidence，必要时追加 decision |
| ops / investigation | 沉淀 environment observation、runbook、knowledge 或 decision |
| refactor | 绑定不改变行为的依据，更新 design/decision 或说明不改规格原因 |

---

## 7. Agent 角色分工

### 7.1 sf-orchestrator

定位：流程编排者、用户接口、状态守门人。

负责：

```text
创建/恢复 WI
选择 workflow
调度子 Agent
调用 gate
记录用户决策
管理 merge
gate blocked 时停止推进并报告用户
```

不负责：

```text
不写 requirements/design/tasks
不替用户做内容决策
不绕过 gate
不把未知项清空
不做语义审计本身
```

### 7.2 sf-intake / sf-intake-analyst

定位：把用户自然语言转成事实、目标、未知项、决策边界。

必须输出：

```text
explicit_facts
user_outcomes
unknowns
decision_boundaries
must_not_assume
ask_user / investigate / block 建议
```

### 7.3 sf-requirements

定位：把用户目标转成可验收需求，不做技术设计。

必须做到：

```text
承接 intake 的用户结果
每个 Must REQ 有 basis
每个 Must REQ 有 required evidence
每个 Must REQ 有 not_done_when
不得把用户核心目标写入 out_of_scope
```

### 7.4 sf-investigator

定位：调查当前事实。

负责输出：

```text
相关代码当前怎么实现
现有接口是否存在
现有架构怎么运行
现有测试怎么跑
哪些事实已观察
哪些仍未知
```

### 7.5 sf-design

定位：基于需求和当前事实做技术设计。

必须做到：

```text
先理解现有架构和相关代码
每个设计决策引用依据
每个 Must REQ 被设计承接
跨系统边界明确接口、鉴权、存储、失败、验证方式
未知外部依赖不能写成事实
新组件必须说明为什么不能复用旧组件
```

### 7.6 sf-task-planner

定位：把设计拆成 executor 可执行、verifier 可验证的任务。

必须做到：

```text
检查 design 是否基于当前实现
承接每个设计责任项
任务落到具体模块/文件/接口/数据流
每个 task 有 context_block
每个 task 有 done_when_code / done_when_behavior / done_when_evidence
必须有 integration closure task
如果缺 current implementation context，必须 blocked
```

### 7.7 sf-executor

定位：完成单个 task，不声明 WI 完成。

必须做到：

```text
先读 task context
再读相关现有代码
确认当前代码和 task 描述一致
不一致则 blocked
最小改动
执行真实验证命令
报告 code / behavior / evidence 完成情况
```

### 7.8 sf-reviewer

定位：规格符合性和依据一致性审查。

重点检查：

```text
是否只搭框架
是否没接线
是否 silent failure
是否 mock 冒充真实实现
是否核心需求被 out_of_scope
是否新增复杂方案但无依据
是否漏掉集成点
```

### 7.9 sf-verifier

定位：验证用户目标是否真实实现。

必须做到：

```text
逐项检查 required evidence
判断证据等级是否足够
判断证据是否支持 OUT/REQ/DD/TASK
缺证据时返回 blocked/fail
不得用 build success 冒充用户结果完成
```

### 7.10 sf-debugger / sf-knowledge

Debugger 不能只修代码，还要分类问题来源：

```text
requirements defect
design defect
task planning defect
implementation defect
verification defect
gate defect
basis defect
```

Knowledge 负责把事故沉淀为通用规则，不写项目特例。

---

## 8. 产物职责

### 8.1 intake.md

记录用户目标、事实、未知项、决策边界。不能提前设计。

### 8.2 requirements.md / requirements_delta.md

记录可验收需求。不能选择技术实现。

### 8.3 design.md / design_delta.md

记录技术决策、系统边界、数据流、失败处理、验证钩子。

### 8.4 tasks.md

记录可执行任务。每个 task 必须让 executor 不靠猜就能执行。

### 8.5 trace_delta.md

记录上游责任项如何流向下游产物。不是简单文件清单。

### 8.6 evidence_manifest.json

记录真实证据。每条证据必须说明支持什么。

### 8.7 verification_report.md

汇总验证结果。结论必须来自证据，不是自由声明。

### 8.8 merge_report.md

记录 candidate 如何进入项目级真相源，以及本 WI 对项目级规格的影响。

---

## 9. Gate 分工

程序 Gate 不替 Agent 思考，但必须检查结构性缺口。

### 9.1 requirements gate

检查：

```text
Must REQ 是否有 basis
Must REQ 是否有 required evidence
intake outcome 是否被承接
核心目标是否被错误 out_of_scope
```

### 9.2 design gate

检查：

```text
Must REQ 是否有设计承接
设计决策是否有依据
跨系统边界是否明确
外部依赖 unknown 是否被当成 fact
```

### 9.3 task gate

检查：

```text
设计责任项是否有 task
task 是否有 context_block
task 是否有 behavior/evidence done_when
是否有 integration closure task
```

### 9.4 verification gate

检查：

```text
required evidence 是否存在
证据等级是否足够
证据是否支持对应 OUT/REQ/TASK
是否只用 L1/L2 冒充完成
```

### 9.5 close gate

检查：

```text
没有 unresolved blocking unknown
没有 uncovered Must
没有 missing required evidence
没有 framework-only delivery
没有 project integration effect 缺失
```

---

## 10. WI-0028 负向样本

用户目标：

```text
App 日志保存在本地和 lg 服务器。
```

错误实现：

```text
创建 Logger.ts
创建 LogPersistence.ts
APK 构建成功
Logger.flush 未接通
后端 /logs/batch 不存在
服务器无日志落盘
```

按照本模型，应被拦截：

```text
intake：识别服务器保存和后端接口 unknown
requirements：必须生成服务器保存日志的 Must REQ
design：必须设计 App→Backend→Server File 边界
tasks：必须生成后端接口、服务器落盘、端到端验证 task
verification：必须要求 L5 服务器落盘证据
close_gate：无 L5 证据，禁止 close
```

---

## 11. 落地顺序

### Package 1：治理模型文档

新增本文件，先统一规则语言。

### Package 2：Agent MD 融合

基于原 md 完整融合，不追加尾巴，不缩写覆盖。

### Package 3：Workflow / Schema

把依据、承接、验证、融合加入 workflow 产物要求。

### Package 4：Gate 代码

让程序 Gate 检查结构性缺口，而不是只检查文件存在。

### Package 5：回归测试

用 WI-0028 负向场景证明旧错误会被拦截。

---

## 12. 最小原则

以后所有治理规则都必须能归入以下四问之一：

```text
依据：我凭什么这么判断？
承接：我有没有接住上游责任？
验证：证据能不能证明用户目标？
融合：本 WI 对项目长期规格有什么影响？
```

不能归入这四问的规则，不进入核心治理模型。
