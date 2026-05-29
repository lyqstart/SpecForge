# WI-004 Tasks: SpecForge 工具裂缝修复

## 任务列表

本文件将 design_delta.md 中的 4 个设计决策拆分为 4 个可执行任务。全部采用串行执行（低成本优先），TASK-1 和 TASK-2 为代码修复（各 1 行），TASK-3 为 Skill 文档更新，TASK-4 为全量回归验证。

---

### TASK-1: 修复 sf-design-gate handler 参数名不匹配（DD-1）

**context_block**（executor 必读）：

- **What**: 修改 `sf-design-gate.ts` 第 13 行，将 `args['gate_mode']` 改为双读模式 `(args['mode'] || args['gate_mode'])`
- **Why**: MCP 工具定义的参数名是 `mode`，但 handler 读取的是 `args['gate_mode']`，导致 mode 参数被静默忽略。这是裂缝 #7（硬编码 design.md）和 #8（mode-blind 需求引用）的共同根因
- **Refs**: DD-1, impact_analysis §裂缝 #7/#8, WI-002 findings_report §7.2.7/7.2.8
- **Constraints**:
  - 采用双读模式（与 `sf-requirements-gate.ts` L12-13 保持一致），确保向后兼容
  - 不修改 `sf_design_gate_core.ts`，core 逻辑已正确
  - 遵守 TypeScript strict mode
  - 修改仅限 1 行（L13）
- **Done When**:
  - `sf_design_gate(mode="investigation")` 检查 `findings_report.md`（非 `design.md`）
  - `sf_design_gate(mode="investigation")` 不执行需求引用检查
  - `sf_design_gate()` 无 mode 时默认行为不变（向后兼容）

**执行步骤**：

1. 打开 `packages/daemon-core/src/tools/handlers/sf-design-gate.ts`，定位到第 13 行
2. 将 `const gateMode = args['gate_mode'] as string | undefined;` 改为 `const gateMode = (args['mode'] as string | undefined) || (args['gate_mode'] as string | undefined);`
3. 保存文件

