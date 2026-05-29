# Tasks: WI-035 修复新项目初始化流程被意图分类抢占

> **Work Item**: WI-035
> **Workflow**: bugfix_spec
> **阶段**: tasks
> **基于**: `specforge/specs/WI-035/design.md`（方案 C：组合方案）

---

## 任务概览

| Batch | Tasks | 并行/串行 | 覆盖范围 |
|-------|-------|-----------|----------|
| 1 | TASK-1, TASK-2, TASK-3 | ✅ 并行（互相独立） | DD-2, DD-3, DD-1 |
| 2 | TASK-4, TASK-5, TASK-6, TASK-7 | ✅ 并行（依赖 Batch 1） | DD-1, CP-2, CP-1, CP-3 |
| 3 | TASK-8 | 串行（无依赖） | 用户级插件同步 |

### 批次依赖图

```
Batch 1（并行）
  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
  │ TASK-1       │   │ TASK-2       │   │ TASK-3       │
  │ DD-2 guard   │   │ DD-3 manifest│   │ DD-1 user    │
  │ + unit test  │   │ + CP-4 test  │   │ orchestrator │
  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
         │                  │                  │
         ▼                  ▼                  ▼
Batch 2（并行，各自依赖 Batch 1 对应 task）
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ TASK-5       │ │ TASK-4       │ │ TASK-6       │ │ TASK-7       │
  │ CP-2 属性测试│ │ DD-1 project │ │ CP-1 属性测试│ │ CP-3 集成测试│
  │ dep: TASK-1  │ │ orchestrator │ │ dep: TASK-3  │ │ dep: T1,T3   │
  └──────────────┘ │ dep: TASK-3  │ └──────────────┘ └──────────────┘
                   └──────────────┘
```

### 需求覆盖矩阵

| REQ | 描述 | 覆盖 Task |
|-----|------|-----------|
| REQ-1 | `.specforge/` 不存在时创建目录并进入项目初始化 | TASK-1, TASK-2, TASK-3, TASK-4 |
| REQ-2 | 首次使用时扫描开发环境并生成 dev-environment.md | TASK-3, TASK-4 |
| REQ-3 | 检测 prod-environment.md 和 project-rules.md 状态 | TASK-3, TASK-4 |
| REQ-4 | 启动流程 Step 1-4 必须在意图分类之前执行 | TASK-3, TASK-4, TASK-6 |
| REQ-5 | sf_state_transition 状态流转正确性不变 | TASK-1, TASK-5 |
| REQ-6 | ProjectManager.registerProject() 行为不变 | （不改动，DD-4 保护） |
| REQ-7 | 意图分类功能不受影响 | TASK-3, TASK-4, TASK-7 |
| REQ-8 | 会话恢复流程继续正常 | TASK-3, TASK-7 |
| REQ-9 | 已有项目启动流程正常 | TASK-1, TASK-7 |
| REQ-10 | 插件注册流程不变 | （不改动，DD-4 保护） |
| REQ-11 | manifest.json 读取逻辑继续正确 | TASK-2, TASK-6 |

---

## Batch 1：基础修改（3 个并行 Task）

---

### TASK-1 增加 sf_state_transition 项目初始化守卫

**context_block**（executor 必读）：
- **What**: 在 `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` 的 `from_state=""` 路径中，增加 `manifest.json` 存在性检查。若 `.specforge/manifest.json` 不存在，返回 `{success: false, error: "PROJECT_NOT_INITIALIZED", hint: "...", recovery_action: "execute_startup_flow"}`。同时创建 handler 单元测试。
- **Why**: 实现 DD-2 代码级守卫，确保 orchestrator 在项目未初始化时无法创建 Work Item——即使 prompt 路径（DD-1）被 LLM 跳过，代码层也会硬性拦截。满足 REQ-1（项目初始化检查）和 REQ-5（不变行为保护：仅 `from_state=""` 时触发守卫，不影响已有 WI 的 `from_state≠""` 路径）。
- **Refs**: DD-2（代码级守卫设计，接口定义见 design.md DD-2 段）、REQ-1、REQ-5
- **Constraints**:
  - 使用 `node:fs/promises` + `node:path` 直接访问文件系统（方案 B），不引入新依赖
  - 守卫仅当 `fromState === ''`（新建 Work Item）时触发——`fromState ≠ ''` 的已有 WI 流转直接跳过守卫
  - 返回结构必须包含 `error`（精确错误码）、`hint`（人类可读提示）、`recovery_action`（orchestrator 恢复动作标识）
  - 原有 `transitionFull` 调用逻辑完全不修改（DD-4 不变行为保护策略）
  - 遵守 Template prod-environment runtimes：node_min ≥ 18.0.0，代码兼容 Node 18+
  - 测试文件遵循现有 vitest 测试模式（import from 'vitest'，使用 describe/it/expect）
