# SpecForge 工程化总体方案 v0.2

> 状态：重写版 / 工程规格基线  
> 目标：这份文档不是愿景说明，而是后续可以拆成代码任务的产品级工程方案。  
> 核心标准：Agent 怎么调、模块怎么接、Gate 怎么判、失败怎么闭环、上下文怎么控、状态怎么恢复，都必须说清楚。

---

## 0. 方案修正说明

上一版方案不合格，主要问题有：

1. 只说明了 Agent 类型，没有说明 Agent 之间完整调用关系。
2. 只说明了渐进式 Tool / Skill / MCP 加载原则，没有说明谁负责、什么时候执行、怎么强制执行。
3. 只列了 Gate 名称，没有解释 Gate 是程序、Agent、工具还是规则，也没有说明执行后是 pass / fail / blocked 还是人工确认。
4. 只描述模块，没有描述模块之间的数据契约。
5. 只讲流程，没有把所有异常路径纳入状态机。
6. 只讲产品目标，没有证明它可以拆成可开发的代码模块。

本版方案按以下标准重写：

```text
1. 所有 Agent 必须有职责、输入、输出、权限、调用者、可调用对象。
2. 所有工作流必须有主路径、失败路径、恢复路径。
3. 所有 Gate 必须定义执行者、输入、输出、判断规则和阻断行为。
4. 所有 Tool / Skill / MCP 必须通过统一 Capability Broker 分发。
5. 所有状态变化必须落盘，不依赖聊天记忆。
6. 所有跨模块调用必须有契约。
7. 所有“必须做到”的事情必须用程序硬控，不靠 prompt。
```

---

## 1. 外部系统能力边界

SpecForge 不是重做 Kiro、Superpowers、OpenCode、ai_dev_os，而是吸收各自最有价值的机制。

### 1.1 Kiro 提供规格主链

Kiro Specs 的公开结构是：

```text
requirements.md 或 bugfix.md
design.md
tasks.md
```

其职责是把高层想法或缺陷分析转成设计和可追踪任务。SpecForge 继承这条主链。

SpecForge 使用 Kiro 思想，但不复制 Kiro IDE：

```text
需求 / 缺陷分析
  → 设计
  → 任务
  → 执行
  → 验证
```

### 1.2 Superpowers 提供全流程执行纪律

Superpowers 不能只在代码阶段介入。它的价值贯穿：

```text
brainstorming
writing-plans
subagent-driven-development
test-driven-development
systematic-debugging
verification-before-completion
code-review
finishing-branch
```

SpecForge 把 Superpowers 作为 Method Layer，不让它成为第二套主流程。

### 1.3 OpenCode 提供运行平台

OpenCode 提供：

```text
primary agents
subagents
commands
skills
custom tools
plugins
permissions
MCP servers
```

SpecForge 基于这些扩展点实现，不在 V1 修改 OpenCode 源码。

### 1.4 ai_dev_os 提供状态、自我提升、复盘思想

ai_dev_os 中有几类思想必须吸收：

```text
工作必须先路由
运行状态以文件为准
高风险操作必须 checkpoint
输出必须有契约
结果必须落盘
复盘提炼知识候选
全局知识合并不能静默覆盖
```

第一版不直接使用 `ai_dev_os/` 目录名，但吸收其思想。

---

## 2. 产品总目标

SpecForge 是运行在 OpenCode 上的规格驱动 AI 开发框架。

最终目标：

```text
让 AI 开发从“聊天驱动写代码”
变成
“意图识别 → 需求确认 → 设计约束 → 任务拆分 → 子 Agent 执行 → 验证 → 复盘 → 知识沉淀”的工程流程。
```

产品必须解决：

```text
1. AI 不知道规格文档边界。
2. AI 不会系统性帮助用户补全需求。
3. AI 会默认不明确问题。
4. 需求到设计到任务之间缺少追踪。
5. 设计阶段不充分了解环境约束。
6. task 粒度不稳定。
7. 测试体系不完整。
8. 主 Agent 被技术细节污染。
9. 子 Agent 失败后没有闭环。
10. 会话爆上下文后无法可靠继续。
11. 中断、断电后无法恢复。
12. 工具、Skill、MCP 加载失控。
13. token 成本过高。
14. 没有原始会话数据支撑复盘。
15. 需求变更无法影响分析。
16. 并行任务没有可判定依据。
```

---

## 3. 核心设计原则

### 3.1 主 Agent 是项目经理，不是程序员

主 Agent 只做：

```text
用户沟通
流程选择
状态推进
子 Agent 调度
风险升级
Gate 结果解释
人工确认请求
```

主 Agent 不做：

```text
直接写代码
直接调试技术细节
直接决定技术绕路方案
直接绕过失败重试规则
直接修改需求、设计、任务状态
```

### 3.2 子 Agent 是专业执行者

每个子 Agent 只处理一个专业问题：

```text
需求澄清
业务分析
设计
任务拆分
执行
调试
规格审查
代码审查
验证
复盘
```

子 Agent 不继承主会话上下文。子 Agent 只拿 Context Builder 给的最小上下文包。

### 3.3 程序硬控优先

以下内容不能靠 prompt：

```text
文档边界检查
Gate 通过与否
状态流转
权限控制
任务依赖
必需工具执行
验证证据
断点恢复
agent run 记录
trace matrix 完整性
```

### 3.4 全部事实落盘

聊天上下文不是事实来源。

权威事实来源：

```text
specforge/runtime/state.json
specforge/specs/<work_item_id>/
specforge/archive/agent_runs/
specforge/index/graph.sqlite
git diff / commit
test result
user_confirmations
```

### 3.5 完整记录，最小投喂

完整会话必须保存，但不能默认投喂给后续 Agent。

```text
archive = 原始复盘资料
runtime = 当前恢复资料
context_manifest = 当前任务最小投喂清单
graph = 结构化索引
```

---

## 4. 总体架构

