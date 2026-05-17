# SpecForge × OpenCode 集成需求简报

> 本文档面向 OpenCode 项目作者，介绍 SpecForge 项目的定位、当前使用的 OpenCode 功能，以及希望获得更详细说明的 API/接口/事件。

---

## 1. SpecForge 是什么

SpecForge 是一个基于 OpenCode 构建的 **Spec-Driven Development（规格驱动开发）框架**。它在 OpenCode 之上实现了一套完整的多 Agent 协作系统，用于将用户的模糊想法系统化地转化为：需求文档 → 设计文档 → 任务拆分 → 代码实现 → 审查 → 验证，全流程由 AI Agent 自动驱动。

### 核心特性

- **9 个专职 Agent**：Orchestrator（调度）、Requirements（需求）、Design（设计）、Task-Planner（任务规划）、Executor（执行）、Debugger（调试）、Reviewer（审查）、Verifier（验证）、Knowledge（知识积累）
- **状态机驱动的工作流**：`intake → requirements → design → tasks → development → review → verification → completed`，每个阶段有质量 Gate 把关
- **Knowledge Graph**：需求→设计→任务→代码的可追溯关系图谱
- **8 种工作流类型**：Feature Spec、Bugfix、Design-First、Quick Change、Change Request、Refactor、Ops Task、Investigation
- **并行任务调度**：独立 Task 可并行分配给多个 Executor
- **跨会话续接**：子 Agent 上下文耗尽时自动续接
- **用户级安装**：共享组件部署到 `~/.config/opencode/`，项目级运行时由 Plugin 自动初始化

---

## 2. 当前使用的 OpenCode 功能

### 2.1 Plugin 系统（核心依赖）

SpecForge 使用一个统一 Plugin（`sf_specforge.ts`）作为系统入口，部署在 `~/.config/opencode/plugins/` 或 `.opencode/plugins/`。

**当前使用的 Plugin Hook：**

| Hook | 用途 |
|------|------|
| `tool.execute.before` | **Permission Guard**：拦截工具调用，实施权限控制（如阻止非 Orchestrator 调用 `sf_state_transition`，阻止 Reviewer 编辑文件） |
| `event` | 监听 OpenCode 事件流，记录日志、追踪会话状态 |

**当前使用的 Plugin Context：**

| 属性 | 用途 |
|------|------|
| `directory` | 检测项目根目录，决定是否自动初始化运行时 |
| `worktree` | Git worktree 路径 |
| `client` | SDK client，用于日志记录（`client.app.log()`） |
| `$` | BunShell，用于执行初始化命令 |

### 2.2 Custom Tools（16 个自定义工具）

所有工具部署在 `.opencode/tools/` 目录，使用 `tool()` helper 定义：

| 工具 | 用途 |
|------|------|
| `sf_state_read` | 读取工作流状态 |
| `sf_state_transition` | 执行状态流转（含乐观锁） |
| `sf_doc_lint` | 规格文档结构检查 |
| `sf_requirements_gate` | 需求文档质量 Gate |
| `sf_design_gate` | 设计文档质量 Gate |
| `sf_tasks_gate` | 任务文档质量 Gate |
| `sf_verification_gate` | 验证阶段 Gate |
| `sf_knowledge_graph` | Knowledge Graph CRUD |
| `sf_knowledge_query` | KG 查询和影响分析 |
| `sf_context_build` | 构建 Task Context |
| `sf_knowledge_base` | 全局知识库管理 |
| `sf_artifact_write` | 规格文档写入 |
| `sf_batch_verify` | 批量验证 |
| `sf_continuity` | 跨会话续接引擎 |
| `sf_cost_report` | 成本报告 |
| `sf_conversation_recorder` | 会话记录 |

### 2.3 Agent 系统（9 个 Agent）

使用 Markdown 文件定义在 `.opencode/agents/`：

