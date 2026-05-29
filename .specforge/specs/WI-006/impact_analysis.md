# WI-006 Impact Analysis: SessionRegistry WAL 化（Phase 2 — D 方案核心）

---

## 变更范围

### 功能范围

本次变更属于 A+D Hybrid 分阶段迁移路径的 **Phase 2**，核心目标是将 SessionRegistry 的 4 个内存 Map（`pendingSessions`、`activeSessions`、`projectBindings`、`aliasMap`）从纯内存态改为 WAL-first 持久化，使 daemon 重启后可通过 WAL 重放完整恢复 session bindings。

### 变更项逐项分析

#### 1. WAL schema_version 协商机制（前置）

| 维度 | 分析 |
|------|------|
| **当前状态** | `WAL.ts` L16 硬编码 `schemaVersion = '1.0'`，L92 `createEvent` 写死 `schema_version: '1.0'`。无版本协商或演进机制。 |
| **变更内容** | 引入 schema_version 协商/演进机制，允许新增 `category='session'` 事件类型。 |
| **影响模块** | `WAL.ts`（构造函数、createEvent 方法、新增版本协商逻辑） |
| **影响评估** | 修改 WAL 核心写路径。`createEvent` 被 StateManager.transition（L143）和未来 SessionRegistry 所有写方法调用，是全局热路径。schema_version 协商失败不得阻塞现有 `category='state'` 事件的写入（向后兼容底线）。 |
| **兼容性** | 现有 events.jsonl 的 `schema_version: '1.0'` 事件必须正常读取。新事件可写 `'2.0'` 或保持 `'1.0'` + 新 category，取决于协商策略。 |

#### 2. 新增 WAL event categories: session.*

| 维度 | 分析 |
|------|------|
| **新增事件类型** | `session.registered`、`session.bound`、`session.activated`、`session.terminated`、`session.alias_bound`、`session.touched`（高频，需 throttle） |
| **影响模块** | WAL（新增 category 路由不敏感，但 schema_version 需支持）、SessionRegistry（所有写方法需在 WAL.appendEvent 后 in-memory apply）、RecoverySubsystem（rebuild 需识别新 category） |
| **事件量评估** | `session.touched` 是高频事件（每次 OpenCode heartbeat 都触发），若不 throttle 会导致 events.jsonl 急剧膨胀。建议 throttle 策略：每 session 每分钟最多 1 次 `session.touched` WAL 写入。其他 5 种事件均为低频（session 生命周期事件），单次操作 ≤ 1 次 WAL write。 |
| **性能影响** | 当前 StateManager.transition 每次状态变更 1 次 WAL fsync（~3 syscall，WAL L51-L65）。SessionRegistry 写方法增加同样的 1 次 WAL fsync 开销。`registerPluginSession`（每次插件启动 1 次）、`bindProject`（每次项目绑定 1 次）、`activate/terminate`（每次 session 生命周期变更 1 次）—— 总体增量 WAL 写入约 3-5 次/session 生命周期，对单进程 daemon 不构成性能瓶颈。 |

#### 3. SessionRegistry 所有写方法 → WAL-first 模式

| 维度 | 分析 |
|------|------|
| **模板参考** | StateManager.transition L137-L161（createEvent → appendEvent → applyInMemory） |
| **需转换的方法** | `registerPluginSession`（L168）、`registerPending`（L212）、`activate`（L241）、`terminate`（L264）、`bindProject`（L464）、`handleOpenCodeEvent` 的 fallback `registerPluginSession`（L558）、`cleanupExpiredSessions`（L125，如需记录 session.expired） |
| **转换要点** | 每个写方法从"直接 in-memory Map.set"变为"(1) createEvent → (2) WAL.appendEvent → (3) in-memory apply"三步。WAL 写失败时方法必须抛错（fail-fast），不得静默降级为 in-memory only。 |
| **SessionRegistry 构造函数变更** | 需注入 WAL 实例。当前构造函数仅接收 `EventBus` + `sessionTimeoutMs`，需新增 `wal: WAL` 参数。 |
| **风险点** | `registerPluginSession` L168-L188 包含幂等逻辑（L170-L175 检查已有绑定）。WAL-first 模式下，幂等检查发生在 WAL 写入之前，需确保 replay 时幂等性仍成立（replay 不重复创建）。 |

