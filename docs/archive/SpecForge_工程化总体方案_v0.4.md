# SpecForge 工程化总体方案 v0.4

> 状态：工程化基线版  
> 本版新增重点：每个 Agent 支持独立模型配置、Model Router、模型注册表、模型策略、成本预算、上下文窗口匹配、失败后模型升级/降级、Provider fallback。  
> 目标：这份文档可以作为后续需求拆分、架构设计、任务生成、代码开发和验收的基线。

---

## 0. v0.4 变更说明

相对 v0.3，v0.4 主要补充：

```text
1. 增加 Model Layer。
2. 每个 Agent 支持独立模型配置。
3. 增加 Model Registry。
4. 增加 Model Router。
5. 增加 Model Policy。
6. 增加 Agent-level Model Strategy。
7. 增加 Context Window Matching。
8. 增加 Cost Budget。
9. 增加 Failure-based Model Escalation。
10. 增加 Provider Fallback。
11. 增加模型使用日志和成本审计。
12. 更新 Agent 表，补充模型策略字段。
13. 更新 Agent Run 流程，把 model routing 纳入正式链路。
14. 更新目录结构，加入 models.json、model_policies.json、cost_budget.json。
```

v0.4 的关键判断：

```text
每个 Agent 可以使用不同模型。
模型选择不能写死在 agent.md。
模型选择必须由 Model Router 根据任务、阶段、风险、上下文大小、成本预算、失败类型统一决策。
子 Agent 不能自己随便换模型。
```

---

## 1. 项目背景

### 1.1 用户当前的 AI 开发痛点

无论使用哪种 AI 开发工具，真正的问题通常不是“AI 会不会写代码”，而是开发过程缺少工程控制。

典型失败模式包括：

```text
1. 规格文件边界失控
   需求讨论时，AI 把设计、接口、数据库、任务、代码实现写进 requirements.md。

2. 需求讨论不完整
   用户的需求通常是不完整的。AI 如果只整理表面输入，会遗漏业务、经济、人员、管理、运维、合规、扩展、部署等维度。

3. AI 默认假设
   遇到不明确的问题，AI 常常自行假设，而不是向用户确认。

4. 需求到设计推导不严谨
   design.md 不一定覆盖所有 requirements；有时还会新增用户没有确认过的需求。

5. 设计脱离环境
   AI 不充分了解软件、硬件、数据库、网络、部署环境、使用范围、团队能力、成本约束，就开始做架构设计。

6. 任务拆分不可控
   task 太大，大模型做不完；task 太小，管理成本高，token 浪费严重。

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

15. 模型使用不合理
    所有 Agent 使用同一个模型，会造成两种浪费：
    - 简单任务用贵模型，成本高。
    - 复杂任务用弱模型，质量差。

16. 复杂项目缺少关系管理
    需求、设计、任务、代码、数据库、接口、测试、Agent 运行结果之间缺少结构化关系。
```

### 1.2 为什么现有四类系统单独不够

```text
Kiro
  优点：规格驱动流程清晰，requirements/design/tasks 链条强。
  不足：不解决 OpenCode 上的自定义运行层，不解决跨项目经验沉淀，不解决用户已有 ai_dev_os 思路融合。

Superpowers
  优点：Agent 执行纪律强，强调 brainstorming、planning、TDD、subagent、review、verification。
  不足：不是完整项目状态机，不负责 Kiro 风格 specs 权威链条，也不是 OpenCode 原生产品层。

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
加入 ai_dev_os 的状态、复盘、自我提升闭环，
并通过模型路由和成本控制，让不同 Agent 使用最合适的大模型。
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

## 2. 产品定位

SpecForge 是：

```text
运行在 OpenCode 上的规格驱动 AI 开发控制系统。
```

不是：

```text
1. 不是 Kiro 克隆。
2. 不是 Superpowers 简单安装包。
3. 不是 ai_dev_os 改名。
4. 不是一堆提示词模板。
5. 不是单纯的多 Agent 编排工具。
```

它的核心是：

```text
Kiro Specs 作为规格主线。
Superpowers 作为全流程方法纪律。
OpenCode 作为运行平台。
ai_dev_os 思想作为状态、复盘、自我提升闭环。
Model Router 作为多模型成本与质量控制层。
```

---

## 3. 外部系统能力边界

### 3.1 Kiro 的作用边界

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

### 3.2 Superpowers 的作用边界

Superpowers 是执行纪律层，不是第二套主流程。

SpecForge 把 Superpowers 映射进每个阶段：

```text
需求阶段：
  brainstorming

设计阶段：
  brainstorming / design discussion / tradeoff review

任务阶段：
  writing-plans

开发阶段：
  subagent-driven-development
  test-driven-development

调试阶段：
  systematic-debugging

验证阶段：
  verification-before-completion

审查阶段：
  spec compliance review
  code quality review

收尾阶段：
  finishing branch / release checklist
```

### 3.3 OpenCode 的作用边界

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
model/provider configuration
```

SpecForge 第一版不修改 OpenCode 源码，而是使用 OpenCode 的扩展能力：

```text
.opencode/commands
.opencode/agents
.opencode/skills
.opencode/tools
.opencode/plugins
opencode.json permissions
opencode.json provider/model settings
```

### 3.4 ai_dev_os 的作用边界

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

第一版目录不叫 `ai_dev_os/`，统一使用：

