# WI-004 影响分析：SpecForge 工具裂缝修复

## 变更范围

本次变更涉及 SpecForge 框架自身的 Gate 工具实现、路径约定统一和 Skill 文档同步。变更范围覆盖 4 条同源裂缝，均为 WI-002 investigation 工作流中实证发现的工具层缺陷。以下逐条分析受影响的源文件、函数和调用链。

### 裂缝 #3：双目录约定不一致

**实际影响面**：这是一个 **三方不一致** 问题，比 intake.md 描述的两方更严重。

| 路径来源 | 约定 | 受影响文件数 |
|----------|------|-------------|
| daemon-core 源码（`packages/daemon-core/src/tools/lib/`） | `.specforge/`（带点） | 12 个 core 文件 |
| 部署态 OpenCode tools（`.opencode-/tools/lib/`） | `specforge/`（不带点） | 15 个 core 文件 |
| Agent 系统 prompt 和 Skill 文档 | `specforge/specs/`（不带点） | 8 个 SKILL.md + 4 个 Agent prompt |
| 运行时路径（`path-resolver.ts`、`sf-state-transition.ts`） | `.specforge/`（带点） | 2 个文件 |

**受影响的核心文件清单**：

daemon-core 源码（使用 `.specforge/`）：
- `packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts` — L221, L272, L438 中 `join(baseDir, ".specforge", "specs", ...)`
- `packages/daemon-core/src/tools/lib/sf_design_gate_core.ts` — L234, L400 中 `join(baseDir, ".specforge", "specs", ...)`
- `packages/daemon-core/src/tools/lib/sf_tasks_gate_core.ts` — L231
- `packages/daemon-core/src/tools/lib/sf_verification_gate_core.ts` — L494, L694
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts` — L92-96（路径映射）, L101-102（白名单）
- `packages/daemon-core/src/tools/lib/sf_doc_lint_core.ts` — L52
- `packages/daemon-core/src/tools/lib/sf_knowledge_graph_core.ts` — L977, L1047, L1069, L1099
- `packages/daemon-core/src/tools/lib/sf_trace_matrix_core.ts` — L183
- `packages/daemon-core/src/tools/lib/sf_context_build_core.ts` — L312
- `packages/daemon-core/src/tools/lib/utils.ts` — L149, L164
- `packages/daemon-core/src/daemon/path-resolver.ts` — L128（runtime 路径）
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` — L17（manifest 路径）

部署态 tools 文件（使用 `specforge/`，无点）：
- `.opencode-/tools/lib/` 下全部同名 core 文件（约 15 个文件），路径约定与 daemon-core 完全相反

Skill 文档（使用 `specforge/specs/`，无点）：
- `.opencode-/skills/sf-workflow-feature-spec/SKILL.md` — L63, L90, L119, L144
- `.opencode-/skills/sf-workflow-bugfix-spec/SKILL.md` — L62, L92, L120, L145
- `.opencode-/skills/sf-workflow-design-first/SKILL.md` — L135, L160
- `.opencode-/skills/sf-workflow-investigation/SKILL.md` — L98, L168
- `.opencode-/skills/sf-workflow-change-request/SKILL.md` — L82, L132, L164
- `.opencode-/skills/sf-workflow-refactor/SKILL.md` — L86, L135
- `.opencode-/skills/sf-workflow-ops-task/SKILL.md` — L114, L154
- `.opencode-/skills/sf-workflow-quick-change/SKILL.md` — L76, L247

Agent prompt 文件（使用 `specforge/specs/`，无点）：
- `.opencode-/agents/sf-requirements.md` — L187, L211
- `.opencode-/agents/sf-design.md` — L207, L228
- `.opencode-/agents/sf-task-planner.md` — L157, L196
- `.opencode-/agents/sf-knowledge.md` — L91

**关键发现**：daemon-core 和部署态 tools 使用**相反的约定**。实际磁盘上 `.specforge/` 目录存在（带点），说明 daemon 模式是实际生效的路径。部署态 tools 的 `specforge/`（无点）路径实际上从未被正确使用。

### 裂缝 #4：Gate 隐式 intro body 要求

**根因定位**：`sf_requirements_gate_core.ts` 中 `parseSections()` 函数（L136-164）。

