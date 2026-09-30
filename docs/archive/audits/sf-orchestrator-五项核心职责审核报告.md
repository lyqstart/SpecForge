# sf-orchestrator 五项核心职责审核报告

## 一、审核基线与范围

本报告以提交 `e900f3923df58250deda95299c116d2f1369e0a5` 为唯一基线，审核对象包括：

```text
Standard
→ sf-orchestrator Contract
→ 其他 Agent Contract
→ Workflow Skill
→ Tool Schema / Tool Registry
→ Runtime / StateManager
→ HardStop / Write Guard
→ Candidate / Gate / Merge
→ Code Permission / Audit
→ Verification / Semantic Closure / Close Gate
→ 相关测试
```

审核遵循两项强制区分：

1. **当前代码已经强制实现的能力**；
2. **sf-orchestrator 必须遵守、但 Runtime 尚未自动强制的契约责任**。

两者不得混写为同一事实。

## 二、总裁决

`e900f39` 已经完成以五项核心职责为主体的中文 Orchestrator 契约重构，不需要再次推倒重写。本次闭包修正保留其整体结构，只处理已经证实的跨层不一致和 Runtime 保护空隙。

本次完成后可作出以下裁决：

| 层面 | 裁决 |
|---|---|
| Orchestrator 五职责契约结构 | 已形成有机整体 |
| Standard 与 Orchestrator 关键口径 | 已对齐纯咨询、状态权威、连续性和兼容初始化边界 |
| 用户决策生命周期 | 已修正 `user_approved`、`auto_approved`、`waived`、`rejected`、`invalidated` 的内部冲突 |
| Work Item 级 HardStop | 单一或显式 WI 场景已强制；多活动 WI 歧义场景新增失败关闭 |
| Project 级 HardStop | 新增无 WI 上下文时的强制检查 |
| 路由语义、Agent 所有权、用户沟通 | 契约已明确，但仍主要依赖 Orchestrator 履约，不伪称 Runtime 已自动判断 |
| 完整仓库级测试 | 当前交付环境未执行，需在用户完整仓库中运行 |

本次没有新增 Tool、Workflow Skill、Agent、Router、状态权威或平行治理层。

## 三、五项核心职责逐项审核

### 1. 建立和维护治理上下文

#### 已覆盖

- 在项目初始化前先识别纯咨询、只读状态查询和 SpecForge 使用说明；这类请求不调用 `sf_project_init`，不创建业务 WI，也不得执行项目写入。
- 进入项目治理后区分：
  - `.specforge/manifest.json`：当前 Runtime 的兼容初始化标记；
  - `.specforge/project/spec_manifest.json`：正式项目规格与模块归属清单。
- 使用 `sf_state_read(work_item_id="all")` 读取状态权威。
- 恢复时核对活动 WI、持久化 Agent Run 证据、候选产物、Gate、HardStop、用户决策、代码权限、Audit、依赖和当前用户意图。
- 多个活动 WI 时必须先明确目标 `work_item_id`；工作项范围内的调用不得依赖歧义推断。
- 使用 `sf_continuity` 保存和恢复连续性快照；`resume_check`、`resume_plan` 仅是快照内容，不是假定存在的独立 Tool。

#### Runtime 已强制

- `StateManager/events.jsonl` 是状态权威，`runtime/state.json` 是投影。
- HardStop 文件和 Dispatcher 共同控制被阻断调用。
- 本次新增：多个活动 WI 且至少一个存在未解除 Work Item HardStop 时，未携带 `work_item_id` 的写入或治理推进调用失败关闭。
- 本次新增：Project HardStop 在无法解析 WI 时仍然生效。

#### 仍属契约责任

- 判断当前请求是否真的是纯咨询。
- 判断新目标与活动 WI 是继续、补充、修改、独立目标、重新路由还是替代关系。
- 判断 Agent Run 证据是否充分。

#### 裁决

**覆盖完整，Runtime 封口增强；语义关系判断仍由 Orchestrator 负责。**

### 2. 判断请求进入哪条治理流程

#### 已覆盖

当前契约只把真实存在的八组 `workflow_type → workflow_path → Workflow Skill` 作为可执行主路由：

