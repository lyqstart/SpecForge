# 需求文档

## 简介

SpecForge V3.1（上下文压缩感知与会话记录版）基于对 OpenCode 平台原生能力的深入调查，为系统增加压缩配置优化、压缩上下文注入、压缩事件感知、完整会话记录四项核心能力。V3.0 已完成成本追踪（sf_cost_tracker Plugin + sf_cost_report Tool），经过 13 轮测试验证，系统拥有 12 个 Custom Tool、4 个 Plugin、7 个 Skill、8 个 Agent、381 个单元测试。

### 平台能力调查结论

经过 13 轮测试的系统性调查，我们明确了 OpenCode 平台的原生能力边界：

**✅ OpenCode 已原生提供（不重复实现）：**

1. **自动压缩（Auto-Compaction）**：OpenCode 在 Token 使用量接近模型上下文窗口限制时自动压缩 Session，可通过 `opencode.json` 的 `compaction` 字段配置（`auto`、`prune`、`reserved`）
2. **模型上下文限制配置**：可通过 `opencode.json` 的 `models` 字段为每个模型配置 `context` 和 `output` 限制
3. **`session.compacted` 事件**：压缩完成后触发，Plugin 可监听
4. **`experimental.session.compacting` 钩子**：压缩发生前触发，Plugin 可通过 `output.context.push()` 注入额外上下文到压缩提示词，或通过 `output.prompt` 替换整个压缩提示词
5. **Token 数据随事件传递**：`message.updated` 和 `message.part.updated` 事件携带 `tokens` 数据，sf_cost_tracker 已在捕获
6. **sf_checkpoint 已存在**：监听 `session.compacting`，保存 state.json 快照并生成恢复摘要（recovery.md）
7. **OpenCode SDK `client.session.messages()` API**：可检索任意 Session 的完整会话历史
8. **OpenCode 消息文件存储**：所有消息以 JSON 文件存储在 `~/.opencode/storage/message/{sessionID}/{messageID}.json`，Part 存储在 `~/.opencode/storage/part/{messageID}/{partID}.json`

**❌ OpenCode 不提供（V3.1 实现范围）：**

1. **SpecForge 业务上下文注入压缩提示词**：默认压缩提示词不了解 SpecForge 的 work_item_id、工作流阶段、spec 文件等业务概念
2. **压缩事件记录到 SpecForge 事件系统**：压缩事件未记录到 `specforge/runtime/events.jsonl`
3. **子 Agent Session 完整会话记录**：无机制将子 Agent 的完整对话（含 tool_call 详情、token 消耗）保存为可分析的结构化格式
4. **压缩前会话快照**：压缩后原始会话历史丢失，无法事后分析压缩前的完整对话
5. **当前项目未配置压缩参数**：`opencode.json` 中缺少 `compaction` 和 `models` 配置
6. **Orchestrator 对子 Agent 压缩/耗尽的感知**：子 Agent Session 被压缩或因上下文耗尽失败时，Orchestrator 无从得知

**关键事实：**
- GLM-5.1 标称 200K 上下文，社区反馈超过 100K 后输出质量下降（出现乱码），实际可用约 100K
- GLM-5.1 默认 max_tokens=65536，最大支持 131072
- 13 轮测试中未观察到任何压缩事件触发——当前测试场景的 Token 消耗量不足以触发压缩
- sf_checkpoint 虽已存在但从未实际触发过

### V3.1 设计原则

1. **不重复造轮子**：利用 OpenCode 原生的自动压缩机制，不自行实现 Token 监控和主动压缩触发
2. **增强而非替代**：增强现有 sf_checkpoint Plugin，而非新建 Plugin
3. **配置优先**：能通过配置解决的问题不写代码
4. **最小变更**：仅实现 OpenCode 确实不提供的能力
5. **会话可追溯**：完整记录子 Agent 会话，为 prompt 优化、工具调用分析、成本分析、任务完成度评估、失败根因分析提供数据基础

