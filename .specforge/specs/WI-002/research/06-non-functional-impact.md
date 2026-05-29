# 06 — 非功能约束影响（步骤 6，回答 Q5）

> 对 `05-recommendation.md` 推荐的 A+D 方案，沿 `project-rules.md` 的 4 条非功能约束分析。
> **明确指出"多客户端会聚点"语义在新架构由哪个模块承担**。

---

## 6.1 性能（数量级讨论，不做基准测试）

来自 `project-rules.md`：「不要求基准测试，仅需在 findings 里讨论数量级（如 WAL 写入频率）」

### 写入吞吐数量级

**现状**：StateManager.transition 已经是 WAL-first（参 `01 C8 显式不变式`）：
- 每次 transition 调用：1 次 `fs.appendFile` + 1 次 `fs.open('a')` + 1 次 `fsyncSync` + 1 次 `fs.close` + 1 次 `fs.writeFile`（state.json 整文件覆盖）+ 1 次 fsync state.json = 约 **6 syscall + 2 fsync** 每 transition
- 触发频率：sf_state_transition 工具调用，**人为驱动**，估算 **<10 次/分钟**

**推荐方案下增量**：
- Phase 0 (A)：**零增量**——只是 1 行修改，无新 syscall
- Phase 2 (D 核心)：每个 session 状态变更新增 WAL 事件 = 同样的 6 syscall + 2 fsync 量级
- **关键问题**：`session.touched` 事件如果对每个 OpenCode tool 调用都写 WAL，则频率从"<10/min"飙升到"每个 OpenCode 工具调用 1 次"，**估算 ~100-1000/min 量级**
- **缓解方案（plan 阶段死角，仅记录）**：Phase 2 实施时 `session.touched` 走 batch 写（每 N 秒一次 flush）或完全不写 WAL（touched 只更新 in-memory，重启后丢失 touch 时间属可接受）

### 读取吞吐数量级

- 现状：events.jsonl 全量读 + 全量 JSON.parse（WAL L115-L130，`01 C7 隐式契约 (4)`）—— **O(n) 量级**
- 推荐方案下：D 阶段读取频率不增（只在 daemon 启动 1 次 rebuild）；但 events.jsonl 文件大小因 session WAL 化而增长。**估算 1 年运行后 ~MB-GB 级，rebuild 耗时 ~秒级**
- **缓解方案（plan 阶段死角，仅记录）**：D 阶段实施时需要规划 events.jsonl compaction / snapshot 机制——但属于 Phase 4+ 范畴，不在本 research 推荐路径内

### 数量级总结

| 操作 | 现状 | A+D Phase 2 完成后 | 数量级是否合理 |
|------|------|---------------------|----------------|
| State transition 写入 | ~10/min | ~10/min（无变化） | 是 |
| Session 注册/激活/终止 | 0 WAL 写（in-memory only） | ~10-100/min | 是 |
| Session touched | 0 WAL 写 | 可配置（touched 不写 WAL / batch flush） | 取决于配置 |
| events.jsonl 总大小 | 当前 0 byte（空 WAL） | 1 年累计 MB-GB | 需要 compaction（未在本 research 范围） |
| Rebuild 耗时（daemon 启动） | ~ms | ~秒级 | 启动期可接受 |

---

## 6.2 可靠性

来自 `project-rules.md`：「推荐方案必须保留"多客户端会聚点"语义和 daemon 重启后状态可恢复能力」

### 6.2.1 多客户端会聚点语义承担

**当前承担方（隐式）**：SessionRegistry（事实上是 4 个 in-memory Map），但**没有任何模块显式声明这是它的职责**。
- HTTPServer 是接入层，**不维护跨客户端状态**
- ProjectManager 维护 project 隔离，**不解决 session 路由**
- StateManager 是 workItem 状态权威，**不感知 session**
- RecoverySubsystem 启动期协调者，**运行期不参与**

**推荐方案下承担方（显式）**：**SessionRegistry**。理由：
1. 数据流 5.4 中所有客户端的 sessionId 都经过 SessionRegistry 的查找/路由（intake.md 描述的"机器级单例会聚点"语义本质就是"会话路由表 + 项目绑定表"，这两个表都在 SessionRegistry）
2. Phase 2 (D) 把 SessionRegistry 的所有写路径 WAL 化后，"会聚点"的状态成为可重建的——多客户端中任一客户端断线重连，daemon 都能从 WAL 恢复其绑定（数据流 5.4.2）
3. HTTPServer 退化为纯协议适配（解码、超时、合并 sessionId 到 payload），**不持有任何跨客户端聚合状态**