```text
SpecForge
  ├── Orchestration Layer
  │   ├── sf-orchestrator
  │   ├── workflow engine
  │   ├── state machine
  │   ├── event bus
  │   └── gate runner
  │
  ├── Agent Layer
  │   ├── intent-router-agent
  │   ├── workflow-suggester-agent
  │   ├── requirements-agent
  │   ├── domain-analyst-agent
  │   ├── environment-agent
  │   ├── design-agent
  │   ├── test-architect-agent
  │   ├── task-planner-agent
  │   ├── executor-agent
  │   ├── debugger-agent
  │   ├── spec-reviewer-agent
  │   ├── code-reviewer-agent
  │   ├── verifier-agent
  │   ├── release-agent
  │   └── retro-agent
  │
  ├── Capability Layer
  │   ├── capability registry
  │   ├── capability broker
  │   ├── context builder
  │   ├── tool broker
  │   ├── skill broker
  │   └── mcp broker
  │
  ├── Spec Layer
  │   ├── intake protocol
  │   ├── requirements protocol
  │   ├── bugfix protocol
  │   ├── constraints protocol
  │   ├── design protocol
  │   ├── tasks protocol
  │   └── traceability protocol
  │
  ├── Control Layer
  │   ├── document lint
  │   ├── requirements gate
  │   ├── design gate
  │   ├── tasks gate
  │   ├── execution gate
  │   ├── review gate
  │   ├── verification gate
  │   └── close gate
  │
  ├── Knowledge Layer
  │   ├── graph builder
  │   ├── graph query
  │   ├── impact analyzer
  │   ├── failure pattern extractor
  │   └── knowledge candidate manager
  │
  └── Persistence Layer
      ├── runtime state
      ├── specs
      ├── sessions
      ├── archive
      ├── graph index
      ├── checkpoints
      └── logs
```

---

## 5. Agent 体系完整设计

### 5.1 Agent 分类

Agent 分三类：

```text
A. Primary Agent
   用户直接交互的主 Agent。

B. Workflow Subagents
   负责需求、设计、任务、验证等阶段性工作。

C. Technical Subagents
   负责代码实现、调试、审查、测试。
```

### 5.2 Agent 总表

| Agent | 类型 | 谁调用 | 主要职责 | 是否可改代码 | 是否可问用户 | 输出 |
|---|---|---|---|---|---|---|
| sf-orchestrator | primary | 用户 / OpenCode | 项目管理、流程推进、用户沟通 | 否 | 是 | workflow_decision / state_transition |
| sf-intent-router-agent | subagent | orchestrator | 判断用户意图、推荐流程 | 否 | 否 | intent_result.json |
| sf-workflow-suggester-agent | subagent | orchestrator | 回答后发现异常，建议流程 | 否 | 否 | workflow_suggestion.json |
| sf-requirements-agent | subagent | orchestrator | 需求澄清、需求边界分类 | 否 | 可通过 orchestrator 问 | requirements_draft.md / open_questions.md |
| sf-domain-analyst-agent | subagent | requirements-agent / orchestrator | 从业务、经济、人员、管理、运维等角度补需求 | 否 | 否 | domain_analysis.md |
| sf-environment-agent | subagent | design-agent / orchestrator | 收集软件、硬件、网络、数据库、部署约束 | 否 | 可通过 orchestrator 问 | environment.md / constraints.md |
| sf-design-agent | subagent | orchestrator | 设计架构、接口、数据、错误处理、测试策略 | 否 | 可通过 orchestrator 问 | design.md / design_blockers.md |
| sf-test-architect-agent | subagent | design-agent / task-planner | 设计测试策略和验证矩阵 | 否 | 否 | test_strategy.md |
| sf-task-planner-agent | subagent | orchestrator | 把 design 拆成 tasks，生成依赖和验证 | 否 | 否 | tasks.md / task_graph.json |
| sf-context-builder | tool/service | orchestrator / gate runner | 构造最小上下文包 | 否 | 否 | context_manifest.json |
| sf-executor-agent | subagent | orchestrator | 执行单个 task | 是，受限 | 否 | agent_run_result.json |
| sf-debugger-agent | subagent | failure controller | 处理技术失败 | 是，受限 | 否 | debug_result.json |
| sf-spec-reviewer-agent | subagent | orchestrator | 检查实现是否符合 spec | 否，默认只读 | 否 | spec_review.md |
| sf-code-reviewer-agent | subagent | orchestrator | 检查质量、安全、性能、可维护性 | 否，默认只读 | 否 | code_review.md |
| sf-verifier-agent | subagent | orchestrator | 执行测试、验收、冒烟、回归 | 否，默认只读，可运行命令 | 否 | verification_report.md |
| sf-release-agent | subagent | orchestrator | 发布说明、部署和回滚文档 | 否 | 否 | release_notes.md / rollback_plan.md |
| sf-retro-agent | subagent | orchestrator / close workflow | 复盘完整 archive，提炼失败模式 | 否 | 否 | retro.md / knowledge_candidates.md |

---

## 6. Agent 调用关系图

### 6.1 总调用关系

```text
用户
  ↓
sf-orchestrator
  ├── sf-intent-router-agent
  ├── sf-workflow-suggester-agent
  ├── sf-requirements-agent
  │     └── sf-domain-analyst-agent
  ├── sf-environment-agent
  ├── sf-design-agent
  │     ├── sf-environment-agent
  │     └── sf-test-architect-agent
  ├── sf-task-planner-agent
  │     └── sf-test-architect-agent
  ├── sf-context-builder
  ├── sf-executor-agent
  │     └── failure-controller
  │            ├── sf-debugger-agent
  │            ├── sf-spec-reviewer-agent
  │            └── sf-code-reviewer-agent
  ├── sf-verifier-agent
  ├── sf-release-agent
  └── sf-retro-agent
```

### 6.2 重要规则

```text
1. 用户只和 sf-orchestrator 直接交互。
2. 子 Agent 不直接问用户，必须通过 sf-orchestrator 形成结构化问题。
3. 子 Agent 之间原则上不直接聊天，必须通过文件和结构化结果传递。
4. 一个子 Agent 不能修改另一个子 Agent 的输出，只能提交 review 或 blocker。
5. 技术失败先在 technical subagents 内闭环，不能直接污染 orchestrator。
6. orchestrator 不阅读完整失败会话，只读 failure_summary 和 structured result。
```

---

## 7. 工作流类型与 Agent 调用闭环

### 7.1 Workflow 类型

SpecForge 支持以下工作流：

```text
question_answer
reactive_bugfix_suggestion
feature_spec
bugfix_spec
change_request
quick_change
refactor
ops_task
investigation
resume
retro
```

### 7.2 用户只是问问题

#### 场景

```text
用户：后台现在有多少个下载任务？
```

#### 流程

