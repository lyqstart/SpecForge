---
work_item_id: WI-0001
module_id: CORE
workflow_type: feature_spec
workflow_path: requirement_change_path
candidate_type: candidate_design
base_spec_version: PSV-0001
implementation_baseline_id: sha256:8f8ac52aeb32950630565ea6fa66a62d4fe0afd6acb9ec26635a509b958b2722
analysis_scope: system_governance
capability_verdict: reuse_existing
---

# Design Candidate — WI-0001 / CORE（Greeting Library 首个功能模块设计）

analysis_scope: system_governance
capability_verdict: reuse_existing

> 裁决对象声明：`capability_verdict` 只裁决 **SpecForge 治理能力栈**（Standard → Contract → Workflow Skill → Agent → Tool → Runtime → Audit）能否承载本 WI；业务侧测试框架选型（node:test）、目标库零依赖约束属于 Solution Strategy / 项目事实，**不属于本裁决对象**。

## 候选绑定与 Basis 引用键

- Work Item: WI-0001（feature_spec / requirement_change_path）；模块归属: CORE（spec_manifest.json PSV-0001 唯一已声明模块）
- implementation_baseline_id: `sha256:8f8ac52aeb32950630565ea6fa66a62d4fe0afd6acb9ec26635a509b958b2722`（Architecture/Data Model Candidate 顶部同 ID 绑定）
- 上游输入（只读）：`requirements.candidate.md`（REQ-CORE-001～REQ-CORE-006、AC-CORE-001～AC-CORE-018 已冻结）、intake.md、trigger_result.json、change_classification.md、impact_analysis.md

### 设计侧新增 Basis 引用键（承接需求候选既有键 UQ-*/FACT-*/CONSTRAINT-*/IMPACT-*/UNKNOWN-*/CLS-1）

| 引用键 | 内容 | 来源 |
| --- | --- | --- |
| HOST-1 | 主机观测：node 24.19.0、npm 11.17.0、git 2.55.0、win32、pwsh7（主机级扫描证据，非项目内取证） | host-profile.json |
| PR-1 | project-rules：主语言 TypeScript；零依赖优先；测试优先 Node 内置 node:test，最终选型由设计 DD 固化并经用户批准 | .specforge/config/project-rules.md |
| PR-2 | project-rules：最小工程配置（package.json/tsconfig.json）随首个功能任务受控创建，不引入运行时第三方依赖 | .specforge/config/project-rules.md |
| PE-1 | prod-environment：无生产部署、无数据库、无外部服务依赖；Node 具体版本未取证，设计采用零依赖方案规避 | .specforge/config/prod-environment.md |
| BL-1 | 实现基线：README.md 既有（sha256:757ee94e…，123 bytes）；src/greet.ts、tests/greet.test.ts、package.json、tsconfig.json 基线缺失待新建 | implementation_baseline.json（已逐项核对） |
| ER-1 | extension_registry.json 全空（namespaces 与 contracts 均为空数组）：项目无任何已登记跨模块契约，本 WI 走 CORE Module Contract 首建，无既有契约可违反 | .specforge/project/extension_registry.json |
| REG-1 | CORE 现状：module.json 为 {active, 无 code_paths}；modules/CORE/design.md 为 "> TODO" 占位；项目 architecture.md 为占位 | 只读观测（2026-10-25） |

## 1. Problem Understanding

