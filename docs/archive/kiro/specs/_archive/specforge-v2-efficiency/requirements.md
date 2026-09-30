# 需求文档

## 简介

SpecForge V2.0（效率版）解决 V1 系统经过 10 轮测试后发现的架构瓶颈。V1 已完成 4 种工作流、8 个 Agent、9 个 Custom Tool、3 个 Plugin、7 个 Skill 和 263 个单元测试。测试表明，仅靠 prompt 优化无法解决以下系统性问题：

1. **只读 Agent 写文件矛盾**：sf-verifier 和 sf-reviewer 的 `permission.edit=deny`，但必须生成产物文件（verification_report.md、work_log.md、review_report.md）。当前通过 bash 绕过，导致转义失败、多次重试、每次写入浪费 60+ 秒。
2. **现场生成脚本浪费**：sf-verifier 在运行时生成 Python 验证脚本，每次尝试花费 37-43 秒，且频繁遇到 PowerShell 转义失败。
3. **报告创作开销**：sf-verifier 现场"创作"长篇 Markdown 报告，消耗 63+ 秒的模型思考时间。
4. **Gate 结果不透明**：Gate 工具的结果（pass/fail/blocked）未记录到 events.jsonl，fail 原因只能从后续 prompt 推断。
5. **自报统计不可靠**：Agent 自报的工具调用统计不准确（第 9 轮：自报 11 次，实际 16 次）。
6. **Design-First Gate 语义冲突**：design_gate 要求引用需求编号，但在 Design-First 工作流中，design_gate 执行时需求尚不存在，导致每次首次尝试必然失败。

V2.0 目标：Quick Change 总耗时 ≤ 4 分钟，sf-verifier 工具调用 ≤ 8 次，验证阶段 ≤ 90 秒。

所有变更必须保持与 V1 工作流的向后兼容，263 个现有单元测试必须继续通过。

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 Agent、子 Agent、Skill、Tool、Plugin、权限等扩展机制
- **Orchestrator**：主 Agent（sf-orchestrator），负责项目管理、工作流推进、用户沟通和子 Agent 调度
- **子 Agent**：由 Orchestrator 调度的专业执行 Agent，不能直接与用户交互
- **Gate**：质量检查点，实现为 Custom Tool，在工作流阶段边界返回 pass / fail / blocked 状态
- **Custom Tool**：`.opencode/tools/` 目录下的 TypeScript 工具文件，使用 Zod schema 进行输入验证，`execute()` 必须返回字符串（通过 `JSON.stringify`）
- **Plugin**：OpenCode 事件钩子扩展，可以监听和拦截系统事件，必须自包含（不引用外部模块，只用 `node:` 内置模块）
- **产物文件**：子 Agent 作为工作流交付物生成的文件（如 verification_report.md、work_log.md、review_report.md）
- **白名单路径**：sf_artifact_write 允许写入的预定义文件路径模式集合
- **检查模式**：单个验证检查项，包含名称、正则模式、预期存在标志和匹配类型
- **验证 JSON**：sf-verifier 返回的结构化 JSON 结果，包含结论、检查项、验收标准、端到端测试结果和副作用评估
- **报告模板**：固定的 Markdown 模板，包含必需章节（验证命令、验收标准、端到端测试、副作用、结论），用于将验证 JSON 渲染为报告
- **Events JSONL**：`specforge/runtime/events.jsonl` 中的结构化事件日志，记录工作流状态流转和 Gate 结果
- **Trace 数据**：`specforge/logs/trace.jsonl` 中的运行时执行记录，捕获所有工具调用、Agent 调度和系统事件
- **状态机**：通过 Custom Tool 实现的工作流状态流转机制，强制执行合法的阶段推进
- **Work Item**：SpecForge 中的独立工作单元，具有唯一 ID（如 WI-001）
- **Run ID**：每次子 Agent 执行的唯一标识，格式为 `<work_item_id>-<agent_name>-<序号>`
- **Design-First 工作流**：工作流变体（feature_spec_design_first），设计在需求之前编写
- **工作流类型**：工作流的类型标识（feature_spec、feature_spec_design_first、bugfix_spec、quick_change）
- **批量验证**：在单次工具调用中对目标文件执行多个基于正则的检查

## 需求

### 需求 1：sf_artifact_write Custom Tool

**用户故事：** 作为只读 Agent（sf-verifier、sf-reviewer），我希望有一个专用工具来将产物文件写入白名单路径，以便我可以生成验证报告和工作日志，而不必依赖导致转义失败和时间浪费的 bash 变通方案。

