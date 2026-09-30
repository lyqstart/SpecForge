# 需求文档

## 简介

SpecForge V3.0（成本追踪版）为系统增加 Token 消耗和成本追踪能力。V2.0 已完成效率优化（sf-verifier 工具调用从 16 降至 4-5，bash 调用从 12 降至 0），经过 12 轮测试验证，系统拥有 11 个 Custom Tool、3 个 Plugin、337 个单元测试。

然而，当前系统缺乏对 AI 模型调用成本的量化追踪能力。每次工作流执行消耗了多少 Token、花费了多少成本、哪个 Agent 消耗最多、哪个工作流阶段最昂贵——这些问题无法回答。没有成本数据，效率优化的效果无法量化，也无法识别成本热点进行针对性优化。

**关键技术发现**：OpenCode 平台原生提供真实的 Token 使用量和成本数据：
- **Assistant 消息**包含：`cost`（数字）、`tokens: { total, input, output, reasoning, cache: { read, write } }`
- **StepFinishPart**（part type 为 "step-finish"）包含相同的 `cost` 和 `tokens` 结构
- Plugin 的 `event` 钩子接收 `message.updated` 和 `message.part.updated` 事件，携带完整的 Message/Part 数据
- Plugin 的 `chat.message` 钩子提供 sessionID、agent、model 信息

因此，我们可以捕获 OpenCode 提供的**真实** Token 使用数据，而非估算值。

V3.0 目标：实现成本数据的自动采集、持久化存储、多维度聚合分析和用户可见的成本报告，为后续版本的智能复盘和成本优化提供数据基础。

所有变更必须保持与 V2.0 工作流的向后兼容，337 个现有单元测试必须继续通过。

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 Agent、子 Agent、Skill、Tool、Plugin、权限等扩展机制
- **Orchestrator**：主 Agent（sf-orchestrator），负责项目管理、工作流推进、用户沟通和子 Agent 调度
- **Sub_Agent**：由 Orchestrator 调度的专业执行子 Agent，不能直接与用户交互
- **Custom_Tool**：`.opencode/tools/` 目录下的 TypeScript 工具文件，使用 Zod schema 进行输入验证，`execute()` 必须返回 `JSON.stringify` 字符串
- **Plugin**：OpenCode 事件钩子扩展，可以监听和拦截系统事件，必须自包含（不引用外部模块，只用 `node:` 内置模块）
- **Token**：AI 模型处理文本的基本单位，分为 input（输入）、output（输出）、reasoning（推理）三类
- **Cache_Token**：OpenCode 缓存机制产生的 Token，分为 cache_read（缓存读取）和 cache_write（缓存写入）
- **Cost**：单次模型调用的货币成本，由 OpenCode 平台计算并通过消息事件提供，单位为美元
- **StepFinishPart**：OpenCode 消息系统中 type 为 "step-finish" 的 Part，包含单步执行的 cost 和 tokens 数据
- **Assistant_Message**：OpenCode 消息系统中 role 为 "assistant" 的消息，包含消息级别的聚合 cost 和 tokens 数据
- **Cost_Entry**：成本追踪的最小记录单元，包含时间戳、会话 ID、Agent 名称、模型、Work Item ID、Token 明细和成本
- **Cost_JSONL**：成本数据的持久化存储文件（`specforge/logs/cost.jsonl`），每行一条 Cost_Entry 的 JSON 记录
- **Work_Item**：SpecForge 中的独立工作单元，具有唯一 ID（如 WI-001）
- **工作流阶段**：Work_Item 在工作流中经历的各个阶段（如 requirements、design、tasks、development、review、verification）
- **Agent_Run_Result**：子 Agent 执行完成后归档到 `specforge/archive/agent_runs/<run_id>/result.json` 的结构化结果
- **JSONL**：JSON Lines 格式，每行一个独立 JSON 对象
- **Session**：OpenCode 中的一次会话，每个子 Agent 调度对应一个独立 Session
- **Events_JSONL**：`specforge/runtime/events.jsonl` 中的结构化事件日志