- **症状**：项目除 README.md（文档基线）外无任何正式功能代码、测试、工程配置；`.specforge/project/**` 正式层全为占位/缺失（REG-1、FACT-4）。
- **直接问题**：需在现有治理链内同时完成（a）首份正式 Project Architecture / Data Model / CORE Module Definition / Module Contract / Module Design 的创建，（b）REQ-CORE-001～REQ-CORE-006 的设计承接，（c）待决项 D-1（测试运行器与最小工程配置，零依赖优先）的设计裁决。
- **根因假设**：无缺陷根因——这是 greenfield 初始状态的**治理对象首次实例化**，不是既有实现的故障；不存在需修复的既有代码路径。
- **待证事实**：
  1. D-2：项目内 Node.js/TypeScript 具体可用版本未取证（UNKNOWN-2；D18 当前禁止执行环境探测）；缓解策略见 DD-CORE-003 §D-2，批准后验证阶段以真实运行证据确认。
  2. 测试执行边界：本 WI 停在 approval_required；测试编写属批准后实现任务，测试运行与证据属批准后验证阶段（CONSTRAINT-1、impact_analysis §7.3）。
  3. 网络/npm registry/CI 不可用性按 CONSTRAINT-2 作为设计硬约束对待（不假设可用，也不假设必然不可用——设计选择不依赖它们）。

## 2. Existing Architecture Analysis

以 2026-10-25 只读取证与 implementation_baseline.json（snapshot sha256:8f8ac52a…）逐项核对为准：

