# 实现计划：SpecForge V3.7 — 验证策略

## 概述

本计划实现 V3.7 验证策略功能，涵盖共享类型、解析器模块、Gate 修改、sf-verifier 执行策略、属性测试和回归测试。实现遵循分层方法：首先是基础类型和解析器，然后是 Gate 逻辑修改，接着是执行策略，最后是全面的属性测试和回归测试。

## 任务

- [x] 1. 共享类型和解析器模块
  - [x] 1.1 创建 `sf_gate_types.ts` 共享 GateResult 接口
    - 创建 `.opencode/tools/lib/sf_gate_types.ts`，包含 `GateResult` 接口（含可选字段 `details?: Record<string, unknown>`）和 `SyncSummary` 类型
    - 在 `sf_requirements_gate_core.ts` 中添加向后兼容的重导出：`export type { GateResult, SyncSummary } from "./sf_gate_types"`
    - 更新所有 Gate 核心模块，从 `sf_gate_types.ts` 导入而非 `sf_requirements_gate_core.ts`
    - _需求：REQ-8 AC-5_

  - [x] 1.2 创建 `sf_verification_types.ts` V3.7 类型定义
    - 按 DD-1 创建 `.opencode/tools/lib/sf_verification_types.ts`
    - 实现 `VerificationType` 联合类型和 `VALID_VERIFICATION_TYPES` 常量
    - 实现 `isValidVerificationType()` 和 `normalizeVerificationType()` 函数
    - 按 DD-3 实现 `ParseVerificationStrategyResult` 接口和 `parseAllVerificationStrategies()` / `parseVerificationStrategyField()` 函数
    - 实现所有类型接口：`TypedVerificationCommands`、`ParsedTaskVerification`、`VerificationReport`、`VerificationCommandRecord`、`TypeResults`、`VerificationGateDetails`
    - _需求：REQ-1 AC-1、REQ-1 AC-2、REQ-7 AC-6、REQ-7 AC-8_

  - [x] 1.3 创建 `sf_markdown_verification_parser.ts` 解析器模块
    - 按 DD-4 创建 `.opencode/tools/lib/sf_markdown_verification_parser.ts`
    - 实现 `parseTaskVerification()`，支持两层格式识别（typed 与 legacy）
    - 实现 `parseTypedCommandBlock()`，含 `invalidTypedKeys` 检测（针对非法键如 `smoke:`）
    - 实现 `extractFieldSection()` 和 `parseStringList()` 辅助函数
    - 支持所有格式变体：`- unit:` 前缀、无破折号的 `unit:`、类型键下的多行命令、内联 `key: \`command\`` 格式
    - 确保 `manual_verification_checks` 字段解析和 `refs` 字段提取
    - _需求：REQ-3 AC-1、REQ-3 AC-2、REQ-3 AC-3、REQ-3 AC-4、REQ-3 AC-5_

  - [x]* 1.4 编写 `sf_verification_types.ts` 单元测试
    - 测试 `isValidVerificationType`：合法类型 → true，非法 → false，大小写不敏感
    - 测试 `normalizeVerificationType`：合法 → 小写，非法 → null
    - 测试 `parseVerificationStrategyField`：方括号格式 `[unit, property]`、逗号分隔、单值、空列表 → 错误、无分隔符多值 → 错误、重复 → 警告、混合大小写 → 标准化
    - 测试 `parseAllVerificationStrategies`：多个 REQ 段落、REQ 无 strategy → null（非错误）
    - _需求：REQ-9 AC-4_

  - [x]* 1.5 编写 `sf_markdown_verification_parser.ts` 单元测试
    - 测试格式检测：`- unit:` 前缀 → typed、无破折号 `unit:` → typed、仅反引号行 → legacy、空 → empty
    - 测试多行命令：类型键后跟缩进命令列表
    - 测试非法 typed 键：`smoke:` → 记录到 `invalidTypedKeys`，格式仍为 "typed"（不回退到 legacy）
    - 测试 legacy 反引号命令：无类型前缀的 `` `bun test ...` `` 行
    - 测试空 `verification_commands` 段落 → 格式为 "empty"
    - 测试 `manual_verification_checks` 与 `verification_commands` 共存
    - 测试 `refs` 字段提取：`[REQ-1, REQ-3, CP-2]` 解析
    - _需求：REQ-9 AC-2、REQ-9 AC-5_

