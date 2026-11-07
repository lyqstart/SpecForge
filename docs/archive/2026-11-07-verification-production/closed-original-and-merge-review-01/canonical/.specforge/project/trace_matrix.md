---
work_item_id: WI-0001
module_id: CORE
workflow_type: feature_spec
workflow_path: requirement_change_path
candidate_type: trace_delta
base_spec_version: PSV-0001
implementation_baseline_id: sha256:8f8ac52aeb32950630565ea6fa66a62d4fe0afd6acb9ec26635a509b958b2722
---

# Trace Delta: WI-0001 / CORE（Greeting Library 首个功能）

## 候选绑定与证据状态声明

- Work Item: WI-0001（feature_spec / requirement_change_path）；模块归属: CORE（spec_manifest.json PSV-0001 唯一已声明模块）
- implementation_baseline_id: `sha256:8f8ac52aeb32950630565ea6fa66a62d4fe0afd6acb9ec26635a509b958b2722`（与 tasks.candidate / requirements.candidate / design.candidate / architecture.candidate / data_model.candidate 同一基线逐字绑定）
- 上游来源（只读）：requirements.candidate.md（REQ-CORE-001～REQ-CORE-006 / AC-CORE-001～AC-CORE-018，已冻结）、design.candidate.md（DD-CORE-001～DD-CORE-006，已冻结）、candidates/tasks.md（TASK-WI-0001-001～005，本 WI 任务候选）
- **EVIDENCE 状态声明（D18 / CONSTRAINT-1 / AC-CORE-012）**：本文档 EVIDENCE 列全部为**预期证据**（EVREQ-* 编号承接 requirements.candidate.md required_evidence 声明）。本阶段（candidate_preparing）未执行任何命令、未运行任何测试；任何运行类证据（EVREQ-2A/3A/4B/1B）仅可在批准后实现/验证阶段于合法执行边界内取得，本文档不伪造已存在证据。

## 追溯矩阵（REQ → AC → DD → TASK → FILE → TEST → EVIDENCE）