| Agent | mode | 关键权限配置 |
|-------|------|-------------|
| `sf-orchestrator` | primary | `permission.task: allow`（可调度子 Agent） |
| `sf-requirements` | subagent | `permission.task: deny, permission.edit: ask` |
| `sf-design` | subagent | `permission.task: deny, permission.edit: ask` |
| `sf-task-planner` | subagent | `permission.task: deny, permission.edit: ask` |
| `sf-executor` | subagent | `permission.task: deny, permission.edit: ask` |
| `sf-debugger` | subagent | `permission.task: deny, permission.edit: ask` |
| `sf-reviewer` | subagent | `permission.task: deny, permission.edit: deny` |
| `sf-verifier` | subagent | `permission.task: deny, permission.edit: deny` |
| `sf-knowledge` | subagent | `permission.task: deny, permission.edit: ask` |

**关键依赖**：
- `permission.task` 控制子 Agent 调度权限（只有 Orchestrator 为 `allow`）
- 当 `permission.task: deny` 时，OpenCode 不向该 Agent 展示 Task 工具描述，使其无法感知其他 Agent 的存在

### 2.4 Skills 系统（16 个 Skill）

部署在 `.opencode/skills/` 目录，使用 `SKILL.md` + frontmatter 格式：
- 工作流 Skill（如 `sf-workflow-feature-spec`）：定义各工作流的阶段执行协议
- Superpowers Skill（如 `superpowers-brainstorming`）：增强特定阶段的 Agent 能力

### 2.5 配置系统

通过 `opencode.json` 配置 Agent 注册、权限、模型等。

---

## 3. 需要 OpenCode 作者提供详细说明的领域

### 3.1 Plugin Hook 的完整行为规范

**已知问题/需要澄清的点：**

1. **`tool.execute.before` 的 `input` 对象**：
   - `input.tool` 是工具名称，但 **`input.agent` 字段是否存在？** 我们需要知道当前是哪个 Agent 在调用工具，以实施基于 Agent 身份的权限控制
   - 如果不存在 `input.agent`，有没有其他方式获取当前执行 Agent 的身份？
   - `input.sessionID` 和 `input.callID` 的具体含义和生命周期？

2. **`tool.execute.before` 的拦截机制**：
   - 当前我们通过 `throw new Error(...)` 来阻止工具执行，这是官方推荐的方式吗？
   - 是否有更优雅的方式返回"拒绝"信号（如返回特定对象）？
   - throw 后，Agent 会收到什么样的错误信息？能否自定义错误消息格式？

3. **`tool.execute.after` 的 output 修改**：
   - 修改 `output.output` 是否会影响 Agent 看到的工具返回结果？
   - 能否用于注入额外上下文信息给 Agent？

4. **`event` hook 的事件类型完整列表**：
   - 文档列出了事件类型名称，但每种事件的 `event` 对象结构是什么？
   - 特别关注：`session.created`、`session.idle`、`session.error`、`session.compacted` 的 payload 结构
   - `tool.execute.after` 和 `tool.execute.before` 事件是否也会通过 `event` hook 触发？还是只通过专用 hook？

5. **Plugin 加载时序**：
   - Plugin 的 `tool.execute.before` hook 是否保证在所有工具调用前执行？
   - 多个 Plugin 都注册了 `tool.execute.before` 时的执行顺序？
   - Plugin 初始化（async function body）是否在 Agent 开始工作前完成？

### 3.2 Agent 系统的深层行为

1. **`permission.task` 的精确语义**：
   - 当设为 `deny` 时，Task 工具是否完全从 Agent 的工具列表中移除（Agent 完全不知道有 Task 工具）？
   - 还是工具仍然可见但调用会被拒绝？
   - 这对我们的"子 Agent 隔离"设计至关重要

2. **子 Agent 调度的上下文传递**：
   - 当 Orchestrator 通过 Task 工具调度子 Agent 时，传递给子 Agent 的 prompt/context 有什么限制？
   - 子 Agent 能否访问父 Agent 的会话历史？
   - 子 Agent 的输出如何返回给父 Agent？是完整返回还是有截断？

