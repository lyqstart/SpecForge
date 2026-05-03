# SpecForge 工程化总体方案 v0.3

> 状态：重写增强版 / 可开发基线  
> 目的：把前期讨论沉淀为一份可以继续拆需求、做设计、拆任务、写代码、验收的工程方案。  
> 本版重点补齐：项目背景、Superpowers 落地方式、Agent 文件体系、日志与调试、子 Agent 调用深度限制、Superpowers 工作流约束、上下文限制检测。

---

## 0. 本版为什么重写

v0.2 仍然不合格，原因不是方向错，而是工程落地不够完整：

1. 缺少项目产生背景，无法说明为什么要做 SpecForge。
2. 没有说清楚 Superpowers 是直接安装、重写、还是适配融合。
3. 没有说清楚每个子 Agent 是否有独立指导文件。
4. 没有系统设计日志、调试、审计、复盘数据如何记录。
5. 没有限制 subagent 调用层级，容易形成 Agent 递归调用和闭环死循环。
6. 工作流里没有明确 Superpowers 在每个阶段的强制约束。
7. 没有回答如何发现会话快到上下文限制。
8. 虽然有模块名，但一些模块仍缺少运行时契约。

v0.3 的标准：

```text
不是写愿景。
不是写提示词清单。
不是画概念架构。
而是写一份能继续拆成代码任务的工程化方案。
```

---

## 1. 项目背景

### 1.1 用户当前的 AI 开发痛点

在使用 AI 开发工具时，常见问题并不是“AI 不会写代码”，而是开发过程缺少工程控制。

典型问题包括：

```text
1. 规格文件边界失控
   与 AI 讨论 requirements.md 时，AI 会把设计、接口、数据库、实现方案写进需求文档。

2. 需求讨论不充分
   用户的想法通常不完整，AI 如果只机械整理，就会遗漏业务、成本、人员、管理、运维、合规、扩展、部署等维度。

3. AI 默认假设
   遇到不清楚的问题，AI 常常自行假设，而不是向用户确认。

4. 需求到设计推导不严谨
   design.md 不一定覆盖所有 requirements；有时还会新增用户没有确认过的需求。

5. 设计脱离用户环境
   AI 不充分了解软件、硬件、数据库、网络、部署环境、使用规模、团队能力、成本约束，就开始做架构设计。

6. 任务拆分不可控
   task 太大，大模型一次做不完；task 太小，管理成本高，token 浪费严重。

7. 测试体系不足
   单元测试不够。还需要集成测试、契约测试、端到端测试、业务流程测试、回归测试、冒烟测试、安全测试、性能测试、数据完整性测试等。

8. 主 Agent 被污染
   主 Agent 本应负责项目管理和用户沟通，但实际开发时会被技术细节、失败尝试、调试过程污染。

9. 子 Agent 失败没有闭环
   子 Agent 执行失败后，主 Agent 可能反复换方法派发，造成重复试错、token 浪费、上下文污染。

10. 会话和上下文不可控
    上下文超过模型限制后，新会话很难准确恢复；主动压缩又可能丢失关键细节。

11. 中断不可恢复
    用户中断程序、设备断电、会话崩溃后，不知道任务做到哪里、哪些文件改了、哪些测试跑了、是否可以继续。

12. 复盘缺乏原始数据
    子 Agent 尝试错误命令四五次才成功，这些失败过程如果不完整保存，后续无法消灭同类失败。

13. 工具、Skill、MCP 加载失控
    一开始把所有能力塞给模型，会浪费 token，降低准确度；但如果不给能力，又可能任务做不完。

14. 成本不可控
    大量无关上下文、完整历史会话、全量工具说明、全量知识库，都会造成 token 成本爆炸。

15. 复杂项目缺少关系管理
    需求、设计、任务、代码、数据库、接口、测试、Agent 运行结果之间缺少结构化关系。
```

### 1.2 为什么现有四类系统单独不够

```text
Kiro
  优点：规格驱动流程清晰，requirements/design/tasks 链条强。
  不足：不解决用户自定义 OpenCode 工作流、不解决跨项目自我提升闭环、不解决用户已有 ai_dev_os 经验沉淀问题。

Superpowers
  优点：Agent 执行纪律强，强调 brainstorming、planning、TDD、subagent、review、verification。
  不足：不是完整的项目状态机，不负责 Kiro 风格 specs 的权威链条，也不是 OpenCode 原生产品层。

OpenCode
  优点：有 commands、agents、subagents、skills、tools、plugins、permissions，适合作为运行平台。
  不足：本身不是规格驱动开发产品，不自带 requirements → design → tasks 的强约束。

ai_dev_os
  优点：有工单、状态、风险、复盘、知识候选、全局知识合并思想。
  不足：需要与 OpenCode 原生机制、Superpowers skills、Kiro specs 思想更紧密结合。
```

### 1.3 SpecForge 的产生背景

SpecForge 的产生背景是：

```text
用户希望用 OpenCode 作为 AI 开发运行平台，
吸收 Kiro 的规格驱动思想，
融合 Superpowers 的全流程执行纪律，
再加入 ai_dev_os 的状态、复盘、自我提升闭环，
最终形成一个用户体验简单但内部控制严密的 AI 开发框架。
```

最终目标：

