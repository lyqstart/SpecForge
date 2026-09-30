# SpecForge Project Spec Architecture Standard

版本：v1.14-consolidated-draft  
定位：面向 AI Agent 的项目级规格治理与架构设计标准  
适用对象：SpecForge Orchestrator、Requirements Agent、Design Agent、Task Planner、Reviewer、Verifier、Knowledge Agent，以及所有需要读取或修改规格的自动化工具。

---

## 0. 标准结论

本标准定义 SpecForge 中项目规格的组织方式、架构设计依据、模块拆分原则、数据库/分布式/微服务/云原生等技术架构的承载方式、Work Item 变更流程、Gate 校验规则、架构演进流程和边界条件。

核心原则是：

```text
Project 管全局设计、索引、跨模块规则和技术架构约束；
Module 管当前完整需求和模块内部设计；
Work Item 管每一次变更过程、delta、任务、证据、合并记录和迁移记录。
```

本标准吸收行业架构实践时，采用以下原则性判断作为总纲：

```text
架构设计不是画图，也不是写一个 design.md，而是一个有视角、有依据、有权衡、有决策、有验证、有演进记录的工程治理过程。
```

因此，本标准不把 ISO/IEC/IEEE 42010、arc42、C4 Model、ADR、ATAM、DDD、微服务最佳实践、云架构模式、Twelve-Factor App、SRE、Evolutionary Architecture 等实践作为孤立方法论罗列，而是将其转化为 SpecForge 可执行的目录结构、文件职责、AI 操作协议、Gate/Fitness Function、Trace、ADR、Work Item 变更流程和 Merge 约束。

本标准不是某一种技术栈的模板，而是技术栈无关的规格治理框架。Java、.NET、Node.js、Go、Python、单体、分层单体、微服务、分布式、云原生、数据平台、工业控制、AI 应用都可以使用本标准。

AI 在进行需求分析、架构设计、模块拆分、数据库设计、接口设计、事件流设计、云原生设计和架构演进时，必须参考本标准，不得凭感觉随意设计。

---

## 1. 规范性用语

本标准使用以下关键词表达约束强度：

- **MUST / 必须**：强制要求，不满足则 Gate 不应通过。
- **MUST NOT / 禁止**：强制禁止，不满足则 Gate 不应通过。
- **SHOULD / 应该**：默认要求，除非有明确理由并在 `project/decisions/` 或 Work Item 中记录。
- **MAY / 可以**：可选能力，根据项目复杂度启用。
- **RECOMMENDED / 推荐**：推荐做法，可根据项目情况调整，但需要说明理由。

AI 输出任何架构、模块、接口、数据库、事件、部署设计时，必须说明：

1. 设计依据来自哪些需求、约束或项目现状；
2. 采用了本标准中的哪些设计原则；
3. 为什么当前复杂度需要该设计；
4. 如果没有采用更复杂方案，为什么暂不采用；
5. 如果是架构变更，必须说明迁移影响和追溯策略。

---

## 2. 为什么需要这个标准

### 2.1 当前 WI 独立规格模式的问题

旧模式通常是：

```text
.specforge/specs/WI-001/requirements.md
.specforge/specs/WI-001/design.md
.specforge/specs/WI-002/requirements.md
.specforge/specs/WI-002/design.md
```

这种模式的问题是：每个 WI 都有一套独立规格，但项目没有一套当前真实规格。

长期开发后，系统无法明确回答：

- 当前项目完整需求在哪里；
- 当前某个模块真实设计在哪里；
- 某个 REQ 最新版本是哪一个；
- 某个接口到底由哪个模块拥有；
- 某个共享数据结构在哪里定义；
- 某次变更最后合并到了哪些项目规格文件；
- 架构拆分后历史 ID 如何追溯。

因此，WI 独立规格适合作为过程归档，不适合作为长期项目规格真相。

### 2.2 单一巨型项目规格文档的问题

另一个错误方向是把所有内容都写入：

```text
.specforge/project/requirements.md
.specforge/project/design.md
```

这种模式会产生：

- 文件过大，Agent 无法有效加载；
- 用户确认困难；
- 模块边界不清晰；
- 多人并行冲突严重；
- 跨模块接口、数据结构、事件流容易混在一起；
- 架构演进时无法局部修改。

因此，本标准不采用“一个项目一个巨型 requirements/design 文档”的做法。

### 2.3 正确方向

正确方向是：

```text
项目级规格体系
= 项目级全局规格与整体设计
+ 模块级当前完整规格
+ Work Item 变更集
+ Gate 控制合并
+ Trace 追溯体系
+ 架构演进记录
```

这使 SpecForge 从“任务文档生成器”升级为“项目规格变更管理系统”。

### 2.4 标准制定依据与行业实践吸收规则

SpecForge 吸收行业最佳实践时，MUST 遵循以下规则：

1. **MUST 转化为治理机制**：行业实践不得只作为概念说明，必须转化为目录、文件、字段、流程、Gate、模板或 Agent 操作约束。
2. **MUST 服务项目规格真相**：所有实践必须服务于 Project Spec、Module Spec、Work Item Change Set 的长期一致性和可追溯性。
3. **MUST 支持 AI 可执行**：标准中的规则必须能被 AI 读取、执行、检查和产出证据，不能只依赖人的经验判断。
4. **MUST 保持渐进式复杂度**：小项目不得因为引入行业实践而过度设计；复杂设计必须有当前需求、质量属性、维护责任、部署边界或风险依据。
5. **MUST 可验证**：任何架构原则都应尽量落到 Gate/Fitness Function、Trace、Review、Verification 或 Evidence 中。

行业实践在 SpecForge 中的吸收方式如下：

| 行业实践 | SpecForge 吸收结果 |
|---|---|
| ISO/IEC/IEEE 42010 | 多利益相关方、多视角架构文件 |
| arc42 | 固定化架构文档结构、上下文边界、构建块、运行时、部署、横切规则、风险技术债和术语 |
| C4 Model | 分层架构表达与颗粒度控制，明确 C1/C2/C3/C4 的上游、下游、融合位置和 Gate |
| ADR | 架构决策记录机制，约束重要架构选择必须记录背景、候选方案、权衡、后果、验证和替代策略 |
| ATAM | 质量属性权衡分析机制，约束候选方案必须说明性能、安全、可靠性、可维护性、成本、交付速度、用户体验等影响、取舍、风险和验证方式 |
| DDD | 业务能力驱动的模块边界、领域模型、上下文映射、统一语言、数据所有权和规则内聚治理 |
| 微服务最佳实践 | 明确模块不等于服务，服务化必须满足独立部署、数据、团队和运维条件 |
| 云架构模式 | 超时、重试、熔断、限流、幂等、补偿、Outbox、Saga、最终一致性 |
| Twelve-Factor App | 配置外部化、构建/发布/运行分离、无状态、日志事件流、环境一致性 |
| SRE | SLI/SLO、错误预算、告警、事故响应、运行就绪、可靠性证据和复盘治理 |
| Evolutionary Architecture | 受控增量演进、目标架构路线图、适应度函数、架构漂移检测、废弃策略和持续治理 |


### 2.5 标准压实规则：核心必备、条件触发、可选扩展

经过 11 个最佳实践融合后，SpecForge MUST 防止两个方向的失控：

1. **欠设计**：AI 只写需求、代码和简单 `design.md`，没有决策、权衡、验证、运行和演进治理。
2. **过设计**：AI 因为标准里存在很多文件和 Gate，就对每个小变更生成所有分析文件，导致规格体系臃肿、难维护。

因此，本标准采用以下压实规则：

```text
Project / Module / Work Item 是固定骨架；
专题文件和专题 Gate 按触发条件启用；
未触发的实践不得强制生成文件；
触发后必须生成足够证据并通过对应 Gate。
```

#### 2.5.1 文件分级

SpecForge 文件分为三类：

| 级别 | 含义 | 示例 | 规则 |
|---|---|---|---|
| Core / 核心必备 | 项目规格真相和变更流程的最小闭环 | `spec_manifest.json`、`architecture.md`、`requirements_index.md`、`design_index.md`、module `requirements.md`、module `design.md`、WI `impact_analysis.md`、`tasks.md`、`trace_delta.md`、`merge_report.md` | MUST 存在或在项目初始化时生成 |
| Conditional / 条件触发 | 只有相关设计发生时才必须存在 | `adr_draft.md`、`quality_attribute_analysis.md`、`domain_analysis.md`、`resilience_analysis.md`、`runtime_delivery_analysis.md`、`sre_impact_analysis.md`、`architecture_evolution_plan.md` | 触发条件成立时 MUST 生成 |
| Optional / 可选扩展 | 项目复杂度较高时启用 | 多团队协作、平台团队、复杂组织治理等扩展 | 当前标准不强制 |

AI MUST NOT 因为某个文件在目录标准中被列出，就机械生成空文件。AI MUST 在 `impact_analysis.md` 中先判断触发条件，再决定本次 WI 需要哪些分析文件和 Gate。

#### 2.5.2 Gate 分级

Gate 分为基础 Gate 和专题 Gate。

基础 Gate 默认适用于所有 Work Item：

| Gate | 作用 |
|---|---|
| Intake Gate | 检查 WI 输入、目标、范围和用户确认是否清晰 |
| Impact Gate | 检查影响范围、触发的专题分析和风险识别是否完整 |
| Trace Gate | 检查 REQ / AC / Design / Task / Test / Evidence 追溯关系 |
| Candidate Consistency Gate | 检查候选规格与当前 Project / Module 规格是否冲突 |
| Merge Gate | 检查合并报告、用户确认、文件更新和证据是否闭环 |

专题 Gate 按条件触发：

| Gate | 触发条件 |
|---|---|
| Viewpoint Gate | 涉及新增/调整架构视角、用户旅程、UI/UX、前端或跨视角设计 |
| ADR Gate | 涉及重要架构决策、替代旧决策或多个候选方案 |
| ATAM Gate | 涉及性能、安全、可靠性、成本、可维护性等质量属性取舍 |
| Domain Boundary Gate | 涉及模块创建、拆分、合并、重命名、职责或数据 owner 变化 |
| Service Boundary Gate | 涉及模块升级为独立服务或服务边界变化 |
| Resilience Pattern Gate | 涉及跨边界调用、外部依赖、异步事件、最终一致性或补偿/对账 |
| Runtime Delivery Gate | 涉及配置、依赖、环境、构建、发布、运行、日志、健康检查、迁移 |
| SRE / Operational Readiness Gate | 涉及 SLO、告警、可靠性目标、事故响应、运行就绪 |
| Architecture Evolution Gate | 涉及目标架构路线、适应度函数、架构漂移、废弃或迁移 |

AI MUST 在 `impact_analysis.md` 中输出本次 WI 的 Gate 清单。未触发的专题 Gate MUST NOT 被强制执行，但如果设计内容实际触发了该 Gate，AI MUST NOT 以“未声明触发”为理由绕过。

#### 2.5.3 冲突取舍总规则

当多个最佳实践看似重叠时，按以下职责分工取舍：

| 问题 | 优先使用 |
|---|---|
| 谁关心这个设计、需要哪些视角回答 | ISO 42010 |
| 架构文档如何组织 | arc42 |
| 设计写到哪个抽象层级 | C4 |
| 重要架构选择为什么这样做 | ADR |
| 方案如何影响质量属性和风险 | ATAM |
| 模块边界、领域概念、数据所有权怎么判断 | DDD |
| 模块是否可以升级为独立服务 | 微服务最佳实践 |
| 跨边界失败、重试、补偿、最终一致性怎么治理 | 云架构模式 |
| 应用如何配置、构建、发布、运行和记录日志 | Twelve-Factor App |
| 上线后可靠性如何度量、告警、复盘和提供证据 | SRE |
| 架构如何持续、增量、可验证地演进 | Evolutionary Architecture |

#### 2.5.4 轻量 Owner 规则

当前标准不融合 Team Topologies，不引入团队拓扑、团队类型、交互模式或团队认知负荷治理。

但为了防止架构资产无人维护，SpecForge 保留轻量 Owner 规则：

```text
重要模块、服务、运行单元、配置、依赖、SLO、告警、ADR、Fitness Function SHOULD 有 owner 或 maintainer。
```

该 owner 可以是个人、角色、Agent 责任域、维护责任描述或未来团队，不要求当前项目存在真实团队划分。

### 2.6 ISO 42010 吸收规则：利益相关方关切驱动的多视角架构

SpecForge 从 ISO/IEC/IEEE 42010 吸收的核心不是“多写几个架构文件”，而是“利益相关方关切驱动的多视角架构描述模型”。

架构视角不是技术文件分类，而是利益相关方关切的工程化表达。

SpecForge MUST 使用以下链路组织架构视角：

```text
Stakeholder → Concern → Viewpoint → View → Spec File → Gate → Trace
```

也就是说，AI 在创建或更新任何架构视角时，MUST 先回答：

1. 谁关心这个问题；
2. 他关心的业务、使用、技术、运行或治理问题是什么；
3. 应该用哪个视角回答；
4. 该视角观察的对象和颗粒度是什么；
5. 最终落到哪个规格文件；
6. 如何通过 Gate 检查完整性；
7. 如何进入 Trace 追溯链。

架构视角 MUST NOT 因为存在某个技术文件名而被机械创建。架构视角 MUST 服务于明确的 stakeholder concern。

用户业务视角、业务价值视角、用户旅程视角、UI/UX 视角 MUST 作为一等架构视角纳入 Project Spec。系统架构不能只回答模块、接口、数据库和部署问题，还必须回答用户如何完成业务任务、系统如何提高效率、节省时间、降低成本、获取数据和支撑决策。

### 2.7 多视角的观察对象与颗粒度规则

多视角不是所有视角都关注同一个模块，也不是所有视角都关注同一个页面。多视角是：同一个系统在不同利益相关方关切下，被切成不同观察对象和不同颗粒度。

SpecForge MUST 为每个 viewpoint 明确 observation target 和 granularity。

| Viewpoint | 主要 Stakeholder | Concern | 观察对象 | 典型颗粒度 | SpecForge 文件 |
|---|---|---|---|---|---|
| Business Value View | 业务负责人、甲方、用户 | 系统为什么有价值 | 业务目标、成本、效率、数据能力、决策能力 | 项目 / 业务域 / 核心业务任务 | `business_value.md` |
| User Journey View | 最终用户、业务专家、产品 | 用户如何完成业务 | 用户角色、业务场景、任务链路 | 端到端业务任务 / 用户旅程 / 操作步骤 | `user_journeys.md` |
| UI/UX View | 用户、产品、前端、测试 | 页面是否好用、流程是否顺 | 页面、表单、按钮、列表、状态、提示 | 页面 / 业务操作单元 / 表单字段 / 交互状态 | `ui_experience_design.md` |
| Frontend Architecture View | 前端、架构师、AI Agent | 前端如何组织和运行 | 路由、页面模块、状态管理、组件边界、权限控制 | 前端应用 / 路由域 / 页面模块 / 组件组 | `frontend_design.md` |
| System Context View | 架构师、集成方、用户 | 系统边界是什么 | 系统、外部系统、用户角色、上下游 | 系统级 / 外部依赖级 | `architecture.md` |
| Module View | 架构师、开发、AI Agent | 模块职责和边界 | 模块、职责、依赖、数据 owner | 模块 / 子模块 / 内部组件 | `architecture.md` + module `design.md` |
| Integration View | 后端、集成方、测试 | 模块如何协作 | 模块调用、同步/异步协作、失败处理 | 模块关系 / 调用链 / 集成场景 | `integration_design.md` |
| API Contract View | 前端、后端、集成方 | 接口如何对接 | API、请求、响应、错误码、版本 | API / Endpoint / Message | `api_contracts.md` |
| Data View | 后端、DBA、数据分析、安全 | 数据归属和共享边界 | 实体、DTO、表、字段、枚举、数据生命周期 | 业务实体 / 表 / 字段 / 数据流 | `data_model.md` / `database_design.md` |
| Event / Runtime View | 后端、架构师、测试 | 运行时状态如何变化 | 事件、流程、状态机、补偿、幂等 | 业务流程 / Event / Step / State | `event_flows.md` |
| Security View | 安全、运维、架构师 | 如何保护系统和数据 | 身份、权限、密钥、审计、敏感字段 | 安全域 / 权限点 / 数据字段 / 威胁场景 | `security_design.md` |
| Reliability View | 运维、SRE、用户 | 系统故障时如何保持可用 | 故障模式、恢复策略、降级、容灾 | 服务能力 / 故障场景 / SLO | `reliability_design.md` |
| Observability View | 运维、开发、SRE | 如何发现和定位问题 | 日志、指标、链路、告警、Dashboard | 信号 / 指标 / Trace Span / 告警规则 | `observability_design.md` |
| Deployment View | 运维、DevOps、架构师 | 系统如何部署运行 | 环境、节点、容器、配置、网络、资源 | 环境 / 部署单元 / 节点 / 资源 | `deployment_design.md` |
| Quality Attribute View | 架构师、业务负责人、测试 | 性能、安全、成本、可维护性的取舍 | 质量属性、约束、场景、目标值 | 质量属性场景 / SLO / Trade-off | `quality_attributes.md` |
| Risk View | 架构师、项目经理、用户 | 架构风险和未决问题 | 技术风险、业务风险、依赖风险、债务 | 风险项 / 假设 / 缓解措施 | `architecture_risks.md` |
| Decision View | 架构师、AI Agent、维护者 | 为什么这样设计 | 决策、候选方案、后果、回滚 | ADR / Decision | `project/decisions/` |
| Traceability View | QA、AI Agent、维护者 | 需求、设计、代码、测试是否闭环 | REQ、AC、DD、API、Task、Code、Test、Evidence | Trace Link / Matrix Row | `trace_matrix.md` |

AI MUST NOT 把所有视角都压成“模块拆分问题”。模块拆分只是 Module View 的一个问题。用户旅程视角关注业务任务；UI/UX 视角关注页面和操作单元；API 视角关注契约；Data 视角关注数据归属；Security 视角关注安全边界；Reliability 视角关注故障和恢复。

AI 在设计任何功能时，MUST 先判断该功能影响哪些视角，并按每个视角自己的观察对象和颗粒度生成对应规格，而不是把所有内容都写进模块 `design.md`。

### 2.8 颗粒度选择规则

AI 选择视角颗粒度时，MUST 遵循以下规则：

1. **业务价值视角** MUST 以业务目标、业务任务、成本、效率、数据能力和决策能力为颗粒度，MUST NOT 以按钮、表、接口作为主要颗粒度。
2. **用户旅程视角** MUST 以用户完成一个端到端业务任务为颗粒度，例如“提交检查记录”“完成登录”“导出经营报表”。
3. **UI/UX 视角** MUST 以页面和业务操作单元为颗粒度。业务操作单元可以由表格、下拉框、按钮、弹窗、筛选条件、表单字段、状态提示组成。单个按钮或字段只有在影响业务任务完成、权限、安全或数据质量时，才单独成为设计对象。
4. **前端架构视角** MUST 以路由域、页面模块、状态边界、组件组、数据加载策略为颗粒度，MUST NOT 替代 UI/UX 的业务操作说明。
5. **模块视角** MUST 以业务能力、职责边界、数据 owner、规则内聚和依赖关系为颗粒度，MUST NOT 用页面、按钮或数据库表直接决定模块边界。
6. **API 视角** MUST 以跨边界契约为颗粒度。页面需要的数据不等于 API 应该按页面一比一设计，AI SHOULD 根据业务能力、数据归属、复用性和权限边界设计 API。
7. **数据视角** MUST 以业务实体、数据归属、共享模型、表、字段和生命周期为颗粒度。字段级设计只有在涉及共享、敏感、安全、索引、兼容或数据质量时必须显式记录。
8. **运行时 / 事件视角** MUST 以业务流程、事件、状态迁移、失败补偿和幂等为颗粒度。
9. **部署视角** MUST 以部署单元、环境、资源、网络、配置和运行依赖为颗粒度。模块不自动等于部署单元。
10. **质量、风险和决策视角** MUST 以可验证场景、权衡、风险项和 ADR 为颗粒度。

当一个 Work Item 涉及多个颗粒度时，AI MUST 保持从业务到技术的顺序：

```text
Business Task → User Journey → UI Operation Unit → Requirement / AC → Module Responsibility → API/Data/Event Contract → Task / Code / Test → Evidence
```

### 2.8 示例：登录能力的多视角拆解

同一个“登录”能力，在不同视角下观察对象不同：

| Viewpoint | 观察对象 | 颗粒度示例 | 需要回答的问题 |
|---|---|---|---|
| Business Value | 身份可信、权限受控、减少人工确认 | 业务能力 | 登录给业务带来什么价值，是否减少人工核验、提高安全性 |
| User Journey | 用户完成登录并进入工作台 | 端到端任务 | 用户从哪里进入，输入什么，失败后如何继续 |
| UI/UX | 登录页、验证码、忘记密码、错误提示 | 页面 / 操作单元 | 页面显示什么，用户点什么，系统自动校验什么 |
| Frontend Architecture | `/login` 路由、Auth Store、Token 保存策略 | 路由域 / 状态边界 | 前端如何保存登录状态，如何处理过期和刷新 |
| Module | auth 模块、user 模块边界 | 模块职责 | 认证归 auth，用户资料归 user，边界如何划分 |
| API | `POST /auth/login` | Endpoint | 请求、响应、错误码、兼容策略是什么 |
| Data | User、Credential、Session、LoginAudit | 实体 / 表 / 字段 | 密码、Token、审计字段归谁所有，哪些字段敏感 |
| Security | 密码策略、Token、权限、审计 | 安全场景 | 如何防爆破、如何审计、如何保护凭证 |
| Reliability | 登录依赖不可用、限流、降级 | 故障场景 | 登录失败是否影响其他业务，如何限流和恢复 |
| Observability | 登录失败率、延迟、审计日志 | 指标 / 日志 | 如何发现登录异常、如何定位失败原因 |
| Deployment | auth 是否独立部署 | 部署单元 | 当前是否需要独立部署，还是模块化单体即可 |
| Traceability | REQ-AC-DD-API-Code-Test-Evidence | Trace 行 | 登录需求是否完整追溯到实现和验证证据 |

因此，AI 不能问“登录到底是模块、页面还是按钮”。正确做法是：先识别本次 Work Item 的业务目标，再判断它影响哪些视角；每个视角用自己的观察对象和颗粒度表达同一个系统能力。

---

### 2.9 arc42 吸收规则：结构化架构文档

SpecForge 从 arc42 吸收的不是固定复制某个文档模板，而是“架构知识必须结构化表达”的原则。

AI MUST NOT 以散文方式输出架构设计。AI MUST 按稳定模板输出架构目标、约束、上下文、解决策略、构建块、运行时、部署、横切概念、决策、质量、风险和术语。

arc42 的内容在 SpecForge 中的落地关系如下：

| arc42 关注点 | SpecForge 落地文件 | 落地理由 | Gate |
|---|---|---|---|
| Introduction & Goals | `business_value.md` / `architecture.md` | 防止架构脱离业务目标和用户价值 | Architecture Structure Gate |
| Constraints | `architecture.md` / `quality_attributes.md` | 明确技术、业务、组织、合规、运行环境约束 | Context Gate / Quality Gate |
| Context & Scope | `architecture.md` / `integration_design.md` / `user_journeys.md` | 先定边界，再定模块、接口、数据 | Context Gate |
| Solution Strategy | `architecture.md` | 记录总体架构策略和取舍 | ADR Gate / Architecture Gate |
| Building Block View | `architecture.md` / module `design.md` | 项目级看模块，模块级看内部组件 | Building Block Gate |
| Runtime View | `user_journeys.md` / `event_flows.md` / `integration_design.md` | 说明系统运行时如何完成业务流程和异常处理 | Runtime Flow Gate |
| Deployment View | `deployment_design.md` / `infrastructure_design.md` | 说明系统如何在真实环境运行、升级、回滚 | Deployment Gate |
| Crosscutting Concepts | `crosscutting_concepts.md` + 专题设计文件 | 统一错误、权限、日志、审计、命名、前端交互等横切规则 | Crosscutting Concept Gate |
| Architecture Decisions | `project/decisions/` | 记录候选方案、选择依据、后果和回滚 | ADR Gate |
| Quality Requirements | `quality_attributes.md` / `reliability_design.md` / `observability_design.md` | 把质量要求变成场景、指标、验证方式 | Quality Gate / SRE Gate |
| Risks & Technical Debt | `architecture_risks.md` | 记录风险、技术债、缓解措施和未决问题 | Risk Gate |
| Glossary | `glossary.md` | 统一业务和技术语言 | Glossary Gate |

#### 2.9.1 `architecture.md` 的 arc42 化要求

`architecture.md` MUST 作为项目级架构总纲，承载 arc42 结构中的摘要、边界、策略和引用入口。它 MUST 覆盖以下章节：

```text
# architecture.md

## 1. Architecture Goals
## 2. Stakeholders and Concerns
## 3. Constraints
## 4. System Context and Scope
## 5. Solution Strategy
## 6. Building Block Overview
## 7. Runtime Overview
## 8. Deployment Overview
## 9. Crosscutting Concepts
## 10. Quality Attribute Summary
## 11. Architecture Risks
## 12. Decision References
```