## 需求

### 需求 1：sf_cost_tracker Plugin（成本数据采集）

**用户故事：** 作为开发者，我希望系统自动从 OpenCode 消息事件中捕获真实的 Token 使用量和成本数据，并持久化到日志文件，以便后续进行成本分析和优化效果量化。

#### 验收标准

1. SpecForge 应在 `.opencode/plugins/sf_cost_tracker.ts` 实现 sf_cost_tracker Plugin，遵循 OpenCode Plugin 规范
2. sf_cost_tracker Plugin 应为自包含模块，不引用外部模块，仅使用 `node:` 内置模块（`node:fs/promises`、`node:path`）
3. 当 sf_cost_tracker 接收到 `message.part.updated` 事件且 Part 的 type 为 "step-finish" 时，sf_cost_tracker 应从该 StepFinishPart 中提取 `cost` 和 `tokens`（input、output、reasoning、cache.read、cache.write）数据
4. 当 sf_cost_tracker 接收到 `message.updated` 事件且消息 role 为 "assistant" 时，sf_cost_tracker 应从该 Assistant_Message 中提取消息级别的聚合 `cost` 和 `tokens` 数据
5. sf_cost_tracker 应将每条提取的成本数据作为 Cost_Entry 追加写入 `specforge/logs/cost.jsonl`，每条记录为独立的 JSON 行
6. 每条 Cost_Entry 应包含以下字段：`timestamp`（ISO8601 格式）、`source`（"step-finish" 或 "message"，标识数据来源）、`session_id`（会话 ID）、`agent`（Agent 名称，如可获取）、`model`（模型名称，如可获取）、`work_item_id`（关联的 Work Item ID，如可获取）、`tokens`（对象：`{ input, output, reasoning, cache_read, cache_write }`）、`cost`（数字，美元）
7. 当 Token 或 Cost 字段在事件数据中不存在或为 null 时，sf_cost_tracker 应将对应字段记录为 0，不跳过该条记录
8. 当写入 Cost_JSONL 失败时（如磁盘满、权限不足），sf_cost_tracker 应静默失败，不抛出异常，不阻断 OpenCode 消息处理流程
9. sf_cost_tracker 应在 Plugin 初始化时确保 `specforge/logs/` 目录存在（如不存在则递归创建）
10. sf_cost_tracker 应仅处理包含 cost 或 tokens 数据的事件，忽略不包含成本信息的 `message.updated` 和 `message.part.updated` 事件，避免写入无效记录

### 需求 2：sf_cost_report Custom Tool（成本报告聚合）

**用户故事：** 作为用户，我希望有一个工具能读取成本日志并按多个维度聚合分析，以便了解每个 Work Item、每个 Agent、每个工作流阶段的成本分布，识别成本热点。

#### 验收标准

