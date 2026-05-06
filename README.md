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
- **657 个单元测试 + 属性测试**

---

## 前提条件

- [OpenCode](https://opencode.ai) v1.1+
- [Bun](https://bun.sh) — JavaScript/TypeScript 运行时
- 至少一个 AI Provider 已配置（如 Anthropic、OpenAI、Google 等）

---

## 安装

### 前置要求

- [Bun](https://bun.sh) — JavaScript/TypeScript 运行时
- 克隆本仓库到本地

### 安装（一次性）

```bash
# 在 SpecForge 仓库目录下执行
cd /path/to/specforge-repo
bun scripts/sf-installer.ts install
```

这会将共享组件（Agent、Tool、Skill、Plugin）部署到 `~/.config/opencode/`（所有平台统一路径，包括 Windows）。

安装完成后，打开任何项目的 OpenCode，Plugin 会自动初始化项目运行时（`specforge/` 目录），无需额外操作。

**用户级目录 `~/.config/opencode/`（一次安装，所有项目共享）：**
```
~/.config/opencode/
├── opencode.json              ← sf-* Agent 注册（合并写入，不覆盖你的配置）
├── specforge-manifest.json    ← 安装清单
├── agents/                    ← 9 个 Agent prompt 文件
├── tools/ + tools/lib/        ← 16 + 19 个 Tool 文件
├── skills/                    ← 12 个 Skill
└── plugins/                   ← 1 个统一 Plugin（sf_specforge.ts）
```

**项目目录（Plugin 自动初始化）：**
```
your-project/
├── AGENTS.md
└── specforge/
    ├── manifest.json          ← 项目级清单
    ├── agents/contracts/      ← Agent 契约文档
    ├── config/                ← project.json, risk_policy.json
    ├── runtime/               ← state.json, events.jsonl
    ├── sessions/
    ├── archive/
    ├── knowledge/
    ├── specs/
    └── logs/
```

### 升级

```bash
# 升级共享组件
bun scripts/sf-installer.ts upgrade

# 强制升级（覆盖用户修改）
bun scripts/sf-installer.ts upgrade --force
```

升级后需重启 OpenCode。Plugin 会在下次启动时自动处理项目运行时迁移。

### 校验完整性

```bash
bun scripts/sf-installer.ts verify
```

### 卸载

```bash
bun scripts/sf-installer.ts uninstall
```

### 安装器选项

| 选项 | 说明 |
|------|------|
| `--force` | 强制覆盖冲突文件（upgrade 时使用） |
| `--version` | 显示已安装版本 |

### 安全保障

- `opencode.json` 合并式写入：只添加/更新 sf-* Agent，保留你的其他配置
- 写入前自动备份到 `.backup/` 目录（带时间戳，不会互相覆盖）
- 用户级安装锁防止并发写入冲突
- 升级时检测用户修改，默认跳过（需 `--force` 才覆盖）

### 安装后

```bash
cd <你的项目>
opencode             # 启动 OpenCode
# Plugin 自动初始化项目运行时
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

## Plugin

| Plugin | 用途 |
|--------|------|
| sf_specforge | 统一 Plugin：权限守卫、事件日志、成本追踪、会话记录、检查点、项目运行时自动初始化 |

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
bun run test           # 运行所有 657 个测试
bun run test:watch     # 监听模式
bun run test:coverage  # 带覆盖率
```

---

## 项目结构

```
~/.config/opencode/              # 用户级共享组件（一次安装）
├── opencode.json                # sf-* Agent 注册
├── specforge-manifest.json      # 安装清单
├── agents/                      # 9 个 Agent 定义
├── tools/ + tools/lib/          # 16 + 19 个 Tool 文件
├── skills/                      # 12 个 Skill
└── plugins/                     # 1 个统一 Plugin

project-root/                    # 项目级（Plugin 自动初始化）
├── specforge/
│   ├── agents/                  # AGENT_CONSTITUTION.md + 8 个契约
│   ├── config/                  # project.json + risk_policy.json
│   ├── runtime/                 # state.json + events.jsonl + checkpoints/
│   ├── logs/                    # trace.jsonl + tool_calls.jsonl + app/error/gate.log
│   ├── specs/                   # 规格文档（按 Work Item 组织）
│   ├── archive/                 # Agent Run Archive
│   ├── knowledge/               # Knowledge Graph
│   ├── sessions/                # 会话记录
│   └── manifest.json            # 项目运行时清单
├── AGENTS.md                    # Agent 总览
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
