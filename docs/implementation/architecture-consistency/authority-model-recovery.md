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
CURRENT_BLOCKER=DOWNSTREAM_CONSUMERS_AND_IMPLEMENTATION_STILL_REFERENCE_SUPERSEDED_MODELS
NEXT_LEGAL_ACTION=CONVERGE_AUTHORITY_CONSUMERS_AND_IMPLEMENTATION_TO_SPS-1.0
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

1. authority consumer：release precheck / Scope Gate / tests / README / standard headers。
2. user-level path + handshake consumers。
3. Daemon lifecycle：删除 Thin Plugin auto-start ownership。
4. runtime state contract：删除 wal.jsonl current contract。
5. Project Spec Core：移出 D09 deferred paths。
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