```text
把“用户随口描述问题”
转成
“已确认需求 / 缺陷说明”
再转成
“受环境约束的设计”
再转成
“可由子 Agent 正确完成的任务”
再转成
“有测试证据的代码”
再转成
“可复盘、可沉淀、可复用的知识”。
```

---

## 2. 外部系统能力边界

### 2.1 Kiro 的作用边界

SpecForge 使用 Kiro 的规格驱动思想：

```text
requirements.md 或 bugfix.md
  → design.md
  → tasks.md
```

在 SpecForge 中，Kiro 思想提供主链：

```text
需求 / 缺陷分析
  → 技术设计
  → 实施任务
  → 任务执行
  → 验证与状态更新
```

Feature 工作流采用：

```text
Requirements-First:
  需求行为明确 → requirements.md → design.md → tasks.md

Design-First:
  技术约束强 / 架构先行 → design.md → requirements.md → tasks.md
```

Bugfix 工作流采用：

```text
Current Behavior
Expected Behavior
Unchanged Behavior
Root Cause
Fix Design
Regression Prevention
```

### 2.2 Superpowers 的作用边界

Superpowers 是执行纪律层，不是第二套主流程。

SpecForge 不简单“调用几个 Superpowers skills”，而是把 Superpowers 映射进每个阶段：

```text
需求阶段：brainstorming
设计阶段：brainstorming / design discussion / tradeoff review
任务阶段：writing-plans
开发阶段：subagent-driven-development + test-driven-development
调试阶段：systematic-debugging
验证阶段：verification-before-completion
审查阶段：spec compliance review + code quality review
收尾阶段：finishing branch / release checklist
```

### 2.3 OpenCode 的作用边界

OpenCode 是运行平台：

```text
primary agents
subagents
commands
skills
custom tools
plugins
permissions
MCP
```

SpecForge 第一版不修改 OpenCode 源码，而是使用 OpenCode 的扩展能力：

```text
.opencode/commands
.opencode/agents
.opencode/skills
.opencode/tools
.opencode/plugins
opencode.json permissions
```

### 2.4 ai_dev_os 的作用边界

SpecForge 吸收 ai_dev_os 思想：

```text
工作先路由
状态文件为准
高风险 checkpoint
结果落盘
输出有契约
复盘提炼失败模式
知识候选需要用户确认
全局知识合并不能静默覆盖
```

但第一版目录不叫 `ai_dev_os/`，统一使用：

```text
specforge/
```

---

## 3. Superpowers 如何在 SpecForge 落地

### 3.1 不是简单安装，也不是完全重写

Superpowers 在 SpecForge 中采用：

```text
Upstream Skills + SpecForge Adapter
```

也就是：

```text
1. 保留 Superpowers 原始 skills 的核心方法论。
2. 不直接把 Superpowers 当独立插件运行。
3. 不让用户单独学习 Superpowers 命令。
4. 在 SpecForge 中建立适配层，把 Superpowers skills 映射到 SpecForge 工作流。
5. 必要时对 Skill 外层包装，增加输入输出契约、触发条件、Gate 要求、日志记录。
```

### 3.2 为什么不能直接安装完就用

直接安装 Superpowers 会有几个问题：

```text
1. Superpowers 不知道 SpecForge 的 requirements/design/tasks 权威状态。
2. Superpowers 的 plan 可能和 SpecForge tasks.md 形成第二套任务体系。
3. Superpowers 默认不一定知道 SpecForge 的 Gate、trace matrix、state machine。
4. Superpowers 不负责 SpecForge 的事件、日志、断点恢复。
5. Superpowers 的 skills 需要被纳入 OpenCode skill 权限和 Capability Broker 管理。
```

所以必须适配。

### 3.3 为什么不能完全重写

完全重写也不对：

```text
1. Superpowers 已经有成熟方法论。
2. 直接重写容易偏离原始经验。
3. 后续无法跟随 upstream 更新。
4. 会把维护成本转嫁给 SpecForge。
```

所以正确方式是：

```text
保留核心方法论，增加 SpecForge 运行时适配。
```

### 3.4 Superpowers 落地目录

建议目录：

```text
.opencode/skills/
  superpowers-brainstorming/
    SKILL.md
    SPEC_FORGE_ADAPTER.md

  superpowers-writing-plans/
    SKILL.md
    SPEC_FORGE_ADAPTER.md

  superpowers-subagent-driven-development/
    SKILL.md
    implementer-prompt.md
    spec-reviewer-prompt.md
    code-quality-reviewer-prompt.md
    SPEC_FORGE_ADAPTER.md

  superpowers-tdd/
    SKILL.md
    SPEC_FORGE_ADAPTER.md

  superpowers-systematic-debugging/
    SKILL.md
    SPEC_FORGE_ADAPTER.md

  superpowers-verification-before-completion/
    SKILL.md
    SPEC_FORGE_ADAPTER.md

  superpowers-code-review/
    SKILL.md
    SPEC_FORGE_ADAPTER.md
```

### 3.5 我们只用这些 Skill 吗？

不是。

V1 先集成这些核心 skills，因为它们覆盖规格驱动开发闭环：

```text
brainstorming
writing-plans
subagent-driven-development
test-driven-development
systematic-debugging
verification-before-completion
code-review / requesting-code-review
finishing-development-branch
```

