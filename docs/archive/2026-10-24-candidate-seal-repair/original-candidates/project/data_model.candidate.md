---
artifact: candidate_data_model
work_item_id: WI-0002
module_id: CORE
snapshot_id: sha256:ea0d3796eb9488dbc86462c62abe9f07631d92224177474dfd99a4bdd8ef1f17
implementation_baseline_id: sha256:ea0d3796eb9488dbc86462c62abe9f07631d92224177474dfd99a4bdd8ef1f17
base_spec_version: PSV-0002
workflow_type: feature_spec
workflow_path: requirement_change_path
test_identifier: SF-SIX-ACCEPTANCE-20261024
analysis_scope: system_governance
capability_verdict: reuse_existing
generated_by: sf-design
---

# Data Model Candidate — 极简待办清单·功能补齐（Task v2 演进）

| 元数据 | 值 |
|---|---|
| work_item_id | WI-0002 |
| module_id | CORE |
| base_spec_version | PSV-0002 |
| 产物性质 | **演进**（基于 PSV-0002 data_model.md DATA-CORE-001 至 DATA-CORE-005；本候选为完整目标文件：DATA-CORE-001 至 DATA-CORE-005 以演进版呈现，新增 DATA-CORE-006 至 DATA-CORE-009） |
| 上层架构约束 | ARCH-CORE-001 至 ARCH-CORE-005 保持不变（Architecture 不演进，无 architecture 候选）；每个 DATA-* 均受真实 ARCH 约束（逐条标注） |
| 上游输入 | requirements.candidate.md（REQ-CORE-001 至 REQ-CORE-017 / AC-001 至 AC-061，已冻结，只读）；澄清决策 A/B/C/E/F/G/H |

> 本数据模型基于 PSV-0002 既有 Task 契约演进，非绿地新建。

## 1. Problem Understanding

- **症状**：用户需要任务携带分类/优先级/截止日期、筛选搜索、统计与备份能力。
- **直接问题**：Task 实体只有 {id,text,done} 三字段；无筛选/统计派生依据、无逾期判定输入、无备份序列化结构、无旧数据补全语义。
- **根因假设**：非缺陷，是数据契约需按 REQ-CORE-007 至 REQ-CORE-017 扩展。
- **待证事实**：层级 B（真实浏览器）序列化/日期行为全部 NOT_RUN 待补测（FACT-08）。

## 2. Existing Architecture Analysis

- 既有实现（一手复核 app.js）：`tasks` 内存数组单一真相源；`localStorage["todo.tasks.v1"] = JSON.stringify(tasks)` 单键全量覆盖写；`isValidTask` 校验 {id,text,done}；损坏降级空启动不覆写（DATA-CORE-005 已生效）。
- 既有规格：DATA-CORE-001 至 DATA-CORE-005（PSV-0002）；MCONTRACT-CORE-001 storage_single_key_contract 消费 DATA-CORE-001/002/004。
- 数据流结构（内存真相源 ↔ 单键 ↔ 全量渲染）不变；演进全部发生在条目结构与派生层。

## 3. Governance Classification

- Contract 层演进：Task 数据契约（DATA-CORE-001/002）与 MCONTRACT-CORE-001 的条目结构描述扩展；属 owner 模块（CORE）候选 → Gate → 用户审批 → Merge 的正常演进，无跨模块面（单模块），不涉及 Project Contract。
- 无 Standard / Runtime / Tool / Audit 层变更。

## 4. Existing Capability Assessment

数据契约演进由现有 canonical file_type（candidate_data_model）承载，约束执行仍由代码约定 + node:test 断言（EVREQ-006 至 EVREQ-017 的 A 层级用例）完成。**capability_verdict: reuse_existing**：Standard（feature_spec/requirement_change_path 演进场景已定义）、Contract（canonical 类型与 Module Contract schema 现有）、Workflow Skill、Agent、Tool（sf_artifact_write/sf_doc_lint/sf_handoff）、Runtime（manifest 物化）、Audit（Gate/audit 链）逐层现有能力均可承载，无需扩展；目标项目的字段扩展属 Solution Strategy，不改变本 verdict。

## 5. Solution Strategy

Task 实体原位扩展为六字段结构（category/priority/dueDate 三新字段，均有默认值语义）；存储键**沿用 todo.tasks.v1 原位演进**（DATA-CORE-009 裁定）；旧 {id,text,done} 负载按默认值补全（DATA-CORE-007）；备份文本采用带版本标识的 JSON 信封结构（DATA-CORE-008）。**不改什么**：不拆键、不升版键名、不建索引、不加审计字段、不引入 schema 库。