```text
用户输入
  ↓
orchestrator 调用 intent-router-agent
  ↓
intent = question_answer
  ↓
orchestrator 回答问题，必要时调用只读工具
  ↓
anomaly-detector 检查是否发现状态不一致
  ↓
如果没有异常：结束
  ↓
如果有异常：workflow-suggester-agent 生成建议
  ↓
orchestrator 回答用户并提示是否进入 bugfix / investigation
```

#### 输出契约

```json
{
  "intent": "question_answer",
  "answer": "...",
  "anomaly_detected": true,
  "suggested_workflow": "bugfix_spec",
  "needs_user_confirmation": true,
  "options": [
    "进入 bugfix 流程",
    "继续只排查，不改代码",
    "暂时不处理"
  ]
}
```

### 7.3 Feature Spec 工作流

```text
用户输入
  ↓
intent-router-agent: feature_spec
  ↓
orchestrator 创建 work_item
  ↓
requirements-agent 起草需求
  ├── domain-analyst-agent 补业务/成本/人员/管理/运维维度
  └── document-lint 检查需求边界
  ↓
requirements-gate
  ├── pass → 用户确认 baseline
  ├── fail → requirements-agent 修订
  └── blocked → orchestrator 问用户
  ↓
environment-agent 收集环境约束
  ↓
design-agent 生成 design.md
  ├── test-architect-agent 生成测试策略
  └── document-lint 检查设计边界
  ↓
design-gate
  ├── pass → 进入 tasks
  ├── fail → design-agent 修订
  └── blocked → orchestrator 问用户
  ↓
task-planner-agent 生成 tasks.md / task_graph.json
  ↓
tasks-gate
  ├── pass → 进入 development
  ├── fail → task-planner-agent 修订
  └── blocked → orchestrator 问用户
```

### 7.4 Bugfix Spec 工作流

```text
用户输入或 reactive suggestion
  ↓
intent-router-agent: bugfix_spec
  ↓
orchestrator 创建 bugfix work_item
  ↓
requirements-agent 生成 bugfix.md:
    current_behavior
    expected_behavior
    unchanged_behavior
    reproduction
    evidence
  ↓
bugfix-gate
  ├── pass → design
  ├── fail → 修订
  └── blocked → 问用户
  ↓
environment-agent / code exploration 只读定位约束
  ↓
design-agent 生成 fix design:
    root cause hypothesis
    fix approach
    regression strategy
  ↓
design-gate
  ↓
task-planner-agent 生成修复任务和回归测试任务
  ↓
tasks-gate
```

### 7.5 Change Request 工作流

```text
用户提出变更
  ↓
intent-router-agent: change_request
  ↓
impact-analyzer 查询 graph:
    affected requirements
    affected design items
    affected tasks
    affected tests
    affected files
  ↓
orchestrator 输出影响分析
  ↓
用户确认变更范围
  ↓
requirements-agent 更新 requirements_delta.md
  ↓
design-agent 更新 design_delta.md
  ↓
task-planner-agent 更新 tasks_delta.md
  ↓
gate runner 检查 trace 完整性
```

### 7.6 Quick Change 工作流

适用：

```text
文案
小样式
注释
低风险配置
不影响业务行为
不影响接口契约
不影响数据模型
```

流程：

```text
intent-router-agent: quick_change
  ↓
quick-change-gate 判断是否真的低风险
  ↓
context-builder 构造最小上下文
  ↓
executor-agent 执行
  ↓
verifier-agent 做最小验证
  ↓
result-log
```

如果 quick-change-gate 发现影响业务行为，自动升级 feature_spec 或 bugfix_spec。

### 7.7 Development / Task Execution 工作流

```text
orchestrator 选择下一个 ready task
  ↓
execution-gate 检查：
    dependencies completed
    task has verification_commands
    allowed_files defined
    risk accepted
    context_manifest created
  ↓
context-builder 生成上下文包
  ↓
capability-broker 生成 allowed tools/skills/mcp
  ↓
executor-agent 执行
  ↓
executor-agent 自检
  ↓
spec-reviewer-agent 审查是否符合 spec
  ↓
code-reviewer-agent 审查质量
  ↓
verifier-agent 执行验证
  ↓
verification-gate
  ├── pass → task completed
  ├── fail → failure-controller
  └── blocked → orchestrator 决策
```

### 7.8 Failure Controller 工作流

```text
agent_run failed
  ↓
failure-controller 读取 structured failure
  ↓
分类：
    implementation_failure
    test_failure
    environment_failure
    permission_failure
    context_missing
    design_conflict
    requirement_ambiguity
    tool_failure
    mcp_failure
    unknown
  ↓
如果是技术问题：
    debugger-agent 尝试解决
  ↓
debugger-agent 失败后：
    reviewer-agent 判定是否仍为技术问题
  ↓
如果仍可技术解决：
    允许有限重试
  ↓
如果触及需求/设计/环境/成本：
    升级给 orchestrator
  ↓
orchestrator 只向用户汇报决策问题，不参与技术细节调试
```

### 7.9 Resume 工作流

```text
用户重新打开项目 / 执行 /sf-resume / 检测到异常中断
  ↓
resume-check tool 读取：
    state.json
    checkpoints
    git status
    active_agent_run
    task status
  ↓
判断恢复点：
    before_task_start
    after_context_build
    after_file_edit
    after_test_failed
    after_test_passed
    before_review
    before_commit
  ↓
给出恢复方案：
    continue
    rerun verification
    rollback task
    mark blocked
    ask user
  ↓
orchestrator 向用户说明并执行
```

---

## 8. Agent 调用契约

所有 Agent 输入输出必须结构化。不能只返回自然语言。

### 8.1 通用 Agent Request

```json
{
  "run_id": "RUN-20260502-0001",
  "work_item_id": "WI-20260502-0001",
  "task_id": "T-003",
  "agent": "sf-executor-agent",
  "stage": "development",
  "objective": "实现验证码校验服务",
  "context_manifest_path": "specforge/archive/agent_runs/RUN-.../context_manifest.json",
  "constraints": {
    "allowed_files": [],
    "forbidden_files": [],
    "max_steps": 30,
    "max_retries": 1,
    "risk_level": "L2"
  },
  "required_outputs": [
    "result.json",
    "result.md",
    "tool_calls.jsonl",
    "files_changed.json"
  ]
}
```

### 8.2 通用 Agent Result