- **Done When**:
  - `sf_state_transition(from="", to="intake")` 在 manifest.json 不存在时返回 `{success: false, error: "PROJECT_NOT_INITIALIZED"}`
  - `sf_state_transition(from="intake", to="requirements")` 在 manifest.json 不存在时**不**触发守卫（`fromState ≠ ""`），正常执行
  - `sf_state_transition(from="", to="intake")` 在 manifest.json 存在时正常创建 Work Item（与修复前行为一致）
  - `npx vitest run tests/unit/sf-state-transition.test.ts` 全部通过

- **依赖**: 无
- refs: [REQ-1, REQ-5, DD-2]
- files: [packages/daemon-core/src/tools/handlers/sf-state-transition.ts, packages/daemon-core/tests/unit/sf-state-transition.test.ts]
- **verification_commands**:
  - unit: `npx --prefix packages/daemon-core vitest run tests/unit/sf-state-transition.test.ts`
- **manual_verification_checks**:
  - 确认 handler 修改后 `sf_state_transition` 在 daemon 中正常注册（`sf_doctor` 检查通过）

---

### TASK-2 规范化 manifest.json 字段命名并创建兼容性测试

**context_block**（executor 必读）：
- **What**: 修改 `specforge/manifest.json`，将 `data_schema_version` 字段统一为 `schema_version`（值为 `"6.0"`），添加 `install_mode` 字段（值为 `"user_level"`）。同时创建 `tests/unit/manifest-compatibility.unit.test.ts`，验证 `sf_doctor_core.assertCompatibility()` 对新字段格式的正确处理。
- **Why**: 实现 DD-3 manifest.json 引导创建。当前 manifest.json 使用 `data_schema_version` 字段名，而 orchestrator 启动流程 Step 1 读取 `schema_version`，字段命名不一致导致读取失败。统一命名后确保版本检查正常。`sf_doctor.assertCompatibility()` 读取 `install_mode` 字段，添加此字段确保兼容性检查正确执行。满足 REQ-1（manifest.json 作为项目初始化凭证）和 REQ-11（sf_doctor 兼容性逻辑不变）。
- **Refs**: DD-3（manifest.json 引导创建，模板和字段说明见 design.md DD-3 段）、REQ-1、REQ-11、CP-4
- **Constraints**:
  - manifest.json 必须包含字段：`schema_version`（`"6.0"`）、`install_mode`（`"user_level"`）、`initialized_at`（ISO 8601）、`updated_at`（ISO 8601）
  - 保留旧字段 `data_schema_version`（设为 `0`，向后兼容）——注意：design.md DD-3 提到"已有文件可保留 data_schema_version 作为历史记录，同时添加 schema_version 字段"
  - 测试文件遵循现有 vitest 模式 + 直接引用 `sf_doctor_core.ts` 中的逻辑或模拟其行为
  - TypeScript 编译必须在 Node 18+ 通过
- **Done When**:
  - `specforge/manifest.json` 包含 `schema_version: "6.0"` 和 `install_mode: "user_level"`
  - `sf_doctor.assertCompatibility()` 对含 `install_mode: "user_level"` 的 manifest.json 返回 `compatible: true`
  - `npx vitest run tests/unit/manifest-compatibility.unit.test.ts` 全部通过