- **项目文件面**：根目录仅 `.git/`、`.specforge/`、`README.md`。README.md 既有（123 bytes，sha256:757ee94e… 与基线记录一致），标题 "Greeting Library"，正文声明本项目为隔离治理验收用的合成 TypeScript 库、无生产数据（FACT-1、FACT-3）。
- **业务实现现状（CORE 的"当前实现"）**：**无既有业务源代码、无既有测试、无既有工程配置**——基线证据为 4 条计划代码路径（src/greet.ts、tests/greet.test.ts、package.json、tsconfig.json）matched_files 全部为空（BL-1）。README.md 是唯一既有交付文件，本 WI 对其实施**追加式修改**（使用说明），不是重建。因此本设计是"在既有文档基线之上的首个功能差量"，而非替换任何既有入口、组件、行为或测试——当前不存在这些对象。
- **规格治理面**：spec_manifest.json PSV-0001（唯一模块 CORE，default_module）；architecture.md、modules/CORE/design.md 为占位；module.json active 无 code_paths；extension_registry.json 全空（ER-1、REG-1）。
- **真实组件与调用链**：当前运行时组件数 = 0；本 WI 建成后的目标组件仅 C1（greet 公共 API）一个运行时组件 + C2（测试）/C3（文档）/C4/C5（工程配置）三个支撑面（详见 architecture.candidate.md 组件表与依赖图）。
- **状态权威与写入边界**：治理状态权威在 StateManager/events.jsonl；本阶段（candidate_preparing）设计产出仅允许经 `sf_artifact_write` 写入 candidates/**；`.specforge/project/**` 真相源只能经 Gate → User Decision → Merge 更新。

## 3. Governance Classification

问题发生在治理栈的哪些层：

| 层 | 是否触及 | 判定 |
| --- | --- | --- |
| Standard（规范产物层） | 是（首次实例化，非修改） | 首次创建 architecture/data_model/module_definition/module_contract/design 五类 canonical 产物；产物类型与 schema 均已由当前治理合同定义，无需新类型 |
| Contract（契约层） | 是（首次登记） | CORE Module Contract 首建（INV-CORE-001/002/003、PI-CORE-001）；消费方全部在 CORE 模块内部（DD-CORE-001/002/003/004/006），无跨模块消费，不触发 Project Contract Promotion |
| Workflow Skill | 使用，不修改 | feature_spec / requirement_change_path 由 Runtime 依 11 项事实分类路由（trigger_result.json），现有阶段协议直接承载 |
| Agent | 使用，不修改 | sf-requirements 已产出冻结需求候选；sf-task-planner/sf-executor/sf-verifier 在位待调度 |
| Tool | 使用，不修改 | sf_artifact_write 支持 5 种目标 file_type；sf_doc_lint/sf_batch_verify 可做只读自检 |
| Runtime | 不修改 | candidate_manifest.json 由 Runtime 在 candidate 封口边界物化；状态推进由 StateManager 独占 |
| Audit | 使用，不修改 | Candidate Gate 体系（required_files/schema/spec_consistency/trace/workflow_specific）与 changed_files_audit 现有 |

结论：本 WI 是**治理对象的首次实例化**（greenfield 首建），不是治理缺陷修复；不产生对 Standard/Contract/Skill/Agent/Tool/Runtime/Audit 任一层的能力变更诉求。

## 4. Existing Capability Assessment

逐层核查现有 SpecForge 治理链能否直接承载本 WI 全程（分析→Gate→审批→Merge→实现→验证→关闭）：

| 层 | 现有能力 | 本 WI 需求 | 是否需要扩展 |
| --- | --- | --- | --- |
| Standard | canonical file_type 集合含 candidate_architecture / candidate_data_model / candidate_module_definition / candidate_module_contract / candidate_design / trace_delta（sf_artifact_write 契约实证：本次前 4 类已成功受控写入） | 6 类产物写入 | 否 |
| Contract | ModuleContractFileSchema 四桶结构（shared_enums/invariants/public_interfaces/extension_points）+ schema 校验（本次重试中实证 invariants 必填 rule/scope[global\|module]） | CORE 单模块契约登记 | 否 |
| Workflow Skill | feature_spec requirement_change_path 全阶段协议（trigger 已路由，需求候选已冻结） | 同左 | 否 |
| Agent | sf-design（本 Agent）、sf-task-planner、sf-executor、sf-verifier 职责链在位 | 设计→拆任务→实现→验证 | 否 |
| Tool | sf_artifact_write / sf_doc_lint / sf_batch_verify / 只读 Read/Glob/Grep | 候选写入与只读自检 | 否 |
| Runtime | candidate_manifest 由 Runtime 在 candidate_preparing→candidate_prepared 边界物化（Agent 无需也不得手写） | 候选封口 | 否 |
| Audit | Candidate Gate Profile + user_decision + merge_run + changed_files_audit + verification/close gate | 审批、合并、实现审计、验证、关闭 | 否 |

**capability_verdict: reuse_existing**。依据：上表七层全部"否（无需扩展）"；本 WI 从触发到当前候选写入的每一步均由现有工具与流程完成（trigger_result → 需求候选 → 本候选集均为现有 file_type 的受控写入实证）。无 `new_capability_justification` 需要填写；无缺失证据导致 blocked。

## 5. Solution Strategy

### 5.1 最小变更策略与"不改什么"

最小变更：1 个函数文件 + 1 个测试文件 + 2 个最小配置文件 + README 追加章节；规格面 5 份首建候选 + 1 份 trace 增量。**明确不改**：不改模块边界（module_boundary_changed=false，不新增模块）；不扩展输入分支（CONSTRAINT-1：不实现 null/undefined/纯空白的特殊处理或 trim）；不引入任何第三方依赖（运行时与开发期均零安装）；不修改 README 既有 123 bytes 内容（仅追加）；不修改 SpecForge 治理链（§4 裁决 reuse_existing）；不新增 Tool/Skill/Agent/治理层。

### 5.2 设计决策

#### DD-CORE-001 greet 公共 API 设计

- **refs**: [REQ-CORE-001, REQ-CORE-002, REQ-CORE-003]
basis_refs: [UQ-1, UQ-2, UQ-3, BL-1, FACT-3]
constrained_by: ARCH-CORE-001（单一模块库架构）, ARCH-CORE-003（纯函数行为面）, PI-CORE-001（本 WI Module Contract 候选）, DATA-CORE-001/DATA-CORE-002（输入定义域与输出模板）

设计内容：`src/greet.ts`（新建）提供唯一具名导出 `greet`，实现为自包含纯函数：零 import、无状态、无副作用、无 I/O；行为完全由 PI-CORE-001 与 DATA-CORE-001/002 固定（E0 → 常量 `"Hello, world!"`；E1 → `"Hello, " + name + "!"` 三段拼接）。不引入任何抽象层/接口层/类层次——全库仅一个公共调用面，无第二个实现或调用点（DD4/YAGNI：不为例外做抽象）。

接口定义（DD2 规则，TypeScript）：

```typescript
// CORE 唯一公共 API —— PI-CORE-001（contracts.candidate.json）
// 位置：src/greet.ts；纯函数导出，无类、无状态、无外部调用
export function greet(name: string): string;
// Errors: 无 —— 在定义域（string 输入）内不抛出任何异常、不产生副作用；
//         null/undefined/非 string 输入行为未定义（PI-CORE-001.undefined_behavior）。
```

#### DD-CORE-002 两条行为规则与定义域分支设计

- **refs**: [REQ-CORE-002, REQ-CORE-003]
basis_refs: [UQ-2, UQ-3, CONSTRAINT-1, CLS-1]
constrained_by: PI-CORE-001, INV-CORE-001, INV-CORE-002, DATA-CORE-001, DATA-CORE-002, DATA-CORE-003

设计内容：函数体内**有且仅有两个行为分支**，判据为 `name` 是否长度为 0：`name === ""` → 返回常量 `"Hello, world!"`（13 字符精确常量）；否则（长度 ≥ 1，含纯空白字符串）→ 返回 `"Hello, " + name + "!"`，name 逐字符原样保留（禁 trim/大小写变换/归一化/截断）。**禁止**为 null/undefined/非 string 编写任何分支、校验或抛错（CONSTRAINT-1；这些输入在契约中未定义）。两条分支均为纯返回，无错误路径（见 5.6）。

#### DD-CORE-003 零依赖测试运行器与执行路径（D-1 结论）

- **refs**: [REQ-CORE-004, REQ-CORE-006]
basis_refs: [UNKNOWN-1（D-1 待决项）, CONSTRAINT-2, PR-1, PE-1, HOST-1, ER-1]
constrained_by: ARCH-CORE-002（零运行时依赖架构）, ARCH-CORE-004（工具链与运行时隔离）, INV-CORE-003

**D-1 裁决**：测试运行器选用 **Node 内置 `node:test` 运行器 + `node:assert/strict` 断言库**；测试以 TypeScript 编写于 `tests/greet.test.ts`，由 `node --test tests/greet.test.ts` 经 Node 内置 type stripping 直接执行；**零安装路径**（无 devDependencies、无 npm install 前置步骤）。

依据与备选排除（reasoning）：
1. CONSTRAINT-2 禁止假设 npm registry/网络/CI 可用 → 任何需要安装的方案（jest/vitest/mocha/ts-node/tsx 等，无论作为运行时或 devDependency）都被排除——它们以"先安装"为前提，本项目的合法执行边界内无法保证。
2. PR-1 明示"优先 Node 内置 node:test（零依赖）"，与本 WI 零依赖基线一致。
3. Node 内置 type stripping：Node 22.6 起以 `--experimental-strip-types` 提供，Node 23.6 起默认启用，Node 24.x 延续默认（HOST-1：主机观测 node 24.19.0，处于默认启用区间）。测试文件仅使用可擦除语法（类型标注），不使用 enum/namespace/参数属性等不可擦除特性。
4. 测试对被测对象的引用使用显式 `.ts` 说明符：`import { greet } from "../src/greet.ts"`（type stripping 的要求，与 DD-CORE-004 tsconfig `allowImportingTsExtensions` 配套）。

**D-2 缓解策略**（版本未取证的工程风险，不转化为运行时约束）：
- 主路径：`node --test tests/greet.test.ts`（Node ≥ 23.6 默认支持；主机观测 24.19.0 满足）。
- 降级路径：若验证阶段实测项目运行时为 Node 22.6–23.5，则以 `node --experimental-strip-types --test tests/greet.test.ts` 运行（同一测试文件，仅命令行差异）。
- 熔断路径：若实测 Node < 22.6（不支持 type stripping），**不得**引入第三方转译依赖兜底；按可恢复 HardStop 协议上报能力缺口并保留证据，等待 Orchestrator/用户处置。
- 版本事实最终由批准后验证阶段的真实运行输出取证（EVREQ-4B），本设计只声明下限与降级链，不声称"测试已运行"。

失败处理（DD5 规则适用性）：本设计**无外部调用**（无网络、无数据库、无服务），不设 timeout/retry/circuit-breaker；唯一的"外部依赖"是宿主 Node 运行时本身，其风险由上述 D-2 缓解链承接。

#### DD-CORE-004 最小工程配置设计

- **refs**: [REQ-CORE-001, REQ-CORE-004, REQ-CORE-006]
basis_refs: [PR-2, CONSTRAINT-2, IMPACT-1, BL-1]
constrained_by: ARCH-CORE-001, ARCH-CORE-002, ARCH-CORE-004, INV-CORE-003

设计内容（两个新建根级文件，全部归属 CORE code_paths）：

`package.json`（最小形态，字段级设计）：
- `name`: "greeting-library"；`version`: "0.1.0"；`private`: true（不发布，范围外 #8）
- `type`: "module"（与 type stripping/ESM import 语义一致）
- `scripts.test`: `node --test tests/greet.test.ts`（DD-CORE-003 主路径的唯一合法测试入口）
- `dependencies`: `{}` —— **显式空对象**，作为 EVREQ-6A 的可检查零运行时依赖配置证据
- 不设 `main`/`exports`/`devDependencies`/构建脚本：无任何 REQ 要求包入口形态；调用方直接 import 源文件（YAGNI，范围外 #8）

`tsconfig.json`（类型检查专用，noEmit）：
- `compilerOptions`: `target: "ES2022"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `noEmit: true`, `allowImportingTsExtensions: true`（与 DD-CORE-003 显式 .ts import 配套；`noEmit + allowImportingTsExtensions` 是配套合法组合）
- `include`: `["src/**/*.ts", "tests/**/*.ts"]`
- 语义：仅用于开发期类型检查（AC-CORE-002 签名的静态复核路径之一），**不产生构建产物、不构成执行前置**——即使 tsc 不可用，DD-CORE-003 测试执行路径不受影响（工具链与运行时隔离）。