该函数在 `##` 标题和下一个同级或更高级标题（包括 `###`）之间提取内容。当 `## 调查范围` 直接接 `### 包含` 时，提取到的 section 内容为空字符串。随后 gate 检查（L246）`!sections[s]?.trim()` 将空内容判定为 "Missing section"。

**受影响函数**：
- `parseSections()` — `sf_requirements_gate_core.ts` L136-164（被所有 Gate mode 的 section 检查共享）
- Gate 缺失 section 判定 — L246: `spec.requiredSections.filter((s) => !sections[s]?.trim())`
- `sf_design_gate_core.ts` L425 复用同一逻辑

**影响面**：此行为影响所有使用 `parseSections` 的 Gate mode（change_request、refactor、investigation、ops_task），共 4 种工作流的 7 个 Gate 检查点。选择修复路径 (b)（仅更新 Skill 文档）时，代码无变更，回归风险为零。

### 裂缝 #7：sf_design_gate 硬编码 design.md

**根因定位**：`packages/daemon-core/src/tools/handlers/sf-design-gate.ts` L13。

```
const gateMode = args['gate_mode'] as string | undefined;
```

MCP 工具定义的参数名是 `mode`，但 handler 读取的是 `args['gate_mode']`。当 Orchestrator 按照 skill 文档调用 `sf_design_gate(work_item_id, mode="investigation")` 时，`gateMode` 始终为 `undefined`，导致 `checkDesignGate` 的 `options.mode` 为 `undefined`，始终走默认路径（L234-257，硬编码检查 `design.md`）。

**对比分析**：`sf-requirements-gate.ts` handler 同时读取 `args['mode']` 和 `args['gate_mode']` 两个参数，因此 investigation mode 的 requirements gate 不受此 bug 影响。

**受影响文件**：
- `packages/daemon-core/src/tools/handlers/sf-design-gate.ts` — L13（根因，参数名不匹配）
- `packages/daemon-core/src/tools/lib/sf_design_gate_core.ts` — L234（默认路径硬编码 `design.md`）

**核心策略表已正确配置**：`DESIGN_GATE_SPECS` 在 L186-190 正确映射 `mode: "investigation"` → `targetFile: "findings_report.md"`。问题仅在 handler 层参数名不匹配，导致 mode 永远不会被传入 core 逻辑。

### 裂缝 #8：sf_design_gate mode-blind 要求 requirements 引用

**根因定位**：与 #7 同源。由于参数名不匹配，mode 参数不会传入 `checkDesignGate`，因此始终走默认路径（L282-309），其中 L286-289 执行 `hasRequirementReferences(content)` 检查。investigation 工作流不产生 `requirements.md`，但 Gate 仍要求 design 文档引用需求编号。

**修复 #7 即同时修复 #8**。当 mode 参数正确传入后，`executeDesignGateMode()` 会走策略表路径（L383-437），该路径不包含需求引用检查，仅检查 `findings_report.md` 的必需 sections 和内容完整性。

## 风险评估

**低**

理由如下：

1. **裂缝 #7/#8 是单一参数名 bug，修复量极小**：仅需修改 `sf-design-gate.ts` 一行代码（将 `args['gate_mode']` 改为同时读取 `args['mode']`），与 `sf-requirements-gate.ts` handler 的模式保持一致。修复后 investigation mode 的 Gate 检查会走已有的、经过测试的策略表路径（`DESIGN_GATE_SPECS`）。

2. **裂缝 #4 推荐选择路径 (b)，回归风险为零**：在 Skill 文档中明示"H2 标题下必须有非空 intro 段落"的约束，无需修改 Gate 代码。路径 (a)（修改 `parseSections` 实现）会改变所有 Gate mode 的 section 解析行为，回归风险较高，且影响 7 个 Gate 检查点的判定逻辑。

3. **裂缝 #3 影响面最大但紧急度最低**：当前 daemon 模式（实际运行路径）统一使用 `.specforge/`，部署态 tools 使用 `specforge/`（无点），但两者指向不同的代码路径，功能各自正确。问题在于认知不一致和跨模式兼容性。建议独立拆分为子 WI，避免阻塞 #4/#7/#8 的修复。