- **依赖**: 无
- refs: [REQ-1, REQ-11, DD-3, CP-4]
- files: [specforge/manifest.json, packages/daemon-core/tests/unit/manifest-compatibility.unit.test.ts]
- **verification_commands**:
  - unit: `npx --prefix packages/daemon-core vitest run tests/unit/manifest-compatibility.unit.test.ts`
- **manual_verification_checks**:
  - 人工检查 `specforge/manifest.json` 内容格式正确（JSON 合法、字段齐全）

---

### TASK-3 重构用户级 sf-orchestrator.md（DD-1：启动流程硬性前置条件）

**context_block**（executor 必读）：
- **What**: 修改 `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md`，重组启动流程为硬性前置条件，消除与意图分类的 prompt 竞争条件。具体变更：
  1. 在"核心行为约束"之后、"启动流程"之前，增加硬性前置条件守卫声明（不可违反规则）
  2. 将"启动流程"章节标题改为"# 启动流程（硬性前置条件）"，增加"步骤 0：启动流程入口判定"
  3. 修改"意图分类"章节：移除"处理用户每条消息的第一步"声明，替换为"启动流程完成后执行"
  4. Step 1 中增加 manifest.json 创建指令（创建 `.specforge/manifest.json`，模板见 DD-3）
  5. Step 4 末尾增加"启动流程完成 → 意图分类"的衔接指令
  6. 增加 `PROJECT_NOT_INITIALIZED` 错误处理协议（orchestrator 收到此错误后执行启动流程的恢复动作）
- **Why**: 实现 DD-1 主要修复。根因是 prompt 中"启动流程"和"意图分类"的"第一步"声明冲突，LLM 一致选择意图分类。通过将启动流程升级为硬性前置条件（不可跳过），从根本上消除竞争。满足 REQ-1（.specforge/ 创建和 manifest.json 引导）、REQ-2（环境扫描）、REQ-3（配置文件检测）、REQ-4（启动流程先于意图分类）。
- **Refs**: DD-1（Prompt 执行顺序守卫，详细变更清单见 design.md DD-1 段）、REQ-1、REQ-2、REQ-3、REQ-4、REQ-7
- **Constraints**:
  - 原文件 498 行，修改约 80-150 行——必须精确匹配 design.md DD-1 的变更内容
  - 不得修改意图分类路由表、分类关键词、多意图优先级排序
  - 不得修改 Skill 加载协议、Gate 处理协议、失败重试协议
  - 不得修改会话恢复流程
  - 意图分类的强制路由规则必须保持完整不变（REQ-7 不变行为保护）
  - 修改后文件仍必须保持有效的 Markdown + YAML frontmatter
- **Done When**:
  - 文件中存在"硬性前置条件"守卫声明（包含"绝不执行意图分类、绝不创建 Work Item"文本）
  - "意图分类"章节不再包含"处理用户每条消息的第一步"声明
  - 启动流程章节先于意图分类章节出现（按行号验证）
  - Step 1 中包含 `manifest.json` 创建指令
  - 文件中存在 `PROJECT_NOT_INITIALIZED` 错误处理协议
  - `sf_doc_lint` 对修改后文件不报错（如适用）

- **依赖**: 无
- refs: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-7, DD-1]
- files: [C:\Users\luo\.config\opencode\agents\sf-orchestrator.md]
- **verification_commands**:
  - unit: `pwsh -Command "if (Select-String -Path '$env:USERPROFILE\.config\opencode\agents\sf-orchestrator.md' -Pattern '硬性前置条件' -SimpleMatch) { exit 0 } else { exit 1 }"`
  - unit: `pwsh -Command "$lines = Get-Content '$env:USERPROFILE\.config\opencode\agents\sf-orchestrator.md'; $startup = ($lines | Select-String -Pattern '启动流程' -SimpleMatch | Select-Object -First 1).LineNumber; $intent = ($lines | Select-String -Pattern '意图分类' -SimpleMatch | Select-Object -First 1).LineNumber; if ($startup -lt $intent) { exit 0 } else { exit 1 }"`
  - unit: `pwsh -Command "if (-not (Select-String -Path '$env:USERPROFILE\.config\opencode\agents\sf-orchestrator.md' -Pattern '处理用户每条消息的第一步' -SimpleMatch)) { exit 0 } else { exit 1 }"`
  - unit: `pwsh -Command "if (Select-String -Path '$env:USERPROFILE\.config\opencode\agents\sf-orchestrator.md' -Pattern 'manifest\.json' -SimpleMatch) { exit 0 } else { exit 1 }"`
  - unit: `pwsh -Command "if (Select-String -Path '$env:USERPROFILE\.config\opencode\agents\sf-orchestrator.md' -Pattern 'PROJECT_NOT_INITIALIZED' -SimpleMatch) { exit 0 } else { exit 1 }"`