#### DD-CORE-005 README 使用说明追加设计

- **refs**: [REQ-CORE-005]
basis_refs: [UQ-4, FACT-1, FACT-3, BL-1]
constrained_by: ARCH-CORE-001（README 属 CORE code_paths）

设计内容：在 README.md **既有内容之后追加**章节（保留既有标题 "# Greeting Library" 与项目性质描述行，逐字节不动——基线 sha256:757ee94e 锚定）。追加内容必须包含三要素：
1. 调用方式：从 `./src/greet.ts` import `greet` 的示例与签名 `greet(name: string): string`；
2. 非空名称行为：示例 `greet("Ada")` → `"Hello, Ada!"`（模板与 REQ-CORE-002/AC-CORE-004 逐字符一致）；
3. 空名称行为：示例 `greet("")` → `"Hello, world!"`（与 REQ-CORE-003/AC-CORE-007 一致）。
文档示例即验收证据 EVREQ-5A 的内容面；示例与实现行为不一致即违反 AC-CORE-015（not_done_when）。

#### DD-CORE-006 测试断言与验证钩子设计

- **refs**: [REQ-CORE-002, REQ-CORE-003, REQ-CORE-004]
basis_refs: [UQ-4, UNKNOWN-1, CONSTRAINT-1, IMPACT-1]
constrained_by: PI-CORE-001, INV-CORE-001, INV-CORE-002, ARCH-CORE-004

