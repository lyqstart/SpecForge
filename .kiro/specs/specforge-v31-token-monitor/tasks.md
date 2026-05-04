# 实施计划：SpecForge V3.1（上下文压缩感知与会话记录版）

## 概述

本实施计划基于已实现并经过 13 轮测试验证的 V3.0 系统，按 4 个阶段增量推进 V3.1 的全部新增功能。所有代码使用 TypeScript 编写，测试使用 Vitest + fast-check。每个阶段在前一阶段基础上构建，确保无孤立代码。

**关键约束：**
- 本项目运行在 OpenCode + Bun 运行时
- Plugin 必须自包含（不引用外部模块，仅使用 `node:` 内置模块）
- 核心模块（`.opencode/tools/lib/`）可被 Tool 和 Orchestrator 导入
- sf_checkpoint 内联的 `convertMessagesToJsonl()` 与 sf_conversation_recorder_core 的 `convertToConversationJsonl()` 输出格式一致，但各自独立实现
- 现有 381 个单元测试必须在所有变更后继续通过
- 所有新增属性测试使用 fast-check，最少 100 次迭代，标签格式：`Feature: specforge-v31-token-monitor, Property {N}: {text}`

## 任务

- [x] 1. Phase 1：install.ps1 配置合并逻辑（需求 1）
  - [x] 1.1 更新 scripts/install.ps1 — 新增全局配置合并逻辑
    - 修改 `scripts/install.ps1`
    - 在现有安装逻辑末尾（"后续步骤"提示之前）新增全局配置合并代码段
    - 实现读取现有全局配置 `~/.config/opencode/opencode.json`（如存在）
    - 实现 JSON 合并策略：仅新增/更新 `compaction` 和 `models` 顶层字段，保留所有其他现有字段
    - `compaction` 配置：`{ "auto": true, "prune": true, "reserved": 20000 }`
    - `models` 配置：`{ "zai-coding-plan/glm-5.1": { "context": 90000 } }`（不设置 `output`，使用 GLM-5.1 默认 max_tokens=65536）
    - 容错处理：全局配置目录不存在时递归创建；现有配置解析失败时创建新配置；写入失败时报告错误但不中断安装
    - 不修改项目级 `opencode.json`
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Phase 2：sf_conversation_recorder_core 核心模块（需求 4）
  - [x] 2.1 实现 sf_conversation_recorder_core.ts 核心模块
    - 创建 `.opencode/tools/lib/sf_conversation_recorder_core.ts`
    - 定义所有类型接口：`OpenCodeMessage`、`OpenCodePart`（联合类型：TextPart、ToolPart、StepFinishPart、ReasoningPart、UnknownPart）、`TextRecord`、`ToolCallRecord`、`ParseErrorRecord`、`ConversationRecord`
    - 实现 `extractMessageTokens(info: any): TextRecord["tokens"]` 函数：
      - 从 assistant 消息 info 中提取 tokens 结构（input、output、reasoning、cache_read、cache_write）
      - info.tokens 不存在时返回 null
      - 各字段不存在时为 null（`info.tokens.cache?.read` → `cache_read`）
    - 实现 `convertToRecords(messages: OpenCodeMessage[]): ConversationRecord[]` 函数：
      - 遍历消息数组，为每个 Part 生成一条记录
      - TextPart：生成包含 seq、role、timestamp、content 的文本记录；assistant 消息额外包含 tokens 和 cost
      - ToolPart（type="tool-invocation" 或 "tool"）：生成 tool_call 记录，result_preview 截断到 500 字符
      - StepFinishPart：跳过（不占用序号）
      - ReasoningPart：生成文本记录
      - null/非对象 Part：生成 parse_error 占位记录
      - 未知 Part 类型：生成 parse_error 占位记录
      - 异常 Part（处理时抛错）：捕获异常，生成 parse_error 记录
      - 无 parts 的纯 user 消息（info.content 存在）：直接记录 info.content
      - seq 从 1 开始单调递增
    - 实现 `recordsToJsonl(records: ConversationRecord[]): string` 函数：
      - 空数组返回空字符串
      - 每条记录序列化为一行 JSON，末尾有换行符
    - 实现 `convertToConversationJsonl(messages: OpenCodeMessage[]): string` 组合入口函数：
      - 调用 convertToRecords → recordsToJsonl
    - _需求: 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 4.11, 4.13_

