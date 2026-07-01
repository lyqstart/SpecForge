# SpecForge v1.14 Merge Decision Matrix Final

本文件记录 v1.14 内容进入 v1.3 统一标准时的最终裁决：原文融入、修改融入、移动到 Playbook、删除或保留为附录。


> 状态：draft / merge-decision-matrix
> 生成日期：2026-06-30
> 目的：逐章裁决 `specforge_project_spec_architecture_standard_v1_14_consolidated.md` 如何融入 `specforge_unified_standard_v1_3_full.md`。
> 裁决枚举：`KEEP_AS_IS`、`KEEP_AS_IS_WITH_PATCH`、`KEEP_WITH_MODIFICATION`、`MOVE_TO_PLAYBOOK`、`DELETE`、`DELETE_WITH_NOTE`。

## 1. 裁决总规则

| 裁决 | 含义 |
|---|---|
| KEEP_AS_IS | 原规则已经是可执行约束，且不与 v1.1 控制面冲突，只做编号和术语统一。 |
| KEEP_AS_IS_WITH_PATCH | 原规则基本保留，但需要补充 `.specforge/` 路径、extension_registry、MODULE_CODE 等统一约束。 |
| KEEP_WITH_MODIFICATION | 方向正确，但必须改写为 SpecForge 的路径、字段、Gate、Trace、Candidate、Merge 规则。 |
| MOVE_TO_PLAYBOOK | 适合作示例、模板、方法说明或教学材料，不进入正式标准正文。 |
| DELETE | 独立标准定位、重复论证、和 v1.1 冲突、没有机制化价值的内容删除。 |
| DELETE_WITH_NOTE | 删除正文，但在 removed content log 中说明原因，避免以后误以为遗漏。 |

## 2. 逐章裁决表