| `workflow_type` | `workflow_path` | Workflow Skill |
|---|---|---|
| `feature_spec` | `requirement_change_path` | `sf-workflow-feature-spec` |
| `bugfix_spec` | `requirement_change_path` | `sf-workflow-bugfix-spec` |
| `change_request` | `requirement_change_path` | `sf-workflow-change-request` |
| `investigation` | `requirement_change_path` | `sf-workflow-investigation` |
| `feature_spec_design_first` | `design_change_path` | `sf-workflow-design-first` |
| `refactor` | `task_change_path` | `sf-workflow-refactor` |
| `ops_task` | `task_change_path` | `sf-workflow-ops-task` |
| `quick_change` | `code_only_fast_path` | `sf-workflow-quick-change` |

契约明确：`architecture_change_path`、`spec_migration_path`、`rollback_path` 虽存在底层枚举，但当前没有完整用户级工作流身份和 Skill 映射，不得伪装为已具备可执行闭环。

#### Runtime 已强制

- `workflow_type` 枚举合法性。
- `workflow_type` 与 `workflow_path` 的已登记配对关系。
- 非法状态推进失败关闭。

#### 仍属契约责任

- 用户语义是否真的属于某一工作流。
- `quick_change` 是否被错误降级使用。
- `unknowns` 是否真实、完整。
- `analysis_scope` 和 `capability_verdict` 是否有足够证据。

#### 裁决

**路由表与当前 Runtime 对齐；语义路由仍是 Orchestrator 的专业治理责任。**

### 3. 调度正确角色并保证阶段连续

#### 已覆盖

当前契约覆盖以下专业角色：

- `sf-requirements`
- `sf-design`
- `sf-task-planner`
- `sf-investigator`
- `sf-executor`
- `sf-debugger`
- `sf-reviewer`
- `sf-verifier`
- `sf-evidence-collector`
- `sf-extension`
- `sf-knowledge`

契约要求每次交接至少携带：权威状态、上游事实、工作范围、责任项、预期产物、必要证据、禁止动作和结构化返回结果。

本次进一步明确：

- `sf-evidence-collector` 负责跨来源、可复核、可持久化的证据归集；
- 需求、设计、诊断、审查和验证结论仍由对应专业 Agent 作出；
- 专业 Agent 不得自行启动下一 Agent，不得自行执行审批、Merge、权限、封口或 Close。

#### Runtime 已强制

- 受控 Tool、状态、权限、Gate、Merge、Audit 和 Close 的执行边界。

#### 仍属契约责任

- 某个专业产物是否确由正确 Agent 生成。
- Agent 上下文交接是否完整。
- 何时调度 Reviewer、Evidence Collector、Debugger 或 Extension。

#### 裁决

**专业职责矩阵和交接规则完整；Runtime 尚不自动证明 Agent 产物所有权。**

### 4. 守住治理边界和停止条件

#### 已覆盖

契约形成以下连续主链：

```text
Candidate
→ Candidate Gate
→ User Decision
→ Merge
→ Post-Merge Gate
→ Code Permission
→ Implementation
→ Changed Files Audit
→ Reviewer（按需）
→ Verifier
→ Verification Gate
→ Semantic Closure
→ Revoke Permission
→ Close Gate
```

同时覆盖：

- Candidate 缺陷与 Tool、Contract、Runtime、Path、Gate、Audit 缺陷分流；
- 用户决定记录、失效和重新审批；
- Executor 一次有边界修复、重复失败升级 Debugger、仍失败进入 `blocked`；
- Design-Only 的 `no_code_change` Audit；
- HardStop 后绝对停止写入和状态推进；
- Orchestrator 不直接修改 `.specforge/project/**`；
- `closed` 只能由 `sf_close_gate` 写入。

#### 本次修正

1. **用户决策生命周期**
   - `user_approved` 必须有用户明确决定和 `user_response_quote`；
   - `auto_approved` 仅允许当前有效策略授权并记录 `auto_approval_policy_id`；
   - `waived` 必须有规则或用户授权依据；
   - `rejected`、要求修改、决定失效必须如实记录；
   - Candidate、范围、基础规格版本或适用条件变化时，旧决定必须 `invalidated`。

