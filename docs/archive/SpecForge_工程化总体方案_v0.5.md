# SpecForge 工程化总体方案 v0.5

> 状态：工程化基线版（经需求讨论修订）
> 本版重点：基于 OpenCode 实际能力验证，精简 Agent 体系，砍掉 Model Router，采用 oh-my-opencode 风格的模型配置，明确 V1 MVP / V1 完整 / V2 三级范围划分。
> 目标：这份文档可以作为后续需求拆分、架构设计、任务生成、代码开发和验收的基线。

---

## 0. v0.5 变更说明

相对 v0.4，v0.5 主要变更：

```text
1. 砍掉 Model Router、Model Registry、Model Policy、Cost Budget、Context Window Matcher、Failure Escalation Policy、Provider Fallback 共 7 个模块。
2. 模型配置改为参考 oh-my-opencode 的 per-agent + category 模式，直接在 opencode.json 中配置。
3. Agent 从 16 个精简到 8 个核心 Agent。
4. 明确 OpenCode 能力边界验证结论。
5. 明确程序硬控 vs Prompt 控制的边界。
6. 明确 V1 MVP / V1 完整 / V2 三级范围划分。
7. ai_dev_os 定位为纯思想来源，不复用代码。
8. Provider fallback 不做，错误直接返回用户处理。
```

v0.5 的关键判断：

```text
不需要 Model Router。OpenCode 原生支持 per-agent 模型配置。
参考 oh-my-opencode 的 category 模式做任务类型到模型的映射。
Gate 和状态流转用 custom tool 实现，不用 skill。
Skill 只用于方法论指导（brainstorming、TDD 等）。
Plugin 用于事件记录、权限拦截等硬控。
Provider fallback V1 不做，V2 再考虑。
```

---

## 1. 项目背景

### 1.1 用户当前的 AI 开发痛点

无论使用哪种 AI 开发工具，真正的问题通常不是"AI 会不会写代码"，而是开发过程缺少工程控制。

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
  不足：不解决 OpenCode 上的自定义运行层，不解决跨项目经验沉淀。

Superpowers
  优点：Agent 执行纪律强，强调 brainstorming、planning、TDD、subagent、review、verification。
  不足：不是完整项目状态机，不负责 Kiro 风格 specs 权威链条。

OpenCode
  优点：有 commands、agents、subagents、skills、tools、plugins、permissions，适合作为运行平台。
  不足：本身不是规格驱动开发产品，不自带 requirements → design → tasks 的强约束。

ai_dev_os
  优点：有工单、状态、风险、复盘、知识候选、全局知识合并思想。
  不足：纯 prompt 驱动，缺少程序硬控。
```

### 1.3 SpecForge 的产生背景

```text
用户希望用 OpenCode 作为 AI 开发运行平台，
吸收 Kiro 的规格驱动思想，
融合 Superpowers 的全流程执行纪律，
加入 ai_dev_os 的状态、复盘、自我提升闭环思想。
```

最终目标：

```text
把"用户随口描述问题"
转成 "已确认需求 / 缺陷说明"
再转成 "受环境约束的设计"
再转成 "可由子 Agent 正确完成的任务"
再转成 "有测试证据的代码"
再转成 "可复盘、可沉淀、可复用的知识"。
```

---

## 2. 产品定位

SpecForge 是：

```text
运行在 OpenCode 上的规格驱动 AI 开发控制系统。
```

核心是：

```text
Kiro Specs 作为规格主线。
Superpowers 作为全流程方法纪律。
OpenCode 作为运行平台。
ai_dev_os 思想作为状态、复盘、自我提升闭环的设计参考。
```


---

## 3. OpenCode 能力边界验证结论

### 3.1 Plugin 事件系统

验证结论：**可用。**

OpenCode 的 plugin 系统提供 25+ 事件钩子：

```text
tool.execute.before / tool.execute.after
  可以拦截和记录所有工具调用。
  tool.execute.before 抛异常可以阻断操作。

session.idle / session.status / session.created / session.compacted
  会话生命周期事件。

