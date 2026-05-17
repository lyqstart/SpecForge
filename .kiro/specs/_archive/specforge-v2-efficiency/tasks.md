# 实施计划：SpecForge V2.0（效率版）

## 概述

本实施计划基于已实现并经过 10 轮测试验证的 V1 系统，按 5 个阶段增量推进 V2.0 的全部新增和变更功能。所有代码使用 TypeScript 编写，测试使用 Vitest + fast-check。每个阶段在前一阶段基础上构建，确保无孤立代码。

**关键约束：**
- 本项目运行在 OpenCode + Bun 运行时
- Custom Tool 的 `execute()` 必须返回 `JSON.stringify` 后的字符串
- 使用现有 `utils.ts` 中的 `appendJsonl` 等共享函数
- 现有 263 个单元测试必须在所有变更后继续通过
- 所有新增属性测试使用 fast-check，最少 100 次迭代，标签格式：`Feature: specforge-v2-efficiency, Property {N}: {text}`

## 任务

- [x] 1. Phase 1：核心工具 — sf_batch_verify（需求 2）
  - [x] 1.1 实现 sf_batch_verify_core.ts 核心逻辑
    - 创建 `.opencode/tools/lib/sf_batch_verify_core.ts`
    - 定义 `CheckPattern`、`CheckResult`、`BatchVerifyResult` 类型接口
    - 实现 `batchVerify(targetFile, checks, baseDir)` 函数：
      - 空 checks 数组返回 `{ success: true, total: 0, passed: 0, failed: 0, results: [] }`
      - 目标文件不存在返回 `{ success: false, error: "target file not found", ... }`
      - 逐个执行 Node.js RegExp 匹配，处理 `should_exist` 和 `count` 逻辑
      - 无效正则标记为 fail 并附带错误信息，继续处理剩余检查
    - 验证操作为只读，不修改目标文件
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 7.5_

  - [x] 1.2 实现 sf_batch_verify.ts 工具入口
    - 创建 `.opencode/tools/sf_batch_verify.ts`
    - 使用 `@opencode-ai/plugin` 的 `tool()` 定义工具
    - 定义 Zod schema 参数：`target_file`（字符串）、`checks`（对象数组，含 name、pattern、should_exist、可选 count）
    - `execute()` 调用 `batchVerify` 并返回 `JSON.stringify` 结果
    - _需求: 2.1, 2.2_

  - [x]* 1.3 编写 sf_batch_verify 单元测试
    - 创建 `tests/unit/tools/sf_batch_verify.test.ts`
    - 测试场景：
      - 正则匹配成功（should_exist: true + 模式存在 → pass）
      - 正则匹配失败（should_exist: true + 模式不存在 → fail）
      - 反向检查（should_exist: false + 模式存在 → fail）
      - 反向检查通过（should_exist: false + 模式不存在 → pass）
      - count 模式（匹配次数 >= count → pass，< count → fail）
      - 无效正则模式（标记为 fail，继续处理剩余）
      - 空 checks 数组（返回 success: true, total: 0）
      - 目标文件不存在（返回 success: false, error: "target file not found"）
    - _需求: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x]* 1.4 编写 sf_batch_verify 属性测试
    - 在 `tests/unit/tools/sf_batch_verify.test.ts` 中新增属性测试
    - **属性 4: 批量验证正则匹配正确性**
      - 使用 fast-check 生成随机文件内容和检查模式
      - 验证每个检查结果与直接使用 Node.js RegExp 执行匹配的结果一致
      - `Feature: specforge-v2-efficiency, Property 4: regex matching correctness`
      - **验证: 需求 2.5, 2.6, 2.7**
    - **属性 5: 批量验证幂等性**
      - 对未更改的文件连续两次执行 batchVerify，验证结果完全相同
      - `Feature: specforge-v2-efficiency, Property 5: batch verify idempotence`
      - **验证: 需求 2.11**
    - **属性 6: 批量验证只读性**
      - 执行 batchVerify 前后读取文件内容，验证完全相同
      - `Feature: specforge-v2-efficiency, Property 6: batch verify read-only`
      - **验证: 需求 7.5**