## 6. Impact Analysis

- 合并后更新 `.specforge/project/data_model.md`（DATA-CORE-001 至 DATA-CORE-009）。
- 消费方：MCONTRACT-CORE-001（条目结构描述）、本 WI design.candidate.md（DD-CORE-009 至 DD-CORE-017）、tasks 拆解与 EVREQ-006 至 EVREQ-017 的 A 层级断言。
- 兼容性：旧负载合法非损坏（澄清决策 H），加载路径补全即迁移，无破坏面；导出/导入 round-trip 语义等价（AC-061）。
- 回归：B1–B5 数据语义（AC-001 至 AC-023）全量回归。

## 7. Verification Plan

- EVREQ-006 至 EVREQ-009 与 EVREQ-014/EVREQ-015（A 层级）：模拟 localStorage 断言六字段结构、默认值、迁移补全、写回完整结构、刷新恢复全字段。
- EVREQ-010 至 EVREQ-013（A 层级）：派生函数（filterTasks/getStats）纯函数断言；逾期以注入 today 取证。
- EVREQ-016/EVREQ-017（A 层级）：备份文本结构断言 + 非法备份拒绝后存储零变化断言 + round-trip。
- 层级 B：全部 NOT_RUN，交后续补测。

---

## 数据决策

### DATA-CORE-001 Task 实体结构（演进：v1 → v2）

- **refs**: [REQ-CORE-006（AC-021）, REQ-CORE-001, REQ-CORE-007, REQ-CORE-008, REQ-CORE-009]
- basis_refs: [FACT-10, FACT-17, 澄清决策 A/B/C]
- constrained_by: ARCH-CORE-002（原生 JS，无 schema 库——约束由代码约定+测试断言执行）；ARCH-CORE-003（单键单集合）
- 演进说明：在既有 {id,text,done} 上原位追加 category/priority/dueDate 三字段；id/text/done 语义不变。

```typescript
interface Task {
  id: string;            // 唯一标识；生成规则 DATA-CORE-003（不变）
  text: string;          // trim 后长度 ≥ 1（不变）
  done: boolean;         // 新任务恒 false（不变）
  category: string;      // 自由文本分类；trim 后为空时存储「未分类」（DATA-CORE-006）
  priority: "high" | "medium" | "low"; // 默认 medium；枚举外值一律按 medium（AC-028）
  dueDate: string | null; // ISO YYYY-MM-DD 或 null=无截止日期（DATA-CORE-006）
}
```

| 字段 | 类型 | 业务含义 | 约束 | 约束执行方式 |
|---|---|---|---|---|
| id | string | 精确定位键 | 唯一、非空 | DATA-CORE-003 + 测试断言 |
| text | string | 任务描述=搜索标题 | trim 后 ≥1 | 入库校验 + 测试断言 |
| done | boolean | 完成状态 | 布尔 | 初始化/翻转语义 + 测试断言 |
| category | string | 归类（筛选候选来源） | trim 后空→「未分类」；永不缺省（AC-026） | DATA-CORE-006 默认值应用 + 测试断言 |
| priority | enum | 轻重缓急三级 | ∈{high,medium,low}；缺省/非法→medium（AC-028/029） | DATA-CORE-006 归一化 + 测试断言 |
| dueDate | string\|null | 期限 | null 或严格 YYYY-MM-DD 真实日历日期（AC-031） | DATA-CORE-006 校验 + 测试断言 |

### DATA-CORE-002 存储键与序列化格式（演进）

- **refs**: [REQ-CORE-006（AC-020/022）, REQ-CORE-014]
- basis_refs: [FACT-17, DATA-CORE-009（键策略裁定）]
- constrained_by: ARCH-CORE-003（单键架构）
- 演进说明：键名与读写形式完全不变：`localStorage["todo.tasks.v1"] = JSON.stringify(tasks)`，tasks 为 Task v2 数组；数组顺序=呈现顺序=添加顺序（不变）；迁移后首次写操作写回完整六字段结构（AC-054）。

### DATA-CORE-003 任务 id 生成规则（保持）