permission.asked / permission.replied
  权限事件。

file.edited / file.watcher.updated
  文件变更事件。

message.part.updated / message.updated
  消息事件。
```

SpecForge 可以通过 plugin 实现：事件记录、工具拦截、Gate 结果日志、session 状态监控。

### 3.2 Subagent 权限控制

验证结论：**可用。**

OpenCode 的 `permission.task` 支持 glob 模式：

```json
{
  "permission": {
    "task": {
      "*": "deny",
      "sf-executor": "allow"
    }
  }
}
```

设为 deny 时，subagent 不会出现在 Task 工具描述中，模型根本不知道它的存在。这比 prompt 约束强得多。

### 3.3 Provider Fallback

验证结论：**OpenCode 原生不支持。V1 不做。**

OpenCode 本身没有内置 provider fallback 机制。每个 agent 在配置时绑定一个 `model: "provider/model-id"`，运行时不能动态切换 provider。

V1 策略：provider 出错直接返回错误，由用户处理。V2 再考虑通过网关层（OpenRouter / Vercel AI Gateway）解决。

### 3.4 Custom Tool 能力

验证结论：**可用，是 Gate 和状态流转的正确实现方式。**

OpenCode 的 custom tool 是 TypeScript 程序，支持：

```text
Zod schema 输入验证
文件读写
任意逻辑判断
返回结构化结果
通过 context 获取 session、agent、directory 信息
```

Gate 和状态流转应该实现为 custom tool，而不是 skill。

### 3.5 Skill 能力

验证结论：**只适合方法论指导，不适合硬控。**

Skill 是 SKILL.md 文件，本质是 prompt 指令，由 agent 按需加载。它只能"告诉"agent 应该怎么做，但 agent 可以不遵守。

Skill 适合：brainstorming 方法论、TDD 纪律、code review 标准等。
Skill 不适合：Gate 检查、状态流转、权限控制。

---

## 4. 程序硬控 vs Prompt 控制的边界

### 4.1 能做到程序硬控的

```text
文件读写权限
  → OpenCode permission.edit / permission.read + glob 模式

bash 命令权限
  → OpenCode permission.bash + glob 模式

subagent 调用权限
  → OpenCode permission.task + glob 模式

工具拦截/阻断
  → plugin tool.execute.before 抛异常

事件记录
  → plugin 事件钩子

.env 保护
  → OpenCode 默认 deny .env 文件

外部目录访问
  → permission.external_directory

doom loop 检测
  → OpenCode 内置 doom_loop 权限

skill 加载控制
  → permission.skill + glob 模式
```

### 4.2 只能靠 prompt 约束的

```text
文档边界（需求文档不写设计）
  → OpenCode 没有文档内容语义检查

子 Agent 不能新增需求
  → 语义约束，无法程序化

验证证据才能标记完成
  → 需要 orchestrator prompt 执行

trace matrix 完整性
  → 文档内容检查
```

### 4.3 可以用 custom tool + plugin 做到"半硬控"的

```text
Gate 检查
  → 写成 custom tool，orchestrator 调用后根据返回值决定是否继续
  → tool 内部的检查逻辑是程序化的、确定性的

状态流转
  → 写成 custom tool，读写 state.json，带验证逻辑

文档 lint
  → 写成 custom tool，检查文档结构和边界

事件记录
  → plugin tool.execute.after 自动记录

checkpoint
  → plugin session.compacting 钩子 + custom tool
