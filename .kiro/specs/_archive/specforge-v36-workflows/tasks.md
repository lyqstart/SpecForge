# 实施计划：SpecForge V3.6（会话续接 + 新工作流）

## 概述

本实施计划遵循依赖驱动的阶段排序：状态机和 KG 类型优先（无外部依赖），然后是 Gate 模式系统、续接引擎、Skill 文件 + Orchestrator、知识提取、测试，最后是文档更新。所有代码均为 TypeScript，面向现有 SpecForge tool/lib 架构。

## 任务

- [x] 1. 状态机扩展 + KG 类型扩展（阶段一 — 无外部依赖）
  - [x] 1.1 在 `state_machine.ts` 中扩展 WorkflowType union 并新增 4 个流转表
    - 向 `WorkflowType` union 添加 `"change_request" | "refactor" | "ops_task" | "investigation"`
    - 新增 `CHANGE_REQUEST_TRANSITIONS`、`REFACTOR_TRANSITIONS`、`OPS_TASK_TRANSITIONS`、`INVESTIGATION_TRANSITIONS` 常量，类型为 `ReadonlyMap<string, readonly string[]>`
    - 在 `getTransitionTable()` 中新增 4 个 case 分支
    - 确保现有 4 个工作流流转表不变
    - 文件：`.opencode/tools/lib/state_machine.ts`
    - _Requirements: 2.2, 2.3, 3.2, 3.3, 4.2, 4.3, 5.2, 5.3, 8.1_

  - [x] 1.2 在 `sf_state_transition_core.ts` 中添加工作流特定守卫
    - 实现 `checkWorkflowGuards(workflowType, from, to, workItem, transitionContext?)` 函数
    - 守卫 1：refactor `development` 状态 — 强制执行 `risk_path` 元数据（high→review，low→verification，缺失→blocked）
    - 守卫 2：investigation `findings_report_gate → completed` — 要求 `transitionContext.user_accepted === true`
    - 在标准 `isValidTransition` 检查之后集成守卫
    - 更新 `.opencode/tools/sf_state_transition.ts` 的 Zod schema，接受可选的 `transition_context` 参数（Record<string, unknown>）
    - 将 transition_context 传递给 core 的 checkWorkflowGuards 函数
    - 文件：`.opencode/tools/lib/sf_state_transition_core.ts`、`.opencode/tools/sf_state_transition.ts`
    - _Requirements: 3.1, 3.2, 3.8, 5.1, 5.13, 6.3, 6.4_

  - [x] 1.3 在 `sf_knowledge_graph_core.ts` 中扩展 KG NodeType/EdgeType union
    - 向 `NodeType` union 添加 `"refactor_target"` 和 `"ops_action"`
    - 向 `EdgeType` union 添加 `"affects"`
    - 扩展 `VALID_NODE_TYPES` 和 `VALID_EDGE_TYPES` 数组
    - 添加 `RefactorTargetMetadata` 和 `OpsActionMetadata` 接口
    - 确保现有类型和验证函数不变
    - 文件：`.opencode/tools/lib/sf_knowledge_graph_core.ts`
    - _Requirements: 9.7, 9.8_

  - [x] 1.4 为状态机流转编写属性测试（Property 1、12、13）
    - **Property 1：状态机流转合法性** — 对所有 8 种工作流类型，`isValidTransition` 返回 true 当且仅当 (from, to) 在流转表中
    - **Property 12：Refactor risk_path 守卫** — development 流转由 risk_path 元数据强制执行
    - **Property 13：Investigation user_accepted 守卫** — findings_report_gate→completed 要求 user_accepted=true
    - 文件：`tests/property/state_machine.property.test.ts`
    - **验证：Requirements 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.3, 6.4, 8.1, 8.4, 3.8, 5.13**

  - [x] 1.5 为 KG 类型扩展性编写属性测试（Property 11）
    - **Property 11：KG 类型扩展向后兼容** — 新 NodeType/EdgeType 值通过验证，现有类型不变，现有 graph.json 查询不报错
    - 文件：`tests/property/kg_types.property.test.ts`
    - **验证：Requirements 9.7, 9.8**

- [x] 2. 检查点 — 运行 `bun test` 并验证：所有测试通过，无回归（基准 1028 个测试），报告新增测试数和总通过数