- [x] 2. Phase 1：核心工具 — sf_artifact_write（需求 1、需求 3、需求 5）
  - [x] 2.1 实现 sf_artifact_write_core.ts 核心逻辑
    - 创建 `.opencode/tools/lib/sf_artifact_write_core.ts`
    - 定义类型接口：`ArtifactFileType`、`TemplateType`、`ArtifactWriteInput`、`ArtifactWriteSuccess`、`ArtifactWriteFailure`、`ArtifactWriteResult`、`VerificationJSON`、`TraceStats`
    - 实现白名单路径映射 `FILE_TYPE_PATH_MAP`（5 种 file_type 对应路径模式）
    - 实现 `isPathWhitelisted(resolvedPath)` 函数（检查 `specforge/specs/` 和 `specforge/archive/agent_runs/` 前缀）
    - 实现 `resolveArtifactPath(fileType, workItemId, runId)` 函数
    - 实现 `writeArtifact(input, baseDir)` 核心写入函数：
      - 参数验证（空 content/work_item_id 返回 missing required parameter）
      - work_log/agent_run_result 缺少 run_id 返回错误
      - 白名单检查（路径不匹配返回 path not in whitelist）
      - 模板渲染模式（template=verification_report 时调用 renderVerificationReport）
      - work_log 自动生成模式（agent_content 存在时调用 generateWorkLog）
      - 递归创建父目录 + 写入文件
      - 返回 `{ success: true, path, size }`
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 2.2 实现验证报告模板渲染逻辑
    - 在 `sf_artifact_write_core.ts` 中实现 `renderVerificationReport(jsonContent)` 函数
    - 解析 VerificationJSON 结构（conclusion、verification_commands、acceptance_criteria、e2e_tests、side_effects、summary）
    - 渲染为 Markdown 报告，按顺序包含 5 个必需章节：验证命令、验收标准、端到端测试、副作用、结论
    - 包含结果汇总表（总检查数、通过数、失败数）
    - JSON 解析失败时返回 `{ success: false, error: "invalid JSON content" }`
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 2.3 实现 work_log 自动生成逻辑
    - 在 `sf_artifact_write_core.ts` 中实现 `extractTraceStats(runId, baseDir)` 函数
      - 从 `specforge/logs/trace.jsonl` 读取并解析条目
      - 过滤 `tool.execute.after` 事件，统计工具调用次数
      - 按类别分类（read、write、bash、grep、sf_tool、other）
      - 提取修改的文件列表
      - trace 文件不存在或无匹配条目时返回 null
    - 实现 `generateWorkLog(agentContent, runId, baseDir)` 函数
      - 合并 Agent 报告内容和 trace 统计为单个 Markdown
      - 包含 "Agent 报告" 和 "执行统计" 两个明确分隔的章节
      - trace 数据不可用时标记 "trace 数据不可用"
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 2.4 实现 sf_artifact_write.ts 工具入口
    - 创建 `.opencode/tools/sf_artifact_write.ts`
    - 使用 `@opencode-ai/plugin` 的 `tool()` 定义工具
    - 定义 Zod schema 参数：`work_item_id`、`file_type`（枚举）、`content`、可选 `run_id`、可选 `template`（枚举）、可选 `agent_content`
    - `execute()` 调用 `writeArtifact` 并返回 `JSON.stringify` 结果
    - _需求: 1.1, 1.2_

  - [x]* 2.5 编写 sf_artifact_write 单元测试
    - 创建 `tests/unit/tools/sf_artifact_write.test.ts`
    - 测试场景：
      - 各 file_type 写入成功（verification_report、work_log、review_report、intake、agent_run_result）
      - 白名单拒绝（路径不在白名单内）
      - 空参数验证（空 content、空 work_item_id）
      - work_log/agent_run_result 缺少 run_id
      - 模板渲染（template=verification_report，验证 JSON 渲染为 Markdown）
      - 模板渲染 JSON 解析失败
      - work_log 自动生成（agent_content + trace 统计合并）
      - work_log trace 数据不可用时的回退
      - 写入后读取验证往返一致性
    - _需求: 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 3.3, 3.4, 5.2, 5.3, 5.4_

  - [x]* 2.6 编写 sf_artifact_write 属性测试
    - 在 `tests/unit/tools/sf_artifact_write.test.ts` 中新增属性测试
    - **属性 1: 产物写入往返一致性**
      - 使用 fast-check 生成随机 work_item_id、file_type 和 content
      - 写入后读取文件，验证内容与输入完全相同
      - `Feature: specforge-v2-efficiency, Property 1: artifact write round-trip`
      - **验证: 需求 1.9**
    - **属性 2: 白名单路径强制执行**
      - 使用 fast-check 生成随机文件路径
      - 验证不以 `specforge/specs/` 或 `specforge/archive/agent_runs/` 开头的路径被拒绝
      - `Feature: specforge-v2-efficiency, Property 2: whitelist enforcement`
      - **验证: 需求 1.5, 1.8**
    - **属性 3: 文件类型路径解析正确性**
      - 使用 fast-check 生成随机 (work_item_id, file_type, run_id) 组合
      - 验证 resolveArtifactPath 返回匹配对应 file_type 模式的路径
      - `Feature: specforge-v2-efficiency, Property 3: file type path resolution`
      - **验证: 需求 1.3, 1.6**
    - **属性 7: 验证报告模板渲染结构一致性**
      - 使用 fast-check 生成随机有效的 VerificationJSON
      - 渲染为 Markdown 后提取章节标题，验证包含 5 个必需章节
      - `Feature: specforge-v2-efficiency, Property 7: template rendering structure`
      - **验证: 需求 3.3, 3.4, 3.5, 3.6**
    - **属性 9: work_log 合并完整性**
      - 使用 fast-check 生成随机 agent_content 和 trace 条目
      - 验证生成的 work_log 包含 "Agent 报告" 和 "执行统计" 两个章节
      - `Feature: specforge-v2-efficiency, Property 9: work log merge completeness`
      - **验证: 需求 5.2, 5.3, 8.5**