```

说明：orchestrator 仍然是通过 prompt 被指导去调用这些 tool，但 tool 内部的检查逻辑本身是程序化的。这是 OpenCode 体系下最务实的"硬控"方案。

---

## 5. 总体架构

```text
SpecForge
  ├── Orchestration Layer
  │   ├── sf-orchestrator（primary agent）
  │   ├── state machine（custom tool）
  │   ├── event logger（plugin）
  │   └── gate runner（custom tool）
  │
  ├── Agent Layer（8 个核心 Agent）
  │   ├── sf-orchestrator
  │   ├── sf-requirements-agent
  │   ├── sf-design-agent
  │   ├── sf-task-planner-agent
  │   ├── sf-executor-agent
  │   ├── sf-debugger-agent
  │   ├── sf-reviewer-agent
  │   └── sf-verifier-agent
  │
  ├── Spec Layer
  │   ├── intake protocol
  │   ├── requirements protocol
  │   ├── bugfix protocol
  │   ├── design protocol
  │   ├── tasks protocol
  │   └── traceability protocol
  │
  ├── Control Layer（custom tools）
  │   ├── sf_doc_lint
  │   ├── sf_requirements_gate
  │   ├── sf_design_gate
  │   ├── sf_tasks_gate
  │   ├── sf_verification_gate
  │   └── sf_state_transition
  │
  ├── Method Layer（skills）
  │   ├── superpowers-brainstorming
  │   ├── superpowers-writing-plans
  │   ├── superpowers-subagent-driven-development
  │   ├── superpowers-tdd
  │   ├── superpowers-systematic-debugging
  │   ├── superpowers-verification-before-completion
  │   └── superpowers-code-review
  │
  ├── Plugin Layer
  │   ├── sf_event_logger
  │   ├── sf_permission_guard
  │   └── sf_checkpoint
  │
  └── Persistence Layer
      ├── runtime state
      ├── specs
      ├── archive
      ├── logs
      └── sessions
```

---

## 6. 核心原则

### 6.1 主 Agent 是项目经理，不是程序员

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

### 6.2 子 Agent 是专业执行者

每个子 Agent 只处理一个专业领域。

### 6.3 程序硬控优先

以下内容尽量用 custom tool / plugin / permission 实现，不靠 prompt：

```text
Gate 通过与否（custom tool）
状态流转（custom tool）
权限控制（OpenCode permission）
文档结构检查（custom tool）
事件记录（plugin）
doom loop 检测（OpenCode 内置）
subagent 调用控制（permission.task）
```

### 6.4 全部事实落盘

聊天上下文不是事实来源。权威事实来源：

```text
specforge/runtime/state.json
specforge/specs/<work_item_id>/
specforge/archive/
specforge/logs/
git diff / commit
test result
```


---

## 7. Agent 体系

### 7.1 精简后的 Agent 总表（8 个）

| Agent | 类型 | 谁调用 | 主要职责 | 是否可改代码 | 是否可问用户 |
|---|---|---|---|---|---|
| sf-orchestrator | primary | 用户 / OpenCode | 项目管理、流程推进、用户沟通、意图判断、工作流选择 | 否 | 是 |
| sf-requirements-agent | subagent | orchestrator | 需求澄清、业务分析、边界分类、用户确认（合并原 domain-analyst） | 否 | 经 orchestrator |
| sf-design-agent | subagent | orchestrator | 架构设计、环境约束收集、接口、数据、测试策略（合并原 environment-agent、test-architect） | 否 | 经 orchestrator |
| sf-task-planner-agent | subagent | orchestrator | 设计转 tasks，依赖和验证要求 | 否 | 否 |
| sf-executor-agent | subagent | orchestrator | 执行单个 task | 是，受限 | 否 |
| sf-debugger-agent | subagent | orchestrator | 处理技术失败 | 是，受限 | 否 |
| sf-reviewer-agent | subagent | orchestrator | 规格审查 + 代码审查（合并原 spec-reviewer、code-reviewer） | 默认只读 | 否 |
| sf-verifier-agent | subagent | orchestrator | 执行测试、验收、冒烟、回归 | 只读，可运行命令 | 否 |

### 7.2 精简理由

```text
砍掉 sf-intent-router-agent：
  orchestrator 自己判断意图，不需要单独 agent。
  意图判断是简单分类，不值得一次 subagent 调用的开销。

砍掉 sf-workflow-suggester-agent：
  orchestrator 自己建议工作流。

合并 sf-domain-analyst-agent 到 sf-requirements-agent：
  业务分析是需求阶段的子任务，不需要独立 agent。

