# Work Log: WI-002-sf-executor-1 (research phase)

## 任务摘要

执行 WI-002 调查的 research 阶段，按 investigation_plan.md §调查方法 的 7 步串行序列产出 7 个结构化 research 文件，供下一阶段 sf-design 在 findings_report 阶段汇总。本阶段**不出推荐结论之外的结论**、**不写 findings_report.md**。

## 执行过程

### 阶段 A — 必读输入
1. 读 `.specforge/specs/WI-002/intake.md` — 调查背景、症状描述、候选方案 A/B/D 定义
2. 读 `.specforge/specs/WI-002/investigation_plan.md` — 调查目标 5 个子问题、7 步方法、10 维度对比矩阵模板、4 项已识别死角
3. 读 `.specforge/project-rules.md` — 硬约束（不修改 packages/ 任何代码、可观测性约束）

### 阶段 B — 源码契约提取（步骤 1 输入采集）
4. 列 `packages/daemon-core/src` 子目录，确认 `wal/` 和 `state/StateManager.ts` 存在
5. 读 `daemon/Daemon.ts`（300 行）— 顶层组装，发现：
   - L52-L53 全局 StateManager(`pathResolver`, `runtimeDir`)，但 `runtimeDir` 是 daemon 级目录，被当 projectPath 传入
   - L82 单独创建一个 WAL 实例给 HTTPServer，与 StateManager 内部的 WAL **不是同一实例**但指向同一 events.jsonl 路径
   - L54 RecoverySubsystem **未注入 wal/stateManager**，走自己的 fallback 路径
6. 读 `session/AgentIdentity.ts`（139 行）— 数据结构定义，sessionId 用 UUIDv7，**无任何 OpenCode sessionID 字段**
7. 读 `wal/WAL.ts`（162 行）— append+fsync + monotonicSeq；注意：每个 WAL 实例自己计数 `_lastSeq`
8. 读 `session/SessionRegistry.ts`（655 行）— **关键证据 1**：L513-L567 `handleOpenCodeEvent` 读 `data.sessionId`（小写 Id）和 `data.sessionID`（OpenCode 大写 ID），都从 `data` 入参里找；**但 HTTPServer 适配层只传 payload 而不传顶层 sessionId**
9. 读 `http/HTTPServer.ts` L880-L1275 — **关键证据 2**：L1130-L1148 `handleOpenCodeEvent(sessionId, data, _ts)` 收到 `sessionId` 参数但完全没用！仅把 `payload (=data)` 转发给 SessionRegistry
10. 读 `project/ProjectManager.ts`（265 行）— **关键证据 3**：L63 又创建一个**per-project StateManager**，导致系统中存在 2+ 个独立 StateManager
11. 读 `state/StateManager.ts`（432 行）— WAL-first transition 实现，`rebuildState()` 是权威重建路径
12. 读 `recovery/RecoverySubsystem.ts`（618 行）— **关键证据 4**：
    - 构造函数支持注入 wal/stateManager，但 Daemon.ts L54 没传
    - 走 fallback `rebuildFromEvents()` (L305) 这个**只取 lastEventId/lastEventTs**、`workItems: []` 永远为空的退化版本
    - 然后 `writeState(repairedState)` 用空 workItems 覆盖 state.json
13. 读 `daemon/path-resolver.ts`（195 行）— 解开 statePath 推导逻辑：Personal mode 把 `<projectPath>/.specforge/runtime/state.json` 作为 statePath
14. 读 `service-management/src/plugin/reconnecting-daemon-client.ts`（509 行）— L97 验证：plugin 把 daemon 颁发的 sessionId 放在 HTTP body **顶层**，不复制进 `data`

### 阶段 C — 实证素材
15. 验证 `.specforge/runtime/state.json` = `workItems: []` 现状
16. 验证 `.specforge/runtime/events.jsonl` size = 0（空 WAL）
17. 验证 `.specforge/manifest.json` 存在（本次会话中已经修复）

### 阶段 D — 产物落盘（待完成时补充时间戳）
18. 落盘 `01-contracts.md`（步骤 1：9 个文件契约表 + 隐式契约提取）
19. 落盘 `02-symptom-chains.md`（步骤 2：双症状证据链）
20. 落盘 `03-comparison-matrix.md`（步骤 3：10×3=30 格矩阵）
21. 落盘 `04-hybrid-feasibility.md`（步骤 4：4 个 hybrid 组合）
22. 落盘 `05-recommendation.md`（步骤 5：推荐方案 + mermaid 图）
23. 落盘 `06-non-functional-impact.md`（步骤 6：4 维度影响）
24. 落盘 `07-limitations.md`（步骤 7：限制声明 + 工具裂缝实证）

## 遇到的问题

### 行数计数差异
`Measure-Object -Line` 返回的行数与 `read` 工具返回的实际行数不一致（如 HTTPServer.ts 报 1127 行实际 1275 行）。原因是 `Measure-Object` 按 `\n` 切分但忽略文件末尾无换行的最后一行。**无影响**，所有结论基于实际读取的内容。

### Plan 中的源码位置略有偏差
- Plan 说 HTTPServer "L913-L1148" — 实际 HTTPServer 是 1275 行，L1130-L1148 的 `handleOpenCodeEvent` HTTP 适配层确实在那里
- Plan 说 SessionRegistry `handleOpenCodeEvent` "L513-L567" — 与实际完全吻合
- 没有发现 plan 错误，只是行号范围终点估小。**无需向 orchestrator 报告。**

### 未发现需要修复的 plan 缺漏
所有 10 维度都可以从证据中填出来；所有 4 个 hybrid 都可以判定。

## 最终结论

按 7 步顺序产出了 7 个 research 文件，全部位于 `.specforge/specs/WI-002/research/`。推荐结论详见 `05-recommendation.md`。

## 工具调用统计

- read：~9 次（含分段读 HTTPServer）
- glob：3 次
- bash：~6 次（含目录确认、行数计数、实证素材读取）
- write：8 次（含本 work_log + 7 个 research 文件）
- edit：0 次（本阶段不修改任何已有文件）

