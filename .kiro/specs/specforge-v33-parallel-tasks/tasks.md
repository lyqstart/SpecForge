# 实施计划：SpecForge V3.3 并行任务控制

## 概述

本实施计划将 V3.3 并行任务调度能力分为 6 个顶层任务，按风险和依赖关系排序：先更新最低风险的配置文件，再更新 4 个 Workflow Skill 的 development 阶段，然后更新 sf-orchestrator.md 路由层，接着更新 AGENTS.md 文档，最后运行回归测试和最终检查点。

所有变更均为 Markdown 文件和 JSON 配置文件的修改，不涉及任何 TypeScript 代码变更。

## 任务

- [x] 1. 更新 project.json 配置文件
  - [x] 1.1 在 `specforge/config/project.json` 中新增 `max_parallel_executors` 字段
    - 在现有 JSON 对象中添加 `"max_parallel_executors": 3`
    - 保持现有字段（name、version、description）不变
    - 确保 JSON 格式合法
    - _需求: 2.2_

- [x] 2. 更新 4 个 Workflow Skill 的 development 阶段
  - [x] 2.1 更新 `sf-workflow-feature-spec` 的 development 阶段
    - 修改文件：`.opencode/skills/sf-workflow-feature-spec/SKILL.md`
    - 将阶段 8（development）的执行步骤替换为设计文档 3.1 节定义的并行调度协议
    - 包含完整的 6 个 Step：读取 tasks.md 和配置 → Independence_Analysis → 生成 Execution_Plan → 向用户展示计划 → 按计划执行（并行/串行/Serial_Fallback）→ development 阶段完成
    - 并行批次执行部分：在同一条 assistant 消息中为批次内所有 Task 各发起一个 `task` 工具调用
    - 串行 Task 和 Serial_Fallback 部分：按 V3.2 串行协议执行
    - development 完成后流转到 review（feature-spec 特有）
    - 确保 development 阶段以外的所有阶段（阶段 1-7、阶段 9-11）保持不变
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.5, 6.6, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4_

  - [x] 2.2 更新 `sf-workflow-bugfix-spec` 的 development 阶段
    - 修改文件：`.opencode/skills/sf-workflow-bugfix-spec/SKILL.md`
    - 将阶段 8（development）的执行步骤替换为与 2.1 相同的并行调度协议
    - 差异点：executor 加载 `superpowers-tdd` Skill；development 完成后流转到 verification（无 review 阶段）
    - 保留"先编写回归测试再修复代码"的指令
    - 确保 development 阶段以外的所有阶段保持不变
    - _需求: 6.2, 6.5, 6.6_

  - [x] 2.3 更新 `sf-workflow-design-first` 的 development 阶段
    - 修改文件：`.opencode/skills/sf-workflow-design-first/SKILL.md`
    - 将阶段 8（development）的执行步骤替换为与 2.1 完全一致的并行调度协议
    - development 完成后流转到 review（与 feature-spec 一致）
    - 确保 development 阶段以外的所有阶段保持不变
    - _需求: 6.3, 6.5, 6.6_

  - [x] 2.4 更新 `sf-workflow-quick-change` 的 development 阶段
    - 修改文件：`.opencode/skills/sf-workflow-quick-change/SKILL.md`
    - 将阶段 3（development）的执行步骤替换为并行调度协议
    - 差异点：保留升级条件检查（修改文件 > 5 时触发升级建议）；development 完成后流转到 verification（无 review 阶段）
    - 确保 development 阶段以外的所有阶段（阶段 1-2、阶段 4-5）保持不变
    - _需求: 6.4, 6.5, 6.6_

- [x] 3. 检查点 — 确认 4 个 Workflow Skill 更新正确
  - 确认 4 个 Skill 的 development 阶段都包含 Independence_Analysis、Execution_Plan、并行批次执行、Serial_Fallback 等关键内容
  - 确认 4 个 Skill 的 development 阶段以外的所有阶段未被修改
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 4. 更新 sf-orchestrator.md 路由层
  - [x] 4.1 在 sf-orchestrator.md 的"失败重试协议"章节中新增"并行失败重试协议"子章节
    - 修改文件：`.opencode/agents/sf-orchestrator.md`
    - 新增内容按设计文档 3.2.1 节定义：失败 Task 移出并行批次 → 串行重试（executor 2 次 + debugger 1 次）→ 不阻塞后续批次 → 重试成功/耗尽处理 → 用户选择继续或停止
    - 确保现有的"Executor 失败重试"和"Review Repair Loop"内容不变
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 6.7_

  - [x] 4.2 在 sf-orchestrator.md 的"Agent Run Archive 协议"章节中新增"并行 Archive 协议"子章节
    - 修改文件：`.opencode/agents/sf-orchestrator.md`
    - 新增内容按设计文档 3.2.2 节定义：独立 run_id → 独立 archive_path → 逐个归档 → result.json 新增 parallel_batch 和 parallel_peers 字段
    - 确保现有的 run_id 生成规则、归档创建流程、archive_path 传递协议内容不变
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 5. 更新 AGENTS.md 文档
  - [x] 5.1 更新 AGENTS.md 中 development 阶段的说明和失败重试策略
    - 修改文件：`AGENTS.md`
    - 在"4.2 各阶段说明"表格中，更新 development 阶段的说明以反映并行调度能力
    - 在"4.4 失败重试策略"中新增并行失败重试说明
    - _需求: 7.8, 8.1_

  - [x] 5.2 在 AGENTS.md 中新增"8. 并行任务调度（V3.3 新增）"章节
    - 修改文件：`AGENTS.md`
    - 包含：Independence_Analysis 说明、Execution_Plan 生成规则、并行调度协议概述、配置项说明（`max_parallel_executors`）
    - _需求: 7.8, 8.1, 8.2, 8.3, 8.4_

- [x] 6. 回归测试与最终检查点
  - [x] 6.1 运行全部 424 个单元测试确认通过
    - 执行 `bun test`，确认 424 个测试全部通过，0 个失败
    - _需求: 7.3_

  - [x] 6.2 兼容性验证 — 确认不变文件未被修改
    - 确认 `opencode.json` 未修改
    - 确认 7 个子 Agent prompt 文件（sf-requirements.md、sf-design.md、sf-task-planner.md、sf-executor.md、sf-debugger.md、sf-reviewer.md、sf-verifier.md）未修改
    - 确认 12 个 Custom Tool 文件和 5 个 Plugin 文件未修改
    - 确认 7 个 superpowers-* Skill 未修改
    - _需求: 7.3, 7.4, 7.5, 7.6_

  - [x] 6.3 最终检查点
    - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 本项目为纯 Prompt 变更，不涉及 TypeScript 代码修改
- 不需要属性测试（PBT）——设计文档无"正确性属性"章节
- 不需要新增单元测试——现有 424 个测试覆盖的是 Tool/Plugin 代码，不受 prompt 变更影响
- 集成测试为手动执行，不在本任务列表中
- 4 个 Workflow Skill 的 development 阶段使用设计文档 3.1 节定义的同一套并行调度协议
- 每个任务引用具体的需求编号以确保可追溯性