但最终不限制于这些。SpecForge 应支持：

```text
1. 核心 Superpowers skills
2. 未来新增 Superpowers skills
3. 用户自定义 skills
4. 项目级 skills
5. 全局 skills
6. 领域 skills，例如 frontend/backend/database/devops/security
```

所有 skills 都必须注册到：

```text
specforge/registry/skills.json
```

由 Capability Broker 控制加载。

### 3.6 Superpowers 在 SpecForge 中的权威边界

必须明确：

```text
SpecForge tasks.md 是权威任务清单。
Superpowers writing-plans 只能为单个 task 生成 execution_plan.md。
Superpowers subagent-driven-development 只能执行已通过 tasks-gate 的 task。
Superpowers review 结果进入 review gate。
Superpowers verification 结果进入 verification gate。
```

Superpowers 不能自行创建新需求、新设计、新顶层任务。

---

## 4. 每个子 Agent 是否有自己的 Agent 文件

答案：必须有。

### 4.1 每个 Agent 至少两个文件

每个 Agent 必须有：

```text
.opencode/agents/<agent-name>.md
specforge/agents/contracts/<agent-name>.contract.md
```

其中：

```text
.opencode/agents/<agent-name>.md
  给 OpenCode 使用，定义 Agent 的角色、模型、权限、描述、系统提示。

specforge/agents/contracts/<agent-name>.contract.md
  给 SpecForge 运行时和开发者使用，定义输入输出契约、禁止行为、升级条件、日志要求。
```

### 4.2 Agent 文件通用结构

每个 `.opencode/agents/*.md` 必须包含：

```markdown
---
name: sf-executor
mode: subagent
description: Execute one approved SpecForge task using minimal context.
temperature: 0.2
max_steps: 30
permission:
  edit: ask
  bash: ask
  task: deny
  skill: ask
---

# Role

你是 SpecForge 的任务执行子 Agent。你只执行一个已通过 Execution Gate 的 task。

# Responsibilities

- 读取 context_manifest 中的 mandatory context。
- 只修改 allowed_files。
- 按 acceptance_criteria 实现。
- 按 verification_commands 验证。
- 输出 agent_result.json。

# Boundaries

你不能：
- 修改 requirements.md。
- 修改 design.md。
- 修改 tasks.md 的状态。
- 新增需求。
- 改变设计决策。
- 直接询问用户。
- 调用其他子 Agent。
- 绕过 Gate。
- 超出 allowed_files。

# Required Output

必须输出：
- result.json
- result.md
- files_changed.json
- tool_calls_summary.md
```

### 4.3 Agent Contract 文件通用结构

```markdown
# sf-executor-agent Contract

## Called By
- sf-orchestrator
- sf-failure-controller

## May Call
- No subagents directly.
- May request debugger through failure-controller.

## Inputs
- agent_request.json
- context_manifest.json
- capability_policy.json

## Outputs
- agent_result.json
- result.md
- files_changed.json
- attempts.json

## Escalation Conditions
- requirement ambiguity
- design conflict
- missing environment
- permission required
- repeated tool failure
- context insufficient

## Logging Requirements
- all tool calls
- all file edits
- all commands
- all verification attempts
- all failures
```

### 4.4 全局 Agent Constitution

还需要一个全局文件：

```text
specforge/agents/AGENT_CONSTITUTION.md
```

内容规定所有 Agent 的共同底线：

```text
1. 不得绕过 Gate。
2. 不得伪造验证。
3. 不得把推测当事实。
4. 不得直接修改权威状态。
5. 不得越权调用工具。
6. 不得直接向用户提问，除 orchestrator 外。
7. 不得创建未授权子 Agent。
8. 不得把完整 archive 当常规上下文。
9. 不得在需求文档中写设计。
10. 不得在设计文档中写任务。
```

---

## 5. 子 Agent 调用层级与防闭环

### 5.1 基本规则

默认规则：

```text
只有 sf-orchestrator 可以创建子 Agent。
普通子 Agent 不允许直接调用其他子 Agent。
```

这条规则非常关键。否则会出现：

```text
executor → debugger → reviewer → executor → debugger ...
```

形成闭环。

### 5.2 允许的逻辑委派

有些 Agent 看起来需要“调用其他 Agent”，例如：

```text
requirements-agent 需要 domain-analyst-agent
design-agent 需要 environment-agent
executor-agent 失败后需要 debugger-agent
```

但实现上不能让子 Agent 直接调用子 Agent。

正确方式：

```text
子 Agent 输出 delegation_request
  ↓
orchestrator 或 failure-controller 审核
  ↓
由 orchestrator 派发另一个子 Agent
```

### 5.3 调用深度限制

实际运行深度：

```text
Depth 0:
  用户 / OpenCode 主会话

Depth 1:
  sf-orchestrator

Depth 2:
  workflow subagent 或 technical subagent

Depth 3:
  禁止常规使用。
  只有程序化 failure-controller 可以触发等价二级技术处理，但仍由 orchestrator 记录。
```

更准确地说：

```text
Agent 之间不允许任意递归。
所有子 Agent 调用都必须回到 orchestrator / failure-controller 中转。
```

### 5.4 防闭环机制

必须有程序检测：