- [x] 3. 检查点 — 确保 Phase 1 核心工具正确
  - 运行 `vitest run` 确保所有测试通过（包括 263 个现有测试和新增测试），如有疑问请向用户确认。

- [x] 4. Phase 2：Gate 增强 — recordGateResult 工具函数（需求 4）
  - [x] 4.1 在 utils.ts 中实现 recordGateResult 函数
    - 在 `.opencode/tools/lib/utils.ts` 中新增 `GateResultEntry` 接口和 `recordGateResult` 函数
    - `GateResultEntry` 包含字段：type（"gate_result"）、timestamp（ISO8601）、work_item_id、gate、status、blocking_issues、warnings
    - `recordGateResult(workItemId, gateName, result, baseDir)` 函数：
      - 构造 gate_result 条目
      - 调用 `appendJsonl` 追加到 `specforge/runtime/events.jsonl`
      - 写入失败时记录错误到 `specforge/logs/error.log`，不抛出异常
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 4.2 更新 4 个 Gate 工具调用 recordGateResult
    - 修改 `.opencode/tools/sf_requirements_gate.ts`：在 `execute` 函数中，调用核心检查逻辑后、返回结果前，调用 `recordGateResult`
    - 修改 `.opencode/tools/sf_design_gate.ts`：同上模式
    - 修改 `.opencode/tools/sf_tasks_gate.ts`：同上模式
    - 修改 `.opencode/tools/sf_verification_gate.ts`：同上模式
    - 所有 Gate 工具继续返回与 V1 相同的 GateResult JSON 结构（向后兼容）
    - 导入路径：`import { recordGateResult } from "./lib/utils"`
    - _需求: 4.1, 4.5, 7.3_

  - [x]* 4.3 编写 Gate 结果记录单元测试
    - 创建 `tests/unit/tools/lib/gate_result_recording.test.ts`
    - 测试场景：
      - 正常记录 gate_result 到 events.jsonl（验证条目格式和字段完整性）
      - fail 状态时 blocking_issues 非空
      - pass 状态时 blocking_issues 为空
      - events.jsonl 写入失败时回退到 error.log（不阻塞工作流）
      - 条目包含 type、timestamp、work_item_id、gate、status、blocking_issues、warnings 字段
    - _需求: 4.2, 4.3, 4.4, 4.6_

  - [x]* 4.4 编写 Gate 结果记录属性测试
    - 在 `tests/unit/tools/lib/gate_result_recording.test.ts` 中新增属性测试
    - **属性 8: Gate 结果记录一致性**
      - 使用 fast-check 生成随机 gate 名称、status（pass/fail/blocked）和 blocking_issues
      - 验证：fail 时 blocking_issues 非空，pass 时 blocking_issues 为空
      - 验证条目结构包含所有必需字段
      - `Feature: specforge-v2-efficiency, Property 8: gate result logging consistency`
      - **验证: 需求 4.1, 4.2, 4.3, 4.4**