#### 4. SessionRegistry.startupReplay(events) 方法

| 维度 | 分析 |
|------|------|
| **功能** | 从 WAL 读取 `category='session'` 事件，重放 registered/activated/bound/terminated/alias_bound，恢复 4 个 Map |
| **调用时机** | RecoverySubsystem.checkAndRepair 的 rebuild 阶段（Daemon.ts start() L149 上下文） |
| **设计参考** | RecoverySubsystem.reconnectOldSessions L485-L523 的代码模式（读取事件 → 差集计算 → 恢复），但从"网络探测"改为"纯本地 WAL 重放" |
| **幂等性要求** | replay 必须幂等——同一事件多次 replay 不应产生副作用（如重复 Map.set 不会出错，但 terminated 后再 registered 不应覆盖 history 记录） |

#### 5. RecoverySubsystem.checkAndRepair 调用 startupReplay

| 维度 | 分析 |
|------|------|
| **当前流程** | `checkAndRepair` L82-L142：读取 events → rebuildState（workItems）→ 一致性检查 → 修复 |
| **变更** | 在 `stateManager.rebuildState()`（L90）之后，新增 `sessionRegistry.startupReplay(sessionEvents)` 调用 |
| **依赖注入** | RecoverySubsystem 当前已注入 `WAL` + `StateManager`（L52-L56）。需新增注入 `SessionRegistry`。 |
| **启动序列影响** | Daemon.ts L149 `recoverySubsystem.checkAndRepair()` 目前在 `stateManager.initialize()`（L147）之后、`sessionRegistry.start()`（L165）之前。startupReplay 在 sessionRegistry.start() 之前执行，此时 EventBus 订阅尚未建立，replay 不会触发 session.* 事件传播。 |

#### 6. WAL 写失败 → HTTP 5xx fail-fast

| 维度 | 分析 |
|------|------|
| **当前问题** | HTTPServer L1130-L1148 `handleOpenCodeEvent` 使用 `try/catch` + `console.warn` 吞错。WAL 写失败时 daemon 仍接受事件但不持久化——静默数据丢失。 |
| **变更** | WAL 写失败时 HTTP handler 返回 5xx（而非 200）。需要区分"可降级的非关键错误"（如 EventLogger.append 超时）和"不可降级的关键错误"（如 WAL.appendEvent 失败）。 |
| **影响范围** | `handleOpenCodeEvent`（L1130-L1148）、`handleSessionCompacting`（L1154-L1168）、可能还有 `handleToolInvoked`（L1101-L1124）中的 WAL 写入。 |
| **风险** | HTTP 5xx 会导致客户端重试，若磁盘持续异常会形成重试风暴。需配合重试退避策略。 |

#### 7. WAL 坏行容忍机制

| 维度 | 分析 |
|------|------|
| **当前问题** | `WAL.readAllEvents` L115-L130 对每行 `JSON.parse(line)`，任何一行 JSON 格式损坏都会抛错，导致整个 rebuild 失败。 |
| **变更** | 改为"跳过坏行 + 记录日志"，返回成功解析的事件子集。 |
| **影响** | `readAllEvents` 被 `RecoverySubsystem.checkAndRepair`（L84）、`RecoverySubsystem.reconnectOldSessions`（L487）、`WAL.getLastEvent`（L137）调用。坏行容忍改变了这些调用者的行为——返回的事件数组可能不完整，需确保 rebuild 逻辑对此有容错。 |

#### 8. session.touched throttle 策略

