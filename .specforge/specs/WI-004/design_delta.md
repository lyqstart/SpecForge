# WI-004 增量设计：SpecForge 工具裂缝修复

## 增量设计描述

本文档描述 WI-004（SpecForge 工具裂缝修复）的增量设计方案。基于 impact_analysis.md 中的根因分析，本次变更聚焦于 4 条裂缝中可低成本修复的 3 条（#7/#8、#4），以及 1 条建议拆分为独立子 WI 的裂缝（#3）。另有 1 条新增发现（`impact_analysis_gate` 受同类参数名 bug 影响）建议纳入本 WI 一并修复。

### DD-1 修复 sf-design-gate handler 参数名不匹配（修复 #7 + #8）

refs: [#7, #8, intake.md §变更范围]
constrained_by: project-rules:低成本优先, project-rules:影响面小优先

**根因**：`sf-design-gate.ts` L13 读取 `args['gate_mode']`，但 MCP 工具定义的参数名是 `mode`。参数名不匹配导致 mode 始终为 `undefined`，Gate 始终走默认路径（硬编码检查 `design.md` + 强制需求引用检查）。

**修复方案**（精确到行）：

修改 `packages/daemon-core/src/tools/handlers/sf-design-gate.ts` 第 13 行：

```typescript
// 修改前（当前代码）：
const gateMode = args['gate_mode'] as string | undefined;

// 修改后：
const gateMode = (args['mode'] as string | undefined) || (args['gate_mode'] as string | undefined);
```

**设计决策**：
- 采用 `args['mode'] || args['gate_mode']` 的双读模式（与 `sf-requirements-gate.ts` L12-13 保持一致），而非仅改为 `args['mode']`。这确保：
  1. MCP schema 参数 `mode` 正确传入（修复 #7/#8）
  2. 任何直接传 `gate_mode` 的内部调用方不受影响（向后兼容）
- 不修改 `sf_design_gate_core.ts`，因为 core 逻辑已正确实现策略表（`DESIGN_GATE_SPECS`），问题仅在 handler 层参数名不匹配

**修复效果**：
- #7 修复：`mode="investigation"` 时 Gate 检查 `findings_report.md`（而非 `design.md`）
- #8 修复：`mode="investigation"` 时 Gate 走策略表路径，不执行 `hasRequirementReferences` 检查
- 其他 mode（`change_request`、`ops_task`、`refactor`）同时修复

### DD-2 修复 sf-verification-gate handler 同类参数名 bug（新增发现）

refs: [impact_analysis.md §新增发现, DD-1]
constrained_by: project-rules:影响面小优先, project-rules:低成本优先

**根因**：`sf-verification-gate.ts` L12 同样使用 `args['gate_mode']`，而 MCP 工具定义的参数名也是 `mode`。与 DD-1 完全同源的参数名不匹配问题。

**修复方案**：

修改 `packages/daemon-core/src/tools/handlers/sf-verification-gate.ts` 第 12 行：

```typescript
// 修改前（当前代码）：
const gateMode = args['gate_mode'] as string | undefined;

// 修改后：
const gateMode = (args['mode'] as string | undefined) || (args['gate_mode'] as string | undefined);
```

**纳入本 WI 的理由**：
1. 与 #7/#8 同根同源，修复模式完全一致
2. 修改量仅 1 行，额外成本极低
3. change_request 工作流使用 `sf_verification_gate(mode="change_request")`，不修复会阻碍验证阶段
4. 串行修复风险极低，不会互相干扰

### DD-3 Gate 隐式 intro body 要求 — 选择路径 (b)（修复 #4）

refs: [#4, intake.md §变更范围]
constrained_by: project-rules:回归风险最小化, project-rules:影响面小优先

**选择路径 (b)**：在 Skill 文档中明示约束，不修改 Gate 代码。

**理由**：
1. **回归风险为零**：路径 (a)（修改 `parseSections` 实现）会改变所有 7 个 Gate 检查点的 section 解析行为，回归风险不可接受。路径 (b) 不改任何代码。
2. **设计意图合理**：要求 H2 标题下有非空 intro 段落是合理的文档质量要求——它确保每个 section 有概述性描述，而非直接跳入子标题堆砌。
3. **低成本**：仅需在各工作流 SKILL.md 的 Gate 阶段说明中添加一行约束描述。
4. **影响面可控**：所有 sub-agent 在生成 spec 文档时遵循 Skill 文档指导即可。

**具体修改**（Skill 文档层面）：

在以下 Skill 文档的"Gate 约束"或"文档格式要求"章节中添加说明：

> **格式约束**：每个 `##` 级标题下必须有至少一段非空正文内容，不能直接接 `###` 子标题。例如：
> ```markdown
> ## 受影响模块        ✗ 错误
> ### 模块 A          ✗ H2 下无 intro
>
> ## 受影响模块       ✓ 正确
> 本变更涉及以下模块。  ✓ H2 下有 intro
> ### 模块 A          ✓ 然后才是子标题
> ```

受影响的 Skill 文件：
- `.opencode/skills/sf-workflow-feature-spec/SKILL.md`
- `.opencode/skills/sf-workflow-bugfix-spec/SKILL.md`
- `.opencode/skills/sf-workflow-design-first/SKILL.md`
- `.opencode/skills/sf-workflow-investigation/SKILL.md`
- `.opencode/skills/sf-workflow-change-request/SKILL.md`
- `.opencode/skills/sf-workflow-refactor/SKILL.md`
- `.opencode/skills/sf-workflow-ops-task/SKILL.md`
- `.opencode/skills/sf-workflow-quick-change/SKILL.md`

### DD-4 双目录约定不一致 — 建议独立子 WI（#3 不在本 WI 处理）

refs: [#3, intake.md §变更范围]
constrained_by: project-rules:修复成本过高可独立拆分子WI

**建议**：独立拆分为子 WI（如 WI-005），不在本 WI 范围内处理。

**理由**：
1. **影响面巨大**：40+ 文件，跨越 daemon-core、部署态 tools、8 个 Skill 文档、4 个 Agent prompt
2. **需要全局迁移策略**：选择 `.specforge/` 还是 `specforge/` 需要与项目整体架构方向对齐，不适合在 bugfix 性质的 WI 中决策
3. **当前功能不受影响**：daemon 模式下所有工具统一使用 `.specforge/`，功能正确；部署态 tools 的 `specforge/`（无点）路径是独立代码分支
4. **不阻塞其他修复**：#3 不修复不影响 #4/#7/#8 的修复效果
5. **回归风险不可控**：40+ 文件的路径修改无法在单一 WI 中充分测试

## 受影响模块

本变更涉及 2 个 handler 源文件的参数读取逻辑修改，以及 8 个 Skill 文档的格式约束说明补充。以下分列代码修改和文档修改的完整清单。

### 代码文件（DD-1 + DD-2 修改）

本节列出需要代码修改的文件。DD-1 和 DD-2 各修改 1 行 handler 代码，修改总量极小。

| 文件 | 修改类型 | 修改行 | 说明 |
|------|---------|--------|------|
| `packages/daemon-core/src/tools/handlers/sf-design-gate.ts` | 参数名修复 | L13 | `args['gate_mode']` → `(args['mode'] \|\| args['gate_mode'])` |
| `packages/daemon-core/src/tools/handlers/sf-verification-gate.ts` | 参数名修复 | L12 | `args['gate_mode']` → `(args['mode'] \|\| args['gate_mode'])` |

### 不修改的文件（确认无需变更）

| 文件 | 原因 |
|------|------|
| `sf_design_gate_core.ts` | 策略表 `DESIGN_GATE_SPECS` 已正确配置，core 逻辑无 bug |
| `sf_requirements_gate_core.ts` | handler 已正确读取双参数，core 逻辑无 bug |
| `sf_verification_gate_core.ts` | core 逻辑无 bug，问题仅在 handler |
| `sf_requirements_gate_core.ts` → `parseSections()` | DD-3 选择路径 (b)，不改代码 |

### 接口变更

**无 API 接口变更**。修改仅在 handler 内部的参数读取逻辑，不改变工具的外部 API 契约。

修复前后行为对比：

```
修复前：
  sf_design_gate(mode="investigation") → gateMode=undefined → 走默认路径 → 检查 design.md + 需求引用 → fail

修复后：
  sf_design_gate(mode="investigation") → gateMode="investigation" → 走策略表路径 → 检查 findings_report.md → pass
```

## 兼容性影响

本次修复完全向后兼容，不改变任何外部 API 契约。修复采用双读模式确保所有现有调用路径不变，Skill 文档变更仅为追加说明。

### 向后兼容性

本节分析修复对现有工作流的向后兼容性影响。修复采用双读模式（`args['mode'] || args['gate_mode']`），确保完全向后兼容。

**完全向后兼容**：
1. **无 mode 参数时**：`gateMode` 仍为 `undefined`，走默认路径（检查 `design.md` + 需求引用），行为与修复前完全一致。现有 feature_spec、bugfix_spec 工作流不受影响。
2. **传 `gate_mode` 参数时**：仍通过 `args['gate_mode']` 读取，内部调用方（如有）不受影响。
3. **传 `mode` 参数时**：通过 `args['mode']` 读取，这是修复的目标场景，change_request、investigation、refactor、ops_task 工作流将正确路由到策略表。

### MCP 工具 API 变更

无变更。MCP 工具定义中 `sf_design_gate` 和 `sf_verification_gate` 已有 `mode` 参数，此次仅修复 handler 对该参数的读取。

### Skill 文档变更（DD-3）

DD-3 仅添加约束说明，不改变 Gate 的判定逻辑。已生成的、格式合规的文档不受影响；未来生成的文档需遵守新增的格式约束（H2 下必须有非空 intro 段落）。

## 回归风险

本次变更的回归风险极低。DD-1/DD-2 各仅修改 1 行参数读取代码且采用向后兼容的双读模式，DD-3 不涉及代码变更。已有测试覆盖全部 4 种 Gate mode 的 pass/fail 场景。

### 总体风险评估：低

本次变更的回归风险极低，原因如下：

1. **修改量极小**：DD-1 + DD-2 各 1 行代码修改，不涉及逻辑变更，仅修复参数名读取
2. **向后兼容**：双读模式确保所有现有调用路径不变
3. **DD-3 无代码变更**：路径 (b) 不改 Gate 代码，回归风险为零
4. **完整测试覆盖**：`tests/unit/tools/lib/gate_mode.test.ts` 覆盖全部 4 种 Gate mode 的 pass/fail 场景

### 需要回归的测试

| 测试文件 | 覆盖场景 | 优先级 |
|---------|---------|--------|
| `tests/unit/tools/lib/gate_mode.test.ts` — design gate mode tests | investigation/ops_task/refactor/change_request 全 mode | P0 |
| `tests/unit/tools/lib/gate_mode.test.ts` — backward compat section | 无 mode 时默认行为不变 | P0 |
| `tests/unit/tools/lib/gate_mode.test.ts` — verification gate mode tests | refactor/ops_task/change_request 全 mode | P0 |
| `tests/unit/tools/lib/sf_design_gate_core.test.ts` | KG sync 集成 | P1 |
| `tests/property/gate_mode.property.test.ts` | mode 矩阵属性测试 | P1 |
| `tests/unit/tools/lib/gate_result_recording.test.ts` | Gate 结果记录 | P2 |

### 需要新增的测试

| 测试 | 目的 |
|------|------|
| `sf_design_gate` 传入 `args['mode']`（非 `gate_mode`）时 investigation mode 正确路由 | 验证 DD-1 修复 |
| `sf_design_gate` 传入 `mode="investigation"` 时不执行需求引用检查 | 验证 #8 修复 |
| `sf_verification_gate` 传入 `args['mode']` 时 mode 正确路由 | 验证 DD-2 修复 |
| `sf_design_gate` 同时传入 `mode` 和 `gate_mode` 时 `mode` 优先 | 验证参数优先级 |

## KG 追溯关系

### 与 impact_analysis.md 变更范围的对应关系

本节建立 design_delta.md 各设计决策与 impact_analysis.md 变更范围之间的追溯关系，确保增量设计覆盖了影响分析中识别的全部变更点。

| impact_analysis.md 变更项 | design_delta DD | 状态 |
|---------------------------|-----------------|------|
| #7 sf_design_gate 硬编码 design.md（L13 参数名不匹配） | DD-1：修复 handler 参数名 | 本 WI 修复 |
| #8 sf_design_gate mode-blind 需求引用（与 #7 同源） | DD-1：修复后走策略表路径，自动跳过 | 本 WI 修复（DD-1 覆盖） |
| #4 Gate 隐式 intro body 要求（parseSections 行为） | DD-3：路径 (b) Skill 文档明示约束 | 本 WI 修复（无代码变更） |
| #3 双目录约定不一致（40+ 文件） | DD-4：建议独立子 WI | 不在本 WI |
| 新增发现：sf_verification_gate 同类参数名 bug | DD-2：修复 handler 参数名 | 本 WI 修复 |

### KG 节点影响

- **`sf_design_gate` handler 节点**：DD-1 修改参数读取逻辑，行为从"忽略 mode"变为"正确读取 mode"
- **`sf_verification_gate` handler 节点**：DD-2 同上
- **`parseSections` 节点**：DD-3 不修改，但 Skill 文档节点需添加约束说明
- **策略表节点**（`DESIGN_GATE_SPECS`、`VERIFICATION_GATE_SPECS`）：不修改，已正确配置
- **工作流状态机节点**：不修改，`impact_analysis_gate` → `design_delta` → `design_gate` 流转不变
