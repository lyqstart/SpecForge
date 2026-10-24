---
artifact: trace_delta
work_item_id: WI-0002
module_id: CORE
snapshot_id: sha256:ea0d3796eb9488dbc86462c62abe9f07631d92224177474dfd99a4bdd8ef1f17
implementation_baseline_id: sha256:ea0d3796eb9488dbc86462c62abe9f07631d92224177474dfd99a4bdd8ef1f17
base_spec_version: PSV-0002
workflow_type: feature_spec
workflow_path: requirement_change_path
test_identifier: SF-SIX-ACCEPTANCE-20261024
generated_by: sf-task-planner
artifact_contract: task-document/v1
---

# Trace Delta: WI-0002

| 元数据 | 值 |
|---|---|
| work_item_id | WI-0002 |
| module_id | CORE |
| 配套产物 | candidates/tasks.md（TASK-WI-0002-001至008，task-document/v1） |
| 事实基础 | 演进型：正式 Trace 基线 = PSV-0002（.specforge/project/modules/CORE/trace.md 与 .specforge/project/trace_matrix.md，37 条治理边 + REQ-CORE-001至006→AC-001至023→DD-001至008→TASK-WI-0001-*→四文件链）；本 WI 新增 REQ-CORE-007至017 / DD-CORE-009至017 / DATA-CORE-006至009 / MCONTRACT-CORE-007，演进 MCONTRACT-CORE-006 |
| 实现基线 | frontmatter snapshot_id 绑定：四文件均为既有正式实现（修改，非新建） |

## 追溯矩阵（OUT→REQ→AC→DD→TASK→FILE→EV）

EV 记法：EVREQ-0XX-A = 层级 A（Node v24.19.0 `node --test test/`，证据层级=集成/模拟测试）；EVREQ-0XX-B = 层级 B（真实浏览器/剪贴板）= **NOT_RUN**（本会话无浏览器自动化工具，交后续补测）。TASK 列为「实现任务 / 验证任务（T008 全量）」。