```json
{
  "run_id": "RUN-20260502-0001",
  "agent": "sf-executor-agent",
  "status": "completed | failed | blocked | needs_review | needs_user_decision",
  "summary": "...",
  "files_read": [],
  "files_modified": [],
  "tools_used": [],
  "skills_loaded": [],
  "mcp_used": [],
  "tests_run": [],
  "evidence": [],
  "failures": [
    {
      "type": "tool_failure",
      "command": "...",
      "error": "...",
      "attempted_fix": "...",
      "resolved": false
    }
  ],
  "open_questions": [],
  "needs_escalation": false,
  "escalation_reason": null
}
```

### 8.3 Orchestrator 只读取哪些字段

主 Agent 默认只读取：

```text
status
summary
files_modified
tests_run
evidence
failures[].type
needs_escalation
escalation_reason
open_questions
```

主 Agent 不默认读取：

```text
full_conversation.jsonl
stdout.log
stderr.log
完整技术尝试过程
```

除非进入 retro 或用户要求审计。

---

## 9. 渐进式 Tool / Skill / MCP 加载完整机制

### 9.1 核心问题

不是“按阶段加载”这么简单。实际要解决：

```text
1. 谁决定当前 Agent 能用哪些工具？
2. 谁决定当前 Agent 需要哪些 Skill？
3. 谁决定 MCP 是否暴露？
4. 必需工具如何强制执行？
5. 工具执行了是否等于 Gate 通过？
6. 工具失败如何处理？
7. 工具跨阶段复用如何管理？
```

### 9.2 三个核心组件

```text
Capability Registry
  静态注册所有 tool / skill / mcp 的元数据。

Capability Broker
  运行时根据 stage + agent + task + risk + policy 生成可用能力清单。

Gate Runner
  在状态机流转点强制执行必须工具，判断是否允许进入下一阶段。
```

### 9.3 Capability Registry

路径：

```text
specforge/registry/
  tools.json
  skills.json
  mcp.json
  capability_policies.json
```

工具注册示例：

```json
{
  "id": "sf_requirements_gate",
  "type": "tool",
  "description": "检查 requirements.md 是否满足进入 design 的最低条件",
  "stages": ["requirements"],
  "allowed_agents": ["sf-orchestrator", "sf-requirements-agent"],
  "required_before_transition": ["requirements_to_design"],
  "risk_level": "L1",
  "input_schema": "schemas/sf_requirements_gate.input.json",
  "output_schema": "schemas/gate_result.schema.json",
  "side_effect": "read_only",
  "cost_level": "low",
  "timeout_seconds": 30
}
```

Skill 注册示例：

```json
{
  "id": "superpowers-brainstorming",
  "type": "skill",
  "stages": ["intake", "requirements", "design"],
  "allowed_agents": ["sf-requirements-agent", "sf-domain-analyst-agent", "sf-design-agent"],
  "load_policy": "on_demand",
  "trigger_conditions": [
    "user_intent_ambiguous",
    "requirements_incomplete",
    "multiple_solution_paths"
  ],
  "cost_level": "medium"
}
```

MCP 注册示例：

```json
{
  "id": "database-readonly",
  "type": "mcp",
  "stages": ["investigation", "design", "verification"],
  "allowed_agents": ["sf-environment-agent", "sf-verifier-agent", "sf-debugger-agent"],
  "permission": "read_only",
  "risk_level": "L2",
  "requires_user_approval": false,
  "forbidden_operations": ["write", "delete", "migration"]
}
```

### 9.4 Capability Broker 谁来执行

Capability Broker 是程序模块，不是 Agent。

触发时机：

```text
1. 每次创建 agent_run 前。
2. 每次 stage transition 前。
3. 每次 task risk_level 变化后。
4. 每次用户批准/拒绝某权限后。
5. 每次 resume 后重新计算。
```

输入：

```json
{
  "stage": "development",
  "agent": "sf-executor-agent",
  "work_item_id": "WI-001",
  "task_id": "T-003",
  "risk_level": "L2",
  "workflow": "feature_spec",
  "project_policy": "specforge/config/project.json",
  "global_policy": "specforge/global/policy.json"
}
```

输出：

```json
{
  "allowed_tools": ["read", "grep", "edit", "bash_safe", "sf_task_update"],
  "required_tools": ["sf_result_log"],
  "allowed_skills": ["superpowers-tdd", "superpowers-verification"],
  "suggested_skills": ["superpowers-debugging"],
  "allowed_mcp": [],
  "blocked_capabilities": [
    {
      "id": "database-write",
      "reason": "task risk L2 does not allow database writes without approval"
    }
  ]
}
```

### 9.5 Context Builder 和 Capability Broker 的关系

```text
orchestrator
  ↓
context-builder 决定“给 Agent 什么信息”
  ↓
capability-broker 决定“Agent 能用什么能力”
  ↓
agent-runner 创建子 Agent run
```

二者不能混：

```text
Context Builder 管信息。
Capability Broker 管能力。
Gate Runner 管过关。
Permission Layer 管危险动作。
```

### 9.6 渐进式加载的执行过程

以执行 T-003 为例：

```text
1. orchestrator 选择 T-003。
2. execution-gate 检查任务是否 ready。
3. context-builder 查询 graph，生成最小上下文。
4. capability-broker 根据 executor-agent + T-003 + risk=L2 生成能力清单。
5. agent-runner 启动 executor-agent。
6. executor-agent 只看到：
   - mandatory context 全文
   - optional indexes
   - allowed capability list
7. 如果 executor-agent 需要某 Skill：
   - 调用 OpenCode skill tool 加载该 Skill
   - plugin 记录 skill.loaded event
8. 如果 executor-agent 需要 MCP：
   - 先请求 capability-broker
   - 如需用户确认，由 orchestrator 询问用户
   - 通过后临时开放
9. executor-agent 完成后输出 result。
10. gate-runner 检查 required_tools 是否执行。
11. 未执行则状态不能 completed。
```

### 9.7 “进入 design 前必须执行 sf_requirements_gate”是什么意思

`sf_requirements_gate` 不是 Agent，不是 prompt，也不是“执行了就通过”。

它是一个程序工具，输出 GateResult。

输入：

```json
{
  "work_item_id": "WI-001",
  "requirements_path": "specforge/specs/WI-001/requirements.md",
  "intake_path": "specforge/specs/WI-001/intake.md",
  "open_questions_path": "specforge/specs/WI-001/open_questions.md",
  "trace_path": "specforge/specs/WI-001/trace_matrix.md"
}
```

输出：