设计内容：`tests/greet.test.ts`（新建）使用 `node:test` 的 `test()` 组织断言、`node:assert/strict` 的 `strictEqual` 做严格相等断言。断言清单（inventory，实现由批准后任务写入）：

| # | 断言（设计规格） | 覆盖 | 证据钩子 |
| --- | --- | --- | --- |
| A1 | `greet("Ada")` 严格等于 `"Hello, Ada!"` | REQ-CORE-002/AC-CORE-004 | EVREQ-2A（非空名称之一） |
| A2 | `greet("Grace")` 严格等于 `"Hello, Grace!"` | REQ-CORE-002/AC-CORE-004 | EVREQ-2A（互不相同非空名称之二） |
| A3 | `greet("")` 严格等于 `"Hello, world!"` | REQ-CORE-003/AC-CORE-007 | EVREQ-3A |
| A4 | 纯空白名称（如 `"  "`）严格等于 `"Hello, " + name + "!"` 拼接形态 | REQ-CORE-002/定义域边界（空白属非空、不归一化） | INV-CORE-002 补充断言 |

计数满足 AC-CORE-010（REQ-CORE-002 断言 ≥ 1、REQ-CORE-003 断言 ≥ 1）；A1/A2 满足 EVREQ-2A"≥ 2 个互不相同非空名称"。运行与通过证据属于批准后验证阶段（EVREQ-4B），本阶段禁止任何"已运行/已通过"表述（AC-CORE-012）。

