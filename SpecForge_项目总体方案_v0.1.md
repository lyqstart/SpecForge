# SpecForge 项目总体方案 v0.1

## 0. 项目名称

建议项目名：

```text
SpecForge
```

中文名：

```text
规格锻造
```

项目目录名：

```text
specforge/
```

命令前缀：

```text
/sf-
```

这个名字的含义是：把模糊想法锻造成规格，把规格锻造成设计，把设计锻造成任务，把任务锻造成代码，把失败锻造成经验。

---

## 1. 项目总体目标

SpecForge 是一个运行在 OpenCode 上的规格驱动 AI 开发框架。

它的最终目标是：

> 让 AI 开发过程从“凭聊天写代码”变成“可澄清、可确认、可追踪、可验证、可恢复、可复盘、可自我提升”的工程化开发流程。

核心思想来源：

| 来源 | 在 SpecForge 中的角色 |
|---|---|
| Kiro | 规格驱动主流程：requirements / bugfix → design → tasks |
| Superpowers | 全流程执行纪律：brainstorming、planning、TDD、subagent、review、verification |
| OpenCode | 运行平台：agent、subagent、command、skill、tool、plugin、permission |
| ai_dev_os | 状态机、工单路由、复盘、自我提升、知识合并思想 |

Kiro Specs 的公开结构对应我们的主链路：每个 spec 由 `requirements.md` 或 `bugfix.md`、`design.md`、`tasks.md` 组成，并通过三阶段流程把需求或缺陷分析转成设计和可执行任务。

Superpowers 不是单纯的 coding skill，而是从澄清、规格、计划、TDD、子 Agent 执行到 review 的完整开发方法论。

OpenCode 提供 primary agents、subagents、自定义命令、按需 skills、custom tools、plugins、permissions 等运行机制。

ai_dev_os 现有思路中已经包含规则、路由、模板、运行状态、项目复盘、全局同步，且明确运行状态以文件为准而不是聊天记忆，这些应被吸收进 SpecForge。

---

## 2. SpecForge 要解决的核心问题

项目要解决 10 类核心问题。

```text
1. 文档边界失控
   需求里混设计，设计里混任务，任务里混实现细节。

2. 需求澄清不足
   AI 不从业务、成本、人员、管理、运维、扩展、合规等角度帮助用户补全需求。

3. 默认假设失控
   AI 遇到不明确问题时偷偷默认，而不是询问用户。

4. 规格推导断裂
   requirements → design → tasks 没有严格追踪关系。

5. 设计脱离环境
   AI 不充分了解软件、硬件、数据库、网络、部署、使用范围、成本约束就开始设计。

6. 任务拆分不稳定
   task 太大，大模型做不完；task 太小，又造成管理成本和 token 浪费。

7. 测试体系不完整
   只有单元测试不够，还需要集成、契约、端到端、业务流程、回归、冒烟、性能、安全、数据完整性等验证。

8. 主 Agent 被污染
   主 Agent 不该直接解决技术问题，否则失败重试会污染主会话和项目判断。

9. 开发过程不可恢复
   会话爆上下文、用户中断、设备断电后，无法准确继续。

10. 成本失控
   Agent 被喂太多无关上下文、工具、skill、MCP，导致 token 高、准确率低。
```

所以 SpecForge 的本质不是“多几个命令”，而是一个 **AI 开发质量控制系统**。

---

## 3. 总体架构

```text
SpecForge
  ├── Spec Layer 规格层
  │   ├── requirements protocol
  │   ├── bugfix protocol
  │   ├── design protocol
  │   ├── tasks protocol
  │   └── traceability protocol
  │
  ├── Method Layer 方法层
  │   ├── Superpowers brainstorming
  │   ├── Superpowers writing-plans
  │   ├── Superpowers TDD
  │   ├── Superpowers systematic-debugging
  │   ├── Superpowers subagent-driven-development
  │   ├── Superpowers verification-before-completion
  │   └── Superpowers code-review
  │
  ├── Runtime Layer 运行层
  │   ├── OpenCode commands
  │   ├── OpenCode agents / subagents
  │   ├── OpenCode skills
  │   ├── OpenCode custom tools
  │   ├── OpenCode plugins
  │   └── OpenCode permissions
  │
  ├── Control Layer 控制层
  │   ├── document boundary lint
  │   ├── requirements gate
  │   ├── design gate
  │   ├── tasks gate
  │   ├── verification gate
  │   ├── risk policy
  │   ├── context manifest
  │   ├── agent run monitor
  │   └── state machine
  │
  ├── Knowledge Layer 知识层
  │   ├── graph index
  │   ├── result ledger
  │   ├── full transcript archive
  │   ├── retro
  │   ├── failure patterns
  │   └── knowledge candidates
  │
  └── UX Layer 用户体验层
      ├── intent router
      ├── workflow suggester
      ├── progress dashboard text output
      ├── resume support
      └── install / upgrade / uninstall
```