合并 sf-environment-agent 到 sf-design-agent：
  环境收集是设计阶段的前置步骤。

合并 sf-test-architect-agent 到 sf-design-agent：
  测试策略是设计的一部分。

合并 sf-spec-reviewer-agent + sf-code-reviewer-agent 为 sf-reviewer-agent：
  一个 reviewer 做两种审查，减少调度开销。

砍掉 sf-release-agent：
  V1 不需要自动发布。

sf-retro-agent 移到 V2：
  复盘是锦上添花，MVP 不需要。
```

### 7.3 Agent 文件体系

每个 Agent 有两个文件：

```text
.opencode/agents/<agent-name>.md
  给 OpenCode 使用，定义角色、权限、描述、系统提示。

specforge/agents/contracts/<agent-name>.contract.md
  给 SpecForge 运行时和开发者使用，定义输入输出契约、禁止行为、升级条件。
```

### 7.4 Agent 文件通用结构

```markdown
---
description: Execute one approved SpecForge task using minimal context.
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.2
steps: 30
permission:
  edit: ask
  bash: ask
  task: deny
  skill: ask
---

# Role

你是 SpecForge 的任务执行子 Agent。你只执行一个已通过 Execution Gate 的 task。

# Responsibilities

（具体职责）

# Boundaries

（禁止行为）

# Required Output

（必须输出的文件）
```

### 7.5 全局 Agent Constitution

```text
specforge/agents/AGENT_CONSTITUTION.md
```

规定所有 Agent 的共同底线：

```text
1. 不得绕过 Gate。
2. 不得伪造验证。
3. 不得把推测当事实。
4. 不得直接修改权威状态（必须通过 sf_state_transition tool）。
5. 不得越权调用工具。
6. 不得直接向用户提问，除 orchestrator 外。
7. 不得创建未授权子 Agent。
8. 不得在需求文档中写设计。
9. 不得在设计文档中写任务。
```

---

## 8. 模型配置

### 8.1 设计原则

```text
不做 Model Router。
不做 Model Registry。
不做 Model Policy。
不做 Cost Budget 模块。
不做 Provider Fallback。

模型配置直接使用 OpenCode 原生的 per-agent model 配置。
参考 oh-my-opencode 的 category 模式做任务类型到模型的映射。
```

### 8.2 Per-Agent 模型配置

在 opencode.json 中为每个 agent 指定模型：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "sf-orchestrator": {
      "mode": "primary",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./.opencode/agents/sf-orchestrator.md}"
    },
    "sf-requirements": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./.opencode/agents/sf-requirements.md}"
    },
    "sf-design": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./.opencode/agents/sf-design.md}"
    },
    "sf-task-planner": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./.opencode/agents/sf-task-planner.md}"
    },
    "sf-executor": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./.opencode/agents/sf-executor.md}"
    },
    "sf-debugger": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./.opencode/agents/sf-debugger.md}"
    },
    "sf-reviewer": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./.opencode/agents/sf-reviewer.md}",
      "permission": { "edit": "deny" }
    },
    "sf-verifier": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./.opencode/agents/sf-verifier.md}",
      "permission": { "edit": "deny" }
    }
  }
}
```

说明：以上模型为示例默认值。用户可以根据自己的 provider 和预算自由替换。

### 8.3 模型选择建议

```text
sf-orchestrator：
  需要稳定、强推理、长上下文。
  推荐：Claude Sonnet 4 / Claude Opus 4 / GPT-5

sf-requirements-agent：
  需要强推理、强中文理解。
  推荐：Claude Sonnet 4 / Claude Opus 4

sf-design-agent：
  需要最强架构推理。
  推荐：Claude Opus 4 / GPT-5

sf-task-planner-agent：
  需要结构化输出强。
  推荐：Claude Sonnet 4 / GPT-5

sf-executor-agent：
  需要强 coding。
  推荐：Claude Sonnet 4 / GPT-5 Codex

sf-debugger-agent：
  需要强 coding + 工具使用。
  推荐：Claude Sonnet 4 / GPT-5

sf-reviewer-agent：
  需要强规则遵循。
  推荐：Claude Sonnet 4

sf-verifier-agent：
  主要跑工具，成本可控即可。
  推荐：Claude Haiku 4 / GPT-5 Mini
```

