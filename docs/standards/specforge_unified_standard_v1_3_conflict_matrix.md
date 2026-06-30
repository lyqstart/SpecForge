# SpecForge Unified Standard v1.3 Conflict Matrix

> 状态：draft  
> 生成日期：2026-06-30  
> 目的：列出 `final fused standard v1.1` 与 `Project Spec Architecture Standard v1.14` 的主要冲突、裁决和落地规则。

---

## 1. 总裁决原则

| 原则 | 裁决 |
|---|---|
| 上位规则 | 运行治理、目录边界、Path Policy、状态机、Candidate、Gate、User Decision、Merge Runner、Write Guard、Close Gate 以 final fused standard v1.1 的有效规则为上位规则。 |
| 领域扩展 | Project Spec Architecture Standard v1.14 的多视角、架构实践、专题 Gate、行业实践吸收规则，作为 v1.3 Project Spec 多视角体系输入。 |
| 冲突处理 | 凡涉及“谁能写、怎么写、怎么合并、怎么关闭”，以 Unified Standard v1.3 控制面规则为准。 |
| 扩展处理 | 凡涉及新增视角、专题文件、专题 Gate，必须通过 `extension_registry.json` 登记。 |
| 阶段处理 | v1.2 当前实现与 v1.3 目标能力必须分层，不得把 v1.3 扩展要求反向强加到 v1.2 hotfix。 |

---

## 2. 冲突矩阵

| 编号 | 冲突点 | v1.1 fused standard | v1.14 architecture standard | 最终裁决 | 落地要求 |
|---|---|---|---|---|---|
| C-001 | 标准定位 | final / executable-standard，全系统执行标准 | v1.14-consolidated-draft，面向 Project Spec 架构治理 | v1.1 是上位控制面；v1.14 是 v1.3 Project Spec 多视角输入 | 合并为 `SpecForge Unified Standard v1.3`，旧文件归档为来源 |
| C-002 | `.specforge/project/decisions.md` vs `project/decisions/ADR-*.md` | MVP 使用 `decisions.md`，不创建 `project/decisions/` | 正式 ADR 存放在 `project/decisions/ADR-*.md` | `decisions.md` 保留为 Decision Index；ADR Detail 作为 v1.3 Conditional Extension | `decisions/` 只有在 `extension_registry.json` 登记 `adr_detail` 后才能创建 |
| C-003 | 多视角文件是否默认创建 | Core 项目规格结构固定且最小 | 列出大量视角文件和专题文件 | Core 默认存在；Conditional 文件按触发条件创建；Optional 文件按项目复杂度启用 | 不得机械生成空视角文件 |
| C-004 | 多视角文件路径 | v1.1 未展开 `views/` 目录 | 多数文件直接放在 project 根或用裸 `project/...` | 统一放入 `.specforge/project/views/` | `spec_manifest.json` 登记已启用 view |
| C-005 | 裸路径 `project/...` | Path Policy 要求项目规格路径必须带 `.specforge/` 前缀 | 多处使用 `project/modules/...`、`project/decisions/...` | 文档说明可用逻辑名；机器字段必须用 `.specforge/project/...` | candidate_manifest、trace、gate、merge report 不得出现裸路径 |
| C-006 | Module 命名 | `MODULE_CODE = [A-Z][A-Z0-9]{1,11}` | 示例混用 `module_id`、`name`、`prefix` | 唯一规范主键为 `MODULE_CODE` | `module_id` 不得作为正式主键；display name 仅展示 |
| C-007 | Project / Module / Work Item 职责 | WI 是事务，Project 是正式规格 | 明确 Project / Module / WI 三层模型 | 保留三层模型，纳入 Unified Standard | Project 管全局，Module 管当前模块事实，WI 管过程 |
| C-008 | 行业实践吸收 | v1.1 主要管运行治理 | v1.14 吸收 ISO 42010、arc42、C4、ADR、ATAM、DDD、SRE 等 | 保留行业实践，但必须转成 view、file、gate、trace、evidence | 不允许只作为概念说明 |
| C-009 | Gate 类型 | v1.1 有基础 Gate 与 close_gate | v1.14 有大量专题 Gate | 基础 Gate 默认；专题 Gate 条件触发且必须登记 | `extension_registry.json` 登记 gate_type |
| C-010 | ADR Gate | v1.1 未完整产品化 ADR | v1.14 对 ADR 有完整规则 | v1.3 吸收为 Conditional Extension | `adr_draft.md` 先在 WI，批准后 Merge 为 ADR |
| C-011 | Trace | v1.1 要求 REQ/AC/DD/TASK/FILE/TEST/EVIDENCE | v1.14 强调多视角 Trace | 融合为跨视角 Trace | active REQ、AC、DD、View、ADR、Test、Evidence 必须可追溯 |
| C-012 | Candidate | v1.1 要求 Candidate 是完整候选文件，不是 patch | v1.14 也要求 delta 和 candidate | 沿用 v1.1 严格规则 | 多视角变更也必须生成完整 candidate |
| C-013 | Merge Runner | v1.1 唯一正式规格写入者 | v1.14 强调 Merge 约束 | 沿用 v1.1 | 普通 Agent 不得写 `.specforge/project/**` |
| C-014 | Extension Registry | v1.1 Patch 1 明确 `extension_registry.json` | v1.14 多视角未统一落到 registry | 所有 view/gate/analysis 扩展必须登记 | 未登记扩展不得创建、执行、引用 |
| C-015 | `.specforge/reports/**` | v1.1 MVP 曾禁止创建 reports | v1.2 实现已放行 reports 用于报告输出 | 作为兼容例外，不是真相源 | Write Guard 可允许 reports，但不得纳入 Project Spec |
| C-016 | 标准文件位置 | 标准文件放 `docs/standards/`，不放用户项目 | v1.14 是标准文档 | 沿用仓库标准位置 | 用户项目不得生成标准文件副本 |
| C-017 | 代码结构能否决定模块边界 | v1.1 未展开 | v1.14 明确禁止代码包、页面、表决定模块边界 | 保留该规则 | 模块边界由业务能力、数据 owner、规则内聚、变化频率等决定 |
| C-018 | C4 使用 | v1.1 未展开 | v1.14 定义 C1-C4 层级 | 保留为架构设计颗粒度控制协议 | C4 不替代 DDD、ADR、ATAM、Trace、Gate |
| C-019 | 质量属性与 ATAM | v1.1 未展开 | v1.14 定义 Quality Attribute / ATAM | 作为 Conditional View + Gate | 质量属性取舍触发 `quality_attribute_analysis.md` 和 ATAM Gate |
| C-020 | SRE / Operational Readiness | v1.1 未展开 | v1.14 定义 SLO、Incident、Operational Readiness | 作为 Conditional View + Gate | 涉及可靠性目标、告警、事故响应时启用 |
| C-021 | Evolutionary Architecture | v1.1 有 rollback / superseded | v1.14 有 roadmap、fitness function、deprecation | 吸收为 Architecture Evolution Extension | 涉及目标架构、废弃、漂移检测时启用 |
| C-022 | Runtime 状态 | v1.1 Patch 2 明确 StateManager 唯一权威 | v1.14 聚焦 Project Spec | 以 v1.1 Patch 2 为准 | v1.14 不得引入第二状态源 |
| C-023 | Work Item 文件 | v1.1 有最小闭环文件 | v1.14 增加专题分析文件 | 最小文件必备；专题分析文件条件触发 | impact_analysis 必须列出触发的专题文件 |
| C-024 | Diagram | v1.14 支持 diagrams | v1.1 未定义 | 图作为辅助视图，不是真相源 | diagrams 必须登记、引用正式规格、通过 Candidate 创建 |
| C-025 | v1.2 到 v1.3 兼容 | v1.2 是稳定可用，不是完整设计标准 | v1.14 是更完整目标 | v1.2.x 不做大架构改造；v1.3 设计冻结后实现 | 先 docs-only，再 schema/service/gate/live acceptance |