---

## 4. 用户体验原则

用户不应该学习复杂命令。

用户可以直接说：

```text
这个页面显示不对。
```

系统应该识别：

```text
这可能是 bugfix / UI behavior issue。
```

然后引导：

```text
我建议进入 bugfix 流程，因为这里涉及“当前行为”和“期望行为”的对比。

请选择：
1. 进入 bugfix 流程
2. 先继续排查，不改代码
3. 暂时不处理
```

用户也可能只是问问题：

```text
后台现在有多少个下载任务？
```

系统先回答问题。如果工具检查发现：

```text
后台没有下载任务，但前端显示有下载任务
```

系统应该回答完后提示：

```text
我检查到后台当前没有正在运行的下载任务，但前端仍显示有下载任务在运行。
这可能是前端状态、接口缓存、任务表清理或状态同步逻辑的问题。

是否进入 bugfix 流程定位？
1. 进入 bugfix 流程
2. 继续只排查，不改代码
3. 暂时不处理
```

这叫：

```text
Post-Answer Workflow Suggestion
回答后工作流建议
```

也叫：

```text
Reactive Triage
反应式分流
```

规则是：

> 用户问问题时，系统先回答问题；如果过程中发现异常，再建议进入工作流。未经用户确认，不自动创建正式工单。

---

## 5. 主流程

SpecForge 的主流程只有一条：

```text
用户输入
  ↓
Intent Router 意图识别
  ↓
Workflow Suggestion 工作流建议
  ↓
Work Item 创建或进入队列
  ↓
Requirements / Bugfix
  ↓
Design
  ↓
Tasks
  ↓
Task Execution
  ↓
Verification
  ↓
Review
  ↓
Close
  ↓
Retro
  ↓
Knowledge Candidate
```

不能出现 Kiro 一套流程、Superpowers 一套流程、ai_dev_os 一套流程。四者必须被融合成一个主流程。

---

## 6. 文档边界协议

这是项目最重要的基础规则之一。

### 6.1 requirements.md 边界

只允许写：

```text
用户目标
业务行为
角色
场景
功能需求
非功能需求
验收标准
约束
范围内 / 范围外
待确认问题
```

不允许写：

```text
架构方案
数据库设计
API 路由
类名
函数名
代码实现
任务步骤
文件修改清单
```

Kiro Feature Specs 使用 EARS 形式表达结构化、可测试、可追踪需求，例如：

```text
WHEN [condition/event]
THE SYSTEM SHALL [expected behavior]
```

这个格式应作为 SpecForge requirements 的基础。

### 6.2 bugfix.md 边界

bugfix 必须写清楚：

```text
Current Behavior
Expected Behavior
Unchanged Behavior
Root Cause Evidence
Regression Prevention
```

### 6.3 design.md 边界

允许写：

```text
架构
组件职责
接口契约
数据模型
数据流
错误处理
权限模型
部署拓扑
测试策略
风险与取舍
需求覆盖关系
```

不允许写：

```text
新增需求
用户未确认的业务范围
具体 task 步骤
具体代码
文件级修改命令
```

### 6.4 tasks.md 边界

允许写：

```text
任务 ID
任务目标
依赖关系
允许修改范围
禁止修改范围
关联需求
关联设计
验收标准
验证命令
状态
风险等级
回滚说明
```

不允许写：

```text
新需求
新设计决策
长篇架构说明
无边界的“实现整个系统”
```

---

## 7. Gate 机制

Prompt 不能保证质量。必须有程序硬控。

### 7.1 Requirements Gate

进入 design 前必须通过：

```text
1. 每条需求有稳定 ID
2. 每条需求是可测试行为
3. 每条需求有用户确认状态
4. 没有 critical open question
5. 没有混入设计内容
6. 非功能需求有可验证指标
7. 明确 in scope / out of scope
8. 用户确认 requirements baseline
```

### 7.2 Design Gate

进入 tasks 前必须通过：