- [x] 3. Gate 模式系统（阶段二 — 依赖状态机的工作流类型）
  - [x] 3.1 在 `sf_requirements_gate_core.ts` 中实现 GateModeSpec 策略表和模式分发
    - 定义 `GateModeSpec` 接口和 `RequirementsGateMode` 类型
    - 添加 `REQUIREMENTS_GATE_SPECS` 策略表，包含 3 种模式：`change_request`、`refactor`、`investigation`
    - 实现 `checkImpactAnalysisContent`、`checkRefactorAnalysisContent`、`checkInvestigationPlanContent` checkFn 函数
    - 将 `checkRequirementsGate` 签名扩展为 `options?: { mode?: RequirementsGateMode }`
    - 不传 mode 时：委托给现有逻辑（向后兼容）
    - 传入 mode 时：查找策略表 → 读取 targetFile → 解析 sections → 调用 checkFn
    - 未知 mode：返回 fail 并附带警告
    - 本地验证：不传 mode 参数运行现有 Gate 测试夹具，确认输出不变
    - 文件：`.opencode/tools/lib/sf_requirements_gate_core.ts`
    - _Requirements: 11.1, 11.5, 11.6, 2.6, 3.6, 5.6_

  - [x] 3.2 在 `sf_design_gate_core.ts` 中实现 GateModeSpec 策略表和模式分发
    - 定义 `DesignGateMode` 类型
    - 添加 `DESIGN_GATE_SPECS` 策略表，包含 4 种模式：`change_request`、`ops_task`、`refactor`、`investigation`
    - 为每种模式实现 mode 特定的 checkFn 函数
    - 将 `checkDesignGate` 签名扩展为 `options?: { workflowType?: string; mode?: DesignGateMode }`
    - ops_task 模式：验证回滚覆盖率、回滚触发条件、破坏性命令识别
    - investigation 模式：验证结论有证据支撑、建议可操作
    - 本地验证：不传 mode 参数运行现有 Gate 测试夹具，确认输出不变
    - 文件：`.opencode/tools/lib/sf_design_gate_core.ts`
    - _Requirements: 11.2, 11.5, 11.6, 2.8, 3.7, 3.8, 4.6, 5.9_

  - [x] 3.3 在 `sf_verification_gate_core.ts` 中实现模式分发
    - 定义 `VerificationGateMode` 类型
    - 添加 `VERIFICATION_GATE_SPECS` 策略表，包含 3 种模式：`refactor`、`ops_task`、`change_request`
    - refactor 模式：检查所有现有测试通过 + 代码质量改善
    - ops_task 模式：检查操作结果与 ops_plan.md 预期结果一致
    - change_request 模式：检查回归测试覆盖受影响区域
    - 将 `checkVerificationGate` 签名扩展为 `options?: { mode?: VerificationGateMode }`
    - 本地验证：不传 mode 参数运行现有 Gate 测试夹具，确认输出不变
    - 文件：`.opencode/tools/lib/sf_verification_gate_core.ts`
    - _Requirements: 11.4, 11.5, 11.6, 3.9, 4.8_

  - [x] 3.4 更新 Gate 工具包装器以传递 mode 参数
    - 更新 `sf_requirements_gate.ts`，接受并转发 `mode` 选项到 core
    - 更新 `sf_design_gate.ts`，接受并转发 `mode` 选项到 core
    - 更新 `sf_verification_gate.ts`，接受并转发 `mode` 选项到 core
    - 确保 `sf_tasks_gate.ts` 不变（不需要 mode 参数）
    - 文件：`.opencode/tools/sf_requirements_gate.ts`、`.opencode/tools/sf_design_gate.ts`、`.opencode/tools/sf_verification_gate.ts`
    - _Requirements: 11.3, 11.5, 8.3, 8.5_

  - [x] 3.5 为 Gate 模式分发编写属性测试（Property 10）
    - **Property 10：Gate 模式分发正确性** — 对任意 (gate_type, mode, document_content)，Gate 返回 pass 当且仅当所有必需 sections 存在且满足 pass 条件；不传 mode = V3.5 行为
    - 文件：`tests/property/gate_mode.property.test.ts`
    - **验证：Requirements 11.1, 11.2, 11.4, 11.5**

- [x] 4. 检查点 — 运行 `bun test` 并验证：所有测试通过，无回归（基准 1028 个测试），报告新增测试数和总通过数

