# SpecForge 权威体系恢复：当前决策与接续状态

> 文件性质：动态任务状态与证据索引，不是产品需求、产品架构或全局 authority registry。
>
> Authority Registry：docs/product-specification/authority-registry.md
>
> 当前唯一产品规格：docs/product-specification/specforge-product-specification.md
>
> 更新时间：2026-09-18。

## 当前阶段

Authority Model Recovery 的“产品范围裁决 + 唯一产品权威建立”已完成。

~~~text
CURRENT_PHASE=AUTHORITY_MODEL_RECOVERY_CONSUMER_CONVERGENCE
PRODUCT_AUTHORITY_REGISTRY=docs/product-specification/authority-registry.md
PRODUCT_SPECIFICATION=docs/product-specification/specforge-product-specification.md
PRODUCT_SPEC_VERSION=SPS-1.0
PRODUCT_OWNER_DECISIONS=PO-001,D01,D02,D03,D04,D05,D06,D07,D08,D09
AUTHORITY_ROOT_ESTABLISHED=YES
CURRENT_BLOCKER=MIGRATION_PACKAGE_STILL_OWNS_ACTIVE_SCHEMA_VALIDATION_INFRASTRUCTURE
NEXT_LEGAL_ACTION=MIGRATE_ACTIVE_SCHEMA_VALIDATION_INFRASTRUCTURE_OUT_OF_MIGRATION_PACKAGE
~~~

## 已完成产品裁决

- Migration 当前产品移除；schema validation 作为文件 owner / contract 能力保留。
- events.jsonl 为持久化 workflow state authority；state.json 为 projection/checkpoint。
- Daemon 独立共享运行；Thin Plugin 不拥有生命周期。
- 用户级正式根为 <OpenCode config>/sf-user；~/.specforge 退役。
- user-level installer 为正式部署模型；npm-global CLI + specforge init ~/.specforge 退出当前部署合同。
- OpenCode Adapter 保留为当前核心目标，但完成真实 production wiring 前为 REQUIRED_NOT_YET_ENABLED。
- OpenClaw、Multimodal、Self-Healing、third-party Plugin Loader 退出当前产品并进入 Future Capability Registry。
- 当前不启用完整 v1.3 multi-view Project Spec；只保留成熟 Core。
- Scope Gate 定位为 Release / Build Governance，不是业务 Runtime。

## 当前权威关系

- .kiro/**：非产品权威。
- docs/standards/fused_standard.md：历史融合标准 / 规格来源材料，非当前产品权威。
- docs/standards/v1.3/**：候选/未来设计来源，非当前产品权威。
- ADR：架构决策记录，必须服从/同步当前 Product Specification。
- implementation/reports/audit/handoff：状态和证据，不是产品权威。
- code/tests：实现和消费者证据，不是产品权威。

## 下一阶段工作

按 SPS-1.0 §20 的 Conformance Gaps 收敛，优先顺序：

1. authority consumer：release precheck / Scope Gate 核心代码已切换 SPS-1.0；当前继续清理外围 tests / README / historical standard headers。
2. user-level path + handshake consumers：SOURCE_CONVERGED。
3. Daemon lifecycle：Thin Plugin auto-start ownership 已删除。
4. runtime state contract：wal.jsonl current contract 已删除。
5. Project Spec Core：D09 deferred paths 已移出当前 Layout/API。
6. Migration removal：先迁出 schema validation infrastructure，再去 package/release surface。
7. future package removal：Multimodal / Self-Healing / Plugin Loader current release surface。
8. OpenCode Adapter production wiring。
9. Workflow Runtime / Daemon dependency and Permission/Write Guard responsibility convergence。
10. installer / service / CLI / documentation end-to-end acceptance。

## 禁止事项

- 不得重新以 .kiro、fused standard、v1.3 或代码现状覆盖 SPS-1.0。
- 不得把 Future Capability Registry 作为当前 release scope。
- 不得为了旧测试通过恢复 ~/.specforge、Plugin auto-start、state.json authority、Migration current product 等已裁决旧模型。
- 不删除历史 ADR、ERR、审计和报告；需要降级时标记角色和 supersession。


## 2026-09-18 Authority Consumer Convergence

- `1d1604372d92ea1aa05959b9aa60655d397e7fa4`：Scope Gate release authority projection、normalizer、current release precheck 与直接测试已切换为只消费 SPS-1.0。
- SPS-1.0 已内置唯一 `SPECFORGE_RELEASE_AUTHORITY_ITEMS` 机器投影；旧 implementation matrix 的投影不再是 authority。
- current formal precheck 预期先暴露 Migration / Multimodal / Self-Healing / Plugin Loader 仍残留 release surfaces 的真实 conformance drift；不得通过重新启用这些模块使测试变绿。
- GitHub 当前未返回该提交的 CI status/workflow run，因此测试执行状态为 `NOT_VERIFIED_BY_CI`，不声称全绿。


## 2026-09-18 User-Level Path / Handshake Convergence

- `fedabb7bb0c5032f6741f79f966edbafa8a35ec4`：canonical user path API、Daemon/CLI/Service Management handshake consumers、installed thin client 与 sf_plugin_client 已切换到 `<OpenCode config>/sf-user/runtime/handshake.json`；Manifest helper 切换到 `<OpenCode config>/specforge-manifest.json`。
- `ee40d40f30b18772adf55386a5b326e6c7fd9494`：修正 CLI path-resolver 遗留的 `~/.specforge` 文档消费者。
- `PATH_CLOSURE_1=SOURCE_CONVERGED`。
- `RUNTIME_DEPLOYMENT_VALIDATION=NOT_RUN`；GitHub 未返回 CI status，不宣称测试或真实部署已通过。
- Installer 仍采用单一旧 install root；Thin Plugin 仍存在旧私有资产路径和 Daemon auto-start。它们分别属于下一闭环，不由本次 source convergence 隐式宣告完成。


## 2026-09-18 Installer / Lifecycle / Runtime Contract Convergence

- `d602874d5ea163e3a694ce7d08b9ec38f2f409d5`：Installer 物理安装坐标统一为 `<OpenCode config>`；公共 OpenCode 资产位于根级目录，SpecForge 私有运行/事务资产位于 `sf-user/**`。Manifest 保持根级，lock/journal/backups 收入 `sf-user/**`。
- `82a6f9e780132eaff2e8eec21679feb2ffd4a846`：Thin Plugin 删除 Daemon auto-start / spawn / lifecycle ownership；连接失败进入 degraded，后续仅重连外部管理的 Daemon。
- `30150d042942716d86354f43f3a27407ad45ce27`：删除当前 `runtime/wal.jsonl` 第二合同；共享 Layout 与 Workflow Runtime 统一 `events.jsonl`。
- `7884453c75b30d7b00bee90460be49a0bd10b7e9`：D09 deferred multi-view Project Spec paths 从当前 Layout/API 移除；历史 v1.3 设计继续保留于 Future Capability Registry 来源体系。
- `SOURCE_CONVERGENCE=YES`。
- `CI_VALIDATION=NOT_AVAILABLE`；GitHub 未返回这些提交的 CI status，本阶段不声称自动化测试全绿或真实 user-level redeploy 已完成。
