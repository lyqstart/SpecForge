# ADR-013: 当前发布边界与不保留旧项目兼容

- Status: Accepted
- Date: 2026-08-26
- Scope: V6 当前发布边界、实际模块收敛、旧项目兼容策略、测试与发布验证
- Decision owner: SpecForge 产品负责人

## Context

SpecForge 当前同时保留了三类材料：V6 产品架构、后续架构一致性治理扩展，以及历史版本留下的兼容读取、旧状态、旧路径和旧测试消费者。若不先冻结当前发布边界，维护工作会反复在两种目标之间摇摆：一方面按 V6 当前架构修复，另一方面又为了旧项目或旧测试恢复已经废止的行为。

用户已经明确：当前产品不需要兼容旧项目。后续判断必须以当前真实业务目标、实际生产入口和 V6 产品架构为准，不能因为历史代码已经构建、旧测试仍存在或未来可能使用，就默认保留模块或兼容分支。

本决策形成时，V6 requirements/design 与下游治理消费者之间存在旧项目兼容、运行时 feature flag 和模块启用状态冲突。当前执行顺序已经固定为：先对齐 V6 产品范围与产品架构权威，再同步本 ADR、治理总方案和模块 specs，最后才冻结模块去留并修改实现。任何下游文件中的旧表述都不能反向覆盖已经冻结的 V6 当前发布边界。

## Decision

1. SpecForge 当前发布只支持经过本次架构收敛后由 V6 权威明确列入范围的产品形态、模块、状态、路径、Schema 和运行入口。
2. 不提供 V5、V5 以前版本或其他旧项目现场到当前发布的产品兼容承诺。
3. 不为旧 Work Item ID、旧状态名、旧用户目录、旧插件协议、旧 Manifest 字段或旧测试夹具增加新的兼容分支。
4. 历史治理记录、ERR 账本、不可变 Gate Attempt、审计证据和 Git 历史必须保留。保留历史证据不等于继续支持历史产品行为。
5. 当前发布内部仍必须保留数据安全和失败关闭能力，包括当前 Schema 校验、损坏检测、当前发布升级验证以及对未知更高版本的拒绝。它们不属于旧项目兼容。
6. 每个已经构建的模块必须归入以下唯一类别之一：
   - `CURRENT_RELEASE_CORE`：当前业务主链路不可缺少；
   - `CURRENT_RELEASE_SUPPORTING`：不直接承载主流程，但被当前核心能力真实调用；
   - `BUILT_NOT_ENABLED`：已经构建，但当前生产入口、部署或业务流程未启用；
   - `LEGACY_ONLY`：只服务已废止版本、路径、协议、状态或项目；
   - `HISTORICAL_EVIDENCE_ONLY`：只作为历史证据保留，不参与构建、部署或运行。
7. `BUILT_NOT_ENABLED` 不能无限期保留。只有 V6 当前权威明确把它列为本发布能力并存在可验证启用计划时才保留；否则应在依赖闭包和验证门禁完成后删除。
8. `LEGACY_ONLY` 不进入当前发布。其代码、测试、安装内容和运行分支应在权威范围同步后删除；历史文档与错误记录不得删除。
9. 现有 19 项未提交修改必须按实际生产责任和治理证据逐项判断。修复当前现役能力的修改保留；只服务旧项目兼容、已退出模块或错误架构的修改不保留。
10. 测试必须验证当前正式合同。不得为了让旧测试通过而恢复废止状态、旧 ID、旧路径或旧协议。
11. 产品层面的第一项修改必须发生在 V6 产品架构权威：先更新 `requirements.md` 的业务边界，再更新 `design.md` 的模块、依赖、运行与部署结构。README、handoff、构建脚本和代码只能在权威冻结后作为下游消费者同步。
12. 物理删除模块、删除兼容分支或调整安装内容之前，必须完成实际入口、调用依赖、部署清单、状态权威、测试消费者和恢复边界的证据闭包。

## Authority boundary

> **Supersession notice（2026-09-15）**：本节将 V6 Kiro 文件指定为当前产品权威的部分，已由 [`ADR-014`](ADR-014-authority-model-recovery-freeze.md) 暂停。保留以下文字用于说明本 ADR 当时的决策背景，不得再作为当前发布或产品架构的唯一依据。

本 ADR 记录“为什么作出决定”和“决定了什么”，但不取代 V6 产品架构：

1. `.kiro/specs/v6-architecture-overview/requirements.md`：业务目标、发布范围和验收条件权威；
2. `.kiro/specs/v6-architecture-overview/design.md`：模块边界、依赖、数据流、运行与部署结构权威；
3. 本 ADR：已批准决策及理由；
4. `docs/design/SpecForge架构一致性治理最终实施方案.md`：如何治理和强制执行上述架构；
5. 代码、测试、安装器、脚本、README 和 handoff：下游实现或投影。

发生冲突时，必须先报告冲突并修改上游权威，不能直接用下游代码或测试建立第二套事实。

本决策在 V6 权威中的规范落点为：

- `requirements.md`：Introduction、Glossary、REQ-2、REQ-10、REQ-18、REQ-22、REQ-25、REQ-26、REQ-27、REQ-30、REQ-31；
- `design.md`："V6 不做边界"、0.1—0.9 当前发布架构基线、Migration Subsystem、Property 15 和 release gates；
- 下游 module specs：只能细化上述范围、依赖和验证，不得重新启用旧项目兼容或 P1/P2 runtime flag。

## ADR namespace note

`docs/adr/ADR-013` 属于仓库级 ADR 序列。`.kiro/specs/v6-architecture-overview/artifacts/adr-index.md` 使用 `V6-ADR-*` 作为 spec-local 命名空间，其中 `V6-ADR-013` 是插件沙箱范围。两者不是同一记录；引用仓库级决策时必须使用完整路径或完整标题，不能只写裸编号 `ADR-013`。

## Consequences

### Positive

- 当前架构只有一个发布目标，不再为旧项目兼容反复修改生产逻辑。
- “已构建”不再自动等于“当前产品必须保留”。
- 模块去留、19 项修改和回归修复都能按同一业务边界判断。
- 最终全量回归只验证实际发布内容，可信度高于包含历史失效消费者的表面全绿。

### Costs and risks

- 旧项目不能直接升级到当前发布；如需保留数据，只能另行设计一次性、版本明确的外部迁移项目，并重新取得用户决策。
- V6 requirements/design 的决定必须同步到治理总方案、module specs、实现和验证消费者，不能只改上游文档。
- 删除未启用或 legacy-only 模块前，必须承担完整依赖和部署审计成本。

## Implementation

详细执行顺序、验收门禁和停止条件见：

- `docs/implementation/architecture-consistency/current-release-boundary-and-module-convergence-plan.md`
- `docs/implementation/architecture-consistency/current-release-boundary-and-module-convergence-progress.md`