`architecture.md` MUST 统领并引用 `integration_design.md`、`api_contracts.md`、`data_model.md`、`database_design.md`、`event_flows.md`、`deployment_design.md`、`security_design.md`、`observability_design.md`、`reliability_design.md`、`quality_attributes.md`、`architecture_risks.md`、`crosscutting_concepts.md`，但 MUST NOT 承载所有专题细节。

#### 2.9.2 构建块规则

Project-level building blocks SHOULD 映射为模块；Module-level building blocks SHOULD 映射为模块内部组件；Code-level building blocks SHOULD 由 task、code reference 和 trace 承接。

AI MUST NOT 直接从代码包名、页面名或数据库表名推导模块边界。AI MUST 先根据业务能力、数据归属、职责边界、变化频率、接口边界和维护责任判断模块边界，再映射到代码结构。

#### 2.9.3 运行时规则

关键用户旅程 MUST 有对应 Runtime View。Runtime View MUST 说明主流程、替代流程、失败路径、参与模块、API/Event/Data 引用、幂等、重试、补偿、观测信号和验证方式。

#### 2.9.4 横切概念规则

SpecForge MUST 支持 `crosscutting_concepts.md`。该文件用于记录跨模块共同遵守的规则，并作为横切规则总索引。专题文件可以记录具体实现细则，模块设计只能引用，不得重复定义或私自覆盖。

典型横切规则包括：

- API 命名、版本、错误码、分页、幂等；
- 数据 ID、审计字段、软删除、时间字段、多租户、敏感字段；
- 认证、授权、权限点、Token、密钥、审计；
- 日志、Trace ID、Metric、告警、业务埋点；
- 前端页面权限、表单校验、自动保存、错误提示、空状态、加载状态；
- 异常分类、用户提示、系统日志、重试、降级；
- 数据保留、脱敏、操作留痕、合规要求。

#### 2.9.5 风险和技术债规则

SpecForge MUST 支持 `architecture_risks.md`。重大架构变更、复杂集成、跨模块数据迁移、可靠性目标调整、安全模型调整、部署边界调整都 MUST 记录风险、技术债、缓解措施、责任人、状态和关联 WI/ADR/REQ。


### 2.11 C4 Model 吸收规则：分层架构表达与颗粒度控制

SpecForge 从 C4 Model 吸收的不是“必须画四张图”，也不是“按照 C4 来拆模块”，而是“从系统上下文到代码实现的逐层放大机制”。

C4 在 SpecForge 中 MUST 被定义为 AI 架构设计的分层观察协议，用于控制架构分析颗粒度，防止 AI 从用户需求直接跳到模块、表字段、类名、函数和代码文件。

C4 不替代需求分析、DDD 模块拆分、ADR 决策、ATAM 权衡、Gate 校验和 Trace。它主要解决：

```text
当前设计应该看到哪一层？
应该先看系统边界，还是运行单元，还是模块内部组件，还是代码结构？
```

#### 2.10.1 C4 与其他最佳实践的分工

SpecForge MUST 按以下方式理解 ISO 42010、arc42 和 C4 的关系：

```text
ISO 42010 = 视角来源：谁关心什么？
arc42 = 文档结构：文件应该怎么组织？
C4 = 抽象层级：当前应该看到哪一层？
```

冲突取舍规则：

1. 当不知道是否需要某个视角时，MUST 按 ISO 42010 判断是否存在明确 stakeholder concern。
2. 当不知道文件怎么写时，MUST 按 arc42 判断是否覆盖目标、约束、上下文、构建块、运行时、部署、质量、风险。
3. 当不知道写到多细时，MUST 按 C4 判断当前应该处在 C1、C2、C3 还是 C4。

#### 2.10.2 C4 的上游输入

C4 的上游不是代码，也不是目录结构。AI 使用 C4 前 MUST 读取或识别：

- Work Item intake；
- `business_value.md`；
- `user_journeys.md`；
- `ui_experience_design.md`；
- module `requirements.md` / `requirements_delta.md`；
- `architecture.md`；
- `spec_manifest.json`；
- `integration_design.md`；
- `api_contracts.md`；
- `data_model.md` / `database_design.md`；
- `project/decisions/`；
- `trace_matrix.md`。

AI MUST NOT 凭空生成 C4 视图。C4 视图必须从现有需求、用户旅程、系统边界、模块清单、架构约束、接口契约、数据设计和 ADR 中推导。

#### 2.10.3 C4 的下游消费者

C4 的结果 MUST 融合进 Project Spec、Module Spec、Work Item 和 Gate，不得形成另一套孤立规格真相。

| C4 层级 | 下游消费者 | 消费用途 |
|---|---|---|
| C1 System Context | `architecture.md`、`business_value.md`、`user_journeys.md`、`integration_design.md` | 确定系统边界、用户、外部系统、业务目标 |
| C2 Container | `deployment_design.md`、`infrastructure_design.md`、`integration_design.md`、`api_contracts.md`、`database_design.md` | 确定前端、后端、数据库、消息队列、Worker、外部服务和通信 |
| C3 Component | module `design.md`、`frontend_design.md`、module `data_design.md` | 定义模块内部组件、前端页面模块、内部流程和数据结构 |
| C4 Code | `tasks.md`、`trace.md`、`code_migration_map.md`、`verification_report.md` | 指导代码实现、重构迁移、Trace 和验证 |
| 全部层级 | Gate、Trace、ADR、`merge_report.md` | 检查跳层、记录决策、保持追溯、记录合并影响 |

#### 2.10.4 C4 层级定义和融合位置

| C4 层级 | 关注对象 | SpecForge 融合位置 | 禁止事项 |
|---|---|---|---|
| C1 System Context | 整个系统、用户角色、外部系统、业务边界、数据来源和去向 | `architecture.md`、`business_value.md`、`user_journeys.md`、`integration_design.md` | MUST NOT 写数据库字段、类名、函数、页面按钮 |
| C2 Container | Web 前端、Mobile App、Backend API、Worker、Scheduler、Database、Cache、Message Broker、Third-party Service | `deployment_design.md`、`infrastructure_design.md`、`integration_design.md`、`api_contracts.md`、`database_design.md` | MUST NOT 把 C4 Container 等同于 Docker Container；MUST NOT 把 Module 自动等同于服务 |
| C3 Component | 模块内部组件、领域服务、应用服务、适配器、仓储、策略组件、规则引擎、前端状态模块、页面组 | module `design.md`、`frontend_design.md`、module `data_design.md` | MUST NOT 直接替代代码实现；MUST NOT 用组件反向决定模块边界 |
| C4 Code | 包、类、函数、文件、接口、具体实现结构 | `tasks.md`、`code_migration_map.md`、module `trace.md`、`verification_report.md` | MAY 仅在代码结构影响架构、迁移、Trace、安全、性能或任务规划时使用 |

辅助图 MAY 存放于：

```text
project/diagrams/
  c1_system_context.md
  c2_container_view.md
  c3_component_view_<module>.md
  deployment_view.md
  dynamic_view_<flow>.md
```

图可以使用 Markdown、Mermaid、PlantUML、Structurizr DSL、图片或外部模型引用。只要可行，图的源表示 SHOULD 存入仓库。图必须引用正式规格文件，MUST NOT 成为唯一事实来源。

#### 2.10.5 AI 使用 C4 的操作协议

AI 在架构设计任务中 MUST 使用 C4 判断本次变更影响哪些层级。

以下情况 MUST 使用 C4 分层分析：

- 新增核心业务能力；
- 新增模块；
- 修改模块边界；
- 接入外部系统；
- 新增前端入口；
- 新增数据库或共享数据结构；
- 新增 Worker / Scheduler / Message Broker；
- 新增部署单元；
- 重大接口调整；
- 架构重构；
- 跨模块功能。

以下情况 MAY 不完整使用 C1-C4：

- 修改文案；
- 修改单个样式；
- 修复局部 bug；
- 补充单个测试；
- 不改变需求、接口、数据、模块、部署和架构边界的局部实现。

AI MUST 按以下步骤执行：

1. **判断层级影响**：明确本次 Work Item 影响 C1/C2/C3/C4 哪些层级。
2. **C1 系统上下文**：确认用户、业务任务、系统边界、外部系统、输入输出和不属于本系统的职责。
3. **C2 运行单元**：确认 Web、API、Database、Worker、Scheduler、Cache、Message Broker、外部服务和部署拓扑是否受影响。
4. **C3 内部组件**：确认受影响模块、内部组件、组件职责、组件依赖和引用的 API/Data/Event 契约。
5. **C4 代码结构**：只有必要时才输出代码级结构，并说明为什么需要代码级视图。

AI MUST NOT 从业务需求直接跳到代码级类、函数或文件，除非 Work Item 明确是局部代码修复且无架构影响。

#### 2.10.6 必须区分的对象

AI MUST 明确区分以下对象：

| 对象 | 含义 | 常见误用 |
|---|---|---|
| User Journey | 用户完成一个端到端业务任务的路径 | 把用户旅程当页面清单 |
| UI Page | 用户操作界面 | 把页面当模块 |
| Business Operation Unit | 页面中承载一个业务动作的表单、表格、按钮组合 | 把单个按钮过度设计成模块 |
| SpecForge Module | 业务能力、职责边界和规格治理边界 | 把模块自动当微服务 |
| C4 Container | 可运行单元或数据存储 | 把 C4 Container 当 Docker Container |
| Component | 容器或模块内部组件 | 把组件直接等同于代码文件 |
| Code | 具体实现结构 | 用代码结构反向决定业务模块 |

模块拆分 MUST NOT 仅依据 C4。模块拆分 MUST 使用业务能力、数据归属、规则内聚、变化频率、接口边界、部署边界、维护责任和复杂度成本进行判断。

#### 2.10.7 C4 示例：登录能力

同一个“登录”能力在 C4 层级下应这样表达：

| C4 层级 | 输出位置 | 示例内容 |
|---|---|---|
| C1 | `architecture.md` / `user_journeys.md` | 用户：普通业务用户、管理员；外部系统：本阶段无统一身份认证；系统边界：本系统负责认证、会话和登录审计；不负责短信认证和第三方 OAuth |
| C2 | `deployment_design.md` / `integration_design.md` / `database_design.md` | Web Frontend 调用 Backend API；Backend API 访问 App Database；登录审计写入 audit_log；auth 本阶段不独立部署，仍属于 Backend API 容器 |
| C3 | `project/modules/auth/design.md` | AuthController、CredentialVerifier、TokenIssuer、LoginAuditWriter、AuthPolicy 等组件及职责 |
| C4 | `work-items/<WI>/tasks.md` / module `trace.md` | `src/modules/auth/auth.controller.ts`、`src/modules/auth/credential-verifier.ts`、`tests/auth/login.test.ts` 等代码级任务 |

C4 Code View 只应在任务规划、代码迁移、Trace 或验证阶段出现，不应在业务需求刚提出时提前固化。

### 2.12 ADR 吸收规则：架构决策记录与可追溯治理

SpecForge 从 ADR（Architecture Decision Record）吸收的不是“多写一个决策文件”，而是“重要架构选择必须被记录、审查、追溯和演进”的治理机制。

ADR 在 SpecForge 中 MUST 被定义为架构决策治理机制。它不替代需求分析、C4 分层观察、DDD 模块拆分、ATAM 权衡和 Gate 校验；它负责把重要架构结论背后的背景、候选方案、权衡、后果、验证方式和替代策略记录下来。

#### 2.11.1 ADR 与其他最佳实践的分工

SpecForge MUST 按以下方式理解前四个最佳实践之间的关系：

```text
ISO 42010 = 视角来源：谁关心什么？
arc42 = 文档结构：文件应该怎么组织？
C4 = 抽象层级：当前应该看到哪一层？
ADR = 决策治理：为什么选择这个方案，放弃了什么，后果是什么？
```

冲突取舍规则：

1. 当不知道是否需要某个视角时，MUST 按 ISO 42010 判断是否存在明确 stakeholder concern。
2. 当不知道文件怎么写时，MUST 按 arc42 判断是否覆盖目标、约束、上下文、构建块、运行时、部署、质量、风险。
3. 当不知道写到多细时，MUST 按 C4 判断当前应该处在 C1、C2、C3 还是 C4。
4. 当存在多个可行方案或重要架构选择时，MUST 用 ADR 记录选择依据、取舍、后果和替代策略。

#### 2.11.2 ADR 的上游输入

ADR MUST 在分析之后生成，MUST NOT 先拍结论再补理由。

AI 生成 ADR Draft 前 MUST 读取或引用：

- Work Item `intake.md`；
- `impact_analysis.md`；
- `requirements_delta.md`；
- `design_delta.md` / `architecture_delta.md`；
- `business_value.md`；
- `quality_attributes.md`；
- `architecture_risks.md`；
- `architecture.md`；
- 相关项目级设计文件；
- 相关模块 `requirements.md` / `design.md`；
- 已有 `project/decisions/` ADR；
- Gate 检查结果；
- 用户确认意见。

#### 2.11.3 ADR 的下游消费者

ADR MUST 被以下对象消费，而不是写完后归档遗忘：

| 消费者 | 消费用途 |
|---|---|
| AI Agent | 设计前读取已有决策，避免违背已接受的架构约束 |
| Requirements / Design Agent | 判断新需求、新设计是否影响已有决策 |
| Task Planner | 把决策后果转化为实现任务和验证任务 |
| Reviewer | 检查设计和代码是否符合已接受 ADR |
| Verifier | 检查验证证据是否覆盖 ADR 的后果和约束 |
| Gate | 检查重大架构变更是否有 ADR，ADR 与候选规格是否一致 |
| Trace | 建立 REQ/AC → Design → ADR → Task → Code → Test → Evidence 链路 |
| 后续 Work Item | 判断是否需要 supersede 旧 ADR |

#### 2.11.4 ADR 的存放位置

正式 ADR MUST 存放在：

```text
.specforge/project/decisions/
  decision_log.md
  ADR-0001-use-modular-monolith.md
  ADR-0002-split-auth-from-core.md
```

`decision_log.md` MUST 是 ADR 索引，不承载详细决策。每个 ADR 文件 MUST 只承载一个架构决策。

Work Item 中 MAY 先生成：

```text
work-items/<WI>/options_analysis.md
work-items/<WI>/adr_draft.md
```

只有在 ADR Gate 通过、用户确认通过之后，`adr_draft.md` 才 MAY 合并为 `project/decisions/ADR-XXXX-title.md`。

#### 2.11.5 什么时候必须生成 ADR

以下情况 MUST 生成 ADR：

1. 模块拆分、合并、重命名、职责边界调整；
2. 从 `core` 演进为多模块；
3. 从模块化单体演进为微服务；
4. 新增或改变跨模块 API 契约策略；
5. 新增或改变事件驱动、消息队列、Outbox、Saga、CQRS 等架构模式；
6. 改变数据所有权、数据库类型、分库分表、事务边界；
7. 改变部署架构、运行单元、云原生基础设施；
8. 改变认证、授权、安全边界、敏感数据处理方式；
9. 改变可靠性目标、SLO、容灾、限流、降级策略；
10. 引入关键技术栈、框架、平台、中间件；
11. 选择某个方案会显著影响成本、性能、安全、维护性或交付速度；
12. 推翻、替代、废弃已有 ADR。

以下情况 SHOULD 生成 ADR：

1. 候选方案超过一个，并且各有明显取舍；
2. 用户、开发、运维、安全等利益相关方可能关注该决策；
3. 该决策会影响多个 Work Item；
4. 未来维护者需要知道为什么这么做。

以下情况 MAY 不生成 ADR：

1. 局部代码重构，不影响模块边界和架构规则；
2. 页面文案调整；
3. 普通 bug 修复；
4. 不改变契约、数据、部署、安全、可靠性的局部实现优化。

#### 2.11.6 ADR 操作协议

AI 在 `impact_analysis.md` 阶段 MUST 输出：

```yaml
adr_required: true | false
adr_reason: <why>
affected_existing_adrs:
  - ADR-XXXX
new_adr_candidates:
  - <decision topic>
```

当 `adr_required = true` 时，AI MUST：

1. 读取相关已有 ADR；
2. 生成 `options_analysis.md`；
3. 至少比较“保持现状 / 最小修改方案”“推荐方案”“更复杂或替代方案”；
4. 从业务价值、复杂度、交付成本、运行成本、数据风险、接口风险、性能、安全、可靠性、可维护性、可演进性、维护复杂度等维度做权衡；
5. 生成 `adr_draft.md`；
6. 通过 ADR Gate；
7. 获得用户确认；
8. 合并为正式 ADR；
9. 更新 `decision_log.md`、`merge_report.md` 和 Trace。

AI MUST NOT 只输出“采用 X 架构”这类结论。任何重大架构结论都 MUST 有 Context、Options、Decision、Rationale、Consequences、Trade-offs、Validation 和 Supersession Strategy。

#### 2.11.7 ADR 与 Merge 的关系

ADR、Candidate、Merge Report 三者 MUST 一致。

当 ADR 决定采用事件驱动时，Gate MUST 检查：

- `event_flows.md` 是否更新；
- `integration_design.md` 是否更新；
- `reliability_design.md` 是否定义重试、幂等、补偿；
- `observability_design.md` 是否定义 tracing、metrics、alerts；
- `tasks.md` 是否覆盖实现任务；
- `trace_matrix.md` 是否建立引用。

Accepted ADR MUST NOT 被原地重写以改变决策。若需要改变决策，MUST 新建 ADR，并通过 `supersedes` / `superseded_by` 建立替代关系。


### 2.13 ATAM 吸收规则：质量属性权衡分析

SpecForge 从 ATAM（Architecture Tradeoff Analysis Method）吸收的不是完整的正式评审会议流程，而是“架构候选方案必须经过质量属性权衡分析”的治理机制。

ATAM 在 SpecForge 中 MUST 被定义为质量属性与权衡分析协议。它不替代 ISO 42010 的利益相关方关切识别，不替代 arc42 的文档结构，不替代 C4 的分层观察，不替代 ADR 的决策记录，也不替代 DDD 的模块拆分判断。ATAM 负责回答：

```text
这个架构方案换来了什么？
牺牲了什么？
引入了什么风险？
这些风险如何缓解？
这个方案是否能被验证？
```

AI MUST NOT 只说明方案优点。AI 在提出重要架构方案时，MUST 同时说明成本、风险、负面后果、质量属性取舍和验证方式。

#### 2.12.1 ATAM 与其他最佳实践的分工

SpecForge MUST 按以下方式理解前五个最佳实践之间的关系：

```text
ISO 42010 = 视角来源：谁关心什么？
arc42 = 文档结构：文件应该怎么组织？
C4 = 抽象层级：当前应该看到哪一层？
ADR = 决策治理：为什么选择这个方案，放弃了什么，后果是什么？
ATAM = 权衡分析：方案对质量属性有什么影响，风险如何验证？
```

冲突取舍规则：

1. 当不知道是否需要某个视角时，MUST 按 ISO 42010 判断是否存在明确 stakeholder concern。
2. 当不知道文件怎么写时，MUST 按 arc42 判断是否覆盖目标、约束、上下文、构建块、运行时、部署、质量、风险。
3. 当不知道写到多细时，MUST 按 C4 判断当前应该处在 C1、C2、C3 还是 C4。
4. 当存在多个可行方案或重要架构选择时，MUST 用 ADR 记录选择依据、取舍、后果和替代策略。
5. 当方案会影响性能、安全、可靠性、可用性、可维护性、可扩展性、成本、交付速度、运维性或用户体验时，MUST 用 ATAM 做质量属性权衡分析。

#### 2.12.2 ATAM 的上游输入

ATAM MUST 建立在已识别的需求、约束和候选方案之上，MUST NOT 先喊“高性能、高可靠”再倒推设计。

AI 生成 `quality_attribute_analysis.md` 前 MUST 读取或引用：

- Work Item `intake.md`；
- `impact_analysis.md`；
- `requirements_delta.md`；
- `design_delta.md` / `architecture_delta.md`；
- `options_analysis.md`；
- `business_value.md`；
- `quality_attributes.md`；
- `architecture_risks.md`；
- `architecture.md`；
- `security_design.md`；
- `reliability_design.md`；
- `observability_design.md`；
- `deployment_design.md`；
- 相关模块 `requirements.md` / `design.md`；
- 相关 ADR 或 ADR Draft；
- 相关 Gate 结果。

#### 2.12.3 ATAM 的下游消费者

ATAM 的结果 MUST 被以下对象消费，不得只作为分析段落归档：

| 消费者 | 消费用途 |
|---|---|
| ADR | 将质量属性权衡输入 `Options Considered`、`Trade-offs`、`Consequences`、`Risks`、`Validation` |
| `quality_attributes.md` | 更新项目级质量目标、质量场景和默认取舍规则 |
| `architecture_risks.md` | 记录中高架构风险、缓解措施、Owner 和状态 |
| `security_design.md` | 承接安全风险、安全边界、权限、敏感数据处理要求 |
| `reliability_design.md` | 承接可用性、容灾、重试、限流、降级、RTO/RPO 要求 |
| `observability_design.md` | 承接日志、指标、Trace、告警、Dashboard 和运行证据要求 |
| `tasks.md` | 把权衡结论转成实现任务、验证任务和补偿任务 |
| `verification_report.md` / `evidence/` | 保存性能、安全、可靠性、可维护性等验证证据 |
| Gate | 检查重大设计是否只写优点、是否识别风险、是否有验证方式 |
| `merge_report.md` | 记录未解决风险、已接受取舍和后续工作 |

#### 2.12.4 ATAM 的存放位置

项目级长期质量目标 MUST 存放在：

```text
.specforge/project/quality_attributes.md
```

本次 Work Item 的质量属性权衡分析 MUST 存放在：

```text
.specforge/work-items/<WI-ID>/quality_attribute_analysis.md
```

二者职责 MUST 区分：

```text
project/quality_attributes.md
= 长期质量属性目标、优先级、质量场景和全局取舍原则；

work-items/<WI>/quality_attribute_analysis.md
= 本次变更对质量属性的影响、候选方案比较、敏感点、权衡点、风险和验证计划。
```

中高风险 MUST 进入 `project/architecture_risks.md`。重大选择 MUST 进入 `project/decisions/ADR-XXXX.md`。验证要求 MUST 进入 `tasks.md`、`verification_report.md` 或 `evidence/`。

#### 2.12.5 什么时候必须触发 ATAM

以下情况 MUST 生成 `quality_attribute_analysis.md`：

1. 引入或改变架构模式，例如事件驱动、微服务、CQRS、Saga、Outbox、TCC、分布式锁；
2. 新增、拆分、合并或调整模块边界；
3. 新增或改变部署单元、运行单元、云原生基础设施；
4. 新增或改变数据库类型、事务边界、数据一致性策略、数据所有权；
5. 涉及认证、授权、敏感数据、安全边界、审计策略；
6. 涉及核心业务链路可靠性、RTO/RPO、限流、降级、容灾；
7. 涉及性能、容量、并发、实时性或大数据量处理要求；
8. 涉及成本、复杂度、运维负担明显增加；
9. 涉及用户体验显著变化，例如步骤变多、等待时间变长、用户需要额外确认；
10. `adr_required = true` 且该决策涉及质量属性取舍。

以下情况 SHOULD 生成：

1. 有多个候选方案，并且各方案在复杂度、质量、成本上差异明显；
2. 某个方案明显更复杂，但可能带来长期收益；
3. 用户或团队对质量属性有明确偏好；
4. 未来维护风险较高。

以下情况 MAY 不生成：

1. 小范围文案调整；
2. 不改变架构的普通 bug 修复；
3. 不影响质量属性的局部代码清理；
4. 明确没有架构影响的 UI 微调。

#### 2.12.6 `quality_attributes.md` 文件要求

`quality_attributes.md` MUST 定义项目级质量目标、质量场景、优先级和取舍原则。

建议结构：

```markdown
# Quality Attributes

## 1. Purpose
说明本文件定义项目级质量属性目标、优先级和取舍原则。

## 2. Quality Attribute Priorities
| Quality Attribute | Priority | Reason | Owner |
|---|---|---|---|
| Security | High | 涉及身份、权限、敏感数据 | 架构/安全 |
| Reliability | High | 核心业务不可长时间中断 | 架构/运维 |
| Performance | Medium | 常规业务需流畅，但不盲目追求极限 | 架构/开发 |
| Cost | Medium | 成本受控，避免过度设计 | 项目负责人 |
| Maintainability | High | 系统长期演进，AI 和人都要能维护 | 架构/开发 |

## 3. Quality Scenarios
| Scenario ID | Scenario | Metric | Target | Related REQ/AC | Verification |
|---|---|---|---|---|---|
| QA-001 | 用户登录 | P95 latency | TBD / 300ms | AUTH-REQ-001 | 性能测试 |
| QA-002 | 核心任务提交 | Success Rate | TBD / 99.9% | TASK-REQ-001 | 自动化测试 + 监控 |

## 4. Trade-off Principles
| Conflict | Default Priority | Rule |
|---|---|---|
| Consistency vs Performance | Consistency | 核心交易类数据一致性优先 |
| Security vs Convenience | Security | 涉及敏感操作时安全优先 |
| Delivery Speed vs Maintainability | Maintainability | 核心模块不允许用不可维护方案换速度 |
| Cost vs Reliability | Depends | 核心链路可靠性优先，非核心链路成本优先 |

## 5. Related Design Files
- reliability_design.md
- security_design.md
- observability_design.md
- deployment_design.md
- architecture_risks.md
- project/decisions/

## 6. Open Questions
| Question | Owner | Due | Status |
|---|---|---|---|
```