| 维度 | 分析 |
|------|------|
| **问题** | `session.idle` 事件（触发 `touch`）可高频到达（每秒多次）。若每次 touch 都写 WAL → events.jsonl 急剧膨胀 + fsync 开销增大。 |
| **策略** | 按 session 维度 throttle：同一个 sessionId 在 `throttle_interval`（建议 60s）内最多写 1 次 `session.touched` WAL 事件。 |
| **实现位置** | SessionRegistry.touch 或 handleOpenCodeEvent 的 `session.idle` case。 |

#### 9. 旧 events.jsonl 兼容

| 维度 | 分析 |
|------|------|
| **场景** | daemon 升级后，旧 events.jsonl 中只有 `category='state'` 事件，没有 `category='session'` 事件。 |
| **处理** | startupReplay 读取 events 时过滤 `category='session'`，若无匹配事件则跳过（返回空 replay）。daemon 启动后 SessionRegistry 为空，直到新 plugin register 产生新 session。 |
| **与 Phase 0 关系** | Phase 0（WI-003）建立的 alias 表仅 in-memory。升级到 Phase 2 后，alias 表通过 `session.alias_bound` WAL 事件持久化。 |

### 不在变更范围内

- Property 21 措辞重写（Phase 3）
- 删除老的 detectOldSessions / reconnectOldSessions 代码（Phase 3）
- events.jsonl 的 snapshot/compaction 机制（独立 WI）
- ProjectManager 的多项目 StateManager 拆分

---

## 风险评估

**总体风险等级：高**

### 风险矩阵

| # | 风险项 | 概率 | 影响 | 缓解策略 |
|---|--------|------|------|----------|
| R1 | **WAL schema_version 协商机制设计不当**导致现有 `category='state'` 事件写入被阻塞 | 低 | 致命 | 新增 category 不应阻塞已知 category 的写入；协商失败时回退到仅支持 `'state'`；单元测试覆盖新旧版本并存场景 |
| R2 | **SessionRegistry 写方法 WAL-first 转换遗漏**某条写路径 | 中 | 高 | 静态分析 SessionRegistry 所有 Map.set/delete 调用点，确保每个都有对应的 WAL event。代码审查 checklist 列出所有写路径 |
| R3 | **startupReplay 幂等性不足**导致重复 replay 产生脏数据 | 中 | 高 | replay 逻辑应基于"最终状态"而非"增量操作"——即 replay 后的 Map 状态等同于按序应用所有事件后的终态。属性测试（PBT）覆盖 replay 幂等性 |
| R4 | **session.touched throttle 过度**导致 session 超时判断失准 | 低 | 中 | throttle 仅控制 WAL 写入频率，in-memory touch 仍正常更新 `lastActiveAt`；WAL 中的 `session.touched` 仅用于 replay 时的近似恢复 |
| R5 | **WAL 写失败 fail-fast 导致 HTTP 5xx 风暴** | 低 | 中 | 客户端重试退避（指数退避 + jitter）；daemon 端可返回 `Retry-After` header |
| R6 | **坏行容忍导致静默数据丢失** | 低 | 高 | 坏行日志必须包含行号 + 原始内容摘要；rebuild 后一致性检查应报告"期望 N 条事件，实际恢复 M 条" |
| R7 | **Daemon 启动序列变更**引入竞态条件 | 中 | 高 | startupReplay 必须在 sessionRegistry.start()（EventBus 订阅建立）之前完成；需确保 httpServer.start() 到 sessionRegistry.start() 之间到达的事件被 buffer 或拒绝 |
| R8 | **旧 events.jsonl 兼容性断裂** | 低 | 高 | 所有 `readAllEvents` 的调用者必须容忍 category 字段不存在的事件；schema_version 协商不应拒绝 v1.0 事件 |

### 风险论证