- [x] 2. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 3. Gate 修改 — sf_requirements_gate
  - [x] 3.1 修改 `sf_requirements_gate_core.ts` 添加 verification_strategy 验证
    - 从 `sf_verification_types.ts` 导入 `parseAllVerificationStrategies`
    - 在现有检查（用户故事、验收标准、术语表）之后，添加 V3.7 verification_strategy 合法性检查
    - 对每个含 `verification_strategy` 的 REQ：错误 → blocking_issue（fail），警告 → 非阻塞警告
    - 确保未声明 `verification_strategy` → pass（不强制要求）
    - 从新的 `sf_gate_types.ts` 导入 `GateResult`
    - _需求：REQ-7 AC-1、REQ-7 AC-2、REQ-7 AC-3、REQ-7 AC-4、REQ-7 AC-5、REQ-7 AC-7_

  - [x]* 3.2 编写 sf_requirements_gate V3.7 变更的单元测试
    - 合法值（单类型、多类型、全部 5 种类型）→ pass
    - 非法值（拼写错误 `fast-check`、未知类型）→ fail
    - 空列表 `[]` → fail
    - 格式错误（`unit property` 无分隔符）→ fail
    - 重复值 `[unit, unit]` → pass + 警告（已去重）
    - 混合大小写（`Unit`、`PROPERTY`）→ pass，标准化为小写
    - 未声明 `verification_strategy` → pass
    - requirements.md 缺失 → fail 并给出明确原因
    - _需求：REQ-9 AC-4_

- [x] 4. Gate 修改 — sf_design_gate
  - [x] 4.1 修改 `sf_design_gate_core.ts` 添加 test_type 验证
    - 从 `sf_verification_types.ts` 导入 `isValidVerificationType`
    - 按 DD-8 实现 `extractCPTestTypes()` 函数
    - 在默认模式的现有检查之后，验证每个 CP 的 `test_type` 字段：非法值 → blocking_issue（fail）
    - `test_file` 缺失 → pass（可选字段）
    - `requirement_ref` 引用不存在的 REQ-N → 警告（不做跨文件验证）
    - 从 `sf_gate_types.ts` 导入 `GateResult`
    - _需求：REQ-2 AC-4、REQ-2 AC-7_

  - [x]* 4.2 编写 sf_design_gate V3.7 变更的单元测试
    - 合法 `test_type` 值（unit、property、integration、e2e、regression）→ pass
    - 非法 `test_type` 值（如 `fast-check`）→ fail
    - `test_file` 缺失（可选）→ pass
    - `requirement_ref` 引用不存在的 REQ-N → 警告（非 fail）
    - 完全没有 CP 段落 → pass（不触发新检查）
    - _需求：REQ-9 AC-8_

- [x] 5. Gate 修改 — sf_tasks_gate
  - [x] 5.1 修改 `sf_tasks_gate_core.ts` 添加 typed verification_commands 和交叉验证
    - 从 `sf_markdown_verification_parser.ts` 导入 `parseTaskVerification`
    - 从 `sf_verification_types.ts` 导入 `parseAllVerificationStrategies`、`isValidVerificationType`、`normalizeVerificationType`
    - 从 `sf_gate_types.ts` 导入 `GateResult`
    - 读取 `requirements.md` 和 `design.md` 用于交叉验证上下文
    - 对 legacy 格式任务：pass/fail 与 V3.6 行为不变，添加非阻塞迁移警告
    - 对 typed 格式任务：验证类型键合法性（含 `invalidTypedKeys`），然后按 DD-5 执行交叉验证（场景 A–E）
    - 实现 `crossValidateTask()` 函数，覆盖全部 5 个场景
    - 实现 `extractCPTestFile()` 用于 property 命令路径一致性检查（警告级别）
    - _需求：REQ-3 AC-6、REQ-3 AC-7、REQ-3 AC-8、REQ-3 AC-9、REQ-3 AC-10_

  - [x]* 5.2 编写 sf_tasks_gate V3.7 变更的单元测试
    - 合法 typed 格式 → pass
    - Legacy 格式（扁平列表）→ pass + 警告（pass/fail 与 V3.6 一致）
    - 非法类型键（如 `smoke:`）→ fail
    - 混合格式（部分 typed、部分 legacy）→ typed 部分检查，legacy 部分 V3.6 行为，+ 警告
    - Typed 任务缺少 `refs` → fail，blocking_issue 包含 task_id
    - Typed 任务有 property 命令但 refs 中无 CP-N → fail，blocking_issue 包含 task_id
    - refs 指向含 `verification_strategy: [property]` 的 REQ 但 typed 命令缺少 `property` 键 → fail
    - refs 指向无 `verification_strategy` 的 REQ → 忽略（不贡献 Declared_Required_Types）
    - 多个 REQ 含不同策略 → 使用并集作为 Declared_Required_Types
    - _需求：REQ-9 AC-5_