---

## 3. 必须改写的术语

| 旧表达 | 新表达 |
|---|---|
| `project/decisions/` | `.specforge/project/decisions/`，且为 Conditional Extension |
| `project/modules/auth/design.md` | `.specforge/project/modules/AUTH/design.md` |
| `module_id` 作为主键 | `MODULE_CODE` 作为唯一规范主键 |
| `business_value.md` | `.specforge/project/views/business_value.md` |
| `api_contracts.md` | `.specforge/project/views/api_contracts.md` |
| `project/diagrams/` | `.specforge/project/diagrams/`，且不是唯一事实来源 |

---

## 4. 必须保留的有效规则

### 4.1 来自 v1.1 fused standard

1. 所有变更进入 WI。
2. 正式规格通过 Candidate + Gate + User Decision + Merge Runner。
3. 代码通过 code_permission + allowed_write_files + Write Guard。
4. 关闭通过 verification、evidence、trace、audit、merge 或 not_applicable、close_gate。
5. StateManager 是唯一状态权威。
6. Path Service / Path Policy 单源治理。
7. `extension_registry.json` 控制扩展。

### 4.2 来自 v1.14 architecture standard

1. Project / Module / Work Item 三层责任模型。
2. 多视角不是多文件，而是 stakeholder concern 驱动。
3. 视角链路：Stakeholder → Concern → Viewpoint → View → Spec File → Gate → Trace。
4. Core / Conditional / Optional 分级。
5. ISO 42010、arc42、C4、ADR、ATAM、DDD、SRE 等实践必须转化为治理机制。
6. 模块不能按页面、按钮、数据库表、代码目录直接拆。
7. 设计必须可追溯、可验证、可演进。

---

## 5. 验收标准

融合后的标准通过以下检查才算成立：

```text
1. 不存在两个上位标准。
2. 不存在裸 project/... 机器路径。
3. 不存在 module_id / MODULE_CODE / prefix 主键混用。
4. 不存在 decisions.md 与 decisions/ADR-*.md 的无裁决冲突。
5. 所有多视角扩展都通过 extension_registry。
6. 所有正式规格修改都回到 Candidate + Gate + User Decision + Merge Runner。
7. Project / Module / Work Item 职责边界清楚。
8. v1.2 当前实现和 v1.3 目标能力分层清楚。
9. 不强制为小变更生成所有视角文件。
10. negative live acceptance 能阻断越权写入、未登记扩展、hash/version/path/trace 错误。
```