- **跨 4 个核心模块变更**：WAL（基础设施层）+ SessionRegistry（会话层）+ RecoverySubsystem（恢复层）+ HTTPServer（接入层），任何一层的变更失败都会阻塞其他层。
- **WAL schema 演进无先例**：当前 WAL.ts 无任何版本协商机制（C7 隐式契约 (3)），本次是首次引入，需要全新设计。
- **所有 SessionRegistry 写路径转换**：从 `registerPluginSession` 到 `terminate`，6+ 个写方法全部从 in-memory 直接写入改为 WAL-first 两步写入，转换面广。
- **向后兼容要求严格**：必须与现有 events.jsonl（仅含 `category='state'` 事件）完全兼容，新旧 daemon 版本的事件文件必须互读。
- **启动序列关键路径**：startupReplay 插入到 Daemon.start() 的启动序列中，修改了启动时序，可能暴露之前被启动顺序掩盖的初始化依赖问题。

---

## 回归测试范围

### 必须回归的现有测试

#### 单元测试

| 测试文件 | 关注点 | 回归理由 |
|----------|--------|----------|
| `tests/unit/wal.test.ts` | WAL appendEvent、readAllEvents、monotonicSeq | schema_version 协商和坏行容忍修改 WAL 核心行为 |
| `tests/unit/session.test.ts` | SessionRegistry 注册/激活/终止/查找 | 所有写方法改为 WAL-first，需验证行为不变 |
| `src/session/SessionRegistry.test.ts` | SessionRegistry 单元测试 | 同上 |
| `tests/unit/session-registry-alias.test.ts` | 别名表查找逻辑 | alias_bound WAL 事件持久化后，alias 生命周期改变 |
| `tests/unit/state.test.ts` | StateManager 状态转换 | WAL schema_version 变更可能影响 createEvent |
| `src/state/StateManager.test.ts` | StateManager 单元测试 | WAL 是 StateManager 的基础设施层 |
| `tests/unit/http.test.ts` | HTTPServer 路由 | WAL 写失败 fail-fast 改变 HTTP 响应码 |
| `tests/unit/http-server-handleOpenCodeEvent.test.ts` | OpenCode 事件路由 | session.touched throttle 改变 handleOpenCodeEvent 行为 |
| `src/recovery/RecoverySubsystem.test.ts` | 恢复子系统 | startupReplay 新增调用点 + checkAndRepair 逻辑变更 |
| `tests/unit/daemon.test.ts` | Daemon 启动序列 | 启动顺序变更（startupReplay 插入点） |
| `src/event-bus/EventBus.test.ts` | EventBus 事件传播 | session.* 事件的新 producer 可能影响 EventBus 行为 |

#### 集成测试

| 测试文件 | 关注点 | 回归理由 |
|----------|--------|----------|
| `tests/integration/wal-singleton-e2e.test.ts` | WAL/StateManager 单例化端到端 | WAL 单例是本次变更的基础设施前提 |
| `tests/integration/opencode-event-routing.test.ts` | OpenCode 事件路由端到端 | 核心验证目标——daemon 重启后路由恢复 |
| `tests/integration/daemon-lifecycle.test.ts` | Daemon 全生命周期 | 启动序列变更 + session 状态恢复 |
| `tests/integration/daemon-integration.test.ts` | Daemon 集成测试 | WAL-first 写入 + fail-fast 行为 |
| `tests/integration/chaos-recovery.test.ts` | 混沌恢复测试 | 坏行容忍 + WAL 写失败场景 |
| `tests/integration/api-endpoints.test.ts` | API 端点测试 | HTTP 5xx fail-fast 新行为 |
| `tests/integration/existing-project-startup.integration.test.ts` | 已有项目启动 | 旧 events.jsonl 兼容性 |
| `tests/integration/personal-mode-e2e.test.ts` | 个人模式端到端 | 完整用户场景覆盖 |
| `tests/integration/pbt-state.test.ts` | PBT 状态测试 | replay 幂等性属性测试 |

#### 属性测试