```text
1. 每条 requirement 都被 design 覆盖
2. 每个 design item 都能追溯到 requirement 或 constraint
3. 没有 unresolved design blocker
4. 没有混入 task 内容
5. 已读取 environment / constraints
6. 已说明架构取舍
7. 已说明测试策略
```

### 7.3 Tasks Gate

进入开发前必须通过：

```text
1. 每个 design item 都有 task 覆盖
2. 每个 task 有明确完成标准
3. 每个 task 有验证方式
4. 每个 task 粒度适中
5. 每个 task 有 allowed / forbidden scope
6. 任务依赖图无循环
7. 高风险 task 有回滚方案
```

### 7.4 Verification Gate

任务完成前必须通过：

```text
1. 必要测试已执行
2. 测试结果已落盘
3. changed files 已记录
4. trace matrix 已更新
5. result ledger 已更新
6. review 无阻塞问题
7. 高风险操作有用户确认
```

---

## 8. 多 Agent 架构

### 8.1 核心原则

主 Agent 不负责技术实现。

主 Agent 只负责：

```text
项目管理
用户沟通
状态推进
风险升级
工作流选择
子 Agent 调度
质量门禁
```

子 Agent 负责技术工作。

OpenCode 支持 primary agents 和 subagents，primary agent 是主会话，subagents 是专门助手，可由 primary agent 调用。OpenCode command 还支持 `subtask: true`，可强制命令以 subagent 方式执行，避免污染 primary context。

### 8.2 Agent 分工

```text
sf-orchestrator
主 Agent。项目经理、调度器、用户接口。不写代码。

sf-intent-router-agent
识别用户意图，推荐流程。

sf-workflow-suggester-agent
回答问题后发现异常时，建议进入工作流。

sf-requirements-agent
需求澄清、边界分类、用户确认。

sf-domain-analyst-agent
从业务、经济、人员、管理、运维、合规、扩展角度补全需求。

sf-design-agent
架构设计、环境约束分析、方案比较。

sf-test-architect-agent
测试策略、验收计划、回归范围。

sf-task-planner-agent
把 design 拆成 tasks，生成依赖图和验证要求。

sf-context-builder
构造最小上下文包。尽量程序化。

sf-executor-agent
执行单个 task，只拿当前 task 的必要上下文。

sf-debugger-agent
处理技术失败，不改需求设计。

sf-spec-reviewer-agent
检查实现是否符合 spec。

sf-code-reviewer-agent
检查代码质量、安全、性能、可维护性。

sf-verifier-agent
执行测试、验收、回归、冒烟。

sf-release-agent
生成 release notes、部署说明、回滚说明。

sf-retro-agent
复盘完整 archive，提炼 failure patterns。
```

### 8.3 子 Agent 失败处理

子 Agent 失败后，不应立即把技术问题丢给主 Agent。

正确链路：

```text
executor-agent 失败
  ↓
debugger-agent 接手
  ↓
仍失败
  ↓
reviewer-agent 判断失败类型
  ↓
如果是实现问题：继续技术闭环
如果是环境问题：进入 environment blocked
如果是设计问题：升级给主 Agent
如果是需求问题：升级给主 Agent
```

主 Agent 只有在这些情况下问用户：

```text
需求不清楚
设计假设错误
环境约束缺失
成本/风险超出预期
需要改变设计
需要缩减范围
需要人工介入
```

---

## 9. 渐进式 Tool / Skill / MCP 加载

### 9.1 原则

不能一开始把所有工具、skills、MCP、规格文档、历史记录全部塞给 Agent。

上下文分三层：

```text
L0 Mandatory Pack
必须全文给：
- 当前 task
- 关联 requirements
- 关联 design items
- acceptance criteria
- allowed / forbidden files
- verification commands

L1 Optional Index
只给索引：
- 相关代码文件索引
- 可用工具索引
- 可用 skills 索引
- MCP 能力索引
- 历史 failure pattern 标题

L2 Cold Archive
默认不给：
- 完整会话
- 完整日志
- 全局知识库全文
- 无关 specs
- 旧任务细节
```

OpenCode skills 本来就是按需加载：Agent 看到可用 skill 列表，需要时通过原生 `skill` tool 加载完整内容。

### 9.2 Registry

建立统一注册表：

```text
specforge/registry/
  agents.json
  tools.json
  skills.json
  mcp.json
```

每个条目记录：

```text
适用阶段
允许使用的 agent
风险等级
是否必须执行
输入契约
输出契约
成本等级
权限要求
```