- **manual_verification_checks**:
  - 在新项目目录中使用 OpenCode 发起开发请求，验证 orchestrator 先执行启动流程（创建 .specforge/ + manifest.json）再进入意图分类
  - 在已有项目目录中启动，验证正常路径（schema_version 检查 → 会话恢复/等待输入 → 意图分类）不被破坏

---

## Batch 2：同步修改 + 测试补齐（4 个并行 Task，均依赖 Batch 1）

---

### TASK-4 同步项目级 sf-orchestrator.md（DD-1 修复同步）

**context_block**（executor 必读）：
- **What**: 修改 `D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md`，应用与 TASK-3 **相同**的 DD-1 修复。注意项目级文件（223 行）比用户级文件（498 行）精简，缺少跨会话续接、知识积累后处理等高级功能——**仅同步 DD-1 相关变更，不添加用户级独有的功能**。具体变更：
  1. 在"核心行为约束"之后增加硬性前置条件守卫声明
  2. 将"启动流程"章节标题改为"# 启动流程（硬性前置条件）"，增加"步骤 0：启动流程入口判定"
  3. 修改"意图分类"章节：移除冲突声明（注意：项目级文件的意图分类章节没有"⚠️ 这是处理用户每条消息的第一步"这句，但检查是否需要调整上下文衔接）
  4. Step 1 增加 manifest.json 创建指令
  5. Step 4 末尾增加"启动流程完成 → 意图分类"衔接
  6. 增加 `PROJECT_NOT_INITIALIZED` 错误处理协议
- **Why**: 实现 DD-1 的项目级同步修复。当前项目同时存在用户级和项目级 orchestrator.md（混合模式），sf_doctor 会检测到此情况并警告。两份文件必须保持一致的核心行为约束，否则可能出现行为分歧。满足 REQ-1 到 REQ-4（与 TASK-3 相同的需求覆盖）。
- **Refs**: DD-1（Prompt 执行顺序守卫）、TASK-3（用户级 orchestrator.md 的修改内容为参考模板）、REQ-1、REQ-2、REQ-3、REQ-4、REQ-7
- **Constraints**:
  - **仅同步 DD-1 相关变更**——不添加项目级文件中不存在的功能（跨会话续接、知识积累后处理等）
  - 修改后的项目级文件应与用户级文件的 DD-1 修复部分保持一致
  - 保留项目级文件的精简风格（223 行 → 预计修改后约 260-290 行）
  - 不得修改意图分类路由表、强制路由规则
  - 修改后文件仍必须保持有效的 Markdown + YAML frontmatter
- **Done When**:
  - 文件中存在"硬性前置条件"守卫声明
  - "意图分类"章节的上下文衔接已调整为"启动流程完成后执行"
  - Step 1 中包含 manifest.json 创建指令
  - 文件中存在 `PROJECT_NOT_INITIALIZED` 错误处理协议
  - 项目级文件的核心行为约束与用户级文件的 DD-1 修复一致