- [x] 6. Gate 修改 — sf_verification_gate
  - [x] 6.1 修改 `sf_verification_gate_core.ts` 添加 typed 验证检查
    - 从 `sf_markdown_verification_parser.ts` 导入 `parseTaskVerification`
    - 从 `sf_verification_types.ts` 导入类型和函数
    - 从 `sf_gate_types.ts` 导入 `GateResult`
    - 按 DD-6 实现 `derivePlannedVerificationTypes()`
    - 按 DD-6 实现 `checkTypedVerificationResults()`，输出 `details.type_results`
    - 按 DD-6 实现 `detectPropertyTestResultFromStdout()` fast-check 回退逻辑
    - 实现 `mergeGateResults()` 用于混合格式处理
    - 实现 `checkLegacyVerificationFromMarkdown()` 用于混合格式的 legacy 部分
    - 添加 `required_types` 可选参数支持（覆盖 Planned_Verification_Types）
    - 优先级：`required_types` 参数 > Planned_Verification_Types > V3.6 回退
    - 首先读取 `verification_report.json`；缺失 → V3.6 回退；格式错误/不完整 → fail（不回退）
    - _需求：REQ-5 AC-1、REQ-5 AC-2、REQ-5 AC-3、REQ-5 AC-4、REQ-5 AC-5、REQ-5 AC-6、REQ-5 AC-7、REQ-5 AC-8、REQ-5 AC-9_

  - [x]* 6.2 编写 sf_verification_gate V3.7 变更的单元测试
    - 所有 Planned_Verification_Types 通过 → pass
    - 部分 Planned_Verification_Types 缺失 → fail + 具体缺失类型在 `details.type_results` 中
    - Legacy 格式 tasks.md → 回退到 V3.6 行为
    - 混合格式 tasks.md → typed 部分按类型检查，legacy 部分 V3.6，+ 非阻塞警告
    - 提供 `required_types` 参数 → 无论 tasks.md 格式如何都按类型检查；缺失类型 → fail
    - 格式错误的 JSON（解析错误）→ gate fail，不回退 V3.6
    - 报告 `status != "completed"` → fail，blocking_issue 包含 "incomplete"
    - 混合格式：typed 通过 + legacy 失败 → 最终 fail
    - 混合格式：typed 失败 + legacy 通过 → 最终 fail
    - `details.type_results` 嵌套在 `details` 下，非顶层
    - _需求：REQ-9 AC-6、REQ-9 AC-11_

  - [x]* 6.3 编写基于 fixture 的 fast-check stdout 回退单元测试
    - fast-check 通过输出（`• 100 passed`）→ "passed"
    - fast-check 失败输出（`Counterexample found`）→ "failed"
    - 正常 bun test 通过输出 → "passed"（不被误识别为 fast-check）
    - 异常/空输出 → "unknown"，不 fail
    - `shrunk N time` 模式 → "failed"
    - _需求：REQ-9 AC-10_

