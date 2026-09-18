# SpecForge Authority Registry

> Status: ACTIVE / AUTHORITY_REGISTRY
>
> Effective date: 2026-09-18
>
> Registry version: 1.0
>
> Product owner: SpecForge 产品负责人
>
> Establishing baseline: main@5204a1611d9a1f02f96da637e6ec1c2acd35a8d0

## 1. 唯一产品权威

SpecForge 当前唯一产品规格为：

docs/product-specification/specforge-product-specification.md

规格版本：

SPS-1.0

本 Registry 只声明权威关系、文件角色和裁决记录，不承载独立产品需求，因此不构成第二套产品规格。

## 2. 权威规则

1. 当前产品需求、架构、产品边界、模块范围、运行模型、路径模型和验收标准，只能由 SpecForge Product Specification 定义。
2. 产品负责人作出新的产品裁决时，必须同步更新 Product Specification；不得长期依赖聊天记录、handoff、issue、Kiro 或实现代码保存产品决定。
3. ADR 用于记录重要架构决策及理由。ADR 不得形成与 Product Specification 并列的产品权威；会改变当前产品行为的 ADR 必须同步更新 Product Specification。
4. 模块设计、标准、实现计划、tasks、测试、报告和代码必须服从 Product Specification。它们可以证明实现现状，但不能反向创造产品需求。
5. 历史内容不得通过“仍被测试或脚本消费”自动恢复为权威。
6. Future Capability Registry 只保存未来候选能力，不进入当前 release scope。

## 3. 文件角色登记

| 位置 | 当前角色 | 产品权威 |
|---|---|---:|
| docs/product-specification/specforge-product-specification.md | 当前唯一产品规格 | YES |
| docs/product-specification/authority-registry.md | 权威登记与文件角色 | REGISTRY ONLY |
| docs/adr/** | 架构决策记录；必须与当前产品规格一致 | NO |
| docs/standards/fused_standard.md | 历史融合标准 / 当前规格来源材料 | NO |
| docs/standards/v1.3/** | 后续设计候选与未来能力来源 | NO |
| docs/design/** | 设计来源、历史设计与专题设计 | NO |
| docs/implementation/** | 实施计划、动态状态和收敛记录 | NO |
| docs/reports/**, docs/audit/**, docs/audits/** | 验证、审计和历史证据 | NO |
| .kiro/specs/** | Kiro 工作规格、历史需求/设计来源 | NO |
| docs/roadmap/future-capability-registry.md | 未来能力登记册 | NO |
| packages/**, setup/**, scripts/** | 当前实现和消费者证据 | NO |
| tests/** | 验证消费者与证据 | NO |
| README / handoff / prompts | 导航、交接或使用说明 | NO |

## 4. 当前产品负责人裁决

以下裁决已经吸收进 SPS-1.0：

| ID | 裁决 |
|---|---|
| PO-001 | Migration 模块退出当前产品；schema validation 保留为文件 owner / contract 责任，不等同 Migration |
| D01 | events.jsonl 是持久化工作流状态事实源；state.json 是可重建 checkpoint/projection |
| D02 | Daemon 是独立共享服务；生命周期由部署环境、CLI 或 service manager 管理；Thin Plugin 不启动/停止/重启 Daemon |
| D03 | 当前用户级数据根为 <OpenCode config>/sf-user；用户主目录 ~/.specforge 退役为非当前写入目标 |
| D04 | SpecForge user-level installer 是正式部署模型；npm-global CLI + specforge init ~/.specforge 不是当前产品部署合同 |
| D05 | OpenCode Adapter 保留为当前核心目标架构，但在真实 Daemon 生产接入完成前状态为 REQUIRED_NOT_YET_ENABLED；不得管理 Daemon 生命周期 |
| D06 | OpenClaw 不属于当前产品；进入 Future Capability Registry |
| D07 | Multimodal、Self-Healing 不属于当前产品；进入 Future Capability Registry |
| D08 | 第三方 Plugin Loader / runtime plugin system 不属于当前产品；Thin Plugin 作为第一方 OpenCode 接入组件继续保留 |
| D09 | 当前不启用完整 v1.3 多视角 Project Spec；只吸收成熟 Core 规则，views/ADR Detail/ATAM/DDD/SRE 等进入 Future Capability Registry |

## 5. 解释优先级

当仓库内容冲突时，按以下顺序处理：

1. 已写入当前 Product Specification 的产品负责人裁决。
2. 当前 Product Specification。
3. 与 Product Specification 一致的 Accepted ADR。
4. 与上位规则一致的模块设计、标准和 Contract。
5. 当前实现代码。
6. 自动化测试与发布消费者。
7. 历史报告、handoff、Kiro 工作规格和其他来源材料。

如果第 3 至第 7 层与第 1 至第 2 层冲突，应记录为 conformance gap 并修改下游消费者；不得反向修改当前产品规格以迁就旧实现。

## 6. 规格变更协议

任何未来产品范围变化必须遵循：

产品负责人明确决定
→ 更新 Product Specification
→ 必要时更新 ADR
→ 更新模块设计 / Implementation Plan
→ 更新代码和测试
→ 更新发布消费者
→ 验证并记录证据

不得先修改代码或 release gate，再由实现事实反向定义产品。

## 7. ADR-014 关闭条件

本 Registry 与 SPS-1.0 建立后，ADR-014 所要求的“显式 authority registry + 唯一正式产品规格”已经建立。

ADR-014 本身继续保留为 Authority Model Recovery 的历史决策证据，不删除、不改写为新的产品规格。
