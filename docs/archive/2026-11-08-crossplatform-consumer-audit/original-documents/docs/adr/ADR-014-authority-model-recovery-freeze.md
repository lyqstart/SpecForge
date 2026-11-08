# ADR-014: 权威体系恢复冻结

- Status: Accepted / Implemented（恢复冻结已关闭）
- Date: 2026-09-15
- Closure date: 2026-10-01
- Decision owner: SpecForge 产品负责人
- Scope: 仓库级产品规格、架构、治理文档与其自动化消费者的权威定位

## Context

当前仓库同时存在 Kiro 工作规格、历史标准、ADR、治理实施方案、实施进度和报告。部分下游脚本与测试把 `.kiro/specs/v6-architecture-overview/requirements.md` 和 `design.md` 当作当前产品权威；产品负责人已明确 `.kiro/` 不是产品权威目录。继续沿用该假设会使发布门禁、修复和删除决策依据错误来源。

## Decision

1. `.kiro/` 不是 SpecForge 当前产品需求或产品架构的权威根目录。分类完成后，其历史内容已进入 `docs/archive/kiro/**`，不得作为发布范围、产品架构、部署路径或删除决策的最终依据。
2. 本 ADR 暂停并覆盖 ADR-013 与《SpecForge 架构一致性治理最终实施方案》中将 `.kiro/specs/v6-architecture-overview/requirements.md`、`design.md` 指定为当前产品权威的边界表述；被覆盖的文字保留为历史决策证据。
3. 本 ADR 不创建新的产品需求或产品架构事实源。正式结果已经登记为 `docs/product-specification/specforge-product-specification.md` 与 `docs/product-specification/authority-registry.md`。
4. 当前仍不得以代码、旧测试、README、handoff、历史实施方案或归档 Kiro 材料单独推导产品决定；冲突报告为 `AUTHORITY_CONFLICT`，证据不足报告为 `INSUFFICIENT_EVIDENCE`。
5. 新会话从根 `AGENTS.md` 进入，运行只读 `scripts/project-session-bootstrap.mjs`，读取唯一 `docs/project-status.md` 后恢复；旧 authority-model-recovery 与 current-handoff 已归档，不再是恢复入口。

## Confirmed conflicts to resolve

- 用户级路径：ADR-010/011 的 OpenCode 配置目录边界与安装器、Plugin、daemon 客户端中的 `~/.specforge` 实现不一致。
- daemon 生命周期：ADR-009 禁止 Plugin 自动启动 daemon，而当前 Plugin 仍有自动启动逻辑。
- 标准层级：v1.1 fused standard、v1.3 candidate、V6 Kiro 规格、ADR 与治理实施方案存在重叠的“标准/权威”声明。
- 发布消费者：current-release precheck、Scope Gate 和相关测试硬编码 V6 Kiro 路径。

## Consequences

- 先恢复权威模型，再继续 ERR-681、安装、真实项目验收或模块删除。
- 不删除 ADR、ERR、审计或报告；任何过时文件的降级、迁移或删除均需先完成真实消费者审计并取得产品负责人裁决。
- 现有硬编码 `.kiro` 消费者是待修复对象，不可被其自身测试结果反向证明为权威。

## Closure

产品负责人批准 AR-DEC-01—AR-DEC-04 后，本 ADR 的冻结条件已解除：SPS 与 Authority Registry 已建立，旧文档集中归档，根 `.kiro` 已退役，单一 Project Status 与只读 Bootstrap 已建立。本 ADR 继续保留为决策证据，不再承担当前状态或新会话入口职责。