```json
{
  "gate": "requirements_gate",
  "status": "pass | fail | blocked",
  "blocking_issues": [],
  "warnings": [],
  "checks": [
    {
      "id": "REQ-ID-STABLE",
      "status": "pass",
      "message": "All requirements have stable IDs"
    },
    {
      "id": "REQ-NO-DESIGN-LEAK",
      "status": "fail",
      "message": "R-003 contains API route /api/login, which belongs to design"
    }
  ],
  "next_action": "revise_requirements | ask_user | continue_to_design"
}
```

判定：

```text
pass:
  允许 requirements → design

fail:
  不允许进入 design
  orchestrator 调用 requirements-agent 修订

blocked:
  不允许进入 design
  orchestrator 必须问用户
```

### 9.8 Gate 执行了不等于通过

明确规则：

```text
执行 Gate 只是产生 GateResult。
只有 GateResult.status = pass，状态机才允许流转。
```

如果有人手动改 state.json 试图跳过，sf_lifecycle plugin 在下一次事件中检查：

```text
current_stage = design
but requirements_gate_pass_event not found
→ state invalid
→ rollback to requirements
→ create violation event
```

### 9.9 必需工具如何确保执行

通过三层保证：

```text
1. State Machine
   transition 需要 required_gate_pass_event。

2. Event Log
   每个必需工具执行会写 events.jsonl。

3. Plugin Guard
   检测到非法状态流转时阻断或回滚。
```

事件示例：

```json
{
  "event_id": "EVT-001",
  "type": "gate.executed",
  "gate": "requirements_gate",
  "tool": "sf_requirements_gate",
  "status": "pass",
  "work_item_id": "WI-001",
  "timestamp": "2026-05-02T12:00:00Z"
}
```

---

## 10. Gate 系统完整定义

### 10.1 Gate 分类

```text
Intake Gate
Requirements Gate
Bugfix Gate
Environment Gate
Design Gate
Tasks Gate
Execution Gate
Review Gate
Verification Gate
Close Gate
Retro Gate
```

### 10.2 GateResult 通用 Schema

```json
{
  "gate": "string",
  "work_item_id": "string",
  "task_id": "string|null",
  "status": "pass|fail|blocked|warning_only",
  "blocking_issues": [
    {
      "id": "string",
      "severity": "L1|L2|L3",
      "message": "string",
      "owner": "agent|user|tool|environment",
      "recommended_action": "string"
    }
  ],
  "warnings": [],
  "checks": [],
  "evidence": [],
  "next_action": "string",
  "created_at": "datetime"
}
```

### 10.3 Gate 行为规则

```text
pass:
  状态机允许进入下一阶段。

fail:
  状态机不允许进入下一阶段。
  必须回到对应 Agent 修订。

blocked:
  状态机不允许进入下一阶段。
  必须由 orchestrator 请求用户或人工处理。

warning_only:
  允许进入下一阶段，但写入风险记录。
```

### 10.4 Requirements Gate 检查项

```text
REQ-001 每条需求有稳定 ID。
REQ-002 每条需求有确认状态。
REQ-003 每条需求是行为或约束，不是实现。
REQ-004 每条功能需求可测试。
REQ-005 非功能需求有指标或明确待确认。
REQ-006 没有 critical open question。
REQ-007 in scope / out of scope 明确。
REQ-008 设计内容被移入 design_hints.md。
REQ-009 任务内容被移入 task_hints.md。
REQ-010 用户已确认 baseline。
```

### 10.5 Design Gate 检查项

```text
DES-001 已存在 confirmed requirements 或 bugfix baseline。
DES-002 已存在 environment.md / constraints.md。
DES-003 每个 requirement 至少有一个 design item 覆盖。
DES-004 每个 design item 有来源 requirement 或 constraint。
DES-005 没有新增未确认需求。
DES-006 没有 task 级步骤污染。
DES-007 关键设计取舍已说明。
DES-008 测试策略已覆盖关键路径。
DES-009 blocker questions 已清零或转用户确认。
```

### 10.6 Tasks Gate 检查项

```text
TASK-001 每个 task 有稳定 ID。
TASK-002 每个 task 绑定 requirement/design。
TASK-003 每个 design item 至少被一个 task 覆盖。
TASK-004 task 粒度符合标准。
TASK-005 task 有依赖关系。
TASK-006 task 有 allowed_files / forbidden_files 或说明。
TASK-007 task 有 acceptance criteria。
TASK-008 task 有 verification_commands。
TASK-009 高风险 task 有 rollback_notes。
TASK-010 task_graph 无循环依赖。
```

### 10.7 Execution Gate 检查项

```text
EXE-001 当前 task 状态为 pending 或 failed_retryable。
EXE-002 依赖 task 均 completed。
EXE-003 context_manifest 已生成。
EXE-004 capability_policy 已生成。
EXE-005 风险权限已满足。
EXE-006 工作区干净或有明确 checkpoint。
EXE-007 任务未超过最大重试次数。
```

### 10.8 Verification Gate 检查项

```text
VER-001 所有 required verification_commands 已执行。
VER-002 测试结果已落盘。
VER-003 changed_files 已记录。
VER-004 spec-review 通过。
VER-005 code-review 通过或只有非阻塞问题。
VER-006 trace_matrix 已更新。
VER-007 result_ledger 已更新。
VER-008 regression test 满足 bugfix 要求。
```

---

## 11. 状态机完整设计

### 11.1 Work Item 状态

```text
created
triaged
requirements_drafting
requirements_blocked
requirements_confirmed
environment_collecting
design_drafting
design_blocked
design_confirmed
tasks_drafting
tasks_confirmed
development_ready
development_running
development_blocked
verification_running
verification_failed
verification_passed
review_running
review_failed
completed
closed
retro_running
retro_completed
cancelled
```

### 11.2 Task 状态

```text
pending
ready
running
failed_retryable
debugging
reviewing
verification_running
completed
blocked_need_user
blocked_need_design_change
blocked_environment
blocked_permission
cancelled
```

### 11.3 Agent Run 状态

```text
created
context_building
capability_resolving
dispatched
running
tool_running
waiting_permission
completed
failed
timeout
cancelled
archived
```

### 11.4 状态流转必须由 tool 完成

不能由 Agent 直接改 state.json。

必须调用：

```text
sf_state_transition
```

输入：

```json
{
  "entity_type": "work_item|task|agent_run",
  "entity_id": "T-003",
  "from": "running",
  "to": "completed",
  "reason": "verification_gate_passed",
  "evidence_event_id": "EVT-123"
}
```