```text
1. agent_call_stack
   记录当前调用链。

2. max_agent_depth
   默认 2。

3. no_same_agent_reentry
   同一个 run 链中不能重复进入同一 Agent 超过 1 次。

4. max_failure_loop
   同一 task 最多：
   - executor attempt: 2
   - debugger attempt: 1
   - review repair loop: 1
   超过后 blocked。

5. doom_loop detection
   同一工具相同输入连续失败 3 次，立即阻断。
```

### 5.5 Agent Call Event

每次调用 Agent 必须记录：

```json
{
  "event_type": "agent.called",
  "caller": "sf-orchestrator",
  "callee": "sf-executor-agent",
  "work_item_id": "WI-001",
  "task_id": "T-003",
  "depth": 2,
  "parent_run_id": "RUN-001",
  "run_id": "RUN-002",
  "reason": "execute_task"
}
```

---

## 6. 工作流中如何加入 Superpowers 限制

### 6.1 不是“可选建议”，而是 Method Gate

Superpowers 在 SpecForge 中不是装饰品。

每个工作流都要声明：

```text
required_method_skills
optional_method_skills
method_gate
```

例如：

```json
{
  "workflow": "feature_spec",
  "stage": "requirements",
  "required_method_skills": ["superpowers-brainstorming"],
  "method_gate": "requirements_method_gate"
}
```

### 6.2 Feature Spec 工作流中的 Superpowers

#### Requirements 阶段

必须使用：

```text
superpowers-brainstorming
```

目的：

```text
从多个角度帮助用户补全需求：
- 业务价值
- 用户角色
- 使用场景
- 成本约束
- 人员与管理
- 运维与部署
- 数据与权限
- 风险与边界
```

Gate 检查：

```text
requirements.md 中必须区分：
- confirmed requirements
- candidate requirements
- open questions
- design hints
- out of scope
```

#### Design 阶段

必须使用：

```text
brainstorming / design alternatives
```

约束：

```text
设计前必须读取 environment.md / constraints.md。
设计必须说明至少一个被拒绝方案及原因。
设计不能新增未确认需求。
```

#### Tasks 阶段

必须使用：

```text
superpowers-writing-plans
```

但边界是：

```text
writing-plans 不能替代 tasks.md。
它只能帮助 task-planner-agent 检查任务是否足够 bite-sized。
```

#### Development 阶段

必须使用：

```text
superpowers-subagent-driven-development
```

并采用其核心纪律：

```text
fresh subagent per task
implementation first
spec compliance review
code quality review
verification before completion
```

#### Verification 阶段

必须使用：

```text
superpowers-verification-before-completion
```

要求：

```text
没有验证证据，不允许 completed。
```

### 6.3 Bugfix 工作流中的 Superpowers

Bugfix 阶段必须使用：

```text
superpowers-systematic-debugging
```

约束：

```text
1. 先复现或确认 current behavior。
2. 明确 expected behavior。
3. 明确保留 unchanged behavior。
4. 不能只修表面现象。
5. 必须有 regression prevention。
```

Development 阶段仍使用：

```text
subagent-driven-development
test-driven-development
verification-before-completion
```

### 6.4 Quick Change 工作流中的 Superpowers

Quick Change 不强制完整 Superpowers 流程。

但必须执行：

```text
verification-before-completion
```

如果 quick-change-gate 判断影响业务行为，自动升级为 feature_spec 或 bugfix_spec。

### 6.5 Method Gate

`sf_method_gate` 检查某阶段是否满足方法论约束。

输入：

```json
{
  "workflow": "feature_spec",
  "stage": "requirements",
  "required_skills": ["superpowers-brainstorming"],
  "events_path": "specforge/runtime/events.jsonl",
  "documents": []
}
```

输出：

```json
{
  "status": "pass|fail|blocked",
  "missing_required_skills": [],
  "method_violations": [],
  "next_action": "continue|load_skill|revise|ask_user"
}
```

注意：

```text
加载了 Skill 不等于符合 Skill。
Method Gate 还要检查产物是否满足该方法要求。
```

例如 requirements 阶段加载了 brainstorming，但没有产生 open_questions 或 alternatives，仍可 fail。

---

## 7. 渐进式 Tool / Skill / MCP 加载机制

### 7.1 谁负责

由三个程序模块负责：

```text
Context Builder
  决定给 Agent 什么信息。

Capability Broker
  决定 Agent 能用什么工具、Skill、MCP。

Gate Runner
  决定某些工具是否必须执行，执行结果是否允许进入下一阶段。
```

不是由 Agent 自己随意决定。

### 7.2 什么时候执行

在以下时机执行：

```text
1. 创建 work_item 时。
2. 进入每个阶段前。
3. 创建每个 agent_run 前。
4. task risk_level 变化后。
5. 用户批准或拒绝某权限后。
6. resume 后。
7. Gate fail 后重试前。
```

### 7.3 谁来执行

```text
sf-orchestrator 发起。
sf_context_build 工具生成 context_manifest。
sf_capability_resolve 工具生成 capability_policy。
sf_gate_runner 调用对应 Gate 工具。
OpenCode plugin 记录 skill/tool/mcp 使用事件。
```

### 7.4 Capability Registry

路径：

```text
specforge/registry/
  tools.json
  skills.json
  mcp.json
  capability_policies.json
```