### 9.3 Context Manifest

每次派发 Agent 前生成：

```text
context_manifest.json
```

包括：

```text
mandatory_context
optional_indexes
allowed_tools
allowed_skills
allowed_mcp
forbidden_context
token_budget
```

### 9.4 必须执行的工具不能靠 AI 自觉

例如：

```text
进入 design 前必须执行 sf_requirements_gate
进入 tasks 前必须执行 sf_design_gate
任务完成前必须执行 sf_task_verify
关闭 spec 前必须执行 sf_trace_check
```

如果工具没执行，状态机不允许推进。

---

## 10. 可观测性、断点恢复、上下文爆炸处理

### 10.1 所有状态必须落盘

```text
specforge/runtime/
  state.json
  current_work_item.json
  current_task.json
  work_queue.json
  checkpoints/
  result_ledger.md
  events.jsonl
```

### 10.2 每个 Agent run 必须落盘

```text
specforge/archive/agent_runs/<run_id>/
  request.json
  context_manifest.json
  full_conversation.jsonl
  tool_calls.jsonl
  stdout.log
  stderr.log
  files_changed.json
  attempts.json
  result.json
  result.md
```

完整记录用于复盘和失败模式分析，但默认不进入开发上下文。

### 10.3 断电恢复

恢复流程：

```text
/sf-resume
  ↓
读取 state.json
  ↓
检查 git/worktree 状态
  ↓
检查 active task
  ↓
检查 active agent run
  ↓
检查未提交改动
  ↓
读取最近 checkpoint
  ↓
决定继续 / 重新验证 / 回滚 / 人工确认
```

### 10.4 上下文超过限制

不能依赖聊天上下文作为事实来源。

原则：

```text
聊天上下文 = 临时工作区
specforge/runtime = 当前事实
specforge/specs = 规格事实
specforge/archive = 原始证据
summary = 导航索引
```

---

## 11. 知识图谱方案

### 11.1 知识图谱用途

知识图谱不是给用户看的主界面，而是后台索引。

主要用途：

```text
1. Context Builder
   根据 task 找最小上下文。

2. Impact Analyzer
   需求变更后分析影响哪些 design、tasks、tests、files。

3. Task Planner
   检查 design 是否都被 task 覆盖。

4. Parallel Scheduler
   判断任务是否可并行。

5. Verifier
   根据改动选择最小测试集。

6. Debugger
   查询历史失败模式和成功修复方法。

7. Retro Agent
   统计失败最多的阶段、工具、Agent、命令。
```

### 11.2 谁生产图谱

三类来源：

```text
程序自动生产：
- specs
- trace matrix
- git diff
- test result
- code index
- API route
- database schema

Agent 结构化上报：
- files_read
- files_modified
- tests_run
- failures
- resolution

用户确认：
- confirmed requirements
- design decisions
- constraints
- scope decisions
```

### 11.3 图谱实现

V1 不上复杂图数据库，先用：

```text
SQLite + JSONL
```

目录：

```text
specforge/index/
  graph.sqlite
  nodes.jsonl
  edges.jsonl
```

节点类型：

```text
requirement
constraint
design_item
task
test
file
api
database_table
agent
agent_run
tool
skill
mcp
failure
decision
workflow
```

边类型：

```text
implements
depends_on
blocks
modifies
reads
writes
calls
verifies
covers
failed_with
fixed_by
uses_tool
uses_skill
confirmed_by_user
derived_from
impacts
```

每条边必须有来源和置信度：

```json
{
  "from": "T-003",
  "to": "backend/auth.py",
  "type": "modifies",
  "source": "git_diff",
  "confidence": 1.0
}
```

Agent 推断的边必须标记：

```text
source = agent_inferred
confidence < 1.0
needs_validation = true
```

---

## 12. 测试与质量体系

不能只靠单元测试。

质量验证应包括：

```text
1. Static Checks
   类型检查、lint、格式化、依赖漏洞。

2. Unit Tests
   函数、类、组件级测试。

3. Component Tests
   前端组件、后端服务组件测试。

4. Integration Tests
   服务、数据库、缓存、队列、外部 API 集成测试。

5. Contract Tests
   前后端 API、服务间接口、第三方接口契约测试。

6. End-to-End Tests
   从前端到后端的真实用户路径测试。

7. Business Scenario Tests
   真实业务流程测试。

8. Regression Tests
   防止历史功能和已修 bug 被破坏。

9. Smoke Tests
   部署后快速确认核心路径可用。

10. Performance Tests
    响应时间、吞吐、并发、资源占用。

11. Security Tests
    认证、授权、输入校验、敏感信息、依赖漏洞。

12. Data Integrity Tests
    数据迁移、清洗、同步、一致性、幂等性。

13. Observability Checks
    日志、指标、告警、trace 是否足够定位问题。

14. Deployment / Rollback Tests
    安装、升级、回滚、配置迁移。
```

