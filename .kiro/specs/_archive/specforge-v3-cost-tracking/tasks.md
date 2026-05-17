# 实施计划：SpecForge V3.0（成本追踪版）

## 概述

本实施计划基于已实现并经过 12 轮测试验证的 V2.0 系统，按 3 个阶段增量推进 V3.0 的全部新增功能。所有代码使用 TypeScript 编写，测试使用 Vitest + fast-check。每个阶段在前一阶段基础上构建，确保无孤立代码。

**关键约束：**
- 本项目运行在 OpenCode + Bun 运行时
- Custom Tool 的 `execute()` 必须返回 `JSON.stringify` 后的字符串
- Plugin 必须自包含（不引用外部模块，仅使用 `node:` 内置模块）
- 使用现有 `utils.ts` 中的共享函数（如适用于 Tool 层）
- 现有 337 个单元测试必须在所有变更后继续通过
- 所有新增属性测试使用 fast-check，最少 100 次迭代，标签格式：`Feature: specforge-v3-cost-tracking, Property {N}: {text}`

## 任务

- [x] 1. Phase 1：核心聚合逻辑 — sf_cost_report_core.ts（需求 2、需求 5、需求 7）
  - [x] 1.1 实现 sf_cost_report_core.ts 核心模块
    - 创建 `.opencode/tools/lib/sf_cost_report_core.ts`
    - 定义所有类型接口：`GroupBy`、`CostReportInput`、`TokenSummary`、`CostGroup`、`CostReportResult`、`CostEntry`、`StateTransitionEvent`、`PhaseInterval`
    - 实现 `parseJsonl<T>(content: string): T[]` 函数：
      - 空内容返回空数组
      - 逐行解析 JSON，跳过格式错误的行，继续处理剩余行
    - 实现 `readJsonlFile<T>(filePath: string): Promise<T[]>` 函数：
      - 读取并解析 JSONL 文件
      - 文件不存在时返回空数组（catch 静默处理）
    - 实现 `applySourcePriority(entries: CostEntry[]): CostEntry[]` 函数：
      - 存在任何 source="step-finish" 记录时，过滤掉所有 source="message" 记录
      - 不存在 step-finish 记录时，返回所有记录（回退到 message 级别）
    - 实现 `buildPhaseTimeline(events: StateTransitionEvent[]): PhaseInterval[]` 函数：
      - 仅处理 event_type 为 "state.transitioned" 的事件
      - 按 work_item_id 分组，按时间排序
      - 每个流转生成一个 PhaseInterval（start=当前流转时间，end=下一次流转时间或远未来值）
    - 实现 `matchPhase(entry: CostEntry, timeline: PhaseInterval[]): string` 函数：
      - work_item_id 为 "unknown" 时返回 "unattributed"
      - 无匹配时间线时返回 "unattributed"
      - 时间戳早于首次流转时返回 "intake"
      - 否则返回时间戳所在区间的 phase
    - 实现 `generateCostReport(input: CostReportInput, baseDir: string): Promise<CostReportResult>` 主聚合函数：
      - 读取 cost.jsonl，应用 work_item_id/session_id 过滤
      - 应用 source 优先级策略
      - 空记录时返回空结果（success: true, total_cost: 0, groups: []）
      - phase 聚合时读取 events.jsonl 构建阶段时间线
      - 按 group_by 维度聚合（work_item、agent、phase、model）
      - 计算 summary（total_cost、total_tokens 各字段分别汇总）
      - groups 按 cost 降序排列
      - 返回结构化 JSON 结果
    - _需求: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 4.5, 5.2, 5.3, 5.4, 5.5, 7.3, 7.5, 7.6_

  - [x] 1.2 实现 sf_cost_report.ts 工具入口
    - 创建 `.opencode/tools/sf_cost_report.ts`
    - 使用 `@opencode-ai/plugin` 的 `tool()` 定义工具
    - 定义 Zod schema 参数：
      - `work_item_id`（可选字符串，按 Work Item 过滤）
      - `session_id`（可选字符串，按 Session 过滤）
      - `group_by`（枚举 ["work_item", "agent", "phase", "model"]，默认 "work_item"）
    - `execute()` 调用 `generateCostReport` 并返回 `JSON.stringify(result, null, 2)` 字符串
    - 通过 `context.directory || context.worktree || process.cwd()` 获取 baseDir
    - _需求: 2.1, 2.2, 2.12_

