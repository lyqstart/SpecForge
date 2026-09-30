# SpecForge Unified Standard v1.3 Removed Content Log Final

本文件说明未进入 v1.3 正文的内容、删除或后置原因，防止误判为遗漏。


> 状态：draft / removed-content-log
> 生成日期：2026-06-30

## 1. 删除原则

删除不等于内容没有价值，而是表示它不适合进入统一执行标准正文。v1.3 正文只保留可以被 SpecForge Runtime、Agent、Tool、Gate、Trace、Candidate、Merge、Close 实际执行或检查的规则。

## 2. 删除内容

| 内容 | 处理 | 原因 |
|---|---|---|
| v1.14 独立标准定位 | 删除 | v1.3 只能有一个统一标准；v1.14 降级为来源材料 |
| “本标准是否已经可以作为框架标准” | 删除 | 结论性说明，不是执行规则 |
| Team Topologies Future Extension | 删除正文，仅保留轻量 owner | 当前不做团队拓扑治理 |
| 与 v1.1 控制面冲突的直接写入暗示 | 删除 | 正式规格只能由 Merge Runner 写 |
| 机器字段里的 `project/...` 简写 | 替换 | 必须使用 `.specforge/project/...` |
| 小写模块示例作为 canonical module | 替换 | 统一 `MODULE_CODE` |
| 所有视角文件默认创建的暗示 | 删除 | 必须 Core/Conditional/Optional 分级 |
| Gate 未登记即可使用的暗示 | 删除 | 专题 Gate 必须登记 `extension_registry.json` |

## 3. 后置到 Playbook 的内容

| 内容 | 建议位置 | 原因 |
|---|---|---|
| 登录能力多视角拆解示例 | `docs/examples/project-spec-multiview-login-example.md` | 教学示例，不是硬规则 |
| core 拆出 auth 的架构演进示例 | `docs/examples/project-spec-architecture-evolution-example.md` | 示例长，容易污染正文 |
| ISO/arc42/C4/ADR/ATAM/DDD/SRE 详细解释 | `docs/playbooks/project-spec-architecture-methods-playbook.md` | 方法论背景，正文只保留机制映射 |
| ADR/ATAM/SRE/Runtime Delivery 模板 | `docs/templates/project-spec/` | 模板应独立维护 |
| Minimal/Standard/Extended 合规等级 | `docs/playbooks/project-spec-compliance-levels.md` | 配置策略，不改变 hard_gate |

## 4. 保留但改写的内容

| 内容 | 改写方式 |
|---|---|
| v1.14 多视角表 | 文件路径统一移入 `.specforge/project/views/` |
| ADR | `decisions.md` Core + ADR Detail Conditional Extension |
| C4 | 转成 `c4_impact` 字段和 `c4_layer_gate` |
| ATAM | 转成 `quality_attribute_analysis.md` 和 `atam_gate` |
| DDD | 转成 `domain_analysis.md` / `module_boundary_analysis.md` 和 `domain_boundary_gate` |
| Microservices | 转成 `service_catalog.md` 和 `service_boundary_gate` |
| Cloud Patterns | 转成 `resilience_analysis.md` 和 `resilience_pattern_gate` |
| SRE | 转成 `sre_impact_analysis.md` 和 `sre_operational_readiness_gate` |
| Evolutionary Architecture | 转成 `architecture_evolution_plan.md` 和 `architecture_evolution_gate` |