- [x] 5. Phase 2：Gate 增强 — sf_design_gate Design-First 支持（需求 6）
  - [x] 5.1 扩展 sf_design_gate_core.ts 支持 Design-First 工作流
    - 修改 `.opencode/tools/lib/sf_design_gate_core.ts`
    - 修改 `checkDesignGate` 函数签名，新增可选参数 `workflowType: string = "feature_spec"`
    - 当 workflowType 为 "feature_spec" 或 "bugfix_spec" 时，执行现有 V1 检查逻辑（检查需求引用，行为不变）
    - 当 workflowType 为 "feature_spec_design_first" 时，调用新函数 `checkDesignGateDesignFirst(content)`
    - 实现 `checkDesignGateDesignFirst(content)` 函数，检查：
      - 架构概述章节（匹配 "架构"、"Architecture"、"概述"、"Overview" 标题）
      - 模块或组件边界（匹配 "模块"、"组件"、"Module"、"Component"）
      - 数据模型或接口定义（匹配 "数据模型"、"接口"、"Data Model"、"Interface"）
    - 实现辅助函数：`hasArchitectureSection`、`hasModuleBoundaries`、`hasDataModelOrInterface`
    - 返回值始终符合 GateResult 结构（向后兼容）
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.6, 7.2_

  - [x] 5.2 更新 sf_design_gate.ts 工具入口
    - 修改 `.opencode/tools/sf_design_gate.ts`
    - 新增可选参数 `workflow_type`（字符串，Zod schema）
    - 将 `workflow_type` 透传给 `checkDesignGate` 函数
    - 不带 workflow_type 参数时默认为 "feature_spec"（V1 行为不变）
    - _需求: 6.1, 7.2_

  - [x]* 5.3 编写 sf_design_gate Design-First 单元测试
    - 扩展 `tests/unit/tools/sf_design_gate.test.ts`
    - 测试场景：
      - Design-First 模式：包含架构、模块、接口的 design.md → pass
      - Design-First 模式：缺少架构章节 → fail
      - Design-First 模式：缺少模块边界 → fail
      - Design-First 模式：缺少数据模型/接口 → fail
      - 默认模式（不传 workflow_type）：V1 行为不变
      - feature_spec 模式：检查需求引用（V1 行为不变）
      - bugfix_spec 模式：检查需求引用（V1 行为不变）
    - _需求: 6.2, 6.3, 6.4, 7.2_

  - [x]* 5.4 编写 sf_design_gate 属性测试
    - 在 `tests/unit/tools/sf_design_gate.test.ts` 中新增属性测试
    - **属性 10: design_gate 工作流类型分派正确性**
      - 使用 fast-check 生成随机 design.md 内容和 workflow_type
      - 验证：feature_spec/bugfix_spec 时检查需求引用，feature_spec_design_first 时跳过需求引用检查
      - 验证返回值始终符合 GateResult 结构
      - `Feature: specforge-v2-efficiency, Property 10: design gate workflow dispatch`
      - **验证: 需求 6.2, 6.3, 6.4, 6.6**

- [x] 6. 检查点 — 确保 Phase 2 Gate 增强正确
  - 运行 `vitest run` 确保所有测试通过（包括 263 个现有测试和新增测试），如有疑问请向用户确认。