| v1.14 章节 / 内容 | 裁决 | 融入 v1.3 位置 | 处理说明 |
|---|---|---|---|
| 0 标准结论 | KEEP_WITH_MODIFICATION | 0A / 2A.1 / 2A.2 | 保留 Project/Module/WI 三层职责和架构治理总纲；删除其独立上位标准定位；补充 Candidate/Gate/User Decision/Merge Runner 约束。 |
| 1 规范性用语 | KEEP_WITH_MODIFICATION | 0 标准定位 | 保留 MUST/SHOULD/MAY 语义；将 `project/decisions/` 改为 `.specforge/project/decisions/`，并受 extension_registry 控制。 |
| 2.1 当前 WI 独立规格模式的问题 | KEEP_WITH_MODIFICATION | Project Spec 真相源背景 | 保留“WI 独立规格不能作为长期真相源”的结论；删除长篇论证。 |
| 2.2 单一巨型项目规格文档的问题 | KEEP_WITH_MODIFICATION | Project Spec 文件分层 | 保留“不能用巨型 requirements/design”的结论；转成 Project / Module / View 分层规则。 |
| 2.3 正确方向 | KEEP_AS_IS | 2A.2 | 基本原文保留 Project + Module + Work Item + Gate + Trace 的方向。 |
| 2.4 标准制定依据与行业实践吸收规则 | KEEP_AS_IS | 2A.9 | 原文原则保留：行业实践必须转成治理机制、服务项目规格真相、AI 可执行、渐进复杂度、可验证。 |
| 2.5 标准压实规则 | KEEP_WITH_MODIFICATION | 2A.5 / 2A.10 | 保留 Core/Conditional/Optional 与 Gate 分级；补充 extension_registry 登记约束。 |
| 2.5.1 文件分级 | KEEP_AS_IS_WITH_PATCH | 2A.5 | 保留文件分级；路径统一到 `.specforge/project/views/` 与 `.specforge/work-items/<WI-ID>/`。 |
| 2.5.2 Gate 分级 | KEEP_WITH_MODIFICATION | 2A.10 / Gate 章节 | 保留基础 Gate 与专题 Gate；统一 gate id 为 snake_case；专题 Gate 需登记 registry。 |
| 2.5.3 冲突取舍总规则 | KEEP_AS_IS | 2A.9 | 保留 ISO/arc42/C4/ADR/ATAM/DDD 等职责分工。 |
| 2.5.4 轻量 Owner 规则 | KEEP_WITH_MODIFICATION | Agent/Project Spec 职责 | 保留 owner/maintainer 轻量规则；不引入 Team Topologies。 |
| 2.6 ISO 42010 多视角规则 | KEEP_AS_IS_WITH_PATCH | 2A.4 | 保留 Stakeholder → Concern → Viewpoint → View → Spec File → Gate → Trace；路径统一。 |
| 2.7 多视角观察对象与颗粒度表 | KEEP_WITH_MODIFICATION | 2A.7 | 保留视角与颗粒度，文件统一移入 `.specforge/project/views/`，Core 视角留根目录。 |
| 2.8 颗粒度选择规则 | KEEP_AS_IS | 2A.8 | 基本原文融入，作为防止“所有内容塞 module design”的硬规则。 |
| 2.8 登录能力示例 | MOVE_TO_PLAYBOOK | examples | 不进入正式标准正文；适合放 `docs/examples/project-spec-multiview-login-example.md`。 |
| 2.9 arc42 吸收规则 | KEEP_WITH_MODIFICATION | 2A.9 / architecture.md 章节 | 保留结构化架构文档要求；删方法论解释；转成 `architecture_structure_gate`。 |
| 2.9.1 architecture.md arc42 化 | KEEP_WITH_MODIFICATION | architecture.md 章节 | 保留 12 个章节要求；同时说明 architecture.md 是总纲，不承载全部专题细节。 |
| 2.9.4 横切概念规则 | KEEP_WITH_MODIFICATION | 2A.5 / 2A.7 | `crosscutting_concepts.md` 移入 `.specforge/project/views/`，作为 Conditional View。 |
| 2.9.5 风险技术债规则 | KEEP_WITH_MODIFICATION | 2A.7 | `architecture_risks.md` 移入 `.specforge/project/views/`，作为 Conditional Risk View。 |
| 2.11 C4 Model | KEEP_WITH_MODIFICATION | 2A.9 / 2A.11 | 保留“分层观察协议”，删除画图方法论；转成 `c4_impact` 字段与 `c4_layer_gate`。 |
| 2.12 ADR | KEEP_WITH_MODIFICATION | 2A.12 | 保留 ADR 治理机制；路径改成 `decisions.md` Core + `decisions/ADR-*` Conditional Extension。 |
| 2.13 ATAM | KEEP_WITH_MODIFICATION | 2A.9 / Gate 章节 | 转成 `quality_attribute_analysis.md`、`views/quality_attributes.md` 和 `atam_gate`。 |
| 2.14 DDD | KEEP_WITH_MODIFICATION | 2A.9 / Module Boundary | 转成 `domain_analysis.md`、`views/domain_model.md`、`views/context_map.md` 和 `domain_boundary_gate`。 |
| 2.14 行业实践吸收记录规则 | KEEP_WITH_MODIFICATION | source_mapping | 保留为来源映射和吸收记录机制；不作为正文长表重复堆叠。 |
| 2.15 Microservices | KEEP_WITH_MODIFICATION | 2A.13 | 保留“模块不等于服务”和服务化门槛；转成 `service_boundary_gate` 与 `views/service_catalog.md`。 |
| 2.16 Cloud Architecture Patterns | KEEP_WITH_MODIFICATION | 2A.9 | 保留失败治理、重试、幂等、补偿、最终一致性；转成 `resilience_pattern_gate`。 |
| 2.17 Twelve-Factor App | KEEP_WITH_MODIFICATION | 2A.9 | 转成 runtime delivery 文件和 `runtime_delivery_gate`；方法论解释后置。 |
| 2.18 SRE | KEEP_WITH_MODIFICATION | 2A.9 | 转成 SLO、告警、运行就绪、事故响应、证据与 `sre_operational_readiness_gate`。 |
| 2.19 Evolutionary Architecture | KEEP_WITH_MODIFICATION | 2A.9 | 转成架构路线图、适应度函数、漂移、废弃策略和 `architecture_evolution_gate`。 |
| 3 核心概念 | KEEP_WITH_MODIFICATION | Project Spec / WI 章节 | 保留 Project Spec、Module Spec、Work Item、Delta、Candidate、Gate、Merge 概念；Candidate 路径改成当前 WI candidates 完整文件。 |
| 4 标准目录结构 | KEEP_WITH_MODIFICATION | 2A.6 / 目录边界 | 根目录只放 Core；多视角移入 `views/`；ADR 明细条件启用；diagrams optional。 |
| 5 项目级规格文件标准 | KEEP_WITH_MODIFICATION | Project Spec 章节 | 保留文件职责；所有新增专题文件改成 Conditional View，并统一路径。 |
| 6 模块级规格文件标准 | KEEP_WITH_MODIFICATION | Project Spec / Module 章节 | 保留 module.json、requirements.md、design.md、trace.md；模块名统一 `MODULE_CODE`。 |
| 7 Work Item 标准 | KEEP_WITH_MODIFICATION | WI 事务模型 | 保留 impact/delta/analysis 思路；目录和必备文件以 v1.1 WI 标准为准。 |
| 8 AI 架构设计原则 | KEEP_WITH_MODIFICATION | Agent / Skill / Tool 职责边界 | 保留“避免过度设计、契约优先、可追溯、留证据”；变成 Agent 操作约束。 |
| 9 模块拆分决策标准 | KEEP_WITH_MODIFICATION | Module Boundary / Domain Boundary Gate | 保留拆分/不拆/合并判断；需进入 `domain_boundary_gate` 和 ADR/Trace。 |
| 10 架构演进标准 | KEEP_WITH_MODIFICATION | Architecture Evolution Gate | 保留流程与迁移映射；和 v1.1 rollback/superseded 规则统一。 |
| 11 数据库设计标准 | KEEP_WITH_MODIFICATION | Data View / Data Gate | 项目级数据文件移入 `views/`；模块级数据只作为 Conditional module extension。 |
| 12 分布式、微服务、云原生适配 | MOVE_TO_PLAYBOOK | playbook | 作为技术场景适配指南，不放入统一标准正文主干。 |
| 13 标准工作流 | KEEP_WITH_MODIFICATION | workflow_path 章节 | 不直接新增并列流程；映射到 v1.1 workflow_path 与专题 Gate。 |
| 14 Gate 标准 | KEEP_WITH_MODIFICATION | Gate 章节 | 合并入 v1.1 Gate 体系；新增 Gate 需 registry 登记。 |
| 15 AI 操作协议 | KEEP_WITH_MODIFICATION | Agent / Skill / Tool 职责边界 | 保留读取上下文、影响分析、C4、质量权衡、领域边界、不确定升级等规则。 |
| 16 边界条件 | KEEP_WITH_MODIFICATION | 边界条件 / Playbook | 保留“目录结构无 Gate 会失效”等结论；其他说明后置。 |
| 17 合规等级 | MOVE_TO_PLAYBOOK | playbook | Minimal/Standard/Extended 适合作实施配置，不作为硬标准主干。 |
| 18 Definition of Done | KEEP_WITH_MODIFICATION | close_gate / Live Acceptance | 保留 DoD 思路，但最终以 close_gate 和 evidence 为准。 |
| 19 是否可作为框架标准 | DELETE | 无 | 结论文案，不进入正式执行标准。 |
| 20 总结 / Team Topologies Future Extension | DELETE_WITH_NOTE | removed log | 删除 Team Topologies 扩展讨论，只保留轻量 owner 规则。 |


