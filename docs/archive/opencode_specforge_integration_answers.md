# SpecForge × OpenCode 深度集成说明（基于当前 OpenCode 源码）

基于我阅读的 OpenCode 当前源码（主要是 plugin、session、tool、agent 相关模块）以及你提供的集成简报，我给你一个“哪些是稳定事实、哪些是当前实现细节、哪些不能依赖”的工程级回答。

我会明确区分：

- Confirmed（源码确认）
- Inferred（从实现推断，但不是稳定 API）
- Unsafe to rely on（不要依赖）

因为你现在做的不是普通插件，而是在 OpenCode 上实现一个“操作系统级 orchestrator framework”。

你真正要解决的问题不是“插件怎么写”，而是：

> 如何在 OpenCode 的演化过程中，仍然保证 SpecForge 的行为稳定。

这决定了你哪些能力必须自己兜底，哪些可以依赖 OpenCode。

---

# 1. Plugin Hook：真实行为与稳定性

## 1.1 `tool.execute.before` 的真实输入结构

## Confirmed

当前源码里，hook 调用位置大致是：

```ts
plugin.trigger(
  "tool.execute.before",
  {
    tool: item.id,
    sessionID: ctx.sessionID,
    callID: ctx.callID,
  },
  { args },
)
```

因此当前稳定存在的是：

```ts
{
  tool: string
  sessionID: string
  callID: string
}
```

`args` 在 output 参数里。

当前并没有看到官方注入：

```ts
input.agent
```

因此：

# 结论

你现在依赖 `input.agent` 是危险的。

它不是稳定 API。

很可能根本不存在。

---

## 1.2 如何识别当前 Agent

这是你系统里最大的真实风险。

因为：

你整个权限系统建立在：

```text
“谁调用了工具”
```

而 OpenCode 当前 Plugin Hook 的核心身份是：

```text
session
```

不是：

```text
agent
```

---

## 你现在应该怎么做

不要尝试依赖 Plugin Hook 自动给你 Agent 名称。

正确做法：

# 方案：Session → Agent Registry

你自己维护：

```text
sessionID -> agent identity
```

映射。

也就是：

当 orchestrator 创建 subagent 时：

```json
{
  "sessionID": "xxx",
  "agent": "sf-reviewer"
}
```

写入你自己的 registry。

之后：

Plugin Hook 里：

```ts
const agent = registry.get(input.sessionID)
```

这是稳定方案。

不是：

```ts
input.agent
```

---

# 2. `throw Error` 是否是官方阻断方式

## Confirmed

是。

当前 OpenCode 社区大量 guard/plugin 都这么做。

包括：

- destructive command guard
- permission guard
- command policy plugins

本质机制就是：

```ts
throw new Error("blocked")
```

来中断 tool execution。

---

## Agent 会看到什么

当前行为本质上是：

```text
Tool execution failed
```

然后带错误消息。

因此：

```ts
throw new Error("Reviewer cannot edit files")
```

Agent 基本会看到这句话。

---

## 工程建议

不要抛泛型 Error。

建议统一：

```ts
class PermissionDenied extends Error {}
class RetryableToolError extends Error {}
class FatalWorkflowError extends Error {}
```

然后你自己的 orchestrator 根据错误类型处理。

否则后期：

- retry
- workflow rollback
- auto recovery
- continuation

都会失控。

---

# 3. `tool.execute.after` 是否能修改 Agent 看到的结果

## Confirmed

当前 hook 的 output 是“可变对象”。

trigger 执行后，output 会继续往下传。

因此：

```ts
output.output = "modified"
```

理论上会影响 Agent 最终看到的结果。

---

## 但这里有一个关键问题

OpenCode 当前缺少：

```text
真正的 AI-visible injection
```

这是当前 OpenCode 插件系统最大的能力缺口。

社区已经有人提 issue。

因为：

修改 tool output ≠ 注入 system/user reminder。

这是两件事。

---

## 这意味着什么

你现在不能可靠实现：

```text
持续行为约束（behavior reinforcement）
```

例如：

- 每次 edit 后提醒更新 progress.md
- compaction 后重新注入 workflow discipline
- stop 前检查 planning 文件

这正是你文档里提到的问题。

你的判断是对的。

这是 OpenCode 当前真实短板。

---

# 4. Plugin 加载顺序与初始化时序