```text
specforge/
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
  ├── Model Layer
  │   ├── model registry
  │   ├── model router
  │   ├── model policy
  │   ├── cost budget
  │   ├── context window matcher
  │   ├── failure escalation policy
  │   └── provider fallback
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
  │   ├── method gate
  │   ├── requirements gate
  │   ├── bugfix gate
  │   ├── environment gate
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
      ├── logs
      └── cost records
```

---

## 5. 核心原则

### 5.1 主 Agent 是项目经理，不是程序员

主 Agent 只做：

```text
用户沟通
流程选择
状态推进
子 Agent 调度
风险升级
Gate 结果解释
人工确认请求
成本和模型策略解释
```

主 Agent 不做：

```text
直接写代码
直接调试技术细节
直接决定技术绕路方案
直接绕过失败重试规则
直接修改需求、设计、任务状态
直接随意切换模型
```

### 5.2 子 Agent 是专业执行者

每个子 Agent 只处理一个专业问题：

```text
需求澄清
业务分析
环境收集
设计
测试策略
任务拆分
执行
调试
规格审查
代码审查
验证
发布
复盘
```

### 5.3 每个 Agent 支持独立模型策略

每个 Agent 可以使用不同模型，但必须由 Model Router 决定。

```text
agent.md 可以声明默认模型。
model_policies.json 决定动态模型策略。
agent_run 时由 Model Router 最终选定模型。
```

### 5.4 程序硬控优先

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
模型选择与升级策略
成本预算限制
```

### 5.5 全部事实落盘

聊天上下文不是事实来源。

权威事实来源：

```text
specforge/runtime/state.json
specforge/specs/<work_item_id>/
specforge/archive/agent_runs/
specforge/index/graph.sqlite
specforge/logs/
specforge/cost/
git diff / commit
test result
user_confirmations
```

### 5.6 完整记录，最小投喂

完整会话必须保存，但不能默认投喂给后续 Agent。

```text
archive = 原始复盘资料
runtime = 当前恢复资料
context_manifest = 当前任务最小投喂清单
graph = 结构化索引
cost_records = 成本审计资料
```

---

## 6. Superpowers 落地方式

### 6.1 不是简单安装，也不是完全重写

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

### 6.2 为什么不能直接安装完就用

直接安装 Superpowers 会有问题：

```text
1. Superpowers 不知道 SpecForge 的 requirements/design/tasks 权威状态。
2. Superpowers 的 plan 可能和 SpecForge tasks.md 形成第二套任务体系。
3. Superpowers 默认不一定知道 SpecForge 的 Gate、trace matrix、state machine。
4. Superpowers 不负责 SpecForge 的事件、日志、断点恢复。
5. Superpowers 的 skills 需要被纳入 Capability Broker 和 Model Router 管理。
```

### 6.3 为什么不能完全重写

完全重写也不对：

```text
1. Superpowers 已经有成熟方法论。
2. 直接重写容易偏离原始经验。
3. 后续无法跟随 upstream 更新。
4. 会把维护成本转嫁给 SpecForge。
```

### 6.4 Superpowers 落地目录

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

### 6.5 是否只用这些 Skill

不是。

V1 先集成核心 skills：

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

最终支持：

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

### 6.6 Superpowers 权威边界

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

## 7. Agent 文件体系

### 7.1 每个 Agent 必须有自己的文件

每个 Agent 至少有两个文件：

```text
.opencode/agents/<agent-name>.md
specforge/agents/contracts/<agent-name>.contract.md
```

其中：

```text
.opencode/agents/<agent-name>.md
  给 OpenCode 使用，定义 Agent 的角色、模型默认值、权限、描述、系统提示。

specforge/agents/contracts/<agent-name>.contract.md
  给 SpecForge 运行时和开发者使用，定义输入输出契约、禁止行为、升级条件、日志要求、模型策略。