- [x] 2. Phase 1：成本采集 Plugin — sf_cost_tracker.ts（需求 1、需求 7）
  - [x] 2.1 实现 sf_cost_tracker.ts Plugin
    - 创建 `.opencode/plugins/sf_cost_tracker.ts`
    - 遵循 OpenCode Plugin 规范，自包含模块，不引用外部模块，仅使用 `node:fs/promises` 和 `node:path`
    - 定义内部类型 `CostEntry`（与 sf_cost_report_core.ts 中定义一致）
    - 实现内联工具函数：
      - `appendJsonlSafe(filePath, entry)`: 追加写入 JSONL，静默处理所有错误
      - `safeNumber(value)`: 安全提取数字值，null/undefined/NaN 返回 0
      - `safeString(value, fallback)`: 安全提取字符串值
    - 实现并导出 `extractTokens(tokensData)` 函数：
      - 从事件数据中提取 tokens 对象（input、output、reasoning、cache_read、cache_write）
      - 无效输入返回全零对象
      - cache_read 从 `tokensData.cache?.read` 提取，cache_write 从 `tokensData.cache?.write` 提取
    - 实现并导出 `buildCostEntry(source, cost, tokensData, sessionId, agent, model, workItemId)` 函数：
      - 构建完整的 CostEntry 对象
      - timestamp 使用 `new Date().toISOString()`
      - 所有数字字段通过 safeNumber 处理
    - 实现并导出 `hasCostData(data)` 函数：
      - 判断事件数据是否包含 cost 或 tokens 数据
      - 仅当 cost 和 tokens 都不存在或为 null 时返回 false
    - 实现 Plugin 主体：
      - 初始化时确保 `specforge/logs/` 目录存在（mkdir recursive，静默失败）
      - 监听 `message.part.updated` 事件：检查 part.type === "step-finish"，提取 cost/tokens，构建 CostEntry（source="step-finish"），追加写入 cost.jsonl
      - 监听 `message.updated` 事件：检查 message.role === "assistant"，提取消息级别 cost/tokens，构建 CostEntry（source="message"），追加写入 cost.jsonl
      - 不包含成本数据的事件直接 return，不写入记录
      - 所有异常静默处理，不阻断 OpenCode 消息处理流程
      - work_item_id 默认记录为 "unknown"（Plugin 无法直接获取 SpecForge 业务概念）
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 5.1, 7.1, 7.2, 7.4_

- [x] 3. 检查点 — 确保 Phase 1 核心组件正确
  - 运行 `vitest run` 确保所有 337 个现有测试继续通过
  - 确认新增文件已创建：
    - `.opencode/tools/lib/sf_cost_report_core.ts`
    - `.opencode/tools/sf_cost_report.ts`
    - `.opencode/plugins/sf_cost_tracker.ts`
  - 确认新增文件无 TypeScript 编译错误
  - 如有疑问请向用户确认。