| OUT | REQ | AC | DD | TASK | 目标文件 | 验证方式（EV） |
|---|---|---|---|---|---|---|
| B1至B5+数据语义（回归） | REQ-CORE-001 | AC-001至005 | DD-CORE-001（演进）, DD-CORE-002, DD-CORE-003（演进）, DD-CORE-004（演进） | 既有实现 / T002, T006, T007 / T008（回归） | app.js, test/app.test.js | EVREQ-001-A：回归用例 AC-001至005；EVREQ-001-B：NOT_RUN |
| B2 勾选完成（回归） | REQ-CORE-002 | AC-006至009 | DD-CORE-003（演进）, DD-CORE-004（演进） | 既有实现 / T007 / T008（回归） | app.js, test/app.test.js | EVREQ-002-A：回归；EVREQ-002-B：NOT_RUN |
| B3 删除（回归） | REQ-CORE-003 | AC-010至013 | DD-CORE-003（演进）, DD-CORE-004（演进） | 既有实现 / T007 / T008（回归） | app.js, test/app.test.js | EVREQ-003-A：回归；EVREQ-003-B：NOT_RUN |
| B4 刷新保留（回归+扩展） | REQ-CORE-004 | AC-014至016 | DD-CORE-004（演进）, DD-CORE-005（演进）, DD-CORE-007（演进） | 既有实现 / T001, T006 / T008（回归） | app.js, index.html, test/app.test.js | EVREQ-004-A：回归；EVREQ-004-B：NOT_RUN |
| B5 空白拒绝（回归） | REQ-CORE-005 | AC-017至019 | DD-CORE-001（演进）, DD-CORE-002 | 既有实现 / T002 / T008（回归） | app.js, test/app.test.js | EVREQ-005-A：回归；EVREQ-005-B：NOT_RUN |
| 数据语义（回归+扩展） | REQ-CORE-006 | AC-020至023 | DD-CORE-002, DD-CORE-004（演进）, DD-CORE-007（演进） | 既有实现 / T001, T007 / T008（回归） | app.js, test/app.test.js | EVREQ-006-A：回归（AC-022 扩展至导入路径）；EVREQ-006-B：NOT_RUN |
| B6-a 分类（新增） | REQ-CORE-007 | AC-024至026 | DD-CORE-009, DD-CORE-015 | T002, T006 / T008 | app.js, index.html, test/app.test.js | EVREQ-007-A：字段三态用例；EVREQ-007-B：NOT_RUN |
| B6-b 优先级（新增） | REQ-CORE-008 | AC-027至029 | DD-CORE-009, DD-CORE-015 | T002, T006 / T008 | app.js, index.html, test/app.test.js | EVREQ-008-A：枚举/默认/降级用例；EVREQ-008-B：NOT_RUN |
| B6-c 截止日期（新增） | REQ-CORE-009 | AC-030至032 | DD-CORE-009, DD-CORE-010 | T002, T001 / T008 | app.js, test/app.test.js | EVREQ-009-A：四类路径用例；EVREQ-009-B：NOT_RUN |
| B7-a 标题搜索（新增） | REQ-CORE-010 | AC-033至035 | DD-CORE-011, DD-CORE-015 | T003, T006 / T008 | app.js, index.html, test/app.test.js | EVREQ-010-A：组合矩阵用例；EVREQ-010-B：NOT_RUN |
| B7-b 组合筛选（新增） | REQ-CORE-011 | AC-036至040 | DD-CORE-011, DD-CORE-015 | T003, T006 / T008 | app.js, index.html, test/app.test.js | EVREQ-011-A：AND 组合/空态/空结果用例；EVREQ-011-B：NOT_RUN |
| B8 统计（新增） | REQ-CORE-012 | AC-041至044 | DD-CORE-012, DD-CORE-015, DD-CORE-016 | T004, T006, T007 / T008 | app.js, index.html, test/app.test.js | EVREQ-012-A：四项计数+筛选不变用例（CP-CORE-010）；EVREQ-012-B：NOT_RUN |
| B8 逾期规则（新增） | REQ-CORE-013 | AC-045至048 | DD-CORE-012 | T004 / T008 | app.js, test/app.test.js | EVREQ-013-A：注入 today 三态×双态用例；EVREQ-013-B：NOT_RUN |
| B9-a 新字段持久化（新增） | REQ-CORE-014 | AC-049至051 | DD-CORE-010, DD-CORE-004（演进） | T001 / T008 | app.js, test/app.test.js | EVREQ-014-A：刷新等价模拟用例；EVREQ-014-B：NOT_RUN |
| B9-b 旧数据迁移（新增） | REQ-CORE-015 | AC-052至054 | DD-CORE-010 | T001 / T008 | app.js, test/app.test.js | EVREQ-015-A：预置旧负载→补全→写回用例（CP-CORE-009）；EVREQ-015-B：NOT_RUN |
| B10-a 备份导出（新增） | REQ-CORE-016 | AC-055至057 | DD-CORE-013, DD-CORE-015 | T005, T006 / T008 | app.js, index.html, test/app.test.js | EVREQ-016-A：导出文本结构断言（含空信封）；EVREQ-016-B：NOT_RUN（含剪贴板） |
| B10-b 导入与非法拒绝（新增） | REQ-CORE-017 | AC-058至061 | DD-CORE-014, DD-CORE-015, DD-CORE-016 | T005, T006, T007 / T008 | app.js, index.html, test/app.test.js | EVREQ-017-A：合法/非法/round-trip/零变化用例（CP-CORE-012）；EVREQ-017-B：NOT_RUN |

正确性属性用例基准：CP-CORE-001至007（既有，T008 回归）+ CP-CORE-008（T002/T008）、CP-CORE-009（T001/T008）、CP-CORE-010（T004/T008）、CP-CORE-011（T003/T008）、CP-CORE-012（T005/T008）。

集成闭环：T008 汇总执行 `node --test test/`（23 既有 AC + 38 新 AC + CP-CORE-001至012 全量）与四文件存在性、index.html 锚点 id ↔ app.js 消费对齐检查，作为 EVREQ-001至017-A 层级 A 汇总验证（八任务交付真实接通）。

