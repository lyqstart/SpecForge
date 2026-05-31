# SpecForge 运行流程审核报告

**审核日期**: 2026-05-31
**审核范围**: 全系统运行流程（基于日志、state、归档、specs 目录交叉验证）
**数据来源**: state.json / trace.jsonl / tool_calls.jsonl / guard.log / error.log / cost.jsonl / agent_runs 归档 / specs 目录

---

## 一、总览评分

| 审核维度 | 状态 | 评分 |
|---------|------|------|
| 流程是否正常运行 | ⚠️ 部分异常 | 4/10 |
| Agent 是否被正确调用 | ⚠️ 部分正常 | 5/10 |
| Tool 是否被调用 | ✅ 正常 | 8/10 |
| Skill 是否被调用 | ✅ 正常 | 8/10 |
| 文件是否落盘 | ❌ 严重异常 | 3/10 |
| 条件是否被正确判断 | ❌ 严重异常 | 2/10 |

---

## 二、发现的严重问题（P0）

### P0-1: Agent 身份检测失败 → PermissionGuard 误拦截 sf_state_transition

**现象**: guard.log 记录了 7 次 sf_state_transition 被拦截：
```
"Agent unknown 无权调用 sf_state_transition，仅 Orchestrator 可调用"
```

**根因**: 所有日志中 `agent` 字段均为 `"unknown"`：
- cost.jsonl: `agent: "unknown"`, `model: "unknown"` (全量 2078 条)
- trace.jsonl: `agent: "unknown"`
- tool_calls.jsonl: `agent: "unknown"`

**影响**:
- sf_state_transition 的 PermissionGuard 依赖 agentName 判断是否为 Orchestrator
- 当 agentName 为 "unknown" 时，Guard 拒绝所有状态流转
- 导致 Work Item 创建失败、状态流转失败

**证据**: 用户五子棋测试会话中，Orchestrator 连续尝试了 3 次 WI 创建（WI-001 → WI-002 → wzq-gomoku-001），前两次均因 Guard 拦截失败，第三次才可能成功。

### P0-2: State 持久化与 Specs 目录严重不一致

**现象**:
- `state.json`: `workItems: []`（空，0 个 WI 注册）
- `specs/` 目录：20 个 WI 子目录（WI-001 到 WI-035，有间隔）
- `agent_runs/` 目录：126 个 Agent Run 归档

**影响**:
- state.json 被清空或从未正确写入，导致所有 WI 的状态信息丢失
- 系统无法进行会话恢复（因为 state 中无 WI 记录）
- 已有的 20 个 specs 目录成为"孤儿"数据，系统不认知它们

### P0-3: Checkpoints 目录为空

**现象**: `.specforge/runtime/checkpoints/` 目录下 0 个文件

**影响**:
- 设计中的 checkpoint recovery 机制完全失效
- 会话恢复流程无法工作（即使 state.json 有记录，也无法读取恢复上下文）

### P0-4: sf_artifact_write 存在代码 Bug

**现象**: error.log 记录：
```
resolver is not a function. (In 'resolver(workItemId, runId)', 'resolver' is undefined)
```

**影响**: sf_artifact_write 工具在部分场景下会崩溃，导致产物文件写入失败

---

## 三、发现的中等问题（P1）

### P1-1: 日志事件重复写入

**现象**: trace.jsonl / tool_calls.jsonl / cost.jsonl 中，每条记录都出现两次完全相同的时间戳和内容

**影响**: 
- 日志体积膨胀一倍
- 统计数据（如成本、工具调用次数）会被双重计算
- 可能是事件监听器注册了两次

### P1-2: 日志在 5月24日后停止写入

**现象**: 
- tool_calls.jsonl 最后记录: `2026-05-24T05:42:14`
- 当前日期: 2026-05-31
- 7 天的日志空白

**可能原因**:
- sf_event_logger 插件组件异常退出
- 日志文件句柄丢失
- plugin 生命周期管理问题

### P1-3: Work Item ID 分配不连续

**现象**: specs 目录包含 WI-001 到 WI-035，但存在间隔：
- 缺失: WI-008, WI-015~WI-018, WI-021~WI-029, WI-034

**可能原因**: 
- 部分创建尝试在 sf_state_transition 阶段失败
- 但 specs 目录的创建是另一个工具（mkdir），可能在 transition 失败前就已创建
- 导致"空壳" WI 目录残留

---

## 四、Tool 调用审核

### ✅ 正常调用的 Tool

| Tool | 调用次数(去重) | 说明 |
|------|-------------|------|
| sf_state_read | ~16次 | 状态读取正常 |
| sf_safe_bash | ~80+次 | 占比最高，子 Agent 内大量使用 |
| sf_artifact_write | ~6次 | 产物写入（部分因 Bug 失败） |
| sf_context_build | ~4次 | 子 Agent 上下文构建 |
| sf_batch_verify | ~16次 | 验证检查 |
| sf_requirements_gate | ~3次 | 需求 Gate |
| sf_doc_lint | ~4次 | 文档结构检查 |
| sf_tasks_gate | 1次 | 任务 Gate |
| sf_doctor | 1次 | 系统健康检查 |
| sf_project_init | 1次 | 项目初始化 |

### ⚠️ 被拦截的 Tool

| Tool | 被拦截次数 | 原因 |
|------|-----------|------|
| sf_state_transition | 7次 | PermissionGuard 拦截（agent=unknown） |

### ❓ 未在日志中出现的 Tool