### 5.3 模块架构图

见 `architecture.candidate.md` §2（同一架构事实的唯一权威图示：运行时依赖图仅 CALLER→C1 一条边；C2→C1 为验证依赖；C3/C4/C5 为文档/工具链支撑面）。本设计不重复维护第二张依赖图（A2 单一真相源）。

### 5.4 数据模型引用

输入定义域（E0/E1）、输出模板（T1/T2）、name 不变式、无持久化声明见 `data_model.candidate.md` DATA-CORE-001～004。本设计的 DD-CORE-001/DD-CORE-002 直接受其约束（constrained_by 已逐条声明），不复制第二套语义。

### 5.5 组件接口清单与 Errors（A3/A4 自检）

| 组件 | interface | Errors |
| --- | --- | --- |
| C1 greet 公共 API | `greet(name: string): string`（PI-CORE-001；纯函数，调用方依赖函数签名而非任何 class） | 无（定义域内不抛出；域外行为未定义，非错误路径） |
| C2 测试套件 | 开发期组件：`node --test` 入口消费 tests/greet.test.ts，无对外接口 | 运行器缺失/版本不满足 → D-2 降级链（DD-CORE-003），不是被测对象错误 |
| C3 使用说明 | 文档（无代码接口） | 不适用；内容与行为不一致由 AC-CORE-015 验收拦截 |
| C4 package.json | `scripts.test`（唯一开发期命令入口）；`dependencies` 恒空 | 不适用（声明式配置） |
| C5 tsconfig.json | 类型检查配置（noEmit） | tsc 不可用不阻塞任何验收路径（DD-CORE-004） |

可替换性（A3）：C1 以函数签名被消费，测试与文档均只依赖签名与行为契约，不依赖实现内部；无 mock 需求（纯函数）。

### 5.6 错误处理策略

- 运行时错误路径：**不存在**。greet 在定义域内不抛出、不返回错误码、无降级返回；域外输入（null/undefined/非 string）行为未定义且禁止编写分支（CONSTRAINT-1）——不是"被吞掉的错误"，而是契约明确排除的定义域外区域。
- 工程期失败模式与落点：测试运行失败（断言不过）→ 验证阶段证据直接呈现失败输出；运行器不可用/版本不足 → DD-CORE-003 D-2 降级链 → 熔断路径按可恢复 HardStop 协议上报；类型检查不可用 → 不阻塞验收（DD-CORE-004 隔离设计）；README 与行为不一致 → AC-CORE-015 验收拦截。
- 所有工程期失败的可观测落点：测试运行器的退出码与输出（批准后验证阶段取证）、治理日志与 HardStop 证据文件（如触发）。

