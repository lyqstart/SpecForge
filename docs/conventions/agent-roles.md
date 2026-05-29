# Agent 职责

> 本文档描述 SpecForge 系统中 9 个 Agent 的职责、权限和调度关系。

## 调度关系

```
sf-orchestrator（primary）
├── sf-requirements（subagent）
├── sf-design（subagent）
├── sf-task-planner（subagent）
├── sf-executor（subagent）
│   └── 失败重试耗尽后 → sf-debugger
├── sf-reviewer（subagent）
├── sf-verifier（subagent）
├── sf-debugger（subagent）
└── sf-knowledge（subagent）
```

**核心规则：** 只有 `sf-orchestrator` 可以通过 `task` 工具调度其他 Agent。子 Agent 之间不能互相调度。

## Agent 详解

### 1. sf-orchestrator（主编排 Agent）

| 属性 | 值 |
|------|---|
| 模式 | primary |
| 温度 | 0.3 |
| 最大步数 | 200 |
| 权限 | edit ✓, bash ✗, task ✓, skill ✓ |

**职责：**
- 引导用户完成项目初始化（开发环境扫描 + 技术栈决策）
- 理解用户意图，选择正确的工作流
- 按阶段推进项目，调度专业子 Agent
- 处理 Gate 结果，管理失败重试
- 向用户报告进度
- **不**直接执行任何技术任务

**特殊权限：**
- 唯一可以调用 `sf_state_transition` 的 Agent
- 唯一可以调用 Gate 工具的 Agent
- 保留 `bash: allow` 作为 sf_safe_bash 不可用时的应急通道

---

### 2. sf-requirements（需求分析 Agent）

| 属性 | 值 |
|------|---|
| 模式 | subagent |
| 温度 | 0.2 |
| 最大步数 | 30 |
| 权限 | edit ✓, bash ✗, task ✗, skill ✓ |

**职责：**
- 接收 Orchestrator 传递的 intake.md
- 通过需求澄清、业务分析和边界分类生成 `requirements.md`
- 加载 `superpowers-brainstorming` skill 从多维度进行头脑风暴
- **不看技术栈**——需求描述"做什么"，技术栈属于 sf-design 的范围

**输入：** intake.md
**输出：** requirements.md / bugfix.md / impact_analysis.md

---

### 3. sf-design（设计 Agent）

| 属性 | 值 |
|------|---|
| 模式 | subagent |
| 温度 | 0.2 |
| 最大步数 | 30 |
| 权限 | edit ✓, bash ✗, task ✗, skill ✓ |

**职责：**
- 基于已确认的 requirements.md 进行架构设计
- 结合 dev-environment.md、prod-environment.md、project-rules.md 三份配置
- 进行接口定义、数据模型设计和测试策略制定
- **不**编写任务拆分、执行步骤或开发排期内容

**输入：** requirements.md + 配置文件
**输出：** design.md / design_delta.md / refactor_analysis.md / refactor_plan.md / investigation_plan.md / ops_plan.md / findings_report.md

---

### 4. sf-task-planner（任务规划 Agent）

| 属性 | 值 |
|------|---|
| 模式 | subagent |
| 温度 | 0.2 |
| 最大步数 | 30 |
| 权限 | edit ✓, bash ✗, task ✗, skill ✓ |

**职责：**
- 基于已确认的 design.md 将设计方案转化为可执行的任务列表
- 定义任务之间的依赖关系
- 定义每个任务的验证要求（verification_commands）
- 加载 `superpowers-writing-plans` skill 生成结构化执行计划
- **不**执行任何任务，也不编写代码

**输入：** requirements.md + design.md
**输出：** tasks.md

---

### 5. sf-executor（执行 Agent）

| 属性 | 值 |
|------|---|
| 模式 | subagent |
| 温度 | 0.2 |
| 最大步数 | 30 |
| 权限 | edit ✓, bash ✓, task ✗, skill ✓ |

**职责：**
- 接收 Orchestrator 分配的单个 task
- 按 task 描述修改指定文件
- 跑通验证命令并报告结果
- **不**决定执行哪个 task，**不**修改 task 范围之外的文件，**不**流转工作流状态