- [x] 4. Phase 2：单元测试与属性测试（需求 6、需求 7）
  - [x] 4.1 编写 sf_cost_report_core 单元测试与属性测试
    - 创建 `tests/unit/tools/lib/sf_cost_report_core.test.ts`
    - **单元测试场景：**
      - `parseJsonl`：空内容返回空数组
      - `parseJsonl`：有效 JSON 行正确解析
      - `parseJsonl`：格式错误行被跳过，有效行正常处理
      - `readJsonlFile`：文件不存在返回空数组
      - `applySourcePriority`：存在 step-finish 时过滤 message 记录
      - `applySourcePriority`：无 step-finish 时保留所有 message 记录
      - `applySourcePriority`：空数组返回空数组
      - `buildPhaseTimeline`：正确构建阶段时间线
      - `buildPhaseTimeline`：忽略非 state.transitioned 事件
      - `matchPhase`：work_item_id 为 "unknown" 返回 "unattributed"
      - `matchPhase`：无匹配时间线返回 "unattributed"
      - `matchPhase`：时间戳早于首次流转返回 "intake"
      - `matchPhase`：正确匹配最近的状态流转阶段
      - `generateCostReport`：cost.jsonl 不存在返回空结果
      - `generateCostReport`：group_by=work_item 正确聚合
      - `generateCostReport`：group_by=agent 正确聚合
      - `generateCostReport`：group_by=phase 正确聚合（含 events.jsonl 时间线）
      - `generateCostReport`：group_by=model 正确聚合
      - `generateCostReport`：work_item_id 过滤仅返回匹配记录
      - `generateCostReport`：session_id 过滤仅返回匹配记录
      - `generateCostReport`：groups 按 cost 降序排列
    - _需求: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 2.11, 4.5, 5.2, 5.3, 5.4, 5.5, 7.3_

  - [x]* 4.2 编写属性测试 — Property 3: 聚合正确性
    - 在 `tests/unit/tools/lib/sf_cost_report_core.test.ts` 中新增属性测试
    - **Property 3: 聚合正确性——分组汇总与总计一致**
    - 使用 fast-check 生成随机 CostEntry 数组（1-50 条）和随机 group_by 维度（work_item、agent、model）
    - 验证：所有分组的 cost 之和等于 summary.total_cost
    - 验证：所有分组的各类 token 之和分别等于 summary.total_tokens 中的对应值
    - 验证：所有分组的 entry_count 之和等于参与聚合的记录总数
    - 标签：`Feature: specforge-v3-cost-tracking, Property 3: aggregation correctness`
    - **验证: 需求 2.4, 2.5, 2.7, 2.9**

  - [x]* 4.3 编写属性测试 — Property 4: 过滤正确性
    - **Property 4: 过滤正确性——work_item_id 和 session_id 过滤**
    - 使用 fast-check 生成随机 CostEntry 数组和随机过滤条件（work_item_id 或 session_id）
    - 验证：聚合结果仅包含匹配过滤条件的记录
    - 验证：不包含任何不匹配的记录
    - 标签：`Feature: specforge-v3-cost-tracking, Property 4: filter correctness`
    - **验证: 需求 2.8, 4.5**

  - [x]* 4.4 编写属性测试 — Property 5: 阶段匹配正确性
    - **Property 5: 阶段匹配正确性**
    - 使用 fast-check 生成随机阶段时间线（StateTransitionEvent 数组）和随机 CostEntry
    - 验证：work_item_id 为 "unknown" 时归入 "unattributed"
    - 验证：时间戳早于首次流转时归入 "intake"
    - 验证：否则归入时间戳所在的最近一次状态流转的目标状态
    - 标签：`Feature: specforge-v3-cost-tracking, Property 5: phase matching correctness`
    - **验证: 需求 2.6, 5.2, 5.3, 5.4, 5.5**

  - [x]* 4.5 编写属性测试 — Property 6: Source 优先级
    - **Property 6: Source 优先级——step-finish 优先于 message**
    - 使用 fast-check 生成混合 source 的 CostEntry 数组（同时包含 step-finish 和 message）
    - 验证：存在 step-finish 记录时，applySourcePriority 返回的结果仅包含 step-finish 记录
    - 验证：不存在 step-finish 记录时，返回所有 message 记录
    - 标签：`Feature: specforge-v3-cost-tracking, Property 6: source priority`
    - **验证: 需求 7.3**

  - [x]* 4.6 编写属性测试 — Property 7: 往返一致性
    - **Property 7: 成本数据往返一致性**
    - 使用 fast-check 生成随机 CostEntry 数组
    - 将记录序列化为 JSONL 字符串，再通过 parseJsonl 解析
    - 验证：解析后的记录与原始记录一致
    - 验证：对解析后的记录聚合，summary.total_cost 等于所有记录 cost 之和
    - 验证：各类 token 总数分别等于所有记录对应字段之和
    - 标签：`Feature: specforge-v3-cost-tracking, Property 7: round-trip consistency`
    - **验证: 需求 7.6, 2.3**

  - [x]* 4.7 编写属性测试 — Property 8: 幂等性
    - **Property 8: 聚合幂等性**
    - 使用 fast-check 生成随机 JSONL 内容和查询参数
    - 对同一份数据执行两次 parseJsonl + 聚合逻辑
    - 验证：两次结果完全相同（JSON.stringify 比较）
    - 标签：`Feature: specforge-v3-cost-tracking, Property 8: aggregation idempotence`
    - **验证: 需求 7.5**

  - [x]* 4.8 编写属性测试 — Property 9: 格式错误行容错
    - **Property 9: 格式错误行容错**
    - 使用 fast-check 生成混合有效 JSON 行和格式错误行（随机字符串、不完整 JSON）的 JSONL 内容
    - 验证：parseJsonl 正确解析所有有效行
    - 验证：跳过所有格式错误行
    - 验证：返回的有效记录数等于输入中有效 JSON 行的数量
    - 标签：`Feature: specforge-v3-cost-tracking, Property 9: malformed line tolerance`
    - **验证: 需求 2.11**

  - [x] 4.9 编写 sf_cost_tracker Plugin 单元测试
    - 创建 `tests/unit/plugins/sf_cost_tracker.test.ts`
    - **单元测试场景：**
      - `extractTokens`：正常 tokens 数据正确提取（input、output、reasoning、cache_read、cache_write）
      - `extractTokens`：null/undefined 输入返回全零对象
      - `extractTokens`：部分字段缺失时缺失字段为 0
      - `extractTokens`：cache 嵌套结构正确提取（cache.read → cache_read，cache.write → cache_write）
      - `buildCostEntry`：正确构建完整的 CostEntry 对象
      - `buildCostEntry`：cost 为 null 时记录为 0
      - `buildCostEntry`：source 字段正确标识（"step-finish" 或 "message"）
      - `hasCostData`：包含 cost 字段返回 true
      - `hasCostData`：包含 tokens 字段返回 true
      - `hasCostData`：cost 和 tokens 都不存在返回 false
      - `hasCostData`：null/undefined 输入返回 false
      - `hasCostData`：空对象返回 false
    - _需求: 1.3, 1.4, 1.6, 1.7, 1.10, 7.1, 7.2, 7.4_

  - [x]* 4.10 编写属性测试 — Property 1: Cost_Entry 提取完整性
    - 在 `tests/unit/plugins/sf_cost_tracker.test.ts` 中新增属性测试
    - **Property 1: Cost_Entry 提取完整性与默认值**
    - 使用 fast-check 生成随机 cost/tokens 数据（含 null、undefined、NaN、正常数字、负数）
    - 验证：buildCostEntry 返回的对象包含所有必需字段（timestamp、source、session_id、agent、model、work_item_id、tokens、cost）
    - 验证：source 字段为 "step-finish" 或 "message"
    - 验证：当原始 cost 为 null/undefined/NaN 时，cost 字段为 0
    - 验证：当原始 tokens 字段为 null/undefined 时，对应 token 字段为 0
    - 验证：所有 token 字段为有限数字（Number.isFinite）
    - 标签：`Feature: specforge-v3-cost-tracking, Property 1: cost entry extraction completeness`
    - **验证: 需求 1.3, 1.4, 1.6, 1.7, 7.2, 7.4**

  - [x]* 4.11 编写属性测试 — Property 2: 事件过滤
    - 在 `tests/unit/plugins/sf_cost_tracker.test.ts` 中新增属性测试
    - **Property 2: 事件过滤——仅处理含成本数据的事件**
    - 使用 fast-check 生成随机事件数据对象（有/无 cost 字段、有/无 tokens 字段）
    - 验证：hasCostData 对包含 cost 或 tokens 的数据返回 true
    - 验证：hasCostData 对不包含 cost 且不包含 tokens 的数据返回 false
    - 标签：`Feature: specforge-v3-cost-tracking, Property 2: event filtering`
    - **验证: 需求 1.10**