## 6. Impact Analysis

- **契约影响判定**：本 WI 为**公共契约/语义首建**（PI-CORE-001 为新增公共接口；INV-CORE-001/002/003 为新增模块不变式），非内部实现改写。因 greenfield 无任何既有消费方（ER-1、impact_analysis §5），**无反向依赖穷举对象、无破坏性变更**；未来消费者经 Prospective Trace（`DD-* constrained_by Contract-ID`）登记。
- **受影响治理产物（经批准合并后更新，本阶段零直写）**：`.specforge/project/architecture.md`（占位→首份正式）；正式 Data Model（Runtime 依候选物化）；`modules/CORE/module.json`（登记 5 条 code_paths）；`modules/CORE/design.md`（占位→首份正式）；CORE `contracts.json`（首份正式 Module Contract）；`design_index.md`/`trace_matrix.md`/`modules/CORE/trace.md`（Runtime 从正式数据推导，不由本 Agent 手写）。
- **源码目录名 ↔ 规格模块名映射**：`src/`、`tests/` 与根级 `README.md`/`package.json`/`tsconfig.json`（扁平结构，无独立源码根前缀）→ 规格模块 **CORE**。依据：spec_manifest.json PSV-0001 default_module=CORE 且唯一模块；impact_analysis §2 全部 planned_code_paths 归属 CORE；CLS-1 module_boundary_changed=false。无目录改名、无静默映射。
- **受影响 Gate/流程**：Candidate Gate Profile（required_files/schema/spec_consistency/trace/workflow_specific 对本候选集的检查）；后续 task 候选、审批、merge_run、changed_files_audit、verification/close gate 均为现有流程消费本设计产出。
- **兼容性与回归范围**：纯新增 + README 追加（append-only），无既有运行时行为可回归；"回归"= 首次验收（REQ-CORE-001～006 的 EVREQ 证据链）+ README 既有内容保留检查（既有 123 bytes 不变）。
- **project_integration_effect**：同"受影响治理产物"清单；本阶段不写任何真相源。

## 7. Verification Plan

- **静态契约验证**（不依赖测试运行，实现完成后即可复核）：`src/greet.ts` 存在且具名导出 `greet`、签名恰为 `(name: string) => string`（EVREQ-1A；AC-CORE-002）；`package.json.dependencies === {}` 且 src/ 零第三方 import（EVREQ-6A / INV-CORE-003）；`tsconfig.json` 含 noEmit+allowImportingTsExtensions（DD-CORE-004 一致性）；README 既有内容逐字节保留 + 三要素追加（EVREQ-5A）。
- **行为/单元测试验证**：DD-CORE-006 断言清单 A1–A4 在 `node --test tests/greet.test.ts` 下全部通过（EVREQ-2A/3A/4B；运行属批准后验证阶段合法执行边界，被治理拒绝时按可恢复 HardStop 协议处理并保留证据）。
- **集成验证**：测试文件以真实 import（`../src/greet.ts`）消费公共 API（EVREQ-1B），即调用方视角的最小集成面；无其他集成边界（无服务/存储/网络）。
- **回归范围**：无既有行为回归面；README 保留检查（基线 sha256 对照）+ 全部 REQ 证据链为完整回归集。
- **live acceptance**：两条 AC 行为（AC-CORE-004/AC-CORE-007）由真实测试运行输出证明；D-2 版本事实由同一运行取证；任何"测试通过"表述仅允许出现在取得真实运行证据之后。
- **正确性属性（PBT 策略）**：CONSTRAINT-2 排除第三方 PBT 库，本 WI 以等价类代表性样例（E0：A3；E1 普通名称：A1/A2；E1 纯空白：A4）覆盖以下属性；属性本身作为 correctness oracle 供未来扩展为完整 PBT：