- **refs**: [REQ-CORE-001, REQ-CORE-003]
- constrained_by: ARCH-CORE-002/004
- 保持 PSV-0002 原文不变：crypto.randomUUID 主选 + 时间戳序号降级，模块加载时一次性探测固定。备份导入**沿用原 id**（round-trip 字段一致的前提，AC-061）。

### DATA-CORE-004 操作数据语义（演进：属性/导入）

- **refs**: [REQ-CORE-001, REQ-CORE-002, REQ-CORE-003, REQ-CORE-004, REQ-CORE-014, REQ-CORE-017]
- basis_refs: [AC-022, AC-050, AC-058]
- constrained_by: ARCH-CORE-003（全量写回）；DATA-CORE-001/002
- 演进说明：既有四行语义表（新增/切换/删除/刷新保留/空白拒绝）不变；追加两行：

| 业务操作 | 数据语义 | 对应 AC |
|---|---|---|
| 新增（含属性） | `tasks.push({id,text,done:false,category:默认或归一值,priority:默认或选择值,dueDate:合法值或null})`，全量写回 | AC-024/027/030 |
| 备份导入 | 校验通过后 `tasks = 备份.tasks`（**整体替换**，非合并），全量写回并刷新呈现与统计 | AC-058 |

筛选/搜索/统计为**派生只读计算**，永不进入本表（不产生数据效果，AC-035/039）。

### DATA-CORE-005 损坏与缺失数据降级语义（演进：迁移边界）

- **refs**: [REQ-CORE-004（AC-016）, REQ-CORE-006（AC-023）, REQ-CORE-014（AC-051）, REQ-CORE-015]
- basis_refs: [FACT-18, 澄清决策 H]
- constrained_by: ARCH-CORE-005
- 演进说明：降级触发条件与不覆写语义不变；**条目级校验边界**更新：
  - 整体降级（空清单）：非 JSON、非数组、条目缺 id/text/done 或其类型非法（核心三元组仍是结构底线）；
  - **不再降级、改按默认值补全**：条目缺 category/priority/dueDate、priority 枚举外值、dueDate 为非法格式或非 null 非法类型——一律按 DATA-CORE-007 迁移语义归一（旧数据合法非损坏的裁定落地）。

### DATA-CORE-006（新增）字段默认值与校验规则

- **refs**: [REQ-CORE-007（AC-024 至 AC-026）, REQ-CORE-008（AC-027 至 AC-029）, REQ-CORE-009（AC-030 至 AC-032）]
- basis_refs: [FACT-10, 澄清决策 A/B/C]
- constrained_by: ARCH-CORE-002
- 规则表：

| 字段 | 提交路径（新增/修改） | 加载/导入路径 |
|---|---|---|
| category | trim 后空 → 「未分类」；否则 trim 后值 | 缺失/非字符串/trim 空 → 「未分类」；否则 trim 后值 |
| priority | ∈{high,medium,low}，默认 medium | 缺失/非字符串/枚举外 → medium |
| dueDate | 空 → null；非空须严格 `^\d{4}-\d{2}-\d{2}$` 且为真实日历日期（月 01-12、日合法含闰年），否则**拒绝该值**（AC-031：不产生含非法日期的任务，其余字段提交语义不受影响） | null/缺失 → null；字符串且合法 → 原值；否则 → null（防御式归一，正常流不触发） |
| text/done | 沿用 DD-CORE-001（trim 空 → 整体拒绝） | 沿用 DATA-CORE-005 结构底线 |

- 注意：dueDate 提交拒绝与 category/priority 归一不同——category/priority 无非法值概念（一律默认），dueDate 有显式格式约束。

### DATA-CORE-007（新增）旧数据迁移语义

- **refs**: [REQ-CORE-015（AC-052 至 AC-054）]
- basis_refs: [FACT-17, FACT-18, 澄清决策 H]
- constrained_by: ARCH-CORE-003；DATA-CORE-005/006
- 语义：加载到仅含 {id,text,done}（或新字段缺失/非法）的条目时，在内存归一为完整 v2 结构：category=「未分类」、priority=medium、dueDate=null；id/text/done 原值逐字段不变（AC-053）。迁移为**惰性加载路径归一**：不做启动时强制写回；下一次任一变更操作的全量覆盖写自然落盘完整结构（AC-054）。无独立迁移脚本、无双键迁移阶段。

### DATA-CORE-008（新增）备份文本结构（含版本标识）

