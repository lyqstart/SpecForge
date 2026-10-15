# ADR-016: 验证证据完整性与已关闭 Work Item 补偿恢复

- Status: Accepted
- Date: 2026-10-15
- Decision owner: SpecForge 产品负责人
- Scope: Verification Gate、Close Gate、Evidence Manifest 与普通关闭恢复

## Context

t3 的 WI-0001 已关闭，机器测试和 Formal Version 仍有效，但九条 L5 浏览器验收的登记路径全部指向验证报告自身；用户确认没有报告所称原始双浏览器验收记录。报告与清单声明时间晚于 StateManager Close 事件。现有 `recover_invalid_closure` 只消费 Formal Version/Git 无效性，无法从证据层缺陷合法恢复原 WI。

## Decision

1. Verification 与 Close 共享同一个来源、哈希和声明时间完整性检查；L5 人工验收须有独立原始文件并绑定逐字节 SHA-256。Verifier 使用受控、不可覆盖的 `verification_evidence` 产物入口保存原始文本或图片，Runtime 返回哈希与记录时间。
2. 对已关闭 WI，声明时间须与原 StateManager Close 事件比较；Agent 自述与机器测试不能补造人工验收。
3. 原关闭所依赖的实现／验证证据由共享判据证明无效时，先归档旧代证据，再由 `recover_invalid_closure` 执行 `closed → implementation_ready`；原 Candidate、Merge 与审批继续保留，代码权限仍撤销。
4. Project Spec 本身无效继续使用 Authority Registry D14 的独立 `candidate_preparing` 补偿路径，不混用。

## Consequences

- 既有通过记录保留为历史事实，不得被改写成未发生；重新验证须产生新证据。
- 浏览器技术测试须标明执行者；实际用户验收只能由用户本人确认，不由 Agent 代称。
- Gate、恢复处理器、工具说明、测试和正式部署需要同步更新。