#### CP-001 非空模板恒等
∀ n ∈ string, n.length ≥ 1 ⇒ `greet(n) === "Hello, " + n + "!"`（样例：A1、A2、A4）
#### CP-002 默认问候恒等
`greet("") === "Hello, world!"`（精确 13 字符常量）（样例：A3）
#### CP-003 全域无异常与类型恒定
∀ n ∈ string：`greet(n)` 返回 string 且不抛出异常（由 A1–A4 运行通过间接证明；无错误分支的静态复核补充）
#### CP-004 name 原样保留
∀ 非空 n：`greet(n)` 以 `"Hello, "` 开头 ∧ 以 `"!"` 结尾 ∧ 中段逐字符等于 n（样例：A1、A2、A4）
#### CP-005 零运行时依赖
运行时依赖集 = ∅：`package.json.dependencies` 为空 ∧ src/ 零第三方 import（静态复核，不依赖运行）

## Requirements Coverage

| REQ | How covered | DD / System Boundary / Data Flow | Status |
| --- | --- | --- | --- |
| REQ-CORE-001（Must） | greet 导出契约：唯一具名导出、签名固定、纯函数 | DD-CORE-001（接口定义）、DD-CORE-004（工程配置承载）、PI-CORE-001 | covered |
| REQ-CORE-002（Must） | 非空名称 → "Hello, <name>!，name 原样保留 | DD-CORE-001、DD-CORE-002（分支设计）、DD-CORE-006（A1/A2/A4）、DATA-CORE-002/003 | covered |
| REQ-CORE-003（Must） | 空名称 → "Hello, world!" | DD-CORE-001、DD-CORE-002、DD-CORE-006（A3）、DATA-CORE-002 | covered |
| REQ-CORE-004（Must） | 两条行为规则的自动化测试交付物 | DD-CORE-003（D-1 裁决：node:test 零安装路径）、DD-CORE-006（断言清单与证据钩子） | covered |
| REQ-CORE-005（Must） | 使用说明（调用方式 + 两种行为） | DD-CORE-005（README 追加三要素） | covered |
| REQ-CORE-006（Should） | 零运行时第三方依赖 | DD-CORE-003（零安装测试路径）、DD-CORE-004（dependencies 显式空）、INV-CORE-003 | covered |

无静默遗漏：REQ-CORE-001～REQ-CORE-006 全部覆盖（Must 全 covered；Should REQ-CORE-006 covered 并经 DD-CORE-003/004 固化取证路径）。

## Out of Scope

- 不实现额外输入分支（null/undefined/纯空白特殊处理、trim、截断、类型校验抛错）——CONSTRAINT-1、需求范围外 #1。
- 不做 i18n、可配置模板、CLI、性能 SLA、持久化、安全加固、运维部署、npm 发布、CI/CD——需求范围外 #2–#10。
- 不新增模块/治理层/Tool/Skill/Agent；不修改 SpecForge 治理链（§3/§4 裁决）。
- 不在本阶段运行测试或声称测试通过（CONSTRAINT-1；测试运行属批准后验证阶段）。
- 不由本 Agent 维护 design_index.md / trace_matrix.md 等 Runtime 可推导索引。

## Assumptions

- A-1（requires_runtime_confirmation，D-2）：项目内可用 Node 处于 type stripping 支持区间（主机观测 24.19.0 为旁证 HOST-1；最终由批准后验证阶段真实运行取证；降级与熔断链见 DD-CORE-003）。
- A-2（holds by constraint）：npm registry/网络/CI 不可用性按设计硬约束处理（CONSTRAINT-2）——全部交付物不依赖它们。
- A-3（holds by baseline）：README.md 既有 123 bytes 内容在实现与合并后逐字节保留（BL-1 锚定；DD-CORE-005 append-only）。
- A-4（holds by fact）：隔离验收环境、无并发/性能诉求（FACT-3/PE-1），设计不含容量与竞态考量。