每个工具必须注册：

```json
{
  "id": "sf_requirements_gate",
  "kind": "tool",
  "description": "检查 requirements.md 是否满足进入 design 的条件",
  "stages": ["requirements"],
  "allowed_agents": ["sf-orchestrator"],
  "required_before_transition": ["requirements_to_design"],
  "side_effect": "read_only",
  "risk_level": "L1",
  "input_schema": "schemas/sf_requirements_gate.input.json",
  "output_schema": "schemas/gate_result.schema.json"
}
```

### 7.5 `sf_requirements_gate` 是什么

它是一个程序工具，不是 Agent，不是提示词，不是文档。

职责：

```text
读取 requirements.md、open_questions.md、inbox/design_hints.md、user_confirmations.md。
执行规则检查。
输出 GateResult。
```

执行它不等于通过。

只有：

```text
GateResult.status = pass
```

状态机才允许：

```text
requirements_confirmed → design_drafting
```

### 7.6 Gate 为什么不能只靠 AI

因为这些必须 100% 做到：

```text
1. 文档边界不能混。
2. 用户未确认需求不能进入 baseline。
3. 需求必须有 ID。
4. 任务不能没有验证命令。
5. 高风险操作不能绕过确认。
```

这些不能靠 AI 自觉，必须程序检查。

### 7.7 跨阶段工具怎么处理

一些工具跨阶段使用，例如：

```text
sf_graph_query
sf_doc_lint
sf_trace_check
sf_result_log
sf_test_selector
```

处理方式：

```text
工具按 capability 注册，不属于单一阶段。
Capability Broker 根据当前 stage + agent + task + risk 动态授权。
```

示例：

```text
sf_graph_query:
  requirements 阶段：只能查业务术语和历史需求。
  design 阶段：可查架构、接口、数据关系。
  development 阶段：可查 task 相关代码子图。
  retro 阶段：可查完整失败历史。
```

### 7.8 MCP 怎么处理

MCP 默认不全量开放。

规则：

```text
1. MCP 必须注册。
2. MCP 必须声明 read/write/delete 权限。
3. 读操作可按风险开放。
4. 写操作必须用户确认。
5. 数据库迁移、部署、生产写入一律 L3。
```

---

## 8. 如何知道会话快到上下文限制

### 8.1 先说现实边界

SpecForge 不能假设所有模型和所有 OpenCode 版本都会暴露精确 token 剩余量。

因此要采用三层检测：

```text
1. 精确检测：如果运行平台提供 token usage 或 context usage，就直接使用。
2. 估算检测：如果没有精确值，按消息、文件、工具输出估算 token。
3. 事件检测：如果 OpenCode 触发 compaction / summary / session too large 相关事件，则被动进入恢复流程。
```

### 8.2 Context Monitor

新增模块：

```text
sf_context_monitor
```

职责：

```text
1. 记录每个 agent_run 的输入大小。
2. 记录工具输出大小。
3. 估算当前会话 token。
4. 设置阈值。
5. 触发 checkpoint 和 summary。
```

### 8.3 阈值策略

默认：

```text
60%:
  开始减少非必要上下文。

75%:
  强制生成 stage_summary。

85%:
  强制 checkpoint，禁止启动大任务。

90%:
  建议切换新会话或执行 resume handoff。

95%:
  只允许写恢复文件，不再继续开发。
```

### 8.4 估算方法

如果没有平台 token usage：

```text
estimated_tokens =
  chars / 3 for Chinese-heavy content
  chars / 4 for English/code mixed content
  plus tool_output_tokens
  plus loaded_skill_tokens
  plus file_context_tokens
```

这只是估算，不作为精确计费依据，但足够用于风险预警。

### 8.5 会话压缩前必须保存什么

在 75% 以上，必须生成：

```text
specforge/sessions/<session_id>/
  session_summary.md
  decisions.md
  open_questions.md
  current_state_snapshot.json
  next_action.md
  loaded_context_manifest.json
```

在 85% 以上，还必须生成：

```text
specforge/runtime/checkpoints/<checkpoint_id>.json
```

### 8.6 新会话如何恢复

新会话不迁移旧聊天全文。

只读取：

```text
state.json
current_work_item.json
current_task.json
latest checkpoint
requirements/design/tasks 相关切片
trace_matrix 相关行
open_questions
decisions
failed_attempts summary
graph query 结果
```

完整 transcript 只用于 retro，不用于默认恢复。

### 8.7 OpenCode 自动 compaction 如何处理

如果 OpenCode 自己触发 compaction，SpecForge 仍要把自己的状态写入文件。

规则：

```text
OpenCode compaction summary 只能作为辅助。
SpecForge runtime 文件才是恢复事实来源。
```

---

## 9. 日志与调试体系

### 9.1 日志不是一个文件，而是一套分层系统

运行中出问题时，必须能回答：

```text
1. 用户说了什么？
2. 系统判断成什么意图？
3. 创建了哪个 work item？
4. 哪个 Agent 被调用？
5. 给了它哪些上下文？
6. 授权了哪些 tools/skills/mcp？
7. 它实际用了哪些工具？
8. 改了哪些文件？
9. 哪条 Gate 没通过？
10. 哪个测试失败？
11. 失败是否重复出现？
12. 是否可以 resume？
```