#### 2.12.7 `quality_attribute_analysis.md` 文件要求

`quality_attribute_analysis.md` MUST 记录本次 Work Item 的质量属性权衡。

建议结构：

```markdown
# Quality Attribute Analysis

## 1. Work Item
- WI:
- Title:
- Type:
- Affected Modules:
- Affected Project Docs:

## 2. Architecture Change Summary
说明本次变更做了什么架构调整。

## 3. Relevant Quality Attributes
| Quality Attribute | Relevant? | Reason |
|---|---|---|
| Performance | Yes/No | |
| Security | Yes/No | |
| Reliability | Yes/No | |
| Availability | Yes/No | |
| Maintainability | Yes/No | |
| Scalability | Yes/No | |
| Cost | Yes/No | |
| Delivery Speed | Yes/No | |
| Operability | Yes/No | |
| User Experience | Yes/No | |

## 4. Candidate Options
| Option | Description |
|---|---|
| Option A | 保持现状 / 最小修改 |
| Option B | 推荐方案 |
| Option C | 更复杂或替代方案 |

## 5. Trade-off Matrix
| Option | Performance | Security | Reliability | Maintainability | Cost | Delivery Speed | User Experience | Risk |
|---|---|---|---|---|---|---|---|---|
| A | | | | | | | | |
| B | | | | | | | | |
| C | | | | | | | | |

## 6. Sensitivity Points
列出哪些设计选择会显著影响质量属性。

## 7. Trade-off Points
| Trade-off | Explanation | Chosen Direction |
|---|---|---|

## 8. Risks
| Risk ID | Risk | Severity | Mitigation | Target File |
|---|---|---|---|---|

## 9. Validation Plan
| Quality Attribute | Validation Method | Evidence |
|---|---|---|
| Performance | 性能测试 / benchmark | evidence/perf/ |
| Security | 权限测试 / 安全检查 | evidence/security/ |
| Reliability | 故障注入 / 重试测试 | evidence/reliability/ |
| Maintainability | Review / complexity check | review_report.md |

## 10. Decision Input
- Related ADR draft:
- Recommended option:
- Rationale summary:
```

#### 2.12.8 ATAM 操作协议

AI 在 `impact_analysis.md` 阶段 MUST 输出：

```yaml
quality_attribute_analysis_required: true | false
quality_attribute_analysis_reason: <why>
affected_quality_attributes:
  - performance
  - security
  - reliability
  - maintainability
  - cost
  - user_experience
```

当 `quality_attribute_analysis_required = true` 时，AI MUST：

1. 读取 `quality_attributes.md`、`architecture_risks.md` 和相关专题设计文件；
2. 读取或生成 `options_analysis.md`；
3. 至少比较“保持现状 / 最小修改方案”“推荐方案”“更复杂或替代方案”；
4. 输出质量属性影响矩阵；
5. 识别 sensitivity points 和 trade-off points；
6. 将中高风险写入 `architecture_risks.md`；
7. 为每个重要质量属性定义验证方法；
8. 将验证任务写入 `tasks.md`；
9. 将验证证据写入 `verification_report.md` 或 `evidence/`；
10. 将最终取舍写入 `adr_draft.md`、candidate design 和 `merge_report.md`。

#### 2.12.9 ATAM 与 ADR 的关系

ATAM 负责分析质量属性和权衡；ADR 负责记录最终决策和后果。

正确链路 SHOULD 是：

```text
options_analysis.md
→ quality_attribute_analysis.md
→ adr_draft.md
→ ADR Gate
→ user approval
→ project/decisions/ADR-XXXX.md
```

如果 `adr_required = true` 且决策涉及质量属性取舍，则 `quality_attribute_analysis.md` MUST exist。

如果没有 ATAM，ADR 容易变成“我决定这样做”；如果没有 ADR，ATAM 容易变成“分析了很多但没有决策”。SpecForge MUST 同时保持二者闭环。


### 2.14 DDD 吸收规则：业务能力驱动的模块边界与数据所有权治理

SpecForge 从 DDD（Domain-Driven Design）吸收的不是一整套必须强制使用的战术 DDD 编程模式，而是“业务能力驱动的模块边界、领域概念、上下文关系、数据所有权和规则内聚治理机制”。

DDD 在 SpecForge 中 MUST 被定义为模块边界推理机制。它用于回答：模块为什么存在、需求为什么归属某个模块、核心数据由谁拥有、业务规则应该在哪里内聚、不同上下文之间如何集成。

DDD MUST NOT 被 AI 误用为：

- 按技术层拆模块；
- 按 UI 页面拆模块；
- 按数据库表机械拆模块；
- 简单项目强制引入 Entity、Value Object、Aggregate、Repository、Factory 等战术模式；
- 把 Bounded Context 默认等同于微服务。

#### 2.13.1 DDD 与其他最佳实践的分工

SpecForge MUST 按以下方式理解已经吸收的最佳实践：

```text
ISO 42010 = 视角来源：谁关心什么？
arc42 = 文档结构：架构知识怎么组织？
C4 = 抽象层级：当前应该看到哪一层？
ADR = 决策治理：为什么选择这个方案，放弃了什么，后果是什么？
ATAM = 质量权衡：方案对质量属性、风险和验证有什么影响？
DDD = 领域边界：模块、数据、规则和上下文边界凭什么划分？
```

冲突取舍规则：

1. 当不知道是否需要一个视角时，MUST 使用 ISO 42010 判断是否存在明确 stakeholder concern。
2. 当不知道文件怎么写时，MUST 使用 arc42 的结构化表达规则。
3. 当不知道写到多细时，MUST 使用 C4 判断当前是 C1/C2/C3/C4 哪一层。
4. 当存在多个可行方案或重要架构选择时，MUST 使用 ADR 记录选择依据、取舍、后果和替代策略。
5. 当方案影响性能、安全、可靠性、成本、可维护性、用户体验等质量属性时，MUST 使用 ATAM 做权衡分析。
6. 当不知道模块怎么拆、需求归属哪个模块、数据由谁拥有时，MUST 使用 DDD 做领域边界分析。

#### 2.13.2 DDD 的上游输入

AI 做领域边界分析前 MUST 读取或识别：

- Work Item `intake.md`；
- `business_value.md`；
- `user_journeys.md`；
- `requirements_index.md` 和相关模块 `requirements.md`；
- `glossary.md`；
- `architecture.md`；
- `spec_manifest.json`；
- 相关模块 `module.json`、`design.md`、`data_design.md`；
- `data_model.md`、`database_design.md`；
- `integration_design.md`、`api_contracts.md`、`event_flows.md`；
- 已有 `project/decisions/` ADR；
- 业务规则、数据归属、外部系统边界、维护责任。

AI MUST NOT 只根据代码目录、数据库表名、页面名称或技术层级来拆分模块。

#### 2.13.3 DDD 的下游消费者

DDD 分析结果 MUST 被以下规格和机制消费：

| 下游对象 | 消费内容 |
|---|---|
| `architecture.md` | 模块边界、业务能力、职责、不负责范围、上下文关系摘要 |
| `spec_manifest.json` | 模块注册、prefix、bounded_context、status |
| `project/modules/<module>/module.json` | responsibility、out_of_scope、owned_data、bounded_context、context_relationships |
| `domain_model.md` | 业务能力、核心概念、业务规则、实体/值对象/聚合、歧义术语 |
| `context_map.md` | 上下文关系、集成方式、防腐层、共享内核、模型转换规则 |
| `glossary.md` | 统一语言、同名不同义、不同名同义、上下文限定术语 |
| `data_model.md` / `database_design.md` | 数据 owner、共享模型、跨模块数据访问规则、事务边界 |
| `api_contracts.md` / `event_flows.md` | 上下文之间的 API、事件、模型转换、契约边界 |
| ADR | 重大模块拆分、合并、边界调整和数据所有权迁移的决策记录 |
| ATAM | 模块边界调整对质量属性、复杂度、成本和维护性的影响 |
| Gate / Trace | 检查边界一致性并建立 REQ/AC → Domain → Module → Design → Code → Test 链路 |

#### 2.13.4 `domain_model.md` 文件要求

`domain_model.md` MUST 记录项目的领域模型和业务边界依据。它不是数据库表设计文件，也不是代码类设计文件。

推荐结构：

```markdown
# Domain Model

## 1. Domain Overview
说明本系统服务的业务域、业务目标和核心业务对象。

## 2. Business Capabilities
| Capability ID | Name | Description | Related User Journey | Candidate Module |
|---|---|---|---|---|

## 3. Core Domain Concepts
| Concept | Meaning | Bounded Context | Notes |
|---|---|---|---|

## 4. Business Rules
| Rule ID | Rule | Context | Related REQ/AC |
|---|---|---|---|

## 5. Entities / Value Objects / Aggregates
> 小项目 MAY 不填写战术 DDD 细节；复杂领域 MAY 启用。

| Name | Type | Context | Owner Module | Notes |
|---|---|---|---|---|

## 6. Ambiguous Terms
| Term | Meaning A | Context A | Meaning B | Context B |
|---|---|---|---|---|

## 7. Open Questions
| Question | Owner | Status |
|---|---|---|
```

#### 2.13.5 `context_map.md` 文件要求

`context_map.md` MUST 记录模块/上下文之间的关系和集成规则。

推荐结构：

```markdown
# Context Map

## 1. Context Index
| Context | Module | Responsibility | Owned Data |
|---|---|---|---|

## 2. Context Relationships
| From Context | To Context | Relationship Type | Integration | Notes |
|---|---|---|---|---|

## 3. Anti-corruption Layers
| Context | External System / Context | Translation Required | Reason |
|---|---|---|---|

## 4. Shared Kernel
| Shared Model | Contexts | Owner | Change Rule |
|---|---|---|---|

## 5. Integration Rules
- 跨上下文调用规则；
- 模型转换规则；
- 数据暴露规则；
- 版本兼容规则；
- 禁止跨上下文直接写内部数据的规则。

## 6. Related Contracts
- api_contracts.md
- event_flows.md
- data_model.md
```

#### 2.13.6 Work Item 级 DDD 文件

当 Work Item 新增或改变业务能力、模块职责、核心数据归属、业务规则或上下文关系时，MUST 生成：

```text
work-items/<WI>/domain_analysis.md
work-items/<WI>/module_boundary_analysis.md
```

`domain_analysis.md` MUST 记录本次变更涉及的业务能力、领域概念、业务规则、歧义术语和数据归属。

`module_boundary_analysis.md` MUST 记录本次变更为什么归属某个模块，或者为什么需要拆分、合并、重命名或调整模块边界。

#### 2.13.7 模块拆分协议

AI 提议新建、拆分、合并、重命名或调整模块职责前，MUST 执行以下步骤：

1. **识别业务能力**：从用户旅程、需求和业务价值中提取业务能力。
2. **识别统一语言**：更新或引用 `glossary.md`，识别同名不同义、不同名同义、外部系统术语差异。
3. **识别规则内聚**：判断哪些业务规则应该放在同一上下文内。
4. **识别数据所有权**：每个核心数据必须明确谁创建、谁修改、谁校验、谁负责生命周期、谁可以读取、谁不能直接写。
5. **识别上下文关系**：明确同步 API、异步事件、共享模型、防腐层、共享内核和模型转换。
6. **输出模块拆分矩阵**：用标准矩阵说明拆分依据是否充分。
7. **触发 ADR/ATAM**：如果模块边界变化具有架构影响，MUST 生成 ADR；如果存在质量属性取舍，MUST 生成 `quality_attribute_analysis.md`。
8. **生成迁移映射**：如果移动需求、设计、数据、接口或 Trace，MUST 生成 migration map。

模块拆分矩阵 MUST 至少包含：

| 维度 | 问题 | 结果 |
|---|---|---|
| 业务能力 | 是否是独立业务能力 | Yes/No + reason |
| 术语边界 | 是否有独立术语模型 | Yes/No + reason |
| 规则内聚 | 规则是否围绕同一职责 | Yes/No + reason |
| 数据归属 | 是否有清晰数据 owner | Yes/No + reason |
| 变化频率 | 是否独立变化 | Yes/No + reason |
| 接口边界 | 是否能定义稳定契约 | Yes/No + reason |
| 维护责任 | 是否有明确 owner / maintainer | Yes/No + reason |
| 部署边界 | 是否需要独立部署 | Yes/No + reason |
| 复杂度收益 | 拆分收益是否大于治理成本 | Yes/No + reason |

#### 2.13.8 DDD 反面约束

AI MUST NOT 使用以下对象作为 Project Module 的主要边界依据：

- 技术层：`controller`、`service`、`repository`、`dto`、`utils`；
- 页面：`login-page`、`user-table`、`report-form`；
- 数据库表：`user-table-module`、`order-table-module`、`dictionary-table-module`；
- 代码目录：现有代码目录只能作为参考证据，不能作为唯一依据；
- 未来猜测：不能因为“以后可能会大”就提前拆模块。

SpecForge Module MAY 表示一个 Bounded Context，也 MAY 表示 Bounded Context 的一部分；但 Module MUST NOT 默认等同于微服务。Bounded Context MAY map to a microservice only when independent deployment, data ownership, operations, scaling, team ownership, and observability conditions are satisfied.

#### 2.13.9 DDD 示例：登录能力

用户提出“新增登录功能”时，AI MUST NOT 直接新建 `login` 模块。

正确分析：

| 项 | 判断 |
|---|---|
| 业务能力 | Authentication：身份认证 |
| 相关概念 | Account、Credential、Session、Token、Login Audit |
| 相关但不同能力 | User Profile、Authorization、Audit |
| 数据 owner | credential/session 属于 auth；user_profile 属于 user；role_permission 属于 authorization |
| UI 页面 | 登录页属于 UI/UX 视角，不是模块边界 |
| API | 登录接口属于 auth 对外契约 |
| 模块判断 | 是否拆 auth，取决于认证规则复杂度、数据归属、安全要求、变化频率和维护成本 |

如果当前项目只有 `core`，但登录规则简单、无独立部署需求、无复杂权限模型，AI SHOULD 先保持 `core` 或仅在 core 内建立清晰的 auth component。只有当认证规则、数据归属、安全要求和后续演进价值充分时，才 SHOULD 提议拆出 `auth` 模块。

### 2.14 行业实践吸收记录规则

为避免标准不断增大后无法判断规则来源，SpecForge MUST 为每个被吸收的行业最佳实践保留一份独立落地说明文件。该文件 SHOULD 存放在：

```text
.specforge/project/standards/
  01-iso-42010-absorption.md
  02-arc42-absorption.md
  03-c4-model-absorption.md
  04-adr-absorption.md
  05-atam-absorption.md
```

每份吸收说明 MUST 包含：

1. 该最佳实践的核心理念；
2. SpecForge 吸收什么；
3. SpecForge 不吸收什么；
4. 新增或调整哪些目录和文件；
5. 每个文件应该怎么写；
6. 需要新增哪些 Gate / Fitness Function；
7. 与已有标准可能冲突的点；
8. 冲突时的取舍原则；
9. 需要落到代码和 Agent 的实现项。



### 2.17 Twelve-Factor App 吸收规则：应用运行与交付纪律

SpecForge 从 Twelve-Factor App 吸收的不是“默认 SaaS”“默认上云”或“默认 Kubernetes”，而是“应用必须具备可构建、可配置、可发布、可运行、可观测、可迁移的工程交付纪律”。

Twelve-Factor App 在 SpecForge 中的定位是运行交付治理规则。它不决定业务模块如何拆分，不替代 DDD、ADR、ATAM 或云架构模式；它约束 AI 在设计应用时，必须同时考虑依赖、配置、环境、构建、发布、运行、日志、健康检查、数据库迁移、一次性管理任务和回滚策略。

#### 2.16.1 Twelve-Factor App 与其他最佳实践的分工

SpecForge MUST 按以下方式理解 Twelve-Factor App 与前序规则的关系：

```text
ISO 42010 = 识别开发、运维、安全、现场部署人员的关切。
arc42 = 把运行交付内容组织到部署、运行时、横切概念和风险章节。
C4 = 区分代码组件、运行单元、部署单元和外部资源。
ADR = 记录重大运行交付决策，例如配置管理、发布策略、运行平台。
ATAM = 分析运行交付方案对可靠性、成本、交付速度、可维护性的影响。
DDD = 决定模块边界，但不决定运行交付纪律。
Microservices = 服务化后必须强化运行交付纪律。
Cloud Architecture Patterns = 处理跨边界失败治理。
Twelve-Factor App = 约束应用如何被构建、配置、发布、运行和观测。
```

冲突取舍规则：

1. 当项目不是 SaaS、云平台或容器化部署时，仍 SHOULD 采用配置外部化、显式依赖、构建/发布/运行分离、日志可采集、环境差异显式化等基本原则。
2. 当工业现场、内网部署、Windows 服务、离线服务器或遗留系统无法完全满足 Twelve-Factor 时，MUST 在 `deployment_design.md` 或 `runtime_delivery_analysis.md` 中记录偏离原因、风险和补偿措施。
3. 当本地状态不可避免时，MUST 记录状态位置、恢复策略、备份策略、多实例限制和故障处理。
4. 当日志不能作为 stdout/stderr 事件流输出时，MUST 定义本地日志路径、轮转、采集、保留、权限和故障处理。

#### 2.16.2 触发条件

以下情况 MUST 触发 Runtime Delivery Analysis，并生成 `work-items/<WI>/runtime_delivery_analysis.md`：

1. 新增、修改或删除配置项；
2. 新增、修改或删除运行时依赖、构建依赖、系统依赖、测试依赖或外部工具；
3. 新增或修改部署单元、运行进程、worker、scheduler、batch job；
4. 新增或修改 backing service，例如数据库、缓存、消息队列、对象存储、外部 API、工业系统、模型服务；
5. 新增或修改日志、指标、健康检查、就绪检查、优雅关闭；
6. 新增或修改数据库迁移、初始化脚本、数据修复、补偿任务、一次性管理任务；
7. 新增或修改 CI/CD、构建产物、发布策略、回滚策略；
8. 新增或修改 dev/test/staging/prod 等环境差异；
9. 新增服务、服务化改造或部署架构调整；
10. AI 发现当前设计依赖“目标机器已安装某软件/驱动/浏览器/数据库客户端”等隐式前提。

以下情况 MAY NOT 生成独立 `runtime_delivery_analysis.md`，但仍不得违反配置和依赖规则：

1. 纯文档修订；
2. 不影响配置、依赖、部署、日志、健康检查、迁移和发布的局部代码重构；
3. 不改变运行方式的普通业务逻辑修复。

#### 2.16.3 项目级运行交付文件

SpecForge MUST 在项目级规格中支持以下文件：

```text
project/configuration_design.md
project/dependency_manifest.md
project/environment_matrix.md
project/release_strategy.md
```

这些文件与已有部署、CI/CD、观测和安全文件的关系如下：

| 文件 | 职责 | 不负责什么 |
|---|---|---|
| `configuration_design.md` | 配置项、环境差异、敏感配置、校验、配置来源、轮换规则 | 不保存真实密钥值 |
| `dependency_manifest.md` | 运行、构建、测试、系统、外部工具依赖及版本和检查方式 | 不替代包管理器 lock file |
| `environment_matrix.md` | dev/test/staging/prod 等环境的资源、配置、依赖、数据和访问差异 | 不替代部署脚本 |
| `release_strategy.md` | build/release/run 分离、发布版本、回滚、迁移、一次性管理任务 | 不替代 CI/CD 实现脚本 |
| `deployment_design.md` | 部署拓扑、运行单元、端口、健康检查、资源位置 | 不承载完整配置目录 |
| `ci_cd_design.md` | CI/CD 阶段、流水线、质量门禁 | 不承载全部发布治理规则 |
| `observability_design.md` | 日志、指标、Trace、告警、Dashboard | 不承载依赖清单 |
| `security_design.md` | 密钥访问边界、权限、审计、敏感配置处理 | 不保存密钥明文 |

#### 2.16.4 `configuration_design.md` 文件职责

`configuration_design.md` MUST 定义项目配置项、环境差异、密钥管理、配置校验和配置变更规则。

标准模板：

```markdown
# Configuration Design

## 1. Purpose

本文件定义项目配置项、环境差异、密钥管理、配置校验和配置变更规则。

## 2. Configuration Principles

- 配置 MUST 与代码分离。
- 环境差异 MUST 显式记录。
- 敏感配置 MUST NOT 写入代码库或普通规格文件。
- 配置变更 SHOULD 可审计、可回滚。

## 3. Configuration Catalog

| Config Key | Description | Required | Sensitive | Default | Source | Environments | Owner |
|---|---|---:|---:|---|---|---|---|

## 4. Secret Management

| Secret | Storage | Rotation | Access Scope | Audit |
|---|---|---|---|---|

## 5. Validation Rules

| Config Key | Validation | Failure Behavior |
|---|---|---|

## 6. Change Rules

- 配置新增 MUST 走 Work Item。
- 敏感配置变更 MUST 进入 security review。
- 影响部署的配置变更 MUST 更新 release_strategy.md。
```

AI MUST NOT hardcode environment-specific configuration in code, tests, scripts, deployment specs or generated examples unless the value is explicitly non-sensitive and environment-neutral.

#### 2.16.5 `dependency_manifest.md` 文件职责

`dependency_manifest.md` MUST 记录项目运行、构建、测试、部署所需的显式依赖。

标准模板：

```markdown
# Dependency Manifest

## 1. Purpose

本文件记录项目运行、构建、测试、部署所需的显式依赖。

## 2. Runtime Dependencies

| Dependency | Type | Version | Required By | Install / Provision Method | Check Command |
|---|---|---|---|---|---|

## 3. Build Dependencies

| Dependency | Version | Required By | Lock File | Notes |
|---|---|---|---|---|

## 4. System Dependencies

| Dependency | OS / Platform | Version | Reason | Check Command |
|---|---|---|---|---|

## 5. External Tools

| Tool | Version | Purpose | Install Method | Used By |
|---|---|---|---|---|

## 6. Dependency Rules

- 运行时依赖 MUST 显式声明。
- AI MUST NOT 假设服务器已有隐式依赖。
- 依赖升级 MUST 记录影响范围和验证证据。
```

如果功能依赖 Playwright 浏览器、数据库客户端、系统字体、OCR 引擎、GPU/CUDA、工业协议驱动、浏览器二进制、CLI 工具或第三方 SDK，AI MUST 在 `dependency_manifest.md` 中声明，而不能在失败后临时复制缺失文件。

#### 2.16.6 `environment_matrix.md` 文件职责

`environment_matrix.md` MUST 定义各运行环境的配置、资源、依赖、数据和访问差异。

标准模板：

```markdown
# Environment Matrix

## 1. Purpose

本文件定义各运行环境的配置、资源、依赖、数据和访问差异。

## 2. Environment List

| Environment | Purpose | Data Policy | Access | Deployment Method |
|---|---|---|---|---|

## 3. Environment Differences

| Item | dev | test | staging | prod |
|---|---|---|---|---|
| Database | | | | |
| Cache | | | | |
| Message Queue | | | | |
| Log Level | | | | |
| External Services | | | | |

## 4. Parity Risks

| Risk | Impact | Mitigation |
|---|---|---|
```

环境差异 MUST be explicit, not implicit。AI MUST NOT assume that dev/test/prod differ only by URL unless this is documented.

#### 2.16.7 `release_strategy.md` 文件职责

`release_strategy.md` MUST 定义构建、发布、运行、回滚、迁移和发布记录规则。

标准模板：

```markdown
# Release Strategy

## 1. Purpose

本文件定义构建、发布、运行、回滚、迁移和发布记录规则。

## 2. Build / Release / Run Separation

| Stage | Input | Output | Owner | Tooling |
|---|---|---|---|---|
| Build | source + dependencies | artifact | CI | |
| Release | artifact + config | release version | CI/CD | |
| Run | release version | running process | runtime platform | |

## 3. Release Versioning

| Release ID | Artifact | Config Version | Migration Version | Status |
|---|---|---|---|---|

## 4. Rollback Strategy

- 代码回滚：
- 配置回滚：
- 数据库迁移回滚：
- 外部依赖回滚：

## 5. Database Migration Execution

- migration owner:
- execution timing:
- rollback:
- verification:

## 6. One-off Admin Processes

| Task | Code Location | Release Context | Run Command | Audit |
|---|---|---|---|---|
```