**关键架构断言**：**SessionRegistry 是机器级单例会聚点的唯一承担者**。其它模块（HTTPServer / ProjectManager / RecoverySubsystem / StateManager）通过 SessionRegistry 暴露的接口（lookupBySessionId / getProjectPath / bindProject / handleOpenCodeEvent 等）参与会聚，**不分担承担方角色**。

### 6.2.2 daemon 重启后状态可恢复能力

| 状态类别 | 现状可恢复性 | 推荐方案下可恢复性 |
|----------|--------------|----------------------|
| Work Item 状态 | yes（StateManager.initialize → rebuildState，但 statePath 嵌套 bug 实际写错位置，参 `02 症状 2 Hop 3-5`） | **yes 且 statePath 正确**（Phase 1 修嵌套 bug） |
| Session pending/active/history | **no**（getSnapshot 存在但启动期不 restore，`03 D3-A`） | **yes**（Phase 2 startupReplay） |
| Session→Project 绑定 (projectBindings) | **no** | **yes**（Phase 2） |
| Session 别名表（OpenCode↔daemon） | **no**（A 阶段为 in-memory only） | **yes**（Phase 2 把 alias_bound 也 WAL 化） |
| Active project list | partial（ProjectManager 在 registerProject 重新填充） | **yes**（启动期从 manifest.json + project.* WAL 事件重建） |

### 6.2.3 多客户端并发竞争（plan 阶段死角，复述）

`02 plan §调查范围-不包含` 已声明 "多客户端并发竞争实测缺席"。推荐方案下，**SessionRegistry 的 in-memory Map 不天然并发安全**（JS 单线程 event loop 保护其原子性，但跨 await 边界的 read-then-write 仍有 TOCTOU 风险，参 SessionRegistry L283-L294 lookupBySessionId 与 L457-L487 bindProject 之间）。本 research 仅基于代码推断认为"D 阶段 WAL 写为单线程 fs 排队，吞吐瓶颈在 fsync 而非并发竞争"，**未做实测**——属 plan 已识别死角。

---

## 6.3 兼容性

来自 `project-rules.md`：「推荐方案的迁移路径必须考虑现有 `.specforge/runtime/state.json` 和 `events.jsonl` 的演进」

### 6.3.1 events.jsonl schema 演进

- **现状**：每条事件含顶层 `schema_version: '1.0'` + `metadata.schemaVersion: '1.0'`（WAL L92, L103）。**无演进机制**（C7 隐式契约 (3)）
- **Phase 0**：完全兼容，events.jsonl 不动
- **Phase 1**：完全兼容，只动 statePath，events.jsonl 不动
- **Phase 2**：**新增 category='session' 事件**。兼容策略：
  - 旧 events.jsonl 不含 session 事件 → rebuild 时 session 状态从空开始（与现状语义一致）
  - 新 events.jsonl 含 session 事件 → rebuild 重建
  - 不需要事件迁移脚本
  - **但需要先升级 schema_version 协商机制**，否则未来的 reader 看到未知 category 会 silently 忽略——这是 Phase 2 的前置子任务

### 6.3.2 state.json schema 演进

- **现状**：`{ projectPath, schemaVersion, activeSessions, workItems, lastEventId, lastEventTs }`（StateManager L228-L237）
- **现状的坏味道**：`activeSessions: []` 字段**永远为空**——StateManager.buildProjectState L379-L390 把 activeSessions 硬编码为 `[]`。这是 Property 5 时代的遗留字段
- **推荐方案下**：state.json 可选添加 `aliasMap: Array<[opencodeSessionID, daemonSessionId]>`（Phase 0 引入但 in-memory only，Phase 2 持久化）。或者**新增 sessions.json checkpoint 文件**，state.json 不动 —— 推荐后者，避免 state.json 体积爆炸
- **现有 state.json**：可保留兼容性（rebuild 写入时跳过缺失字段）

### 6.3.3 manifest.json / handshake.json

- **不变**。Phase 0/1/2 均不动这两个文件
- 但需要补充本会话观察到的现象：`.specforge/manifest.json` 缺失会让 sf_state_transition 返回 `PROJECT_NOT_INITIALIZED`（参 `01 C9 上下文` 与 `sf-state-transition.ts` L17-L28）——这是初始化耦合点，**推荐 findings_report 中以 pointer 提及，作为后续 WI 处理**