- [x] 7. Gate 修改 — sf_doc_lint
  - [x] 7.1 修改 `sf_doc_lint_core.ts` 添加 typed verification_commands 验证
    - 从 `sf_markdown_verification_parser.ts` 导入 `parseTaskVerification`
    - 从 `sf_verification_types.ts` 导入 `isValidVerificationType`
    - 在 `lintTasks` 函数中：对 typed 格式，验证类型键合法性（与 sf_tasks_gate 一致）
    - **必须包含 `invalidTypedKeys` 检查**：遍历 `taskVerification.invalidTypedKeys` 并将每个报告为严重级别 "error"
    - 对 legacy 格式：pass + 非阻塞警告（与 sf_tasks_gate 消息一致）
    - 对 `manual_verification_checks` 字段：接受，仅验证结构（必须为字符串列表）
    - _需求：REQ-3 AC-8、REQ-8 AC-6_

  - [x]* 7.2 编写 sf_doc_lint V3.7 变更的单元测试
    - 合法 typed 格式 → pass（无错误）
    - Legacy 格式 → pass + 警告（与 sf_tasks_gate 一致）
    - 非法类型键（如 `smoke:`）→ error
    - 检测到 `invalidTypedKeys` → 每个非法键报 error
    - 存在 `manual_verification_checks` 字段 → pass（无错误）
    - 空 `verification_commands` → error
    - _需求：REQ-9 AC-9_

- [x] 8. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 9. sf-verifier 执行策略
  - [x] 9.1 实现 sf-verifier 全量收集执行和结构化报告生成
    - 修改 `.opencode/agents/sf-verifier.md` 以记录 V3.7 执行协议
    - 实现 `cleanupStaleReports()`：在任何命令运行之前，首先删除已有的 `verification_report.json` 和 `verification_report.md`；如果出现非 ENOENT 错误，停止并报告失败
    - 实现全量收集策略：命令失败（exit_code != 0）时记录 `status="failed"` 并继续；命令无法启动时记录 `status="skipped"` 并附带 stderr 原因
    - 实现双输出：同时生成 `verification_report.json`（结构化）和 `verification_report.md`（V3.6 兼容）
    - 实现原子写入：先写入临时文件，再重命名为最终路径；仅在重命名成功后报告 `status="completed"`
    - 对 typed 命令：在 `VerificationCommandRecord` 中记录 `type` 字段
    - 对 legacy 命令：在 `VerificationCommandRecord` 中省略 `type` 字段
    - 完全跳过 `manual_verification_checks` 条目（不执行、不记录）
    - _需求：REQ-6 AC-1、REQ-6 AC-2、REQ-6 AC-3、REQ-6 AC-4、REQ-6 AC-5、REQ-6 AC-6、REQ-6 AC-7、REQ-6 AC-8、REQ-6 AC-9_

  - [x]* 9.2 编写 sf-verifier V3.7 执行的集成测试
    - Typed 任务命令 → 报告记录含正确 `type` 字段
    - Legacy 任务命令 → 报告记录无 `type` 字段
    - `manual_verification_checks` 条目 → 不在报告中
    - 混合格式任务 → typed 命令有 `type`，legacy 命令无，共存于同一 `commands` 数组
    - 命令失败（exit_code != 0）→ `status="failed"`，后续命令仍执行（全量收集）
    - 命令无法启动 → `status="skipped"`，stderr 包含原因
    - 正常完成 → `status="completed"`、`schema_version="1.0"`、`work_item_id` 正确
    - 同时生成 `verification_report.json` 和 `verification_report.md`
    - sf_verification_gate 读取 `status != "completed"` → fail，blocking_issue 包含 "incomplete"
    - 过期报告清理：执行开始前删除旧报告
    - _需求：REQ-9 AC-12_

