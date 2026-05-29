# Work Log: WI-004 sf-task-planner

## 任务摘要

为 WI-004（SpecForge 工具裂缝修复）基于 design_delta.md 生成结构化的 tasks.md。本次变更是 change_request 工作流，修复 3 条裂缝（#7/#8、#4）+ 1 条新增发现（verification gate 同类 bug），排除 #3（独立子 WI）。

## 执行过程

1. **加载 skill**: 加载 `superpowers-writing-plans` skill，获取任务计划模板要求
2. **读取输入文件**: 
   - `design_delta.md` — 4 个 DD（DD-1 ~ DD-4，DD-4 不在本 WI）
   - `impact_analysis.md` — 影响分析，确定修复范围
   - `intake.md` — 变更范围和约束
3. **验证源代码现状**:
   - `sf-design-gate.ts` handler L13 确认 `args['gate_mode']` bug 存在
   - `sf-verification-gate.ts` handler L12 确认同类 bug 存在
   - `sf-requirements-gate.ts` handler L12-13 确认正确模式（双读 `args['mode']` + `args['gate_mode']`）
4. **验证测试基础设施**:
   - `gate_mode.test.ts` — 已有全 mode pass/fail 测试（直接调 core 函数，绕过 handler 层）
   - `gate_mode.property.test.ts` — 属性测试
   - `v36_backward_compat.test.ts` — 向后兼容回归测试
   - vitest.config.ts — 根配置覆盖 `tests/**/*.test.ts`
   - daemon-core 有独立 vitest.config.ts 和 tests/ 目录
5. **验证部署态工具**: 
   - `.opencode-\tools\sf_design_gate.ts` — MCP 参数名是 `mode`，通过 daemon 透传 args
   - `.opencode-\tools\sf_verification_gate.ts` — 同上
6. **验证 Skill 文档**: 确认 8 个 SKILL.md 文件路径存在，理解产物模板结构
7. **编写 tasks.md**: 基于分析结果，生成 4 个串行任务

## 遇到的问题

- handler 层测试挑战：现有 gate_mode.test.ts 直接调用 core 函数，不经过 handler 层。为此，TASK-1 和 TASK-2 的 verification_commands 同时包含 grep 验证（确认修复到位）和现有回归测试（确认无副作用）。
- 部署态工具路径含特殊字符（`.opencode-\`）：Windows 路径中 `\` 需注意，但 grep 命令可正常工作。

## 最终结论

生成 tasks.md 包含 4 个任务，串行执行：
1. TASK-1: 修复 sf-design-gate handler（DD-1，1 行代码 + 验证）
2. TASK-2: 修复 sf-verification-gate handler（DD-2，1 行代码 + 验证）
3. TASK-3: 更新 8 个 Skill 文档 H2 intro 约束（DD-3，8 个文档）
4. TASK-4: 全量回归测试（确认所有 Gate 测试通过）

预估总修改量：2 行代码 + 8 个文档各追加约 15 行 = 约 122 行。

## 工具调用统计

- read: 16 次（源码、测试、配置、Skill 文档）
- glob: 8 次（文件搜索）
- grep: 2 次（Skill 文档内容搜索）
- write: 2 次（work_log.md + tasks.md）