- [x] 3. 检查点 — 确保 Phase 2 核心模块正确
  - 运行 `vitest run` 确保所有 381 个现有测试继续通过
  - 确认新增文件已创建：
    - `.opencode/tools/lib/sf_conversation_recorder_core.ts`
  - 确认新增文件无 TypeScript 编译错误
  - 如有疑问请向用户确认。

- [x] 4. Phase 3：sf_checkpoint Plugin 增强（需求 2、需求 4）
  - [x] 4.1 增强 sf_checkpoint.ts — 新增类型定义和导出函数
    - 修改 `.opencode/plugins/sf_checkpoint.ts`
    - 新增内部类型定义：`CompactionContext`、`ConversationRecord`、`CompactionEvent`
    - 实现并导出 `buildCompactionContext(stateData: any, recentEvents: any[]): string` 函数：
      - 从 state.json 提取所有非 completed 状态的 Work Item（work_item_id、workflow_type、current_state）
      - 从 events 数组提取最近 3 条 state.transitioned 事件的 from_state 和 to_state
      - 格式化为结构化文本，包含 spec 路径 `specforge/specs/<work_item_id>/`
      - 总长度不超过 2000 字符（COMPACTION_CONTEXT_MAX_CHARS），超长时截断并附加截断提示
    - 实现并导出 `convertMessagesToJsonl(messages: Array<{ info: any; parts: any[] }>): string` 函数：
      - 内联实现，不依赖外部模块（Plugin 自包含约束）
      - 与 sf_conversation_recorder_core 的 convertToConversationJsonl 输出格式一致
      - 处理 TextPart、ToolPart（tool-invocation/tool）、StepFinishPart（跳过）、ReasoningPart、未知类型（parse_error）
      - result_preview 截断到 500 字符
      - assistant 消息附加 tokens/cost
      - 空消息数组返回空字符串（末尾有换行符当有记录时）
    - 实现并导出 `extractRunIdFromEvents(recentEvents: any[]): string | null` 函数：
      - 从 events 数组中反向查找最近的 agent.dispatched 事件
      - 提取 payload.run_id 或 run_id
      - 未找到时返回 null
    - _需求: 2.1, 2.2, 2.3, 2.11, 4.1, 4.5, 4.6, 4.7_

  - [x] 4.2 增强 sf_checkpoint.ts — Plugin 导出结构变更
    - 修改 `.opencode/plugins/sf_checkpoint.ts`
    - 变更 Plugin 初始化签名：从 `async ({ directory })` 改为 `async ({ directory, client })`，保存 `client` 引用到闭包变量 `savedClient`
    - 新增 `"experimental.session.compacting"` 钩子处理：
      - 接收 `(input, output)` 参数
      - 读取 state.json 和 events.jsonl（最后 10 行）
      - 调用 `buildCompactionContext()` 构建上下文，通过 `output.context.push()` 注入
      - 调用 `savedClient.session.messages()` 获取会话历史
      - 调用 `convertMessagesToJsonl()` 转换为 JSONL
      - 根据 `extractRunIdFromEvents()` 结果决定保存路径：
        - 有 run_id → `specforge/archive/agent_runs/<run_id>/conversation_snapshot_{timestamp}.jsonl`
        - 无 run_id → `specforge/runtime/checkpoints/conversation_{sessionID}_{timestamp}.jsonl`
      - 继续执行现有 checkpoint 逻辑（保存 state.json 快照、生成 recovery.md）
      - 成功时记录 INFO 日志到 app.log
      - 整体异常捕获，记录 ERROR 日志到 error.log，不阻断压缩
    - 增强现有 `event` 处理函数，新增 `session.compacted` 事件处理：
      - 读取 state.json 获取活跃 Work Item
      - 构建 `context.compacted` 事件记录（CompactionEvent）
      - 追加写入 events.jsonl
      - 不 return，允许继续执行现有 session.compacting 逻辑
    - 保持现有 `session.compacting` 事件处理逻辑完全不变
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 4.1, 5.2, 5.3_

- [x] 5. 检查点 — 确保 Phase 3 Plugin 增强正确
  - 运行 `vitest run` 确保所有 381 个现有测试继续通过（特别是 sf_checkpoint 现有测试）
  - 确认 sf_checkpoint.ts 无 TypeScript 编译错误
  - 确认现有 sf_checkpoint 测试全部通过（generateRecoverySummary 相关测试不受影响）
  - 如有疑问请向用户确认。

