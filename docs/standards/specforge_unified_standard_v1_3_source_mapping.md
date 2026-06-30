# SpecForge Unified Standard v1.3 Source Mapping

> 状态：draft  
> 生成日期：2026-06-30  
> 目的：说明 Unified Standard v1.3 各章节来源于哪些旧标准，以及如何吸收、裁决、改写。

---

## 1. 来源文件

| 来源文件 | 定位 | 融合处理 |
|---|---|---|
| `specforge_final_fused_standard_v1_1_patch1_zh.md` | 当前正式执行标准，覆盖 Runtime、WI、State Machine、Path、Candidate、Gate、User Decision、Merge、Write Guard、Trace、Close Gate、Extension Registry、状态权威模型 | 作为上位控制面基础，保留强制约束 |
| `specforge_project_spec_architecture_standard_v1_14_consolidated.md` | Project Spec 架构、多视角、行业实践吸收、模块拆分、专题 Gate、AI 操作协议草案 | 作为 v1.3 Project Spec 多视角和架构治理扩展输入，需服从上位控制面 |
| `SpecForge_v1.2_设计标准差距审查与后续规划.md` | v1.2 当前实现差距与后续规划 | 用于区分 v1.2.x 维护和 v1.3 设计冻结，不直接作为标准正文来源 |

---

## 2. 章节映射

| Unified Standard v1.3 章节 | 主要来源 | 吸收方式 |
|---|---|---|
| 0. 标准定位 | v1.1 总则；v1.14 标准结论；v1.2 差距审查 | 明确统一标准定位和阶段边界 |
| 1. 目录边界 | v1.1 目录边界与路径治理 | 保留 OpenCode 扩展层 / 用户项目 `.specforge/` 两层模型 |
| 2. 状态权威模型 | v1.1 Patch 2 | 作为最终状态权威规则，v1.14 不得引入第二状态源 |
| 3. Path Service 与 Path Policy | v1.1 Path Service / Path Policy | 扩展 Project View、Decision、Diagram、Module View 路径生成能力 |
| 4. 命名、ID 与字段规则 | v1.1 ID 规则；v1.14 module_id 示例冲突 | 统一为 MODULE_CODE，废弃 module_id 作为正式主键 |
| 5. Project / Module / Work Item 三层责任模型 | v1.14 核心原则；v1.1 WI 事务模型 | 保留三层责任，但所有写入规则服从 v1.1 控制面 |
| 6. Project Spec Core 真相源 | v1.1 项目级正式规格真相源；v1.1 Patch 1 extension_registry | 加入 extension_registry 为 Core 文件 |
| 7. Project Spec Extension Registry | v1.1 Patch 1 | 扩展为 view_types、gate_types、analysis_types、candidate_entry_types、trace_link_types 统一登记 |
| 8. Project Spec 多视角体系 | v1.14 ISO 42010、多视角、颗粒度规则 | 改写为 `.specforge/project/views/**` 条件扩展，不默认生成所有文件 |
| 9. Work Item 事务模型 | v1.1 Work Item；v1.14 Work Item 专题分析 | 保留最小闭环文件，专题分析条件触发 |
| 10. Candidate、Delta 与 Manifest | v1.1 Candidate / Delta / Manifest；v1.14 delta/candidate | 统一 Candidate 是完整候选文件，不是 patch |
| 11. Gate 体系 | v1.1 Gate；v1.14 基础 Gate + 专题 Gate | 基础 Gate 默认，专题 Gate 条件触发且必须登记 |
| 12. User Decision | v1.1 User Decision | 保留用户显式决策和 hash 绑定 |
| 13. Merge Runner | v1.1 Merge Runner；v1.14 Merge 约束 | Merge Runner 是唯一正式规格写入者 |
| 14. Write Guard 与 code_permission | v1.1 code_permission / Write Guard | 保留代码写入治理，不让多视角绕开写保护 |
| 15. Trace、Verification、Evidence、Close Gate | v1.1 Trace / Verification / Evidence / Close Gate；v1.14 Traceability | 扩展为跨视角 Trace |
| 16. 行业实践吸收规则 | v1.14 ISO 42010、arc42、C4、ADR、ATAM、DDD、微服务、云架构、Twelve-Factor、SRE、Evolutionary Architecture | 保留为可执行机制，不保留方法论堆砌 |
| 17. Legacy Migration | v1.1 Legacy Paths；v1.14 架构演进 | 区分旧 specs read-only 和 v1.3 视角迁移 |
| 18. Agent / Skill / Tool 职责边界 | v1.1 Agent 职责边界；v1.2 差距审查 | 明确各主体不得越权写正式规格 |
| 19. Live Acceptance | v1.1 端到端验收；v1.2 差距审查；v1.14 Definition of Done | 增加多视角正负验收 |
| 20. 禁止事项 | v1.1 禁止事项；v1.14 边界条件 | 合并为统一禁止清单 |
| 21. 实施阶段 | v1.2 差距审查 | 明确 v1.2.x 维护与 v1.3 设计冻结分层 |
| 22. 最终闭环主链路 | v1.1 最终闭环主链路 | 扩展纳入 extension_registry 和 Project View |