### 8.4 Provider 出错处理

```text
V1 策略：
  Provider 出错直接返回错误信息给 orchestrator。
  orchestrator 向用户报告错误。
  用户自行决定是否切换模型或 provider。

V2 考虑：
  通过 OpenRouter / Vercel AI Gateway 等网关层实现 provider fallback。
```


---

## 9. 子 Agent 调用层级与防闭环

### 9.1 基本规则

```text
只有 sf-orchestrator 可以创建子 Agent。
普通子 Agent 不允许直接调用其他子 Agent。
```

### 9.2 调用深度限制

```text
Depth 0: 用户 / OpenCode 主会话
Depth 1: sf-orchestrator
Depth 2: 子 Agent
Depth 3: 禁止
```

### 9.3 防闭环机制

通过 OpenCode permission.task 控制：

```json
{
  "agent": {
    "sf-executor": {
      "permission": { "task": "deny" }
    },
    "sf-debugger": {
      "permission": { "task": "deny" }
    },
    "sf-reviewer": {
      "permission": { "task": "deny" }
    }
  }
}
```

子 Agent 的 task 权限设为 deny，从根本上阻止子 Agent 调用其他子 Agent。

### 9.4 失败重试限制

```text
同一 task 最多：
  executor attempt: 2
  debugger attempt: 1
  review repair loop: 1
超过后 blocked。

同一工具相同输入连续失败 3 次：
  触发 OpenCode 内置 doom_loop 检测。
```

---

## 10. Superpowers 落地方式

### 10.1 策略

```text
Upstream Skills + SpecForge Adapter
```

保留 Superpowers 原始 skills 的核心方法论，在 SpecForge 中建立适配层。

### 10.2 落地目录

```text
.opencode/skills/
  superpowers-brainstorming/
    SKILL.md

  superpowers-writing-plans/
    SKILL.md

  superpowers-subagent-driven-development/
    SKILL.md

  superpowers-tdd/
    SKILL.md

  superpowers-systematic-debugging/
    SKILL.md

  superpowers-verification-before-completion/
    SKILL.md

  superpowers-code-review/
    SKILL.md
```

### 10.3 Superpowers 权威边界

```text
SpecForge tasks.md 是权威任务清单。
Superpowers writing-plans 只能为单个 task 生成 execution_plan。
Superpowers subagent-driven-development 只能执行已通过 tasks-gate 的 task。
Superpowers review 结果进入 review gate。
Superpowers verification 结果进入 verification gate。
Superpowers 不能自行创建新需求、新设计、新顶层任务。
```

### 10.4 工作流中的 Superpowers 约束

```text
Requirements 阶段：必须使用 brainstorming
Design 阶段：必须使用 brainstorming / design alternatives
Tasks 阶段：必须使用 writing-plans
Development 阶段：必须使用 subagent-driven-development + tdd
Verification 阶段：必须使用 verification-before-completion
Bugfix 阶段：必须使用 systematic-debugging
```

---

## 11. 工作流

### 11.1 工作流类型

V1 MVP：

```text
feature_spec（Requirements-First）
bugfix_spec
```

V1 完整：

```text
feature_spec（Requirements-First + Design-First）
bugfix_spec
quick_change
```

V2：

```text
change_request
refactor
ops_task
investigation
resume
retro
```

### 11.2 Feature Spec 工作流