- [x] 6. Phase 4：单元测试与属性测试（需求 5）
  - [x] 6.1 编写 sf_conversation_recorder_core 单元测试
    - 创建 `tests/unit/tools/lib/sf_conversation_recorder_core.test.ts`
    - **单元测试场景：**
      - `convertToRecords`：空 Session（无消息）返回空数组
      - `convertToRecords`：纯 user 文本消息正确转换（包含 seq、role、timestamp、content）
      - `convertToRecords`：assistant 文本消息含 tokens/cost 正确提取
      - `convertToRecords`：assistant 文本消息无 tokens/cost 时 tokens 和 cost 为 null
      - `convertToRecords`：工具调用消息正确转换（包含 type="tool_call"、tool、args、result_preview、status、duration_ms）
      - `convertToRecords`：工具调用结果超过 500 字符被截断
      - `convertToRecords`：工具调用状态为 error 时 status 字段为 "error"
      - `convertToRecords`：混合类型消息（同一消息中 text + tool Part 都被正确转换）
      - `convertToRecords`：StepFinishPart 跳过（不生成记录，不占用序号）
      - `convertToRecords`：ReasoningPart 正确转换为文本记录
      - `convertToRecords`：无法解析的 Part 类型生成 parse_error 占位记录
      - `convertToRecords`：null Part 生成 parse_error 占位记录
      - `convertToRecords`：异常 Part（处理时抛错）捕获异常，生成 parse_error 记录
      - `convertToRecords`：无 parts 的纯 user 消息（info.content 存在）直接记录
      - `extractMessageTokens`：完整数据正确提取所有 token 字段
      - `extractMessageTokens`：部分数据缺失字段为 null
      - `extractMessageTokens`：无数据返回 null
      - `recordsToJsonl`：空数组返回空字符串
      - `recordsToJsonl`：每行一条 JSON，末尾有换行
      - `convertToConversationJsonl`：端到端完整流程正确
    - _需求: 4.4, 4.5, 4.6, 4.7, 4.10, 4.11, 4.13, 5.8_

  - [ ]* 6.2 编写属性测试 — Property 4: 消息转换 JSONL 格式正确性
    - 在 `tests/unit/tools/lib/sf_conversation_recorder_core.test.ts` 中新增属性测试
    - **Property 4: 消息转换 JSONL 格式正确性**
    - 使用 fast-check 生成随机消息数组（0-50 条消息，每条 0-10 个 Part，Part 类型随机：text、tool-invocation、step-finish、reasoning、unknown）
    - 验证：`convertToRecords()` 生成的每条记录序列化为 JSON 后为合法 JSON 字符串
    - 验证：`recordsToJsonl()` 的输出中每行都是独立的合法 JSON 对象
    - 标签：`Feature: specforge-v31-token-monitor, Property 4: JSONL format correctness`
    - **验证: 需求 4.4, 4.5**

  - [ ]* 6.3 编写属性测试 — Property 5: 消息转换字段完整性
    - **Property 5: 消息转换字段完整性**
    - 使用 fast-check 生成包含文本消息、工具调用、混合类型消息的随机 OpenCode 消息数组
    - 验证：所有文本消息记录包含 seq、role、timestamp、content 字段
    - 验证：所有 assistant 文本消息记录额外包含 tokens 和 cost 字段（值可为 null）
    - 验证：所有工具调用记录包含 seq、role、timestamp、type="tool_call"、tool、args、result_preview（≤500 字符）、status、duration_ms 字段
    - 验证：seq 从 1 开始单调递增
    - 标签：`Feature: specforge-v31-token-monitor, Property 5: message conversion field completeness`
    - **验证: 需求 4.5, 4.6, 4.7, 4.11**

  - [ ]* 6.4 编写属性测试 — Property 6: 无法解析消息的容错
    - **Property 6: 无法解析消息的容错**
    - 使用 fast-check 生成混合有效/无效 Part 的消息数组（null Part、未知 Part 类型、异常 Part）
    - 验证：每个无法解析的 Part 生成一条 parse_error 类型的占位记录（包含 seq、type="parse_error"、raw_type、error）
    - 验证：不影响其他有效消息的转换
    - 标签：`Feature: specforge-v31-token-monitor, Property 6: parse error tolerance`
    - **验证: 需求 4.13**

  - [x] 6.5 编写 sf_checkpoint Plugin 新增功能单元测试
    - 在 `tests/unit/plugins/sf_checkpoint.test.ts` 中新增测试用例
    - **buildCompactionContext 测试场景：**
      - 基本功能：正确提取活跃 Work Item 和最近流转
      - 空数据：state.json 为空或不存在时返回"无"提示
      - 截断：大量 Work Item 时输出不超过 2000 字符
      - 仅包含 completed 状态的 Work Item 时显示"无"
      - 多个活跃 Work Item 全部列出
      - 最近流转超过 3 条时仅显示最后 3 条
      - 过滤非 state.transitioned 事件
    - **convertMessagesToJsonl 测试场景：**
      - 文本消息正确转换（user/assistant）
      - 工具调用正确转换（tool-invocation Part）
      - 混合消息（同一消息中包含文本和工具调用）
      - 空消息数组返回空字符串
      - result_preview 超过 500 字符被截断
      - assistant 消息附加 tokens/cost
      - StepFinishPart 跳过
      - 未知 Part 类型生成 parse_error
    - **extractRunIdFromEvents 测试场景：**
      - 有 agent.dispatched 事件时正确提取 run_id
      - 无 agent.dispatched 事件时返回 null
      - 多个 agent.dispatched 事件时返回最近的 run_id
    - _需求: 2.1, 2.2, 2.3, 2.5, 2.6, 2.10, 4.5, 4.7, 5.2, 5.7_

  - [ ]* 6.6 编写属性测试 — Property 1: Compaction_Context 注入完整性
    - 在 `tests/unit/plugins/sf_checkpoint.test.ts` 中新增属性测试
    - **Property 1: Compaction_Context 注入完整性**
    - 使用 fast-check 生成随机 state.json（0-20 个 Work Item，随机状态含 completed 和非 completed）和随机 events 数组（0-30 条事件，含 state.transitioned 和其他类型）
    - 验证：输出包含所有非 completed 状态的 Work Item 的 work_item_id、workflow_type 和 current_state
    - 验证：输出包含最近 3 条（或更少）状态流转记录的 from_state 和 to_state
    - 验证：每个活跃 Work Item 的 spec 路径格式为 `specforge/specs/<work_item_id>/`
    - 标签：`Feature: specforge-v31-token-monitor, Property 1: compaction context injection completeness`
    - **验证: 需求 2.1, 2.2**

  - [ ]* 6.7 编写属性测试 — Property 2: Compaction_Context 长度不变量
    - **Property 2: Compaction_Context 长度不变量**
    - 使用 fast-check 生成极端大小的 state.json（0-200 个 Work Item）和 events 数组（0-100 条事件）
    - 验证：`buildCompactionContext()` 生成的上下文文本长度始终不超过 2000 字符
    - 标签：`Feature: specforge-v31-token-monitor, Property 2: compaction context length invariant`
    - **验证: 需求 2.3**

  - [ ]* 6.8 编写属性测试 — Property 3: 压缩事件记录字段完整性
    - **Property 3: 压缩事件记录字段完整性**
    - 使用 fast-check 生成随机 session_id 和 state.json 数据
    - 模拟构建 CompactionEvent 记录
    - 验证：生成的记录包含所有必需字段（timestamp、event_type="context.compacted"、session_id、payload.active_work_items）
    - 验证：active_work_items 中的每个条目都包含 work_item_id 和 current_state
    - 标签：`Feature: specforge-v31-token-monitor, Property 3: compaction event field completeness`
    - **验证: 需求 2.8, 2.9**

