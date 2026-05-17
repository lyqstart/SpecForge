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
bun scripts/sf-installer.ts upgrade         # 常规升级（保留用户自定义）
bun scripts/sf-installer.ts upgrade --force  # 强制覆盖（覆盖用户自定义）
```

**升级特性：**
- ✅ **原子升级**：要么全部成功，要么回滚到之前状态
- ✅ **降级检测**：如果源版本低于已安装版本，会提示降级警告
- ✅ **用户自定义保护**：检测用户修改，避免意外覆盖
- ✅ **孤儿文件清理**：自动清理新版本中移除的文件
- ✅ **并发安全**：锁机制防止并发操作

### 校验

```bash
bun scripts/sf-installer.ts verify
```

**校验特性：**
- ✅ **完整性检查**：验证所有文件的 SHA-256 校验和
- ✅ **Manifest 验证**：检查 Manifest 完整性
- ✅ **只读操作**：不修改任何文件
- ✅ **详细报告**：报告缺失、损坏或不匹配的文件

### 卸载

```bash
bun scripts/sf-installer.ts uninstall
```

**卸载特性：**
- ✅ **完整清理**：删除 Manifest 中记录的所有文件
- ✅ **配置清理**：从 `opencode.json` 中移除 sf-* agent 条目
- ✅ **安全保留**：保留用户其他配置不变
- ✅ **残留检测**：报告未在 Manifest 中记录的 sf-* 文件

### 版本信息

```bash
bun scripts/sf-installer.ts --version
```

显示已安装的 SpecForge 版本、安装时间、更新时间和已部署文件数量。

### 安装后

```bash
cd <你的项目>
opencode             # 启动 OpenCode
# Plugin 自动初始化项目运行时
# 按 Tab 切换到 sf-orchestrator
```

**注意：** 安装/升级后需要重启 OpenCode 才能加载新版 Plugin。

### 安装器设计优势

1. **零维护**：文件增删无需修改代码，运行时自动扫描 `.opencode/` 目录
2. **统一引擎**：install/upgrade/repair 共用同一个 Reconcile 函数
3. **幂等性**：多次执行相同操作不产生额外变更
4. **原子性**：每个文件写入都是原子的（temp + SHA-256 验证 + rename）
5. **作用域隔离**：用户级 vs 项目级使用不同策略
6. **完整测试**：16 个正确性属性 + 端到端测试覆盖

---

## 目录结构

### 本仓库（开发视角）

```
SpecForge/                        # 仓库根目录
├── .kiro/
│   ├── specs/                   # 设计文档（requirements/design/tasks）
│   │   ├── v6-architecture-overview/  # 父规范
│   │   ├── daemon-core/         # 各模块 spec（只放文档）
│   │   ├── configuration/
│   │   ├── ...
│   │   └── _archive/            # 历史 spec（V1–V5）
│   └── steering/                # AI 开发规则
├── packages/                    # V6 模块源码（monorepo）
│   ├── daemon-core/
│   ├── configuration/
│   ├── permission-engine/
│   ├── observability/
│   ├── scope-gate/
│   ├── workflow-runtime/
│   └── types/
├── .opencode/                   # SpecForge 框架（Agent/Tool/Skill/Plugin）
├── scripts/                     # 安装器脚本
├── tests/                       # 跨模块集成/e2e 测试
└── docs/archive/                # 历史设计文档
```

### 安装后（用户项目视角）

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

## 安装器详细使用指南

### 基本命令

```bash
# 安装 SpecForge 共享组件
bun scripts/sf-installer.ts install

# 升级 SpecForge 共享组件
bun scripts/sf-installer.ts upgrade
bun scripts/sf-installer.ts upgrade --force  # 强制覆盖用户自定义

# 校验安装完整性
bun scripts/sf-installer.ts verify

# 卸载 SpecForge 共享组件
bun scripts/sf-installer.ts uninstall

# 显示版本信息
bun scripts/sf-installer.ts --version

# 显示帮助信息
bun scripts/sf-installer.ts --help
```

### 使用示例

#### 完整安装流程
```bash
# 1. 首次安装
bun scripts/sf-installer.ts install

# 2. 验证安装
bun scripts/sf-installer.ts verify

# 3. 重启 OpenCode 加载 Plugin
# （需要重启 OpenCode 才能加载新版 Plugin）
```

#### 升级流程
```bash
# 1. 常规升级（保留用户自定义）
bun scripts/sf-installer.ts upgrade

# 2. 强制升级（覆盖所有文件）
bun scripts/sf-installer.ts upgrade --force

# 3. 验证升级结果
bun scripts/sf-installer.ts verify
```

#### 故障排查
```bash
# 检查安装状态
bun scripts/sf-installer.ts --version

# 验证完整性
bun scripts/sf-installer.ts verify

# 如果验证失败，重新安装
bun scripts/sf-installer.ts upgrade --force
```

### 安装位置

**用户级共享组件目录：**
```
~/.config/opencode/
├── agents/           # 9 个 sf-* Agent 定义文件
├── tools/           # 16 个 Tool + 19 个 lib 文件
├── skills/          # 12 个 Skill 目录
├── plugins/         # 1 个统一 Plugin (sf_specforge.ts)
├── opencode.json    # Agent 注册配置
└── specforge-manifest.json  # 用户级 Manifest
```

**项目级运行时目录（Plugin 自动初始化）：**
```
项目根目录/specforge/
├── config/          # 项目配置
├── runtime/         # 运行时状态
├── knowledge/       # 知识库（V5.0）
└── archive/         # 工作项归档
```

### 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 通用错误 |
| 2 | 源文件缺失 |
| 3 | 校验和不匹配 |
| 4 | 磁盘空间不足 |
| 5 | 并发锁冲突 |
| 6 | 降级检测（需要 --force） |

### 设计原理

安装器采用 **声明式期望状态 + 自动协调（Reconcile）** 架构：

1. **自动发现机制**：运行时扫描 `.opencode/` 目录，无需手动维护注册表
2. **三方哈希比较**：源文件 vs 目标文件 vs Manifest 记录，精确检测用户修改
3. **原子写入**：temp 文件 + SHA-256 验证 + rename，确保文件完整性
4. **提交中断恢复**：partial_commit.journal 机制，崩溃后自动恢复
5. **孤儿文件清理**：自动清理新版本中移除的 `sf-*` 和 `sf_*` 文件

### 注意事项

1. **重启要求**：安装/升级后需要重启 OpenCode 才能加载新版 Plugin
2. **并发安全**：安装器使用心跳锁机制防止并发操作
3. **向后兼容**：支持从旧版 Manifest 格式迁移
4. **性能保证**：Plugin 启动时间 < 500ms（硬断言）
5. **错误处理**：详细的错误代码和退出码

## 详细文档

- [AGENTS.md](AGENTS.md) — Agent 体系、权限模型、工作流、工具、Skill 完整总览
- [CHANGELOG.md](CHANGELOG.md) — 版本演进记录
- [docs/archive/](docs/archive/) — 历史设计文档