- [x] 5. 续接引擎（阶段三 — 依赖状态机的 WorkflowType）
  - [x] 5.1 创建 `sf_continuity_core.ts` 并实现检测逻辑
    - 实现 `detectContextExhaustion(runFailed, traceEntries, archiveResult, runId, sessionId)` 函数
    - 实现双条件检测：run 必须已失败 AND trace 条目必须包含耗尽模式
    - 模式匹配仅针对 `tool_call` 条目的 `error_message` 字段（不扫描任意文本）
    - Cutoff：先按 run_id/session_id 过滤，再取最后 100 条与最近 10 分钟的交集
    - 二级检测：仅检查 archive 的 `exit_reason` 字段
    - 定义 `ExhaustionDetectionResult`、`TraceEntry`、`ArchiveResult` 类型
    - 文件：`.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.1_

  - [x] 5.2 在 `sf_continuity_core.ts` 中实现 Context_Snapshot 提取
    - 实现 `extractContextSnapshot(options)` 函数
    - 从 tool_calls.jsonl 的 write/edit 调用 + 磁盘验证中提取 `completed_work`
    - 从 exit_code=0 的 bash 调用中提取 `verification_commands_passed`
    - 按优先级提取 `key_decisions`：work_log.md → agent_summary 消息 → 空数组
    - 按优先级提取 `pending_work`：work_log.md → 从 stage expected_output 推断
    - 根据 workflow_type 条件性包含可选字段（代码工作流 vs investigation vs ops_task）
    - 当 completed_work 和 artifacts 均为空时返回 null（提取失败）
    - 文件：`.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.2, 1.3, 7.2_

  - [x] 5.3 在 `sf_continuity_core.ts` 中实现关键消息过滤
    - 实现 `filterKeyMessages(conversation, maxCount)` 函数
    - 优先类型：user_instruction、agent_summary、tool_call_result、error_message、file_change_description
    - 跳过类型：file_read_repeat、intermediate_reasoning、formatted_output
    - 逆序迭代并前置插入，上限为 maxCount
    - 文件：`.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.4_

  - [x] 5.4 在 `sf_continuity_core.ts` 中实现续接 prompt 生成和 Archive 合并
    - 实现 `generateContinuationPrompt(originalTask, snapshot, continuationIndex)` 函数
    - 包含：原始任务、所有 snapshot 字段、续接指令文本、格式化的 run_id
    - 实现 `mergeArchives(originalArchive, continuationArchive)` 函数
    - 合并规则：files_changed 取并集，duration_ms 求和，tool_calls 拼接，continuation_chain 数组
    - 定义 `ContinuationMetadata`、`MergedArchive`、`AgentRunArchive` 类型
    - 文件：`.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.5, 1.7, 1.8_

  - [x] 5.5 创建 `.opencode/tools/sf_continuity.ts` — 向 Orchestrator 暴露 sf_continuity_core 函数的工具包装器
    - 操作：detect_exhaustion、extract_snapshot、generate_prompt、merge_archives、check_continuation_limit
    - Zod schema 输入验证
    - 返回 Orchestrator 可消费的结构化结果
    - 文件：`.opencode/tools/sf_continuity.ts`
    - _Requirements: 1.1, 1.2, 1.5, 1.8_

  - [x] 5.6 在 sf_continuity_core.ts 中实现 readContinuityConfig() 和 enforceContinuationLimit()
    - 读取 project.json 的 continuity 节，默认 max_continuations=1，上限截断为 2
    - enforceContinuationLimit：检查 root_run_id 的续接次数，超限时返回 blocked
    - 文件：`.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.6_

  - [x] 5.7 为续接引擎编写属性测试（Property 2-8）
    - **Property 2：上下文耗尽检测（双条件）** — detected=true 当且仅当 runFailed AND trace 的 error_message 包含耗尽模式
    - **Property 3：Context_Snapshot 结构完整性** — 所有通用字段存在，可选字段基于 workflow_type
    - **Property 4：关键消息过滤正确性** — 数量 ≤ N，仅包含优先类型，不含跳过类型
    - **Property 5：续接 prompt 结构完整性** — 包含原始任务、snapshot 信息、续接指令、正确的 run_id 格式
    - **Property 6：续接次数上限强制** — 允许恰好 max_continuations 次，之后阻止
    - **Property 7：续接链元数据一致性** — root_run_id 一致，parent_run_id = 直接前驱，index 从 1 递增
    - **Property 8：Archive 合并正确性** — files_changed = 并集，duration = 求和，tool_calls = 拼接
    - 文件：`tests/property/continuity.property.test.ts`
    - **验证：Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 7.2**

- [x] 6. 检查点 — 运行 `bun test` 并验证：所有测试通过，无回归（基准 1028 个测试），报告新增测试数和总通过数（实际：1105 个测试全部通过）

- [x] 7. Skill 文件 + Orchestrator Prompt（阶段四 — 依赖以上所有内容）
  - [x] 7.1 创建 `sf-workflow-change-request` Skill 文件
    - YAML frontmatter（name、description、autoload: false）
    - 状态机图（intake → ... → completed）
    - Skill 绑定矩阵（阶段 → Agent → Skill → 产物）
    - 各阶段执行协议
    - 在 Skill 的阶段执行协议中包含产物模板 sections（Gate 模式将检查的必需 sections）
    - Gate 模式规范（impact_analysis_gate 使用 sf_requirements_gate mode="change_request" 等）
    - KG 同步点和 scope
    - 并行任务执行支持（V3.3 协议）
    - 文件：`.opencode/skills/sf-workflow-change-request/SKILL.md`
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11_

  - [x] 7.2 创建 `sf-workflow-refactor` Skill 文件
    - YAML frontmatter（name、description、autoload: false）
    - 带双路径的状态机图（低风险 vs 高风险）
    - Skill 绑定矩阵
    - 各阶段执行协议
    - 在 Skill 的阶段执行协议中包含产物模板 sections（Gate 模式将检查的必需 sections）
    - 风险路径判定逻辑（refactor_plan_gate 决定路径）
    - 验证：行为不变性 + 代码质量改善
    - 文件：`.opencode/skills/sf-workflow-refactor/SKILL.md`
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

  - [x] 7.3 创建 `sf-workflow-ops-task` Skill 文件
    - YAML frontmatter（name、description、autoload: false）
    - 状态机图
    - Skill 绑定矩阵
    - 各阶段执行协议
    - 在 Skill 的阶段执行协议中包含产物模板 sections（Gate 模式将检查的必需 sections）
    - ops_plan 安全要求（回滚方案、触发条件、破坏性命令识别、备份声明）
    - 执行安全协议（不匹配时 fail-stop，检查回滚触发条件）
    - 执行协议必须明确：sf-executor 在标记 `requires_user_confirmation` 的步骤前必须停止，并通过 Orchestrator 请求用户确认后再继续
    - 默认串行执行，仅当 ops_plan.md 标记 `parallel: true` 时才并行
    - 文件：`.opencode/skills/sf-workflow-ops-task/SKILL.md`
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12_

  - [x] 7.4 创建 `sf-workflow-investigation` Skill 文件
    - YAML frontmatter（name、description、autoload: false）
    - 状态机图
    - Skill 绑定矩阵
    - 各阶段执行协议
    - 在 Skill 的阶段执行协议中包含产物模板 sections（Gate 模式将检查的必需 sections）
    - findings_report_gate 用户接受流程（pass + 接受 → completed，用户要求补充 → research）
    - 无 development/review/verification 阶段
    - 不同步 KG（无结构化可追溯链）
    - 知识提取使用 candidate 状态
    - 文件：`.opencode/skills/sf-workflow-investigation/SKILL.md`
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13_

  - [x] 7.5 更新 Orchestrator：意图分类 + 优先级 + 消歧
    - 添加 4 条新意图分类规则及关键词列表
    - 添加 6 级优先级排序
    - 添加低置信度消歧 UX 模板（展示 2-3 个候选）
    - 文件：`.opencode/agents/sf-orchestrator.md`
    - _Requirements: 6.1, 6.6, 6.7_

  - [x] 7.6 更新 Orchestrator：Skill 路由 + 会话恢复
    - 添加 4 条新 Skill 路由表条目
    - 为 4 种新工作流类型添加会话恢复支持
    - 文件：`.opencode/agents/sf-orchestrator.md`
    - _Requirements: 6.2, 6.5_

  - [x] 7.7 更新 Orchestrator：续接检测 + snapshot + 调度
    - 添加跨会话续接协议：通过 sf_continuity 工具检测耗尽 → 提取 snapshot → 生成续接 prompt → 调度新子 Agent
    - 包含 continuity.extraction_failed 处理：当提取返回 null 时，流转到 blocked 并向 events.jsonl 追加 continuity.extraction_failed 事件
    - 包含续接元数据写入：续接 run 完成后，将 continuation_parent_run_id、continuation_root_run_id、continuation_index 写入 Agent_Run_Archive result.json
    - 文件：`.opencode/agents/sf-orchestrator.md`
    - _Requirements: 1.1, 1.2, 1.5, 1.9, 1.10, 7.1_

  - [x] 7.8 更新 Orchestrator：max_continuations + blocked + Archive 合并
    - 添加 max_continuations 强制执行（每次续接前通过 sf_continuity 工具检查）
    - 添加达到上限时的 blocked 回退（向用户报告续接链历史）
    - 添加续接成功后的 Archive 合并协议（调用 sf_continuity merge_archives）
    - 文件：`.opencode/agents/sf-orchestrator.md`
    - _Requirements: 1.6, 1.7, 1.8_

  - [x] 7.9 为意图分类优先级编写属性测试（Property 9）
    - **Property 9：意图分类优先级正确性** — 对匹配多个工作流的输入，返回优先级最高的意图，或在分数接近时返回 ambiguous
    - 文件：`tests/property/intent_routing.property.test.ts`
    - **验证：Requirements 6.1, 6.6**

- [x] 8. 检查点 — 运行 `bun test` 并验证：所有测试通过，无回归（基准 1028 个测试），报告新增测试数和总通过数

- [x] 9. 知识提取扩展（阶段五）
  - [x] 9.1 在 `sf_knowledge_base_core.ts` 中扩展 workflow_type 和 confidence 字段
    - 向 `KnowledgeEntry` 接口添加 `workflow_type?: WorkflowType` 字段
    - 向 `KnowledgeEntry` 接口添加 `confidence?: "high" | "medium" | "low"` 字段
    - 更新知识条目创建逻辑：investigation → status="candidate"，confidence="medium"；其他 → status="active"，confidence="high"
    - 确保不含这些字段的现有条目继续正常工作（向后兼容）
    - 文件：`.opencode/tools/lib/sf_knowledge_base_core.ts`
    - _Requirements: 10.7, 10.8_

  - [x] 9.2 通过 Skill 协议确保知识提取触发
    - 不向 sf_state_transition_core.ts 添加触发逻辑，而是确保所有 4 个新 Workflow Skill 文件（7.1-7.4）包含"completed 后触发知识提取"协议描述
    - Orchestrator 消费 completed 状态流转并调度 sf-knowledge（现有 V5.0 模式）
    - 不对 sf_state_transition_core.ts 进行知识提取相关的代码修改
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 10. 检查点 — 运行 `bun test` 并验证：所有测试通过，无回归（基准 1028 个测试），报告新增测试数和总通过数

- [x] 11. 单元测试 + 集成测试 + 回归测试（阶段六）
  - [x] 11.1 为状态机扩展编写单元测试
    - 测试 4 个新工作流流转表的所有合法路径
    - 测试非法流转（跳过阶段、逆向流转）被拒绝
    - 测试 `getTransitionTable` 对新工作流类型返回正确的表
    - 回归：现有 4 个工作流流转表不变
    - 文件：`tests/unit/tools/lib/state_machine.test.ts`
    - _Requirements: 12.1, 8.1_

  - [x] 11.2 为工作流特定守卫编写单元测试
    - 测试 refactor risk_path 守卫：high→仅 review，low→仅 verification，缺失→blocked
    - 测试 investigation user_accepted 守卫：true→允许，false/undefined/缺失→拒绝
    - 文件：`tests/unit/tools/lib/sf_state_transition_core.test.ts`
    - _Requirements: 12.1, 3.8, 5.13_

  - [x] 11.3 为 Gate 模式分发编写单元测试
    - 测试 sf_requirements_gate 每种模式的 pass/fail 场景
    - 测试 sf_design_gate 每种模式的 pass/fail 场景
    - 测试 sf_verification_gate 每种模式的 pass/fail 场景
    - 测试不传 mode 参数时的向后兼容性（行为 = V3.5）
    - 测试未知 mode 返回 fail + warning
    - 测试 ops_plan_gate 安全检查（缺少回滚方案/触发条件/备份声明 → fail）
    - 文件：`tests/unit/tools/lib/gate_mode.test.ts`
    - _Requirements: 12.4, 12.8, 11.1, 11.2, 11.4, 11.6_

  - [x] 11.4 为续接引擎编写单元测试
    - 测试上下文耗尽检测（各种模式匹配、不匹配模式、run 未失败）
    - 测试 Context_Snapshot 提取（各工作流类型的字段选择）
    - 测试关键消息过滤（优先级和数量限制）
    - 测试续接 prompt 生成（结构完整性）
    - 测试 Archive 合并（files_changed 并集、duration 求和、tool_calls 拼接）
    - 测试续接计数器（上限强制执行，分别为 1 和 2）
    - 文件：`tests/unit/tools/lib/sf_continuity_core.test.ts`
    - _Requirements: 12.5, 12.6, 12.9_

  - [x] 11.5 为 Skill 文件加载和路由编写集成测试
    - 验证 4 个新 Skill 文件存在且 YAML frontmatter 正确
    - 验证 Orchestrator 路由表正确映射到新 Skill
    - 验证意图分类将新关键词路由到正确工作流
    - 回归：现有工作流触发输入仍路由到原有工作流
    - 文件：`tests/integration/workflow_routing.test.ts`
    - _Requirements: 12.2, 12.3, 8.6_

  - [x] 11.6 为 KG 同步和知识提取编写集成测试
    - 测试 KG 同步在每个新工作流的正确 Gate pass 点触发
    - 测试 investigation 工作流不同步 KG
    - 测试知识提取在所有 4 个新工作流 completed 时触发
    - 测试 investigation 知识条目的 status="candidate"，confidence="medium"
    - 测试非 investigation 条目的 status="active"，confidence="high"
    - 测试 refactor_plan_gate pass 触发 scope='tasks' 同步（code_file + modifies 边，refactor 无 tasks_gate）
    - 文件：`tests/integration/kg_knowledge_integration.test.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.7, 10.8, 12.11_

  - [x] 11.7 为向后兼容性编写回归测试
    - 测试现有 4 个工作流的状态机不变
    - 测试不传 mode 参数时 Gate 工具行为与 V3.5 完全一致
    - 测试现有 16 个 Custom Tool 的输入输出契约不变
    - 测试现有 KG 查询对新节点/边类型不报错
    - 测试 investigation findings_report_gate 用户接受流程（接受→completed，要求补充→research）
    - 文件：`tests/regression/v36_backward_compat.test.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 12.7, 12.10_

- [x] 12. 检查点 — 运行 `bun test` 并验证：所有测试通过，无回归（基准 1028 个测试），报告新增测试数和总通过数

- [x] 13. 文档更新（阶段七）
  - [x] 13.1 更新 AGENTS.md，添加新工作流、Skill 和路由
    - 向工作流列表添加 4 个新工作流（相当于新工作流的第 4 节）
    - 向 Skill 表（第 6 节）添加 4 个新 Skill
    - 更新路由表（第 7.2 节），添加 4 条新条目
    - 向配置节添加续接配置
    - 向第 9 节添加新 KG 类型
    - 文件：`AGENTS.md`
    - _Requirements: 6.2_

  - [x] 13.2 更新 Plugin 的项目运行时初始化模板，添加续接默认配置
    - 更新 `sf_specforge.ts` 的 buildInitialProjectConfig，在生成的 project.json 模板中包含 `"continuity": { "max_continuations": 1, "key_messages_count": 20 }`
    - 不直接修改特定项目的 specforge/config/project.json
    - 添加测试：新项目初始化包含 continuity 配置节
    - 文件：`.opencode/plugins/sf_specforge.ts`
    - _Requirements: 1.4, 1.6_

- [x] 14. 最终检查点 — 运行 `bun test` 并验证：所有测试通过，无回归（基准 1028 个测试），报告新增测试数和总通过数

## 备注

- 每个任务引用具体需求编号以保证可追溯性
- 检查点确保每个阶段后的增量验证
- 属性测试验证设计文档中的通用正确性属性
- 单元测试验证具体示例和边界情况
- 所有代码均为 TypeScript，面向现有 `.opencode/tools/lib/` 架构
- 现有 4 个工作流必须完全不变（向后兼容是硬性约束）