| REQ ID | AC ID | DD ID | TASK ID | 目标文件 | 验证方式（TEST） | EVIDENCE（预期） |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-CORE-001 | AC-CORE-001 | DD-CORE-001 | TASK-WI-0001-002 | src/greet.ts | `grep -c "export function greet(name: string): string" src/greet.ts` 命中 1 | EVREQ-1A |
| REQ-CORE-001 | AC-CORE-002 | DD-CORE-001, DD-CORE-004 | TASK-WI-0001-002, TASK-WI-0001-001 | src/greet.ts; tsconfig.json | 签名精确 grep + tsconfig（strict/NodeNext）承载的静态类型检查路径 | EVREQ-1A |
| REQ-CORE-001 | AC-CORE-003 | DD-CORE-001 | TASK-WI-0001-002, TASK-WI-0001-005 | src/greet.ts | 反向判定：AC-CORE-001/AC-CORE-002 证据链任一失败即判未满足；真实 import 消费 greet（`node --test` 套件 import ../src/greet.ts） | EVREQ-1A, EVREQ-1B |
| REQ-CORE-002 | AC-CORE-004 | DD-CORE-001, DD-CORE-002, DD-CORE-006 | TASK-WI-0001-002, TASK-WI-0001-003 | src/greet.ts; tests/greet.test.ts | 断言 A1 `greet("Ada")==="Hello, Ada!"`、A2 `greet("Grace")==="Hello, Grace!"`（`node --test tests/greet.test.ts`，批准后运行） | EVREQ-2A, EVREQ-4B |
| REQ-CORE-002 | AC-CORE-005 | DD-CORE-002, DATA-CORE-002, DATA-CORE-003 | TASK-WI-0001-002, TASK-WI-0001-003 | src/greet.ts; tests/greet.test.ts | 三段拼接静态复核（`grep -c "Hello, " src/greet.ts`）+ A1/A2/A4 strictEqual 断言（name 原样保留） | EVREQ-2A |
| REQ-CORE-002 | AC-CORE-006 | DD-CORE-002 | TASK-WI-0001-002, TASK-WI-0001-003 | src/greet.ts; tests/greet.test.ts | 反向判定：A1/A2/A4 任一失败或抛异常即判未满足 | EVREQ-2A, EVREQ-4B |
| REQ-CORE-003 | AC-CORE-007 | DD-CORE-002, DD-CORE-006 | TASK-WI-0001-002, TASK-WI-0001-003 | src/greet.ts; tests/greet.test.ts | 断言 A3 `greet("")==="Hello, world!"` | EVREQ-3A |
| REQ-CORE-003 | AC-CORE-008 | DD-CORE-002, DATA-CORE-002 | TASK-WI-0001-002 | src/greet.ts | `grep -c "Hello, world!" src/greet.ts` 命中（13 字符精确常量） | EVREQ-3A |
| REQ-CORE-003 | AC-CORE-009 | DD-CORE-002 | TASK-WI-0001-002, TASK-WI-0001-003 | src/greet.ts; tests/greet.test.ts | 反向判定：A3 失败即判未满足 | EVREQ-3A, EVREQ-4B |
| REQ-CORE-004 | AC-CORE-010 | DD-CORE-006, DD-CORE-003 | TASK-WI-0001-003 | tests/greet.test.ts | 断言清单 A1–A4 静态存在：`grep -c "strictEqual" tests/greet.test.ts` ≥ 4 | EVREQ-4A |
| REQ-CORE-004 | AC-CORE-011 | DD-CORE-003 | TASK-WI-0001-001, TASK-WI-0001-005 | package.json; tests/greet.test.ts | `node --test tests/greet.test.ts` 全部断言通过（package.json `scripts.test` 同命令入口；批准后合法执行边界内运行，D-2 降级链见 DD-CORE-003，降级时 scripts.test 同步） | EVREQ-4B |
| REQ-CORE-004 | AC-CORE-012 | 流程约束（CONSTRAINT-1/DD-CORE-003） | 全部任务 | — | 本候选集全部 verification_commands 为声明性、无任何"已运行/已通过"表述；运行证据仅出现于批准后验证阶段产物 | 流程合规（预期） |
| REQ-CORE-005 | AC-CORE-013 | DD-CORE-005 | TASK-WI-0001-004 | README.md | `grep -c "greet(name: string): string" README.md` ≥ 1（调用方式；追加式章节，既有内容逐字节保留） | EVREQ-5A |
| REQ-CORE-005 | AC-CORE-014 | DD-CORE-005 | TASK-WI-0001-004 | README.md | 两行为示例 grep：非空示例（`Hello, Ada!` 或 `Hello, Grace!`）+ `Hello, world!` 均命中 | EVREQ-5A |
| REQ-CORE-005 | AC-CORE-015 | DD-CORE-005 | TASK-WI-0001-004, TASK-WI-0001-005 | README.md | 示例与断言 A1/A3 逐字符一致（`Hello, Ada!` / `Hello, world!`）；不一致即 AC-CORE-015 拦截 | EVREQ-5A |
| REQ-CORE-006 | AC-CORE-016 | DD-CORE-004 | TASK-WI-0001-001 | package.json | `grep -c '"dependencies": {}' package.json` 命中 1（运行时依赖空集） | EVREQ-6A |
| REQ-CORE-006 | AC-CORE-017 | DD-CORE-003, DD-CORE-004 | TASK-WI-0001-001, TASK-WI-0001-002 | package.json; src/greet.ts | `! grep -qE "^import |^import\{|require\(" src/greet.ts`（src 零第三方 import，退出 0） | EVREQ-6A |
| REQ-CORE-006 | AC-CORE-018 | DD-CORE-003 | TASK-WI-0001-001, TASK-WI-0001-003 | package.json; tests/greet.test.ts | package.json 无 devDependencies（最小字段形态）+ 测试仅用 node:test/node:assert/strict 内置能力（零安装路径，ARCH-CORE-004 工具链隔离） | 设计取证（DD-CORE-003 D-1 裁决，已冻结） |

## 文件覆盖

| 文件 | 创建/修改/删除 | 涉及 REQ | 涉及 TASK |
| --- | --- | --- | --- |
| src/greet.ts | 创建（基线 matched_files 为空） | REQ-CORE-001, REQ-CORE-002, REQ-CORE-003, REQ-CORE-006 | TASK-WI-0001-002 |
| tests/greet.test.ts | 创建（基线缺失） | REQ-CORE-002, REQ-CORE-003, REQ-CORE-004, REQ-CORE-006 | TASK-WI-0001-003 |
| README.md | 修改（追加式；既有 123 bytes sha256:757ee94e… 逐字节保留） | REQ-CORE-005 | TASK-WI-0001-004 |
| package.json | 创建（基线缺失） | REQ-CORE-001, REQ-CORE-004, REQ-CORE-006 | TASK-WI-0001-001（创建）；TASK-WI-0001-005（仅 DD-CORE-003 D-2 降级触发时受控微调 scripts.test 单行，主路径零变更） |
| tsconfig.json | 创建（基线缺失） | REQ-CORE-001, REQ-CORE-004 | TASK-WI-0001-001 |

补充：TASK-WI-0001-005（集成闭环，T2C）**主路径零文件变更**（唯一受控写入面为 D-2 降级触发的 package.json#scripts.test 单行同步），验证对象为上表 5 文件构成的链路。

## 覆盖统计