---

## 3. 被吸收但改写的关键规则

### 3.1 ADR 存放规则

来源：v1.14 要求正式 ADR 存放于 `project/decisions/ADR-*.md`。

改写：

```text
v1.2 / MVP：.specforge/project/decisions.md
v1.3：.specforge/project/decisions.md 保留为 Decision Index；
      .specforge/project/decisions/ADR-*.md 是 Conditional Extension。
```

理由：避免破坏 v1.1/v1.2 已定义的 MVP 决策文件，同时吸收完整 ADR 能力。

### 3.2 多视角路径

来源：v1.14 直接列出 `business_value.md`、`api_contracts.md` 等文件。

改写：

```text
.specforge/project/views/business_value.md
.specforge/project/views/api_contracts.md
...
```

理由：避免 Project 根目录膨胀，保持 Core 文件和 Conditional View 文件边界清晰。

### 3.3 专题 Gate

来源：v1.14 定义大量专题 Gate。

改写：

```text
专题 Gate = 条件触发 + extension_registry 登记 + impact_analysis 声明 + Gate Runner 执行。
```

理由：防止过设计和 Agent 临时创造 Gate。

### 3.4 Module 标识

来源：v1.1 使用 `MODULE_CODE`；v1.14 示例中出现 `module_id`、`prefix`、`name`。

改写：

```text
唯一正式主键：MODULE_CODE
其他字段只能展示或兼容，不能进入路径、ID、Trace 主键。
```

---

## 4. 未直接吸收的内容

| 内容 | 处理 |
|---|---|
| Team Topologies | 不纳入 v1.3 Core；作为 Future Optional Extension |
| 大型组织治理 | 不纳入当前标准；未来通过 extension_registry 启用 |
| 图形建模工具专用格式 | 不强制；diagram 可用 Markdown、Mermaid、PlantUML、Structurizr DSL、图片或外部引用 |
| 全量 ADR 目录默认创建 | 不默认；条件触发 |
| 所有专题文件默认创建 | 不默认；条件触发 |

---

## 5. 实现提示

后续实现不应从“大文档生成”开始，而应按控制面落地：

```text
1. 统一 Path Service。
2. 统一 Project Spec schema。
3. 统一 extension_registry。
4. 实现 Project View registry 与 validator。
5. 实现 Candidate Manifest 对 view_type / gate_type 的校验。
6. 实现 Cross View Validator。
7. 接入 Merge Runner。
8. 接入 Gate Runner。
9. 做正负 Live Acceptance。
```

---

## 6. 对旧文件的处理建议

建议保留旧文件，但移到 archive：

```text
docs/standards/archive/specforge_final_fused_standard_v1_1_patch1_zh.md
docs/standards/archive/specforge_project_spec_architecture_standard_v1_14_consolidated.md
```

新增：

```text
docs/standards/specforge_unified_standard_v1_3.md
docs/standards/specforge_unified_standard_v1_3_conflict_matrix.md
docs/standards/specforge_unified_standard_v1_3_source_mapping.md
```

不要在仓库中同时存在多个“当前上位标准”。如果保留旧文件，必须标记为 archive/source material。