| Tool | 预期 | 说明 |
|------|------|------|
| sf_design_gate | 应出现 | 设计阶段 Gate 未被调用？ |
| sf_verification_gate | 应出现 | 验证 Gate 未被调用？ |
| sf_trace_matrix | 应出现 | 追溯矩阵未使用 |
| sf_continuity | 按需 | 续接工具 |
| sf_knowledge_base | 按需 | 知识库 |
| sf_knowledge_graph | 按需 | KG 操作 |

---

## 五、Skill 调用审核

| Skill | 是否调用 | 证据 |
|-------|---------|------|
| sf-workflow-feature-spec | ✅ | 用户五子棋会话中加载 |
| sf-workflow-change-request | ✅ | trace.jsonl 记录 skill 调用 |
| superpowers-writing-plans | ✅ | 由 sf-executor 子 Agent 使用 |
| superpowers-verification-before-completion | ✅ | 由 sf-verifier 子 Agent 使用 |
| superpowers-subagent-driven-development | ✅ | 由 sf-executor 子 Agent 使用 |

---

## 六、Sub-Agent 调度审核

**agent_runs/ 归档统计**（126 个目录）:

| Agent 类型 | 被调度的 WI 数量 | 总 Run 数 | 说明 |
|-----------|----------------|----------|------|
| sf-executor | 14 个 WI | ~75 runs | 最频繁，WI-006 有 15 次（重试模式） |
| sf-design | 10 个 WI | ~12 runs | |
| sf-requirements | 6 个 WI | ~8 runs | |
| sf-task-planner | 5 个 WI | ~6 runs | |
| sf-reviewer | 4 个 WI | ~5 runs | |
| sf-verifier | 5 个 WI | ~5 runs | |

**结论**: Sub-Agent 调度机制本身正常工作。126 个 agent run 归档证明 Task tool + sf_context_build 组合被正确使用。

---

## 七、条件判断审核

### ❌ 失败的条件判断

| 条件 | 预期行为 | 实际行为 | 严重程度 |
|------|---------|---------|---------|
| agentName == "sf-orchestrator" | 识别 Orchestrator | 恒为 "unknown" | P0 |
| sf_state_transition 权限检查 | 允许 Orchestrator | 全部拒绝 | P0 |
| Checkpoint 生成 | 每次状态流转后生成 | 从未生成 | P0 |
| WI ID 唯一性检查 | 已有 WI 不重复创建 | WI-001 在 specs 中已存在仍尝试创建 | P1 |

### ✅ 正常的条件判断

| 条件 | 行为 |
|------|------|
| Gate 通过后状态流转 | requirements_gate pass → requirements 状态 |
| 文档 lint 检查 | 在 Gate 前执行 |
| 子 Agent 失败重试 | WI-006 executor 有 15 次重试记录 |

---

## 八、文件落盘审核

### ✅ 正常落盘的文件

| 文件 | 状态 |
|------|------|
| .specforge/manifest.json | ✅ schema_version 6.0 |
| .specforge/config/* (6 files) | ✅ 全部存在 |
| .specforge/specs/WI-*/intake.md | ✅ 多个 WI 有 |
| .specforge/specs/WI-*/requirements.md | ✅ 部分有 |
| .specforge/specs/WI-*/design.md | ✅ 部分有 |
| .specforge/specs/WI-*/tasks.md | ✅ 部分有 |
| .specforge/logs/*.jsonl | ✅ 多个日志文件 |

### ❌ 未落盘的文件

| 文件 | 预期 | 实际 |
|------|------|------|
| .specforge/runtime/checkpoints/*.recovery.md | 应在状态流转时生成 | 目录为空 |
| .specforge/runtime/wal.jsonl | 应存在 | 未检查到 |
| state.json 中的 workItems | 应有记录 | 空数组 |

---

## 九、根因分析

### 核心链路

```
Agent 身份检测失败 (agentName = "unknown")
    ↓
PermissionGuard 拦截 sf_state_transition
    ↓
Work Item 无法创建/状态无法流转
    ↓
后续所有依赖状态的流程中断（checkpoint、恢复、Gate 流转）
```

### 次要问题

1. **事件日志重复**: sf_event_logger 被注册两次（可能是 plugin 初始化 bug）
2. **artifact write Bug**: resolver 参数传递错误
3. **日志中断**: 5月24日后日志停止，可能是 plugin 崩溃

---

## 十、修复建议优先级

| 优先级 | 问题 | 建议修复方式 |
|-------|------|------------|
| P0 | agentName 检测失败 | 检查 sf_specforge_plugin_entry.ts 中 getAgentName() 的实现，确保能正确获取 "sf-orchestrator" |
| P0 | state.json 为空 | 调查 state 持久化是否被 PermissionGuard 问题连带影响 |
| P0 | Checkpoint 空目录 | 检查 checkpoint 生成逻辑是否依赖 state.json 中的 WI 记录 |
| P0 | sf_artifact_write resolver Bug | 修复 sf_artifact_write_core.ts 中 resolver 参数传递 |
| P1 | 日志重复写入 | 检查 plugin 注册逻辑，确保 eventBus 只注册一次 listener |
| P1 | 日志中断 | 添加 plugin 生命周期监控和自动恢复 |

---

**审核结论**: 系统的基础设施（Tool 注册、Skill 加载、Sub-Agent 调度、文件目录结构）均正常工作。核心阻塞问题是 **Agent 身份检测** 导致的 PermissionGuard 误拦截，这直接导致状态流转失败，进而影响整个工作流的推进。修复 agentName 检测后，预计大部分流程可恢复正常。