- [x] 10. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 11. 属性测试（fast-check）
  - [x]* 11.1 编写 verification_strategy 解析的属性测试（属性 1–4）
    - **属性 1：verification_strategy 往返一致性** — 对任意合法 verification_strategy 值（VerificationType 的非空子集），序列化为 Markdown 后再解析回来产生等价类型集（顺序无关、去重、小写）
    - **验证：REQ-1 AC-1、REQ-9 AC-1**
    - **属性 2：verification_strategy 合法性不变量** — 对任意 requirements.md 内容，若所有 verification_strategy 值为合法非空子集 → sf_requirements_gate 通过；若任一包含非法值或空列表 → 失败
    - **验证：REQ-1 AC-2、REQ-7 AC-2、REQ-7 AC-3、REQ-9 AC-1**
    - **属性 3：verification_strategy 大小写标准化** — 对任意混合大小写的合法 VerificationType 值，sf_requirements_gate 通过且解析值全为小写
    - **验证：REQ-7 AC-6**
    - **属性 4：verification_strategy 重复处理** — 对任意含重复值的 verification_strategy，sf_requirements_gate 通过（非 fail），去重，并产生警告
    - **验证：REQ-7 AC-9**
    - 测试文件：`tests/property/verification_strategy.property.test.ts`

  - [x]* 11.2 编写 typed 命令验证的属性测试（属性 5–9）
    - **属性 5：typed verification_commands 类型键合法性** — 对任意 tasks.md，若所有 typed 键为合法 VerificationType → sf_tasks_gate 通过类型键检查；若任一键非法 → 失败
    - **验证：REQ-3 AC-2、REQ-3 AC-7、REQ-9 AC-2**
    - **属性 6：legacy 格式向后兼容（sf_tasks_gate）** — 对任意 legacy 格式 tasks.md，sf_tasks_gate pass/fail 与 V3.6 完全一致，仅添加非阻塞警告
    - **验证：REQ-3 AC-6、REQ-8 AC-2**
    - **属性 7：typed 任务 refs 强制要求** — 对任意无 refs 的 typed 任务，sf_tasks_gate 失败且 blocking_issue 包含 task_id
    - **验证：REQ-3 AC-5、REQ-3 AC-9 场景 A**
    - **属性 8：交叉验证覆盖** — 对任意 typed 任务，Declared_Required_Types（引用 REQ 策略的并集）必须为 Planned_Verification_Types 的子集；否则 → 失败并列出缺失类型
    - **验证：REQ-3 AC-9 场景 B/C/D**
    - **属性 9：property 命令 CP-N 可追溯性** — 对任意含 property typed 命令但 refs 中无 CP-N 的任务 → sf_tasks_gate 失败
    - **验证：REQ-3 AC-9 场景 E**
    - 测试文件：`tests/property/typed_commands.property.test.ts`

  - [x]* 11.3 编写设计 Gate 的属性测试（属性 10）
    - **属性 10：design.md test_type 合法性** — 对任意 design.md，若所有 CP test_type 值为合法 VerificationType → sf_design_gate 通过；若任一非法 → 失败
    - **验证：REQ-2 AC-2、REQ-2 AC-4、REQ-9 AC-8**
    - 测试文件：`tests/property/design_gate.property.test.ts`

  - [x]* 11.4 编写验证 Gate 的属性测试（属性 11–14）
    - **属性 11：Planned_Verification_Types 推导正确性** — 对任意 tasks.md，推导的 Planned_Verification_Types 等于所有 typed 任务类型键的并集；全为 legacy → null（V3.6 回退）
    - **验证：REQ-5 AC-1**
    - **属性 12：按类型检查不变量** — 对任意 Planned_Verification_Types 集合和 VerificationReport，若所有类型有通过记录 → pass；若任一类型缺失 → fail 并给出正确 type_results
    - **验证：REQ-5 AC-2、REQ-5 AC-3、REQ-9 AC-3**
    - **属性 13：required_types 参数覆盖** — 对任意含 required_types 的 sf_verification_gate 调用，gate 按 required_types 检查而不管 tasks.md 格式；缺失类型 → fail
    - **验证：REQ-5 AC-7、REQ-5 AC-9**
    - **属性 14：details.type_results 字段位置不变量** — 对任意 sf_verification_gate GateResult，type_results 嵌套在 details 下，从不在顶层；忽略 details 不影响现有调用方
    - **验证：REQ-5 AC-4、REQ-8 AC-5、REQ-9 AC-11**
    - 测试文件：`tests/property/verification_gate.property.test.ts`

  - [x]* 11.5 编写 sf-verifier 和混合格式的属性测试（属性 15–20）
    - **属性 15：Verification_Report 类型保真度** — 对任意含 typed/legacy/manual_checks 的 tasks.md，报告中 typed 有正确 type 字段，legacy 无 type，manual_checks 条目不出现
    - **验证：REQ-6 AC-2、REQ-6 AC-3、REQ-6 AC-4、REQ-9 AC-12**
    - **属性 16：全量收集执行策略** — 对任意含失败命令的 tasks.md，sf-verifier 尝试所有命令；每个都有记录；无提前终止
    - **验证：REQ-6 AC-8、REQ-9 AC-12**
    - **属性 17：legacy sf_verification_gate 回退** — 对任意全 legacy 的 tasks.md，sf_verification_gate 行为与 V3.6 完全一致
    - **验证：REQ-5 AC-5、REQ-8 AC-3**
    - **属性 18：格式错误 JSON 不回退** — 对任意已存在但格式错误/不完整的 verification_report.json，sf_verification_gate 失败且不回退 V3.6
    - **验证：REQ-6 报告完整性处理**
    - **属性 19：混合格式结果合并** — 对任意混合格式 tasks.md，typed 通过 + legacy 失败 → 最终 fail；typed 失败 + legacy 通过 → 最终 fail；blocked > fail > pass
    - **验证：REQ-5 AC-6**
    - **属性 20a：cleanupStaleReports 删除保证** — 对任意含旧报告的 specDir，清理成功后两个文件均不存在
    - **属性 20b：清理失败阻止验证** — 对任意非 ENOENT 的 unlink 错误，sf-verifier 在执行命令前停止
    - **验证：REQ-6 AC-9**
    - 测试文件：`tests/property/verification_gate.property.test.ts`