### 9.2 日志目录

```text
specforge/logs/
  app.log
  error.log
  debug.log
  security.log
  permission.log
  capability.log
  gate.log
  state_transition.log
  graph.log
  resume.log
  install.log
  upgrade.log
  uninstall.log
```

同时，Agent 原始记录进入：

```text
specforge/archive/agent_runs/<run_id>/
```

事件流进入：

```text
specforge/runtime/events.jsonl
```

### 9.3 日志类型

#### app.log

记录用户级流程：

```text
work item created
workflow selected
stage changed
task started
task completed
```

#### error.log

记录异常：

```text
tool failure
plugin failure
agent timeout
schema validation error
state transition denied
gate execution error
```

#### debug.log

开发调试用，默认可关闭：

```text
context slicing details
capability resolve details
graph query details
gate rule trace
```

#### security.log

记录风险和敏感操作：

```text
read .env denied
database write requested
deployment requested
external directory access
secret-like content detected
```

#### permission.log

记录权限请求：

```text
agent requested bash
agent requested edit
agent requested skill
agent requested mcp
user approved / denied
```

#### capability.log

记录能力分配：

```text
agent_run_id
allowed_tools
required_tools
allowed_skills
allowed_mcp
blocked_capabilities
reason
```

#### gate.log

记录 Gate 结果：

```text
gate name
input files
status
blocking issues
warnings
next action
```

#### state_transition.log

记录状态变化：

```text
entity
from
to
reason
evidence_event_id
actor
```

#### graph.log

记录图谱更新：

```text
nodes added
edges added
source
confidence
validation status
```

#### resume.log

记录恢复过程：

```text
last checkpoint
dirty files
active agent run
recovery decision
```

### 9.4 日志格式

所有结构化日志使用 JSONL：

```json
{
  "timestamp": "2026-05-02T12:00:00Z",
  "level": "INFO",
  "correlation_id": "WI-001:T-003:RUN-007",
  "component": "sf_capability_broker",
  "event": "capability.resolved",
  "message": "Capabilities resolved for executor agent",
  "payload": {}
}
```

### 9.5 Correlation ID

所有日志必须带：

```text
work_item_id
task_id
agent_run_id
event_id
session_id
```

组合成：

```text
correlation_id = session_id:work_item_id:task_id:agent_run_id
```

这样运行出错时可以追踪完整链路。

### 9.6 调试命令

必须提供：

```text
/sf-status
/sf-doctor
/sf-log <work_item_id>
/sf-trace <task_id>
/sf-debug-run <run_id>
/sf-resume
/sf-graph-inspect <node_id>
```

#### /sf-doctor

检查：

```text
目录是否完整
registry 是否有效
schemas 是否有效
OpenCode 配置是否正确
plugins 是否加载
tools 是否可执行
permissions 是否生效
state 是否一致
events 是否损坏
graph 是否可读
```

#### /sf-trace

输出：

```text
用户输入
→ intent
→ workflow
→ requirements
→ design
→ tasks
→ agent_run
→ files_changed
→ tests
→ gate result
```

### 9.7 日志级别

```text
ERROR
WARN
INFO
DEBUG
TRACE
```

默认：

```text
INFO
```

用户可通过：

```text
specforge/config/project.json
```

设置：

```json
{
  "logging": {
    "level": "INFO",
    "archive_full_transcript": true,
    "debug_tool_outputs": false,
    "redact_secrets": true
  }
}
```

### 9.8 敏感信息处理

日志必须做脱敏：

```text
.env
API key
token
password
private key
database url
cookie
authorization header
```

策略：

```text
默认不记录敏感内容全文。
记录 hash / redacted placeholder。
用户显式开启 debug_secret_dump 才能保存，但默认禁止。
```

---

## 10. 权威状态与事件系统

### 10.1 权威状态

```text
specforge/runtime/state.json
```

不是聊天上下文。

### 10.2 Event Bus

```text
specforge/runtime/events.jsonl
```

事件类型：

```text
user.input.received
intent.classified
workflow.suggested
workflow.confirmed
work_item.created
document.generated
document.linted
method_gate.executed
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

### 10.3 事件是状态流转证据

状态不能随便改。

必须通过：

```text
sf_state_transition
```

并提供 evidence_event_id。

---

## 11. Agent 调用与数据契约

### 11.1 Agent Request

```json
{
  "run_id": "RUN-20260502-0001",
  "session_id": "SES-001",
  "work_item_id": "WI-001",
  "task_id": "T-003",
  "agent": "sf-executor-agent",
  "stage": "development",
  "objective": "实现验证码校验服务",
  "context_manifest_path": "specforge/archive/agent_runs/RUN-.../context_manifest.json",
  "capability_policy_path": "specforge/archive/agent_runs/RUN-.../capability_policy.json",
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
    "files_changed.json",
    "attempts.json"
  ]
}
```

### 11.2 Agent Result

```json
{
  "run_id": "RUN-20260502-0001",
  "agent": "sf-executor-agent",
  "status": "completed|failed|blocked|needs_review|needs_user_decision",
  "summary": "",
  "files_read": [],
  "files_modified": [],
  "tools_used": [],
  "skills_loaded": [],
  "mcp_used": [],
  "tests_run": [],
  "evidence": [],
  "failures": [],
  "open_questions": [],
  "delegation_request": null,
  "needs_escalation": false,
  "escalation_reason": null
}
```

### 11.3 Delegation Request

子 Agent 不能直接调用子 Agent，只能输出请求：

```json
{
  "type": "delegation_request",
  "requested_agent": "sf-domain-analyst-agent",
  "reason": "Need business and operations angle before finalizing requirements",
  "required_inputs": [],
  "expected_output": "domain_analysis.md",
  "blocking": true
}
```

orchestrator 决定是否派发。

---

## 12. 工作流与 Agent 调用闭环

### 12.1 工作流类型

```text
question_answer
reactive_workflow_suggestion
feature_spec
bugfix_spec
design_first_spec
change_request
quick_change
refactor
ops_task
investigation
development
resume
retro
```

### 12.2 所有工作流通用结构

每个工作流必须包含：

```text
入口条件
使用的 Agent
必需 Superpowers skills
必需工具
必需 Gate
状态流转
失败路径
用户确认点
产物
日志
```

### 12.3 Feature Spec

```text
入口：
  用户提出新功能、体验优化、业务能力扩展。