AI MUST separate build, release and run concerns. AI MUST NOT design deployment as “login to server, pull code, modify config manually, install dependencies manually, and start process manually” unless the project explicitly accepts this as a temporary manual deployment path and records risk, operator steps and rollback strategy.

#### 2.16.8 `runtime_delivery_analysis.md` 文件职责

当 Work Item 涉及运行交付变化时，MUST 生成：

```text
work-items/<WI>/runtime_delivery_analysis.md
```

标准模板：

```markdown
# Runtime Delivery Analysis

## 1. Work Item

- WI:
- Title:
- Affected Modules:
- Affected Deployment Units:

## 2. Runtime / Delivery Impact

| Area | Impacted? | Reason | Target File |
|---|---:|---|---|
| Config | Yes/No | | configuration_design.md |
| Dependencies | Yes/No | | dependency_manifest.md |
| Environment | Yes/No | | environment_matrix.md |
| Build | Yes/No | | ci_cd_design.md |
| Release | Yes/No | | release_strategy.md |
| Run | Yes/No | | deployment_design.md |
| Logs | Yes/No | | observability_design.md |
| Admin Processes | Yes/No | | release_strategy.md |

## 3. Config Changes

| Config Key | Added/Modified/Removed | Sensitive | Environments | Validation |
|---|---|---:|---|---|

## 4. Dependency Changes

| Dependency | Added/Modified/Removed | Version | Reason | Verification |
|---|---|---|---|---|

## 5. Build / Release / Run Impact

- Build impact:
- Release impact:
- Run impact:
- Rollback impact:

## 6. Environment Parity Impact

| Environment | Impact | Risk | Mitigation |
|---|---|---|---|

## 7. Log / Observability Impact

- log fields:
- metrics:
- trace:
- dashboard:
- alert:

## 8. Validation Plan

| Check | Evidence |
|---|---|
| Config validation | |
| Dependency check | |
| Build reproducibility | |
| Release rollback | |
| Startup/shutdown | |
```

#### 2.16.9 Twelve-Factor 核心规则在 SpecForge 中的落地

SpecForge MUST 将 Twelve-Factor 的核心经验转化为以下规则：

1. **Codebase / Artifact Traceability**：每个部署单元 MUST 能追溯到代码来源、版本、构建产物和 release version。
2. **Explicit Dependencies**：所有运行、构建、测试、系统和外部工具依赖 MUST 显式声明。
3. **Externalized Config**：随环境变化的配置 MUST 外部化；敏感配置 MUST NOT 写入代码库或普通规格文件。
4. **Backing Services**：数据库、缓存、消息队列、对象存储、第三方 API、工业系统、外部 SQL Server、模型服务等 MUST 作为外部资源登记。
5. **Build / Release / Run Separation**：构建、发布、运行 MUST 分离；release MUST 绑定 artifact、config 和 migration version。
6. **Stateless Process by Default**：运行进程 SHOULD 无状态；如必须有状态，MUST 记录状态位置、恢复策略、备份策略和扩展限制。
7. **Port Binding / Health Checks**：每个运行单元 SHOULD 明确端口、协议、健康检查、就绪检查和访问边界。
8. **Concurrency Model**：并发扩展策略 MUST 明确是水平扩展、worker 并发、队列消费并发，还是数据库/缓存扩展。
9. **Disposability**：长期运行进程 MUST 定义启动、就绪、存活、优雅关闭和恢复行为。
10. **Dev / Prod Parity**：环境差异 MUST 显式记录，不能靠口头约定或隐式假设。
11. **Logs as Event Streams**：应用 SHOULD 输出结构化日志事件流；如写本地日志文件，MUST 说明路径、轮转、采集、保留、权限和故障处理。
12. **Admin Processes**：数据库迁移、初始化、补偿、数据修复、一次性导入导出任务 MUST 版本化、可重复执行、可审计，并在同一 release context 中运行。

#### 2.16.10 Runtime Delivery Gate

SpecForge MUST 增加 `Runtime Delivery Gate`。

该 Gate MUST 检查：

1. 是否应该触发 `runtime_delivery_analysis.md`；
2. 新增或修改配置是否写入 `configuration_design.md`；
3. 敏感配置是否没有写入代码库、普通规格文件或日志；
4. 环境差异是否写入 `environment_matrix.md`；
5. 新增或修改依赖是否写入 `dependency_manifest.md`；
6. 是否存在隐式系统依赖；
7. 是否区分 build / release / run；
8. 是否定义构建产物、release version、配置版本和 migration version；
9. 是否定义代码、配置、数据库迁移和外部依赖的回滚策略；
10. backing services 是否登记并关联配置、失败处理和环境映射；
11. 长期运行进程是否有启动、就绪、健康检查、优雅关闭；
12. 是否错误依赖本地内存或本地文件保存关键状态；
13. 日志是否符合 `observability_design.md`；
14. 一次性管理任务是否可版本化、可审计、可重复执行；
15. 是否与 `deployment_design.md`、`ci_cd_design.md`、`security_design.md`、`observability_design.md` 一致；
16. 是否有验证证据。

#### 2.16.11 AI 操作协议补充

AI 在 `impact_analysis.md` 中 MUST 增加：

```text
runtime_delivery_analysis_required: Yes/No + reason
affected_runtime_delivery_areas: [config, dependencies, environment, build, release, run, logs, admin_processes]
implicit_dependency_risks:
stateful_runtime_risks:
```

如果 `runtime_delivery_analysis_required = Yes`，AI MUST：

1. 读取 `configuration_design.md`、`dependency_manifest.md`、`environment_matrix.md`、`deployment_design.md`、`ci_cd_design.md`、`release_strategy.md`、`observability_design.md`、`security_design.md`；
2. 生成 `runtime_delivery_analysis.md`；
3. 明确配置、依赖、环境、构建、发布、运行、日志、健康检查、一次性任务的影响；
4. 更新对应项目级规格；
5. 将验证任务写入 `tasks.md`、`verification_report.md` 和 `evidence/`；
6. 通过 Runtime Delivery Gate 后才允许 Merge。

#### 2.16.12 本轮吸收结论

| 项 | 结论 |
|---|---|
| 来源最佳实践 | Twelve-Factor App |
| SpecForge 吸收内容 | 应用运行与交付纪律 |
| 不吸收内容 | 不默认 SaaS、不默认云原生、不默认容器化 |
| 加入的项目级文件 | `configuration_design.md`、`dependency_manifest.md`、`environment_matrix.md`、`release_strategy.md` |
| 加入的 Work Item 文件 | `runtime_delivery_analysis.md` |
| 加入的 Gate | Runtime Delivery Gate |
| 主要约束 | 显式依赖、配置外部化、构建发布运行分离、环境差异显式化、日志可采集、管理任务可审计 |
```

规范性结论：

```text
SpecForge MUST treat runtime delivery discipline as part of architecture design, not as an afterthought during deployment.
AI MUST NOT assume implicit dependencies, hardcode environment-specific configuration, mix build/release/run concerns, hide environment differences, or omit startup/shutdown/logging/admin-process behavior when the Work Item affects runtime delivery.
```

### 2.18 SRE 吸收规则：可靠性目标、错误预算与运行证据

SpecForge 从 SRE 吸收的不是完整的运维组织模型，也不是强制引入某个监控平台，而是“可靠性必须被目标化、度量化、告警化、证据化和复盘化”的治理机制。

SRE 在 SpecForge 中的定位是运行可靠性治理规则。它把系统上线后的稳定运行要求前移到需求、设计、任务、验证、证据、事故复盘和后续 Work Item 中，防止 AI 用“高可靠”“可观测”“自动恢复”等形容词替代可验证规格。

#### 2.17.1 SRE 与其他最佳实践的分工

SpecForge MUST 按以下方式理解 SRE 与前序规则的关系：

```text
ISO 42010 = 识别用户、运维、业务负责人、安全和开发团队对可靠性的关切。
arc42 = 把可靠性写入质量属性、运行时、部署、风险和横切概念章节。
C4 = 判断可靠性目标落在哪个层级：系统、容器、组件或代码。
ADR = 记录重大可靠性决策，例如多副本、熔断、异步队列、容灾策略。
ATAM = 分析可靠性与成本、性能、复杂度、交付速度之间的权衡。
DDD = 判断哪些业务能力和用户旅程属于可靠性关键链路。
Microservices = 服务化后必须定义服务级 SLO、Owner、Runbook 和事故响应。
Cloud Architecture Patterns = 提供超时、重试、熔断、补偿、对账等失败治理机制。
Twelve-Factor App = 保证应用可构建、可配置、可发布、可运行和可观测。
SRE = 定义可靠性目标、SLI/SLO、错误预算、告警、事故响应、运行就绪和证据。
Evolutionary Architecture = 定义架构如何被目标引导、增量执行、持续验证、可追溯、可回退和可治理。
```

冲突取舍规则：

1. 当系统还没有上线运行条件时，仍 SHOULD 提前定义关键用户旅程的 SLO 候选、观测字段和运行证据要求。
2. 当项目规模较小时，不强制完整 on-call 组织，但 MUST 定义故障发现方式、响应责任、恢复流程和复盘要求。
3. 当没有监控平台时，MUST 至少定义日志、健康检查、人工巡检或轻量指标作为过渡证据。
4. 当 SLO 与功能交付冲突时，错误预算策略和用户确认结果 MUST 进入 `release_strategy.md` 或 ADR。
5. 当 AI 声称“高可靠”“可用性提升”“自动恢复”时，MUST 同时给出可度量目标和验证证据，否则 Gate MUST fail。

#### 2.17.2 触发条件

以下情况 MUST 触发 SRE Impact Analysis，并生成 `work-items/<WI>/sre_impact_analysis.md`：

1. 新增或修改关键用户旅程；
2. 新增或修改服务、部署单元、后台任务、worker、scheduler、batch job；
3. 新增或修改跨边界调用、异步事件、外部系统依赖、数据同步或采集任务；
4. 新增或修改可靠性、可用性、性能、容量、恢复时间或恢复点目标；
5. 新增或修改日志、指标、Trace、告警、Dashboard、健康检查、就绪检查；
6. 新增或修改发布、回滚、迁移、备份恢复策略；
7. 新增或修改会影响错误预算的功能；
8. 引入或改变熔断、限流、降级、补偿、对账、容灾、备份恢复等可靠性机制；
9. 任何声称“高可靠”“稳定性提升”“自动恢复”“故障自愈”的设计。

以下情况 MAY NOT 生成独立 `sre_impact_analysis.md`，但仍不得写无证据的可靠性声明：

1. 纯文档修订；
2. 不影响运行、观测、告警、发布和关键链路的局部代码重构；
3. 不改变用户可感知可靠性的普通 UI 文案或样式调整。

#### 2.17.3 项目级 SRE 文件

SpecForge MUST 在项目级规格中支持以下文件：

```text
project/slo_catalog.md
project/incident_response.md
project/operational_readiness.md
```

这些文件与已有可靠性、观测、发布和服务目录文件的关系如下：

| 文件 | 职责 | 不负责什么 |
|---|---|---|
| `slo_catalog.md` | SLI、SLO、错误预算、告警映射、Owner、统计窗口 | 不替代监控平台配置 |
| `incident_response.md` | 事故等级、响应角色、升级路径、恢复流程、复盘模板 | 不替代具体值班系统 |
| `operational_readiness.md` | 上线前运行就绪检查、阻塞项、证据、接受风险 | 不替代测试报告 |
| `reliability_design.md` | 可靠性策略、降级、恢复、RTO/RPO、容量保护 | 不承载全部 SLO 索引 |
| `observability_design.md` | 日志、指标、Trace、Dashboard、告警实现 | 不决定业务 SLO 优先级 |
| `service_catalog.md` | 服务/运行单元的 Owner、SLO、Runbook、Dashboard 入口 | 不承载全部事故流程 |
| `release_strategy.md` | 错误预算对发布、冻结、回滚和审批的影响 | 不替代 SLO 定义 |
| `architecture_risks.md` | 可靠性中高风险、缓解措施和状态 | 不替代事故复盘 |

#### 2.17.4 `slo_catalog.md` 文件职责

`slo_catalog.md` MUST 定义项目级服务可靠性目标、SLI、SLO、错误预算、告警和责任人。

```markdown
# SLO Catalog

## 1. Purpose

本文件定义项目级服务可靠性目标、SLI、SLO、错误预算、告警和责任人。

## 2. SLO Principles

- SLO MUST be based on user-visible reliability whenever possible.
- SLO MUST be measurable by SLI.
- SLO MUST have an owner.
- SLO MUST define an error budget.
- SLO SHOULD influence release and reliability work prioritization.

## 3. SLO Index

| SLO ID | User Journey / Service | SLI | SLO Target | Window | Error Budget | Owner | Alert |
|---|---|---|---|---|---|---|---|
| SLO-AUTH-001 | 用户登录 | successful_login_requests / total_valid_login_requests | 99.9% | 28d | 0.1% | auth owner | ALERT-AUTH-001 |

## 4. SLI Definitions

| SLI ID | Definition | Good Event | Bad Event | Data Source | Query / Measurement |
|---|---|---|---|---|---|

## 5. Error Budget Policy

| SLO ID | Budget Burn Rule | Action |
|---|---|---|
| SLO-AUTH-001 | >50% budget consumed in 7d | Review release risk |
| SLO-AUTH-001 | 100% budget consumed | Freeze risky changes, prioritize reliability fixes |

## 6. Alert Mapping

| Alert ID | SLO ID | Condition | Severity | Receiver | Runbook |
|---|---|---|---|---|---|

## 7. Related Files

- reliability_design.md
- observability_design.md
- service_catalog.md
- release_strategy.md
- incident_response.md
```

#### 2.17.5 `incident_response.md` 文件职责

`incident_response.md` MUST 定义事故分级、响应角色、升级路径、恢复流程、沟通规则和复盘要求。

```markdown
# Incident Response

## 1. Purpose

本文件定义事故分级、响应角色、升级路径、恢复流程和复盘要求。

## 2. Severity Levels

| Severity | Definition | User Impact | Response Time | Communication |
|---|---|---|---|---|
| SEV-1 | 核心业务不可用 | 大范围用户受影响 | Immediate | 项目负责人 / 用户代表 |
| SEV-2 | 核心功能部分异常 | 部分用户受影响 | < 30 min | 研发 / 运维 |
| SEV-3 | 非核心功能异常 | 小范围影响 | Next business day | 团队内部 |

## 3. Incident Roles

| Role | Responsibility |
|---|---|
| Incident Commander | 统一指挥、决策和沟通 |
| Technical Lead | 定位和恢复技术问题 |
| Communications Lead | 对用户和管理方同步状态 |
| Scribe | 记录时间线和操作 |

## 4. Incident Workflow

1. Detect
2. Triage
3. Declare severity
4. Mitigate
5. Recover
6. Communicate
7. Postmortem
8. Track follow-up Work Items

## 5. Runbook Index

| Runbook | Scenario | Owner | Link |
|---|---|---|---|

## 6. Postmortem Template

### Summary
### Impact
### Timeline
### Root Causes
### Trigger
### Detection
### Resolution
### What Went Well
### What Went Wrong
### Action Items

| Action | Owner | WI | Due |
|---|---|---|---|
```

事故复盘产生的 Action Items SHOULD 转化为新的 Work Item，而不是停留在会议纪要中。

#### 2.17.6 `operational_readiness.md` 文件职责

`operational_readiness.md` MUST 定义上线前运行就绪检查标准。

```markdown
# Operational Readiness

## 1. Purpose

本文件定义上线前运行就绪检查标准。

## 2. Readiness Checklist

| Area | Requirement | Status | Evidence |
|---|---|---|---|
| SLO | 已定义关键 SLO | Pending/Done | slo_catalog.md |
| Monitoring | 已定义 dashboard | Pending/Done | observability_design.md |
| Alerting | 已定义告警规则 | Pending/Done | alert evidence |
| Logging | 日志字段可定位问题 | Pending/Done | log sample |
| Tracing | 跨服务调用有 trace_id | Pending/Done | trace sample |
| Runbook | 关键告警有处理手册 | Pending/Done | incident_response.md |
| Backup | 备份策略已验证 | Pending/Done | evidence/backup |
| Restore | 恢复流程已演练 | Pending/Done | evidence/restore |
| Rollback | 发布回滚已验证 | Pending/Done | release_strategy.md |
| Capacity | 容量和限流已评估 | Pending/Done | capacity evidence |
| Security | 安全告警和审计已就绪 | Pending/Done | security_design.md |

## 3. Release Readiness Decision

- Ready / Not Ready:
- Blocking Issues:
- Accepted Risks:
- Required Follow-up WIs:
```

关键服务、关键用户旅程、服务化改造、外部依赖和高风险发布 MUST 通过 Operational Readiness 检查后才允许进入正式发布。

#### 2.17.7 `sre_impact_analysis.md` 文件职责

当 Work Item 影响可靠性、运行监控、告警、部署、关键链路或发布风险时，MUST 生成 `work-items/<WI>/sre_impact_analysis.md`。

```markdown
# SRE Impact Analysis

## 1. Work Item

- WI:
- Title:
- Affected Modules:
- Affected Services:
- Affected User Journeys:

## 2. Reliability Impact

| Area | Impacted? | Reason | Target File |
|---|---:|---|---|
| SLO / SLI | Yes/No | | slo_catalog.md |
| Error Budget | Yes/No | | release_strategy.md |
| Monitoring | Yes/No | | observability_design.md |
| Alerting | Yes/No | | slo_catalog.md |
| Runbook | Yes/No | | incident_response.md |
| Incident Response | Yes/No | | incident_response.md |
| Operational Readiness | Yes/No | | operational_readiness.md |

## 3. User-visible Reliability

| User Journey | Failure Impact | SLI Candidate | SLO Candidate |
|---|---|---|---|

## 4. Alerting Impact

| Alert | Symptom | Severity | Receiver | Runbook |
|---|---|---|---|---|

## 5. Error Budget Impact

- Existing SLO:
- Expected impact:
- Risk:
- Release decision impact:

## 6. Verification / Evidence Plan

| Reliability Requirement | Evidence |
|---|---|
| SLO measurable | dashboard/query |
| Alert fires correctly | alert test screenshot |
| Recovery works | recovery drill evidence |
| Rollback works | rollback evidence |
```

#### 2.17.8 SRE 核心规则在 SpecForge 中的落地

SpecForge MUST 至少吸收以下 SRE 规则：

1. **SLI / SLO**：关键用户旅程和关键服务 MUST 定义可度量可靠性目标。
2. **Error Budget**：SLO MUST 定义错误预算，并 SHOULD 影响发布策略。
3. **Symptom-based Alerting**：告警 SHOULD 优先面向用户可感知症状，而不是只盯内部原因。
4. **Actionable Alert**：每个 paging alert MUST 有 severity、receiver、runbook 和可验证触发条件。
5. **Operational Readiness**：关键发布 MUST 检查监控、告警、日志、Trace、Runbook、回滚、备份恢复和容量。
6. **Incident Response**：事故 MUST 有分级、角色、恢复流程、沟通规则和复盘模板。
7. **Postmortem to Work Item**：复盘 Action Items SHOULD 进入 `work-items/`，不能只停留在口头承诺。
8. **Evidence-first Reliability**：没有 evidence 的可靠性声明 MUST NOT 通过 Gate。

#### 2.17.9 SRE / Operational Readiness Gate

SpecForge MUST 增加 `SRE / Operational Readiness Gate`。

该 Gate MUST 检查：

1. 是否应该触发 `sre_impact_analysis.md`；
2. 关键用户旅程是否定义 SLI / SLO；
3. SLO 是否有明确测量来源、统计窗口和 Good/Bad Event；
4. 是否定义 Error Budget 和错误预算消耗策略；
5. 告警是否优先面向用户可感知症状；
6. 告警是否有 severity、receiver、runbook 和可验证触发条件；
7. `observability_design.md` 是否包含 logs / metrics / traces / dashboards；
8. `release_strategy.md` 是否说明错误预算对发布、冻结、回滚和审批的影响；
9. `incident_response.md` 是否定义事故等级、响应角色、升级路径和复盘模板；
10. `operational_readiness.md` 是否有上线前检查、阻塞项、接受风险和 evidence；
11. 可靠性风险是否进入 `architecture_risks.md`；
12. SRE 分析是否与 ATAM、ADR、Resilience Pattern、Runtime Delivery 结果一致；
13. 验证计划是否进入 `tasks.md`、`verification_report.md` 和 `evidence/`；
14. 是否存在无证据的“高可靠”“稳定性提升”“自动恢复”等声明。

Gate MUST fail when reliability claims lack measurable targets, owners, alerting rules, runbooks, or evidence.

#### 2.17.10 AI 操作协议补充

AI 在 `impact_analysis.md` 中 MUST 增加：

```text
sre_impact_analysis_required: true/false
reason:
affected_slos:
affected_user_journeys:
affected_operational_areas:
```

当 `sre_impact_analysis_required = true` 时，AI MUST：

1. 读取 `slo_catalog.md`、`reliability_design.md`、`observability_design.md`、`incident_response.md`、`operational_readiness.md`、`release_strategy.md`、`architecture_risks.md`；
2. 生成 `sre_impact_analysis.md`；
3. 明确用户可感知可靠性、SLI、SLO、错误预算、告警、Runbook、Owner 和 evidence；
4. 更新对应项目级规格；
5. 将可靠性验证任务写入 `tasks.md`、`verification_report.md` 和 `evidence/`；
6. 通过 SRE / Operational Readiness Gate 后才允许 Merge 或 Release。

AI MUST NOT 用“高可靠”“稳定性好”“可自动恢复”等描述替代 SLO、告警、Runbook 和证据。

#### 2.17.11 示例：登录功能的 SRE 规格

错误写法：

```text
登录接口要稳定可靠。
```

正确写法：

```text
SLO-AUTH-001：用户登录成功率
SLI：successful_login_requests / total_valid_login_requests
SLO：99.9% over 28 days
Bad Event：系统错误、超时、认证服务不可用导致的登录失败
不计入 Bad Event：用户输错密码、账号被锁定等业务拒绝
Error Budget：0.1%
Alert：5 分钟窗口内系统错误率超过阈值，SEV-2
Dashboard：登录成功率、P95 延迟、错误码分布、依赖数据库错误
Runbook：检查 auth 服务、数据库连接、缓存、最近发布、回滚步骤
Evidence：告警测试截图、dashboard 查询、超时测试、回滚演练记录
```

该示例说明：SRE 不是“给接口加监控”，而是定义用户可感知的可靠性目标、错误预算、告警、处理路径和验证证据。

#### 2.17.12 本轮吸收结论

| 项 | 结论 |
|---|---|
| 来源最佳实践 | SRE |
| SpecForge 吸收内容 | 可靠性目标、错误预算、告警、事故响应、运行就绪和证据治理 |
| 不吸收内容 | 不强制完整 on-call 组织，不绑定具体监控平台 |
| 加入的项目级文件 | `slo_catalog.md`、`incident_response.md`、`operational_readiness.md` |
| 加入的 Work Item 文件 | `sre_impact_analysis.md` |
| 加入的 Gate | SRE / Operational Readiness Gate |
| 主要约束 | 可靠性必须有 SLI/SLO、错误预算、告警、Runbook、Owner、验证证据 |

规范性结论：

```text
SpecForge MUST treat reliability as measurable, alertable, verifiable, and reviewable project specification.
AI MUST NOT claim high reliability without defining SLI, SLO, measurement source, error budget, alert rule, owner, runbook, and verification evidence.
SRE / Operational Readiness Gate MUST reject reliability claims without measurable targets and evidence.
```


### 2.19 Evolutionary Architecture 吸收规则：受控增量演进与适应度函数

SpecForge 从 Evolutionary Architecture 吸收的不是“允许架构随意变化”，而是“架构变化必须被目标引导、增量执行、持续验证、可追溯、可回退和可治理”的机制。

Evolutionary Architecture 在 SpecForge 中的定位是长期架构演进治理规则。它把 Project Spec、Module Spec、Work Item、ADR、ATAM、Gate、Trace、Evidence 组织成一个持续演进系统，防止 AI 将架构演进做成一次性大重构、目录搬迁或临时决策。

#### 2.18.1 Evolutionary Architecture 与其他最佳实践的分工

SpecForge MUST 按以下方式理解 Evolutionary Architecture 与前序规则的关系：

```text
ISO 42010 = 识别演进影响哪些利益相关方关切。
arc42 = 组织演进中的架构文档结构。
C4 = 控制演进描述的层级。
ADR = 记录为什么选择某个演进方向。
ATAM = 分析演进方案的质量属性取舍。
DDD = 判断模块边界演进是否合理。
Microservices = 判断模块是否可以演进为服务。
Cloud Architecture Patterns = 保证跨边界演进后的失败治理。
Twelve-Factor App = 保证运行交付能力能支撑演进。
SRE = 用 SLO、错误预算和运行证据衡量演进后的可靠性。
Evolutionary Architecture = 将上述机制组织成持续、增量、可验证的架构演进系统。
```

冲突取舍规则：

1. 当演进方向与已有 ADR 冲突时，MUST 新建 ADR supersedes 旧 ADR。
2. 当演进收益不明确时，MUST 通过 ATAM 和 Fitness Function 明确目标。
3. 当演进需要大范围一次性修改时，MUST 拆成多个 Work Item。
4. 当每个增量步骤不能独立验证时，MUST NOT 进入实施。
5. 当演进导致旧接口、旧事件、旧数据、旧配置并存时，MUST 生成 `deprecation_plan.md` 并更新 `deprecation_policy.md`。
6. 当代码实现、规格或依赖偏离已接受架构时，MUST 生成 `architecture_drift_report.md`。

#### 2.18.2 触发条件

以下情况 MUST 触发 Architecture Evolution Analysis，并生成 `work-items/<WI>/architecture_evolution_plan.md`：

1. 新增、拆分、合并、重命名模块；
2. 改变服务边界或部署模型；
3. 改变数据所有权；
4. 改变 API / Event / Data Contract；
5. 推进 `architecture_roadmap.md` 中某一阶段；
6. 处理技术债或架构风险；
7. 废弃旧接口、旧事件、旧模块、旧数据结构、旧配置或旧部署单元；
8. 修改或新增架构 Gate；
9. 修改 `fitness_functions.md`；
10. 发现架构漂移。

以下情况 SHOULD 触发 Architecture Evolution Analysis：

1. 本次变更会让当前架构更接近或偏离目标架构；
2. 本次变更会增加长期维护成本；
3. 本次变更需要临时兼容旧能力；
4. 本次变更会引入新的技术债、迁移债或运行债。

#### 2.18.3 项目级演进文件

SpecForge SHOULD 在项目级新增以下文件：

```text
project/architecture_roadmap.md
project/fitness_functions.md
project/deprecation_policy.md
```

其中：

| 文件 | 职责 | 不负责 |
|---|---|---|
| `architecture_roadmap.md` | 当前架构、目标架构、演进阶段、阶段退出条件、非目标和复盘周期 | 不记录单次 WI 的全部实施细节 |
| `fitness_functions.md` | 架构目标的适应度函数、检查方式、阈值、执行频率、证据和失败处理 | 不替代业务测试和普通单元测试 |
| `deprecation_policy.md` | 旧接口、事件、模块、数据、配置、部署单元的废弃、迁移、兼容和删除规则 | 不替代具体 WI 的迁移执行记录 |

#### 2.18.4 `architecture_roadmap.md` 文件职责

```markdown
# Architecture Roadmap