- **依赖**: TASK-3
- refs: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-7, DD-1]
- files: [D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md]
- **verification_commands**:
  - unit: `pwsh -Command "if (Select-String -Path 'D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md' -Pattern '硬性前置条件' -SimpleMatch) { exit 0 } else { exit 1 }"`
  - unit: `pwsh -Command "$lines = Get-Content 'D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md'; $startup = ($lines | Select-String -Pattern '启动流程' -SimpleMatch | Select-Object -First 1).LineNumber; $intent = ($lines | Select-String -Pattern '意图分类' -SimpleMatch | Select-Object -First 1).LineNumber; if ($startup -lt $intent) { exit 0 } else { exit 1 }"`
  - unit: `pwsh -Command "if (Select-String -Path 'D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md' -Pattern 'manifest\.json' -SimpleMatch) { exit 0 } else { exit 1 }"`
  - unit: `pwsh -Command "if (Select-String -Path 'D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md' -Pattern 'PROJECT_NOT_INITIALIZED' -SimpleMatch) { exit 0 } else { exit 1 }"`
- **manual_verification_checks**:
  - 对比两份 orchestrator.md 文件中 DD-1 修复部分的一致性

---

### TASK-5 创建 CP-2 属性测试：sf_state_transition 守卫幂等性

**context_block**（executor 必读）：
- **What**: 创建 `packages/daemon-core/tests/property/transition-guard-idempotency.property.test.ts`，使用 fast-check 验证 DD-2 守卫的幂等性。测试内容：
  1. 对任意项目路径 p，若 `p/.specforge/manifest.json` 不存在 → `sf_state_transition(from="", to="intake")` 返回 `{success: false, error: "PROJECT_NOT_INITIALIZED"}`（无论调用多少次）
  2. 若 `p/.specforge/manifest.json` 存在 → 正常创建 Work Item（与修复前行为一致）
  3. 守卫结果仅取决于 manifest.json 的存在性，与调用次数、时间间隔、并发无关
- **Why**: 实现 CP-2 属性测试。验证 DD-2 代码守卫的行为是确定性的：manifest.json 缺失时始终返回 PROJECT_NOT_INITIALIZED，存在时始终正常流转。确保守卫不会因调用次数或状态变化而产生不一致行为。满足 REQ-1 和 REQ-5。
- **Refs**: DD-2（代码级守卫）、CP-2（守卫幂等性定义见 design.md CP-2 段）、TASK-1（被测试的 handler 实现）、REQ-1、REQ-5
- **Constraints**:
  - 使用 vitest + fast-check（项目已有依赖）
  - 测试必须模拟文件系统状态（使用 `fs.mkdir`/`fs.writeFile`/`fs.rm` 在临时目录中创建/删除 manifest.json）
  - 必须 import handler 函数或模拟 `deps.workflowEngine.transitionFull` 来测试守卫逻辑
  - 属性测试参数：随机路径、随机调用次数（1-20 次）
  - 遵守现有 property 测试模式（`import { describe, it, expect } from 'vitest'; import * as fc from 'fast-check'`）
  - 测试文件路径：`tests/property/transition-guard-idempotency.property.test.ts`（与 design.md CP-2 定义的 test_file 一致）
- **Done When**:
  - `fc.assert` 在至少 100 次随机输入下全部通过
  - `npx vitest run tests/property/transition-guard-idempotency.property.test.ts` 全部通过

- **依赖**: TASK-1
- refs: [REQ-1, REQ-5, DD-2, CP-2]
- files: [packages/daemon-core/tests/property/transition-guard-idempotency.property.test.ts]
- **verification_commands**:
  - property: `npx --prefix packages/daemon-core vitest run tests/property/transition-guard-idempotency.property.test.ts`
- **manual_verification_checks**:
  - （无——属性测试已覆盖核心幂等性验证）

---

### TASK-6 创建 CP-1 属性测试：启动流程顺序守卫

**context_block**（executor 必读）：
- **What**: 创建 `packages/daemon-core/tests/property/startup-flow-ordering.property.test.ts`，验证 prompt 文件结构满足 CP-1 的要求。由于 LLM 行为无法在单元测试中直接验证，此测试通过检查 orchestrator.md 文件的**结构属性**来间接保证行为正确性：
  1. "启动流程"章节出现在"意图分类"章节之前（行号验证）
  2. 硬性前置条件守卫声明存在（"绝不执行意图分类、绝不创建 Work Item"）
  3. "处理用户每条消息的第一步"声明已被移除
  4. manifest.json 创建指令存在
  5. PROJECT_NOT_INITIALIZED 错误处理协议存在
  6. 对任意会话状态（未初始化/已初始化/有进行中 WI），启动流程入口判定逻辑存在
