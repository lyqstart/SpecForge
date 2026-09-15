# ADR-014: 权威体系恢复冻结

- Status: Accepted
- Date: 2026-09-15
- Decision owner: SpecForge 产品负责人
- Scope: 仓库级产品规格、架构、治理文档与其自动化消费者的权威定位

## Context

当前仓库同时存在 Kiro 工作规格、历史标准、ADR、治理实施方案、实施进度和报告。部分下游脚本与测试把 `.kiro/specs/v6-architecture-overview/requirements.md` 和 `design.md` 当作当前产品权威；产品负责人已明确 `.kiro/` 不是产品权威目录。继续沿用该假设会使发布门禁、修复和删除决策依据错误来源。

## Decision

1. `.kiro/` 不是 SpecForge 当前产品需求或产品架构的权威根目录。其内容在完成逐项分类前只能作为 Kiro 工作规格、实现线索或历史材料，不得作为发布范围、产品架构、部署路径或删除决策的最终依据。
2. 本 ADR 暂停并覆盖 ADR-013 与《SpecForge 架构一致性治理最终实施方案》中将 `.kiro/specs/v6-architecture-overview/requirements.md`、`design.md` 指定为当前产品权威的边界表述；被覆盖的文字保留为历史决策证据。
3. 本 ADR 不创建新的产品需求或产品架构事实源。唯一正式产品规格的最终位置、文件集合与优先级，必须先完成全仓权威—消费者矩阵并由产品负责人裁决后，才可在一个显式的 authority registry 中登记。
4. 在 registry 建立前，任何产品范围、模块去留、用户级路径、daemon 生命周期、安装器或发布门禁变更必须先报告 `AUTHORITY_CONFLICT` 或 `INSUFFICIENT_EVIDENCE`；不得以代码、旧测试、README、handoff、实施方案或 `.kiro` 单独推导产品决定。
5. 新会话的必读入口为：`AGENTS.md`、本 ADR、`docs/implementation/architecture-consistency/authority-model-recovery.md`、错误台账、当前 Git `main`。它们定义恢复任务和取证顺序，不替代未来正式产品规格。

## Confirmed conflicts to resolve

- 用户级路径：ADR-010/011 的 OpenCode 配置目录边界与安装器、Plugin、daemon 客户端中的 `~/.specforge` 实现不一致。
- daemon 生命周期：ADR-009 禁止 Plugin 自动启动 daemon，而当前 Plugin 仍有自动启动逻辑。
- 标准层级：v1.1 fused standard、v1.3 candidate、V6 Kiro 规格、ADR 与治理实施方案存在重叠的“标准/权威”声明。
- 发布消费者：current-release precheck、Scope Gate 和相关测试硬编码 V6 Kiro 路径。

## Consequences

- 先恢复权威模型，再继续 ERR-681、安装、真实项目验收或模块删除。
- 不删除 ADR、ERR、审计或报告；任何过时文件的降级、迁移或删除均需先完成真实消费者审计并取得产品负责人裁决。
- 现有硬编码 `.kiro` 消费者是待修复对象，不可被其自身测试结果反向证明为权威。