Gate 规则：

```text
没有 verification_commands 的 task 不能执行。
没有验证证据的 task 不能 completed。
bugfix 没有 regression test 不能 close。
高风险 task 没有回滚方案不能执行。
```

---

## 13. 文档体系

### 13.1 规格文档

```text
intake.md
requirements.md
bugfix.md
constraints.md
environment.md
design.md
tasks.md
trace_matrix.md
change_log.md
```

### 13.2 质量文档

```text
test_strategy.md
acceptance_plan.md
verification.md
regression_suite.md
quality_gate_report.md
```

### 13.3 开发管理文档

```text
work_item.md
execution_plan.md
agent_run_result.md
code_review.md
release_notes.md
deployment_runbook.md
rollback_plan.md
```

### 13.4 复盘与知识文档

```text
result_ledger.md
retro.md
failure_patterns.md
knowledge_candidates.md
```

---

## 14. 项目目录结构

建议 V1 目录：

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
      sf-requirements.md
      sf-design.md
      sf-task-planner.md
      sf-executor.md
      sf-debugger.md
      sf-reviewer.md
      sf-verifier.md
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
      sf_state_write.ts
      sf_context_build.ts
      sf_requirements_gate.ts
      sf_design_gate.ts
      sf_tasks_gate.ts
      sf_trace_check.ts
      sf_task_update.ts
      sf_result_log.ts
      sf_graph_query.ts
      sf_graph_update.ts
      sf_resume_check.ts

    plugins/
      sf_lifecycle.ts
      sf_guard.ts
      sf_logger.ts
      sf_checkpoint.ts

  specforge/
    config/
      project.json

    registry/
      agents.json
      tools.json
      skills.json
      mcp.json

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
        trace_matrix.md
        verification.md
        change_log.md
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

## 15. V1 范围

V1 目标：

> 不修改 OpenCode 源码，先做出完整、可安装、可卸载、可升级的规格驱动最小闭环。

V1 必须实现：

```text
1. 意图识别
2. 回答后工作流建议
3. requirements / bugfix 文档生成
4. 文档边界检查
5. requirements gate
6. environment / constraints 收集
7. design 推导
8. design gate
9. tasks 推导
10. task 粒度检查
11. trace matrix
12. 多 Agent 分工
13. 子 Agent 执行隔离
14. 渐进式 context manifest
15. 工具/skill/MCP registry
16. task 状态机
17. verification gate
18. 完整 agent run archive
19. 断点恢复
20. 基础知识图谱
21. 基础 retro
22. 安装、升级、卸载脚本
```

V1 不做：

```text
1. 不改 OpenCode 源码
2. 不做原生 UI 面板
3. 不做完整全局知识自动合并
4. 不做复杂长期后台任务
5. 不做企业级权限系统
6. 不做复杂图数据库
```

---

## 16. 程序硬控、AI 辅助、用户确认边界

### 16.1 必须程序硬控

```text
文档边界 lint
requirements/design/tasks/verify gate
trace matrix 完整性
task 状态机
agent run 状态
权限 allow/ask/deny
高风险 checkpoint
验证证据
上下文 manifest
必需工具执行
安装/升级/卸载
断点恢复
```

### 16.2 AI 可以辅助

```text
需求发散
业务角度补全
设计方案比较
任务拆分建议
测试策略建议
代码实现
bug 根因分析
复盘总结
知识候选提取
```

### 16.3 必须用户确认

```text
需求 baseline
验收标准
非功能指标
范围变化
重大设计取舍
成本/部署/人员约束
高风险操作
数据库迁移
上线部署
全局知识合并
```

---

## 17. 安装、升级、卸载要求

用户体验目标：

```text
用户不应手动维护复杂文件。
```

必须提供：

```text
install.ps1 / install.sh
upgrade.ps1 / upgrade.sh
uninstall.ps1 / uninstall.sh
```

安装分两层：