## Confirmed

源码里：

```ts
// Keep plugin execution sequential so hook registration and execution
// order remains deterministic across plugin runs.
```

因此：

# Plugin 加载顺序是确定性的

而不是并发。

---

## 当前顺序

大致：

1. internal plugins
2. config plugins
3. auth plugins
4. local plugins

然后 sequential apply。

---

## Plugin 初始化是否会在 Agent 工作前完成

## Inferred（高度可信）

大概率是。

因为：

Plugin Service 初始化后才进入 Session Runtime。

否则 tool hooks 不可能存在。

---

## 但你不能依赖“初始化失败自动阻塞系统”

当前代码里：

```ts
Effect.catch(() => Effect.void)
```

说明：

Plugin 加载失败可能被吞掉。

系统继续运行。

这很危险。

---

# 工程建议

你必须自己做：

```text
SpecForge bootstrap verification
```

即：

OpenCode 启动后：

先验证：

- runtime 是否初始化完成
- registry 是否存在
- graph schema 是否存在
- required tools 是否加载

否则：

拒绝 workflow 开始。

不要相信 Plugin init 成功。

---

# 5. `permission.task: deny` 的真实语义

## Inferred（非常可信）

当前行为更接近：

```text
工具从 agent capability 中移除
```

而不是：

```text
可见但调用失败
```

因为 OpenCode 的 Agent Tool 构建阶段会根据 permission 裁剪工具集合。

你观察到：

```text
subagent 不知道 task tool 存在
```

这符合当前实现架构。

---

# 这意味着什么

你的：

```text
Agent isolation design
```

方向是正确的。

这是 OpenCode 当前非常强的一点。

比很多 agent framework 更干净。

---

# 6. 子 Agent 生命周期

# 6.1 Task 是否创建 child session

## Confirmed / Highly inferred

是。

Task 本质是：

```text
独立 session execution
```

否则：

- token accounting
- independent history
- async execution
- isolation

都做不到。

---

# 6.2 child session 是否独立 context window

是。

否则 subagent 无法 scale。

---

# 6.3 child session 是否自动销毁

当前更像：

```text
session retained
```

而不是立即销毁。

因为：

OpenCode 有 session review/history/event stream。

---

# 6.4 subagent 输出是否完整返回

## Unsafe to rely on

不要假设：

```text
full transcript guaranteed
```

更安全的假设：

```text
summary / compressed return
```

因为后续：

- compaction
- truncation
- model provider limits

都可能改变行为。

---

# 正确做法

SpecForge 不要依赖：

```text
subagent chat transcript
```

作为系统状态。

真正状态必须写入：

- artifact
- graph
- state store
- continuity store

聊天历史只能当缓存。

这是非常关键的架构边界。

---

# 7. 并行子 Agent 调度

## 当前情况

OpenCode 内部具备并行能力。

但：

你不能假设：

```text
multiple task calls in same turn
```

一定真正并发。

因为不同 provider/model adapter 可能不同。

---

# 更大的问题

真正风险不是“能不能并行”。

而是：

```text
shared workspace concurrency
```

例如：

两个 executor：

```text
同时 edit 同一文件
```

这才是灾难。

---

# 你真正需要的不是“并行 task”

而是：

# Workspace-level locking

你需要：

```text
Task scheduler
  -> file ownership
  -> component ownership
  -> graph dependency lock
```

否则：

Agent 并行越强。

系统越不稳定。

---

# 8. Compaction：真实情况

这是你整个系统另一个高风险区。

---

# 8.1 当前 OpenCode 的 compaction 本质

它不是：

```text
durable memory system
```

它只是：

```text
conversation summarization
```

---

# 8.2 这意味着什么

以下内容：

```text
behavioral discipline
workflow rules
operational contracts
multi-agent coordination state
```

都可能在 compaction 后丢失。

你已经观察到了。

你的观察是正确的。

---

# 8.3 所以 SpecForge 必须 externalize memory

也就是：

真正系统状态：

绝不能放在 conversation。

必须放：

```text
specforge/state/
specforge/graph/
specforge/runtime/
specforge/continuity/
```

然后每次 turn：

动态 rebuild context。

这才是正确架构。

不是依赖 session memory。

---

# 9. `experimental.session.compacting`

## 当前定位

它更像：

```text
custom summarization hook
```