## 1. Purpose

本文件定义项目架构的目标状态、演进阶段、阶段完成条件和受控变更路线。

## 2. Current Architecture State

- Current architecture style:
- Current modules:
- Current deployment model:
- Current data ownership model:
- Current known risks:
- Current technical debt:

## 3. Target Architecture State

- Target architecture style:
- Target module boundaries:
- Target deployment model:
- Target data ownership model:
- Target quality attributes:
- Target operational capabilities:

## 4. Evolution Principles

- 演进 MUST 通过 Work Item 执行。
- 每个演进步骤 MUST 可验证。
- 每个演进步骤 SHOULD 可回退。
- 禁止绕过 ADR / ATAM / Gate 直接修改正式规格。
- 每个步骤 MUST 更新 trace 和 merge_report。

## 5. Evolution Stages

| Stage | Goal | Scope | Required WIs | Exit Criteria | Risk |
|---|---|---|---|---|---|
| STAGE-1 | 拆清 auth 模块边界 | core/auth | WI-030, WI-031 | auth owned_data 清晰，禁止 core 直接访问 credential | Medium |

## 6. Non-goals

| Non-goal | Reason | Revisit Condition |
|---|---|---|
| 不拆 auth-service | 当前无独立部署需求 | 当 auth 需要独立扩容或独立团队维护 |

## 7. Roadmap Review Cadence

- Review trigger:
- Review owner:
- Review evidence:
```

#### 2.18.5 `fitness_functions.md` 文件职责

```markdown
# Architecture Fitness Functions

## 1. Purpose

本文件定义用于持续验证架构是否符合目标状态的适应度函数。

## 2. Fitness Function Catalog

| FF ID | Architecture Goal | Fitness Function | Type | Execution | Threshold | Evidence |
|---|---|---|---|---|---|---|
| FF-001 | 模块边界清晰 | auth 模块不得直接访问 user_profile 表 | Automated / Manual | CI / Gate | 0 violations | evidence/fitness/FF-001 |
| FF-002 | 配置外部化 | 新增配置必须登记到 configuration_design.md | Gate | Every WI | 100% registered | review_report.md |
| FF-003 | 可靠性可观测 | SLO 接口必须有指标和告警 | Manual + Monitoring | Release Gate | all critical SLO covered | dashboard evidence |

## 3. Fitness Function Types

- Automated
- Semi-automated
- Manual review
- Runtime monitoring
- Evidence-based

## 4. Execution Rules

- Automated fitness functions SHOULD run in CI when possible.
- Manual fitness functions MUST be checked by Gate.
- Runtime fitness functions MUST link to observability evidence.
- Failed fitness functions MUST block merge unless explicitly waived.

## 5. Waiver Rules

| FF ID | Waiver Allowed? | Approval | Expiry | Required Follow-up |
|---|---|---|---|---|

## 6. Related Gates

- Domain Boundary Gate
- ADR Gate
- ATAM Gate
- Service Boundary Gate
- Resilience Pattern Gate
- Runtime Delivery Gate
- SRE Gate
- Architecture Evolution Gate
```

Fitness Function MAY 是自动化测试、静态规则、依赖扫描、规格 Gate、运行指标、Dashboard 证据或人工评审。AI MUST NOT 把 Fitness Function 理解为只能由代码测试实现。

#### 2.18.6 `deprecation_policy.md` 文件职责

```markdown
# Deprecation Policy

## 1. Purpose

本文件定义旧模块、旧接口、旧事件、旧数据结构、旧配置和旧部署单元的废弃、迁移和删除规则。

## 2. Deprecation Principles

- 废弃 MUST 先公告再删除。
- 废弃 MUST 有消费者影响分析。
- 废弃 MUST 有迁移路径。
- 删除 MUST 有证据证明无消费者依赖。
- 删除 MUST 更新 trace、ADR、API/Event/Data contracts。

## 3. Deprecation Catalog

| Item | Type | Owner | Deprecated Since | Removal After | Replacement | Consumers | Status |
|---|---|---|---|---|---|---|---|
| /api/v1/login | API | auth | 2026-06-05 | 2026-09-05 | /api/v2/auth/login | web, mobile | Deprecated |

## 4. Migration Rules

| Type | Required Migration Evidence |
|---|---|
| API | consumer migration evidence, access logs |
| Event | subscriber migration evidence |
| Data | migration script, validation report |
| Config | environment update evidence |
| Module | trace migration map, module index update |

## 5. Removal Checklist

- Consumers checked:
- Replacement available:
- Logs confirm no usage:
- Tests updated:
- Docs updated:
- Trace updated:
- Merge report updated:
```

#### 2.18.7 Work Item 级演进文件

当 Work Item 涉及架构演进时，MUST 按影响范围生成以下文件：

```text
work-items/<WI>/architecture_evolution_plan.md
work-items/<WI>/fitness_function_delta.md
work-items/<WI>/deprecation_plan.md
work-items/<WI>/architecture_drift_report.md
```

`architecture_evolution_plan.md` MUST 说明：

- 当前状态；
- 目标状态；
- 相关 `architecture_roadmap.md` 阶段；
- 增量步骤；
- 每一步验证方式；
- 每一步回退或替代策略；
- 对模块、API、数据、部署、SLO、Trace 的影响；
- Exit Criteria。

`fitness_function_delta.md` MUST 说明：

- 新增、修改或删除哪些 Fitness Function；
- 为什么变化；
- 期望本次 WI 后 Fitness Function 结果如何变化；
- 证据保存在哪里。

`deprecation_plan.md` MUST 说明：

- 废弃对象；
- 替代对象；
- 消费者影响；
- 迁移时间线；
- 删除条件；
- 验证证据。

`architecture_drift_report.md` MUST 说明：

- 期望架构；
- 实际状态；
- 偏离类型；
- 严重度；
- 证据；
- 后续 Work Item 或修复动作。

#### 2.18.8 Architecture Evolution Gate

SpecForge MUST 增加 `Architecture Evolution Gate`。

该 Gate MUST 检查：

1. 是否应该触发 `architecture_evolution_plan.md`；
2. 是否说明当前状态和目标状态；
3. 是否关联 `architecture_roadmap.md`；
4. 是否以 Work Item 为原子演进单元；
5. 是否定义 incremental steps；
6. 是否每一步都有验证方式；
7. 是否每一步都有回退或替代策略；
8. 是否更新 `fitness_functions.md`；
9. 是否存在 architecture drift；
10. 是否更新 `deprecation_policy.md`；
11. 是否有迁移计划；
12. 是否有 ADR；
13. 是否有 ATAM；
14. 是否更新 `trace_matrix.md`；
15. 是否更新 `merge_report.md`；
16. 是否没有绕过既有 ADR 和 Gate；
17. 是否能证明本次变更让项目更接近已接受目标架构，或通过 ADR/ATAM 记录了被接受的取舍。

Gate MUST fail when a change claims to be architecture evolution but cannot show target state, incremental steps, verification, rollback/fallback, trace impact, and merge evidence.

#### 2.18.9 AI 操作协议补充

AI 在 `impact_analysis.md` 中 MUST 增加：

```text
architecture_evolution_required: true/false
reason:
roadmap_stage:
affected_fitness_functions:
drift_risks:
deprecation_required:
```

当 `architecture_evolution_required = true` 时，AI MUST：

1. 读取 `architecture_roadmap.md`、`fitness_functions.md`、`deprecation_policy.md`、`architecture_risks.md`、`project/decisions/`、`trace_matrix.md`、相关 `module.json` 和 `service_catalog.md`；
2. 判断本次变更是目标演进、必要取舍，还是架构漂移；
3. 生成 `architecture_evolution_plan.md`；
4. 如改变或新增适应度函数，生成 `fitness_function_delta.md`；
5. 如涉及废弃旧能力，生成 `deprecation_plan.md`；
6. 如发现偏离已接受架构，生成 `architecture_drift_report.md`；
7. 更新相关项目级文件、模块文件、Trace、ADR、ATAM、tasks、verification_report、evidence 和 merge_report；
8. 通过 Architecture Evolution Gate 后才允许 Merge。

#### 2.18.10 示例：core 拆出 auth 的受控演进

错误做法：

```text
直接新建 auth 目录，把登录相关代码搬过去。
```

正确做法：

```text
Current State:
core 模块包含认证、用户资料、权限、审计，职责过大。

Target State:
auth 模块负责 credential、session、login_audit；
user 模块负责 user_profile；
authorization 模块负责 role_permission。

Roadmap:
Stage 1：拆清 auth 模块边界，但不拆服务。
Stage 2：补齐 auth API 和 audit event。
Stage 3：根据 SLO 和部署需求评估是否服务化。

Fitness Functions:
FF-AUTH-001：auth 模块之外不得写 credential。
FF-AUTH-002：所有登录入口必须写 login_audit。
FF-AUTH-003：auth API 必须有 trace_id 和登录失败指标。

ADR:
ADR-0008：Split auth from core as a module, not microservice.

Gates:
Domain Boundary Gate
ADR Gate
ATAM Gate
Architecture Evolution Gate
Trace Gate
```

该示例说明：架构演进不是“大搬家”，而是一组可审查、可验证、可追溯、可回退的 Work Item 事务。

#### 2.18.11 本轮吸收结论

| 项 | 结论 |
|---|---|
| 来源最佳实践 | Evolutionary Architecture |
| 吸收方式 | 受控增量演进、目标架构路线图、适应度函数、架构漂移检测、废弃策略 |
| 新增项目级文件 | `architecture_roadmap.md`、`fitness_functions.md`、`deprecation_policy.md` |
| 新增 Work Item 文件 | `architecture_evolution_plan.md`、`fitness_function_delta.md`、`deprecation_plan.md`、`architecture_drift_report.md` |
| 新增 Gate | Architecture Evolution Gate |
| 核心约束 | 架构演进必须目标明确、增量执行、可验证、可回退、可追溯 |

SpecForge MUST treat architecture change as controlled evolution, not ad-hoc rewriting.


## 3. 核心概念

### 3.1 Project Spec

Project Spec 是项目级规格体系，代表当前项目的全局真相。它不等于一个文件，而是一组项目级文件。

Project Spec 包括：

- 模块清单；
- 全局术语；
- 业务价值；
- 用户旅程；
- UI/UX 体验设计；
- 前端架构设计；
- 项目级需求索引；
- 项目级整体架构；
- 模块连接关系；
- 接口契约；
- 跨模块数据结构；
- 事件流和业务流；
- 数据库全局设计；
- 分布式一致性设计；
- 部署与运行设计；
- 观测、安全、可靠性、CI/CD 设计；
- 项目级 Trace Matrix。

### 3.2 Module Spec

Module Spec 是模块当前完整规格。模块可以是：

- 小项目中的 `core`；
- 分层单体中的业务域；
- 微服务系统中的服务；
- 数据平台中的数据层或处理域；
- 工业系统中的设备适配、协议网关、实时监控等子系统；
- AI 应用中的检索、模型网关、评估、工作流编排等子系统。

模块目录保存：

- 模块元数据；
- 模块需求；
- 模块内部设计；
- 模块 Trace；
- 模块关联 Work Item 索引。

### 3.3 Work Item

Work Item 是一次变更事务，不是一个模块，不是一个完整规格副本。

Work Item 保存：

- 本次用户输入；
- 头脑风暴记录；
- 影响分析；
- 需求 delta；
- 设计 delta；
- 任务列表；
- 代码修改范围；
- 验证证据；
- 审查报告；
- 合并报告；
- 架构迁移映射。

一个 Work Item 可以影响多个模块，因此 Work Item 实体必须集中放在 `.specforge/work-items/<WI-ID>/`，禁止默认放在某个模块目录下。

### 3.4 Delta

Delta 是本次变更对当前规格的修改说明。

Delta 不应该保存完整规格，只记录：

- 新增；
- 修改；
- 废弃；
- 迁移；
- 影响范围；
- 引用关系；
- 变更理由。

### 3.5 Candidate

Candidate 是将 Delta 应用于当前规格后生成的候选规格文件。

例如：

```text
project/modules/auth/requirements.candidate.md
project/modules/auth/design.candidate.md
project/api_contracts.candidate.md
```

Candidate 通过 Gate 且用户确认后，才允许合并为正式规格。

### 3.6 Gate

Gate 是确定性校验机制，用来防止 Agent 生成的规格、设计、任务、迁移、合并记录失控。

Gate 不替代用户业务判断；Gate 检查结构、引用、格式、唯一性、完整性、可追溯性和安全边界。

### 3.7 Merge

Merge 是将 Candidate 正式写入 Project/Module 当前规格的动作。Merge 必须满足：

1. 对应 Gate 通过；
2. 用户确认通过；
3. 合并前后 hash 可记录；
4. 写入 `merge_report.md`；
5. 更新 trace；
6. 更新项目规格版本。

---


### 2.15 Microservices 吸收规则：模块到服务的升级门槛与服务治理

SpecForge 从微服务最佳实践吸收的不是“默认采用微服务”，而是“模块升级为独立服务必须满足服务化门槛并补齐运行治理”的机制。

本标准 MUST 明确以下边界：

```text
Module ≠ Microservice
Bounded Context ≠ Microservice
C4 Container ≠ Docker Container
Microservice = 独立运行、独立部署、独立数据治理、独立观测、独立发布责任的服务边界。
```

AI MUST NOT treat a SpecForge Module, DDD Bounded Context, C4 Container, or UI Page as a Microservice by default.

AI MUST perform service candidate analysis before proposing a module as an independently deployable service.

A Microservice proposal MUST demonstrate independent business capability, data ownership, deployment value, runtime isolation value, contract maturity, consistency strategy, observability, CI/CD readiness, owner responsibility, and acceptable operational cost.

If DDD suggests module separation but service candidate criteria are not satisfied, AI SHOULD propose modular monolith instead of microservices.

#### 2.14.1 Microservices 与其他最佳实践的分工

SpecForge MUST 按以下方式理解微服务最佳实践与前序规则的关系：

```text
ISO 42010 = 判断哪些利益相关方关心服务化，例如用户、运维、开发、团队负责人。
arc42 = 组织服务化相关文档结构。
C4 = 区分 Module、Container、Deployment Unit，防止层级混淆。
ADR = 记录为什么决定服务化或不服务化。
ATAM = 分析服务化对质量属性、成本、复杂度的影响。
DDD = 提供候选业务边界。
Microservices = 判断模块是否有资格升级为独立服务，并规定服务化后的治理要求。
```

冲突取舍规则：

1. 当 DDD 认为应该拆模块，但微服务门槛不满足时，MUST 拆模块但不拆服务；
2. 当 C4 Container 和 SpecForge Module 不一致时，MUST 以服务化分析和部署设计为准，不得自动一一映射；
3. 当 ATAM 证明服务化成本大于收益时，MUST 保持模块化单体，除非用户明确接受风险；
4. 当 ADR 已决定当前阶段不做微服务时，AI MUST NOT 绕过 ADR 直接生成服务化设计。

#### 2.14.2 微服务判断的上游

AI 判断服务化前 MUST 读取或引用：

```text
project/domain_model.md
project/context_map.md
project/architecture.md
project/spec_manifest.json
project/modules/<module>/module.json
project/database_design.md
project/integration_design.md
project/api_contracts.md
project/event_flows.md
project/consistency_design.md
project/deployment_design.md
project/observability_design.md
project/reliability_design.md
project/security_design.md
project/ci_cd_design.md
work-items/<WI>/domain_analysis.md
work-items/<WI>/module_boundary_analysis.md
work-items/<WI>/quality_attribute_analysis.md
work-items/<WI>/adr_draft.md
已有 project/decisions/ADR-*.md
Owner / 维护责任信息
```

推荐链路：

```text
业务能力识别
→ DDD 模块边界分析
→ ATAM 质量属性权衡
→ 服务化候选分析
→ ADR
→ 服务边界计划
→ 迁移计划
→ Service Boundary Gate
→ 用户确认
→ Merge
```

#### 2.14.3 微服务判断的下游

一旦模块被决定升级为服务，以下文件 MUST 被检查并按需更新：

| 下游文件 | 必须更新的内容 |
|---|---|
| `architecture.md` | 服务化后的整体架构、仍在单体中的模块、独立服务、边界关系、服务化理由 |
| `spec_manifest.json` | module 与 service 的映射关系、deployment_model、service_id、runtime_container |
| `service_catalog.md` | 服务索引、owned_modules、owned_data、deployment_unit、owner、SLO、状态 |
| `api_contracts.md` | 服务 API、错误码、版本策略、兼容策略 |
| `event_flows.md` | 服务事件、event schema、幂等、重试、DLQ、补偿 |
| `database_design.md` | 服务数据所有权、私有表/schema/database、跨服务访问规则 |
| `consistency_design.md` | 本地事务、最终一致性、Saga、Outbox、补偿、对账 |
| `observability_design.md` | trace_id、correlation_id、服务级日志、指标、链路追踪、告警 |
| `deployment_design.md` | 服务部署单元、健康检查、服务发现、灰度、回滚 |
| `ci_cd_design.md` | 独立构建、测试、发布、回滚和数据库迁移策略 |

#### 2.14.4 Service Candidate Matrix

AI 提议服务化前 MUST 输出 Service Candidate Matrix：

| 维度 | 必须回答的问题 | 结果 |
|---|---|---|
| 独立业务能力 | 是否有清晰业务能力或上下文 | 是/否 |
| 独立数据所有权 | 是否有明确 owned_data | 是/否 |
| 独立部署价值 | 是否需要单独发布、回滚、扩容 | 是/否 |
| 独立运行价值 | 是否需要故障隔离或资源隔离 | 是/否 |
| 维护责任 | 是否有明确 owner / maintainer | 是/否 |
| 契约成熟度 | API/Event/Data contract 是否清晰 | 是/否 |
| 一致性方案 | 跨服务事务和数据同步是否可控 | 是/否 |
| 可观测性能力 | 是否能独立监控、追踪、告警 | 是/否 |
| CI/CD 能力 | 是否能独立构建、测试、发布、回滚 | 是/否 |
| 成本可接受 | 网络、部署、运维、排错复杂度是否可接受 | 是/否 |

如果只有业务边界清晰，但部署、数据、观测、CI/CD、维护责任不成熟，AI SHOULD 保持模块化单体。

#### 2.14.5 禁止服务化的情况

以下情况 AI MUST NOT 推荐微服务，除非用户明确要求并接受风险：

1. 项目早期，业务边界还不稳定；
2. 只是为了“看起来先进”；
3. 没有独立部署需求；
4. 没有独立扩展需求；
5. 没有明确 Owner / Maintainer；
6. 数据边界不清；
7. 需要大量跨服务同步事务；
8. 没有观测、CI/CD、发布回滚能力；
9. 当前维护能力无法承担分布式排错成本；
10. 模块化单体已经能满足当前复杂度。

#### 2.14.6 服务化 Work Item 文件

Microservice-related Work Items MUST include the following files when they propose creating, splitting, migrating, or independently deploying services:

```text
work-items/<WI>/
  service_candidate_analysis.md
  service_boundary_plan.md
  data_ownership_migration_map.md
  service_contract_migration_map.md
  deployment_migration_plan.md
