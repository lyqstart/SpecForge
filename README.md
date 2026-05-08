# SpecForge

运行在 OpenCode 上的规格驱动 AI 开发控制系统。

SpecForge 将用户的功能描述，通过结构化的工作流转化为：已确认的需求 → 受约束的设计 → 可执行的任务 → 有测试证据的代码。整个过程由 9 个专业 Agent 协作完成，主 Agent（Orchestrator）负责项目管理，子 Agent 负责专业执行，Gate 工具负责阶段质量检查。

---

## 核心特性

- **8 种工作流**：Feature Spec（Requirements-First / Design-First）、Bugfix Spec、Quick Change、Change Request、Refactor、Ops Task、Investigation
- **9 个专业 Agent**：Orchestrator + 8 个子 Agent，各司其职
- **程序化 Gate 检查**：需求/设计/任务/验证 4 个质量门禁，支持多模式（V3.6）
- **状态机驱动**：所有状态流转通过 sf_state_transition 工具执行，内置合法性验证
- **Knowledge Graph**：需求→设计→任务→代码的结构化关系图谱（V4.0）
- **Knowledge Base**：全局知识库，支持 CRUD、检索、去重、效果反馈（V5.0）
- **EARS 格式验证**：验收标准的结构化格式验证，支持 strict/legacy 双模式
- **并行任务调度**：独立 Task 自动并行执行（V3.3）
- **跨会话续接**：子 Agent 上下文耗尽时自动续接（V3.6）
- **V3.7 验证策略**：类型化验证命令，需求→测试可追溯
- **完整留痕**：trace.jsonl / events.jsonl / tool_calls.jsonl / cost.jsonl 自动记录
- **Agent Run Archive**：每次子 Agent 调度的结果、变更文件、工作日志自动归档
- **失败重试闭环**：executor 重试 → debugger 介入 → blocked 报告用户
- **统一 Plugin**：权限守卫、事件日志、成本追踪、会话记录、检查点、运行时自动初始化

---

## 前提条件

- [OpenCode](https://opencode.ai) v1.1+
- [Bun](https://bun.sh) — JavaScript/TypeScript 运行时
- 至少一个 AI Provider 已配置（如 Anthropic、OpenAI、Google 等）

---

## 安装

### 安装（一次性）

```bash
cd /path/to/specforge-repo
bun scripts/sf-installer.ts install
```

这会将共享组件（Agent、Tool、Skill、Plugin）部署到 `~/.config/opencode/`。

安装完成后，打开任何项目的 OpenCode，Plugin 会自动初始化项目运行时（`specforge/` 目录），无需额外操作。

### 升级

```bash
bun scripts/sf-installer.ts upgrade         # 常规升级
bun scripts/sf-installer.ts upgrade --force  # 强制覆盖
```

### 校验 / 卸载

```bash
bun scripts/sf-installer.ts verify
bun scripts/sf-installer.ts uninstall
```

### 安装后

```bash
cd <你的项目>
opencode             # 启动 OpenCode
# Plugin 自动初始化项目运行时
# 按 Tab 切换到 sf-orchestrator
```

---

## 目录结构

```
~/.config/opencode/              # 用户级共享组件（一次安装，所有项目共享）
├── opencode.json                # sf-* Agent 注册
├── specforge-manifest.json      # 安装清单
├── agents/                      # 9 个 Agent 定义
├── tools/ + tools/lib/          # 17 + 26 个 Tool 文件
├── skills/                      # 16 个 Skill
└── plugins/                     # 1 个统一 Plugin

project-root/                    # 项目级（Plugin 自动初始化）
├── AGENTS.md                    # Agent 总览（自动生成）
└── specforge/
    ├── manifest.json
    ├── agents/                  # AGENT_CONSTITUTION + 9 个契约
    ├── config/                  # project.json, risk_policy.json, skill_fragments.json
    ├── runtime/                 # state.json, events.jsonl, checkpoints/
    ├── logs/                    # trace.jsonl, tool_calls.jsonl, cost.jsonl, etc.
    ├── specs/                   # 规格文档（按 Work Item 组织）
    ├── archive/                 # Agent Run Archive
    ├── knowledge/               # Knowledge Graph
    └── sessions/                # 会话记录
```

---

## 工作流

| 工作流 | 类型 | 适用场景 |
|--------|------|----------|
| Feature Spec (Requirements-First) | feature_spec | 新功能开发 |
| Feature Spec (Design-First) | feature_spec_design_first | 先有技术方案再补需求 |
| Bugfix Spec | bugfix_spec | 修复 Bug |
| Quick Change | quick_change | 小改动（改配置、改文案） |
| Change Request | change_request | 修改已有业务功能（V3.6） |
| Refactor | refactor | 纯结构改善，不改行为（V3.6） |
| Ops Task | ops_task | 部署/运维操作（V3.6） |
| Investigation | investigation | 调查研究，无代码变更（V3.6） |

---

## Agent 体系

| Agent | 类型 | 职责 |
|-------|------|------|
| sf-orchestrator | primary | 项目管理、意图判断、工作流选择、阶段推进 |
| sf-requirements | subagent | 需求分析、EARS 格式 AC 编写 |
| sf-design | subagent | 架构设计 |
| sf-task-planner | subagent | 任务拆分、验证要求定义 |
| sf-executor | subagent | 代码编写、任务执行 |
| sf-debugger | subagent | 调试、问题修复 |
| sf-reviewer | subagent | 代码与文档审查（只读） |
| sf-verifier | subagent | 测试执行、验收确认（只读） |
| sf-knowledge | subagent | 知识提取、泛化抽象（V5.0） |

---

## Custom Tools

| 工具 | 用途 |
|------|------|
| sf_state_read | 读取 Work Item 状态 |
| sf_state_transition | 执行状态流转（含合法性验证） |
| sf_doc_lint | 文档结构检查 |
| sf_requirements_gate | 需求质量 Gate（含 EARS 验证） |
| sf_design_gate | 设计质量 Gate |
| sf_tasks_gate | 任务质量 Gate |
| sf_verification_gate | 验证质量 Gate |
| sf_trace_matrix | 需求→设计→任务追溯检查 |
| sf_doctor | 系统健康检查 |
| sf_artifact_write | 代写产物（供只读 Agent 使用） |
| sf_batch_verify | 批量验证命令执行 |
| sf_context_build | 构建 Task Context + 能力推荐 |
| sf_cost_report | 成本日志聚合分析 |
| sf_continuity | 跨会话续接引擎 |
| sf_knowledge_graph | Knowledge Graph CRUD |
| sf_knowledge_query | KG 查询和影响分析 |
| sf_knowledge_base | 全局知识库管理（V5.0） |

---

## 测试

```bash
bun run test           # 运行所有测试
bun run test:watch     # 监听模式
bun run test:coverage  # 带覆盖率
```

---

## 配置模型

编辑用户级 `~/.config/opencode/opencode.json`，替换为你实际可用的模型：

```json
{
  "agent": {
    "sf-orchestrator": { "model": "anthropic/claude-sonnet-4-20250514" },
    "sf-executor": { "model": "anthropic/claude-sonnet-4-20250514" }
  }
}
```

---

## 详细文档

- [AGENTS.md](AGENTS.md) — Agent 体系、权限模型、工作流、工具、Skill 完整总览
- [CHANGELOG.md](CHANGELOG.md) — 版本演进记录
- [docs/archive/](docs/archive/) — 历史设计文档
