# SPS-1.0 Conformance Gap 历史快照

> Status: HISTORICAL_EVIDENCE_ONLY
>
> Archived: 2026-10-11
>
> Source: `docs/product-specification/specforge-product-specification.md` 原第 20 章
>
> 本文件只保存 SPS-1.0 建立阶段 CG-001—CG-014 的关闭历史，不是当前产品规格、活动状态或实施入口。

- CG-001【RESOLVED】：canonical user root 与 handshake 已统一为 `<OpenCode config>/sf-user` 和 `runtime/handshake.json`。
- CG-002【RESOLVED】：Thin Plugin、thin-client、CLI、service-management 的 current user-path consumers 已完成收敛。
- CG-003【RESOLVED】：Thin Plugin 已移除 Daemon auto-start / spawn 生命周期责任。
- CG-004【RESOLVED】：`runtime/wal.jsonl` current contract 已退役，统一为 `runtime/events.jsonl`。
- CG-005【RESOLVED】：D09 deferred multi-view paths 已从 current Layout/API 移出。
- CG-006【RESOLVED】：current schema validation 已迁入 `@specforge/types/schema-contract`；Migration package 及 current workspace/release surface 已退出。
- CG-007【RESOLVED】：Multimodal、Self-Healing、Plugin Loader 已无 Git 跟踪源码/package、workspace 或 current release surface；本地忽略的构建残留目录不构成产品模块。
- CG-008【RESOLVED】：Daemon production instantiation/caller、neutral contract 与 OpenCode HTTP transport 已实现；OpenCode 1.18.34 real binary 已通过 release `specforged` 的 session create、no-reply system prompt、session read 与 abort 端到端验证；产品负责人已批准状态升级为 `ENABLED`。
- CG-009【RESOLVED】：Distribution Kiro spec 已归档；release CLI 已移除 `specforge init` 注册与 npm-global smoke runner，当前 CLI/installer 帮助不再宣称 `~/.specforge`。不可达的 init/wizard、installation writer、daemon healthcheck、install-source 判断、CLI 专用 lock/filesystem adapter 及旧 distribution 测试均已退出；发布验证器与 schema 单调性检查按独立 build consumer 保留，`version --json` 仅对当前 `sf-user` 下的旧安装记录执行无写入探测。
- CG-010【RESOLVED】：release precheck / Scope Gate 已直接消费 SPS-1.0 hash-bound release authority projection。
- CG-011【RESOLVED】：fused standard 与 v1.3 文档已归档并降级；current types、workflow-runtime、daemon governance 源码与 `sf-design` Agent 已统一声明 SPS-1.0 负责产品边界、当前模块/Tool/Gate/schema 与回归测试负责可执行合同，归档 v1.1 仅作历史证据。v11 名称继续作为实现版本标识，不构成权威来源声明。
- CG-012【RESOLVED】：Workflow Runtime 的生产事件集成只依赖注入的 `IEventBus` port；测试使用包内 port test double，package/dev lock、当前部署文档均不再消费 Daemon。`STATE_ADVANCEMENT_SUBJECTS` 由 Workflow Runtime 单一定义并从包根导出，Daemon 沿合法的 Daemon → Workflow Runtime 方向消费。
- CG-013【RESOLVED】：重复 Write Guard、Code Permission、Changed Files Audit 与旧 Daemon policy adapter 已退出；Permission Engine 拥有 canonical `decideWritePermission`，Daemon 仅保留 enforcement adapter、权威状态装配、HardStop、授权核验与审计。HTTP、shell 和工具写入口消费同一 canonical decision，Plugin 观测事件不冒充授权决策。
- CG-014【RESOLVED】：current handshake consumers 已统一到 `<OpenCode config>/sf-user/runtime/handshake.json`。