- **Why**: 实现 CP-1 属性测试。由于 orchestrator 是 LLM Agent，其行为依赖 prompt 文本内容。此测试通过验证 prompt 文件的结构属性（章节顺序、关键声明存在性、冲突声明移除），提供"启动流程先于意图分类"的可机器验证证据。满足 REQ-4。
- **Refs**: DD-1（Prompt 执行顺序守卫）、CP-1（启动流程严格先于意图分类，定义见 design.md CP-1 段）、TASK-3（被验证的 orchestrator.md）、REQ-4
- **Constraints**:
  - 使用 vitest（不需要 fast-check，这是结构验证而非随机属性测试——但为与 design.md 定义的 `test_type: property` 一致，仍放在 property 测试文件中）
  - 必须读取用户级 orchestrator.md 文件（`C:\Users\luo\.config\opencode\agents\sf-orchestrator.md`）
  - 使用 `node:fs` 读取文件，`node:path` 解析路径
  - 测试文件路径：`tests/property/startup-flow-ordering.property.test.ts`（与 design.md CP-1 定义的 test_file 一致）
  - TypeScript 编译在 Node 18+ 通过
- **Done When**:
  - 所有结构断言通过（章节顺序、守卫声明、冲突声明移除、manifest.json 指令、错误处理协议）
  - `npx vitest run tests/property/startup-flow-ordering.property.test.ts` 全部通过

- **依赖**: TASK-3
- refs: [REQ-4, DD-1, CP-1]
- files: [packages/daemon-core/tests/property/startup-flow-ordering.property.test.ts]
- **verification_commands**:
  - property: `npx --prefix packages/daemon-core vitest run tests/property/startup-flow-ordering.property.test.ts`
- **manual_verification_checks**:
  - 在新项目目录中启动 OpenCode，人工观察 orchestrator 是否在意图分类前执行启动流程

---

### TASK-7 创建 CP-3 集成测试：已有项目不受影响

**context_block**（executor 必读）：
- **What**: 创建 `packages/daemon-core/tests/integration/existing-project-startup.integration.test.ts`，验证已有项目（`.specforge/` 已存在、`manifest.json` 已存在且 `schema_version ≥ "6.0"`）在修复后不受影响。测试场景：
  1. 已有项目 → 启动流程 Step 1 正常读取 manifest.json → 检查 schema_version ≥ 6.0 → 继续 Step 2-4
  2. 意图分类正常路由用户请求到工作流
  3. `sf_state_transition(from="", to="intake")` 正常创建 Work Item（DD-2 守卫不触发）
  4. 会话恢复流程正常（`.specforge/` 存在 + 进行中 WI → 恢复提示）
  5. 已有项目中的 `fromState ≠ ""` 流转不受 DD-2 守卫影响
- **Why**: 实现 CP-3 集成测试。验证修复不会破坏已有项目的正常行为（REQ-8 会话恢复、REQ-9 已有项目启动流程）。这是最重要的回归测试——必须确保修复对现有用户零影响。满足 REQ-8 和 REQ-9。
- **Refs**: DD-1（启动流程修改）、DD-2（代码守卫——验证已有项目中守卫不触发）、CP-3（已有项目不受影响，定义见 design.md CP-3 段）、TASK-1、TASK-3、REQ-8、REQ-9
- **Constraints**:
  - 使用 vitest（集成测试不需要 fast-check）
  - 测试必须在临时目录中创建模拟的已有项目结构（`.specforge/`、`manifest.json`、`runtime/state.json`）
  - 必须测试 DD-2 handler 在 `manifest.json` 存在时守卫不触发（`transitionFull` 正常调用）
  - 必须测试 `fromState ≠ ""` 时守卫完全跳过
  - 测试文件路径：`tests/integration/existing-project-startup.integration.test.ts`（与 design.md CP-3 定义的 test_file 一致）
  - TypeScript 编译在 Node 18+ 通过
