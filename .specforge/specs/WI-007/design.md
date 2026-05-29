# WI-007 Design: Property 21 重写与悬空契约清理（Phase 3）

> 本文件是 design_delta.md 的 gate 兼容副本。详细内容见 design_delta.md。

> **需求追溯**: 本设计满足 intake.md 中定义的 4 项变更需求（需求 1: Property 21 注释重写; 需求 2: 老代码删除; 需求 3: 文档同步; 需求 4: 内部架构文档更新）。关联 WI-002 调查需求 REQ-6.5 (Property 5/21 会话身份不变式) 和 REQ-7 (RecoverySubsystem 一致性恢复)。

## 增量设计描述

本变更包含 6 个设计决策 (DD-1 到 DD-6):

- **DD-1**: Property 21 注释重写 (RecoverySubsystem L13-L17) — 从"reconnection"改为"WAL replay"
- **DD-2**: 删除 detectOldSessions (L458-L491) + reconnectOldSessions (L500-L538)，保留 attemptSessionReconnect/performSessionReconnect/getReconnectionScopeStatus
- **DD-3**: Daemon.ts L185 冗余调用删除 + L187 注释更新
- **DD-4**: property-21.test.ts 全文重写（4 个测试用例映射）
- **DD-5**: 文档同步 — .kiro/specs/ 4 文件 + DEVELOPMENT.md
- **DD-6**: RecoverySubsystem 内部 4 处 Property 21 注释同步

总变更：7 文件，~76 行删除 + ~162 行新增/重写。

## 受影响模块

| 模块 | 变更类型 | 影响 |
|------|---------|------|
| RecoverySubsystem | 注释重写 + 方法删除 | L13-L17, L46, L355, L357, L365 注释更新; L458-L538 方法删除 |
| Daemon | 调用点删除 | L183-L185 删除, L187 注释更新 |
| property-21.test.ts | 全文重写 | 从验证 reconnect 改为验证 WAL replay scope |
| .kiro/specs/ (4 files) | 措辞更新 | Property 21 语义描述更新 |
| DEVELOPMENT.md | 1 行更新 | Property 21 标题 |

## 兼容性影响

- API 删除: detectOldSessions/reconnectOldSessions (grep 确认仅 Daemon.ts + property-21.test.ts 调用，均在变更范围内)
- 保留: attemptSessionReconnect, getReconnectionScopeStatus (被现有测试广泛使用)
- Fallback: 若发现外部消费者，保留签名转调 startupReplay 并标 @deprecated
- 数据兼容: events.jsonl/state.json/sessions.json 不变

## 回归风险

**低风险**:
- R1: 未发现的调用者 → TypeScript 编译器即时捕获
- R2: 测试重写语义覆盖不足 → 新测试保留 startup-only 约束验证
- R3: 遗留引用 → tsc --noEmit 验证
- R4: 文档遗漏 → grep 验证
- R5: daemon-lifecycle 测试依赖旧调用 → 回归验证

## KG 追溯关系

| DD | impact_analysis 关联 | WI-002 关联 |
|----|----------------------|-------------|
| DD-1 | §1.1 L13-L17 | C6 显式不变式; D9-D |
| DD-2 | §1.1 L458-L538; §2.2; §2.3 | C6 隐式契约 (4) |
| DD-3 | §1.1 Daemon.ts L183-L188 | C1 隐式契约 (3) |
| DD-4 | §3.1 | — |
| DD-5 | §1.2, §1.3 | §5.5 Phase 3 (i) |
| DD-6 | §1.1 RecoverySubsystem | — |