```

`service_candidate_analysis.md` MUST explain why modular monolith is insufficient, what service benefits are expected, what costs are introduced, whether the Service Candidate Matrix passes, and what trigger would justify future service extraction if the current decision is “not yet”.

`service_boundary_plan.md` MUST define service_id, service_name, owned_modules, responsibility, out_of_scope, owned_data, APIs, events, dependent_services, deployment_unit, runtime, owner, SLO, and status.

`data_ownership_migration_map.md` MUST define entity/table/schema ownership migration, data synchronization, compatibility, and rollback strategy.

`service_contract_migration_map.md` MUST define how internal calls become API/Event contracts, how consumers migrate, and how versions and breaking changes are handled.

`deployment_migration_plan.md` MUST define how deployment, configuration, CI/CD, monitoring, database migration, rollout, and rollback change during service extraction.

#### 2.14.7 本轮实践吸收记录

| 项目 | 内容 |
|---|---|
| 来源最佳实践 | Microservices Best Practices |
| 吸收原因 | 防止 AI 将模块拆分直接升级为微服务，避免伪微服务和过度服务化 |
| 加入的项目级文件 | `service_catalog.md` |
| 加入的 Work Item 文件 | `service_candidate_analysis.md`、`service_boundary_plan.md`、`data_ownership_migration_map.md`、`service_contract_migration_map.md`、`deployment_migration_plan.md` |
| 加入的 Gate | Service Boundary Gate |
| 主要约束 | Module/Bounded Context/C4 Container/UI Page 均不得默认等同 Microservice |
| 取舍规则 | DDD 可提出模块边界；是否服务化必须经过服务化候选矩阵、ATAM、ADR、Gate 和用户确认 |


### 2.16 Cloud Architecture Patterns 吸收规则：分布式失败治理与运行韧性

SpecForge 从 Cloud Architecture Patterns 吸收的不是“默认上云”“默认 Kubernetes”或“默认云原生”，而是“跨边界协作必须显式设计失败处理、恢复策略、幂等策略、观测证据和验证方式”的治理机制。

本标准 MUST 明确以下判断：

```text
只要设计跨进程、跨服务、跨网络、跨系统、异步事件、外部依赖、后台任务或数据同步，就不能只写正常流程，必须写失败路径、恢复策略、幂等策略、观测证据和验证方式。
```

Cloud Architecture Patterns 不只适用于公有云。只要系统存在网络调用、外部依赖、异步消息、分布式事务、跨进程协作、数据采集、数据同步或后台任务，就 SHOULD 使用本规则进行韧性分析。

AI MUST perform resilience analysis when a Work Item introduces or changes cross-process calls, external system dependencies, asynchronous events, distributed workflows, data synchronization, background jobs, or eventual consistency.

AI MUST NOT describe only the successful path of a cross-boundary interaction.

#### 2.15.1 Cloud Architecture Patterns 与其他最佳实践的分工

SpecForge MUST 按以下方式理解 Cloud Architecture Patterns 与前序规则的关系：

```text
ISO 42010 = 识别谁关心可靠性、失败恢复、数据一致性和运维可见性。
arc42 = 把失败治理写入运行时、部署、横切概念、风险章节。
C4 = 判断失败发生在哪个层级：C1 外部系统、C2 容器、C3 组件、C4 代码。
ADR = 记录是否采用 Outbox、Saga、事件驱动、熔断、隔离等重大模式。
ATAM = 分析这些模式对性能、可靠性、复杂度、成本和用户体验的权衡。
DDD = 判断哪些一致性边界属于同一上下文，哪些必须跨上下文协作。
Microservices = 服务化以后必须强化这些失败治理模式。
Cloud Architecture Patterns = 提供具体的分布式失败处理和运行韧性机制。
```

冲突取舍规则：

1. 当设计仍是单体且无外部依赖时，MAY 不引入复杂分布式模式；
2. 当出现跨网络、外部系统、异步事件或后台任务时，MUST 至少定义 timeout、error handling、observability；
3. 当引入 retry 时，MUST 同时检查 max attempts、backoff、jitter、idempotency 和 retry storm 风险；
4. 当引入最终一致性时，MUST 定义 compensation、reconciliation、audit 和 manual intervention；
5. 当引入 Outbox、Saga、Circuit Breaker、Bulkhead、Rate Limit 等重大模式时，MUST 经过 ATAM 和 ADR；
6. 当某个模式增加复杂度大于收益时，MUST 记录不采用理由，并选择更小的失败治理方案。

#### 2.15.2 触发条件

以下情况 MUST 生成 `work-items/<WI>/resilience_analysis.md`：

1. 新增或修改跨模块、跨服务、跨进程、跨网络调用；
2. 新增或修改外部系统依赖；
3. 新增或修改异步事件、消息队列、发布订阅、后台任务；
4. 新增或修改跨资源事务、最终一致性、数据同步、数据采集、导入导出；
5. 设计中出现 retry、timeout、circuit breaker、rate limit、bulkhead、idempotency、Outbox、Saga、dead letter、reconciliation；
6. 服务化、分布式部署、云原生部署或外部平台集成发生变化；
7. 用户旅程中存在不能丢失、不能重复、不能长期不一致的关键业务动作。

以下情况 SHOULD 做轻量韧性分析：

1. 调用本进程外资源但影响范围较小；
2. 后台任务失败可人工重跑，但需要记录证据；
3. UI 操作会触发重复提交、自动保存、批量处理或长耗时任务。

以下情况 MAY NOT 生成独立 `resilience_analysis.md`：

1. 纯文案调整；
2. 完全本地、无跨边界调用、无数据一致性风险的局部代码清理；
3. 不影响运行时协作和失败处理的简单 UI 布局调整。

#### 2.15.3 上游输入

AI 做韧性分析前 MUST 读取或引用：

```text
work-items/<WI>/impact_analysis.md
work-items/<WI>/quality_attribute_analysis.md
work-items/<WI>/options_analysis.md
project/architecture.md
project/integration_design.md
project/api_contracts.md
project/event_flows.md
project/database_design.md
project/consistency_design.md
project/deployment_design.md
project/reliability_design.md
project/observability_design.md
project/quality_attributes.md
project/architecture_risks.md
project/resilience_patterns.md
project/decisions/ADR-*.md
相关 user_journeys.md / UI 业务任务
相关外部系统边界和契约
```

AI MUST 先回答：

- 哪些调用跨边界；
- 哪些依赖可能失败；
- 哪些数据不能丢；
- 哪些操作可能重复；
- 哪些操作可重试，哪些不可重试；
- 哪些业务允许最终一致；
- 哪些业务必须强一致；
- 哪些失败需要人工介入；
- 哪些失败必须可观测、可告警、可重放、可补偿。

#### 2.15.4 下游文件

韧性分析结果 MUST 按影响范围更新以下文件：

| 下游文件 | 必须承载的内容 |
|---|---|
| `resilience_patterns.md` | 项目采用的失败治理模式、适用场景、模式约束、关联 Gate |
| `integration_design.md` | timeout、retry policy、backoff、circuit breaker、rate limit、fallback、error classification |
| `event_flows.md` | event_id、idempotency_key、delivery semantics、retry、dead letter、replay、compensation、reconciliation |
| `consistency_design.md` | strong/eventual consistency、local transaction、Outbox、Saga、compensation、reconciliation、manual intervention |
| `reliability_design.md` | failure mode、degradation、bulkhead、capacity protection、RTO/RPO、retry storm prevention |
| `observability_design.md` | trace_id、correlation_id、event_id、retry_count、circuit_state、dead_letter_count、consumer_lag、compensation_status、alerts |
| `architecture_risks.md` | 中高风险、缓解措施、Owner、状态 |
| `tasks.md` | 实现 timeout/retry/idempotency/outbox/compensation/monitoring 的任务 |
| `verification_report.md` / `evidence/` | 超时、重复、死信、补偿、对账、故障注入、告警验证证据 |
| `adr_draft.md` / `project/decisions/` | 重大模式选择，如 Outbox、Saga、Circuit Breaker、事件驱动 |

#### 2.15.5 `resilience_patterns.md` 文件职责

`project/resilience_patterns.md` 是分布式失败治理模式总索引。它 MUST NOT 替代 `integration_design.md`、`event_flows.md`、`consistency_design.md`、`reliability_design.md` 和 `observability_design.md` 的细节，而是规定模式目录、适用场景、必填字段和 Gate 入口。

推荐结构：

```markdown
# Resilience Patterns

## 1. Purpose
本文件定义项目中跨边界调用、外部依赖、异步事件、最终一致性和分布式失败治理所采用的标准模式。

## 2. Pattern Catalog
| Pattern | Status | Applies To | Required Fields | Related Gate |
|---|---|---|---|---|
| Timeout | Required | All remote calls | timeout, fallback | Resilience Pattern Gate |
| Retry + Backoff | Conditional | Transient failures | max_attempts, backoff, idempotency | Resilience Pattern Gate |
| Circuit Breaker | Conditional | Persistent downstream failures | threshold, open_duration, half_open_probe | Resilience Pattern Gate |
| Rate Limit / Throttling | Conditional | Public/high-risk APIs | limit, burst, retry_after | API / Resilience Gate |
| Bulkhead / Isolation | Conditional | Shared resource or dependency risk | isolation boundary, resource pool | Reliability Gate |
| Idempotency | Required when retry/duplicate possible | Commands/events | idempotency_key, dedup store | Data/Event Gate |
| Outbox | Conditional | DB update + event publish | outbox table, relay, duplicate handling | Consistency Gate |
| Saga / Compensation | Conditional | Cross-service transaction | steps, compensation, audit | Consistency Gate |
| Dead Letter | Conditional | Async message failures | retry limit, replay owner | Event Gate |
| Reconciliation | Conditional | Eventual consistency | source of truth, repair strategy | Verification Gate |

## 3. Remote Call Rules
每个跨进程 / 跨服务 / 外部系统调用 MUST 定义 timeout、retry policy、circuit breaker need、fallback behavior、error classification、observability fields。

## 4. Async Event Rules
每个事件流 MUST 定义 event_id、idempotency_key、delivery semantics、retry policy、dead letter policy、replay policy、compensation or reconciliation。

## 5. Consistency Rules
每个跨资源业务事务 MUST 定义 consistency model、local transaction boundary、compensation、rollback or repair、audit、manual intervention condition。

## 6. Observability Requirements
必须定义 trace_id、correlation_id、retry_count、circuit_state、dead_letter_count、compensation_status、reconciliation_result。

## 7. Related Files
- integration_design.md
- event_flows.md
- consistency_design.md
- reliability_design.md
- observability_design.md
- architecture_risks.md
```

#### 2.15.6 核心模式使用规则

**Timeout**：Every remote call MUST define timeout. 必须说明 timeout value、owner、default behavior、user-facing message、retry allowed or not、fallback allowed or not。

**Retry + Backoff**：Retry MUST be limited to transient failures. AI MUST NOT define retry without max attempts, backoff strategy, jitter, retryable error classification, total retry duration, and idempotency consideration.

**Circuit Breaker**：用于持续失败或下游不可用场景。必须定义 failure threshold、open duration、half-open probe、fallback behavior、metrics、alert。AI MUST NOT blindly retry persistent failures.

**Rate Limit / Throttling**：用于保护系统和下游依赖。必须定义 limit dimension、limit value、burst policy、rejection response、retry-after、priority。

**Bulkhead / Isolation**：用于故障隔离。必须定义 isolation boundary、resource pool、failure containment、fallback。

**Idempotency**：只要存在 retry、重复提交、重复消息、至少一次投递，就 MUST 定义 idempotency_key、deduplication store、idempotency window、business state check、conflict behavior。

**Transactional Outbox**：当数据库更新和消息发布必须一致时 SHOULD 评估 Outbox。必须定义 outbox table、message status、relay、retry、duplicate publish handling、consumer idempotency、monitoring、cleanup。

**Saga / Compensating Transaction**：当业务事务跨多个服务或资源且不能使用单一数据库事务时 MUST 评估 Saga 或补偿事务。必须定义 steps、local transaction per step、compensation per step、orchestration/choreography、failure point、manual intervention、audit。

**Dead Letter / Retry Queue**：异步消息失败 MUST NOT 无限重试。必须定义 max retry、dead letter condition、dead letter owner、replay process、manual review process、alert。

**Reconciliation / 对账**：最终一致性场景 SHOULD 定义对账。必须说明 source of truth、comparison rule、schedule、repair strategy、manual confirmation、evidence。

#### 2.15.7 `resilience_analysis.md` 文件职责

当触发韧性分析时，Work Item MUST 生成：

```text
work-items/<WI>/resilience_analysis.md
```

推荐结构：

```markdown
# Resilience Analysis

## 1. Work Item
- WI:
- Title:
- Affected Modules:
- Affected Project Docs:

## 2. Cross-boundary Interactions
| Interaction | Type | Caller | Callee | Sync/Async | Criticality |
|---|---|---|---|---|---|

## 3. Failure Modes
| Failure Mode | Impact | Detection | Handling |
|---|---|---|---|
| Timeout | | | |
| Duplicate request | | | |
| Downstream unavailable | | | |
| Message publish failed | | | |
| Message consumed repeatedly | | | |
| Compensation failed | | | |

## 4. Pattern Selection
| Scenario | Selected Pattern | Reason | Target Spec File |
|---|---|---|---|

## 5. Idempotency Design
- idempotency_key:
- deduplication store:
- idempotency window:
- duplicate behavior:

## 6. Compensation / Reconciliation
- compensation steps:
- source of truth:
- reconciliation schedule:
- manual intervention:

## 7. Observability
- logs:
- metrics:
- traces:
- alerts:
- dashboards:

## 8. Validation Plan
| Failure Scenario | Test / Evidence |
|---|---|
| Timeout | |
| Retry exhausted | |
| Duplicate message | |
| Dead letter | |
| Compensation failure | |
```

#### 2.15.8 AI 操作约束

AI 在 `impact_analysis.md` 阶段 MUST 输出：

```text
resilience_analysis_required: Yes/No + reason
cross_boundary_interactions:
external_dependencies:
async_flows:
consistency_risks:
failure_modes:
```

如果 `resilience_analysis_required = Yes`，AI MUST：

1. 识别所有跨边界交互；
2. 识别失败模式；
3. 选择最小足够的失败治理模式；
4. 说明为什么不采用更复杂模式；
5. 更新相关 project-level design files；
6. 将中高风险写入 `architecture_risks.md`；
7. 将验证任务写入 `tasks.md`；
8. 在 `verification_report.md` 和 `evidence/` 中保留证据；
9. 当模式选择影响架构、可靠性、成本或复杂度时，生成 ADR 并经过 ATAM。

AI MUST NOT：

- 只写 happy path；
- 定义无限重试；
- 定义 retry 但不定义幂等；
- 定义异步事件但不定义 event_id / idempotency_key / dead letter；
- 定义最终一致性但不定义补偿或对账；
- 定义外部依赖但不定义 timeout 和错误分类；
- 把失败治理留给“实现阶段再说”。

#### 2.15.9 本轮实践吸收记录

| 项目 | 内容 |
|---|---|
| 来源最佳实践 | Cloud Architecture Patterns / Resilience Patterns |
| 吸收原因 | 防止 AI 只设计正常流程，忽略跨边界失败、恢复、幂等、补偿、观测和验证 |
| 加入的项目级文件 | `resilience_patterns.md` |
| 加入的 Work Item 文件 | `resilience_analysis.md` |
| 加入的 Gate | Resilience Pattern Gate |
| 主要约束 | 跨边界设计 MUST 写失败路径、恢复策略、幂等策略、观测字段和验证方式 |
| 取舍规则 | 单体无外部依赖时不强制复杂模式；跨网络/外部系统/异步事件时必须至少定义 timeout、error handling、observability；重大韧性模式必须经过 ATAM 和 ADR |


## 4. 标准目录结构

### 4.1 推荐目录

```text
.specforge/
  project/
    spec_manifest.json
    glossary.md
    domain_model.md
    context_map.md
    service_catalog.md
    resilience_patterns.md
    architecture_roadmap.md
    fitness_functions.md
    deprecation_policy.md
    decisions/
      decision_log.md
      ADR-0001-use-modular-monolith.md

    business_value.md
    user_journeys.md
    ui_experience_design.md
    frontend_design.md

    requirements_index.md

    design_index.md
    architecture.md
    integration_design.md
    api_contracts.md
    data_model.md
    database_design.md
    event_flows.md
    distributed_design.md
    consistency_design.md
    deployment_design.md
    infrastructure_design.md
    observability_design.md
    security_design.md
    reliability_design.md
    quality_attributes.md
    architecture_risks.md
    crosscutting_concepts.md
    ci_cd_design.md

    diagrams/
      c1_system_context.md
      c2_container_view.md
      c3_component_view_<module>.md
      deployment_view.md
      dynamic_view_<flow>.md

    trace_matrix.md

    modules/
      core/
        module.json
        requirements.md
        design.md
        data_design.md
        trace.md
        work_item_index.md

      auth/
        module.json
        requirements.md
        design.md
        data_design.md
        trace.md
        work_item_index.md

  work-items/
    WI-001/
      work_item.json
      intake.md
      brainstorming.md
      impact_analysis.md
      domain_analysis.md
      module_boundary_analysis.md
      requirements_delta.md
      design_delta.md
      architecture_delta.md
      options_analysis.md
      quality_attribute_analysis.md
      service_candidate_analysis.md
      service_boundary_plan.md
      data_ownership_migration_map.md
      service_contract_migration_map.md
      deployment_migration_plan.md
      resilience_analysis.md
      architecture_evolution_plan.md
      fitness_function_delta.md
      deprecation_plan.md
      architecture_drift_report.md
      adr_draft.md
      tasks.md
      trace_delta.md
      evidence/
      review_report.md
      verification_report.md
      merge_report.md

  archive/
    project-spec-snapshots/
      PSV-0001/
      PSV-0002/
```

### 4.2 最小可用目录

小项目可以采用最小目录：

```text
.specforge/
  project/
    spec_manifest.json
    glossary.md
    architecture.md
    requirements_index.md
    design_index.md
    trace_matrix.md
    modules/
      core/
        module.json
        requirements.md
        design.md
        trace.md
  work-items/
```

小项目中 `core` 代表整个项目。

### 4.3 扩展目录

当项目进入微服务、分布式、云原生、数据平台或工业系统时，可以启用更多项目级设计文件。

扩展文件不是一开始都必须写满，但一旦某类设计影响项目全局，就必须有对应文件承载。

---

## 5. 项目级规格文件标准

### 5.1 `spec_manifest.json`

`spec_manifest.json` 是项目规格清单和模块注册表。

必须包含：

- schema_version；
- project_spec_version；
- default_module；
- modules；
- 每个 module 的 module_id、name、prefix、requirements_file、design_file、trace_file、status。

示例：

```json
{
  "schema_version": "1.0",
  "project_spec_version": "PSV-0007",
  "default_module": "core",
  "modules": [
    {
      "module_id": "MOD-AUTH",
      "name": "auth",
      "prefix": "AUTH",
      "requirements_file": "project/modules/auth/requirements.md",
      "design_file": "project/modules/auth/design.md",
      "trace_file": "project/modules/auth/trace.md",
      "status": "active"
    }
  ]
}
```

Gate 必须检查：

- module_id 唯一；
- module name 唯一；
- prefix 唯一；
- 文件路径存在；
- status 合法；
- 不存在孤儿模块目录。


### 5.2 `domain_model.md`

`domain_model.md` 是项目级领域模型文件，负责记录业务能力、核心领域概念、业务规则、术语歧义、候选模块和数据归属依据。

它 MUST 回答：

- 系统服务的业务域是什么；
- 有哪些核心业务能力；
- 核心概念分别属于哪个上下文；
- 哪些业务规则应在同一模块内内聚；
- 哪些数据有明确 owner module；
- 哪些术语存在同名不同义或不同名同义；
- 哪些领域问题尚未确认。

它 MUST NOT 承载数据库表结构细节；数据库全局规则仍由 `database_design.md` 承载，模块内部数据结构由 module `data_design.md` 承载。

### 5.3 `context_map.md`

`context_map.md` 是项目级上下文映射文件，负责记录模块/上下文之间的关系、集成模式、模型转换、防腐层、共享内核和跨上下文数据暴露规则。

它 MUST 回答：

- 每个上下文对应哪个模块；
- 每个上下文拥有的数据是什么；
- 上下文之间通过 API、事件、投影还是共享模型协作；
- 是否需要 Anti-corruption Layer；
- 是否存在 Shared Kernel；
- 哪些跨上下文调用和数据共享是允许的；
- 哪些跨上下文访问是禁止的。

`context_map.md` MUST 与 `architecture.md`、`integration_design.md`、`api_contracts.md`、`event_flows.md`、`data_model.md` 和各模块 `module.json` 保持一致。


### 5.3A `service_catalog.md`

`service_catalog.md` 是项目级服务目录，负责记录系统中所有独立服务、服务与模块的映射关系、服务数据所有权、部署单元、运行责任、SLO 和状态。

`service_catalog.md` MUST NOT 替代 `spec_manifest.json`。`spec_manifest.json` 管模块注册；`service_catalog.md` 管服务注册。一个服务 MAY 包含一个或多个模块；一个模块 MAY 在不同阶段保持为单体内模块，也 MAY 经过服务化流程升级为独立服务。

`service_catalog.md` MUST 包含：

| 字段 | 说明 |
|---|---|
| service_id | 服务唯一 ID，如 `SVC-AUTH` |
| service_name | 服务名称 |
| status | proposed / active / deprecated / retired |
| owned_modules | 该服务承载的 SpecForge Module |
| owned_data | 该服务拥有的数据实体、表、schema 或存储 |
| deployment_unit | 部署单元 |
| runtime | 运行时技术栈 |
| repository | 代码仓库或目录 |
| api_entrypoints | 服务对外 API 入口 |
| event_topics | 发布或订阅的事件主题 |
| owner | 负责团队或维护责任人 |
| slo | 服务级 SLO 引用 |
| related_adrs | 服务化相关 ADR |

示例：

```markdown
# Service Catalog

| Service ID | Service Name | Status | Owned Modules | Owned Data | Deployment Unit | Owner | SLO |
|---|---|---|---|---|---|---|---|
| SVC-AUTH | auth-service | proposed | auth | credential, session, login_audit | backend-auth-service | team-platform | AUTH-SLO-001 |
```

Gate MUST 检查：

- service_id 唯一；
- owned_modules 存在于 `spec_manifest.json`；
- owned_data 已在 `data_model.md` / `database_design.md` / module `data_design.md` 中定义；
- 每个 active service 有 owner、deployment_unit、SLO、API/Event 契约和观测设计；
- 服务化决策有 ADR、ATAM 和 Service Boundary Gate 结果。

### 5.4 `requirements_index.md`

需求索引必须说明：

- 每个模块的需求文件；
- 模块前缀；
- 跨模块需求；
- 已废弃模块或需求迁移提示。

它不应承载所有模块需求细节。

### 5.5 `design_index.md`

设计索引必须说明：

- 项目级设计文件列表；
- 每个文件负责的设计主题；
- 模块设计文件列表；
- 跨模块契约文件入口。

它只是导航，不是设计本体。

### 5.4 `architecture.md`

整体架构设计文件，必须回答：

- 系统分层；
- 模块划分；
- 模块职责；
- 模块不负责什么；
- 模块依赖规则；
- 核心技术约束；
- 外部系统边界；
- 主要质量属性目标，如性能、可靠性、安全性、可维护性。

AI 在新增或调整模块时，必须检查是否违反 `architecture.md`。

### 5.5 `integration_design.md`

模块集成设计文件，必须回答：

- 模块间通信方式；
- 同步调用边界；
- 异步事件边界；
- 跨模块数据库访问规则；
- 调用失败处理；
- 重试、超时、幂等、补偿策略；
- 集成矩阵。

### 5.6 `api_contracts.md`

接口契约文件，必须定义：

- API ID；
- owner_module；
- consumer_modules；
- refs；
- request；
- response；
- errors；
- version；
- compatibility policy。

模块设计可以引用 API ID，但不应重复定义跨模块接口。

### 5.7 `data_model.md`

跨模块共享数据结构文件，必须定义：

- 共享实体；
- 共享枚举；
- 公共 ID；
- 跨模块 DTO；
- 可以暴露的字段；
- 禁止跨模块传播的敏感字段；
- 数据版本兼容策略。

### 5.8 `database_design.md`

项目级数据库设计文件，必须定义：

- 数据库类型；
- schema/库/表划分原则；
- 数据归属原则；
- 跨模块数据访问规则；
- 全局主键策略；
- 事务边界；
- 分库分表策略；
- 索引规范；
- 审计字段；
- 软删除规范；
- 多租户策略；
- 数据迁移策略；
- 备份恢复策略；
- 数据安全与脱敏规则。

模块内部表结构应写在模块级 `data_design.md`。

### 5.9 `event_flows.md`

事件流和跨模块业务流程文件，必须定义：

- Flow ID；
- 关联 REQ/AC；
- 参与模块；
- 步骤；
- publisher；
- subscriber；
- event schema；
- 状态变化；
- 失败补偿；
- 幂等键；
- 重试策略。

### 5.10 `distributed_design.md`

分布式设计文件，根据项目复杂度启用。它应定义：

- 服务发现；
- 服务调用协议；
- 超时规则；
- 重试规则；
- 熔断限流；
- 幂等设计；
- 降级策略；
- 分布式锁使用边界；
- 消息投递语义；
- 链路追踪要求。

### 5.11 `consistency_design.md`

一致性设计文件，根据项目复杂度启用。它应定义：

- 强一致场景；
- 最终一致场景；
- 本地事务边界；
- Saga；
- Outbox；
- TCC；
- 补偿任务；
- 对账策略；
- 异常恢复策略。

### 5.12 `deployment_design.md` / `infrastructure_design.md`

部署和基础设施设计文件，根据项目复杂度启用。它们应定义：

- 部署拓扑；
- 环境划分；
- 配置管理；
- 资源依赖；
- 外部服务；
- 网络边界；
- 负载均衡；
- 存储；
- 灾备；
- Kubernetes / 容器化资源。

### 5.13 `observability_design.md`

可观测性设计文件，根据项目复杂度启用。它应定义：

- 日志规范；
- 指标规范；
- 链路追踪；
- 业务埋点；
- 告警规则；
- dashboard；
- 错误定位证据要求。

### 5.14 `security_design.md`

安全设计文件，根据项目复杂度启用。它应定义：

- 认证；
- 授权；
- 权限模型；
- 密钥管理；
- 数据脱敏；
- 审计；
- 安全边界；
- 依赖安全；
- 合规要求。

### 5.15 `reliability_design.md`

可靠性设计文件，根据项目复杂度启用。它应定义：

- 高可用；
- 容灾；
- 降级；
- 限流；
- 故障隔离；
- 恢复策略；
- RTO/RPO；
- 容量规划。

### 5.16 `ci_cd_design.md`

CI/CD 设计文件，根据项目复杂度启用。它应定义：

- 构建流程；
- 测试流程；
- 发布流程；
- 回滚策略；
- 环境升级策略；
- 数据库迁移执行策略；
- 自动化验证要求。

### 5.17 `quality_attributes.md`

质量属性文件必须把“好用、稳定、安全、高性能、易维护”等抽象目标转成可验证场景。

它 MUST 定义：

- 质量属性名称；
- 业务场景；
- 触发条件；
- 可度量目标；
- 影响模块；
- 设计策略；
- 验证方式；
- 关联 REQ/AC/ADR/WI。

示例：

```text
QA-001 登录响应时间
- 场景：用户在工作时间登录系统。
- 目标：P95 响应时间 <= TBD，由用户确认。
- 影响模块：auth、frontend。
- 设计策略：限流、缓存、索引、登录失败保护。
- 验证方式：性能测试、运行指标。
```

### 5.18 `architecture_risks.md`

架构风险文件必须记录架构风险、技术债、假设和未决问题。

它 MUST 定义：

- Risk ID；
- 风险标题；
- 背景；
- 影响范围；
- 严重度；
- 发生概率；
- 检测方式；
- 缓解措施；
- 应急方案；
- Owner；
- 状态；
- 关联 REQ/AC/ADR/WI/Module。

重大架构变更 Work Item 在 Merge 前 MUST 更新 `architecture_risks.md`。未解决的高风险 MUST 写入 `merge_report.md`。

### 5.19 `crosscutting_concepts.md`

横切概念文件必须记录跨模块共同遵守的架构规则。

它不是替代 `api_contracts.md`、`database_design.md`、`security_design.md`、`observability_design.md`、`frontend_design.md` 的细节文件，而是这些专题规则的总索引和统一约束入口。

它 MUST 定义：

- API 规则；
- 数据规则；
- 安全规则；
- 可观测性规则；
- 前端交互规则；
- 错误处理规则；
- 合规规则；
- 相关 Gate。

模块级 `design.md` MUST 引用 `crosscutting_concepts.md` 中的规则，MUST NOT 在模块内私自定义冲突规则。

### 5.20 `diagrams/`

`project/diagrams/` 用于保存架构视图的辅助表达，包括 C1 System Context、C2 Container View、C3 Component View、Deployment View、Dynamic View 等。

图形资产 MAY 使用 Markdown 表格、Mermaid、PlantUML、Structurizr DSL、图片或外部模型引用。只要可行，图的源表示 SHOULD 存入仓库，避免只保存不可追溯的截图。

`diagrams/` MUST NOT 成为另一套规格真相。图必须引用正式规格文件，例如 `architecture.md`、`integration_design.md`、`deployment_design.md`、module `design.md`、`event_flows.md`。当图与正式规格冲突时，Gate MUST 要求修正，不能让两套内容长期并存。

典型文件：

```text
project/diagrams/c1_system_context.md
project/diagrams/c2_container_view.md
project/diagrams/c3_component_view_<module>.md
project/diagrams/deployment_view.md
project/diagrams/dynamic_view_<flow>.md
```

### 5.17 `project/decisions/` 与 ADR 文件

`project/decisions/` 是项目级架构决策记录目录。它 MUST 保存所有 Accepted ADR，并通过 `decision_log.md` 建立索引。

目录结构：

```text
project/decisions/
  decision_log.md
  ADR-0001-use-modular-monolith.md
  ADR-0002-split-auth-from-core.md