```text
全局层：
~/.config/opencode/
  commands
  agents
  skills
  tools
  plugins
  specforge global files

项目层：
project-root/
  .opencode/
  specforge/
  opencode.json patch
  AGENTS.md patch
```

升级原则：

```text
升级通用能力，不覆盖 runtime。
升级模板，不覆盖已生成 specs。
升级 plugins/tools 时保留用户配置。
冲突时生成 migration report，不静默覆盖。
```

卸载原则：

```text
可以卸载 OpenCode 扩展层。
可以选择是否保留 specforge/specs 和 archive。
默认不删除用户项目数据。
提供 clean uninstall 选项。
```

---

## 18. 最终路线图

### V1：规格驱动最小闭环

```text
意图识别
requirements / bugfix
design
tasks
trace
multi-agent execution
verify
archive
resume
basic graph
install/upgrade/uninstall
```

### V2：质量与复盘增强

```text
更强测试策略
failure pattern 自动提取
debug 历史复用
更强 task 并行调度
更强 graph impact analysis
```

### V3：自我提升闭环

```text
knowledge candidates
global knowledge repo
用户批准后合并
项目回灌
跨项目经验复用
```

### V4：OpenCode 深度集成

```text
如果必要，再考虑修改 OpenCode 源码：
- 原生 spec 面板
- task 状态 UI
- graph 可视化
- 原生 workflow router
```

---

## 19. 核心产品原则

### 原则 1：一个主流程

```text
triage → spec → design → tasks → run → verify → review → close → retro
```

不能同时存在多套主流程。

### 原则 2：一个权威状态

```text
specforge/runtime/state.json
```

聊天上下文不是权威状态。OpenCode todo 不是长期权威状态。

### 原则 3：一个权威任务体系

```text
specforge/specs/<work_item_id>/tasks.md
```

Superpowers plan 只能服务于某个 task 的执行，不能变成第二套任务清单。

### 原则 4：主 Agent 不写代码

主 Agent 是项目经理，不是高级程序员。

```text
主 Agent 负责调度、风险、状态、用户沟通。
子 Agent 负责需求、设计、执行、调试、验证、复盘。
```

### 原则 5：必须硬控的事情不能靠 prompt

凡是必须 100% 做到的事情，必须靠：

```text
程序
状态机
Gate
权限
日志
测试证据
```

而不是靠 AI 自觉。

### 原则 6：完整记录，最小投喂

完整会话、工具调用、失败尝试都要保存。

但开发时只投喂：

```text
当前任务必须信息
必要索引
最小相关上下文
```

完整 archive 用于复盘，不默认进入开发上下文。

### 原则 7：回答优先，流程建议随后

用户问问题时，先回答。  
如果发现异常，再建议进入工作流。  
未经用户确认，不创建正式工单。

### 原则 8：图谱服务 Agent，不替代 Agent

知识图谱负责：

```text
上下文裁剪
影响分析
并行判断
回归测试选择
失败模式复用
```

Agent 通过工具查询最小子图，不直接读取完整图谱。

---

## 20. 方案结论

SpecForge 不是把 Kiro、Superpowers、OpenCode、ai_dev_os 简单拼起来。

它的正确融合方式是：

```text
Kiro 给骨架：
requirements / bugfix → design → tasks → task execution

Superpowers 给肌肉：
brainstorming、planning、TDD、debugging、review、parallel agents

OpenCode 给神经系统：
commands、agents、skills、tools、plugins、permissions

ai_dev_os 给记忆和进化：
runtime state、work item router、risk policy、retro、knowledge merge
```

最终产品目标是：

> SpecForge 是一个运行在 OpenCode 上的规格驱动 AI 开发框架。它以 Kiro Specs 为规格主线，以 Superpowers Skills 贯穿需求、设计、计划、实现、验证全过程，以 ai_dev_os 的状态机和复盘思想形成自我提升闭环，通过 OpenCode 的 Agent、Skill、Tool、Plugin、Permission 机制实现可控、可追踪、可恢复、可验证的 AI 开发。

最关键的判断：

> 主 Agent 不负责解决技术问题；主 Agent 负责让正确的子 Agent 在正确上下文、正确权限、正确门禁下解决技术问题。

第二个关键判断：

> 凡是必须 100% 做到的事情，不能靠 prompt，必须靠程序、状态机、Gate、权限和日志硬控。

这份方案作为 SpecForge 后续产品设计、需求拆分、架构设计、任务生成和验收的基线。
