# SpecForge V1 MVP

运行在 OpenCode 上的规格驱动 AI 开发控制系统。

SpecForge 将用户的功能描述，通过结构化的工作流转化为：已确认的需求 → 受约束的设计 → 可执行的任务 → 有测试证据的代码。整个过程由 8 个专业 Agent 协作完成，主 Agent（Orchestrator）负责项目管理，子 Agent 负责专业执行，Gate 工具负责阶段质量检查。

---

## 前提条件

- [OpenCode](https://opencode.ai) — 终端 AI 编码工具（v1.1+）
- [Bun](https://bun.sh) — JavaScript/TypeScript 运行时（OpenCode 的 tool/plugin 运行时）
- 至少一个 AI Provider 已配置（如 Anthropic、OpenAI、Google 等）

---

## 安装部署

### 1. 复制文件到目标项目

将以下目录和文件复制到你的项目根目录：

```bash
# 核心目录
.opencode/          # Agent 定义、Custom Tools、Plugin、Skills
specforge/          # 运行时状态、日志、规格文档、配置

# 配置文件
opencode.json       # OpenCode Agent 和权限配置
AGENTS.md           # Agent 总览文档
package.json        # 依赖声明
tsconfig.json       # TypeScript 配置
vitest.config.ts    # 测试配置
```

如果你的项目已有 `opencode.json`，将 SpecForge 的 `agent` 配置段合并进去。

### 2. 安装依赖

```bash
cd <你的项目>
bun install
```

### 3. 配置模型

编辑 `opencode.json`，将模型替换为你实际可用的 provider/model：

```json
{
  "agent": {
    "sf-orchestrator": {
      "model": "anthropic/claude-sonnet-4-20250514"
    }
  }
}
```

默认所有 Agent 使用 `anthropic/claude-sonnet-4-20250514`。你可以为不同 Agent 配置不同模型，例如给 verifier 用更便宜的模型：

```json
{
  "agent": {
    "sf-verifier": {
      "model": "anthropic/claude-haiku-4-20250514"
    }
  }
}
```

### 4. 验证安装

```bash
# 运行测试确认所有组件正常
bun run test
```

应看到 155 个测试全部通过。

### 5. 启动

```bash
opencode
```

在 OpenCode 中按 Tab 切换到 `sf-orchestrator` agent。

---

## 使用方法

### 开始一个新功能

切换到 `sf-orchestrator` 后，直接描述你想做的功能：

```
我想要实现一个用户登录功能，支持邮箱和手机号登录
```

Orchestrator 会自动执行以下流程：

```
1. 意图判断 → 识别为 new_feature
2. 创建 Work Item → 生成 WI-001，建立 specforge/specs/WI-001/ 目录
3. intake → 收集功能描述，生成 intake.md
4. requirements → 调度 sf-requirements agent（加载 brainstorming skill），生成 requirements.md
5. requirements_gate → 调用 Gate 工具检查需求质量
6. design → 调度 sf-design agent，生成 design.md
7. design_gate → 调用 Gate 工具检查设计质量
8. tasks → 调度 sf-task-planner agent，生成 tasks.md
9. tasks_gate → 调用 Gate 工具检查任务质量
10. development → 逐个调度 sf-executor agent 执行任务
11. review → 调度 sf-reviewer agent 审查代码和规格
12. verification → 调度 sf-verifier agent（加载 verification skill）执行验证
13. verification_gate → 调用 Gate 工具确认验证通过
14. completed → 工作流完成
```

### Gate 失败时

如果某个 Gate 检查未通过，Orchestrator 会自动回退到前一阶段修订。例如：

```
⚠️ requirements_gate 质量检查未通过，正在修订。
问题：缺少术语表
```

Orchestrator 会重新调度 sf-requirements agent 补充缺失内容。

### 任务执行失败时

```
executor 失败 → 重试 1 次
仍然失败 → 调度 sf-debugger 调试
debugger 也失败 → 标记 blocked，报告用户
```

你会看到类似提示：

```
⛔ Task 执行失败，已耗尽重试次数
Task: 实现登录接口
尝试次数: executor 2次, debugger 1次
最后错误: TypeScript 编译错误
请提供指示以继续。
```

---

## 运行时留痕机制

SpecForge 在运行时自动记录完整的执行痕迹，用于事后复盘和流程审计。

### 日志文件

| 文件 | 内容 | 写入方式 |
|------|------|----------|
| `specforge/logs/trace.jsonl` | **完整运行痕迹**：所有工具调用、子 Agent 调度、会话事件、权限请求、文件变更 | Plugin 自动记录 |
| `specforge/logs/tool_calls.jsonl` | SpecForge 工具调用记录（仅 `sf_` 开头的工具） | Plugin 自动记录 |
| `specforge/runtime/events.jsonl` | 状态流转事件（最可靠，由 sf_state_transition 程序化写入） | Custom Tool 写入 |
| `specforge/logs/gate.log` | Gate 检查结果 | Custom Tool 写入 |
| `specforge/logs/app.log` | 工作流阶段事件 | Custom Tool 写入 |
| `specforge/logs/error.log` | 错误信息 | Custom Tool 写入 |

### trace.jsonl 记录的事件类型

```
tool.execute.before    — 工具调用前（含参数）
tool.execute.after     — 工具调用后（含结果）
agent.dispatched       — 子 Agent 被调度（含 agent 名称和 prompt 摘要）
agent.completed        — 子 Agent 执行完成（含结果摘要）
session.created        — 会话创建
session.idle           — 会话空闲
session.status         — 会话状态变化
session.compacted      — 上下文压缩
session.error          — 会话错误
permission.asked       — 权限请求
permission.replied     — 权限响应
file.edited            — 文件变更
```

### events.jsonl 记录的事件类型

```
work_item.created      — Work Item 创建
state.transitioned     — 状态流转（含 from_state、to_state、evidence）
```

### 日志格式

所有日志使用 JSONL 格式（每行一个 JSON 对象），统一结构：

```json
{
  "timestamp": "2026-05-03T12:00:00.000Z",
  "level": "INFO",
  "component": "sf_event_logger",
  "event": "agent.dispatched",
  "message": "Sub-agent dispatched: sf-requirements",
  "payload": {
    "agent": "sf-requirements",
    "prompt_preview": "分析以下功能描述，生成结构化需求文档..."
  }
}
```

### 敏感信息脱敏

所有日志自动对以下模式进行脱敏处理，替换为 `[REDACTED]`：

```
api_key, api-key, token, password, secret, credential, auth, private_key
```

---

## 复盘方法

### 还原完整执行过程

读取 `specforge/logs/trace.jsonl`，按时间线还原：

```bash
# 查看所有子 Agent 调度记录
cat specforge/logs/trace.jsonl | grep "agent.dispatched"

# 查看所有 Gate 调用结果
cat specforge/logs/trace.jsonl | grep "sf_.*_gate"

# 查看所有状态流转
cat specforge/runtime/events.jsonl | grep "state.transitioned"

# 查看权限请求
cat specforge/logs/trace.jsonl | grep "permission"
```

### 验证流程合规性

检查以下关键点：

**1. 子 Agent 调度顺序是否正确？**

```bash
# 提取所有 agent.dispatched 事件，检查顺序
cat specforge/logs/trace.jsonl | grep "agent.dispatched" | jq -r '.payload.agent'
```

预期顺序：`sf-requirements → sf-design → sf-task-planner → sf-executor → sf-reviewer → sf-verifier`

**2. Gate 是否在每个阶段后被调用？**

```bash
# 提取所有 Gate 调用
cat specforge/logs/trace.jsonl | grep "sf_.*_gate" | grep "tool.execute.after"
```

预期：每个阶段后都有对应的 Gate 调用记录。

**3. Gate fail 后是否正确回退？**

```bash
# 查看 Gate 结果和后续的状态流转
cat specforge/runtime/events.jsonl
```

如果 Gate 返回 fail，下一条 state.transitioned 事件的 to_state 应该是回退到前一阶段。

**4. 重试次数是否在限制内？**

```bash
# 统计 sf-executor 被调度的次数
cat specforge/logs/trace.jsonl | grep "agent.dispatched" | grep "sf-executor" | wc -l
```

同一个 task 的 executor 调度不应超过 2 次。

**5. 状态流转是否合法？**

```bash
# 查看所有状态流转
cat specforge/runtime/events.jsonl | grep "state.transitioned" | jq '{from: .payload.from_state, to: .payload.to_state}'
```

对照合法流转表验证每一步是否合法。

### 交叉验证

`events.jsonl`（程序化写入，最可靠）和 `trace.jsonl`（Plugin 记录，更全面）可以交叉验证：

- `events.jsonl` 中的每条 `state.transitioned` 事件，在 `trace.jsonl` 中应该有对应的 `sf_state_transition` 工具调用记录
- 如果 `trace.jsonl` 中有 `sf_state_transition` 调用但 `events.jsonl` 中没有对应事件，说明状态流转失败了
- 如果 `events.jsonl` 中有状态流转但 `trace.jsonl` 中没有对应的 Gate pass 记录，说明 Orchestrator 跳过了 Gate

---

## 项目结构

```
project-root/
├── AGENTS.md                          # Agent 总览文档
├── opencode.json                      # OpenCode 配置（Agent、权限、模型）
├── package.json                       # 依赖声明
├── tsconfig.json                      # TypeScript 配置
├── vitest.config.ts                   # 测试配置
│
├── .opencode/
│   ├── agents/                        # 8 个 Agent 定义文件
│   │   ├── sf-orchestrator.md         #   主编排 Agent（primary）
│   │   ├── sf-requirements.md         #   需求分析 Agent
│   │   ├── sf-design.md               #   设计 Agent
│   │   ├── sf-task-planner.md         #   任务规划 Agent
│   │   ├── sf-executor.md             #   执行 Agent
│   │   ├── sf-debugger.md             #   调试 Agent
│   │   ├── sf-reviewer.md             #   审查 Agent（只读）
│   │   └── sf-verifier.md             #   验证 Agent（只读）
│   │
│   ├── tools/                         # 7 个 Custom Tools
│   │   ├── sf_state_read.ts           #   读取 Work Item 状态
│   │   ├── sf_state_transition.ts     #   执行状态流转
│   │   ├── sf_doc_lint.ts             #   文档结构检查
│   │   ├── sf_requirements_gate.ts    #   需求质量 Gate
│   │   ├── sf_design_gate.ts          #   设计质量 Gate
│   │   ├── sf_tasks_gate.ts           #   任务质量 Gate
│   │   ├── sf_verification_gate.ts    #   验证质量 Gate
│   │   └── lib/                       #   共享核心逻辑
│   │       ├── utils.ts               #     日志、脱敏、JSONL 工具函数
│   │       ├── state_machine.ts       #     状态流转合法性验证表
│   │       ├── sf_state_read_core.ts
│   │       ├── sf_state_transition_core.ts
│   │       ├── sf_doc_lint_core.ts
│   │       ├── sf_requirements_gate_core.ts
│   │       ├── sf_design_gate_core.ts
│   │       ├── sf_tasks_gate_core.ts
│   │       └── sf_verification_gate_core.ts
│   │
│   ├── plugins/                       # Plugin
│   │   └── sf_event_logger.ts         #   运行时留痕记录器
│   │
│   └── skills/                        # Superpowers Skills
│       ├── superpowers-brainstorming/
│       │   └── SKILL.md               #   需求阶段头脑风暴方法论
│       └── superpowers-verification-before-completion/
│           └── SKILL.md               #   验证阶段完成前检查方法论
│
├── specforge/
│   ├── agents/
│   │   ├── AGENT_CONSTITUTION.md      # 全局 Agent 底线规则（9 条）
│   │   └── contracts/                 # 8 个 Agent 契约文件
│   │       ├── sf-orchestrator.contract.md
│   │       ├── sf-requirements.contract.md
│   │       ├── sf-design.contract.md
│   │       ├── sf-task-planner.contract.md
│   │       ├── sf-executor.contract.md
│   │       ├── sf-debugger.contract.md
│   │       ├── sf-reviewer.contract.md
│   │       └── sf-verifier.contract.md
│   │
│   ├── config/
│   │   ├── project.json               # 项目元数据
│   │   └── risk_policy.json           # 风险策略（L1/L2/L3）
│   │
│   ├── runtime/                       # 运行时状态（权威数据源）
│   │   ├── state.json                 #   Work Item 权威状态
│   │   ├── events.jsonl               #   状态流转事件流
│   │   └── checkpoints/               #   检查点（V1 完整版）
│   │
│   ├── logs/                          # 日志（运行时留痕）
│   │   ├── trace.jsonl                #   完整运行痕迹
│   │   ├── tool_calls.jsonl           #   SpecForge 工具调用记录
│   │   ├── app.log                    #   工作流事件
│   │   ├── error.log                  #   错误信息
│   │   └── gate.log                   #   Gate 检查结果
│   │
│   ├── specs/                         # 规格文档（按 Work Item 组织）
│   │   └── <work_item_id>/
│   │       ├── spec.json              #   Work Item 元数据
│   │       ├── intake.md              #   需求收集
│   │       ├── requirements.md        #   需求文档
│   │       ├── design.md              #   设计文档
│   │       └── tasks.md               #   任务文档
│   │
│   ├── sessions/                      # 会话记录（V1 完整版）
│   └── archive/                       # 归档（V1 完整版）
│       └── agent_runs/
│
└── tests/                             # 测试（155 个测试）
    └── unit/
        ├── tools/                     #   Custom Tool 单元测试
        │   ├── sf_state_read.test.ts
        │   ├── sf_state_transition.test.ts
        │   ├── sf_doc_lint.test.ts
        │   ├── sf_requirements_gate.test.ts
        │   ├── sf_design_gate.test.ts
        │   ├── sf_tasks_gate.test.ts
        │   ├── sf_verification_gate.test.ts
        │   └── shared_utils.test.ts
        └── plugins/
            └── sf_event_logger.test.ts
```

---

## Agent 体系

### 8 个 Agent

| Agent | 类型 | 职责 | 关键权限 |
|-------|------|------|----------|
| sf-orchestrator | primary | 项目管理、用户沟通、意图判断、工作流选择、阶段推进 | task=allow |
| sf-requirements | subagent | 需求分析、业务分析、边界分类 | task=deny |
| sf-design | subagent | 架构设计、接口定义、数据模型 | task=deny |
| sf-task-planner | subagent | 任务拆分、依赖定义、验证要求 | task=deny |
| sf-executor | subagent | 代码编写、任务执行 | task=deny |
| sf-debugger | subagent | 调试、问题修复 | task=deny |
| sf-reviewer | subagent | 规格审查、代码审查 | task=deny, edit=deny |
| sf-verifier | subagent | 测试执行、验收确认 | task=deny, edit=deny |

### 调用层级

```
用户 (Depth 0)
  └── sf-orchestrator (Depth 1, primary)
        ├── sf-requirements (Depth 2, subagent)
        ├── sf-design (Depth 2, subagent)
        ├── sf-task-planner (Depth 2, subagent)
        ├── sf-executor (Depth 2, subagent)
        ├── sf-debugger (Depth 2, subagent)
        ├── sf-reviewer (Depth 2, subagent)
        └── sf-verifier (Depth 2, subagent)
```

子 Agent 之间不可互相调用（`permission.task = deny`），最大调用深度 3 层。

### 硬控机制

| 控制项 | 实现方式 | 硬控程度 |
|--------|----------|----------|
| 子 Agent 互调阻止 | OpenCode permission.task = deny | 硬控（平台强制） |
| 文件修改权限 | OpenCode permission.edit = deny（reviewer/verifier） | 硬控（平台强制） |
| 状态流转合法性 | sf_state_transition 内置验证逻辑 | 半硬控（工具内程序化检查） |
| Gate 质量检查 | 4 个 Gate Custom Tool | 半硬控（工具内程序化检查） |
| 文档结构检查 | sf_doc_lint Custom Tool | 半硬控（工具内程序化检查） |
| 事件记录 | sf_event_logger Plugin | 硬控（平台钩子自动触发） |
| doom loop 检测 | OpenCode 内置 | 硬控（平台强制） |

---

## 当前版本限制（V1 MVP）

- 只支持 Feature Spec（Requirements-First）工作流
- 不支持 Bugfix 工作流
- 不支持 Provider Fallback（provider 出错直接返回用户）
- 不支持 Model Router（模型直接在 opencode.json 中配置）
- 不支持并行任务执行
- 不支持 Knowledge Graph
- 不支持 Checkpoint/Resume（会话恢复）

---

## 运行测试

```bash
# 运行所有测试
bun run test

# 监听模式
bun run test:watch

# 带覆盖率
bun run test:coverage
```

---

## 版本规划

### V1 完整版（在 MVP 基础上增加）

- Bugfix Spec 工作流
- Design-First 工作流
- Quick Change 工作流
- 剩余 Superpowers Skill 适配（writing-plans、subagent-driven-development、tdd、systematic-debugging、code-review）
- 权限守卫 Plugin（sf_permission_guard）
- Checkpoint Plugin（sf_checkpoint）
- 会话恢复机制
- Trace Matrix 检查
- Agent Run Archive
- 调试命令（/sf-status、/sf-doctor）

### V2

- Provider Fallback（通过网关层）
- 复盘 Agent（sf-retro-agent）
- Knowledge Graph
- Context Builder / Capability Broker
- 上下文限制检测
- 并行任务控制
- 成本记录与审计
- 知识候选与全局知识合并
- Install / Upgrade / Uninstall 命令
