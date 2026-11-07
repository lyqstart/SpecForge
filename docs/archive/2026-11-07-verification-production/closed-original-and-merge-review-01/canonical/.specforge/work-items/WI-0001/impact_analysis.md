# Impact Analysis — WI-0001

分析时点权威状态：impact_analyzing（StateManager）；本版为 candidate_preparing 可写窗口内的 owner 修订版（封存重试依据：CANDIDATE_IMPLEMENTATION_TRUTH_INVALID 修复轮）。
证据来源：intake.md（用户原话与项目观测）、spec_manifest.json（PSV-0001）、modules/CORE 只读观测、项目根目录只读观测、implementation_baseline.json（Runtime 物化）。

## Implementation Baseline

implementation_baseline_snapshot_id: sha256:8f8ac52aeb32950630565ea6fa66a62d4fe0afd6acb9ec26635a509b958b2722

- 来源：`.specforge/work-items/WI-0001/implementation_baseline.json`（captured_at: 2026-10-25T05:23:36.211Z）
- `README.md`：既有（123 bytes，sha256:757ee94ea46933c3dd7092c04d15a32546a3f54e609b9c6e66351eeafe8fdf40）→ 本 WI 为追加式修改
- `package.json`、`src/greet.ts`、`tests/greet.test.ts`、`tsconfig.json`：基线 matched_files 为空 → 本 WI 新建

## 1. 变更语义

在 Greeting Library（项目首个正式功能）中实现：`src/greet.ts` 导出 `greet(name: string): string`，两条行为规则（非空 → `Hello, <name>!`；空 → `Hello, world!`），并交付可验证该两行为的测试与使用说明。基线事实：5 条计划路径中 README.md 为既有文件（追加式修改），其余 4 条为新建文件。

## 2. 受影响模块

- `CORE`（唯一已声明模块，default_module，active，尚无 code_paths）。全部计划路径归属 CORE，无跨模块影响（无其他模块存在）。

## 3. 计划代码路径（planned_code_paths）

- `src/greet.ts`（新建：功能实现）
- `tests/greet.test.ts`（新建：两条 AC 的自动化测试，测试运行器选型由设计决策固化，零依赖优先）
- `README.md`（追加式修改：追加使用说明，保留现有标题与项目性质描述）
- `package.json`（新建：最小工程配置，声明库入口与 test script；不引入运行时第三方依赖）
- `tsconfig.json`（新建：最小 TypeScript 编译配置）

## 4. 受影响项目真相源（预期由候选合并更新，本阶段不直接修改）

- `.specforge/project/architecture.md`（占位 → 首份正式架构）
- 首份正式 Data Model（由 Runtime 依候选物化至正式路径）
- `.specforge/project/modules/CORE/module.json`（登记 code_paths）
- `.specforge/project/modules/CORE/design.md`（占位 → 首份正式模块设计）
- `.specforge/project/modules/CORE/requirements.md`（首份正式模块需求）
- CORE Module Contract（首份正式模块契约）
- `.specforge/project/requirements_index.md`、`design_index.md`、`trace_matrix.md`、`modules/CORE/trace.md`（索引与追溯更新）

## 5. 现有消费者与破坏性

- 项目无既有导出、无下游模块、无既有规格条目（PSV-0001 正式层均为占位）。5 条计划路径中仅 README.md 为既有文件（追加式修改，既有内容逐字节保留）；对既有消费方无破坏性变更。

## 6. 影响范围字段结论（Impact Scope，与 trigger_result.json 一致）

- affected_modules: ["CORE"]
- architecture_refs / data_model_refs / design_refs / project_contract_refs / module_contract_refs: []（当前正式层均为占位/缺失，不存在可引用的真实 ID；首份 ID 由本 WI 候选创建，不得预填占位）
- planned_code_paths: 见第 3 节

## 7. 风险与未知

1. 测试运行器与工程配置选型：设计阶段以零依赖方案（Node 内置 node:test）优先决策并固化为 DD。
2. Node/TS 版本未取证（D18 禁止执行环境探测命令）；实现/验证阶段以真实运行证据确认，若被治理拒绝则按可恢复 HardStop 协议处理。
3. 测试执行受 D18 当前边界约束：本 WI 到 approval_required 停止，不执行任何测试；测试的编写属于实现任务，运行与证据属于批准后的验证阶段。

## 8. 验证策略指向

两条验收标准各需至少一条可复核证据（批准后在合法执行边界内运行测试取得）；验收清单由 sf-requirements 固化，验证深度由 sf-verifier 在验证阶段裁定。