```

### 7.2 Agent 文件通用结构

每个 `.opencode/agents/*.md` 必须包含：

```markdown
---
name: sf-executor
mode: subagent
description: Execute one approved SpecForge task using minimal context.
model: auto
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
- 自行更换模型。

# Model Policy

- 默认模型由 Model Router 决定。
- 当前 agent.md 不写死最终模型。
- 如果模型能力不足，必须通过 result.json 报告 failure_type，由 Model Router 决定是否升级模型。

# Required Output

必须输出：
- result.json
- result.md
- files_changed.json
- tool_calls_summary.md
```

### 7.3 Agent Contract 文件通用结构

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
- model_policy.json

## Outputs
- agent_result.json
- result.md
- files_changed.json
- attempts.json

## Model Strategy
- Preferred model category: coding
- Requires long context: false
- Allows model escalation: true
- Allows cheap model: false for L2/L3 tasks
- Fallback allowed: true

## Escalation Conditions
- requirement ambiguity
- design conflict
- missing environment
- permission required
- repeated tool failure
- context insufficient
- model capability insufficient

## Logging Requirements
- all tool calls
- all file edits
- all commands
- all verification attempts
- all failures
- selected model
- model fallback
- estimated token cost
```

### 7.4 全局 Agent Constitution

需要一个全局文件：

```text
specforge/agents/AGENT_CONSTITUTION.md
```

规定所有 Agent 的共同底线：

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
11. 不得自行切换模型。
12. 不得为了省成本降低高风险任务模型质量。
```

---

## 8. Agent 体系与模型策略

### 8.1 Agent 总表

| Agent | 类型 | 谁调用 | 主要职责 | 是否可改代码 | 是否可问用户 | 推荐模型策略 |
|---|---|---|---|---|---|---|
| sf-orchestrator | primary | 用户 / OpenCode | 项目管理、流程推进、用户沟通 | 否 | 是 | 稳定、长上下文、强推理 |
| sf-intent-router-agent | subagent | orchestrator | 判断用户意图、推荐流程 | 否 | 否 | 便宜、快、分类强 |
| sf-workflow-suggester-agent | subagent | orchestrator | 回答后发现异常，建议流程 | 否 | 否 | 中低成本、推理稳定 |
| sf-requirements-agent | subagent | orchestrator | 需求澄清、边界分类、用户确认 | 否 | 经 orchestrator | 强中文、强推理、长上下文 |
| sf-domain-analyst-agent | subagent | requirements-agent/orchestrator | 业务、经济、人员、管理、运维等分析 | 否 | 否 | 发散强、业务分析强 |
| sf-environment-agent | subagent | design-agent/orchestrator | 收集软件、硬件、网络、数据库、部署约束 | 否 | 经 orchestrator | 工具使用稳定、中成本 |
| sf-design-agent | subagent | orchestrator | 架构设计、接口、数据、错误处理、测试策略 | 否 | 经 orchestrator | 最强架构推理模型 |
| sf-test-architect-agent | subagent | design/task-planner | 测试策略和验证矩阵 | 否 | 否 | 测试经验强、结构化输出强 |
| sf-task-planner-agent | subagent | orchestrator | 设计转 tasks，依赖和验证要求 | 否 | 否 | 结构化输出强、规划强 |
| sf-executor-agent | subagent | orchestrator | 执行单个 task | 是，受限 | 否 | 强代码模型 |
| sf-debugger-agent | subagent | failure-controller | 处理技术失败 | 是，受限 | 否 | 强代码 + 强工具使用 |
| sf-spec-reviewer-agent | subagent | orchestrator | 检查实现是否符合 spec | 默认只读 | 否 | 强规则遵循、强追踪 |
| sf-code-reviewer-agent | subagent | orchestrator | 代码质量、安全、性能、可维护性 | 默认只读 | 否 | 强代码审查模型 |
| sf-verifier-agent | subagent | orchestrator | 执行测试、验收、冒烟、回归 | 只读，可运行命令 | 否 | 工具稳定、成本可控 |
| sf-release-agent | subagent | orchestrator | 发布说明、部署和回滚文档 | 否 | 否 | 文档强、结构化强 |
| sf-retro-agent | subagent | orchestrator/close | 复盘 archive，提炼失败模式 | 否 | 否 | 长上下文、归纳强 |

### 8.2 每个 Agent 的模型选择原则

```text
简单分类任务：
  用便宜、快速模型。

需求和设计任务：
  用强推理、长上下文模型。

代码执行任务：
  用强 coding 模型。

调试任务：
  用强 coding + 工具使用能力强的模型。

验证任务：
  用成本可控、工具执行稳定的模型。

复盘任务：
  用长上下文、总结归纳能力强的模型。

高风险任务：
  不允许使用低可信模型。
```

---

## 9. 子 Agent 调用层级与防闭环

### 9.1 基本规则

默认规则：

```text
只有 sf-orchestrator 可以创建子 Agent。
普通子 Agent 不允许直接调用其他子 Agent。
```

### 9.2 允许的逻辑委派

有些 Agent 需要其他 Agent 协助，例如：

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

### 9.3 调用深度限制

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

关键规则：

```text
Agent 之间不允许任意递归。
所有子 Agent 调用都必须回到 orchestrator / failure-controller 中转。
```

### 9.4 防闭环机制

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

### 9.5 Agent Call Event

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
  "model": "resolved-by-model-router",
  "reason": "execute_task"
}
```

---

## 10. Model Layer

### 10.1 为什么需要 Model Layer

不同 Agent 的任务差异非常大：

```text
意图识别：分类任务，便宜快即可。
需求澄清：需要强推理和强中文。
架构设计：需要最强推理。
代码执行：需要强 coding。
调试：需要强工具使用和代码分析。
验证：主要跑工具，模型可以低成本。
复盘：需要长上下文和总结归纳。
```

如果所有 Agent 使用同一个模型，会造成：

```text
1. 简单任务用贵模型，成本浪费。
2. 复杂任务用弱模型，质量下降。
3. 长上下文任务被短上下文模型卡死。
4. 失败重试没有模型升级策略。
5. Provider 不可用时无法自动 fallback。
```

因此 SpecForge 必须内置 Model Layer。

### 10.2 Model Layer 组成

```text
Model Registry
  记录可用模型、provider、上下文窗口、成本、能力标签。

Model Policy
  定义哪些 Agent / 阶段 / 风险等级可以使用哪些模型。

Model Router
  每次 agent_run 前选择模型。

Cost Budget
  控制项目级、work item 级、task 级、agent_run 级成本。

Context Window Matcher
  根据 context_manifest 估算 token，筛选上下文窗口足够的模型。

Failure Escalation Policy
  失败后是否升级模型、升级到哪个模型。

Provider Fallback
  当前 provider 不可用时切换备选 provider。
```

### 10.3 Model Registry

路径：

```text
specforge/registry/models.json
```

示例：

```json
{
  "models": [
    {
      "id": "fast-cheap-router",
      "provider": "provider-a",
      "model": "small-fast-model",
      "capabilities": ["classification", "summarization"],
      "context_window": 32000,
      "cost_level": "low",
      "speed": "fast",
      "quality_level": "medium",
      "supports_tools": true,
      "supports_long_context": false,
      "supports_code": "basic",
      "supports_json_strict": true,
      "enabled": true
    },
    {
      "id": "strong-reasoning",
      "provider": "provider-b",
      "model": "strong-reasoning-model",
      "capabilities": ["reasoning", "architecture", "requirements", "design"],
      "context_window": 200000,
      "cost_level": "high",
      "speed": "medium",
      "quality_level": "high",
      "supports_tools": true,
      "supports_long_context": true,
      "supports_code": "strong",
      "supports_json_strict": true,
      "enabled": true
    },
    {
      "id": "coding-strong",
      "provider": "provider-c",
      "model": "coding-model",
      "capabilities": ["code", "debugging", "tool_use"],
      "context_window": 128000,
      "cost_level": "medium_high",
      "speed": "medium",
      "quality_level": "high",
      "supports_tools": true,
      "supports_long_context": true,
      "supports_code": "strong",
      "supports_json_strict": true,
      "enabled": true
    }
  ]
}
```

### 10.4 Model Policy

路径：

```text
specforge/registry/model_policies.json
```

示例：

```json
{
  "agent_policies": {
    "sf-intent-router-agent": {
      "preferred_capabilities": ["classification"],
      "default_cost_level": "low",
      "allow_high_cost": false,
      "requires_tools": false,
      "requires_long_context": false,
      "fallback": ["fast-cheap-router", "strong-reasoning"]
    },
    "sf-design-agent": {
      "preferred_capabilities": ["reasoning", "architecture", "design"],
      "default_cost_level": "high",
      "allow_high_cost": true,
      "requires_tools": true,
      "requires_long_context": true,
      "fallback": ["strong-reasoning", "coding-strong"]
    },
    "sf-executor-agent": {
      "preferred_capabilities": ["code", "tool_use"],
      "default_cost_level": "medium_high",
      "allow_high_cost": true,
      "requires_tools": true,
      "requires_long_context": false,
      "fallback": ["coding-strong", "strong-reasoning"]
    },
    "sf-verifier-agent": {
      "preferred_capabilities": ["tool_use", "summarization"],
      "default_cost_level": "low",
      "allow_high_cost": false,
      "requires_tools": true,
      "requires_long_context": false,
      "fallback": ["fast-cheap-router", "coding-strong"]
    },
    "sf-retro-agent": {
      "preferred_capabilities": ["long_context", "summarization", "failure_analysis"],
      "default_cost_level": "medium_high",
      "allow_high_cost": true,
      "requires_tools": false,
      "requires_long_context": true,
      "fallback": ["strong-reasoning"]
    }
  },
  "risk_policies": {
    "L1": {
      "allow_low_cost_models": true,
      "allow_medium_models": true,
      "allow_high_cost_models": false
    },
    "L2": {
      "allow_low_cost_models": false,
      "allow_medium_models": true,
      "allow_high_cost_models": true
    },
    "L3": {
      "allow_low_cost_models": false,
      "allow_medium_models": false,
      "allow_high_cost_models": true,
      "requires_user_approval_for_execution": true
    }
  }
}
```

### 10.5 Cost Budget

路径：

```text
specforge/config/cost_budget.json
```

示例：

```json
{
  "project_budget": {
    "mode": "warn_only",
    "daily_token_limit": 2000000,
    "daily_cost_limit_usd": 50
  },
  "work_item_budget": {
    "default_token_limit": 500000,
    "default_cost_limit_usd": 15
  },
  "agent_run_budget": {
    "sf-intent-router-agent": {
      "max_input_tokens": 8000,
      "max_output_tokens": 2000,
      "max_cost_level": "low"
    },
    "sf-design-agent": {
      "max_input_tokens": 80000,
      "max_output_tokens": 16000,
      "max_cost_level": "high"
    },
    "sf-executor-agent": {
      "max_input_tokens": 40000,
      "max_output_tokens": 12000,
      "max_cost_level": "medium_high"
    }
  }
}
```

Budget 模式：

```text
warn_only:
  超预算只警告。

ask:
  超预算必须问用户。

deny:
  超预算直接阻止。
```

默认建议：

```text
开发期 warn_only。
稳定后 ask。
生产项目可按团队策略设置 deny。
```

### 10.6 Model Router

Model Router 是程序模块，不是 Agent。

路径：

```text
.opencode/tools/sf_model_route.ts
```

输入：

```json
{
  "agent": "sf-executor-agent",
  "stage": "development",
  "workflow": "feature_spec",
  "risk_level": "L2",
  "context_manifest_path": "specforge/archive/agent_runs/RUN-001/context_manifest.json",
  "capability_policy_path": "specforge/archive/agent_runs/RUN-001/capability_policy.json",
  "failure_history": [],
  "cost_budget_path": "specforge/config/cost_budget.json",
  "model_registry_path": "specforge/registry/models.json",
  "model_policies_path": "specforge/registry/model_policies.json"
}
```

输出：

```json
{
  "selected_model": {
    "id": "coding-strong",
    "provider": "provider-c",
    "model": "coding-model"
  },
  "reason": [
    "agent requires code capability",
    "risk level L2 disallows low-cost weak models",
    "context estimate fits 128000 context window"
  ],
  "fallback_models": ["strong-reasoning"],
  "estimated_input_tokens": 32000,
  "estimated_output_tokens": 8000,
  "estimated_cost_level": "medium_high",
  "budget_status": "within_budget",
  "warnings": []
}
```

### 10.7 Model Router 执行时机

每次创建 agent_run 前，必须执行：

```text
orchestrator
  ↓
context-builder
  ↓
capability-broker
  ↓
model-router
  ↓
agent-runner
```

也就是说，模型选择在上下文和能力确定之后。

原因：

```text
1. 模型需要知道上下文大小。
2. 模型需要知道是否需要 tool use。
3. 模型需要知道 task risk。
4. 模型需要知道预算。
```

### 10.8 Context Window Matching

Model Router 必须检查：

```text
estimated_input_tokens + expected_output_tokens + safety_margin
<= model.context_window
```

默认 safety margin：

```text
20%
```

如果不满足：

```text
1. 优先让 Context Builder 缩减 optional context。
2. 仍不满足，切换长上下文模型。
3. 仍不满足，拆分 task 或进入 blocked_context_too_large。
```

不能直接硬塞。

### 10.9 失败后是否换模型

换模型不能滥用。

失败分类：

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
model_capability_failure
timeout
unknown
```

换模型规则：

```text
implementation_failure:
  同模型最多重试 1 次。
  再失败可升级 coding 模型。

test_failure:
  不优先换模型，先 debugger-agent 分析。

environment_failure:
  不换模型，进入 environment blocked。

permission_failure:
  不换模型，走 permission flow。

context_missing:
  不换模型，重新构造 context。

design_conflict:
  不换模型，升级 orchestrator。

requirement_ambiguity:
  不换模型，升级 orchestrator。

tool_failure:
  不换模型，先检查工具/命令/环境。

mcp_failure:
  不换模型，检查 MCP 连接和权限。

model_capability_failure:
  允许立即升级模型。

timeout:
  先判断是模型慢、任务大、上下文大。
  可切换更快模型或拆 task。

unknown:
  允许一次升级，但必须记录原因。
```

### 10.10 Model Escalation Event

换模型必须记录事件：

```json
{
  "event_type": "model.escalated",
  "work_item_id": "WI-001",
  "task_id": "T-003",
  "agent_run_id": "RUN-002",
  "from_model": "coding-medium",
  "to_model": "coding-strong",
  "reason": "model_capability_failure",
  "approved_by": "policy",
  "timestamp": "2026-05-03T00:00:00Z"
}
```

### 10.11 Provider Fallback

Provider fallback 触发条件：

```text
provider unavailable
rate limit
auth failure
model unavailable
timeout exceeding threshold
```

Fallback 顺序：

```text
1. 同 provider 同能力模型。
2. 不同 provider 同能力模型。
3. 更强模型。
4. 如果成本超预算，问用户。
```

不能 fallback 到能力不足模型。

### 10.12 模型日志与成本记录

新增目录：

```text
specforge/cost/
  model_usage.jsonl
  cost_summary.md
```

每次 agent_run 记录：

```json
{
  "timestamp": "2026-05-03T00:00:00Z",
  "session_id": "SES-001",
  "work_item_id": "WI-001",
  "task_id": "T-003",
  "agent_run_id": "RUN-002",
  "agent": "sf-executor-agent",
  "model_id": "coding-strong",
  "provider": "provider-c",
  "estimated_input_tokens": 32000,
  "estimated_output_tokens": 8000,
  "actual_input_tokens": null,
  "actual_output_tokens": null,
  "estimated_cost_level": "medium_high",
  "budget_status": "within_budget",
  "result_status": "completed"
}
```

如果运行平台提供实际 token，则记录 actual。否则只记录 estimated。

### 10.13 agent.md 与 Model Router 的关系

Agent 文件可以写：

```yaml
model: auto
```

或者写默认偏好：

```yaml
model: coding-strong
```

但最终以 Model Router 输出为准。

规则：

```text
agent.md = 默认偏好。
model_policies.json = 策略。
Model Router = 最终决策。
```

如果二者冲突：

```text
Model Router 优先。
冲突写入 model.log。
```

---

## 11. 工作流中的 Superpowers 约束

### 11.1 不是可选建议，而是 Method Gate

Superpowers 在 SpecForge 中不是装饰品。

每个工作流都声明：

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

### 11.2 Feature Spec 工作流中的 Superpowers

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

采用其核心纪律：

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

### 11.3 Bugfix 工作流中的 Superpowers

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

### 11.4 Quick Change 工作流中的 Superpowers

Quick Change 不强制完整 Superpowers 流程。

但必须执行：

```text
verification-before-completion
```

如果 quick-change-gate 判断影响业务行为，自动升级为 feature_spec 或 bugfix_spec。

### 11.5 Method Gate

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

---

## 12. 渐进式 Tool / Skill / MCP 加载机制

### 12.1 谁负责

由三个程序模块负责：

```text
Context Builder
  决定给 Agent 什么信息。

Capability Broker
  决定 Agent 能用什么工具、Skill、MCP。

Gate Runner
  决定某些工具是否必须执行，执行结果是否允许进入下一阶段。
```

### 12.2 什么时候执行

在以下时机执行：

```text
1. 创建 work_item 时。
2. 进入每个阶段前。
3. 创建每个 agent_run 前。
4. task risk_level 变化后。
5. 用户批准或拒绝某权限后。
6. resume 后。
7. Gate fail 后重试前。
8. model escalation 后重新派发前。
```

### 12.3 谁来执行

```text
sf-orchestrator 发起。
sf_context_build 工具生成 context_manifest。
sf_capability_resolve 工具生成 capability_policy。
sf_model_route 工具生成 model_policy。
sf_gate_runner 调用对应 Gate 工具。
OpenCode plugin 记录 skill/tool/mcp/model 使用事件。
```

### 12.4 Capability Registry

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

### 12.5 Gate 是什么

以 `sf_requirements_gate` 为例：

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

### 12.6 跨阶段工具怎么处理

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

### 12.7 MCP 怎么处理

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

## 13. 如何知道会话快到上下文限制

### 13.1 现实边界

SpecForge 不能假设所有模型和所有 OpenCode 版本都会暴露精确 token 剩余量。

因此采用三层检测：

```text
1. 精确检测：
   如果运行平台提供 token usage 或 context usage，就直接使用。

2. 估算检测：
   如果没有精确值，按消息、文件、工具输出估算 token。

3. 事件检测：
   如果 OpenCode 触发 compaction / summary / session too large 相关事件，则被动进入恢复流程。
```

### 13.2 Context Monitor

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
6. 将 context estimate 提供给 Model Router。
```

### 13.3 阈值策略

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

### 13.4 估算方法

如果没有平台 token usage：

```text
estimated_tokens =
  chars / 3 for Chinese-heavy content
  chars / 4 for English/code mixed content
  plus tool_output_tokens
  plus loaded_skill_tokens
  plus file_context_tokens
```

这不是精确计费依据，但足够用于风险预警。

### 13.5 会话压缩前必须保存什么

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

### 13.6 新会话如何恢复

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
model/cost summary
```

完整 transcript 只用于 retro，不用于默认恢复。

---

## 14. 日志与调试体系

### 14.1 日志分层

运行中出问题时，必须能回答：

```text
1. 用户说了什么？
2. 系统判断成什么意图？
3. 创建了哪个 work item？
4. 哪个 Agent 被调用？
5. 给了它哪些上下文？
6. 授权了哪些 tools/skills/mcp？
7. 选了哪个模型？
8. 为什么选这个模型？
9. 它实际用了哪些工具？
10. 改了哪些文件？
11. 哪条 Gate 没通过？
12. 哪个测试失败？
13. 失败是否重复出现？
14. 是否可以 resume？
15. 成本是否超预算？
```

### 14.2 日志目录

```text
specforge/logs/
  app.log
  error.log
  debug.log
  security.log
  permission.log
  capability.log
  model.log
  cost.log
  gate.log
  state_transition.log
  graph.log
  resume.log
  install.log
  upgrade.log
  uninstall.log
```

Agent 原始记录：

```text
specforge/archive/agent_runs/<run_id>/
```

事件流：

```text
specforge/runtime/events.jsonl
```

成本记录：

```text
specforge/cost/model_usage.jsonl
```

### 14.3 日志类型

#### app.log

```text
work item created
workflow selected
stage changed
task started
task completed
```

#### error.log

```text
tool failure
plugin failure
agent timeout
schema validation error
state transition denied
gate execution error
model route failure
provider fallback failure
```

#### debug.log

```text
context slicing details
capability resolve details
graph query details
gate rule trace
model routing trace
```

#### security.log

```text
read .env denied
database write requested
deployment requested
external directory access
secret-like content detected
```

#### permission.log

```text
agent requested bash
agent requested edit
agent requested skill
agent requested mcp
user approved / denied
```

#### capability.log

```text
agent_run_id
allowed_tools
required_tools
allowed_skills
allowed_mcp
blocked_capabilities
reason
```

#### model.log

```text
agent_run_id
selected_model
fallback_models
model_route_reason
context_window_match
model_escalation
provider_fallback
```

#### cost.log

```text
estimated tokens
actual tokens if available
estimated cost
budget status
cost policy action
```

#### gate.log

```text
gate name
input files
status
blocking issues
warnings
next action
```

#### state_transition.log

```text
entity
from
to
reason
evidence_event_id
actor
```

#### graph.log

```text
nodes added
edges added
source
confidence
validation status
```

#### resume.log

```text
last checkpoint
dirty files
active agent run
recovery decision
```

### 14.4 日志格式

所有结构化日志使用 JSONL：

```json
{
  "timestamp": "2026-05-03T12:00:00Z",
  "level": "INFO",
  "correlation_id": "SES-001:WI-001:T-003:RUN-007",
  "component": "sf_model_router",
  "event": "model.selected",
  "message": "Model selected for executor agent",
  "payload": {}
}
```

### 14.5 Correlation ID

所有日志必须带：

```text
session_id
work_item_id
task_id
agent_run_id
event_id
```

组合成：

```text
correlation_id = session_id:work_item_id:task_id:agent_run_id
```

### 14.6 调试命令

必须提供：

```text
/sf-status
/sf-doctor
/sf-log <work_item_id>
/sf-trace <task_id>
/sf-debug-run <run_id>
/sf-resume
/sf-graph-inspect <node_id>
/sf-cost <work_item_id>
/sf-model <agent_run_id>
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
models 是否可用
providers 是否可用
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
→ model route
→ agent_run
→ files_changed
→ tests
→ gate result
```

#### /sf-model

输出：

```text
agent_run 使用了哪个模型
为什么选它
是否 fallback
是否升级
估算 token
实际 token
预算状态
```

### 14.7 敏感信息处理

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
provider api key
```

策略：

```text
默认不记录敏感内容全文。
记录 hash / redacted placeholder。
用户显式开启 debug_secret_dump 才能保存，但默认禁止。
```

---

## 15. 权威状态与事件系统

### 15.1 权威状态

```text
specforge/runtime/state.json
```

不是聊天上下文。

### 15.2 Event Bus

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
model.routed
model.escalated
provider.fallback
cost.recorded
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

### 15.3 事件是状态流转证据

状态不能随便改。

必须通过：

```text
sf_state_transition
```

并提供 evidence_event_id。

---

## 16. Agent 调用与数据契约

### 16.1 Agent Request

```json
{
  "run_id": "RUN-20260503-0001",
  "session_id": "SES-001",
  "work_item_id": "WI-001",
  "task_id": "T-003",
  "agent": "sf-executor-agent",
  "stage": "development",
  "objective": "实现验证码校验服务",
  "context_manifest_path": "specforge/archive/agent_runs/RUN-.../context_manifest.json",
  "capability_policy_path": "specforge/archive/agent_runs/RUN-.../capability_policy.json",
  "model_policy_path": "specforge/archive/agent_runs/RUN-.../model_policy.json",
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

### 16.2 Agent Result

```json
{
  "run_id": "RUN-20260503-0001",
  "agent": "sf-executor-agent",
  "model_id": "coding-strong",
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
  "escalation_reason": null,
  "model_feedback": {
    "context_sufficient": true,
    "model_capability_sufficient": true,
    "recommended_model_escalation": false,
    "reason": null
  }
}
```

### 16.3 Delegation Request

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

## 17. 工作流与 Agent 调用闭环

### 17.1 工作流类型

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

### 17.2 所有工作流通用结构

每个工作流必须包含：

```text
入口条件
使用的 Agent
必需 Superpowers skills
必需工具
必需 Gate
模型策略
状态流转
失败路径
用户确认点
产物
日志
```

### 17.3 Feature Spec

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

模型策略：
  intent-router 用低成本分类模型。
  requirements/design 用强推理模型。
  task-planner 用结构化输出强模型。

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

### 17.4 Bugfix Spec

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

模型策略：
  bugfix 判断用中成本推理模型。
  debugger 用强代码和工具模型。
  regression 设计用测试能力强模型。

产物：
  bugfix.md
  root_cause.md
  design.md
  tasks.md
  regression_suite.md
```

### 17.5 Development

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

模型策略：
  executor 用 coding 模型。
  debugger 可升级到更强 coding/debug 模型。
  reviewer 用代码审查模型。
  verifier 用工具稳定、成本可控模型。

产物：
  changed files
  tests
  agent_run archive
  verification_report
  task status update
```

### 17.6 Reactive Workflow Suggestion

```text
入口：
  用户问问题，系统检查后发现异常。

Agent：
  workflow-suggester

Superpowers：
  无强制，可选 brainstorming

Gate：
  suggestion_gate

模型策略：
  用中低成本推理模型。

产物：
  workflow_suggestion.json

规则：
  先回答用户问题。
  再提示是否进入工作流。
  未经用户确认，不创建正式 work item。
```

---

## 18. 技术失败闭环

### 18.1 失败分类

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
model_capability_failure
provider_failure
timeout
unknown
```

### 18.2 重试策略

```text
同一错误，不允许无限试。
同一 command 连续 3 次相同输入失败，触发 doom_loop。
同一 task 最多：
  - executor attempt: 2
  - debugger attempt: 1
  - review repair loop: 1
  - model escalation: 1
超过后 blocked。
```

### 18.3 失败后处理顺序

```text
1. 分类 failure_type。
2. 如果是 context_missing，重新 context-build。
3. 如果是 permission_failure，走 permission flow。
4. 如果是 provider_failure，走 provider fallback。
5. 如果是 model_capability_failure，走 model escalation。
6. 如果是 implementation/test failure，走 debugger。
7. 如果是 design/requirement conflict，升级 orchestrator。
8. 如果超过重试次数，mark blocked。
```

### 18.4 主 Agent 何时介入

只有以下情况：

```text
requirement_ambiguity
design_conflict
environment_unavailable
permission_required
cost_scope_tradeoff
high_risk_operation
budget_exceeded_ask
```

主 Agent 介入方式：

```text
向用户说明：
1. 当前任务
2. 已经确认的事实
3. 子 Agent 尝试过什么类型的方法
4. 为什么无法继续
5. 成本/风险是否变化
6. 需要用户做什么决策
```

---

## 19. 知识图谱

### 19.1 谁生产

```text
spec parser
code indexer
git diff parser
test result parser
agent reporter
user confirmation recorder
retro extractor
model/cost reporter
```

### 19.2 谁使用

```text
context-builder
impact-analyzer
task-planner-agent
parallel-scheduler
verifier-agent
debugger-agent
workflow-suggester-agent
retro-agent
model-router
```

Model Router 也可以用图谱，例如：

```text
该 task 涉及复杂数据库迁移 → 提高风险等级 → 禁止低成本模型。
该 task 涉及历史失败频繁模块 → 使用更强 debugger 模型。
```

### 19.3 怎么使用

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
model_routing
```

---

## 20. 并行任务控制

### 20.1 并行前必须执行

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
模型和成本预算冲突
```

### 20.2 并行执行限制

```text
每个 task 独立 worktree 或 branch。
每个 task 独立 agent_run。
每个 task 独立模型选择。
每个 task 独立验证。
合并前必须 rerun impacted regression tests。
```

### 20.3 并行成本限制

并行任务会放大成本，必须检查：

```text
parallel_group_estimated_cost <= work_item_budget_remaining
```

如果超过：

```text
1. 降低非关键任务模型等级。
2. 顺序执行。
3. 请求用户确认成本。
```

---

## 21. 质量验证体系

### 21.1 测试类型

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

### 21.2 测试选择

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
task model/capability risk
```

选择最小必要测试集。

### 21.3 硬规则

```text
没有 verification_commands，task 不能执行。
没有验证证据，task 不能 completed。
bugfix 没有 regression test，不能 close。
高风险 task 没有 rollback plan，不能执行。
验证失败不能靠换模型直接跳过。
```

---

## 22. 目录结构

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
      sf-model.md
      sf-cost.md
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
      sf_model_route.ts
      sf_cost_check.ts
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
      sf_model_logger.ts
      sf_cost_logger.ts

  specforge/
    config/
      project.json
      risk_policy.json
      workflow_policy.json
      logging.json
      cost_budget.json

    agents/
      AGENT_CONSTITUTION.md
      contracts/

    registry/
      agents.json
      tools.json
      skills.json
      mcp.json
      models.json
      model_policies.json
      capability_policies.json

    schemas/
      agent_request.schema.json
      agent_result.schema.json
      gate_result.schema.json
      context_manifest.schema.json
      capability_policy.schema.json
      model_policy.schema.json
      model_route_result.schema.json
      cost_record.schema.json
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
        model_cost_summary.md

    archive/
      agent_runs/
        <run_id>/
          request.json
          context_manifest.json
          capability_policy.json
          model_policy.json
          model_route_result.json
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
      model.log
      cost.log
      gate.log
      state_transition.log
      graph.log
      resume.log
      install.log
      upgrade.log
      uninstall.log

    cost/
      model_usage.jsonl
      cost_summary.md

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
        model_cost_analysis.md
```

---

## 23. V1 必须实现

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
14. Model Registry + Model Router。
15. Cost Budget。
16. Provider Fallback。
17. Event Bus。
18. State Machine。
19. Agent Run Archive。
20. Logging System。
21. Doctor / Trace / Log / Model / Cost Debug 命令。
22. Checkpoint / Resume。
23. Basic Knowledge Graph。
24. Install / Upgrade / Uninstall。
```

---

## 24. V1 不做

```text
1. 不修改 OpenCode 源码。
2. 不做原生 UI。
3. 不做复杂图数据库。
4. 不做全局知识自动合并。
5. 不做长期后台守护进程。
6. 不做企业级权限系统。
7. 不做自动购买或自动配置模型服务。
8. 不保证所有 provider 都支持同等功能。
```

---

## 25. 开发拆分顺序

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

### Phase 3：Model Layer

```text
models.json
model_policies.json
cost_budget.json
sf_model_route
sf_cost_check
model/cost logs
provider fallback
```

### Phase 4：Superpowers 适配

```text
import upstream skills
SPEC_FORGE_ADAPTER.md
method gate
skill registry
skill loaded event
```

### Phase 5：规格工作流

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

### Phase 6：能力与上下文

```text
context monitor
context builder
capability broker
MCP policy
tool policy
permission guard
```

### Phase 7：执行闭环

```text
executor
debugger
reviewer
verifier
failure controller
model escalation
verification gate
task state update
```

### Phase 8：恢复与调试

```text
checkpoint
resume
doctor
trace
log query
model query
cost query
failure diagnostics
```

### Phase 9：图谱与复盘

```text
graph schema
spec parser
git diff parser
test result parser
graph query
impact analyzer
retro
knowledge candidates
model cost retro
```

---

## 26. 自查结论

### 26.1 当前方案是否能继续开发代码？

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
9. Model Router 和模型策略。
10. Cost Budget。
11. Gate 语义和通过条件。
12. 日志和调试体系。
13. 上下文限制检测。
14. 状态、事件、恢复机制。
15. 知识图谱生产和使用方式。
16. V1 范围和开发拆分。
```

### 26.2 仍需要实现期验证的外部限制

```text
1. OpenCode 插件事件是否能捕获所有需要的 tool/skill/mcp/model 使用事件。
2. OpenCode 是否暴露精确 token usage。
3. OpenCode subagent 权限能否完全禁止子 Agent 调用 task。
4. OpenCode skill 加载事件是否可被插件可靠记录。
5. MCP 动态授权是否需要额外 wrapper。
6. 不同 provider 的模型配置方式是否统一。
7. 模型 actual token usage 是否可获取。
8. Provider fallback 是否能在 OpenCode 层动态切换。
9. Windows PowerShell 安装脚本兼容性。
```

这些是实现验证点，不是方案空洞。

---

## 27. 最终结论

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
Model Router
Cost Budget
Gate Runner
State Machine
Event Bus
Agent Run Archive
Logging System
Knowledge Graph
Resume Engine
```

最重要的四条底线：

```text
1. 主 Agent 不写代码，只做项目管理和用户沟通。
2. 子 Agent 不能自由递归调用，所有调用必须经 orchestrator / failure-controller。
3. 凡是必须 100% 做到的事情，必须由程序、Gate、状态机、权限、日志硬控。
4. 每个 Agent 可以使用不同模型，但必须由 Model Router 统一决策，不能由子 Agent 自行切换。
```

这份 v0.4 可以作为 SpecForge 的工程化开发基线。