3. **子 Agent 的会话模型**：
   - 每次 Task 调用是否创建一个新的 child session？
   - child session 的生命周期是什么？Task 完成后是否自动清理？
   - 子 Agent 是否有独立的 token 计数和上下文窗口？

4. **Agent 的 `hidden: true` 行为**：
   - hidden Agent 是否仍然可以被 Task 工具调度？
   - 是否只影响 `@` 自动补全菜单？

5. **Agent 的 Skill 加载**：
   - Agent 调用 `skill()` 工具时，Skill 内容是注入到 system prompt 还是作为 user message？
   - Skill 内容是否计入 Agent 的 token 预算？
   - 能否在 Agent 定义中预加载特定 Skill（不需要 Agent 主动调用）？

### 3.3 Custom Tool 的高级用法

1. **Tool 的 `context` 对象**：
   - `context.agent` 是否包含当前调用该工具的 Agent 名称？
   - `context.sessionID` 是当前 session 还是 child session 的 ID？
   - 是否有方式获取当前 Work Item / 任务上下文？

2. **Tool 返回值的处理**：
   - 返回值是否有大小限制？超过限制会怎样？
   - 返回 JSON 对象 vs 字符串，Agent 看到的格式有什么区别？
   - 能否返回结构化数据让 Agent 更好地解析？

3. **Tool 之间的依赖**：
   - 一个 Tool 能否在 `execute` 中调用另一个 Tool？
   - 或者说 Tool 之间是否完全隔离？

4. **Tool 的错误处理**：
   - Tool 抛出异常时，Agent 看到的错误信息格式是什么？
   - 是否有方式区分"可重试错误"和"致命错误"？

### 3.4 事件系统与实时监控

1. **SSE 事件流的完整 schema**：
   - `/global/event` 和 `/event` 的区别？
   - 每种事件类型的 payload 结构定义在哪里？
   - 是否有 TypeScript 类型定义可以直接使用？

2. **Session 状态追踪**：
   - 如何可靠地检测子 Agent 执行完成？
   - 如何检测子 Agent 因上下文耗尽而中断？
   - `session.idle` 事件是否意味着 Agent 已完成所有工作？

3. **消息级别的追踪**：
   - 能否通过事件追踪每个 tool call 的开始和结束？
   - 能否获取每个 Agent turn 的 token 使用量？

### 3.5 Plugin 中注册 Custom Tool 的行为

1. **Plugin 的 `tool` 字段 vs `.opencode/tools/` 目录**：
   - 两者注册的工具有什么区别？
   - Plugin tool 是否也受 `permission` 系统控制？
   - Plugin tool 的命名规则是什么？（是否自动加前缀？）

2. **Plugin tool 的可见性控制**：
   - 能否让某些 Plugin tool 只对特定 Agent 可见？
   - 是否可以通过 `permission` 的 glob pattern 实现？（如 `"sf_*": "deny"`）

### 3.6 `experimental.session.compacting` 的行为

1. **Compaction 触发条件**：
   - 什么时候触发 compaction？是基于 token 数还是消息数？
   - 能否手动触发 compaction？

2. **Compaction 后的状态**：
   - compaction 后，之前的 tool call 历史是否保留？
   - 子 Agent 是否也会独立触发 compaction？

### 3.7 文件系统监听

1. **`file.edited` / `file.watcher.updated` 事件**：
   - 这些事件是否只在 Agent 编辑文件时触发？还是用户手动编辑也会触发？
   - 事件 payload 包含哪些信息（文件路径、变更内容、变更者）？

### 3.8 安装与部署

1. **Plugin 大小限制**：
   - 文档提到"plugin loading issues with large files"，具体限制是多少？
   - 我们当前的 Plugin 入口文件约 2900 行（通过 thin entry + lib 分离解决），这个限制是否有计划放宽？

2. **`opencode.json` 的合并策略**：
   - 全局 config 和项目 config 的合并规则是什么？
   - Agent 定义是覆盖还是合并？
   - 如果全局定义了 `sf-orchestrator`，项目级能否覆盖其 `permission`？