```

`decision_log.md` MUST 包含：

| 字段 | 要求 |
|---|---|
| ADR ID | MUST 唯一 |
| Title | MUST 描述决策主题 |
| Status | MUST 为 Proposed / Accepted / Superseded / Deprecated / Rejected |
| Date | MUST 记录决策日期 |
| WI | MUST 关联触发 Work Item |
| Affected Modules | SHOULD 记录受影响模块 |
| Supersedes | MAY 指向被替代 ADR |
| Superseded By | MAY 指向替代它的新 ADR |

每个 ADR 文件 MUST 包含：

```text
1. Status
2. Date
3. Work Item
4. Decision Scope
5. Context
6. Problem
7. Options Considered
8. Decision
9. Rationale
10. Consequences
11. Trade-offs
12. Validation
13. Rollback / Supersession Strategy
14. Trace
15. Links
```

ADR 文件 MUST 只记录一个决策。Accepted ADR MUST NOT 被原地改写以改变决策；如果决策变化，MUST 新建 ADR 并声明 `supersedes`。


---

## 6. 模块级规格文件标准

### 6.1 `module.json`

必须包含：

- module_id；
- name；
- prefix；
- status；
- responsibility；
- out_of_scope；
- bounded_context；
- owned_data；
- context_relationships；
- requirements_file；
- design_file；
- data_design_file；
- trace_file。

### 6.2 `requirements.md`

模块需求文件必须保存该模块当前完整需求。

要求：

- REQ ID 必须带模块前缀，如 `AUTH-REQ-1`；
- AC ID 必须带模块前缀，如 `AUTH-AC-1.1`；
- 每个 REQ 必须有 User Story 或等价业务描述；
- 每个 REQ 必须有 AC；
- 每个 modified/deprecated 需求必须记录 last_changed_by；
- 迁移来的需求必须记录 migrated_from。

### 6.3 `design.md`

模块设计文件必须保存该模块内部设计。

它应包含：

- 模块职责；
- 不负责范围；
- 内部组件；
- 内部流程；
- 内部数据；
- 使用的项目级 API/Data/Event/Flow；
- 关联 REQ/AC；
- 主要异常处理；
- 模块级非功能约束。

模块设计不得重新定义跨模块接口、共享数据结构和事件流；必须引用项目级契约。

### 6.4 `data_design.md`

模块数据设计文件应包含：

- 模块内部表；
- 字段；
- 主键；
- 索引；
- 唯一约束；
- 模块内部实体关系；
- 数据生命周期；
- 与项目级数据库设计的符合性说明。

### 6.5 `trace.md`

模块 Trace 文件必须记录：

- REQ；
- AC；
- DD；
- API/Event/Data refs；
- Code；
- Test；
- Evidence；
- Last WI；
- Status。

---

## 7. Work Item 标准

### 7.1 Work Item 目录

```text
.specforge/work-items/WI-012/
  work_item.json
  intake.md
  brainstorming.md
  impact_analysis.md
  requirements_delta.md
  design_delta.md
  architecture_delta.md
  options_analysis.md
  quality_attribute_analysis.md
  resilience_analysis.md
  architecture_evolution_plan.md
  fitness_function_delta.md
  deprecation_plan.md
  architecture_drift_report.md
  adr_draft.md
  tasks.md
  trace_delta.md
  evidence/
  review_report.md
  verification_report.md
  merge_report.md
```


### 7.1B `resilience_analysis.md`

当 Work Item 新增或修改跨进程调用、外部系统依赖、异步事件、后台任务、数据同步、最终一致性或分布式失败治理时，MUST 生成 `resilience_analysis.md`。

它必须回答：

- 本次变更有哪些跨边界交互；
- 每个交互是同步还是异步；
- 可能出现哪些失败模式；
- 每个失败模式如何检测、处理、恢复；
- 是否需要 timeout、retry、backoff、circuit breaker、rate limit、bulkhead、idempotency、Outbox、Saga、dead letter、reconciliation；
- 失败治理结果更新哪些项目级设计文件；
- 需要哪些测试、验证和 evidence；
- 中高风险是否进入 `architecture_risks.md`；
- 重大模式是否需要 ADR 和 ATAM。


### 7.1C 架构演进相关文件

当 Work Item 涉及模块边界、服务边界、部署模型、数据所有权、API/Event/Data Contract、架构路线图、适应度函数、架构风险或废弃旧能力时，MUST 生成演进相关文件。

- `architecture_evolution_plan.md`：记录当前状态、目标状态、增量步骤、验证方式、回退策略、Exit Criteria。
- `fitness_function_delta.md`：记录本次变更新增、修改或删除的 Fitness Function，以及预期结果和证据。
- `deprecation_plan.md`：记录旧接口、事件、模块、数据、配置或部署单元的废弃、迁移、兼容期和删除条件。
- `architecture_drift_report.md`：记录规格、代码、依赖、数据所有权、运行行为或观测能力相对已接受架构的偏离。

这些文件 MUST 与 `architecture_roadmap.md`、`fitness_functions.md`、`deprecation_policy.md`、ADR、ATAM、Trace、Gate 和 `merge_report.md` 保持一致。


### 7.2 `work_item.json`

必须包含：

- work_item_id；
- type；
- title；
- status；
- affected_modules；
- affected_project_docs；
- changed_specs；
- project_spec_version_before；
- project_spec_version_after。

### 7.3 `impact_analysis.md`

必须回答：

- 影响哪些模块；
- 是否影响项目级设计；
- 是否新增接口；
- 是否新增数据结构；
- 是否新增事件流；
- 是否影响数据库；
- 是否影响部署；
- 是否涉及架构边界变化；
- 是否涉及模块拆分、合并、重命名或边界调整。


### 7.4 `domain_analysis.md`

当 Work Item 新增或改变业务能力、领域概念、业务规则、核心数据归属或上下文关系时，MUST 生成 `domain_analysis.md`。

它必须回答：

- 本次变更涉及哪些业务能力；
- 涉及哪些领域概念和术语；
- 是否出现同名不同义或不同名同义；
- 涉及哪些业务规则；
- 涉及哪些核心数据；
- 数据 owner 是否变化；
- 是否需要更新 `domain_model.md`、`glossary.md`、`data_model.md`、`database_design.md`。

### 7.5 `module_boundary_analysis.md`

当 Work Item 新增模块、拆分模块、合并模块、重命名模块、移动需求或调整模块职责时，MUST 生成 `module_boundary_analysis.md`。

它必须记录：

- 候选模块边界；
- 模块拆分/合并/保持现状的候选方案；
- 业务能力依据；
- 规则内聚依据；
- 数据所有权依据；
- 上下文关系；
- 变化频率；
- 接口边界；
- 维护责任；
- 部署边界；
- 复杂度收益；
- 是否需要 ADR、ATAM、migration map。

### 7.6 `requirements_delta.md`

必须只记录本次需求变更，不保存完整需求。

必须区分：

- Added Requirements；
- Modified Requirements；
- Deprecated Requirements；
- Migrated Requirements；
- Affected ACs；
- Rationale。

### 7.7 `design_delta.md`

必须只记录本次设计变更。

必须区分：

- Project-level Design Changes；
- Module Design Changes；
- API Changes；
- Data Model Changes；
- Database Changes；
- Event/Flow Changes；
- Deployment/Infrastructure Changes；
- Risks。

### 7.5A `options_analysis.md`

当存在多个可行方案、重大架构选择或 `adr_required = true` 时，MUST 生成。

必须包含：

- 保持现状 / 最小修改方案；
- 推荐方案；
- 更复杂或替代方案；
- 每个方案的适用条件、优点、缺点、成本、风险；
- 推荐方案和不推荐其他方案的理由。

### 7.5B `quality_attribute_analysis.md`

当 `quality_attribute_analysis_required = true` 时，MUST 生成。

必须包含：

- 相关质量属性；
- 候选方案；
- 质量属性影响矩阵；
- sensitivity points；
- trade-off points；
- 中高风险及缓解措施；
- 验证计划；
- 输入 ADR 的推荐结论。

### 7.8 `architecture_delta.md`

当本次变更涉及模块拆分、合并、重命名、边界调整、技术架构变更时，必须生成。

必须包含：

- Before；
- After；
- Change Reason；
- Affected Modules；
- Migration Plan；
- Compatibility Strategy；
- Rollback Strategy；
- User Approval Record。

### 7.9 `options_analysis.md`

当 Work Item 涉及重要架构选择时，MUST 生成。

必须包含：

- 决策问题；
- 保持现状 / 最小修改方案；
- 推荐方案；
- 更复杂或替代方案；
- 每个方案的优点、缺点、风险、成本、影响范围；
- 质量属性权衡；
- 推荐结论；
- 为什么不采用其他方案。

### 7.8 `adr_draft.md`

当 `impact_analysis.md` 判定 `adr_required = true` 时，MUST 生成。

`adr_draft.md` MUST 使用 ADR 模板，并在 ADR Gate 和用户确认通过后，才 MAY 合并为 `project/decisions/ADR-XXXX-title.md`。

### 7.9 `merge_report.md`

必须记录：

- 合并文件列表；
- 合并前版本；
- 合并后版本；
- Gate 结果；
- 用户确认记录；
- Trace 更新；
- 证据路径；
- 未解决风险；
- 后续工作。

---

## 8. AI 架构设计原则

AI 在设计模块、架构、接口、数据库、事件流、云原生部署时，必须遵循以下原则。

### 8.1 先满足当前复杂度，避免过度设计

AI 不得因为项目未来可能变大，就提前引入微服务、复杂分布式事务、多级模块、复杂云原生部署。

小项目默认使用 `core` 模块。

只有出现明确依据时，才拆模块或引入复杂架构。

依据包括：

- 业务职责明显分离；
- 数据归属不同；
- 变更频率不同；
- 维护责任不同；
- 性能/可靠性要求不同；
- 部署生命周期不同；
- 单个规格文件过大；
- 修改冲突频繁；
- Agent 上下文无法承载。

### 8.2 模块按业务能力拆分，不能只按技术层拆分

推荐模块划分依据：

- 业务能力；
- 数据所有权；
- 领域边界；
- 外部接口边界；
- 变更频率；
- 维护职责；
- 部署边界。

不推荐只按技术层拆成：

```text
controller-module
service-module
dao-module
```

技术层可以在模块内部设计中体现，不应作为默认模块边界。

### 8.3 高内聚、低耦合

一个模块内部的需求、数据、组件应该围绕同一个业务职责。

如果一个模块中出现多个长期独立变化的职责，应该考虑拆分。

如果两个模块频繁互相访问内部数据、频繁同步修改、边界不清，则应考虑合并或重新划分边界。

### 8.4 数据所有权必须明确

每个核心数据实体必须有 owner module。

规则：

- 模块只能直接写自己拥有的数据；
- 跨模块读取应通过 API、事件投影或共享只读视图；
- 跨模块写操作必须通过 owner module 的接口或事件；
- 微服务场景下禁止跨服务直接写库；
- 跨模块共享结构必须在 `data_model.md` 定义。

### 8.5 契约优先

跨模块连接必须通过契约表达。

契约包括：

- API contract；
- Event contract；
- Shared data model；
- Flow definition；
- Error code；
- Version compatibility。

模块设计只能引用契约，不应私自定义跨模块协议。

### 8.6 依赖必须显式

模块依赖必须在 `architecture.md` 或 `integration_design.md` 中声明。

禁止隐式依赖，例如：

- 模块直接读另一个模块表；
- 模块复制另一个模块私有结构；
- 模块通过未登记接口调用另一个模块；
- 模块订阅未登记事件。

### 8.7 设计必须可追溯

所有设计决策必须能追溯到：

- REQ/AC；
- 质量属性；
- 技术约束；
- 风险；
- 用户确认；
- Work Item。

没有依据的设计不应进入正式规格。

### 8.8 架构必须可演进

AI 不应假设第一次模块划分永远正确。

设计时必须考虑：

- 模块拆分；
- 模块合并；
- 模块重命名；
- ID 迁移；
- trace 迁移；
- 接口兼容；
- 数据迁移；
- 回滚策略。

### 8.9 设计要留证据

AI 做出重要设计选择时，必须记录到：

```text
project/decisions/
```

或当前 Work Item 的：

```text
architecture_delta.md
design_delta.md
merge_report.md
```

---

## 9. 模块拆分决策标准

### 9.1 什么时候不拆模块

满足以下情况时，SHOULD 保持 `core` 或当前模块：

- 项目很小；
- 需求数量少；
- 模块职责尚未稳定；
- 数据实体少；
- 维护人力少；
- 部署不需要独立；
- 拆分后接口成本高于收益；
- 拆分依据只是“看起来以后可能会大”。

### 9.2 什么时候应该拆模块

出现以下信号时，SHOULD 提出模块拆分建议：

- 单个模块出现两个以上稳定业务能力；
- 单个模块需求文件过大；
- 单个模块设计文件过大；
- 不同需求经常修改不同代码区域；
- 数据实体已经形成独立所有权；
- 跨责任方协作冲突明显；
- 某一部分需要独立部署或独立扩展；
- 某一部分可靠性或安全要求明显不同；
- Agent 处理上下文经常超限。

### 9.3 拆分判断矩阵

AI 提议拆分模块前，必须输出判断矩阵：

| 维度 | 问题 | 结果 |
|---|---|---|
| 业务职责 | 是否存在清晰独立业务能力 | 是/否 |
| 数据归属 | 是否有独立数据 owner | 是/否 |
| 变更频率 | 是否独立变化 | 是/否 |
| 接口边界 | 是否可以定义稳定契约 | 是/否 |
| 部署需求 | 是否需要独立部署/扩展 | 是/否 |
| 维护责任 | 是否由不同 owner/maintainer 负责 | 是/否 |
| 复杂度收益 | 拆分收益是否大于治理成本 | 是/否 |

只有有足够依据时，才应进入 architecture_refactor 流程。

### 9.4 什么时候应该合并模块

出现以下情况，AI 应提出合并建议：

- 两个模块职责长期重叠；
- 两个模块经常同步变更；
- 接口调用过密；
- 数据边界无法稳定；
- 拆分带来的复杂度超过收益；
- 模块长期没有独立演进价值。

---

## 10. 架构演进标准

### 10.1 架构变更必须走流程

以下变化必须走 Work Item：

- 新增模块；
- 拆分模块；
- 合并模块；
- 重命名模块；
- 调整模块职责；
- 移动需求或设计到其他模块；
- 修改跨模块接口；
- 修改共享数据结构；
- 修改事件流；
- 修改部署边界；
- 从单体演进为微服务；
- 从本地部署演进为云原生部署。

禁止手工直接改项目规格文件。

### 10.2 架构变更 WI 类型

建议定义：

```text
architecture_refactor
```

用于处理：

- 模块拆分；
- 模块合并；
- 模块重命名；
- 模块边界调整；
- 数据所有权迁移；
- 接口契约迁移；
- 事件流迁移；
- 技术架构调整。

### 10.3 模块拆分流程

```text
intake
→ architecture_impact_analysis
→ module_split_plan
→ module_split_plan_gate
→ user_approval
→ requirements_migration
→ requirements_migration_gate
→ design_migration
→ design_migration_gate
→ trace_migration
→ trace_migration_gate
→ project_manifest_update
→ tasks
→ review
→ verification
→ merge_report
→ completed
```

### 10.4 模块拆分文件

```text
work-items/WI-030/
  work_item.json
  architecture_impact_analysis.md
  module_split_plan.md
  requirements_migration_map.md
  design_migration_map.md
  data_migration_map.md
  api_migration_map.md
  trace_migration_map.md
  tasks.md
  review_report.md
  verification_report.md
  merge_report.md