- [x] 5. 检查点 — 确保 Phase 2 测试全部通过
  - 运行 `vitest run` 确保所有测试通过（包括 337 个现有测试和所有新增测试）
  - 确认新增测试文件已创建：
    - `tests/unit/tools/lib/sf_cost_report_core.test.ts`
    - `tests/unit/plugins/sf_cost_tracker.test.ts`
  - 确认属性测试（Property 1-9）全部通过，每个属性至少 100 次迭代
  - 如有疑问请向用户确认。

- [x] 6. Phase 2：补充属性测试 — Property 10: 只读不变量（需求 6）
  - [x]* 6.1 编写属性测试 — Property 10: 只读不变量
    - 在 `tests/unit/tools/lib/sf_cost_report_core.test.ts` 中新增属性测试
    - **Property 10: 只读不变量**
    - 使用 fast-check 生成随机 CostEntry 数组，写入临时 cost.jsonl 文件
    - 记录文件内容的哈希值（或完整内容）
    - 执行 generateCostReport 聚合操作
    - 再次读取文件内容，验证与操作前完全相同
    - 同样验证 events.jsonl 文件内容未被修改
    - 标签：`Feature: specforge-v3-cost-tracking, Property 10: read-only invariant`
    - **验证: 需求 6.4**

- [x] 7. Phase 3：Agent Prompt 更新（需求 3、需求 4）
  - [x] 7.1 更新 sf-orchestrator.md — 新增 /sf-cost 命令
    - 修改 `.opencode/agents/sf-orchestrator.md`
    - 在"调试命令（Debug Commands）"章节中，`/sf-status` 命令之后新增 `/sf-cost` 命令
    - `/sf-cost` 命令定义：
      - 无参数时：调用 sf_cost_report（默认 group_by="work_item"），以结构化格式展示成本摘要（总成本、总 Token 数、按 Work Item 分组排行）
      - `/sf-cost <work_item_id>`：调用 sf_cost_report（work_item_id=指定值），展示该 Work Item 成本明细
      - `/sf-cost --by agent`：调用 sf_cost_report（group_by="agent"），展示按 Agent 分组的成本分布
      - `/sf-cost --by phase`：调用 sf_cost_report（group_by="phase"），展示按工作流阶段分组的成本分布
      - `/sf-cost --by model`：调用 sf_cost_report（group_by="model"），展示按模型分组的成本分布
      - 无数据时显示："暂无成本数据。成本追踪将在 sf_cost_tracker Plugin 启用后自动开始。"
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 7.2 更新 sf-orchestrator.md — Agent Run Archive 成本集成
    - 修改 `.opencode/agents/sf-orchestrator.md`
    - 在"Agent Run Archive 协议"章节的归档创建流程中新增成本数据步骤：
      - 子 Agent 完成后、创建 agent_run_result 前，调用 sf_cost_report（session_id=<agent_session_id>）获取该次执行的成本数据
      - 从返回结果中提取 summary 作为 cost_summary
      - 在 sf_artifact_write（file_type="agent_run_result"）的 content 中包含 cost_summary 字段
      - cost_summary 结构：`{ total_cost, total_tokens: { input, output, reasoning, cache_read, cache_write }, entry_count }`
      - 当 sf_cost_report 返回空结果时，cost_summary 设为 null，不阻断归档流程
    - _需求: 4.1, 4.2, 4.3, 4.4_