3. **Plugin 的热重载**：
   - 修改 Plugin 文件后是否需要重启 OpenCode？
   - 是否有开发模式支持 watch + reload？

---

## 4. 我们遇到的具体痛点

### 4.1 Agent 身份识别

**问题**：在 `tool.execute.before` hook 中，我们需要知道"是哪个 Agent 在调用这个工具"，以实施基于角色的权限控制。

**当前方案**：我们假设 `input.agent` 字段存在（从代码中可以看到我们使用了 `input.agent || "unknown"`），但不确定这是否是稳定 API。

**期望**：确认 `input.agent` 字段的存在性和稳定性，或提供替代方案。

### 4.2 子 Agent 上下文耗尽检测

**问题**：当子 Agent 因 token 限制而中断时，Orchestrator 需要检测到这个情况并启动续接流程。

**当前方案**：通过检查 session 事件和 trace 日志中的特定模式来推断。

**期望**：是否有明确的事件或 API 来检测"Agent 因上下文耗尽而停止"？

### 4.3 并行子 Agent 调度

**问题**：我们希望 Orchestrator 能同时调度多个独立的子 Agent（并行执行不同 Task）。

**当前方案**：在同一消息中发起多个 `task` 工具调用。

**期望**：确认这种用法是否被支持？多个并行 Task 调用的行为是什么（串行执行还是真正并行）？

### 4.4 Plugin 初始化的原子性

**问题**：Plugin 需要在 OpenCode 启动时自动初始化项目运行时目录结构（创建 `specforge/` 目录和初始文件）。

**当前方案**：在 Plugin 的 async 初始化函数中执行文件系统操作。

**期望**：Plugin 初始化是否保证在 Agent 开始工作前完成？如果初始化失败，Plugin 的 hook 是否仍然会被注册？

---

## 5. 总结：我们依赖的 OpenCode 能力清单

| 能力类别 | 具体功能 | 重要程度 |
|----------|----------|----------|
| Plugin Hook | `tool.execute.before`（含 agent 身份） | 🔴 关键 |
| Plugin Hook | `tool.execute.after` | 🟡 重要 |
| Plugin Hook | `event`（事件监听） | 🟡 重要 |
| Plugin Hook | `experimental.session.compacting` | 🟢 有用 |
| Plugin Context | `directory`, `worktree`, `client`, `$` | 🔴 关键 |
| Plugin Tool | 通过 Plugin 注册自定义工具 | 🔴 关键 |
| Agent 系统 | Primary + Subagent 模式 | 🔴 关键 |
| Agent 系统 | `permission.task` 控制调度权限 | 🔴 关键 |
| Agent 系统 | `permission.edit: deny` 只读 Agent | 🔴 关键 |
| Agent 系统 | `hidden: true` 隐藏 Agent | 🟡 重要 |
| Agent 系统 | Task 工具的并行调用 | 🟡 重要 |
| Custom Tool | `tool()` helper + context | 🔴 关键 |
| Custom Tool | context.agent 身份信息 | 🔴 关键 |
| Skills | SKILL.md 按需加载 | 🟡 重要 |
| Skills | Agent 级别的 skill permission | 🟡 重要 |
| Config | Agent 定义（Markdown + JSON） | 🔴 关键 |
| Config | 全局/项目级 config 合并 | 🟡 重要 |
| 事件系统 | Session 生命周期事件 | 🟡 重要 |
| 事件系统 | 子 Agent 完成/失败检测 | 🟡 重要 |

---

## 6. 联系方式

如果 OpenCode 作者能针对第 3 节中的问题提供详细说明（API 签名、行为规范、限制条件），将极大帮助 SpecForge 的稳定性和正确性。

我们特别希望获得：
1. `tool.execute.before` 和 `tool.execute.after` 的完整 input/output 类型定义和行为保证
2. Agent Task 调度的完整生命周期文档
3. 子 Agent 上下文耗尽的检测机制
4. Plugin 初始化时序保证
5. `permission.task: deny` 的精确行为（工具是否从描述中移除）