- **refs**: [REQ-CORE-016（AC-055 至 AC-057）, REQ-CORE-017（AC-058/059/061）]
- basis_refs: [FACT-19, 澄清决策 G]
- constrained_by: ARCH-CORE-002（纯 JSON 文本，无二进制格式）
- 结构：导出文本 = 下列 JSON 信封的序列化字符串（textarea 呈现/粘贴）：

```json
{
  "format": "todo-backup",
  "version": 1,
  "exportedAt": "2026-10-24T00:00:00.000Z",
  "tasks": [ { "id": "…", "text": "…", "done": false, "category": "未分类", "priority": "medium", "dueDate": null } ]
}
```

- 约束：`format`/`version` 为导入识别与未来演进的版本标识（常量，非运行时配置）；`tasks` 每条按 DATA-CORE-006 加载/导入列规则严格校验（字段缺失、priority 枚举外、非法日期、id/text/done 结构非法 → 整体拒绝导入，AC-059；注意：导入校验比加载迁移**严格**——导入是用户显式恢复动作，不适用默认值补全宽宥，与 REQ-CORE-017 裁定一致）；`exportedAt` 仅 informational，不参与校验；空集合导出为合法信封（tasks: []，AC-057）。round-trip：导出→导入恢复全部字段语义等价（AC-061）。

### DATA-CORE-009（新增）存储键版本策略裁定

- **refs**: [REQ-CORE-006, REQ-CORE-015]
- basis_refs: [FACT-17, FACT-18, MCONTRACT-CORE-001]
- constrained_by: ARCH-CORE-003
- **裁定：沿用 `todo.tasks.v1`，不升版键名**。理由：(1) v1 负载是 v2 结构的合法子集，DATA-CORE-007 加载归一即完成迁移，无双写/双读窗口；(2) 升版键（如 todo.tasks.v2）需一次性读旧写新+删除旧键的迁移事务，复杂度高于价值（YAGNI）；(3) 键名版本语义保持"todo.tasks 数据家族 v1 键位"，schema 演进标识改由备份信封 version 承担（DATA-CORE-008），未来若出现不兼容语义再升版键。
- 兼容性：PSV-0002 时代写入的旧负载在本裁定下合法且自动升级；无数据丢失面。

## 数据流

```mermaid
graph LR
  OP[用户操作<br/>新增/切换/删除/属性/导入] --> M[tasks 内存数组 v2<br/>单一真相源]
  M -->|JSON.stringify 全量覆盖写| LS[(localStorage<br/>todo.tasks.v1)]
  LS -->|启动加载 + DATA-CORE-007 归一| M
  M -->|filterTasks 纯派生| VIEW[筛选/搜索视图]
  M -->|getStats 纯派生<br/>注入 today| STATS[四项统计]
  M -->|备份信封序列化| BK[备份文本 textarea]
  BK -->|校验通过整体替换| M
  OLD[旧 {id,text,done} 负载] -->|合法迁移：补默认值| M
  BAD[损坏：非JSON/非数组/核心三元组非法] -->|降级空清单 不覆写| M0[空清单启动]
```

## 关键约束与索引/性能设计

- 唯一性：Task.id 集合内唯一（不变）；导入沿用原 id（round-trip 前提）。
- 非空：text trim ≥1（不变）；category 永不为空（默认「未分类」）。
- 枚举：priority ∈ {high,medium,low}。
- 索引：仍不需要（线性扫描；分类筛选候选=对全部任务 category 去重派生，不建字典）。性能：全量序列化/渲染/派生在小规模下可忽略（Assumptions）。

## Out of Scope（数据层）

- 键升版/双键迁移、schema 版本迁移脚本机制；分类字典与层级；审计/时间戳字段（exportedAt 属备份信封元数据，不属任务实体）；导入合并追加模式；服务端持久化/云同步；多标签页并发写协调。

## Assumptions（数据假设）

- 假设数据量级远小于 localStorage 容量与全量序列化/渲染性能边界（无性能指标需求）；
- 假设 JSON.stringify/parse 保持数组顺序与字段（规范保证）；
- 假设 Node 模拟 localStorage 与真实浏览器在 getItem/setItem 契约上等价（层级 A 证据边界；层级 B NOT_RUN 待补）；
- 假设「未分类」「中（medium）」字面量在 PSV-0002 与本候选间语义一致（规格契约常量）；
- 假设用户本地时区日期（逾期基准）可用本地 Date 的年月日表示，注入 today 的测试等价性在测试记录注明（澄清决策 F/FACT-20）。