- **依赖**: 无
- refs: [DD-1, #7, #8]
- files: [packages/daemon-core/src/tools/handlers/sf-design-gate.ts]
- **verification_commands**:
  - `npx vitest run tests/unit/tools/lib/gate_mode.test.ts` — 全 mode 矩阵测试（覆盖 investigation/ops_task/refactor/change_request 四种 mode 的 pass/fail）
  - `npx vitest run tests/regression/v36_backward_compat.test.ts` — 确认无 mode 时默认行为不变
- **manual_verification_checks**:
  - 确认 `sf-design-gate.ts` 的改动仅涉及 L13 参数读取，无副作用

---

### TASK-2: 修复 sf-verification-gate handler 同类参数名 bug（DD-2）

**context_block**（executor 必读）：

- **What**: 修改 `sf-verification-gate.ts` 第 12 行，将 `args['gate_mode']` 改为双读模式 `(args['mode'] || args['gate_mode'])`
- **Why**: 与 TASK-1 完全同源的参数名不匹配 bug。MCP 工具定义的参数名是 `mode`，但 handler 读取 `args['gate_mode']`，导致 `sf_verification_gate(mode="change_request")` 等 mode 调用无效
- **Refs**: DD-2, impact_analysis §新增发现
- **Constraints**:
  - 与 TASK-1 相同的双读模式
  - 修改仅限 1 行（L12）
  - 不修改 `sf_verification_gate_core.ts`
- **Done When**:
  - `sf_verification_gate(mode="change_request")` 正确路由到策略表路径
  - `sf_verification_gate()` 无 mode 时默认行为不变

**执行步骤**：

1. 打开 `packages/daemon-core/src/tools/handlers/sf-verification-gate.ts`，定位到第 12 行
2. 将 `const gateMode = args['gate_mode'] as string | undefined;` 改为 `const gateMode = (args['mode'] as string | undefined) || (args['gate_mode'] as string | undefined);`
3. 保存文件

- **依赖**: 无
- refs: [DD-2]
- files: [packages/daemon-core/src/tools/handlers/sf-verification-gate.ts]
- **verification_commands**:
  - `npx vitest run tests/unit/tools/lib/gate_mode.test.ts` — 确认 verification gate mode 测试通过
  - `npx vitest run tests/regression/v36_backward_compat.test.ts` — 确认向后兼容
- **manual_verification_checks**:
  - 确认 `sf-verification-gate.ts` 的改动仅涉及 L12 参数读取，无副作用

---

### TASK-3: Skill 文档添加 H2 intro 约束说明（DD-3）

**context_block**（executor 必读）：

- **What**: 在 8 个工作流 Skill 文档的 Gate 阶段说明中添加格式约束，明确"H2 标题下必须有至少一段非空正文内容，不能直接接 H3 子标题"
- **Why**: Gate 的 `parseSections()` 在 H2 直连 H3 时提取空内容并判定 section 缺失，但所有 Skill 文档均未明示此约束，导致 sub-agent 生成的文档频繁被 Gate 拒绝（裂缝 #4）
- **Refs**: DD-3, impact_analysis §裂缝 #4
- **Constraints**:
  - 纯文档更新，不修改任何 Gate 代码
  - 约束说明格式统一，8 个 Skill 文档保持一致
  - 附加在每个 Skill 文档中涉及 Gate 检查的阶段描述中
- **Done When**:
  - 8 个 Skill 文档均包含 H2 intro 格式约束说明
  - 约束说明包含正确/错误示例

**执行步骤**：

1. 对以下 8 个 Skill 文档逐个添加约束说明：
   - `C:\Users\luo\.config\opencode\skills\sf-workflow-feature-spec\SKILL.md`
   - `C:\Users\luo\.config\opencode\skills\sf-workflow-bugfix-spec\SKILL.md`
   - `C:\Users\luo\.config\opencode\skills\sf-workflow-design-first\SKILL.md`
   - `C:\Users\luo\.config\opencode\skills\sf-workflow-investigation\SKILL.md`
   - `C:\Users\luo\.config\opencode\skills\sf-workflow-change-request\SKILL.md`
   - `C:\Users\luo\.config\opencode\skills\sf-workflow-refactor\SKILL.md`
   - `C:\Users\luo\.config\opencode\skills\sf-workflow-ops-task\SKILL.md`
   - `C:\Users\luo\.config\opencode\skills\sf-workflow-quick-change\SKILL.md`
2. 在每个 Skill 文档中涉及 Gate 检查的阶段描述处追加以下内容：

   > **格式约束**：Gate 工具的 `parseSections()` 要求每个 `##` 级标题下必须有至少一段非空正文内容，不能直接接 `###` 子标题。否则该 section 会被判定为缺失（empty），导致 Gate fail。
   >
   > 示例：
   > ```markdown
   > ## 受影响模块        ✗ 错误
   > ### 模块 A          ✗ H2 下无 intro → Gate fail
   >
   > ## 受影响模块       ✓ 正确
   > 本变更涉及以下模块。  ✓ H2 下有 intro → Gate pass
   > ### 模块 A          ✓ 然后才是子标题
   > ```

3. 保存所有文件

- **依赖**: 无
- refs: [DD-3, #4]
- files: [8 个 Skill 文档]
- **verification_commands**:
  - `grep -rl "格式约束" "C:\Users\luo\.config\opencode\skills\"` — 列出包含约束的文件（应返回 8 个）
- **manual_verification_checks**:
  - 确认 8 个 Skill 文档均包含"格式约束"说明
  - 确认约束说明中的 markdown 示例语法正确

---

### TASK-4: 全量回归测试 + investigation 端到端验证

**context_block**（executor 必读）：

- **What**: TASK-1 和 TASK-2 完成后，运行全量 Gate 相关测试验证无回归，并验证 investigation 工作流的端到端行为
- **Why**: 确保代码修复不破坏现有工作流，且 investigation 工作流不再需要 workaround（伪需求编号、design.md 别名文件等）
- **Refs**: DD-1, DD-2, DD-3, impact_analysis §回归测试范围
- **Constraints**:
  - 纯验证任务，不修改任何代码或文档
  - 所有测试必须通过（0 failures）
  - investigation 端到端验证覆盖 findings_report.md 检查和需求引用跳过
- **Done When**:
  - 全部 Gate 相关测试通过（gate_mode + property + backward_compat + result_recording）
  - investigation mode 端到端行为验证通过

**执行步骤**：

1. 运行全量 Gate 相关测试套件
2. 验证 investigation mode 行为：
   - `sf_design_gate(mode="investigation")` 检查 `findings_report.md`
   - `sf_design_gate(mode="investigation")` 不执行需求引用检查
   - `sf_requirements_gate(mode="investigation")` 检查 `investigation_plan.md`

- **依赖**: TASK-1 + TASK-2（代码修复必须先完成）
- refs: [DD-1, DD-2, DD-3]
- files: []
- **verification_commands**:
  - `npx vitest run tests/unit/tools/lib/gate_mode.test.ts` — 全 mode 矩阵测试
  - `npx vitest run tests/property/gate_mode.property.test.ts` — 属性级测试
  - `npx vitest run tests/regression/v36_backward_compat.test.ts` — 向后兼容回归
  - `npx vitest run tests/unit/tools/lib/gate_result_recording.test.ts` — Gate 结果记录
- **manual_verification_checks**:
  - 确认 investigation mode design gate 检查 findings_report.md 而非 design.md
  - 确认 investigation mode design gate 不执行 hasRequirementReferences