1. SpecForge 应在 `.opencode/tools/sf_cost_report.ts` 实现 sf_cost_report Custom Tool，对应核心逻辑模块在 `.opencode/tools/lib/sf_cost_report_core.ts`
2. 当调用 sf_cost_report 时，应接受以下参数：可选的 `work_item_id`（字符串，按 Work Item 过滤）、可选的 `group_by`（枚举：work_item、agent、phase、model，默认为 work_item）
3. sf_cost_report 应读取 `specforge/logs/cost.jsonl` 文件，解析所有 Cost_Entry 记录
4. 当 `group_by` 为 "work_item" 时，sf_cost_report 应按 work_item_id 聚合，返回每个 Work Item 的总 Token 数（input、output、reasoning、cache_read、cache_write 分别汇总）和总成本
5. 当 `group_by` 为 "agent" 时，sf_cost_report 应按 agent 名称聚合，返回每个 Agent 的总 Token 数和总成本
6. 当 `group_by` 为 "phase" 时，sf_cost_report 应按工作流阶段聚合，返回每个阶段的总 Token 数和总成本；阶段信息应从 `specforge/runtime/events.jsonl` 中的状态流转记录推断（根据 Cost_Entry 的时间戳匹配最近的状态流转事件）
7. 当 `group_by` 为 "model" 时，sf_cost_report 应按模型名称聚合，返回每个模型的总 Token 数和总成本
8. 当指定 `work_item_id` 参数时，sf_cost_report 应仅聚合该 Work Item 相关的 Cost_Entry 记录
9. sf_cost_report 应返回结构化 JSON 结果：`{ success: true, summary: { total_cost, total_tokens: { input, output, reasoning, cache_read, cache_write } }, groups: [{ key, cost, tokens: { input, output, reasoning, cache_read, cache_write }, entry_count }] }`
10. 当 Cost_JSONL 文件不存在或为空时，sf_cost_report 应返回 `{ success: true, summary: { total_cost: 0, total_tokens: { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 } }, groups: [] }`
11. 当 Cost_JSONL 中存在格式错误的 JSON 行时，sf_cost_report 应跳过该行并继续处理剩余记录，不中断聚合过程
12. sf_cost_report 的 `execute()` 函数应返回 `JSON.stringify` 字符串，符合 Custom_Tool 规范

### 需求 3：/sf-cost 命令（用户交互入口）

**用户故事：** 作为用户，我希望通过简单的命令查看成本摘要，以便快速了解当前项目的 Token 消耗和成本情况，无需手动解析日志文件。

#### 验收标准

1. 当用户输入 `/sf-cost` 命令时，Orchestrator 应调用 sf_cost_report 工具并以格式化的方式向用户展示成本摘要
2. 当用户输入 `/sf-cost <work_item_id>` 命令时，Orchestrator 应调用 sf_cost_report 工具并传入 `work_item_id` 参数，展示该 Work Item 的成本明细
3. Orchestrator 展示的成本摘要应包含以下信息：总成本（美元）、总 Token 数（按类型分列）、按 Work Item 分组的成本排行
4. 当用户输入 `/sf-cost --by agent` 命令时，Orchestrator 应调用 sf_cost_report 工具并传入 `group_by: "agent"` 参数，展示按 Agent 分组的成本分布
5. 当用户输入 `/sf-cost --by phase` 命令时，Orchestrator 应调用 sf_cost_report 工具并传入 `group_by: "phase"` 参数，展示按工作流阶段分组的成本分布
6. 当无成本数据时，Orchestrator 应向用户展示"暂无成本数据"的提示信息，而非空表格或错误

### 需求 4：Agent Run Archive 成本数据集成

**用户故事：** 作为开发者，我希望每次子 Agent 执行的归档记录中包含该次执行的成本数据，以便在复盘时精确了解每次 Agent 调度的成本开销。

#### 验收标准

1. 当 Orchestrator 通过 sf_artifact_write 创建 agent_run_result 时，result.json 应包含 `cost_summary` 字段，记录该次 Agent 执行的成本数据
2. `cost_summary` 字段应包含以下子字段：`total_cost`（数字，美元）、`total_tokens`（对象：`{ input, output, reasoning, cache_read, cache_write }`）、`entry_count`（该次执行产生的 Cost_Entry 条数）
3. Orchestrator 应在子 Agent 完成后、创建归档记录前，从 Cost_JSONL 中提取该次执行对应的成本数据（通过 session_id 或时间范围匹配）
4. 当无法从 Cost_JSONL 中提取成本数据时（如 Plugin 未启用或日志文件不存在），Orchestrator 应在 result.json 中将 `cost_summary` 设为 `null`，不阻断归档流程
5. sf_cost_report 工具应支持可选的 `session_id` 参数，当指定时仅聚合该 Session 的 Cost_Entry 记录，便于 Orchestrator 提取单次 Agent 执行的成本