```text
入口：用户提出新功能。

阶段：
  1. intake → orchestrator 收集初始信息
  2. requirements → sf-requirements-agent + brainstorming skill
  3. requirements_gate → sf_requirements_gate tool
  4. design → sf-design-agent
  5. design_gate → sf_design_gate tool
  6. tasks → sf-task-planner-agent + writing-plans skill
  7. tasks_gate → sf_tasks_gate tool
  8. development → sf-executor-agent + subagent-driven-development skill
  9. review → sf-reviewer-agent + code-review skill
  10. verification → sf-verifier-agent + verification-before-completion skill
  11. verification_gate → sf_verification_gate tool

产物：
  intake.md
  requirements.md
  design.md
  tasks.md
  trace_matrix.md
  changed files
  test results
  verification_report
```

### 11.3 Bugfix Spec 工作流

```text
入口：用户报告异常。

阶段：
  1. intake → orchestrator 收集 bug 信息
  2. bugfix_analysis → sf-requirements-agent + systematic-debugging skill
  3. bugfix_gate → sf_requirements_gate tool（bugfix 模式）
  4. fix_design → sf-design-agent
  5. design_gate → sf_design_gate tool
  6. tasks → sf-task-planner-agent
  7. tasks_gate → sf_tasks_gate tool
  8. development → sf-executor-agent + tdd skill
  9. verification → sf-verifier-agent + verification-before-completion skill
  10. verification_gate → sf_verification_gate tool

产物：
  bugfix.md（current behavior / expected behavior / unchanged behavior / root cause）
  design.md
  tasks.md
  regression tests
  verification_report
```

---

## 12. Control Layer（Custom Tools）

### 12.1 Gate Tools

每个 Gate 是一个 custom tool，放在 `.opencode/tools/` 目录：

```text
.opencode/tools/
  sf_state_read.ts
  sf_state_transition.ts
  sf_doc_lint.ts
  sf_requirements_gate.ts
  sf_design_gate.ts
  sf_tasks_gate.ts
  sf_verification_gate.ts
```

### 12.2 Gate 通用输出

```json
{
  "status": "pass | fail | blocked",
  "blocking_issues": [],
  "warnings": [],
  "next_action": "continue | revise | ask_user"
}
```

### 12.3 状态机

状态流转通过 `sf_state_transition` tool 实现：

```text
输入：
  work_item_id
  from_state
  to_state
  evidence（Gate 结果、用户确认等）

逻辑：
  检查 from_state 是否是当前状态
  检查 to_state 是否是合法的下一状态
  写入 state.json
  追加事件到 events.jsonl

输出：
  success / failure
  reason
```

---

## 13. Plugin Layer

### 13.1 sf_event_logger

```text
路径：.opencode/plugins/sf_event_logger.ts

职责：
  监听 tool.execute.after 事件
  记录所有工具调用到 specforge/logs/tool_calls.jsonl
  监听 session.idle / session.status 事件
  记录会话状态变化

日志格式：JSONL
```

### 13.2 sf_permission_guard

```text
路径：.opencode/plugins/sf_permission_guard.ts

职责：
  监听 tool.execute.before 事件
  检查敏感操作（如修改 requirements.md、design.md、tasks.md）
  对非授权 agent 的修改尝试抛异常阻断
```

### 13.3 sf_checkpoint

```text
路径：.opencode/plugins/sf_checkpoint.ts

职责：
  监听 session.compacting 事件
  在 compaction 前保存当前状态快照到 specforge/runtime/checkpoints/
  注入恢复上下文到 compaction prompt
```

---

## 14. 日志体系

### 14.1 日志目录

```text
specforge/logs/
  app.log          工作流事件
  error.log        错误
  gate.log         Gate 结果
  tool_calls.jsonl 工具调用记录（plugin 自动记录）
```

### 14.2 日志格式

```json
{
  "timestamp": "2026-05-03T12:00:00Z",
  "level": "INFO",
  "work_item_id": "WI-001",
  "component": "sf_requirements_gate",
  "event": "gate.executed",
  "message": "Requirements gate passed",
  "payload": {}
}
```

### 14.3 敏感信息处理

```text
默认不记录 .env、API key、token、password 等敏感内容。
记录 redacted placeholder。
```

---

## 15. 权威状态与事件系统

### 15.1 权威状态

```text
specforge/runtime/state.json
```