### 6.3.4 Plugin wire 兼容性

`03 D5` 已展开：A 完全兼容（plugin 零改动）；D 完全兼容（plugin 不感知 daemon WAL）。

---

## 6.4 可观测性

来自 `project-rules.md`：「推荐方案应说明对现有日志（如 `[SessionRegistry] No session binding found ...`）的影响」

### 6.4.1 现有日志变化

| 日志 | 当前位置 | Phase 0 后 | Phase 2 后 |
|------|----------|------------|------------|
| `[SessionRegistry] No session binding found for OpenCode event subtype: X, projectPath: Y` (SessionRegistry L548) | hot path 高频出现 | **消失**（Step 1 顶层 sessionId 命中） | 消失 |
| `[SessionRegistry] Unhandled opencode event subtype: X` (L565) | 偶发 | 不变 | 不变 |
| `[INGEST] Event received without sessionId — plugin may need upgrade` (HTTPServer L961) | 偶发 | 不变 | 不变 |
| `[INGEST] SessionRegistry.handleOpenCodeEvent error for session X` (L1146) | 罕见 | 不变 | 不变 |
| `[SHUTDOWN] Step N: ...` | 关机时 | 不变 | 不变 |

### 6.4.2 新增日志（推荐方案下）

| 新增日志 | 时机 | 量级 |
|----------|------|------|
| `[SessionRegistry] alias hit: opencodeSessionID=X → daemonSessionId=Y` | Phase 0 起，每次别名表命中 | hot path 高频 |
| `[SessionRegistry] WAL appended: session.registered <sid> for <path>` | Phase 2 起 | 同 register 频率 |
| `[SessionRegistry] startupReplay: replayed N session events, restored M bindings` | Phase 2 起，daemon 启动 1 次 | 1 次/启动 |
| `[RecoverySubsystem] checkAndRepair (with stateManager+wal): isValid=Y, issues=N` | Phase 1 起 | 1 次/启动 |
| `[WAL] schema_version bump 1.0 → 1.1 (session category)` | Phase 2 起 | 1 次/迁移 |

### 6.4.3 trace 工具建议（plan 阶段死角，仅记录）

- D 阶段完成后，**需要"events.jsonl replay CLI"** 让开发者在不重启 daemon 的情况下重放 WAL 重现某时刻 SessionRegistry/StateManager 状态。这是 D8（debuggability）"路径变长但有统一入口"成立的前提工具。**本 research 不展开实现，仅建议 design 阶段考虑**。

---

## 6.5 4 条约束 × 4 个 Phase 矩阵总览

| 约束 | Phase 0 (A) | Phase 1 (单例化) | Phase 2 (Session WAL) | Phase 3 (清理) |
|------|-------------|--------------------|-------------------------|-----------------|
| **性能数量级** | 零增量 | 零增量 | +~100/min WAL 写（可 throttle） | 零增量 |
| **可靠性 - 会聚点语义** | SessionRegistry 隐式承担（不变） | 不变 | **SessionRegistry 显式承担**（D9 Property 5 时代不变式继续生效，但语义重新阐述） | 不变 |
| **可靠性 - 重启恢复** | 仍不可恢复 session | workItems 可恢复（statePath 修复） | **session 完全可恢复** | 不变 |
| **兼容性 - events.jsonl** | 完全兼容 | 完全兼容 | 新增 category（向后兼容） | 不变 |
| **兼容性 - state.json** | 完全兼容 | statePath 路径迁移（嵌套→项目根，旧文件保留为孤儿） | 可选新增 aliasMap 字段或 sessions.json checkpoint | 不变 |
| **兼容性 - plugin wire** | 完全兼容 | 完全兼容 | 完全兼容 | 完全兼容 |
| **可观测性** | "No session binding" 消失；新 alias hit 日志 | RecoverySubsystem 真实 rebuild 日志 | 大量 session WAL trace + startupReplay 摘要 | Property 21 措辞同步 |

---

## 6.6 显式断言（供 findings_report 引用）

> **断言**：在推荐的 A+D 方案下，**多客户端会聚点语义由 SessionRegistry 显式承担**。这一断言成立的前提是 Phase 2 把 SessionRegistry 全部写路径 WAL 化，使其内部状态可重建——否则 SessionRegistry 仅是 in-memory 缓存，"会聚点"在 daemon 重启时实际消失。**因此 Phase 0 单独存在不构成完整的"会聚点架构"**，仅是症状 1 的快速止血。