- [x] 7. Phase 3：状态流转增强 — sf_state_transition 自动创建基础设施（需求 9）
  - [x] 7.1 扩展 sf_state_transition_core.ts 自动创建基础设施
    - 修改 `.opencode/tools/lib/sf_state_transition_core.ts`
    - 扩展 `TransitionSuccess` 类型，新增可选字段 `created_paths?: string[]`
    - 修改 `handleNewWorkItem` 函数，新增 `baseDir` 参数
    - 在创建新 Work Item 时（from_state=""）自动执行：
      - 创建 `specforge/specs/<work_item_id>/` 目录（mkdir recursive）
      - 创建 `specforge/specs/<work_item_id>/spec.json` 文件（包含 work_item_id、workflow_type、created_at）
      - 创建 `specforge/archive/agent_runs/` 基础目录（如不存在）
    - 返回值中包含 `created_paths` 数组
    - 目录已存在时不报错（mkdir recursive 静默成功）
    - 修改 `executeTransition` 函数，将 `baseDir` 传递给 `handleNewWorkItem`
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 7.2 编写 sf_state_transition 自动创建单元测试
    - 扩展 `tests/unit/tools/sf_state_transition.test.ts`
    - 测试场景：
      - 创建新 Work Item 时自动创建 spec 目录
      - 创建新 Work Item 时自动生成 spec.json（验证字段完整性）
      - 创建新 Work Item 时自动创建 archive/agent_runs 目录
      - 返回值包含 created_paths 数组
      - 目录已存在时不报错
      - 非创建场景（from_state 非空）不触发自动创建
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x]* 7.3 编写 sf_state_transition 属性测试
    - 在 `tests/unit/tools/sf_state_transition.test.ts` 中新增属性测试
    - **属性 11: 状态流转自动创建基础设施**
      - 使用 fast-check 生成随机 work_item_id
      - 验证 from_state="" 时自动创建 spec 目录、spec.json 和 archive 目录
      - 验证 spec.json 包含 work_item_id、workflow_type、created_at 字段
      - 验证返回值包含 created_paths 列表
      - `Feature: specforge-v2-efficiency, Property 11: state transition auto-creation`
      - **验证: 需求 9.1, 9.2, 9.3, 9.4**

- [x] 8. 检查点 — 确保 Phase 3 状态流转增强正确
  - 运行 `vitest run` 确保所有测试通过（包括 263 个现有测试和新增测试），如有疑问请向用户确认。