### 15.2 事件流

```text
specforge/runtime/events.jsonl
```

核心事件类型：

```text
work_item.created
document.generated
gate.executed
state.transitioned
agent_run.created
agent_run.completed
agent_run.failed
verification.executed
```

---

## 16. 目录结构

```text
project-root/
  AGENTS.md
  opencode.json

  .opencode/
    agents/
      sf-orchestrator.md
      sf-requirements.md
      sf-design.md
      sf-task-planner.md
      sf-executor.md
      sf-debugger.md
      sf-reviewer.md
      sf-verifier.md

    skills/
      superpowers-brainstorming/SKILL.md
      superpowers-writing-plans/SKILL.md
      superpowers-subagent-driven-development/SKILL.md
      superpowers-tdd/SKILL.md
      superpowers-systematic-debugging/SKILL.md
      superpowers-verification-before-completion/SKILL.md
      superpowers-code-review/SKILL.md

    tools/
      sf_state_read.ts
      sf_state_transition.ts
      sf_doc_lint.ts
      sf_requirements_gate.ts
      sf_design_gate.ts
      sf_tasks_gate.ts
      sf_verification_gate.ts

    plugins/
      sf_event_logger.ts
      sf_permission_guard.ts
      sf_checkpoint.ts

  specforge/
    agents/
      AGENT_CONSTITUTION.md
      contracts/
        sf-orchestrator.contract.md
        sf-requirements.contract.md
        sf-design.contract.md
        sf-task-planner.contract.md
        sf-executor.contract.md
        sf-debugger.contract.md
        sf-reviewer.contract.md
        sf-verifier.contract.md

    config/
      project.json
      risk_policy.json

    specs/
      <work_item_id>/
        spec.json
        intake.md
        requirements.md
        bugfix.md
        design.md
        tasks.md
        trace_matrix.md
        open_questions.md
        user_confirmations.md

    runtime/
      state.json
      events.jsonl
      checkpoints/

    sessions/
      <session_id>/
        session_summary.md
        decisions.md

    archive/
      agent_runs/
        <run_id>/
          result.json
          result.md
          files_changed.json

    logs/
      app.log
      error.log
      gate.log
      tool_calls.jsonl
```


---

## 17. 版本范围划分

### 17.1 V1 MVP（先跑通一个完整闭环）

```text
1. 目录结构创建
2. 8 个 Agent 的 .opencode/agents/*.md 文件
3. 8 个 Agent 的 contract 文件
4. opencode.json 配置（agent、permission、model）
5. AGENT_CONSTITUTION.md
6. sf-orchestrator 核心流程（意图判断 → 工作流选择 → 阶段推进）
7. Feature Spec 工作流（Requirements-First）
8. 4 个核心 Gate（requirements_gate、design_gate、tasks_gate、verification_gate）作为 custom tool
9. sf_state_read + sf_state_transition custom tool
10. sf_doc_lint custom tool
11. sf_event_logger plugin
12. state.json + events.jsonl 基础结构
13. superpowers-brainstorming skill 适配
14. superpowers-verification-before-completion skill 适配
15. 基础日志（app.log、error.log、gate.log）
```

### 17.2 V1 完整

在 MVP 基础上增加：

```text
16. Bugfix Spec 工作流
17. Feature Spec Design-First 工作流
18. Quick Change 工作流
19. 剩余 Superpowers skill 适配（writing-plans、subagent-driven-development、tdd、systematic-debugging、code-review）
20. sf_permission_guard plugin
21. sf_checkpoint plugin
22. session 恢复机制
23. trace_matrix 检查
24. Agent Run Archive（result.json、files_changed.json）
25. 调试命令（/sf-status、/sf-doctor）
```

### 17.3 V2

```text
1. Provider Fallback（通过网关层）
2. sf-retro-agent + 复盘工作流
3. Knowledge Graph（基础版）
4. Context Builder / Capability Broker
5. Context Monitor（上下文限制检测）
6. 并行任务控制
7. 更多工作流（change_request、refactor、ops_task、investigation）
8. 成本记录与审计
9. 知识候选与全局知识合并
10. Install / Upgrade / Uninstall 命令
11. 完整调试命令集（/sf-trace、/sf-log、/sf-cost）
```