#### 验收标准

1. SpecForge 应在 `.opencode/tools/sf_artifact_write.ts` 实现 sf_artifact_write Custom Tool，对应核心逻辑模块在 `.opencode/tools/lib/sf_artifact_write_core.ts`
2. 当调用 sf_artifact_write 时，应接受以下参数：`work_item_id`（字符串）、`file_type`（枚举：verification_report、work_log、review_report、intake、agent_run_result）、`content`（字符串）、可选的 `run_id`（字符串，当 file_type 为 work_log 或 agent_run_result 时必填）
3. sf_artifact_write 应根据 file_type 解析目标文件路径：
   - verification_report → `specforge/specs/<work_item_id>/verification_report.md`
   - review_report → `specforge/specs/<work_item_id>/review_report.md`
   - intake → `specforge/specs/<work_item_id>/intake.md`
   - work_log → `specforge/archive/agent_runs/<run_id>/work_log.md`
   - agent_run_result → `specforge/archive/agent_runs/<run_id>/result.json`
4. sf_artifact_write 应在写入文件前递归创建不存在的父目录
5. 当解析后的目标路径不匹配任何白名单路径模式时，sf_artifact_write 应拒绝写入并返回 `{ success: false, error: "path not in whitelist" }`
6. 当写入操作成功时，sf_artifact_write 应返回 `{ success: true, path: "<解析后路径>", size: <写入字节数> }`
7. 如果 content 参数为空或 work_item_id 参数为空，sf_artifact_write 应返回 `{ success: false, error: "missing required parameter" }`
8. sf_artifact_write 应拒绝写入 `specforge/` 目录树之外的任何文件，防止写入业务代码文件
9. 对于所有有效的 work_item_id、file_type 和 content 组合，写入后读取文件应产生与输入相同的内容（往返一致性）

### 需求 2：sf_batch_verify Custom Tool

**用户故事：** 作为 sf-verifier Agent，我希望有一个工具接受目标文件和检查模式数组并在内部执行正则匹配，这样我就不再需要现场生成 Python 验证脚本，消除每次验证 37-43 秒的脚本生成时间和 PowerShell 转义失败。

#### 验收标准

1. SpecForge 应在 `.opencode/tools/sf_batch_verify.ts` 实现 sf_batch_verify Custom Tool，对应核心逻辑模块在 `.opencode/tools/lib/sf_batch_verify_core.ts`
2. 当调用 sf_batch_verify 时，应接受以下参数：`target_file`（字符串，要验证的文件路径）和 `checks`（检查模式对象数组）
3. sf_batch_verify 应定义每个检查模式包含以下字段：`name`（字符串，人类可读的检查描述）、`pattern`（字符串，正则模式）、`should_exist`（布尔值，模式是否应被找到）、可选的 `count`（数字，指定时为预期最小匹配次数）
4. 当 target_file 不存在时，sf_batch_verify 应返回 `{ success: false, error: "target file not found", total: 0, passed: 0, failed: 0, results: [] }`
5. sf_batch_verify 应使用 Node.js RegExp 匹配对目标文件内容执行每个检查模式，并返回结构化结果：`{ success: true, total: <数字>, passed: <数字>, failed: <数字>, results: [{ name: <字符串>, status: "pass" | "fail", found: <布尔值>, match_count: <数字> }] }`
6. 当检查模式的 `should_exist: true` 且模式未在文件中找到时，sf_batch_verify 应将该检查标记为 `status: "fail"`，`found: false`
7. 当检查模式的 `should_exist: false` 且模式在文件中被找到时，sf_batch_verify 应将该检查标记为 `status: "fail"`，`found: true`
8. 当检查模式指定了 `count` 字段且实际匹配次数小于指定次数时，sf_batch_verify 应将该检查标记为 `status: "fail"`，无论 `should_exist` 值如何
9. 如果 checks 数组为空，sf_batch_verify 应返回 `{ success: true, total: 0, passed: 0, failed: 0, results: [] }`
10. 如果检查模式包含无效的正则模式，sf_batch_verify 应将该单个检查标记为 `status: "fail"` 并附带错误信息，继续处理剩余检查
11. 对于所有 `should_exist` 为 true 且模式匹配的检查模式，sf_batch_verify 应报告 `status: "pass"`（幂等性：对未更改的文件运行相同检查两次应产生相同结果）

### 需求 3：验证报告模板化渲染

**用户故事：** 作为 Orchestrator，我希望 sf-verifier 返回结构化 JSON 结果，通过模板渲染为 Markdown 报告，这样可以消除模型花费 63+ 秒"创作"报告的时间，并确保报告格式对 Gate 检查一致。