- [x] 7. 检查点 — 确保 Phase 4 测试全部通过
  - 运行 `vitest run` 确保所有测试通过（包括 381 个现有测试和所有新增测试）
  - 确认新增测试文件已创建：
    - `tests/unit/tools/lib/sf_conversation_recorder_core.test.ts`
  - 确认 sf_checkpoint.test.ts 中新增测试全部通过
  - 确认属性测试（Property 1-6）全部通过，每个属性至少 100 次迭代
  - 如有疑问请向用户确认。

- [x] 8. Phase 5：sf-orchestrator 协议更新（需求 3、需求 4）
  - [x] 8.1 更新 sf-orchestrator.md — Agent Run Archive 会话记录步骤
    - 修改 `.opencode/agents/sf-orchestrator.md`
    - 在"Agent Run Archive 协议"章节的归档创建流程中，步骤 0（sf_cost_report）之后新增步骤 0.5：
      - 调用 `client.session.messages({ path: { id: <agent_session_id> } })` 获取完整会话历史
      - 将消息数组传递给 sf_conversation_recorder_core 的 `convertToConversationJsonl()` 转换为 JSONL
      - 将 JSONL 内容写入 `specforge/archive/agent_runs/<run_id>/conversation.jsonl`
      - 如果步骤 a-c 任一失败，静默跳过，在 result.json 中标记 `conversation_recorded: false`
    - _需求: 4.2, 4.3, 4.8, 4.12_

  - [x] 8.2 更新 sf-orchestrator.md — Agent Run Archive 压缩事件检查步骤
    - 修改 `.opencode/agents/sf-orchestrator.md`
    - 在步骤 0.5 之后新增步骤 0.7：
      - 读取 `specforge/runtime/events.jsonl`
      - 查找 start_time 到 end_time 之间的 `context.compacted` 事件
      - 如果找到压缩事件，设置 `compaction_occurred: true`
      - 如果未找到，设置 `compaction_occurred: false`
      - 如果读取/解析失败，设置 `compaction_occurred: null`
    - 更新 result.json 模板，新增字段：`compaction_occurred`（boolean | null）和 `conversation_recorded`（boolean）
    - _需求: 3.1, 3.2, 3.3, 3.7_

  - [x] 8.3 更新 sf-orchestrator.md — Context_Exhaustion 处理协议
    - 修改 `.opencode/agents/sf-orchestrator.md`
    - 新增"Context_Exhaustion 处理协议"章节：
      - 识别上下文耗尽：检查错误信息是否包含 "context length exceeded"、"context window"、"token limit"、"maximum context" 等关键词
      - 处理流程：不在同一 Session 中重试；保存完整会话记录到 conversation.jsonl；向用户报告上下文耗尽事实；在 result.json 中标记 error_type="context_exhaustion"
    - 新增"压缩事件报告"章节：
      - 检测到子 Agent 执行期间发生过压缩事件时，向用户报告该事实（包含 Session ID 和压缩时间）
    - _需求: 3.4, 3.5, 3.6_