**输入：** task 描述 + verification_commands
**输出：** 代码文件 + 执行结果报告

**失败处理：** 遇到无法解决的问题按失败报告格式上报 Orchestrator，不向用户提问、不绕过、不降级。

---

### 6. sf-reviewer（审查 Agent）

| 属性 | 值 |
|------|---|
| 模式 | subagent |
| 温度 | 0.2 |
| 最大步数 | 30 |
| 权限 | edit ✗, bash ✗, task ✗, skill ✓ |

**职责：**
- 对已完成的实现进行规格审查和代码审查
- 验证代码实现是否符合 requirements.md 和 design.md 的规格要求
- 检查代码质量、安全性和可维护性
- **只读角色**——不能修改任何文件

**输入：** requirements.md + design.md + 代码变更文件列表
**输出：** review_report.md（通过 sf_artifact_write 写入）

---

### 7. sf-verifier（验证 Agent）

| 属性 | 值 |
|------|---|
| 模式 | subagent |
| 温度 | 0.2 |
| 最大步数 | 45 |
| 权限 | edit ✗, bash ✗, task ✗, skill ✓ |

**职责：**
- 执行全面的验证工作：测试执行、验收标准确认、冒烟测试和回归测试
- 加载 `superpowers-verification-before-completion` skill
- **只读角色**——可以读取文件，但不能修改
- 返回验证 JSON，由 Orchestrator 渲染为 verification_report.md

**输入：** tasks.md + requirements.md/bugfix.md
**输出：** 验证 JSON（含 conclusion、verification_commands、acceptance_criteria 等）

---

### 8. sf-debugger（调试 Agent）

| 属性 | 值 |
|------|---|
| 模式 | subagent |
| 温度 | 0.2 |
| 最大步数 | 30 |
| 权限 | edit ✓, bash ✓, task ✗, skill ✓ |

**职责：**
- 在 executor 重试耗尽后被 Orchestrator 调度
- 分析执行失败的根本原因
- 制定修复方案并实施修复
- **不**执行新任务，只修复已失败的任务

**输入：** 失败的 task 描述 + 错误信息
**输出：** 修复后的代码 + 重新执行的验证结果

---

### 9. sf-knowledge（知识提取 Agent）

| 属性 | 值 |
|------|---|
| 模式 | subagent |
| 温度 | — |
| 最大步数 | — |
| 权限 | edit ask, bash ✗, task ✗, skill ask |

**职责：**
- 在 Work Item 完成后执行会话复盘和知识提取
- 将有价值的经验抽象为跨项目可复用的通用知识
- 加载 `superpowers-knowledge-extraction` skill，按 6 Phase 框架执行：
  1. 证据盘点
  2. 关键事件识别
  3. 根因分析
  4. 经验提炼
  5. 知识条目创建
  6. 去重检查

**输入：** work_item_id + session_id
**输出：** 知识库条目（通过 `sf_knowledge_base` 工具创建）

**特殊规则：** investigation 工作流的知识条目使用 `candidate` 状态和 `medium` 置信度。

## 权限矩阵

| Agent | edit | bash | task | skill |
|-------|------|------|------|-------|
| sf-orchestrator | ✓ | ✗（应急 ✓） | ✓ | ✓ |
| sf-requirements | ✓ | ✗ | ✗ | ✓ |
| sf-design | ✓ | ✗ | ✗ | ✓ |
| sf-task-planner | ✓ | ✗ | ✗ | ✓ |
| sf-executor | ✓ | ✓ | ✗ | ✓ |
| sf-reviewer | ✗ | ✗ | ✗ | ✓ |
| sf-verifier | ✗ | ✗ | ✗ | ✓ |
| sf-debugger | ✓ | ✓ | ✗ | ✓ |
| sf-knowledge | ask | ✗ | ✗ | ask |

## 相关文档

- [工作流详解](workflow-types.md) — 各工作流调度的 Agent 映射
- [术语表](glossary.md) — Agent 相关术语定义