## 3. 高风险冲突项

| 冲突项 | v1.14 原倾向 | v1.3 裁决 |
|---|---|---|
| 标准层级 | v1.14 像独立标准 | 降级为 Project Spec 多视角与架构治理章节 |
| ADR 路径 | `.specforge/project/decisions/ADR-*.md` 正式存在 | `decisions.md` 为 Core；`decisions/ADR-*` 为 Conditional Extension |
| 多视角文件路径 | 多数文件直接在 project 根目录 | 统一放 `.specforge/project/views/` |
| Candidate 示例 | `project/modules/auth/*.candidate.md` | 必须在 `.specforge/work-items/<WI-ID>/candidates/**` |
| 模块名 | 示例出现 `auth`、`MOD-AUTH` | canonical module code 统一为 `MODULE_CODE = [A-Z][A-Z0-9]{1,11}` |
| 专题 Gate | 直接作为标准 Gate 出现 | 必须登记于 `extension_registry.json` |
| 示例 | 登录、core 拆 auth 等长示例 | 移到 examples / playbook |
| 方法论解释 | ISO/arc42/C4/ADR/ATAM 等大量解释 | 正文只保留机制映射、触发条件、输出、Gate、Trace |

## 4. 执行结论

v1.14 的价值不在于原文篇幅，而在于它补足了 v1.1 没有展开的 Project Spec 多视角与架构治理。v1.3 应吸收其机制，不应复制其方法论长文。最终策略是：

```text
v1.1 hard control 全保留；
v1.14 多视角机制化吸收；
v1.14 示例和方法论后置；
v1.14 与 v1.1 冲突处服从 v1.1；
所有新增能力受 extension_registry.json 控制。
```