- [x] 12. 检查点 - 确保所有属性测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 13. 回归测试和文档
  - [x]* 13.1 编写向后兼容回归测试
    - 现有 tasks.md（legacy 格式）通过 sf_tasks_gate 无错误，pass/fail 与 V3.6 一致
    - 现有 requirements.md（无 verification_strategy）通过 sf_requirements_gate 无错误
    - 现有 sf_verification_gate 对 legacy 格式行为不变
    - 现有 8 种工作流（feature_spec、bugfix_spec、feature_spec_design_first、quick_change、change_request、refactor、ops_task、investigation）行为不变
    - GateResult 接口向后兼容：忽略 `details` 字段的现有调用方正常工作
    - 测试文件：`tests/regression/backward_compat.test.ts`
    - _需求：REQ-8 AC-1、REQ-8 AC-2、REQ-8 AC-3、REQ-8 AC-4、REQ-8 AC-5、REQ-8 AC-6、REQ-9 AC-7_

  - [x] 13.2 更新 AGENTS.md 文档
    - 添加 V3.7 验证策略章节，记录新功能
    - 记录 `sf_gate_types.ts` 为新的共享类型文件
    - 记录 `sf_verification_types.ts` 为新的 V3.7 类型定义文件
    - 记录 `sf_markdown_verification_parser.ts` 为新的解析器模块
    - 更新 sf-verifier 描述，提及结构化 JSON 报告生成
    - 记录 `verification_report.json` 的 schema 和原子写入行为
    - _需求：REQ-6 AC-5_

- [x] 14. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选，可跳过以加速 MVP
- 每个任务引用具体需求以实现可追溯性
- 检查点确保增量验证
- 属性测试验证通用正确性属性（使用 fast-check 的 20 个属性）
- 单元测试验证具体示例和边界情况
- 实现顺序：共享类型 → 解析器 → Gate → 验证器 → 属性测试 → 回归
- DD-10 sf_doc_lint 必须包含 `invalidTypedKeys` 检查（在任务 7.1 中明确指出）
- `cleanupStaleReports` 必须是 sf-verifier 执行的第一步（在任何命令运行之前）
- typed 格式中的所有 `verification_commands` 必须是可执行的 shell 命令（不可混入人类可读检查项）

## 任务依赖图

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5"] },
    { "id": 3, "tasks": ["3.1", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 4, "tasks": ["3.2", "4.2", "5.2", "6.2", "6.3", "7.2"] },
    { "id": 5, "tasks": ["9.1"] },
    { "id": 6, "tasks": ["9.2"] },
    { "id": 7, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 8, "tasks": ["13.1", "13.2"] }
  ]
}
```