### 需求 5：成本数据与工作流阶段关联

**用户故事：** 作为开发者，我希望成本数据能与工作流阶段自动关联，以便分析每个阶段（需求、设计、任务、开发、审查、验证）的成本占比，识别最昂贵的阶段进行优化。

#### 验收标准

1. sf_cost_tracker Plugin 应尝试从当前运行上下文中获取 work_item_id 信息；当无法直接获取时，应将 work_item_id 记录为 "unknown"
2. sf_cost_report 在按 "phase" 聚合时，应读取 `specforge/runtime/events.jsonl` 中的状态流转记录（type 为 "state_transition" 的条目），构建每个 Work Item 的阶段时间线
3. sf_cost_report 应根据 Cost_Entry 的 timestamp 与阶段时间线进行匹配：对于每条 Cost_Entry，找到其 timestamp 所在的工作流阶段（即最近一次状态流转的目标状态）
4. 当 Cost_Entry 的 timestamp 早于该 Work Item 的首次状态流转时，sf_cost_report 应将该条目归入 "intake" 阶段
5. 当 Cost_Entry 无法匹配到任何 Work Item 的阶段时间线时（如 work_item_id 为 "unknown"），sf_cost_report 应将该条目归入 "unattributed"（未归属）分组

### 需求 6：向后兼容与测试完整性

**用户故事：** 作为开发者，我希望所有 V3.0 变更保持与 V2.0 工作流的向后兼容并通过所有 337 个现有单元测试，确保成本追踪功能的引入不破坏任何现有功能。

#### 验收标准

1. SpecForge 应确保 `tests/unit/` 中的所有 337 个现有单元测试在 V3.0 变更应用后继续通过
2. sf_cost_tracker Plugin 不应修改或干扰现有的 sf_event_logger Plugin 和 sf_checkpoint Plugin 的事件处理逻辑；三个 Plugin 应独立运行
3. sf_cost_tracker Plugin 不应修改或干扰现有的 sf_permission_guard Plugin 的权限拦截逻辑
4. sf_cost_report Custom Tool 不应修改 Cost_JSONL 文件或 Events_JSONL 文件；所有聚合操作应为只读
5. 当 sf_cost_tracker Plugin 未启用或 Cost_JSONL 文件不存在时，sf_cost_report 应返回空结果而非报错，所有依赖成本数据的功能应优雅降级
6. sf_artifact_write 工具的现有功能（verification_report、work_log、review_report、intake、agent_run_result）不应受 V3.0 变更影响
7. 所有新增的 Custom Tool 和 Plugin 应有对应的单元测试，测试覆盖核心逻辑和边界条件

### 需求 7：成本数据完整性

**用户故事：** 作为开发者，我希望成本数据的采集和存储具有高完整性，确保不丢失数据、不重复记录、不产生格式错误的记录，以便成本分析结果可信。

#### 验收标准

1. sf_cost_tracker 应为每条 Cost_Entry 生成唯一的标识信息（timestamp + source + session_id 组合），便于去重和审计
2. sf_cost_tracker 应区分 "step-finish" 级别和 "message" 级别的成本数据，通过 `source` 字段标识，避免在聚合时重复计算
3. sf_cost_report 在聚合时应默认仅使用 `source` 为 "step-finish" 的记录进行汇总（粒度更细），当无 "step-finish" 记录时回退到 "message" 级别记录
4. 对于所有写入 Cost_JSONL 的 Cost_Entry，每条记录应为合法的 JSON 对象且包含所有必需字段（timestamp、source、tokens、cost），确保 sf_cost_report 能正确解析
5. sf_cost_report 对同一份 Cost_JSONL 文件执行两次相同参数的聚合查询，应返回相同的结果（幂等性）
6. 对于所有有效的 Cost_Entry 记录，写入 Cost_JSONL 后再由 sf_cost_report 读取并聚合，总成本应等于所有记录的 cost 字段之和（往返一致性）