- **Done When**:
  - 所有集成测试场景通过
  - `npx vitest run tests/integration/existing-project-startup.integration.test.ts` 全部通过

- **依赖**: TASK-1, TASK-3
- refs: [REQ-8, REQ-9, DD-1, DD-2, CP-3]
- files: [packages/daemon-core/tests/integration/existing-project-startup.integration.test.ts]
- **verification_commands**:
  - integration: `npx --prefix packages/daemon-core vitest run tests/integration/existing-project-startup.integration.test.ts`
- **manual_verification_checks**:
  - 在已有项目（SpecForge 自身项目目录）中启动 OpenCode，验证正常路径不受影响

---

## 执行顺序

```
Step 1: Batch 1 并行执行
  ├── TASK-1（DD-2 handler 守卫 + 单元测试）
  ├── TASK-2（DD-3 manifest.json 规范化 + CP-4 测试）
  └── TASK-3（DD-1 用户级 orchestrator.md 重构）

Step 2: Batch 2 并行执行（所有依赖已满足）
  ├── TASK-4（DD-1 项目级 orchestrator.md 同步）
  ├── TASK-5（CP-2 属性测试）
  ├── TASK-6（CP-1 属性测试）
  └── TASK-7（CP-3 集成测试）
```

---

## Batch 3：用户级插件同步

---

### TASK-8 同步用户级插件 sf_specforge.ts

**context_block**（executor 必读）：
- **What**: 将项目级插件（`D:\code\temp\SpecForge\.opencode-\plugins\sf_specforge.ts`）的 WI-031 更新同步到用户级插件（`C:\Users\luo\.config\opencode\plugins\sf_specforge.ts`）
- **Why**: WI-031 的插件修改（register、sessionId、shell.env）只落在项目级，用户级插件仍是旧版。新项目无项目级配置时，OpenCode 加载用户级插件，导致所有 B 层事件处理功能不可用
- **Refs**: DD-AB1（sessionId↔projectPath 绑定契约）, WI-031 交付物
- **Constraints**:
  - 用户级插件服务于所有项目（全局），代码必须通用
  - 从 `PluginInput.directory` 提取 `projectPath`
  - 启动时 `try-catch` 调用 `daemonClient.register(projectPath)`
  - 所有 `postEvent` 使用新签名 `postEvent(sessionId, type, data)`
  - 包含 `shell.env` hook
  - daemon 不可达时降级运行（sessionId=""，不抛异常）
- **Done When**:
  - 用户级插件包含 register、sessionId 传播、shell.env hook
  - 与项目级插件功能一致
  - `npx tsc --noEmit` 编译无错误（仅检查插件文件，预存错误不计）

- **依赖**: 无（直接复制/适配项目级插件）
- **refs**: [DD-AB1]
- **files**: [C:\Users\luo\.config\opencode\plugins\sf_specforge.ts]
- **verification_commands**:
  - unit: `echo "Manual verification: restart OpenCode in a test project, check if plugin registers and sends sessionId"`
- **预估复杂度**: S（直接复制适配，~30 行差异）

---

## 配置参考

### runtimes（来自 templates/prod-environment.md）
| 运行时 | 最低版本 |
|--------|----------|
| Node.js | 18.0.0 |
| TypeScript | 5.8.2 |
| vitest | 3.0.7 |
| fast-check | 4.8.0 |

### 项目规则
- `.specforge/project-rules.md` 不存在——本 bugfix 无特殊项目规则约束
- 所有 TypeScript 代码必须通过 `tsc --noEmit` 编译（node_modules 依赖已在 package.json 声明）
- 测试文件遵循现有目录结构：`tests/unit/`、`tests/property/`、`tests/integration/`
- 测试框架：vitest（配置详见 `packages/daemon-core/vitest.config.ts`）