如果没有合法 evidence_event_id，则拒绝。

---

## 12. Event Bus 设计

### 12.1 事件文件

```text
specforge/runtime/events.jsonl
```

### 12.2 事件类型

```text
user.input.received
intent.classified
workflow.suggested
workflow.confirmed
work_item.created
document.generated
document.linted
gate.executed
state.transitioned
context.built
capability.resolved
agent_run.created
agent_run.completed
agent_run.failed
tool.executed
skill.loaded
mcp.used
permission.requested
permission.granted
checkpoint.created
verification.executed
review.completed
graph.updated
retro.created
```

### 12.3 事件契约

```json
{
  "event_id": "EVT-20260502-0001",
  "type": "gate.executed",
  "work_item_id": "WI-001",
  "task_id": null,
  "agent_run_id": null,
  "actor": "sf_requirements_gate",
  "payload": {},
  "created_at": "datetime"
}
```

Event Bus 的作用：

```text
1. 让状态流转有证据。
2. 让断点恢复有依据。
3. 让复盘能追踪过程。
4. 让 Gate Runner 判断必需动作是否发生。
```

---

## 13. 断点恢复设计

### 13.1 Checkpoint 类型

```text
before_workflow_start
after_intent_classified
after_requirements_gate
after_design_gate
after_tasks_gate
before_task_start
after_context_build
after_file_edit
after_test_run
after_review
after_verification
before_state_transition
after_state_transition
```

### 13.2 Resume 判定流程

```text
1. 读取 state.json。
2. 读取最近 checkpoint。
3. 读取 events.jsonl 最后一条事件。
4. 读取 git status。
5. 读取 active agent_run。
6. 判断是否存在未归档 agent_run。
7. 判断是否存在未提交改动。
8. 判断是否存在 Gate 通过但状态未流转。
9. 给出恢复动作。
```

### 13.3 恢复动作类型

```text
continue_from_checkpoint
rerun_gate
rerun_verification
archive_failed_run
rollback_to_checkpoint
ask_user
mark_blocked
```

### 13.4 极端断电场景

如果断电发生在文件修改后、测试前：

```text
resume-check 检测 dirty_files
  ↓
读取 active_task
  ↓
确认 dirty_files 是否在 allowed_files 中
  ↓
如果是：
    rerun verification
  ↓
如果不是：
    mark violation
    ask user rollback or inspect
```

---

## 14. 上下文爆炸处理

### 14.1 原则

```text
压缩不能替代事实落盘。
摘要只能作为导航，不能作为唯一事实来源。
```

### 14.2 会话快到限制时

```text
context-monitor 检测 token budget
  ↓
触发 agent_run_summary
  ↓
写入：
    decisions.md
    open_questions.md
    latest_state.md
    failed_attempts.md
    next_action.md
  ↓
创建 checkpoint
  ↓
如果需要新会话：
    orchestrator 用 /sf-resume 读取文件恢复
```

### 14.3 新会话恢复上下文

新会话只加载：

```text
state.json
current_work_item.json
current_task.json
requirements/design/tasks 相关切片
trace_matrix 相关行
latest checkpoint
open_questions
decisions
failed_attempts summary
```

不加载完整 transcript。完整 transcript 用于 retro。

---

## 15. 文档边界控制

### 15.1 文档分类器

用户说的话先进入：

```text
intake.md
```

由 requirements-agent 分类：

```text
confirmed_requirement
candidate_requirement
design_hint
task_hint
constraint
open_question
out_of_scope
```

### 15.2 边界污染处理

如果用户在需求讨论中说：

```text
这个功能用 Redis 实现
```

不能写入正式 requirement。应写入：

```text
inbox/design_hints.md
```

并在 design 阶段处理。

如果用户在设计阶段说：

```text
先改 auth.py 再改 login.tsx
```

不能写入 design.md。应写入：

```text
inbox/task_hints.md
```

### 15.3 Document Lint

`sf_doc_lint` 是程序工具。

输入：

```json
{
  "document_type": "requirements|design|tasks|bugfix",
  "path": "..."
}
```

输出：

```json
{
  "status": "pass|fail|blocked",
  "violations": [
    {
      "rule": "REQ-NO-API-ROUTE",
      "line": 42,
      "message": "requirements.md contains API route /api/login",
      "suggested_target": "design_hints.md"
    }
  ]
}
```

---

## 16. 任务拆分标准

### 16.1 Spec Task 标准

一个 task 必须满足：

```text
1. 单个子 Agent 可在一个 agent_run 内完成。
2. 修改范围有限。
3. 可独立验证。
4. 有明确输入和输出。
5. 对应至少一个 design item。
6. 对应至少一个 requirement 或 bugfix behavior。
7. 失败后可回滚或隔离。
8. 不依赖隐藏上下文。
```

### 16.2 太大判定

```text
需要同时改多个无直接关系模块。
无法在一个上下文包中说明清楚。
没有单独验证方式。
完成后才能知道是否满足多个业务目标。
```

### 16.3 太小判定

```text
只是创建目录。
只是改变量名。
只是写一个 if。
只是单个文件中的机械步骤。
无法产生独立业务或技术价值。
```

### 16.4 Task Schema

```json
{
  "task_id": "T-003",
  "title": "实现验证码校验服务",
  "status": "pending",
  "risk_level": "L2",
  "dependencies": ["T-001", "T-002"],
  "linked_requirements": ["R-003"],
  "linked_design_items": ["D-SVC-002"],
  "allowed_files": [],
  "forbidden_files": [],
  "acceptance_criteria": [],
  "verification_commands": [],
  "rollback_notes": "",
  "parallel_group": "PG-001"
}
```

---

## 17. 技术失败闭环

### 17.1 失败分类

```text
implementation_failure
test_failure
environment_failure
permission_failure
context_missing
design_conflict
requirement_ambiguity
tool_failure
mcp_failure
timeout
unknown
```

### 17.2 重试策略

```text
同一错误，不允许无限试。
同一 command 连续 3 次相同输入失败，触发 doom_loop。
同一 task 最多：
  1 次 implementer retry
  1 次 debugger pass
  1 次 reviewer adjudication
超过后 blocked。
```

### 17.3 主 Agent 何时介入

只有以下情况：

```text
requirement_ambiguity
design_conflict
environment_unavailable
permission_required
cost_scope_tradeoff
high_risk_operation
```