而不是：

```text
memory persistence framework
```

因此：

不要把它当 durable orchestration layer。

---

# 10. Tool Context：你真正应该依赖什么

## 不要依赖

```ts
context.agent
```

除非你亲自验证源码存在。

---

## 应该依赖

```ts
context.sessionID
```

这是真正稳定 identity。

然后你自己：

```text
session -> agent
session -> work item
session -> workflow phase
```

映射。

这是正确架构。

---

# 11. Tool 返回值：应该返回 JSON 还是字符串

# 正确答案：

结构化 JSON。

不要返回自然语言。

---

例如：

```json
{
  "status": "passed",
  "violations": [],
  "next_state": "design"
}
```

而不是：

```text
The design looks good.
```

因为你做的是：

```text
workflow engine
```

不是聊天机器人。

---

# 12. Event 系统：现实情况

当前 event 系统更接近：

```text
internal bus exposure
```

不是稳定 public event contract。

因此：

# 不要强绑定 payload schema

因为后续改动概率很高。

---

# 工程建议

你应该做：

```ts
safeParseEvent(event)
```

并允许：

```text
unknown fields
missing fields
future fields
```

否则未来 OpenCode 升级你会很痛苦。

---

# 13. Plugin Tool vs `.opencode/tools`

这是一个非常重要的问题。

---

# Plugin tool

更像：

```text
runtime-injected tool
```

适合：

- global capability
- dynamic capability
- infra capability

---

# `.opencode/tools`

更像：

```text
workspace-level tool registry
```

适合：

- repo-specific tooling
- project-local workflows
- versioned tool behavior

---

# 对 SpecForge 的建议

你的方向其实已经对了：

# 核心 orchestration capability

放 Plugin。

# project workflow tools

放 `.opencode/tools`。

这是正确分层。

---

# 14. 你现在架构里真正危险的点

这里我直接说结论。

---

# 风险 1：你仍然部分依赖 conversation state

你已经开始 externalize。

但还不够。

真正 durable 的只有：

```text
filesystem + graph + explicit state
```

不是 conversation。

---

# 风险 2：Agent identity 不稳定

你现在默认：

```text
plugin 能知道 agent
```

这是错误假设。

你必须自己建立 session registry。

这是必须修正的。

---

# 风险 3：你把 OpenCode 当成 workflow engine

它不是。

它本质仍然是：

```text
AI coding runtime
```

SpecForge 才是 workflow engine。

所以：

workflow durability
workflow recovery
workflow determinism
workflow orchestration
workflow memory

这些都必须由 SpecForge 自己负责。

不是 OpenCode。

这是最关键的架构边界。

---

# 15. 我对你当前架构的总体评价

你现在方向总体是对的。

尤其是：

- orchestrator + specialist agents
- state machine workflow
- graph-based traceability
- continuity engine
- quality gates
- externalized artifacts

这些方向都比绝大多数“AI agent framework”成熟。

---

# 但你现在需要做的转变

不是：

```text
“如何更多利用 OpenCode”
```

而是：

```text
“如何降低对 OpenCode 内部行为的依赖”
```

因为：

你已经在做：

```text
platform-on-platform
```

你必须把 OpenCode 当：

```text
LLM execution kernel
```

而不是完整操作系统。

SpecForge 自己才是操作系统。

这是你后续架构是否稳定的决定性因素。

---

# 16. 我给你的最终建议（非常重要）

如果我是你。

我会把 SpecForge 分成：

# Layer 1：OpenCode Adapter

只负责：

- tool execution
- agent spawning
- session tracking
- event ingestion

严格薄层。

---

# Layer 2：SpecForge Runtime

真正核心：

- state machine
- graph
- orchestration
- continuity
- recovery
- scheduling
- permissions
- locking
- verification

全部独立。

---

# Layer 3：Project Runtime

每个 repo 的：

- specs
- tasks
- artifacts
- local tools
- local agents

---

# 为什么这样最重要

因为未来你一定会遇到：

- OpenCode breaking changes
- provider behavior changes
- compaction changes
- session changes
- tool lifecycle changes

如果你把“核心逻辑”放在 OpenCode Hook 行为里。

你后面会越来越难维护。

但如果：

OpenCode 只是 execution substrate。

那么你整个系统会稳定很多。

这是我认为你现在最应该做的架构收敛。