所有变更必须保持与 V3.0 的向后兼容，381 个现有单元测试必须继续通过。

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 Agent、子 Agent、Skill、Tool、Plugin、权限等扩展机制
- **Orchestrator**：主 Agent（sf-orchestrator），负责项目管理、工作流推进、用户沟通和子 Agent 调度
- **Sub_Agent**：由 Orchestrator 调度的专业执行子 Agent，运行在独立 Session 中，不能直接与用户交互
- **Custom_Tool**：`.opencode/tools/` 目录下的 TypeScript 工具文件，使用 Zod schema 进行输入验证，`execute()` 必须返回 `JSON.stringify` 字符串
- **Plugin**：OpenCode 事件钩子扩展，可以监听和拦截系统事件，必须自包含（不引用外部模块，只用 `node:` 内置模块）
- **Token**：AI 模型处理文本的基本单位，分为 input（输入）、output（输出）、reasoning（推理）三类
- **Session**：OpenCode 中的一次会话，每个子 Agent 调度对应一个独立 Session，拥有独立的上下文窗口
- **Auto_Compaction**：OpenCode 原生的自动压缩机制，当 Token 使用量接近模型上下文窗口限制时自动触发 Session 压缩
- **Session_Compacting**：OpenCode 的 `experimental.session.compacting` 钩子事件，在压缩发生前触发，Plugin 可通过 `output.context.push()` 注入额外上下文到压缩提示词
- **Session_Compacted**：OpenCode 的 `session.compacted` 事件，在压缩完成后触发
- **Compaction_Context**：注入到压缩提示词中的 SpecForge 业务上下文信息，确保压缩后的摘要保留关键业务状态
- **Recovery_Summary**：sf_checkpoint 生成的恢复上下文摘要文件（`*.recovery.md`），包含活跃 Work Item、最近状态流转等信息
- **Conversation_JSONL**：子 Agent 完整会话记录文件（`conversation.jsonl`），JSONL 格式，每行一条消息或工具调用记录，按时间顺序排列
- **Conversation_Snapshot**：压缩前保存的完整会话快照文件（`conversation_snapshot_{timestamp}.jsonl`），格式与 Conversation_JSONL 一致
- **sf_conversation_recorder_core**：会话记录核心模块（`.opencode/tools/lib/sf_conversation_recorder_core.ts`），负责将 OpenCode SDK 的 `session.messages()` 响应转换为 Conversation_JSONL 格式
- **Context_Exhaustion**：上下文耗尽，指子 Agent Session 因 Token 使用量超过模型上下文窗口限制而产生 `session.error` 错误
- **Cost_Entry**：成本追踪的最小记录单元（V3.0 定义），包含 session_id、tokens 等字段
- **Events_JSONL**：`specforge/runtime/events.jsonl` 中的结构化事件日志
- **Agent_Run_Archive**：子 Agent 执行完成后的归档目录（`specforge/archive/agent_runs/<run_id>/`），包含 result.json、work_log.md 等文件
- **Agent_Run_Result**：Agent_Run_Archive 中的 `result.json` 结构化结果文件
- **OpenCode_Global_Config**：OpenCode 全局配置文件，路径为 `~/.config/opencode/opencode.json`

## 需求

### 需求 1：OpenCode 压缩配置优化

**用户故事：** 作为开发者，我希望项目的 OpenCode 配置包含合理的压缩和模型上下文参数，以便 OpenCode 的自动压缩机制能按预期工作，为后续的压缩感知功能提供基础。

**变更类型：** 配置变更（无代码变更）

#### 验收标准

1. WHEN SpecForge 项目通过 `scripts/install.ps1` 安装完成后，THE OpenCode_Global_Config SHALL 包含 `compaction` 字段，设置 `auto: true`（启用自动压缩）、`prune: true`（启用消息修剪）、`reserved: 20000`（压缩后为新消息保留 20000 Token 空间）
2. WHEN SpecForge 项目通过 `scripts/install.ps1` 安装完成后，THE OpenCode_Global_Config SHALL 在 `models` 字段中为 `zai-coding-plan/glm-5.1` 配置 `context: 90000`（低于 100K 安全线，避免 GLM-5.1 超过 100K 后输出质量下降）
3. THE OpenCode_Global_Config 中的 `models` 配置 SHALL 不设置 `output` 限制，使用 GLM-5.1 默认的 max_tokens=65536
4. THE `scripts/install.ps1` 安装脚本 SHALL 在写入 OpenCode_Global_Config 时保留所有现有配置内容，仅新增或更新 `compaction` 和 `models` 顶层字段
5. THE 项目本地的 `opencode.json` SHALL 保留所有现有的 `agent` 配置不变，不在项目级配置中重复 `compaction` 和 `models` 设置（这些属于全局配置）
6. WHEN OpenCode 加载更新后的配置时，THE Auto_Compaction 机制 SHALL 按配置参数生效，在 Token 使用量接近 90000 上下文窗口限制时自动触发 Session 压缩