Agent：
  intent-router
  requirements-agent
  domain-analyst
  environment-agent
  design-agent
  test-architect
  task-planner

Superpowers：
  brainstorming
  writing-plans

Gate：
  requirements_gate
  environment_gate
  design_gate
  tasks_gate

产物：
  intake.md
  requirements.md
  constraints.md
  environment.md
  design.md
  tasks.md
  trace_matrix.md
  test_strategy.md
```

### 12.4 Bugfix Spec

```text
入口：
  用户报告异常，或回答问题过程中发现状态冲突。

Agent：
  intent-router
  workflow-suggester
  requirements-agent
  environment-agent
  design-agent
  task-planner
  debugger

Superpowers：
  systematic-debugging
  brainstorming
  writing-plans

Gate：
  bugfix_gate
  design_gate
  tasks_gate
  regression_gate

产物：
  bugfix.md
  root_cause.md
  design.md
  tasks.md
  regression_suite.md
```

### 12.5 Development

```text
入口：
  tasks confirmed，存在 ready task。

Agent：
  executor
  debugger
  spec-reviewer
  code-reviewer
  verifier

Superpowers：
  subagent-driven-development
  test-driven-development
  verification-before-completion
  code-review

Gate：
  execution_gate
  method_gate
  review_gate
  verification_gate

产物：
  changed files
  tests
  agent_run archive
  verification_report
  task status update
```

### 12.6 Reactive Workflow Suggestion

```text
入口：
  用户问问题，系统检查后发现异常。

Agent：
  workflow-suggester

Superpowers：
  无强制，可选 brainstorming

Gate：
  suggestion_gate

产物：
  workflow_suggestion.json

规则：
  先回答用户问题。
  再提示是否进入工作流。
  未经用户确认，不创建正式 work item。
```

---

## 13. 知识图谱

### 13.1 谁生产

```text
spec parser
code indexer
git diff parser
test result parser
agent reporter
user confirmation recorder
retro extractor
```

### 13.2 谁使用

```text
context-builder
impact-analyzer
task-planner-agent
parallel-scheduler
verifier-agent
debugger-agent
workflow-suggester-agent
retro-agent
```

### 13.3 怎么使用

Agent 不直接读全图。

只能调用：

```text
sf_graph_query
```

查询目的必须声明：

```text
build_context
impact_analysis
parallel_check
verification_select
debug_lookup
workflow_suggestion
retro_analysis
```

---

## 14. 并行任务控制

### 14.1 并行前必须执行

```text
sf_parallel_check
```

检查：

```text
任务依赖
文件冲突
API 契约冲突
数据库迁移冲突
测试环境冲突
设计决策冲突
```

### 14.2 并行执行限制

```text
每个 task 独立 worktree 或 branch。
每个 task 独立 agent_run。
每个 task 独立验证。
合并前必须 rerun impacted regression tests。
```

---

## 15. 质量验证体系

### 15.1 测试类型

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

### 15.2 测试选择

由：

```text
sf_test_selector
```

基于：

```text
changed_files
linked_requirements
risk_level
graph relationships
bugfix regression needs
```

选择最小必要测试集。

### 15.3 硬规则

```text
没有 verification_commands，task 不能执行。
没有验证证据，task 不能 completed。
bugfix 没有 regression test，不能 close。
高风险 task 没有 rollback plan，不能执行。
```

---

## 16. 目录结构

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
      sf-doctor.md
      sf-log.md
      sf-trace.md
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
      superpowers-*/
      spec-*/

    tools/
      sf_state_read.ts
      sf_state_transition.ts
      sf_context_monitor.ts
      sf_context_build.ts
      sf_capability_resolve.ts
      sf_doc_lint.ts
      sf_method_gate.ts
      sf_requirements_gate.ts
      sf_bugfix_gate.ts
      sf_environment_gate.ts
      sf_design_gate.ts
      sf_tasks_gate.ts
      sf_execution_gate.ts
      sf_review_gate.ts
      sf_verification_gate.ts
      sf_close_gate.ts
      sf_trace_check.ts
      sf_task_update.ts
      sf_result_log.ts
      sf_graph_query.ts
      sf_graph_update.ts
      sf_parallel_check.ts
      sf_test_selector.ts
      sf_resume_check.ts
      sf_log_query.ts
      sf_doctor.ts

    plugins/
      sf_lifecycle.ts
      sf_guard.ts
      sf_logger.ts
      sf_checkpoint.ts
      sf_permission_guard.ts
      sf_context_monitor.ts

  specforge/
    config/
      project.json
      risk_policy.json
      workflow_policy.json
      logging.json

    agents/
      AGENT_CONSTITUTION.md
      contracts/

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
      capability_policy.schema.json
      task.schema.json
      event.schema.json
      log.schema.json

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
        current_state_snapshot.json
        next_action.md

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

    logs/
      app.log
      error.log
      debug.log
      security.log
      permission.log
      capability.log
      gate.log
      state_transition.log
      graph.log
      resume.log
      install.log
      upgrade.log
      uninstall.log

    index/
      graph.sqlite
      nodes.jsonl
      edges.jsonl

    templates/
      *.template.md

    retro/
      <retro_id>/
        retro.md
        evidence.md
        knowledge_candidates.md
        status.json
```