#### 验收标准

1. 当 sf-verifier 完成验证时，sf-verifier 应向 Orchestrator 返回验证 JSON 对象，而不是直接写入 Markdown 报告
2. 验证 JSON 应符合以下结构：
   - `conclusion`：字符串（pass | fail | blocked）
   - `verification_commands`：`{ command: 字符串, status: "pass" | "fail", output_summary: 字符串 }` 数组
   - `acceptance_criteria`：`{ req_id: 字符串, name: 字符串, status: "pass" | "fail", evidence: 字符串 }` 数组
   - `e2e_tests`：`{ name: 字符串, status: "pass" | "fail", evidence: 字符串 }` 数组
   - `side_effects`：字符串（副作用评估）
   - `summary`：字符串（简要总结）
3. sf_artifact_write 工具应接受可选的 `template` 参数（枚举：verification_report），指定时将 content（作为 JSON 字符串提供）使用报告模板渲染为 Markdown 报告
4. 报告模板应按顺序包含以下必需章节：验证命令、验收标准、端到端测试、副作用、结论
5. 当验证 JSON 渲染为 Markdown 时，渲染后的报告应包含结果汇总表，显示总检查数、通过数和失败数
6. 对于所有有效的验证 JSON 输入，渲染为 Markdown 后解析章节标题应产生相同的必需章节集合（往返结构一致性）

### 需求 4：Gate 结果结构化记录

**用户故事：** 作为进行事后分析的开发者，我希望 Gate 结果（pass/fail/blocked）及其阻塞问题记录在 events.jsonl 中，这样可以直接从日志确定 Gate 失败原因，而不必从后续 prompt 猜测。

#### 验收标准

1. 当任何 Gate 工具（sf_requirements_gate、sf_design_gate、sf_tasks_gate、sf_verification_gate）完成执行时，Gate 工具应向 Events JSONL 追加结构化结果条目
2. Gate 结果条目应符合以下格式：
   ```json
   { "type": "gate_result", "timestamp": "<ISO8601>", "work_item_id": "<id>", "gate": "<gate工具名>", "status": "pass" | "fail" | "blocked", "blocking_issues": [...], "warnings": [...] }
   ```
3. 当 Gate 返回 "fail" 状态时，Gate 结果条目应包含非空的 `blocking_issues` 数组，每个问题包含描述性消息
4. 当 Gate 返回 "pass" 状态时，Gate 结果条目应包含空的 `blocking_issues` 数组
5. Gate 结果记录应在 Gate 工具的 execute 函数内、返回结果给调用者之前发生，确保即使调用者丢弃结果，日志条目也已写入
6. 如果写入 Events JSONL 失败，Gate 工具应将错误记录到 `specforge/logs/error.log` 并继续返回 Gate 结果，不阻塞工作流

### 需求 5：work_log 自动生成

**用户故事：** 作为审查执行历史的开发者，我希望 work_log.md 的工具调用统计由工具从 trace 数据自动提取，而不是由 Agent 自报，这样统计数据 100% 准确（V1 第 9 轮：Agent 自报 11 次工具调用，实际为 16 次）。

#### 验收标准

1. 当 sf_artifact_write 被调用且 file_type 为 work_log 时，sf_artifact_write 应接受额外的可选参数 `agent_content`（字符串，Agent 提供的工作报告内容）
2. 当提供了 `agent_content` 参数时，sf_artifact_write 应自动从 `specforge/logs/trace.jsonl` 中提取对应 run_id 的执行统计：总工具调用次数、按类别分类的工具调用（read、write、bash、grep、sf_tool）、执行时长、创建或修改的文件列表
3. sf_artifact_write 应将 Agent 提供的内容和提取的 trace 统计合并为单个 work_log.md，包含两个明确分隔的部分："Agent 报告"和"执行统计"
4. 当 sf_artifact_write 无法找到给定 run_id 的 trace 条目时，应写入包含 Agent 提供内容的 work_log，并将统计部分标记为"trace 数据不可用"
5. Orchestrator 只需调用一次 sf_artifact_write（传入 run_id 和 agent_content），不需要自己读取 trace、提取统计或合并内容
6. 子 Agent 只需在完成响应中提供以下内容：task_summary（简要描述做了什么）、execution_process（方法的逐步描述）、issues_encountered（遇到的问题及解决方式）、conclusion（最终评估）。不需要自报工具调用统计

### 需求 6：Design-First 专用 design_gate 检查标准

