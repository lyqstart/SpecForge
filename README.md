# SpecForge

运行在 OpenCode 上的规格驱动 AI 开发控制系统。

SpecForge 将用户的功能描述，通过结构化的工作流转化为：已确认的需求 → 受约束的设计 → 可执行的任务 → 有测试证据的代码。整个过程由 8 个专业 Agent 协作完成，主 Agent（Orchestrator）负责项目管理，子 Agent 负责专业执行，Gate 工具负责阶段质量检查。

---

## 核心特性

- **4 种工作流**：Feature Spec（Requirements-First / Design-First）、Bugfix Spec、Quick Change
- **8 个专业 Agent**：Orchestrator + 7 个子 Agent，各司其职
- **程序化 Gate 检查**：需求/设计/任务/验证 4 个质量门禁，用 Custom Tool 实现
- **状态机驱动**：所有状态流转通过 sf_state_transition 工具执行，内置合法性验证
- **完整留痕**：trace.jsonl / events.jsonl / tool_calls.jsonl 自动记录全部执行过程
- **Agent Run Archive**：每次子 Agent 调度的结果、变更文件、工作日志自动归档
- **失败重试闭环**：executor 重试 → debugger 介入 → blocked 报告用户
- **263 个单元测试**

---

## 前提条件

- [OpenCode](https://opencode.ai) v1.1+
- [Bun](https://bun.sh) — JavaScript/TypeScript 运行时
- 至少一个 AI Provider 已配置（如 Anthropic、OpenAI、Google 等）

---

## 安装

### 方式 1：使用安装脚本（推荐）

```powershell
# 在 SpecForge 项目目录中执行
pwsh -File scripts/install.ps1 -Target "D:\your\project"
```

### 方式 2：卸载重装

```powershell
# 在目标项目目录中执行
pwsh -File D:\path\to\SpecForge\scripts\reinstall.ps1 -Source "D:\path\to\SpecForge"
```

### 安装后

```bash
cd <你的项目>
bun install          # 安装依赖
opencode             # 启动 OpenCode
# 按 Tab 切换到 sf-orchestrator
```

---

## 配置模型

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

每个 Agent 可以配置不同模型。建议：
- Orchestrator / Requirements / Design：强推理模型
- Executor / Debugger：强 coding 模型
- Verifier：成本可控的模型即可

---

## 使用方法

### 新功能（Feature Spec）

```
做一个用户登录功能，支持邮箱和手机号登录
```

Orchestrator 自动执行：intake → requirements → design → tasks → development → review → verification → completed

### 先设计后需求（Design-First）

```
我已有技术方案，先设计。做一个秒表，使用 requestAnimationFrame 实现高精度计时
```

Orchestrator 自动执行：intake → design → requirements → tasks → development → review → verification → completed

### 修复 Bug（Bugfix Spec）

```
倒计时结束后没有声音提示，应该有一个提示音
```

Orchestrator 自动执行：intake → bugfix_analysis → fix_design → tasks → development → verification → completed（跳过 review）

### 小改动（Quick Change）

```
把倒计时数字的颜色改成蓝色
```

Orchestrator 建议 Quick Change 工作流（需用户确认）：intake → quick_tasks → development → verification → completed（跳过 requirements / design / review）

---

## 工作流阶段

### Feature Spec（Requirements-First）

```
intake → requirements → requirements_gate → design → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
```

### Feature Spec（Design-First）

```
intake → design → design_gate → requirements → requirements_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
```

### Bugfix Spec

```
intake → bugfix_analysis → bugfix_gate → fix_design → design_gate → tasks → tasks_gate → development → verification → verification_gate → completed
```

### Quick Change

```
intake → quick_tasks → development → verification → verification_gate → completed
```

---

## Agent 体系

| Agent | 类型 | 职责 | 关键权限 |
|-------|------|------|----------|
| sf-orchestrator | primary | 项目管理、意图判断、工作流选择、阶段推进 | task=allow |
| sf-requirements | subagent | 需求分析、bugfix 缺陷分析 | task=deny |
| sf-design | subagent | 架构设计、修复设计 | task=deny |
| sf-task-planner | subagent | 任务拆分、验证要求定义 | task=deny |
| sf-executor | subagent | 代码编写、任务执行 | task=deny |
| sf-debugger | subagent | 调试、问题修复 | task=deny |
| sf-reviewer | subagent | 规格审查、代码审查（只读） | task=deny, edit=deny |
| sf-verifier | subagent | 测试执行、验收确认（只读） | task=deny, edit=deny |

子 Agent 之间不可互相调用（`permission.task = deny`）。

---

## Custom Tools

| 工具 | 用途 |
|------|------|
| sf_state_read | 读取 Work Item 状态 |
| sf_state_transition | 执行状态流转（含合法性验证） |
| sf_doc_lint | 文档结构检查 |
| sf_requirements_gate | 需求质量 Gate |
| sf_design_gate | 设计质量 Gate |
| sf_tasks_gate | 任务质量 Gate |
| sf_verification_gate | 验证质量 Gate |
| sf_trace_matrix | 需求→设计→任务追溯检查 |
| sf_doctor | 系统健康检查 |

---

## Plugins

| Plugin | 用途 |
|--------|------|
| sf_event_logger | 运行时留痕（trace.jsonl / tool_calls.jsonl） |
| sf_permission_guard | 权限守卫（拦截敏感操作） |
| sf_checkpoint | 检查点（上下文压缩前保存状态） |

---

## Skills（Superpowers 方法论）

| Skill | 使用阶段 |
|-------|----------|
| superpowers-brainstorming | requirements 阶段 |
| superpowers-writing-plans | tasks 阶段 |
| superpowers-subagent-driven-development | development 阶段 |
| superpowers-tdd | bugfix development 阶段 |
| superpowers-systematic-debugging | bugfix_analysis 阶段 |
| superpowers-code-review | review 阶段 |
| superpowers-verification-before-completion | verification 阶段 |

---

## 留痕与复盘

### 日志文件

| 文件 | 内容 |
|------|------|
| `specforge/logs/trace.jsonl` | 完整运行痕迹（工具调用、Agent 调度、会话事件） |
| `specforge/logs/tool_calls.jsonl` | sf_ 工具调用记录 |
| `specforge/runtime/events.jsonl` | 状态流转事件（程序化写入，最可靠） |

### 复盘命令

```bash
# 查看所有子 Agent 调度
cat specforge/logs/trace.jsonl | grep "agent.dispatched"

# 查看所有状态流转
cat specforge/runtime/events.jsonl | grep "state.transitioned"

# 查看 Gate 调用
cat specforge/logs/trace.jsonl | grep "sf_.*_gate"
```

---

## 测试

```bash
bun run test           # 运行所有 263 个测试
bun run test:watch     # 监听模式
bun run test:coverage  # 带覆盖率
```

---

## 项目结构

```
project-root/
├── .opencode/
│   ├── agents/          # 8 个 Agent 定义
│   ├── tools/           # 9 个 Custom Tools + lib/
│   ├── plugins/         # 3 个 Plugin
│   └── skills/          # 7 个 Superpowers Skills
├── specforge/
│   ├── agents/          # AGENT_CONSTITUTION.md + 8 个契约
│   ├── config/          # project.json + risk_policy.json
│   ├── runtime/         # state.json + events.jsonl + checkpoints/
│   ├── logs/            # trace.jsonl + tool_calls.jsonl + app/error/gate.log
│   ├── specs/           # 规格文档（按 Work Item 组织）
│   ├── archive/         # Agent Run Archive
│   ├── ROADMAP.md       # 版本路线图
│   └── V2_REQUIREMENTS.md
├── tests/               # 263 个单元测试
├── scripts/             # install.ps1 + reinstall.ps1
├── AGENTS.md            # Agent 总览
├── opencode.json        # OpenCode 配置
└── README.md
```

---

## 版本路线图

详见 [specforge/ROADMAP.md](specforge/ROADMAP.md)。

| 版本 | 状态 | 内容 |
|------|------|------|
| V1 MVP | ✅ 完成 | 8 Agent + 7 Tool + Feature Spec 工作流 |
| V1 Complete | ✅ 完成 | 4 种工作流 + 新 Plugin/Skill/Tool，263 测试 |
| V1.1 | ✅ 完成 | Design-First 测试验证（第 10 轮） |
| V2.0 | 计划中 | sf_artifact_write + sf_batch_verify + 效率优化 |

---

## 测试记录

10 轮测试，覆盖 4 种工作流。详见 [specforge/DEV_TEST_LOG.md](specforge/DEV_TEST_LOG.md)。

| 轮次 | 工作流 | 结果 |
|------|--------|------|
| 3 | feature_spec | ✅ 完整闭环 |
| 4 | feature_spec ×2 | ✅ 双 WI + Review Repair Loop |
| 7 | bugfix_spec | ✅ 完整闭环 |
| 8-9 | quick_change | ✅ 完整闭环 |
| 10 | design_first | ✅ 完整闭环 |