### 需求 2：sf_checkpoint 压缩上下文增强

**用户故事：** 作为开发者，我希望当 OpenCode 自动压缩 Session 时，压缩后的摘要能保留 SpecForge 的关键业务上下文，并且压缩前的完整会话被保存为快照，以便压缩后的 Agent 仍能理解自己在做什么，同时保留完整的压缩前对话供事后分析。

**变更类型：** 代码变更（增强现有 sf_checkpoint Plugin）

#### 验收标准

1. WHEN sf_checkpoint 接收到 `experimental.session.compacting` 钩子事件时，THE sf_checkpoint Plugin SHALL 读取 `specforge/runtime/state.json` 获取当前活跃 Work Item 的业务状态
2. WHEN sf_checkpoint 成功读取业务状态后，THE sf_checkpoint Plugin SHALL 通过 `output.context.push()` 将以下 Compaction_Context 注入压缩提示词：当前活跃的 work_item_id 列表、每个活跃 Work Item 的 workflow_type 和 current_state、对应的 spec 文件路径（`specforge/specs/<work_item_id>/`）、最近 3 条状态流转记录（从 Events_JSONL 提取）
3. THE sf_checkpoint Plugin SHALL 将注入的 Compaction_Context 格式化为结构化文本，总长度不超过 2000 字符（约 700 Token），避免注入过多上下文反而降低压缩质量
4. WHEN sf_checkpoint 处理 `experimental.session.compacting` 钩子时，THE sf_checkpoint Plugin SHALL 调用 `client.session.messages()` 获取当前 Session 的完整会话历史，并保存为 Conversation_Snapshot 文件
5. WHEN run_id 可从当前上下文获取时，THE Conversation_Snapshot SHALL 保存到 `specforge/archive/agent_runs/<run_id>/conversation_snapshot_{timestamp}.jsonl`
6. WHEN run_id 无法从当前上下文获取时，THE Conversation_Snapshot SHALL 保存到 `specforge/runtime/checkpoints/conversation_{sessionID}_{timestamp}.jsonl`
7. WHILE sf_checkpoint 处理 `experimental.session.compacting` 钩子时，THE sf_checkpoint Plugin SHALL 继续执行现有的 `session.compacting` 事件处理逻辑（保存 state.json 快照、生成 Recovery_Summary），新增逻辑与现有逻辑互不干扰
8. WHEN sf_checkpoint 接收到 `session.compacted` 事件时，THE sf_checkpoint Plugin SHALL 生成一条压缩事件记录并追加写入 Events_JSONL，event_type 为 "context.compacted"
9. THE 压缩事件记录 SHALL 包含以下字段：`timestamp`（ISO8601 格式）、`event_type`（值为 "context.compacted"）、`session_id`（从事件数据中提取）、`payload`（包含压缩时的活跃 work_item_id 列表和各自的 current_state）
10. IF 读取 state.json、Events_JSONL、调用 session.messages() 或写入文件失败时，THEN THE sf_checkpoint Plugin SHALL 静默跳过对应操作，不阻断 OpenCode 的压缩流程，不抛出异常
11. THE sf_checkpoint Plugin SHALL 保持自包含特性，不引用外部模块，仅使用 `node:` 内置模块（`node:fs/promises`、`node:path`）
12. WHEN sf_checkpoint 成功注入 Compaction_Context 后，THE sf_checkpoint Plugin SHALL 在 `specforge/logs/app.log` 中记录一条 INFO 级别日志，包含注入的上下文摘要长度和涉及的 work_item_id 列表

### 需求 3：压缩事件记录与 Orchestrator 感知