**用户故事：** 作为运行 Design-First 工作流的用户，我希望 design_gate 检查架构完整性和模块边界，而不是要求尚不存在的需求引用，这样 Gate 不会在每次首次尝试时强制重试。

#### 验收标准

1. 当调用 sf_design_gate 时，sf_design_gate 应接受可选的 `workflow_type` 参数（字符串，默认为 "feature_spec"）
2. 当 workflow_type 为 "feature_spec" 或 "bugfix_spec" 时，sf_design_gate 应检查 design.md 是否包含需求引用（现有 V1 行为，不变）
3. 当 workflow_type 为 "feature_spec_design_first" 时，sf_design_gate 应完全跳过需求引用检查
4. 当 workflow_type 为 "feature_spec_design_first" 时，sf_design_gate 应改为检查以下标准：design.md 存在、design.md 包含架构概述章节、design.md 定义了模块或组件边界、design.md 包含数据模型或接口定义
5. 当 Orchestrator 在 Design-First 工作流中调用 sf_design_gate 时，Orchestrator 应传递 `workflow_type: "feature_spec_design_first"` 作为参数
6. sf_design_gate 应返回相同的 GateResult 结构（`{ status, blocking_issues, warnings, next_action }`），无论 workflow_type 如何，保持与所有现有 Gate 结果消费者的向后兼容

### 需求 7：向后兼容与测试完整性

**用户故事：** 作为开发者，我希望所有 V2.0 变更保持与 V1 工作流的向后兼容并通过所有 263 个现有单元测试，这样效率改进不会破坏任何现有功能。

#### 验收标准

1. SpecForge 应确保 `tests/unit/` 中的所有 263 个现有单元测试在 V2.0 变更应用后继续通过
2. 当不带 workflow_type 参数调用 sf_design_gate 时，sf_design_gate 应默认为 "feature_spec" 行为，保留现有 V1 行为
3. 当 Gate 工具更新为在 Events JSONL 中记录结果时，Gate 工具应继续向调用者返回与 V1 相同的 GateResult JSON 结构
4. sf_artifact_write 工具不应干扰现有的 sf_permission_guard Plugin；sf_permission_guard 应继续独立阻止未授权的 file.edit 操作
5. sf_batch_verify 工具不应修改其验证的目标文件；所有验证操作应为只读
6. 当通过 sf_artifact_write 生成 work_log.md 时，现有子 Agent 通过 bash 写入 work_log 的行为应作为回退方案继续可用

### 需求 8：V2.0 效率目标

**用户故事：** 作为用户，我希望 V2.0 变更能可衡量地提升工作流效率，使 Quick Change 工作流在 4 分钟内完成，验证阶段在 90 秒内完成。

#### 验收标准

1. 在执行 quick_change 工作流时，SpecForge 应以 4 分钟或更短的总耗时为目标（从 intake 到 completed 计算）
2. 在执行任何工作流的验证阶段时，sf-verifier Agent 应以 8 次或更少的工具调用为目标
3. 在执行任何工作流的验证阶段时，SpecForge 应以 90 秒或更短的验证阶段耗时为目标
4. 当 sf-verifier 写入验证报告时，sf-verifier 应在恰好 1 次 sf_artifact_write 调用中完成写入（替代之前的 2-5 次 bash 调用模式）
5. 当通过 sf_artifact_write 生成 work_log.md 时，工具调用统计应与实际 trace 数据 100% 一致（替代不可靠的 Agent 自报）

### 需求 9：sf_state_transition 自动创建 Work Item 基础设施

**用户故事：** 作为 Orchestrator，我希望创建 Work Item 时 sf_state_transition 自动创建 Spec 目录和 spec.json，这样我不需要用 bash 手动创建目录和文件，保持上下文干净。

#### 验收标准

1. 当 sf_state_transition 被调用且 from_state 为空（创建新 Work Item）时，sf_state_transition 应自动创建 `specforge/specs/<work_item_id>/` 目录
2. sf_state_transition 应在创建目录的同时自动生成 `specforge/specs/<work_item_id>/spec.json` 文件，包含 work_item_id、workflow_type 和 created_at 字段
3. 当 sf_state_transition 创建新 Work Item 时，应同时创建 `specforge/archive/agent_runs/` 基础目录（如不存在）
4. sf_state_transition 的返回值应包含创建的目录路径，便于 Orchestrator 后续传递给子 Agent
5. 当目录已存在时，sf_state_transition 不应报错，应正常继续
6. Orchestrator 创建 Work Item 后不再需要执行任何 bash mkdir 或文件写入操作
