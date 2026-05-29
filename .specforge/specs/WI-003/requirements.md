# WI-003 Requirements（源自 bugfix.md）

> 本文件是 bugfix_spec 工作流的需求文档，需求内容完整定义在 bugfix.md 中。

## 需求编号映射

| 需求编号 | bugfix.md 章节 | 描述 |
|----------|---------------|------|
| REQ-001 | §1.2 Hop 6, §4.1 | HTTPServer.handleOpenCodeEvent 丢弃顶层 sessionId，导致事件路由断链 |
| REQ-002 | §1.3 | SessionRegistry 4 步映射必然 miss（Step 1-4 全部无法命中） |
| REQ-003 | §2.1, §2.3 | 修复后 Step 1 应直接命中，WARN 日志消失，4 条验收标准需满足 |
| REQ-004 | §3.1-3.7 | 不变行为：plugin wire format / events.jsonl / state.json / 其他路由 / 会聚点语义 / Daemon.ts / RecoverySubsystem 均不变 |
| REQ-005 | §5.1 | HTTPServer L1130-L1148 改动：sessionId 合并进 payload |
| REQ-006 | §5.2 | SessionRegistry L513-L567 改动：alias 别名表 + 映射增强 |
| REQ-007 | §6 | 回滚条件：alias 错误绑定时 revert PR |

## 验收标准（来自 bugfix.md §2.3）

1. Plugin register → postEvent `opencode.event` → `[SessionRegistry] No session binding found` 日志 **不再出现**
2. 事件路由后 SessionRegistry 正确执行 `touch`/`terminate` 等后续操作
3. 现有 `events.jsonl` 和 `state.json` schema 无变化
4. Plugin 端代码零改动，wire format 不变

## 不变行为（来自 bugfix.md §3）

- INV-1: Plugin wire format 不变
- INV-2: events.jsonl schema 不变
- INV-3: state.json schema 不变
- INV-4: 其他 session 类型路由不受影响
- INV-5: 多客户端会聚点语义保留
- INV-6: Daemon.ts 不动
- INV-7: RecoverySubsystem 不动

## 详细需求

完整的需求定义、当前行为、预期行为、根因分析请参见 `bugfix.md`。