---

## 18. 开发拆分顺序（V1 MVP）

### Phase 1：基础骨架

```text
目录结构
state.json 初始结构
events.jsonl 初始结构
AGENT_CONSTITUTION.md
project.json / risk_policy.json
```

### Phase 2：Agent 文件

```text
8 个 agent.md 文件
8 个 contract 文件
opencode.json 配置
```

### Phase 3：Custom Tools

```text
sf_state_read.ts
sf_state_transition.ts
sf_doc_lint.ts
sf_requirements_gate.ts
sf_design_gate.ts
sf_tasks_gate.ts
sf_verification_gate.ts
```

### Phase 4：Plugin

```text
sf_event_logger.ts
```

### Phase 5：Superpowers 适配

```text
superpowers-brainstorming/SKILL.md
superpowers-verification-before-completion/SKILL.md
```

### Phase 6：Orchestrator 核心流程

```text
sf-orchestrator.md 完善（意图判断、工作流选择、阶段推进、Gate 调用、子 Agent 调度）
Feature Spec Requirements-First 工作流完整链路
```

---

## 19. V1 不做

```text
1. 不修改 OpenCode 源码。
2. 不做原生 UI。
3. 不做 Model Router。
4. 不做 Model Registry。
5. 不做 Cost Budget 模块。
6. 不做 Provider Fallback。
7. 不做复杂图数据库。
8. 不做全局知识自动合并。
9. 不做长期后台守护进程。
10. 不做企业级权限系统。
```

---

## 20. 技术失败闭环

### 20.1 失败分类

```text
implementation_failure
test_failure
environment_failure
permission_failure
design_conflict
requirement_ambiguity
tool_failure
timeout
unknown
```

### 20.2 重试策略

```text
同一 task 最多：
  executor attempt: 2
  debugger attempt: 1
  review repair loop: 1
超过后 blocked，报告用户。

doom loop：
  OpenCode 内置检测，同一工具相同输入连续失败 3 次自动阻断。
```

### 20.3 失败后处理顺序

```text
1. 分类 failure_type。
2. 如果是 implementation/test failure，走 debugger。
3. 如果是 environment_failure，报告用户。
4. 如果是 permission_failure，报告用户。
5. 如果是 design/requirement conflict，orchestrator 向用户说明。
6. 如果超过重试次数，mark blocked，报告用户。
```

---

## 21. 质量验证体系

### 21.1 硬规则

```text
没有 verification_commands，task 不能执行。
没有验证证据，task 不能 completed。
bugfix 没有 regression test，不能 close。
```

### 21.2 测试类型

V1 MVP 支持：

```text
unit tests
integration tests
```

V1 完整增加：

```text
regression tests
smoke tests
```

V2 增加：

```text
contract tests
end-to-end tests
performance tests
security tests
```

---

## 22. 最终结论

SpecForge v0.5 的工程定位：

```text
运行在 OpenCode 上的规格驱动 AI 开发控制系统。
```

核心组件：

```text
Orchestrator（primary agent）
Agent Contracts（8 个精简 Agent）
Superpowers Skills（方法论适配层）
Custom Tools（Gate、状态机、文档 lint）
Plugins（事件记录、权限守卫、checkpoint）
OpenCode Permission（文件/命令/subagent 硬控）
```

最重要的底线：

```text
1. 主 Agent 不写代码，只做项目管理和用户沟通。
2. 子 Agent 不能调用其他子 Agent（permission.task = deny）。
3. Gate 和状态流转用 custom tool 实现，不靠 prompt。
4. 模型配置直接用 OpenCode 原生 per-agent 配置，不做 Model Router。
5. Provider 出错直接返回用户，V1 不做 fallback。
```

这份 v0.5 可以作为 SpecForge 的工程化开发基线。