- [x] 8. 最终检查点 — 确保所有变更完整且测试通过
  - 运行 `vitest run` 确保所有测试通过
  - 确认 337 个现有测试 + 所有新增测试全部通过
  - 确认所有新增文件已创建：
    - `.opencode/plugins/sf_cost_tracker.ts`
    - `.opencode/tools/sf_cost_report.ts`
    - `.opencode/tools/lib/sf_cost_report_core.ts`
    - `tests/unit/plugins/sf_cost_tracker.test.ts`
    - `tests/unit/tools/lib/sf_cost_report_core.test.ts`
  - 确认所有修改文件已更新：
    - `.opencode/agents/sf-orchestrator.md`（新增 /sf-cost 命令 + Agent Run Archive 成本集成）
  - 确认 sf_cost_tracker 不干扰现有 Plugin（sf_event_logger、sf_checkpoint、sf_permission_guard）
  - 确认 sf_cost_report 为只读操作，不修改 cost.jsonl 或 events.jsonl
  - 如有疑问请向用户确认。

## 备注

- 标记 `*` 的子任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点确保增量验证，及时发现问题
- 属性测试验证设计文档中定义的 10 个正确性属性（Property 1-10）
- 单元测试验证具体场景和边界条件
- Phase 3 的 Agent Prompt 更新不涉及代码逻辑变更，仅修改 Markdown 指令文件
- Plugin 必须自包含（sf_cost_tracker 内部定义 CostEntry 类型，不从 sf_cost_report_core 导入）
- sf_cost_report_core 中的 CostEntry 类型与 sf_cost_tracker 中的定义保持一致，但各自独立声明