---

## 17. V1 必须实现

```text
1. 背景与产品定位文档。
2. Agent 文件体系。
3. Agent contract 体系。
4. Superpowers adapter 体系。
5. Intent Router。
6. Workflow Suggester。
7. Feature / Bugfix 工作流。
8. Method Gate。
9. Document Lint。
10. Requirements / Bugfix / Environment / Design / Tasks Gates。
11. Context Monitor。
12. Context Builder。
13. Capability Registry + Broker。
14. Event Bus。
15. State Machine。
16. Agent Run Archive。
17. Logging System。
18. Doctor / Trace / Log Debug 命令。
19. Checkpoint / Resume。
20. Basic Knowledge Graph。
21. Install / Upgrade / Uninstall。
```

---

## 18. V1 不做

```text
1. 不修改 OpenCode 源码。
2. 不做原生 UI。
3. 不做复杂图数据库。
4. 不做全局知识自动合并。
5. 不做长期后台守护进程。
6. 不做企业级权限系统。
```

---

## 19. 开发拆分顺序

### Phase 1：基础骨架

```text
目录结构
schemas
logging
event bus
state machine
install/uninstall
```

### Phase 2：Agent 与契约

```text
agent.md 文件
agent contracts
agent registry
agent run archive
orchestrator skeleton
```

### Phase 3：Superpowers 适配

```text
import upstream skills
SPEC_FORGE_ADAPTER.md
method gate
skill registry
skill loaded event
```

### Phase 4：规格工作流

```text
intent router
workflow suggester
requirements
bugfix
environment
design
tasks
document lint
gates
```

### Phase 5：能力与上下文

```text
context monitor
context builder
capability broker
MCP policy
tool policy
permission guard
```

### Phase 6：执行闭环

```text
executor
debugger
reviewer
verifier
failure controller
verification gate
task state update
```

### Phase 7：恢复与调试

```text
checkpoint
resume
doctor
trace
log query
failure diagnostics
```

### Phase 8：图谱与复盘

```text
graph schema
spec parser
git diff parser
test result parser
graph query
impact analyzer
retro
knowledge candidates
```

---

## 20. 自查结论

### 20.1 当前方案是否能继续开发代码？

可以。

因为已经定义：

```text
1. 背景和目标。
2. 外部系统边界。
3. Superpowers 落地策略。
4. Agent 文件体系。
5. Agent 调用边界。
6. 子 Agent 调用深度限制。
7. 工作流与 Superpowers 约束。
8. Tool / Skill / MCP 加载机制。
9. Gate 语义和通过条件。
10. 日志和调试体系。
11. 上下文限制检测。
12. 状态、事件、恢复机制。
13. 知识图谱生产和使用方式。
14. V1 范围和开发拆分。
```

### 20.2 仍需要实现期验证的外部限制

```text
1. OpenCode 插件事件是否能捕获所有需要的 tool/skill/mcp 使用事件。
2. OpenCode 是否暴露精确 token usage。
3. OpenCode subagent 权限能否完全禁止子 Agent 调用 task。
4. OpenCode skill 加载事件是否可被插件可靠记录。
5. MCP 动态授权是否需要额外 wrapper。
6. Windows PowerShell 安装脚本兼容性。
```

这些是实现验证点，不是方案空洞。

---

## 21. 最终结论

SpecForge 的工程定位：

```text
运行在 OpenCode 上的规格驱动 AI 开发控制系统。
```

核心不是提示词，而是：

```text
Orchestrator
Agent Contracts
Superpowers Method Adapter
Context Monitor
Context Builder
Capability Broker
Gate Runner
State Machine
Event Bus
Agent Run Archive
Logging System
Knowledge Graph
Resume Engine
```

最重要的三条底线：

```text
1. 主 Agent 不写代码，只做项目管理和用户沟通。
2. 子 Agent 不能自由递归调用，所有调用必须经 orchestrator / failure-controller。
3. 凡是必须 100% 做到的事情，必须由程序、Gate、状态机、权限、日志硬控。
```

这份 v0.3 才可以作为 SpecForge 的工程化开发基线。