**用户故事：** 作为用户，我希望当子 Agent 的 Session 被压缩或因上下文耗尽而失败时，Orchestrator 能感知到这些事件并合理应对，以便我了解执行过程中的上下文健康状况。

**变更类型：** 代码变更 + Orchestrator 协议更新

#### 验收标准

1. WHEN Orchestrator 调度的子 Agent 完成执行后，THE Orchestrator SHALL 检查 Events_JSONL 中是否存在该子 Agent 执行期间（start_time 到 end_time 之间）的 "context.compacted" 事件
2. WHEN Orchestrator 检测到子 Agent 执行期间发生过压缩事件时，THE Orchestrator SHALL 向用户报告该事实，包含 Session ID 和压缩发生的时间
3. WHEN Orchestrator 创建 Agent_Run_Result 归档时，THE result.json SHALL 包含 `compaction_occurred` 布尔字段，标识该次执行期间是否发生过 Session 压缩
4. WHEN 子 Agent 因 Context_Exhaustion 失败（session.error）时，THE Orchestrator SHALL 识别该错误为上下文耗尽（而非普通执行错误），不在同一 Session 中重试（重试无意义）
5. WHEN 子 Agent 因 Context_Exhaustion 失败时，THE Orchestrator SHALL 调用 `client.session.messages()` 保存该 Session 的完整会话记录到 Agent_Run_Archive
6. WHEN 子 Agent 因 Context_Exhaustion 失败时，THE Orchestrator SHALL 向用户报告上下文耗尽事实及当前上下文状态
7. IF Orchestrator 无法读取 Events_JSONL 或解析压缩事件时，THEN THE Orchestrator SHALL 将 `compaction_occurred` 设为 `null`，不阻断归档流程

### 需求 4：会话完整记录与分析

**用户故事：** 作为开发者，我希望每次子 Agent 执行的完整会话（包括所有消息、工具调用、Token 消耗）被结构化记录，以便进行 prompt 优化分析、工具调用效率分析、Token 消耗分析、任务完成度评估和失败根因分析。

**变更类型：** 代码变更（增强 Orchestrator Archive 流程 + 新增 sf_conversation_recorder_core 核心模块 + 增强 sf_checkpoint Plugin）

#### 验收标准

##### 会话记录时机

1. WHEN sf_checkpoint 处理 `experimental.session.compacting` 钩子时，THE sf_checkpoint Plugin SHALL 保存当前 Session 的完整压缩前会话为 Conversation_Snapshot（与需求 2 第 4-6 条一致）
2. WHEN 子 Agent 正常完成执行后，THE Orchestrator SHALL 调用 `client.session.messages()` 获取完整会话历史，并通过 sf_conversation_recorder_core 转换为 Conversation_JSONL 格式，保存到 Agent_Run_Archive 的 `conversation.jsonl`
3. WHEN 子 Agent 异常终止（包括 Context_Exhaustion 和其他错误）后，THE Orchestrator SHALL 调用 `client.session.messages()` 获取完整会话历史（消息仍存在于 OpenCode 文件存储中，即使 API 报错），并保存到 Agent_Run_Archive 的 `conversation.jsonl`

##### conversation.jsonl 格式规范

4. THE Conversation_JSONL 文件 SHALL 采用 JSONL 格式（每行一条独立 JSON 记录），按时间顺序排列
5. FOR ALL 文本消息记录，THE Conversation_JSONL SHALL 包含以下字段：`seq`（从 1 开始的序号）、`role`（"user" 或 "assistant"）、`timestamp`（ISO8601 格式）、`content`（文本内容）
6. FOR ALL assistant 文本消息记录，THE Conversation_JSONL SHALL 额外包含：`tokens`（对象：`{ input, output, reasoning, cache_read, cache_write }`，字段不存在时为 null）、`cost`（数字，美元，不存在时为 null）
7. FOR ALL 工具调用记录，THE Conversation_JSONL SHALL 包含以下字段：`seq`（序号）、`role`（"assistant"）、`timestamp`（ISO8601 格式）、`type`（值为 "tool_call"）、`tool`（工具名称）、`args`（工具参数对象）、`result_preview`（工具结果截断预览，最大 500 字符）、`status`（"completed" 或 "error"）、`duration_ms`（工具执行耗时，毫秒）