2. **多活动 WI HardStop**
   - 未显式指定 `work_item_id` 且多个活动 WI 中存在未解除 HardStop 时，Dispatcher 返回 `HARD_STOP_CONTEXT_AMBIGUOUS`，Handler 不执行。
   - 显式指定未被阻断的另一 WI 时，Work Item 级 HardStop 不错误扩大为项目级阻断。

3. **Project HardStop**
   - `checkHardStop` 先检查 Project scope，再校验 WI；因此没有 WI 上下文时，Project HardStop 仍会阻断非白名单 Tool。

#### 裁决

**治理主链完整；已证实的 HardStop Runtime 空隙已做最小封口。**

### 5. 用户沟通和流程连续性

#### 已覆盖

关键节点应向用户说明：

- 当前 WI 和权威状态；
- 路由依据、`unknowns`、classification、`capability_verdict`；
- 已完成和等待阶段；
- Candidate、Gate、HardStop、Audit 和实际文件变化；
- 当前需要的用户决定；
- 下一项合法动作。

新目标必须判断为当前 WI 的补充、正式变更、独立 WI、重新路由或替代关系。会话恢复必须依据持久化状态和产物，不得依赖对话印象。

#### Runtime 已强制

Runtime 只能提供状态和执行事实，不能自动强制 Orchestrator 向用户完整报告。

#### 仍属契约责任

- 是否如实解释路由依据；
- 是否披露未解决 HardStop、Gate 或 Audit 失败；
- 是否正确区分局部完成与整个 WI `closed`。

#### 裁决

**契约覆盖完整，但该职责天然主要依赖 Orchestrator 履约和行为级验收。**

## 四、职责越界审核

本次契约未把以下职责错误交给 Orchestrator：

- 不代替 `sf-requirements` 编写需求判断；
- 不代替 `sf-design` 作系统设计和治理能力裁决；
- 不代替 `sf-executor` 修改业务代码；
- 不代替 `sf-verifier` 形成验证结论；
- 不代替 Gate、Merge、Audit、Semantic Closure、Close Tool 写权威结果；
- 不直接编辑状态、HardStop、用户决定或 `.specforge/project/**`；
- 不手工拼装 Runtime 应负责规范化的 Candidate Manifest。

## 五、当前代码已实现与契约要求的边界

### 当前代码已强制实现

- 状态机合法迁移和状态权威；
- Candidate 受控写入和路径规范化；
- Gate、Merge、Code Permission、Changed Files Audit、Semantic Closure、Close 的主要封口动作；
- HardStop 白名单与 Work Item／Project scope 检查；
- 本次新增的多活动 WI HardStop 歧义失败关闭；
- 本次新增的无 WI 上下文 Project HardStop。

### 契约已要求但 Runtime 未自动强制

- 纯咨询的语义识别；
- 新目标与既有 WI 的关系判断；
- 工作流语义选择是否正确；
- 专业 Agent 的真实产物所有权；
- `unknowns`、classification、`capability_verdict` 的证据充分性；
- 用户沟通是否完整；
- Agent Run 证据是否可由现有公开读取能力完整恢复。

## 六、剩余治理债务

1. 当前未确认存在可统一读取、可复核 Agent Run 证据的公开权威 Tool；契约已经规定证据不足时不得猜测，应进入 `blocked`。
2. `architecture_change_path`、`spec_migration_path`、`rollback_path` 仍不是完整用户级工作流闭环。
3. 纯咨询、语义路由、Agent 所有权和用户沟通仍需要真实 Orchestrator 端到端场景验收；静态契约测试不能替代行为证明。
4. 本交付环境没有完整仓库和 Bun 运行时，未执行全仓 `bun test`、`lint`、`build`；必须在用户完整仓库中最终验收。

## 七、最终结论

本次不是再次重写 Orchestrator，而是在 `e900f39` 已形成的五职责主体上完成最小闭包：

```text
Standard 关键口径对齐
→ Contract 决策与恢复边界修正
→ Runtime HardStop 歧义封口
→ 契约与运行测试补强
```

在用户完整仓库通过规定测试后，可以将本轮裁决为：

> **sf-orchestrator 五项核心职责契约已闭合，已证实的 HardStop Runtime 漏洞已修复；语义路由、Agent 所有权和用户沟通仍按其性质保留为契约履约责任，不虚构为 Runtime 自动能力。**