主 Agent 介入方式：

```text
向用户说明：
1. 当前任务
2. 已经确认的事实
3. 子 Agent 尝试过什么类型的方法
4. 为什么无法继续
5. 需要用户做什么决策
```

不能把原始技术日志直接倒给用户，除非用户要求。

---

## 18. 知识图谱设计

### 18.1 谁生产

```text
1. spec parser
   从 requirements/design/tasks/trace 提取 R-D-T-Test。

2. code indexer
   从代码提取 file/API/test/db schema 等关系。

3. git diff parser
   从 task commit 提取 modified files。

4. test result parser
   从测试结果提取 test → pass/fail → requirement/task。

5. agent reporter
   从 agent_run_result.json 提取 tools/skills/failures/resolutions。

6. user confirmation recorder
   从用户确认提取 confirmed_by_user 边。
```

### 18.2 谁使用

```text
context-builder
impact-analyzer
task-planner-agent
parallel-scheduler
verifier-agent
debugger-agent
retro-agent
workflow-suggester-agent
```

### 18.3 怎么使用

Agent 不直接读全图。Agent 调用：

```text
sf_graph_query
```

查询目的必须明确：

```json
{
  "purpose": "build_context|impact_analysis|parallel_check|verification_select|debug_lookup",
  "work_item_id": "WI-001",
  "task_id": "T-003",
  "query": {}
}
```

返回最小子图：

```json
{
  "nodes": [],
  "edges": [],
  "summary": "...",
  "recommended_context": [],
  "confidence": 0.86
}
```

### 18.4 图谱数据质量

每条边必须有：

```text
source
confidence
created_at
validated_by
stale_after
```

来源优先级：

```text
user_confirmed > program_extracted > git/test evidence > agent_reported > agent_inferred
```

---

## 19. 并行任务设计

### 19.1 并行判定工具

```text
sf_parallel_check
```

输入：

```json
{
  "tasks": ["T-003", "T-004"],
  "graph_path": "specforge/index/graph.sqlite"
}
```

输出：

```json
{
  "can_parallel": false,
  "reason": "Both tasks modify the same API contract POST /api/login",
  "conflicts": [
    {
      "type": "api_contract_conflict",
      "resource": "POST /api/login"
    }
  ]
}
```

### 19.2 可并行条件

```text
没有任务依赖。
不修改同一文件。
不修改同一 API contract。
不修改同一数据库迁移。
不依赖同一个未完成设计决策。
测试环境可隔离。
合并顺序明确。
```

### 19.3 并行执行要求

```text
每个并行 task 使用独立 worktree 或 branch。
每个 task 独立 agent_run。
每个 task 独立验证。
合并前必须 rerun impacted regression tests。
```

---

## 20. 测试质量体系

### 20.1 测试类型

```text
static checks
unit tests
component tests
integration tests
contract tests
end-to-end tests
business scenario tests
regression tests
smoke tests
performance tests
security tests
data integrity tests
observability checks
deployment / rollback tests
```

### 20.2 测试选择

不要求每个 task 都跑所有测试。由 `sf_test_selector` 决定最小测试集。

输入：

```json
{
  "task_id": "T-003",
  "changed_files": [],
  "linked_requirements": [],
  "risk_level": "L2"
}
```

输出：

```json
{
  "required_tests": [
    "unit",
    "contract",
    "business_scenario"
  ],
  "commands": [],
  "reason": "Task modifies login validation and API contract"
}
```

### 20.3 硬规则

```text
没有验证命令，task 不能执行。
没有验证证据，task 不能 completed。
bugfix 没有 regression test，不能 close。
高风险 task 没有 rollback plan，不能执行。
```

---

## 21. 目录结构

```text
project-root/
  AGENTS.md
  opencode.json

  .opencode/
    commands/
      sf.md
      sf-init.md
      sf-resume.md
      sf-status.md
      sf-upgrade.md
      sf-uninstall.md

    agents/
      sf-orchestrator.md
      sf-intent-router.md
      sf-workflow-suggester.md
      sf-requirements.md
      sf-domain-analyst.md
      sf-environment.md
      sf-design.md
      sf-test-architect.md
      sf-task-planner.md
      sf-executor.md
      sf-debugger.md
      sf-spec-reviewer.md
      sf-code-reviewer.md
      sf-verifier.md
      sf-release.md
      sf-retro.md

    skills/
      spec-requirements/
      spec-bugfix/
      spec-design/
      spec-tasks/
      spec-change-impact/
      superpowers-brainstorming/
      superpowers-writing-plans/
      superpowers-tdd/
      superpowers-debugging/
      superpowers-subagent-development/
      superpowers-verification/
      superpowers-code-review/

    tools/
      sf_state_read.ts
      sf_state_transition.ts
      sf_context_build.ts
      sf_capability_resolve.ts
      sf_doc_lint.ts
      sf_requirements_gate.ts
      sf_design_gate.ts
      sf_tasks_gate.ts
      sf_execution_gate.ts
      sf_verification_gate.ts
      sf_trace_check.ts
      sf_task_update.ts
      sf_result_log.ts
      sf_graph_query.ts
      sf_graph_update.ts
      sf_parallel_check.ts
      sf_test_selector.ts
      sf_resume_check.ts

    plugins/
      sf_lifecycle.ts
      sf_guard.ts
      sf_logger.ts
      sf_checkpoint.ts
      sf_permission_guard.ts

  specforge/
    config/
      project.json
      risk_policy.json
      workflow_policy.json

    registry/
      agents.json
      tools.json
      skills.json
      mcp.json
      capability_policies.json

    schemas/
      agent_request.schema.json
      agent_result.schema.json
      gate_result.schema.json
      context_manifest.schema.json
      task.schema.json
      event.schema.json

    specs/
      <work_item_id>/
        spec.json
        intake.md
        requirements.md
        bugfix.md
        constraints.md
        environment.md
        design.md
        tasks.md
        task_graph.json
        trace_matrix.md
        test_strategy.md
        verification.md
        change_log.md
        open_questions.md
        user_confirmations.md
        inbox/
          design_hints.md
          task_hints.md

    runtime/
      state.json
      current_work_item.json
      current_task.json
      work_queue.json
      events.jsonl
      result_ledger.md
      checkpoints/

    sessions/
      <session_id>/
        session_summary.md
        decisions.md
        open_questions.md
        user_confirmations.md

    archive/
      agent_runs/
        <run_id>/
          request.json
          context_manifest.json
          capability_policy.json
          full_conversation.jsonl
          tool_calls.jsonl
          stdout.log
          stderr.log
          files_changed.json
          attempts.json
          result.json
          result.md

    index/
      graph.sqlite
      nodes.jsonl
      edges.jsonl

    templates/
      requirements.template.md
      bugfix.template.md
      constraints.template.md
      environment.template.md
      design.template.md
      tasks.template.md
      trace_matrix.template.md
      verification.template.md
      retro.template.md

    retro/
      <retro_id>/
        retro.md
        evidence.md
        knowledge_candidates.md
        status.json
```

