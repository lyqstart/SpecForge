# SpecForge Authority Registry

> Status: ACTIVE / AUTHORITY_REGISTRY
>
> Effective date: 2026-10-01
>
> Registry version: 1.4
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
| docs/project-status.md | 唯一当前执行状态与下一合法动作；不承载产品决定 | NO |
| docs/design/SpecForge架构一致性治理最终实施方案.md | 架构一致性与契约治理的从属技术合同 | NO |
| docs/archive/** | 旧规格、旧标准、旧设计、实施记录、报告、审计与 Kiro 材料的统一历史归档 | NO |
| docs/design/**（除上列从属合同外） | 当前不得新增并行设计权威；新增设计必须先登记角色 | NO |
| .kiro/** | 根目录禁止存在；历史内容只可位于 docs/archive/kiro/** | FORBIDDEN ROOT |
| docs/roadmap/future-capability-registry.md | 未来能力登记册 | NO |
| packages/**, setup/**, scripts/** | 当前实现和消费者证据 | NO |
| tests/** | 验证消费者与证据 | NO |
| README / prompts | 导航或使用说明 | NO |

`docs/archive/**` 中的文件必须保持可追溯，但不得作为当前需求、设计或执行状态输入。测试若读取归档文件，只能验证历史证据未丢失，不能据此约束当前产品行为。

## 4. 当前产品负责人裁决

以下裁决已经吸收进 SPS-1.0：

| ID | 裁决 |
|---|---|
| PO-001 | Migration 模块退出当前产品；schema validation 保留为文件 owner / contract 责任，不等同 Migration |
| D01 | events.jsonl 是持久化工作流状态事实源；state.json 是可重建 checkpoint/projection |
| D02 | Daemon 是独立共享服务；生命周期由部署环境、CLI 或 service manager 管理；Thin Plugin 不启动/停止/重启 Daemon |
| D03 | 当前用户级数据根为 <OpenCode config>/sf-user；用户主目录 ~/.specforge 退役为非当前写入目标 |
| D04 | SpecForge user-level installer 是正式部署模型；npm-global CLI + specforge init ~/.specforge 不是当前产品部署合同 |
| D05 | OpenCode Adapter 是当前已启用的核心集成模块；真实 Daemon production consumer、release `specforged` 部署链和 OpenCode 1.18.34 端到端验证已完成。Adapter 不得管理 Daemon 生命周期 |
| D06 | OpenClaw 不属于当前产品；进入 Future Capability Registry |
| D07 | Multimodal、Self-Healing 不属于当前产品；进入 Future Capability Registry |
| D08 | 第三方 Plugin Loader / runtime plugin system 不属于当前产品；Thin Plugin 作为第一方 OpenCode 接入组件继续保留 |
| D09 | 当前不启用完整 v1.3 多视角 Project Spec；只吸收成熟 Core 规则，views/ADR Detail/ATAM/DDD/SRE 等进入 Future Capability Registry |
| D10 | NSSM 退出当前产品、安装器、发布物与运行依赖；当前 OS service registration 仅支持 Linux `systemd --user`，Windows 保留直接启动独立 Daemon 进程的能力但不提供系统服务注册或开机自启动；任何未来 Windows 服务宿主须重新裁决 |
| AR-DEC-01 | 《SpecForge 架构一致性治理最终实施方案》保留为从属技术治理合同，服从 SPS 与 Authority Registry，不再自称产品权威 |
| AR-DEC-02 | 旧规格、旧设计、旧标准、实施文件、报告和审计统一进入 docs/archive/**，不再散布为并行当前目录 |
| AR-DEC-03 | 仓库根 .kiro 退役；可复用内容必须进入当前权威或实现合同，剩余材料归档至 docs/archive/kiro/** |
| AR-DEC-04 | 根 AGENTS.md 是新会话稳定入口；scripts/project-session-bootstrap.mjs 是只读恢复器；docs/project-status.md 是唯一当前执行状态文件 |
| VR-DEC-01 | 当前 SpecForge 开启新的产品版本纪元，首个正式产品版本为 1.0.0；旧版本号只保留历史证据，不表达兼容或产品谱系承诺 |
| VR-DEC-02 | 新产品 Git Tag 使用 `specforge-v<semver>`；既有 `v*` Tag 保留为历史，不删除、不改写 |
| VR-DEC-03 | 产品版本与 schema、协议、工作流格式等技术合同版本独立演进；不得因产品版本重排而机械修改技术合同版本 |
| VR-DEC-04 | 当前产品与发布消费者中的 V6/V3.5 品牌和发布身份收敛到新纪元；ADR、迁移脚本、Derived-From、旧测试与报告中的版本引用作为历史证据保留，禁止全仓机械替换 |

## 5. 解释优先级

当仓库内容冲突时，按以下顺序处理：

1. 已写入当前 Product Specification 的产品负责人裁决。
2. 当前 Product Specification。
3. 与 Product Specification 一致的 Accepted ADR。
4. 与上位规则一致且已登记角色的模块设计和 Contract。
5. 当前实现代码。
6. 自动化测试与发布消费者。
7. `docs/archive/**` 中的历史报告、handoff、旧标准、Kiro 工作规格和其他来源材料。

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