- 总 REQ 数：6（REQ-CORE-001～REQ-CORE-006；Must×5 + Should×1）
- 总 AC 数：18（AC-CORE-001～AC-CORE-018）
- 已覆盖 AC：18
- 未覆盖 AC：0
- DD 承接：6/6（DD-CORE-001/002→TASK-WI-0001-002；DD-CORE-003→TASK-WI-0001-001/003/005；DD-CORE-004→TASK-WI-0001-001；DD-CORE-005→TASK-WI-0001-004；DD-CORE-006→TASK-WI-0001-003）
- 无悬空 REQ：是（每个 REQ ≥ 1 个 AC ≥ 1 个 TASK）
- 无悬空 DD：是（每个 DD ≥ 1 个 TASK）
- 无悬空 TASK：是（每个 TASK ≥ 1 个 REQ/DD ref；TASK-WI-0001-005 为 T2C 集成闭环，引用 REQ-CORE-001～REQ-CORE-004 链路）
- 文件覆盖：planned_code_paths 5/5 落入任务且无计划外文件（不多不少；TASK-005 的 package.json 写入面为既有计划路径的串行子集）
- EVIDENCE：8 个 EVREQ 预期项（1A/1B/2A/3A/4A/4B/5A/6A），全部处于"预期证据"状态，批准后阶段取得

TRACE_DELTA_CANONICAL_ROW_SELF_CHECK：上表 37 行，每行恰好四列；Operation 仅 ADD/REMOVE（本 WI 全 ADD，0 REMOVE）；Relation 仅 constrained_by/enforces；From/To 全部为正式对象 ID（ARCH-CORE-*、DATA-CORE-*、DD-CORE-*、PI-CORE-*、INV-CORE-*、PI-0001）。Contract 消费关系均表达为 `DD-CORE-* constrained_by <Contract ID>`；Contract owner 由 Contract 元数据（owner_module: CORE，含项目级公共接口契约 PI-0001，owner=CORE）表达，未生成 owned_by 边。

## project_integration_effect

经用户批准并合并后，本 trace 增量随候选包进入正式层：Runtime 将更新 `.specforge/project/modules/CORE/trace.md` 与 `.specforge/project/trace_matrix.md`（从正式数据推导，不由本 Agent 手写）。本阶段不直接写任何真相源。

<!-- SPECFORGE_GOVERNANCE_RELATIONS_START -->
## Governance Relations

| From | Relation | To |
|---|---|---|
| DATA-CORE-001 | constrained_by | ARCH-CORE-003 |
| DATA-CORE-002 | constrained_by | ARCH-CORE-003 |
| DATA-CORE-003 | constrained_by | ARCH-CORE-003 |
| DATA-CORE-004 | constrained_by | ARCH-CORE-002 |
| DD-CORE-001 | constrained_by | ARCH-CORE-001 |
| DD-CORE-001 | constrained_by | ARCH-CORE-003 |
| DD-CORE-001 | constrained_by | DATA-CORE-001 |
| DD-CORE-001 | constrained_by | DATA-CORE-002 |
| DD-CORE-001 | constrained_by | PI-CORE-001 |
| DD-CORE-002 | constrained_by | DATA-CORE-001 |
| DD-CORE-002 | constrained_by | DATA-CORE-002 |
| DD-CORE-002 | constrained_by | DATA-CORE-003 |
| DD-CORE-002 | constrained_by | INV-CORE-001 |
| DD-CORE-002 | constrained_by | INV-CORE-002 |
| DD-CORE-002 | constrained_by | PI-CORE-001 |
| DD-CORE-003 | constrained_by | ARCH-CORE-002 |
| DD-CORE-003 | constrained_by | ARCH-CORE-004 |
| DD-CORE-003 | constrained_by | INV-CORE-003 |
| DD-CORE-004 | constrained_by | ARCH-CORE-001 |
| DD-CORE-004 | constrained_by | ARCH-CORE-002 |
| DD-CORE-004 | constrained_by | ARCH-CORE-004 |
| DD-CORE-004 | constrained_by | INV-CORE-003 |
| DD-CORE-005 | constrained_by | ARCH-CORE-001 |
| DD-CORE-006 | constrained_by | ARCH-CORE-004 |
| DD-CORE-006 | constrained_by | INV-CORE-001 |
| DD-CORE-006 | constrained_by | INV-CORE-002 |
| DD-CORE-006 | constrained_by | PI-CORE-001 |
| INV-CORE-001 | enforces | DD-CORE-002 |
| INV-CORE-002 | enforces | DD-CORE-002 |
| INV-CORE-003 | enforces | DD-CORE-003 |
| INV-CORE-003 | enforces | DD-CORE-004 |
| PI-0001 | enforces | ARCH-CORE-001 |
| PI-0001 | enforces | ARCH-CORE-003 |
| PI-0001 | enforces | DATA-CORE-001 |
| PI-0001 | enforces | DATA-CORE-002 |
| PI-CORE-001 | enforces | DD-CORE-001 |
| PI-CORE-001 | enforces | DD-CORE-002 |
<!-- SPECFORGE_GOVERNANCE_RELATIONS_END -->