- [x] 9. 最终检查点 — 确保所有变更完整且测试通过
  - 运行 `vitest run` 确保所有测试通过
  - 确认 381 个现有测试 + 所有新增测试全部通过
  - 确认所有新增文件已创建：
    - `.opencode/tools/lib/sf_conversation_recorder_core.ts`
    - `tests/unit/tools/lib/sf_conversation_recorder_core.test.ts`
  - 确认所有修改文件已更新：
    - `scripts/install.ps1`（新增全局配置合并逻辑）
    - `.opencode/plugins/sf_checkpoint.ts`（新增钩子/事件处理 + 导出函数）
    - `tests/unit/plugins/sf_checkpoint.test.ts`（新增测试用例 + 属性测试）
    - `.opencode/agents/sf-orchestrator.md`（新增会话记录 + 压缩感知 + Context_Exhaustion 协议）
  - 确认 sf_checkpoint 增强不干扰现有 Plugin（sf_event_logger、sf_cost_tracker、sf_permission_guard）
  - 确认 opencode.json 项目级配置未做任何修改
  - 如有疑问请向用户确认。

## 备注

- 标记 `*` 的子任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点确保增量验证，及时发现问题
- 属性测试验证设计文档中定义的 6 个正确性属性（Property 1-6）
- 单元测试验证具体场景和边界条件
- Phase 5 的 Agent Prompt 更新不涉及代码逻辑变更，仅修改 Markdown 指令文件
- Plugin 必须自包含（sf_checkpoint 内联 convertMessagesToJsonl，不从 sf_conversation_recorder_core 导入）
- sf_conversation_recorder_core 中的类型定义与 sf_checkpoint 中的内联类型保持一致，但各自独立声明
- install.ps1 的变更为纯 PowerShell 脚本变更，不涉及 TypeScript 代码