```

### 10.5 ID 迁移策略

模块拆分时有两种 ID 策略。

#### 策略 A：保留旧 ID

优点：

- 历史 trace 稳定；
- 代码引用不用大改；
- 迁移风险低。

缺点：

- ID 前缀与新模块不一致。

#### 策略 B：生成新 ID，并记录别名

示例：

```text
CORE-REQ-1 → AUTH-REQ-1
CORE-AC-1.1 → AUTH-AC-1.1
CORE-DD-1 → AUTH-DD-1
```

优点：

- 模块归属清楚；
- 长期更干净。

缺点：

- 必须维护 alias 和迁移映射。

推荐默认使用策略 B，但必须记录：

```text
old_id
new_id
migration_reason
migrated_by
last_changed_by
alias
```

模块规格中必须写：

```text
migrated_from: CORE-REQ-1
last_changed_by: WI-030
```

### 10.6 迁移映射要求

`requirements_migration_map.md` 必须记录：

| Old ID | Old Module | New ID | New Module | Action |
|---|---|---|---|---|
| CORE-REQ-1 | core | AUTH-REQ-1 | auth | moved |

`design_migration_map.md` 必须记录：

| Old DD | New DD | From | To | Action |
|---|---|---|---|---|
| CORE-DD-1 | AUTH-DD-1 | core/design.md | auth/design.md | moved |

`trace_migration_map.md` 必须记录：

| Old REQ | New REQ | Old AC | New AC | Old DD | New DD | Code | Test |
|---|---|---|---|---|---|---|---|
| CORE-REQ-1 | AUTH-REQ-1 | CORE-AC-1.1 | AUTH-AC-1.1 | CORE-DD-1 | AUTH-DD-1 | src/auth/login.ts | tests/auth/login.test.ts |

---

## 11. 数据库设计标准

### 11.1 数据库设计分层

项目级：

```text
project/database_design.md
project/data_model.md
```

模块级：

```text
project/modules/<module>/data_design.md
```

Work Item：

```text
work-items/<WI>/design_delta.md
work-items/<WI>/data_migration_map.md
```

### 11.2 项目级数据库设计

必须定义：

- 数据库选型；
- 数据归属；
- 事务策略；
- 跨模块访问规则；
- 主键规范；
- 索引规范；
- 审计字段；
- 软删除策略；
- 多租户策略；
- 分库分表；
- 备份恢复；
- 数据迁移；
- 数据安全。

### 11.3 模块级数据库设计

必须定义：

- 表结构；
- 字段；
- 主键；
- 外键或逻辑引用；
- 索引；
- 约束；
- 数据生命周期；
- 与项目级规则的一致性。

### 11.4 数据库 Gate

必须检查：

- 表名是否符合规范；
- 主键是否符合规范；
- 跨模块外键是否违反规则；
- 共享字段是否在 `data_model.md` 定义；
- 数据迁移是否有回滚策略；
- 数据安全字段是否受控。

---

## 12. 分布式、微服务、云原生适配标准

### 12.1 单体系统

默认结构：

```text
project/modules/core/
```

项目级设计可保持较轻，但仍应保留：

- architecture.md；
- database_design.md；
- deployment_design.md。

### 12.2 分层单体

模块代表业务域，不一定独立部署。

示例：

```text
project/modules/user/
project/modules/order/
project/modules/report/
```

### 12.3 微服务系统

模块可映射为服务。

必须强化：

- api_contracts.md；
- event_flows.md；
- data_model.md；
- database_design.md；
- distributed_design.md；
- consistency_design.md；
- observability_design.md；
- deployment_design.md。

### 12.4 云原生系统

必须强化：

- infrastructure_design.md；
- deployment_design.md；
- observability_design.md；
- reliability_design.md；
- security_design.md；
- ci_cd_design.md。

可以增加：

```text
kubernetes_design.md
helm_design.md
resource_policy.md
```

### 12.5 数据平台

模块可以是：

- ingestion；
- ods；
- dwd；
- dws；
- ads；
- reporting。

应增加：

- data_pipeline_design.md；
- data_quality_design.md；
- data_lineage.md；
- metadata_design.md。

### 12.6 工业控制 / IoT

模块可以是：

- device-adapter；
- protocol-gateway；
- realtime-monitor；
- alarm-engine；
- historian。

应增加：

- protocol_design.md；
- realtime_design.md；
- device_model.md；
- edge_deployment_design.md。

### 12.7 AI 应用

模块可以是：

- prompt-engine；
- retrieval；
- model-gateway；
- evaluation；
- workflow-orchestrator。

应增加：

- model_design.md；
- prompt_policy.md；
- evaluation_design.md；
- data_security_design.md。

---

## 13. 标准工作流

### 13.1 新功能流程

```text
intake
→ project_context_load
→ brainstorming
→ impact_analysis
→ requirements_delta
→ requirements_delta_gate
→ requirements_candidate
→ requirements_candidate_gate
→ requirements_approval
→ requirements_merge
→ design_delta
→ design_delta_gate
→ design_candidate
→ design_candidate_gate
→ design_approval
→ design_merge
→ tasks
→ tasks_gate
→ development
→ review
→ verification
→ trace_update
→ merge_report
→ completed
```

### 13.2 修改已有功能流程

必须先定位受影响模块和既有 REQ/AC/DD，再生成 delta。

禁止把修改写成一个新的孤立需求。

### 13.3 跨模块功能流程

一个跨模块功能仍然只有一个 Work Item。

该 WI 必须记录：

- affected_modules；
- affected_project_docs；
- changed_specs；
- project-level design changes；
- module-level design changes。

### 13.4 架构变更流程

架构变更必须使用 `architecture_refactor` 或等价流程。

用户确认点至少包括：

- 模块拆分/合并/重命名方案确认；
- 需求迁移确认；
- 设计迁移确认；
- 最终合并确认。

---

## 14. Gate 标准

### 14.1 Project Manifest Gate

检查：

- manifest 存在；
- module_id 唯一；
- prefix 唯一；
- 文件存在；
- 模块状态合法；
- 索引引用一致。

### 14.2 Requirements Gate

检查：

- REQ/AC ID 合法；
- ID 唯一；
- AC 不孤立；
- 修改引用存在；
- 废弃有 reason；
- 迁移有 migrated_from；
- candidate 是完整模块需求。

### 14.3 Design Gate

检查：

- DD ID 合法；
- DD 引用存在的 REQ/AC；
- 模块设计引用的 API/Data/Event 存在；
- 项目级设计文件被正确更新；
- 跨模块依赖在 integration_design 中声明。

### 14.4 API Contract Gate

检查：

- API ID 唯一；
- owner_module 存在；
- consumer_modules 存在；
- request/response 定义完整；
- error code 定义完整；
- breaking change 有版本策略。

### 14.5 Data Gate

检查：

- 共享数据结构定义存在；
- 敏感字段没有违规暴露；
- 模块数据归属清楚；
- 数据迁移有策略；
- 跨模块数据访问不违规。

### 14.6 Event Flow Gate

检查：

- Event ID 唯一；
- publisher 存在；
- subscribers 存在；
- event schema 完整；
- 幂等键存在；
- 失败补偿存在。

### 14.7 Architecture Refactor Gate

检查：

- 拆分/合并理由充分；
- 职责边界清楚；
- 新模块 prefix 唯一；
- old ID 到 new ID 映射完整；
- trace 不断链；
- manifest/index 更新；
- 用户确认记录存在。



### 14.7B Service Boundary Gate

Service Boundary Gate 检查模块是否有资格升级为独立服务，以及服务化后的数据、契约、部署、观测、CI/CD、Owner、SLO 和迁移计划是否完整。

检查项：

- 是否存在 `service_candidate_analysis.md`；
- 是否说明为什么模块化单体不够；
- 是否有清晰业务能力和 DDD 边界；
- 是否有明确 owned_data；
- 是否禁止其他服务直接写该服务数据；
- 是否有 API/Event 契约；
- 是否定义错误码、版本和兼容策略；
- 是否定义跨服务一致性策略；
- 是否更新 `observability_design.md`；
- 是否更新 `deployment_design.md` / `ci_cd_design.md`；
- 是否有服务级 SLO；
- 是否有 Owner；
- 是否有 ADR；
- 是否有 ATAM 权衡分析；
- 是否有迁移计划和回滚策略；
- 是否更新 `service_catalog.md`；
- 是否没有把 Module、Bounded Context、C4 Container、UI Page 直接等同为 Microservice。

Gate MUST fail when a Work Item proposes microservices without service candidate analysis, ADR, ATAM, service ownership, data ownership, contract definition, observability, deployment plan, and rollback strategy.


### 14.7C Resilience Pattern Gate

Resilience Pattern Gate 检查跨边界调用、外部依赖、异步事件、后台任务、数据同步和最终一致性场景是否显式设计失败治理、恢复策略、幂等策略、观测字段和验证方式。

检查项：

- 是否应该触发 `resilience_analysis.md`；
- 是否识别所有跨边界交互；
- 是否识别 timeout、connection failure、partial success、duplicate request、duplicate event、message lost、message delayed、downstream unavailable、data inconsistency、compensation failure 等失败模式；
- 每个远程调用是否定义 timeout；
- retry 是否定义 max attempts、backoff、jitter、retryable error classification、total duration；
- retry 是否考虑 idempotency 和 retry storm；
- 是否需要 circuit breaker、rate limit、bulkhead；
- 异步事件是否定义 event_id、idempotency_key、delivery semantics、dead letter、replay；
- 是否需要 Outbox；
- 是否需要 Saga / compensation；
- 最终一致性是否定义 reconciliation、audit 和 manual intervention；
- 是否更新 `integration_design.md`、`event_flows.md`、`consistency_design.md`、`reliability_design.md`、`observability_design.md`；
- 是否有验证计划、`verification_report.md` 和 `evidence/`；
- 中高风险是否进入 `architecture_risks.md`；
- 是否与 ADR、ATAM、Service Boundary Plan、candidate design 和 `merge_report.md` 一致。

Gate MUST fail when a cross-boundary design only describes the successful path, defines retry without bounded policy and idempotency, defines asynchronous events without dead letter/replay strategy, or defines eventual consistency without compensation or reconciliation.

### 14.7D SRE / Operational Readiness Gate

SRE / Operational Readiness Gate 检查关键用户旅程、服务、部署单元、后台任务、外部依赖和高风险发布是否具备可度量的可靠性目标、错误预算、告警、Runbook、事故响应、运行就绪和 evidence。

Gate MUST 检查：

1. 是否应该触发 `sre_impact_analysis.md`；
2. 关键用户旅程是否定义 SLI / SLO；
3. SLO 是否有明确测量来源、统计窗口和 Good/Bad Event；
4. 是否定义 Error Budget 和错误预算消耗策略；
5. 告警是否面向用户可感知症状，且有 severity、receiver、runbook；
6. `observability_design.md` 是否包含 logs / metrics / traces / dashboards；
7. `release_strategy.md` 是否说明错误预算对发布、冻结、回滚和审批的影响；
8. `incident_response.md` 是否定义事故等级、响应角色、升级路径和复盘模板；
9. `operational_readiness.md` 是否有上线前检查、阻塞项、接受风险和 evidence；
10. 验证计划是否进入 `tasks.md`、`verification_report.md` 和 `evidence/`。

Gate MUST fail when reliability claims lack measurable targets, owners, alerting rules, runbooks, or evidence.

### 14.8 Merge Gate

检查：

- candidate gate pass；
- 用户确认 pass；
- merge_report 存在；
- trace 已更新；
- project_spec_version 已递增；
- hash 一致。

---

### 14.9 Architecture Structure Gate

检查 `architecture.md` 是否包含 arc42 化的总纲章节：

- Architecture Goals；
- Stakeholders and Concerns；
- Constraints；
- System Context and Scope；
- Solution Strategy；
- Building Block Overview；
- Runtime Overview；
- Deployment Overview；
- Crosscutting Concepts；
- Quality Attribute Summary；
- Architecture Risks；
- Decision References。

缺少核心章节时，Gate MUST NOT pass。

### 14.10 Context Gate

检查：

- 是否定义系统边界；
- 是否定义用户角色；
- 是否定义外部系统；
- 是否定义上下游接口；
- 是否说明哪些职责不属于本系统；
- 是否避免把外部系统能力误写成本系统内部能力。

### 14.11 Building Block Gate

检查：

- 每个模块是否在 `spec_manifest.json` 注册；
- 每个模块是否有 responsibility 和 out_of_scope；
- 模块依赖是否显式；
- 模块数据 owner 是否明确；
- 代码目录是否能映射到模块、shared 或 platform；
- 是否存在仅按技术层、页面名或表名拆模块的违规情况。

### 14.12 Runtime Flow Gate

检查：

- 关键用户旅程是否有运行时流程；
- 跨模块流程是否有参与模块；
- 主流程、替代流程、异常流程是否完整；
- 失败处理、重试、幂等、补偿是否定义；
- 流程是否关联 REQ/AC/API/Data/Test/Evidence。

### 14.13 Crosscutting Concept Gate

检查：

- 错误处理规则是否统一；
- 权限规则是否统一；
- 日志和 Trace 规则是否统一；
- 审计规则是否统一；
- API 规则是否统一；
- 数据字段规则是否统一；
- 前端交互规则是否统一；
- 模块设计是否只引用横切规则，未私自覆盖。

### 14.14 Risk Gate

检查：

- 重大架构变更是否识别风险；
- 高风险是否有缓解措施和 Owner；
- 未解决风险是否进入 `merge_report.md`；
- 风险是否关联 WI/ADR/REQ/Module；
- 风险状态是否可追踪。

### 14.15 ADR Gate

ADR Gate 检查重要架构决策是否可审查、可追溯、可替代。

检查：

- 是否应该生成 ADR；
- ADR ID 是否唯一；
- Status 是否合法；
- 是否关联 Work Item；
- 是否说明 Context；
- 是否说明 Problem；
- 是否列出候选方案；如只有一个方案，是否说明原因；
- 是否说明 Decision；
- 是否说明 Rationale；
- 是否说明 Consequences；
- 是否说明 Trade-offs；
- 是否说明 Validation；
- 是否说明 Rollback / Supersession Strategy；
- 是否引用相关 REQ/AC/Design/API/Data/Event/Deployment/Risk/Test；
- 是否更新 `decision_log.md`；
- 是否和 project/module candidate 一致；
- 如果替代旧 ADR，`supersedes` / `superseded_by` 是否双向一致；
- Accepted ADR 是否未被原地改写改变决策。


### 14.16 Quality Attribute / ATAM Gate

Quality Attribute / ATAM Gate 检查重要设计是否经过质量属性权衡分析，防止 AI 只写方案收益、不写代价和风险。

检查：

- 是否应该触发 ATAM；
- 当 `quality_attribute_analysis_required = true` 时，`quality_attribute_analysis.md` 是否存在；
- 是否识别相关质量属性；
- 是否比较候选方案；如只有一个方案，是否说明原因；
- 是否明确性能、安全、可靠性、可用性、可维护性、可扩展性、成本、交付速度、运维性、用户体验等影响；
- 是否识别 sensitivity points；
- 是否识别 trade-off points；
- 是否识别风险并把中高风险写入 `architecture_risks.md`；
- 是否定义验证方式；
- 是否更新 `quality_attributes.md`、`reliability_design.md`、`security_design.md`、`observability_design.md`、`deployment_design.md` 等相关文件；
- 是否与 `options_analysis.md`、`adr_draft.md` 和 candidate design 一致；
- 未解决风险是否进入 `merge_report.md`。


### 14.17 Domain Boundary Gate

Domain Boundary Gate 检查模块边界是否基于业务能力、领域概念、规则内聚、数据所有权和上下文关系，而不是基于技术层、页面、表或代码目录。

检查：

- 是否应该触发领域边界分析；
- 当业务能力、模块职责、核心数据归属或上下文关系变化时，`domain_analysis.md` 是否存在；
- 当新增、拆分、合并、重命名或调整模块边界时，`module_boundary_analysis.md` 是否存在；
- 是否更新 `domain_model.md`；
- 是否更新 `context_map.md`；
- 是否更新 `glossary.md`；
- 模块是否有清晰 `responsibility` 和 `out_of_scope`；
- 核心数据是否有 `owner_module`；
- 是否存在跨模块直接写数据；
- 是否把 UI 页面、数据库表、技术层或代码目录误当模块；
- 是否定义上下文关系和集成方式；
- 是否需要 API/Event/Data contract；
- 是否需要 ADR；
- 是否需要 ATAM；
- 如果拆分、合并或迁移模块，migration map 是否完整；
- Trace 是否能从 REQ/AC 追溯到 Domain、Module、Design、Code、Test。

### 14.18 C4 Level Gate

检查：

- AI 是否判断本次变更影响 C1/C2/C3/C4 哪些层级；
- 是否在 C1 未明确时直接进入 C2/C3/C4；
- 是否从用户需求直接跳到代码级类、函数、文件；
- 是否把 UI Page 当成 Module；
- 是否把 SpecForge Module 当成 C4 Container 或微服务；
- 是否把 C4 Container 当成 Docker Container；
- 是否把 Component 直接等同于代码文件；
- 是否在无必要时输出低价值代码级设计。

### 14.19 Container Gate

检查：

- 每个 C4 Container 是否有职责；
- 每个 Container 是否说明技术类型；
- 每个 Container 是否说明通信方式；
- 每个 Container 是否映射到部署设计或明确说明暂不涉及部署变化；
- 数据存储是否明确；
- 外部依赖是否明确；
- Container 和 SpecForge Module 的关系是否说明。

### 14.20 Component Gate

检查：

- 组件是否属于明确模块或容器；
- 组件职责是否清楚；
- 组件之间依赖是否合理；
- 组件是否引用已有 API/Data/Event 契约；
- 组件是否追溯到 REQ/AC；
- 组件是否没有越权访问其他模块内部数据；
- 组件是否没有反向决定模块边界。

### 14.21 Code View Gate

检查：

- 是否确实需要代码级设计；
- 代码结构是否映射到模块和组件；
- 代码迁移是否有 migration map；
- 代码引用是否进入 trace；
- 是否避免提前设计低价值类名和函数名；
- C4 Code View 是否仅进入 Work Item、Task、Trace 或 Verification，而不是污染长期项目级架构总纲。



### 14.18 Architecture Evolution Gate

SpecForge MUST 增加 `Architecture Evolution Gate`，用于检查架构演进是否受目标引导、增量执行、可验证、可回退、可追溯。

该 Gate MUST 检查：

- 是否应该触发 `architecture_evolution_plan.md`；
- 是否说明当前状态和目标状态；
- 是否关联 `architecture_roadmap.md`；
- 是否以 Work Item 为原子演进单元；
- 是否定义 incremental steps；
- 是否每一步都有验证方式；
- 是否每一步都有回退或替代策略；
- 是否更新 `fitness_functions.md`；
- 是否存在 architecture drift；
- 是否更新 `deprecation_policy.md`；
- 是否有迁移计划；
- 是否有 ADR；
- 是否有 ATAM；
- 是否更新 `trace_matrix.md`；
- 是否更新 `merge_report.md`；
- 是否没有绕过既有 ADR 和 Gate；
- 是否能证明本次变更更接近已接受目标架构，或通过 ADR/ATAM 记录了被接受的取舍。

Gate MUST fail when architecture evolution lacks target state, incremental steps, verification, rollback/fallback, trace impact, or merge evidence.


## 15. AI 操作协议

AI 在任何设计任务中必须执行以下步骤。

### 15.1 读取项目上下文

必须读取：

- spec_manifest.json；
- requirements_index.md；
- design_index.md；
- architecture.md；
- glossary.md；
- 相关模块 requirements/design；
- 相关项目级设计文件。

不得只根据用户一句话直接设计模块。

### 15.2 做影响分析

必须输出：

- affected_modules；
- affected_project_docs；
- affected_requirements；
- affected_designs；
- affected_data；
- affected_apis；
- affected_events；
- architecture_change_required。


### 15.3 使用 C4 控制设计颗粒度

AI 在架构设计任务中 MUST 使用 C4 判断当前设计应该处于哪个抽象层级。

AI MUST 输出 C4 层级影响摘要：

```text
C1 System Context Impact: Yes/No + reason
C2 Container Impact: Yes/No + reason
C3 Component Impact: Yes/No + reason
C4 Code Impact: Yes/No + reason
```

AI MUST 先完成 C1 系统边界判断，再进入 C2 运行单元判断；MUST 先说明 C2 容器和运行单元关系，再进入 C3 模块/组件内部设计；MAY 只在代码结构影响架构、迁移、Trace、安全、性能、可维护性或任务规划时进入 C4。

AI MUST NOT：

- 从用户需求直接跳到类名、函数名、文件名；
- 把 UI 页面当成模块；
- 把 SpecForge Module 当成 C4 Container；
- 把 C4 Container 当成 Docker Container；
- 用 C4 作为唯一模块拆分依据。


### 15.4 做质量属性权衡分析

AI 在 `impact_analysis.md` 阶段 MUST 判断是否需要质量属性分析，并输出：

```text
quality_attribute_analysis_required: Yes/No + reason
affected_quality_attributes: performance/security/reliability/availability/maintainability/scalability/cost/delivery_speed/operability/user_experience
```

以下情况 MUST 生成 `quality_attribute_analysis.md`：

- 架构模式、模块边界、部署单元、数据一致性策略、安全边界、可靠性目标、性能目标发生变化；
- 存在多个候选方案并且质量属性影响不同；
- `adr_required = true` 且决策涉及质量属性取舍。

AI MUST NOT 只描述方案优点。AI MUST 比较候选方案对性能、安全、可靠性、可维护性、成本、交付速度和用户体验等质量属性的影响，并输出风险、取舍和验证计划。

ATAM 结果 MUST 输入：

- `adr_draft.md`；
- candidate design；
- `architecture_risks.md`；
- `tasks.md`；
- `verification_report.md` / `evidence/`；
- `merge_report.md`。


### 15.5 做领域边界分析

当 Work Item 新增或改变业务能力、模块职责、核心数据归属、业务规则、上下文关系，或提出模块新增/拆分/合并/重命名时，AI MUST 做领域边界分析。

AI 在 `impact_analysis.md` 阶段 MUST 输出：

```text
domain_analysis_required: Yes/No + reason
module_boundary_analysis_required: Yes/No + reason
affected_business_capabilities:
affected_domain_concepts:
affected_owned_data:
affected_contexts:
```

如果 `domain_analysis_required = Yes`，AI MUST 生成或更新：

- `work-items/<WI>/domain_analysis.md`；
- `domain_model.md`；
- `glossary.md`；
- `data_model.md` / `database_design.md`；
- 相关模块 `module.json`。

如果 `module_boundary_analysis_required = Yes`，AI MUST 生成：

- `work-items/<WI>/module_boundary_analysis.md`；
- 模块拆分/合并/保持现状判断矩阵；
- 受影响模块清单；
- 受影响需求、设计、数据、接口、事件和 Trace；
- 是否需要 ADR、ATAM、migration map。

AI MUST NOT 基于技术层、页面、数据库表、代码目录或未来猜测提出模块拆分。模块边界 MUST 以业务能力、统一语言、规则内聚、数据所有权、上下文关系、变化频率、接口边界、部署边界、维护责任和复杂度成本为依据。


### 15.5B 做韧性与失败治理分析

当 Work Item 涉及跨进程调用、外部系统依赖、异步事件、后台任务、数据同步、最终一致性或服务化时，AI MUST 做韧性与失败治理分析。

AI 在 `impact_analysis.md` 阶段 MUST 输出：

```text
resilience_analysis_required: Yes/No + reason
cross_boundary_interactions:
external_dependencies:
async_flows:
consistency_risks:
failure_modes:
```

如果 `resilience_analysis_required = Yes`，AI MUST 生成 `resilience_analysis.md`，并更新 `resilience_patterns.md`、`integration_design.md`、`event_flows.md`、`consistency_design.md`、`reliability_design.md`、`observability_design.md`、`architecture_risks.md`、`tasks.md`、`verification_report.md` 和 `evidence/` 中相关内容。

AI MUST NOT 只描述成功路径。每个跨边界交互 MUST 至少说明 timeout、错误分类、失败处理和观测字段。涉及 retry 时 MUST 说明最大次数、退避、抖动、可重试错误、幂等和 retry storm 防护。涉及异步事件时 MUST 说明 event_id、idempotency_key、dead letter、replay、补偿或对账。涉及最终一致性时 MUST 说明补偿、对账、审计和人工介入条件。

### 15.6 选择最小足够架构

AI 必须优先选择能满足当前需求的最小足够架构。

如果建议更复杂架构，必须说明依据。

### 15.7 输出设计依据

每个重要设计必须说明：

```text
依据：REQ/AC/质量属性/约束/现有项目结构
采用原则：高内聚/低耦合/数据所有权/契约优先/可演进
替代方案：为什么不采用
影响范围：模块/接口/数据/部署/测试
```

### 15.8 生成 delta 和 candidate

AI 不应直接覆盖正式规格。

必须先生成 delta 和 candidate，通过 Gate 与用户确认后合并。

### 15.9 不确定时保守处理

当 AI 无法判断模块边界或架构复杂度时，应该：

- 保持 core 或当前模块；
- 输出不确定点；
- 要求用户确认业务边界；
- 不主动引入微服务、复杂分布式方案。

---


### 15.12 做架构演进分析

AI 在 `impact_analysis.md` 中 MUST 判断是否需要架构演进分析：

```text
architecture_evolution_required: true/false
reason:
roadmap_stage:
affected_fitness_functions:
drift_risks:
deprecation_required:
```

当 `architecture_evolution_required = true` 时，AI MUST：

1. 读取 `architecture_roadmap.md`、`fitness_functions.md`、`deprecation_policy.md`、`architecture_risks.md`、`project/decisions/`、`trace_matrix.md`、相关 `module.json` 和 `service_catalog.md`；
2. 判断本次变更是目标演进、必要取舍，还是架构漂移；
3. 生成 `architecture_evolution_plan.md`；
4. 如改变或新增适应度函数，生成 `fitness_function_delta.md`；
5. 如涉及废弃旧能力，生成 `deprecation_plan.md`；
6. 如发现偏离已接受架构，生成 `architecture_drift_report.md`；
7. 更新相关项目级文件、模块文件、Trace、ADR、ATAM、tasks、verification_report、evidence 和 merge_report；
8. 通过 Architecture Evolution Gate 后才允许 Merge。

AI MUST NOT perform large architecture rewrites without decomposing them into incremental Work Items with explicit exit criteria.


## 16. 边界条件

### 16.1 不适合极小一次性脚本

如果项目只是一次性脚本、无长期维护、无规格演进，本标准可退化使用。

### 16.2 不替代专业建模工具

本标准可以管理设计文本、契约、决策和 trace，但不替代：

- ER 图工具；
- UML 工具；
- API 管理平台；
- 数据血缘平台；
- Kubernetes 管理平台。

图形化资产可以放在：

```text
project/diagrams/
project/assets/
```

### 16.3 不替代架构师判断

模块边界、服务拆分、数据库归属、分布式一致性策略仍需要专业判断。

AI 可以提出建议，但必须有依据，并需要用户确认。

### 16.4 大型组织需要额外治理

如果未来进入多团队、大型企业项目，可作为扩展再补充：

- Owner 机制；
- 权限控制；
- 分支策略；
- 审批机制；
- 发布窗口；
- 版本治理；
- 模块负责人。

### 16.5 没有 Gate 的目录结构会失效

如果只建目录，不做 Gate，规格仍会腐烂。

本标准必须和 Gate、review、verification、trace 一起使用。

---

## 17. 合规等级

### 17.1 Minimal

适用于小项目。

必须有：

```text
spec_manifest.json
architecture.md
requirements_index.md
design_index.md
project/modules/core/requirements.md
project/modules/core/design.md
work-items/
```

### 17.2 Standard

适用于一般业务系统。

必须增加：

```text
integration_design.md
api_contracts.md
data_model.md
database_design.md
domain_model.md
context_map.md
trace_matrix.md
module trace
crosscutting_concepts.md
architecture_risks.md
```

### 17.3 Extended

适用于复杂系统、微服务、分布式、云原生。

必须按需增加：

```text
event_flows.md
distributed_design.md
consistency_design.md
deployment_design.md
infrastructure_design.md
observability_design.md
security_design.md
reliability_design.md
ci_cd_design.md
```

---

## 18. Definition of Done

一个 Work Item 完成时，必须满足：

1. requirements_delta 已生成；
2. design_delta 已生成；
3. 相关 candidate 已通过 Gate；
4. 用户确认需求变更；
5. 用户确认设计变更；
6. 正式规格已合并；
7. tasks 已执行；
8. review 已通过；
9. verification 已通过；
10. trace 已更新；
11. merge_report 已生成；
12. project_spec_version 已递增；
13. evidence 已归档。

架构变更 Work Item 还必须满足：

1. 如果涉及模块边界或数据所有权变化，domain_analysis 和 module_boundary_analysis 已生成；
2. domain_model/context_map/glossary/module.json 已按需更新；
3. migration map 完整；
4. old ID 到 new ID 可追溯；
5. manifest/index 更新；
6. 模块 work_item_index 更新；
7. 历史 trace 不断链。

---

## 19. 本标准是否已经可以作为框架标准

本标准可以作为 SpecForge 项目级规格架构的 v1.0 草案标准使用。

但要成为可执行标准，还需要配套落地以下内容：

1. 更新 `directory-layout.ts`，加入 `project/`、`work-items/`、project-level design files、module-level files、archive snapshots、`project/diagrams/`、`domain_model.md`、`context_map.md`、`service_catalog.md`、`resilience_patterns.md`、`configuration_design.md`、`dependency_manifest.md`、`environment_matrix.md`、`release_strategy.md`、服务化 Work Item 文件、`resilience_analysis.md`、`runtime_delivery_analysis.md`、`slo_catalog.md`、`incident_response.md`、`operational_readiness.md`、`sre_impact_analysis.md` 等路径；
2. 修改状态机，支持 project_context_load、impact_analysis、delta、candidate、merge、trace_update、architecture_refactor；
3. 修改 sf-requirements，使其不再生成 WI 独立 requirements.md，而是生成 requirements_delta 和 candidate；
4. 修改 sf-design，使其区分 project-level design 和 module-level design；
5. 修改 sf-task-planner，使任务引用项目/模块规格 ID；
6. 修改 Gate，增加 Project Manifest Gate、Module Gate、API/Data/Event/Architecture Refactor/Merge Gate，ADR Gate、Quality Attribute / ATAM Gate、Domain Boundary Gate、Service Boundary Gate、Resilience Pattern Gate、Runtime Delivery Gate、SRE / Operational Readiness Gate，以及 C4 Level Gate、Container Gate、Component Gate、Code View Gate；
7. 修改 Knowledge 和 Trace，使其支持项目级与模块级追溯；
8. 增加 AI 操作协议，禁止无依据架构设计，并要求 AI 使用 C4 层级控制设计颗粒度，使用 ATAM 分析质量属性取舍，使用 ADR 记录重要架构决策，并使用 DDD 做领域边界和数据所有权分析，使用 Cloud Architecture Patterns 做韧性与失败治理分析，使用 Twelve-Factor App 做运行交付分析，并使用 SRE 做可靠性目标、错误预算、事故响应和运行证据治理；
9. 增加模板文件；
10. 增加迁移工具，把旧 `.specforge/specs/WI-XXX/` 模式迁移到新结构。

因此，本标准本身已经具备成为框架标准的基础，但代码和流程还需要按本标准实施。

---

## 20. 总结

### 20.1 Future Extension：Team Topologies

Team Topologies 当前不进入本标准强制范围。若未来项目进入多团队、大型企业协作、平台团队治理或复杂组织交付阶段，MAY 作为可选扩展重新评估。当前仅保留轻量 Owner / Maintainer 规则，不新增团队拓扑文件、Gate 或 AI 操作协议。


本标准的核心是：

```text
Project-level Global Specs
+ Module-level Current Specs
+ Work Item Change Sets
+ Gate-controlled Merge
+ Traceable Architecture Evolution
```

AI 在设计时不能凭感觉设计，必须：

- 读取项目规格；
- 做影响分析；
- 按 DDD 的业务能力、统一语言、规则内聚、数据所有权和上下文关系拆模块；
- 用项目级设计承载整体架构、接口、数据、事件、部署、分布式、云原生等跨模块设计；
- 用模块级设计承载模块内部实现；
- 用 Work Item 记录每次变更；
- 用 Gate 和用户确认控制合并；
- 用 Twelve-Factor App 约束配置、依赖、环境、构建、发布、运行、日志、健康检查和一次性管理任务；
- 用 trace 和 migration map 保证长期演进不断链。

这套标准既能从小项目的 `core` 模块开始，也能扩展到大型多模块、微服务、分布式、云原生系统。