##### 文件组织

8. THE Agent_Run_Archive 目录结构 SHALL 如下组织：
   - `specforge/archive/agent_runs/<run_id>/result.json`（现有）
   - `specforge/archive/agent_runs/<run_id>/work_log.md`（现有）
   - `specforge/archive/agent_runs/<run_id>/conversation.jsonl`（新增：完整会话记录）
   - `specforge/archive/agent_runs/<run_id>/conversation_snapshot_{timestamp}.jsonl`（新增：压缩前快照，仅在发生压缩时存在）

##### 核心模块

9. THE sf_conversation_recorder_core 模块 SHALL 实现在 `.opencode/tools/lib/sf_conversation_recorder_core.ts`，负责将 OpenCode SDK 的 `session.messages()` 响应转换为 Conversation_JSONL 格式的字符串
10. THE sf_conversation_recorder_core 模块 SHALL 可独立测试，不依赖 OpenCode 运行时环境，接受 messages 数组作为输入，返回 JSONL 格式字符串作为输出
11. THE sf_conversation_recorder_core 模块 SHALL 正确处理以下消息类型：纯文本消息（user/assistant）、工具调用消息（tool_call）、包含 tokens/cost 的 assistant 消息、混合类型消息（同一消息中包含文本和工具调用）

##### 错误处理

12. IF 调用 `client.session.messages()` 失败时，THEN THE Orchestrator SHALL 静默跳过会话记录保存，在 result.json 中标记 `conversation_recorded: false`，不阻断归档流程
13. IF sf_conversation_recorder_core 转换过程中遇到无法解析的消息格式时，THEN THE sf_conversation_recorder_core SHALL 跳过该条消息并在输出中插入一条 `{"seq": N, "type": "parse_error", "raw_type": "...", "error": "..."}` 占位记录

### 需求 5：向后兼容与测试完整性

**用户故事：** 作为开发者，我希望所有 V3.1 变更保持与 V3.0 的向后兼容并通过所有 381 个现有单元测试，确保新功能的引入不破坏任何现有功能。

**变更类型：** 代码变更 + 测试

#### 验收标准

1. THE SpecForge 系统 SHALL 确保 `tests/unit/` 中的所有 381 个现有单元测试在 V3.1 变更应用后继续通过
2. THE sf_checkpoint Plugin 的增强 SHALL 保持现有 `session.compacting` 事件处理逻辑不变；新增的 `experimental.session.compacting` 钩子处理和 `session.compacted` 事件处理为独立的附加逻辑
3. THE sf_checkpoint Plugin 的增强 SHALL 不修改或干扰现有的 sf_event_logger Plugin、sf_cost_tracker Plugin 和 sf_permission_guard Plugin 的事件处理逻辑
4. THE opencode.json 项目级配置 SHALL 不做任何修改；压缩和模型配置仅写入 OpenCode_Global_Config
5. WHEN sf_checkpoint Plugin 的增强功能未被触发时（如未发生压缩），THE SpecForge 系统 SHALL 与 V3.0 行为完全一致，所有现有功能正常运行
6. THE sf_artifact_write 工具、sf_cost_tracker Plugin、sf_cost_report Tool 的现有功能 SHALL 不受 V3.1 变更影响
7. FOR ALL sf_checkpoint Plugin 的新增逻辑（Compaction_Context 注入、Conversation_Snapshot 保存、压缩事件记录），对应的单元测试 SHALL 覆盖核心逻辑、边界条件（state.json 不存在、events.jsonl 为空、上下文超长截断、session.messages() 返回空数组）和错误处理路径（文件读写失败时的静默降级）
8. FOR ALL sf_conversation_recorder_core 模块的转换逻辑，对应的单元测试 SHALL 覆盖：空 Session（无消息）、仅包含工具调用的 Session、包含 Conversation_Snapshot 的 Session、混合消息类型的 Session、包含无法解析消息的 Session
9. THE `scripts/install.ps1` 的更新 SHALL 仅新增 `compaction` 和 `models` 配置写入逻辑，不修改现有的 Agent 配置安装逻辑