## 文件覆盖

基线事实（frontmatter 绑定）：四个计划路径均为既有正式实现——全部条目为「修改」，无新建/删除；与任务操作一致，无基线冲突。

| 文件 | 创建/修改/删除 | 涉及 REQ | 涉及 TASK |
|---|---|---|---|
| index.html | 修改 | REQ-CORE-004, REQ-CORE-007至012, REQ-CORE-016, REQ-CORE-017 | TASK-WI-0002-006, TASK-WI-0002-008（只读验证） |
| styles.css | 修改 | REQ-CORE-007至012/016/017（呈现面；不设样式验收标准） | TASK-WI-0002-006, TASK-WI-0002-008（只读验证） |
| app.js | 修改 | REQ-CORE-001至017 | TASK-WI-0002-001至007, TASK-WI-0002-008（只读验证） |
| test/app.test.js | 修改 | REQ-CORE-001至017（验证资产，EVREQ-001至017-A） | TASK-WI-0002-008 |

写入范围并集恰为 impact_scope.planned_code_paths 四路径；protected-marker.txt 与 .specforge/** 无任何文件覆盖条目（永不进入写入范围）。

## 覆盖统计

- 总 REQ 数：17（REQ-CORE-001至006 保留+回归；REQ-CORE-007至017 新增，全部 Must）
- 总 AC 数：61（AC-001至023 回归 + AC-024至061 新增）
- 已覆盖 AC：61 / 61（100%；层级 A 用例全覆盖，层级 B 全部 NOT_RUN 待补测）
- 总 DD 数：17（DD-CORE-001至008 演进、DD-CORE-009至017 新增，全部被 TASK 承接；DD-CORE-017 constrained_by ARCH-CORE-005）
- 总 TASK 数：8（TASK-WI-0002-001至008，全部含类型化 verification_commands 且每任务至少一条可判定退出码命令）
- 无悬空 REQ：是
- 无悬空 DD：是
- 无悬空 TASK：是
- 无悬空文件：是（四个 code_paths 均有 TASK 覆盖与验证方式）

## Governance Relation Delta 数据来源说明

- `DD-* constrained_by *` 边逐条取自 design.candidate.md 各 DD 正文的 constrained_by 声明（唯一真相源），仅收录正式对象（ARCH-/DATA-/MCONTRACT-*）；host-profile、FACT、澄清决策等非正式对象不入表。
- `DATA-* constrained_by ARCH-*` 边取自 data_model.candidate.md 各 DATA 对象 constrained_by 声明，仅收录指向 ARCH-* 的上层架构权威约束；DATA 对象不得声明 constrained_by Module Contract（MCONTRACT-*），此类声明已从 data_model.candidate.md 移除，本表与该候选保持一致。同层 DATA→DATA 依赖（如 DATA-CORE-007 声明中的 DATA-CORE-005/006）不构成合法治理边，不入表，其语义由各 DATA 正文文字保留。
- `MCONTRACT-* enforces DD-*` 边取自 contracts.candidate.json 各契约 source_refs（provenance，经 sf_batch_verify 精确正则断言确认）：006 演进版 source_refs=["DD-CORE-003","DD-CORE-005","DD-CORE-011","DD-CORE-015"]；007 新增 source_refs=["DD-CORE-009","DD-CORE-012","DD-CORE-013","DD-CORE-014","DD-CORE-016"]；001至005 保持不变。
- REMOVE 说明（诚实声明）：本 WI 对既有 37 条正式治理边**无任何一条被真实切断**——REQ-CORE-001至006 关联 DD（001/003/004/005/007/008）的演进只改变了 DD 正文内容，其 constrained_by 关系集合除新增外全部保持；MCONTRACT-CORE-006 的「旧交互面演进」在治理关系上表现为 source_refs 扩张（新增 enforces DD-011/DD-015 两条 ADD），旧边 enforces DD-003/DD-005 仍有效（KEEP）。依据 ERR-157 规则（只写真实存在并由本 WI 改变的边；关系集合不变不得制造 Delta 行），本文件 REMOVE 行数=0，不虚构 REMOVE/ADD 对来模拟「修改」。
- 消费者闭环：MCONTRACT-CORE-006 演进版消费 DD = {DD-003, DD-005, DD-011, DD-015}（DD-011/015 为本 WI 新增消费者，实现/验证由 T003/T006/T008 承接）；MCONTRACT-CORE-007 消费 DD = {DD-009, DD-012, DD-013, DD-014, DD-016}（实现/验证由 T002/T004/T005/T007/T008 承接）。全部消费者均有 Task、验证方法与批准写入范围，无缺失消费者 Task。

<!-- SPECFORGE_GOVERNANCE_DELTA_START -->
## Governance Relation Delta

| Operation | From | Relation | To |
|---|---|---|---|
| ADD | DATA-CORE-006 | constrained_by | ARCH-CORE-002 |
| ADD | DATA-CORE-007 | constrained_by | ARCH-CORE-003 |
| ADD | DATA-CORE-008 | constrained_by | ARCH-CORE-002 |
| ADD | DATA-CORE-009 | constrained_by | ARCH-CORE-003 |
| ADD | DD-CORE-001 | constrained_by | DATA-CORE-006 |
| ADD | DD-CORE-004 | constrained_by | DATA-CORE-007 |
| ADD | DD-CORE-009 | constrained_by | MCONTRACT-CORE-002 |
| ADD | DD-CORE-009 | constrained_by | DATA-CORE-006 |
| ADD | DD-CORE-010 | constrained_by | MCONTRACT-CORE-003 |
| ADD | DD-CORE-010 | constrained_by | DATA-CORE-005 |
| ADD | DD-CORE-010 | constrained_by | DATA-CORE-006 |
| ADD | DD-CORE-010 | constrained_by | DATA-CORE-007 |
| ADD | DD-CORE-011 | constrained_by | MCONTRACT-CORE-006 |
| ADD | DD-CORE-011 | constrained_by | ARCH-CORE-002 |
| ADD | DD-CORE-012 | constrained_by | ARCH-CORE-005 |
| ADD | DD-CORE-012 | constrained_by | DATA-CORE-006 |
| ADD | DD-CORE-013 | constrained_by | MCONTRACT-CORE-006 |
| ADD | DD-CORE-013 | constrained_by | ARCH-CORE-002 |
| ADD | DD-CORE-014 | constrained_by | MCONTRACT-CORE-003 |
| ADD | DD-CORE-014 | constrained_by | DATA-CORE-006 |
| ADD | DD-CORE-014 | constrained_by | DATA-CORE-008 |
| ADD | DD-CORE-015 | constrained_by | MCONTRACT-CORE-006 |
| ADD | DD-CORE-015 | constrained_by | MCONTRACT-CORE-007 |
| ADD | DD-CORE-015 | constrained_by | ARCH-CORE-002 |
| ADD | DD-CORE-016 | constrained_by | MCONTRACT-CORE-007 |
| ADD | DD-CORE-016 | constrained_by | MCONTRACT-CORE-001 |
| ADD | DD-CORE-017 | constrained_by | ARCH-CORE-005 |
| ADD | MCONTRACT-CORE-006 | enforces | DD-CORE-011 |
| ADD | MCONTRACT-CORE-006 | enforces | DD-CORE-015 |
| ADD | MCONTRACT-CORE-007 | enforces | DD-CORE-009 |
| ADD | MCONTRACT-CORE-007 | enforces | DD-CORE-012 |
| ADD | MCONTRACT-CORE-007 | enforces | DD-CORE-013 |
| ADD | MCONTRACT-CORE-007 | enforces | DD-CORE-014 |
| ADD | MCONTRACT-CORE-007 | enforces | DD-CORE-016 |
<!-- SPECFORGE_GOVERNANCE_DELTA_END -->

计数：ADD = 34（DATA constrained_by ×4、DD constrained_by ×23、MCONTRACT enforces ×7）；REMOVE = 0（见上「REMOVE 说明」，无真实切断的既有边）。

### KEEP（既有 37 条边保持，合并后原样保留）

以下 PSV-0002 既有治理边全部保持不变（正式基线 trace.md 逐条核对）：DATA-CORE-001 constrained_by ARCH-CORE-002/ARCH-CORE-003；DATA-CORE-002 constrained_by ARCH-CORE-003；DATA-CORE-003 constrained_by ARCH-CORE-002/ARCH-CORE-004；DATA-CORE-004 constrained_by ARCH-CORE-003；DATA-CORE-005 constrained_by ARCH-CORE-005；DD-CORE-001 constrained_by DATA-CORE-004/MCONTRACT-CORE-002；DD-CORE-002 constrained_by ARCH-CORE-003/DATA-CORE-001/DATA-CORE-002/MCONTRACT-CORE-001；DD-CORE-003 constrained_by ARCH-CORE-002/MCONTRACT-CORE-006；DD-CORE-004 constrained_by ARCH-CORE-003/DATA-CORE-002/DATA-CORE-004/MCONTRACT-CORE-001；DD-CORE-005 constrained_by ARCH-CORE-001/ARCH-CORE-004/MCONTRACT-CORE-006；DD-CORE-006 constrained_by ARCH-CORE-005/MCONTRACT-CORE-004/MCONTRACT-CORE-005；DD-CORE-007 constrained_by ARCH-CORE-005/MCONTRACT-CORE-003；DD-CORE-008 constrained_by ARCH-CORE-005；MCONTRACT-CORE-001 enforces DD-CORE-002/DD-CORE-004；MCONTRACT-CORE-002 enforces DD-CORE-001；MCONTRACT-CORE-003 enforces DD-CORE-007；MCONTRACT-CORE-004 enforces DD-CORE-006；MCONTRACT-CORE-005 enforces DD-CORE-002/DD-CORE-006；MCONTRACT-CORE-006 enforces DD-CORE-003/DD-CORE-005。KEEP 计数 = 37。

（注：DD-CORE-008 constrained_by ARCH-CORE-005 虽未在新候选 DD-008 正文 constrained_by 行复显，但 DD-CORE-008 标注「保持原文不变」且演进仅追加 DD-CORE-017 引用，该边按保持语义 KEEP，不 REMOVE。）

## 自检（TRACE_DELTA_CANONICAL_ROW_SELF_CHECK 结论）

1. ✅ Governance Relation Delta 每个数据行恰好四列；Operation 仅 ADD/REMOVE（本文件全部 ADD，REMOVE=0 有诚实说明）；Relation 仅 constrained_by/enforces；From/To 均为正式对象 ID（ARCH-/DATA-/DD-/MCONTRACT-*）；无非法操作词、无值列表或说明句充当 ID；无 DATA 对象 constrained_by MCONTRACT-* 的非法边（DATA→MCONTRACT 已全部移除）。
2. ✅ 每个 REQ 至少关联一个 AC（17 REQ → 61 AC）。
3. ✅ 每个 AC 至少关联一个 TASK（61/61，经 REQ 分组行覆盖；回归 AC 由 T008 全量回归承接）。
4. ✅ 每个 DD 至少关联一个 TASK（17/17：DD-001至008 演进/保持面由 T001/T002/T006/T007/T008 承接；DD-009至017 见矩阵）。
5. ✅ 每个 TASK 有明确目标文件（全部任务 allowed_write_files ⊆ 四文件）。
6. ✅ 每个目标文件有验证方式（node --test test/ + 结构契约检查命令）。
7. ✅ 本文件真实写入（candidates/trace_delta.md），非空泛占位；Governance Relation Delta 区段使用 SPECFORGE_GOVERNANCE_DELTA_START/END 标记。
8. ✅ ID 范围记法全文统一为「至」（如 DD-CORE-009至017），不使用波浪号 `~`，避免解析为非法 ID。