---

## 22. 安装、升级、卸载

### 22.1 必须脚本化

```text
install.ps1
install.sh
upgrade.ps1
upgrade.sh
uninstall.ps1
uninstall.sh
```

### 22.2 安装动作

```text
1. 检查 OpenCode 是否存在。
2. 检查项目根目录。
3. 写入 .opencode/commands。
4. 写入 .opencode/agents。
5. 写入 .opencode/skills。
6. 写入 .opencode/tools。
7. 写入 .opencode/plugins。
8. 初始化 specforge/。
9. patch opencode.json。
10. patch AGENTS.md。
11. 生成 install_report.md。
```

### 22.3 升级规则

```text
不覆盖 specs。
不覆盖 runtime。
不覆盖 archive。
模板可升级但保留旧版本。
工具/插件升级前备份。
冲突生成 migration_report.md。
```

### 22.4 卸载规则

提供选项：

```text
1. 只卸载 OpenCode 扩展，保留 specforge 数据。
2. 卸载扩展并归档 specforge。
3. 完全删除 SpecForge 文件。
```

默认不删除用户项目数据。

---

## 23. V1 实现范围

### 23.1 V1 必须实现

```text
1. Agent 注册和调用契约。
2. Intent Router。
3. Workflow Suggester。
4. Feature / Bugfix 工作流。
5. Requirements / Design / Tasks 三层文档。
6. Document Lint。
7. Requirements / Design / Tasks / Execution / Verification Gates。
8. Context Builder。
9. Capability Registry + Broker。
10. Agent Run Archive。
11. State Machine。
12. Event Bus。
13. Checkpoint / Resume。
14. Task Execution + Debug failure loop。
15. Spec review + code review + verification。
16. Trace Matrix。
17. 基础 Knowledge Graph。
18. Install / Upgrade / Uninstall。
```

### 23.2 V1 不实现

```text
1. 不修改 OpenCode 源码。
2. 不做原生 UI。
3. 不做复杂图数据库。
4. 不做全局知识自动合并。
5. 不做长期后台守护进程。
6. 不做企业级权限系统。
```

---

## 24. 开发拆分建议

### Phase 1：基础运行骨架

```text
目录结构
schemas
state machine
event bus
agent registry
tool registry
install/uninstall
```

### Phase 2：规格工作流

```text
intent router
requirements workflow
bugfix workflow
document lint
requirements gate
design gate
tasks gate
trace matrix
```

### Phase 3：执行工作流

```text
context builder
capability broker
executor agent
debugger agent
reviewer agents
verifier agent
verification gate
archive
```

### Phase 4：恢复与可观测

```text
checkpoint
resume
events replay
agent_run audit
failure classification
```

### Phase 5：知识图谱

```text
graph schema
spec parser
git diff parser
test result parser
graph query
impact analyzer
parallel check
```

### Phase 6：质量和体验增强

```text
workflow suggester
test selector
cost budget
retro
knowledge candidates
upgrade migration
```

---

## 25. 自查：按本方案能否开发代码

### 25.1 是否有清晰模块边界

有。

```text
orchestrator 管流程
agent 管专业任务
tool 管硬检查
plugin 管监听和守卫
state machine 管流转
event bus 管证据
context builder 管信息
capability broker 管能力
gate runner 管准入
graph 管关系
archive 管复盘原始材料
```

### 25.2 是否有完整调用闭环

有。

每条主工作流都有：

```text
入口 → Agent → Tool/Gate → 状态流转 → 失败分支 → 用户确认点 → 落盘
```

### 25.3 是否有模块契约

有。

定义了：

```text
Agent Request
Agent Result
GateResult
Event
Task
Capability Policy
Context Manifest
```

### 25.4 是否仍有不确定点

有，但不是方案缺口，而是实现期需要调研的外部限制：

```text
1. OpenCode 插件事件是否能完全覆盖所需监听点。
2. OpenCode 当前版本对 subtask / subagent 的可编排程度。
3. OpenCode skills 权限控制在项目级和 agent 级的实际行为。
4. MCP 运行时动态授权是否需要额外 wrapper。
5. Windows PowerShell 下脚本安装细节。
```

这些属于实现验证，不影响整体架构。

### 25.5 当前方案是否能直接拆任务

可以。

最小开发顺序是：

```text
1. 建目录和 schema。
2. 实现 state/event 基础工具。
3. 实现 registry。
4. 实现 context/capability/gate。
5. 实现 requirements/design/tasks 文档工具。
6. 实现 agent 配置。
7. 实现执行与验证闭环。
8. 实现 archive/resume。
```

---

## 26. 结论

SpecForge 的正确工程定位是：

```text
OpenCode 上的规格驱动 AI 开发控制系统。
```

它不是一堆提示词，不是一堆模板，也不是简单的 Kiro/Superpowers/ai_dev_os 拼接。

它的关键机制是：

```text
1. Orchestrator 不写代码，只管流程。
2. 子 Agent 专业分工，独立上下文。
3. Context Builder 最小投喂。
4. Capability Broker 渐进式开放工具、Skill、MCP。
5. Gate Runner 程序硬控阶段流转。
6. Event Bus 和 State Machine 保证可恢复。
7. Archive 保存完整原始会话供复盘。
8. Knowledge Graph 管理关系、裁剪上下文、分析影响。
9. Verification Gate 保证没有证据不能完成。
10. Retro 从完整证据中提炼失败模式。
```

最重要的底线：

```text
凡是必须 100% 做到的事情，必须由程序、状态机、Gate、权限和日志控制。
凡是需要判断、发散、设计、实现的事情，可以由 Agent 完成。
凡是涉及业务范围、验收标准、重大取舍、高风险操作，必须由用户确认。
```

这份 v0.2 才能作为后续开发基线。