| 测试文件 | 关注点 | 回归理由 |
|----------|--------|----------|
| `tests/property/property-20.test.ts` | Property 20（一致性修复） | rebuild 不动点定义扩展到 session bindings |
| `tests/property/property-21.test.ts` | Property 21（重连仅限启动期） | startupReplay 必须仅在 startup phase 执行 |
| `tests/property/property-5.test.ts` | Property 5（sessionId 唯一身份键） | WAL-first 不改变 sessionId 语义 |
| `tests/property/property-22.test.ts` | Property 22 | 可能涉及 session 相关不变式 |
| `tests/property/startup-flow-ordering.property.test.ts` | 启动流排序 | startupReplay 在启动序列中的位置 |
| `tests/property/ingest-nonblocking.property.test.ts` | 事件摄取非阻塞 | WAL 写失败 fail-fast 可能改变非阻塞语义 |
| `tests/property/register-idempotent.property.test.ts` | 注册幂等性 | WAL-first 模式下 registerPluginSession 的幂等性 |

### 必须新增的测试

| 测试 | 类型 | 描述 |
|------|------|------|
| WAL schema_version 协商 | 单元 | 旧 v1.0 事件正常读取 + 新 category 事件写入 + 协商失败降级 |
| WAL 坏行容忍 | 单元 | 混合正常行 + 损坏行 → 返回成功子集 + 日志记录 |
| SessionRegistry WAL-first 写入 | 单元 | 每个写方法验证 WAL.appendEvent 在 in-memory apply 之前调用 |
| SessionRegistry startupReplay | 单元 | 从 session.* 事件恢复 4 个 Map + 幂等性 + 空事件集 |
| 旧 events.jsonl 兼容 | 单元 | 无 session category 事件的文件 → replay 跳过 → 不报错 |
| session.touched throttle | 单元 | 同一 session 短时间内多次 touch → 仅首次写 WAL |
| HTTP WAL 写失败 fail-fast | 单元 | WAL.appendEvent mock 抛错 → HTTP 5xx 响应 |
| Daemon 重启 session 恢复 E2E | 集成 | 注册 plugin → 写入事件 → 模拟重启 → 旧 sessionId 路由命中 |
| 新旧 WAL 事件混合 E2E | 集成 | v1.0 state 事件 + v2.0 session 事件共存 → rebuild 成功 |
| WAL 坏行 + rebuild E2E | 集成 | events.jsonl 含损坏行 → daemon 启动成功 + 已恢复事件可用 |
| Replay 幂等性 PBT | 属性 | 任意 session.* 事件序列 replay N 次 → Map 终态一致 |

---

## KG 关联

### 直接相关的 KG 节点

#### Phase 1 前置（WI-005 已完成）

| 节点 ID | 类型 | 标签 | 关联 |
|---------|------|------|------|
| `WI-005:task:1` | task | StateManager 添加 getWal() 方法 | WI-006 通过 SessionRegistry 注入的 WAL 引用使用此方法 |
| `WI-005:task:4` | task | Daemon.ts 组装重构 | WI-006 依赖 Daemon.ts 中 WAL 单例化后的组装结构 |
| `WI-005:task:5` | task | ProjectManager 消除 per-project StateManager | WI-006 的 SessionRegistry 注入依赖单例 StateManager |
| `WI-005:code_file:1` | code_file | StateManager.ts | WI-006 复用其 WAL-first 模板（transition L137-L161） |
| `WI-005:code_file:5` | code_file | Daemon.ts | WI-006 修改启动序列（L149 上下文插入 startupReplay） |

#### 本 WI 将新增的 KG 节点（预期）

| 预期节点 ID | 类型 | 标签 |
|------------|------|------|
| `WI-006:code_file:1` | code_file | WAL.ts — schema_version 协商 + 坏行容忍 |
| `WI-006:code_file:2` | code_file | SessionRegistry.ts — WAL-first 写 + startupReplay |
| `WI-006:code_file:3` | code_file | RecoverySubsystem.ts — startupReplay 调用 + SessionRegistry 注入 |
| `WI-006:code_file:4` | code_file | HTTPServer.ts — WAL 写失败 fail-fast |
| `WI-006:code_file:5` | code_file | Daemon.ts — SessionRegistry 注入 WAL + 启动序列调整 |