4. **所有修复点都有完整测试覆盖**：
   - `tests/unit/tools/lib/gate_mode.test.ts` 覆盖全部 4 种 Gate mode 的 pass/fail 场景
   - `tests/property/gate_mode.property.test.ts` 提供 mode 矩阵属性测试
   - `tests/regression/v36_backward_compat.test.ts` 确保无 mode 时默认行为不变

## 回归测试范围

### 必须回归的模块

| 模块 | 测试文件 | 覆盖场景 | 原因 |
|------|---------|---------|------|
| sf_design_gate（所有 mode） | `tests/unit/tools/lib/gate_mode.test.ts` | investigation L350-400, ops_task L246-346, backward compat L585-593 | #7/#8 修复后需确认 mode 正确路由 |
| sf_requirements_gate（所有 mode） | `tests/unit/tools/lib/gate_mode.test.ts` | change_request L43-115, investigation L174-218 | 确认修复未引入副作用 |
| Gate 属性测试 | `tests/property/gate_mode.property.test.ts` | 全 mode 矩阵 | 属性级验证 |
| V3.6 回归测试 | `tests/regression/v36_backward_compat.test.ts` | design gate L131-170, requirements gate L84-130 | 确认无 mode 时默认行为不变 |
| sf_artifact_write 路径 | `tests/unit/tools/sf_artifact_write.test.ts` | 白名单路径 | #3 修复后路径需同步 |
| Gate 结果记录 | `tests/unit/tools/lib/gate_result_recording.test.ts` | Gate pass/fail 记录 | 确认修复不影响事件记录 |
| investigation 状态机 | `tests/unit/tools/lib/sf_state_transition_core.test.ts` | user_accepted guard L116-237 | investigation 工作流端到端验证 |

### 需要新增的测试

| 测试 | 原因 |
|------|------|
| `sf_design_gate` 传入 `args['mode']`（非 `gate_mode`）时的 investigation mode 行为 | 验证 #7 修复：handler 正确读取 MCP 参数 `mode` |
| `sf_design_gate` 传入 `mode="investigation"` 时不检查需求引用 | 验证 #8 修复：策略表路径不执行 `hasRequirementReferences` |
| investigation 端到端工作流 | intake → investigation_plan → research → findings_report → findings_report_gate 全程无 workaround |

### E2E 验证场景

按 intake.md 要求，完整跑一遍 investigation 工作流端到端，验证以下 5 项：

1. `sf_requirements_gate(mode="investigation")` 检查 `investigation_plan.md`（非 `requirements.md`）
2. `sf_design_gate(mode="investigation")` 检查 `findings_report.md`（非 `design.md`）
3. `sf_design_gate(mode="investigation")` 不执行需求引用检查
4. `sf_artifact_write` 产物写入路径与 Gate 读取路径一致（均为 `.specforge/specs/` 或均为 `specforge/specs/`）
5. 包含 H2 直接接 H3 的文档能通过 Gate（如果最终选择路径 (a) for #4）

## KG 关联

### 直接关联节点

- **Gate 工具实现节点**：`sf_requirements_gate`、`sf_design_gate` — 本次修复的核心目标
- **工作流状态机节点**：`investigation`、`change_request` 工作流的 Gate 状态（`investigation_plan_gate`、`findings_report_gate`、`impact_analysis_gate`）
- **路径约定节点**：`sf_artifact_write` 的白名单路径、`path-resolver.ts` 的 runtime 路径解析

### 间接关联节点

- **所有工作流的 Gate 检查点**：`parseSections()` 被所有 Gate mode 共享，#4 的修复选择会影响全部工作流的文档格式约束
- **Skill 文档节点**：8 个工作流 SKILL.md 中的路径引用和约束说明
- **WI-002 调查产物**：`.specforge/specs/WI-002/findings_report.md` §7.2 — 本 WI 变更来源的实证数据

### KG 一致性要求

- #3 修复后，`sf_knowledge_graph_core.ts` 中的 `sourceFile` 路径和 `syncFromSpec` 中的 `specDir` 路径必须与实际 spec 目录一致
- 修复不应破坏 KG 的 `sync_from_spec` 功能（当前 daemon 版本使用 `.specforge/specs/`，与 `path-resolver.ts` 一致）
- investigation 工作流的 `findings_report_gate` pass 后**不同步 KG**（按 investigation skill 协议，该工作流不产生可追溯链）