- [x] 9. Phase 4：回归验证 — 确保 263 个现有测试全部通过（需求 7）
  - [x] 9.1 运行完整测试套件验证向后兼容
    - 运行 `vitest run` 执行所有测试
    - 确认 263 个现有测试全部通过
    - 确认所有新增测试通过
    - 如有失败测试，修复相关代码（不修改现有测试文件）
    - 验证 sf_design_gate 不带 workflow_type 参数时默认为 "feature_spec" 行为
    - 验证 Gate 工具继续返回与 V1 相同的 GateResult JSON 结构
    - 验证 sf_artifact_write 不干扰 sf_permission_guard Plugin
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 10. Phase 5：Agent Prompt 更新 — sf-verifier 使用新工具（需求 2、需求 3、需求 8）
  - [x] 10.1 更新 sf-verifier.md 使用 sf_batch_verify 和 sf_artifact_write
    - 修改 `.opencode/agents/sf-verifier.md`
    - 在验证策略中新增 sf_batch_verify 使用指南：
      - 替代 Python 批量验证脚本，直接调用 sf_batch_verify 工具传入 target_file 和 checks 数组
      - 更新标准执行计划，将 "批量验证脚本" 步骤替换为 sf_batch_verify 调用
    - 在文件写入策略中新增 sf_artifact_write 使用指南：
      - 替代 Python 写文件方式，使用 sf_artifact_write 写入 verification_report.md
      - 支持 template=verification_report 模式，传入验证 JSON 自动渲染为 Markdown
      - 支持 file_type=work_log + agent_content 模式，自动合并 trace 统计
    - 更新 Required Output 章节：sf-verifier 返回验证 JSON 对象给 Orchestrator，而非直接写入 Markdown
    - 更新 toolcalls 预算：目标 ≤ 8 次（sf_batch_verify 1 次 + sf_artifact_write 1 次 + 读取文件 3-4 次）
    - _需求: 2.1, 3.1, 8.2, 8.3, 8.4_

  - [x] 10.2 更新 sf-orchestrator.md 使用 sf_artifact_write
    - 修改 `.opencode/agents/sf-orchestrator.md`
    - 在阶段 1（intake）中：
      - 使用 sf_artifact_write（file_type=intake）写入 intake.md，替代直接文件写入
      - 移除手动创建 spec 目录和 spec.json 的步骤（已由 sf_state_transition 自动创建，需求 9）
    - 在阶段 10（verification）中：
      - 收到 sf-verifier 返回的验证 JSON 后，调用 sf_artifact_write（template=verification_report）渲染并写入报告
    - 在 Agent Run Archive 协议中：
      - 使用 sf_artifact_write（file_type=work_log, agent_content=...）写入 work_log，替代子 Agent 自行 bash 写入
      - 使用 sf_artifact_write（file_type=agent_run_result）写入 result.json
    - _需求: 1.1, 3.1, 5.5, 8.4, 9.6_

  - [x] 10.3 更新 sf-orchestrator.md 传递 workflow_type 给 sf_design_gate
    - 修改 `.opencode/agents/sf-orchestrator.md`
    - 在阶段 5（design_gate）中：
      - 当工作流类型为 feature_spec_design_first 时，调用 sf_design_gate 传递 `workflow_type: "feature_spec_design_first"`
      - 当工作流类型为 feature_spec 或 bugfix_spec 时，不传递 workflow_type（使用默认值）
    - 在 Design-First 工作流执行协议的阶段 3（design_gate）中同步更新
    - _需求: 6.5_

  - [x] 10.4 更新 opencode.json 注册新工具
    - 修改 `opencode.json`
    - 确认 sf_batch_verify 和 sf_artifact_write 工具文件在 `.opencode/tools/` 目录下（OpenCode 自动发现）
    - 如需显式注册，在 opencode.json 中添加工具配置
    - 验证工具可被 Agent 正常调用
    - _需求: 1.1, 2.1_

- [x] 11. 最终检查点 — 确保所有变更完整且测试通过
  - 运行 `vitest run` 确保所有测试通过
  - 确认 263 个现有测试 + 所有新增测试全部通过
  - 确认所有新增文件已创建：
    - `.opencode/tools/sf_batch_verify.ts`
    - `.opencode/tools/lib/sf_batch_verify_core.ts`
    - `.opencode/tools/sf_artifact_write.ts`
    - `.opencode/tools/lib/sf_artifact_write_core.ts`
    - `tests/unit/tools/sf_batch_verify.test.ts`
    - `tests/unit/tools/sf_artifact_write.test.ts`
    - `tests/unit/tools/lib/gate_result_recording.test.ts`
  - 确认所有修改文件已更新：
    - `.opencode/tools/lib/utils.ts`（新增 recordGateResult）
    - `.opencode/tools/sf_requirements_gate.ts`（新增 recordGateResult 调用）
    - `.opencode/tools/sf_design_gate.ts`（新增 workflow_type + recordGateResult）
    - `.opencode/tools/sf_tasks_gate.ts`（新增 recordGateResult 调用）
    - `.opencode/tools/sf_verification_gate.ts`（新增 recordGateResult 调用）
    - `.opencode/tools/lib/sf_design_gate_core.ts`（新增 Design-First 检查）
    - `.opencode/tools/lib/sf_state_transition_core.ts`（新增自动创建基础设施）
    - `.opencode/agents/sf-verifier.md`（使用新工具）
    - `.opencode/agents/sf-orchestrator.md`（使用新工具 + workflow_type）
  - 如有疑问请向用户确认。

## 备注

- 标记 `*` 的子任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点确保增量验证，及时发现问题
- 属性测试验证设计文档中定义的 11 个正确性属性
- 单元测试验证具体场景和边界条件
- Phase 5 的 Agent Prompt 更新不涉及代码逻辑变更，仅修改 Markdown 指令文件