### KG 边（预期新增）

| 源 → 目标 | 边类型 | 描述 |
|-----------|--------|------|
| WI-006 task → `WI-006:code_file:1` (WAL.ts) | modifies | schema_version 协商 |
| WI-006 task → `WI-006:code_file:2` (SessionRegistry.ts) | modifies | WAL-first 写转换 |
| WI-006 task → `WI-006:code_file:3` (RecoverySubsystem.ts) | modifies | startupReplay 集成 |
| WI-006 task → `WI-006:code_file:4` (HTTPServer.ts) | modifies | fail-fast |
| WI-006 task → `WI-006:code_file:5` (Daemon.ts) | modifies | 启动序列 + 注入 |

### 相关 WI 知识条目

| WI | 知识领域 | 与 WI-006 的关系 |
|----|----------|------------------|
| WI-002 | investigation → A+D Hybrid 推荐方案 | WI-006 是 Phase 2 的具体实现，直接执行 05-recommendation.md §5.5 Phase 2 的范围 |
| WI-003 | Phase 0 — HTTPServer sessionId merge | WI-006 的 session.touched/alias_bound 依赖 Phase 0 的顶层 sessionId 合并 |
| WI-004 | Phase 1 前半 — gate handler 修复 | 无直接代码依赖，但 WI-004 修复的 gate 是 WI-006 design review 的入口 |
| WI-005 | Phase 1 后半 — WAL/StateManager 单例化 | WI-006 的所有 WAL-first 写入依赖 WI-005 完成的单例化 |

### 不变式节点

| 不变式 | 当前状态 | WI-006 影响 |
|--------|----------|-------------|
| Property 5（sessionId 唯一身份键） | 由 SessionRegistry L46-L48 保证 | **不受影响**：WAL-first 不改变 sessionId 语义 |
| Property 20（一致性修复） | 由 RecoverySubsystem L7-L11 保证 | **扩展**：rebuild 不动点从"只覆盖 workItems"扩展到"覆盖 session bindings + workItems" |
| Property 21（重连仅限启动期） | 由 RecoverySubsystem L13-L17 保证 | **语义变更**：从"启动期试探重连 OpenCode 进程"变为"启动期 WAL 重放重建绑定"，性质从"网络探测"变为"纯本地状态重建" |
| C7 隐式契约 (3)（WAL schema_version 硬编码） | WAL L16/L92 硬编码 '1.0' | **消除**：引入显式 schema_version 协商机制 |

---

## 非功能性约束映射

| 维度 | 约束 | WI-006 影响 |
|------|------|-------------|
| **性能** | 不要求基准测试，但需讨论数量级 | SessionRegistry 每次写操作新增 ~1 次 WAL fsync（3 syscall）。单个 session 生命周期（register → activate → bind → N×touch → terminate）约 3+N 次 WAL 写入。touch throttle 后 N ≤ 1/min。对单进程 daemon 不构成瓶颈。 |
| **可靠性** | 必须保留多客户端会聚点语义和 daemon 重启后状态可恢复 | **核心改进**：daemon 重启后 session bindings 通过 WAL 重放恢复，消除 "No session binding found" WARN。fail-fast 确保磁盘异常时不静默丢数据。 |
| **兼容性** | 迁移路径必须考虑 state.json 和 events.jsonl 演进 | 新增 `category='session'` 事件类型；旧 events.jsonl 无此 category，rebuild 自动跳过。schema_version 协商确保新旧版本事件共存。state.json schema 不变。 |
| **可观测性** | 应说明对现有日志的影响 | `[SessionRegistry] No session binding found` WARN 在 WAL 重放恢复后应显著减少。新增 replay 摘要日志："replayed N session events, restored M bindings"。坏行容忍新增 `[WAL] Skipping corrupted line` WARN。WAL 写失败新增 `[HTTPServer] WAL write failed, returning 5xx` ERROR。 |
