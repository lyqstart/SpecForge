# WI-005 Impact Analysis — WAL/StateManager 单例化

> **文档类型**: Impact Analysis (Change Request)  
> **基于素材**: WI-002 investigation research (01-contracts, 03-comparison-matrix, 05-recommendation §5.5)  
> **风险等级**: 中高  
> **变更范围**: `packages/daemon-core/src/` 内 6 个文件  

---

## 变更范围

### 概述

本次变更（Phase 1）是 WI-002 investigation 推荐方案 D 的前置步骤，目标是消除 daemon 核心中的 WAL/StateManager 多实例竞态问题，为 Phase 2（SessionRegistry WAL 化）奠定正确的单例基础。

变更涉及 4 个具体改项，每项映射到 WI-002 investigation 发现的特定隐式契约违约：

### 改项 1：消除 Daemon.ts L82 单独的 `this.wal`

| 维度 | 说明 |
|------|------|
| **根因** | C1 隐式契约 (1)：Daemon.ts 同时持有 2 个 WAL 实例（`stateManager` 内部一个 + `this.wal` 给 HTTPServer 一个），两者指向同一文件路径但 `_lastSeq` 各算各的 |
| **源文件** | `packages/daemon-core/src/daemon/Daemon.ts` |
| **涉及行** | L44（`private wal: WAL` 字段声明）、L82（`this.wal = new WAL(...)` 构造赋值）、L88（HTTPServer deps 注入 `wal: this.wal`） |
| **接口变化** | Daemon 的 `private wal` 字段删除；HTTPServer 的 deps 类型中 `wal` 改为引用 `stateManager` 暴露的 WAL 实例 |
| **需要新增的方法** | `StateManager.getWal(): WAL` — 暴露内部 WAL 实例供外部引用 |
| **影响面** | Daemon.ts 内部引用 + HTTPServer 构造参数来源变化。HTTPServer 内部对 `wal` 的使用方式不变（appendEvent、readAllEvents 等），只是实例来源从 Daemon 独立创建变为通过 StateManager 获取 |

### 改项 2：修复 path-resolver.ts 嵌套 statePath

| 维度 | 说明 |
|------|------|
| **根因** | C1 隐式契约 (2) + C10 隐式契约 (1)：Daemon.ts L53 把 `runtimeDir`（daemon 全局目录 `~/.specforge/runtime`）当 `projectPath` 传入 StateManager，PersonalPathResolver 再次拼接出 `~/.specforge/runtime/.specforge/runtime/state.json` |
| **源文件** | `packages/daemon-core/src/daemon/Daemon.ts` |
| **涉及行** | L53（`this.stateManager = new StateManager(pathResolver, runtimeDir)`） |
| **接口变化** | StateManager 构造的第二个参数含义从 "可能是 runtimeDir" 变为 "必须是合法的 projectPath 或 daemon 逻辑标识符" |
| **解决方案方向** | 在 Daemon 级别引入一个逻辑 projectPath 标识（如 `__daemon_global__` 或使用 `resolveDaemonRuntimeDir()` 路径本身），确保 StateManager 的路径解析不再产生嵌套 |
| **影响面** | 所有依赖 StateManager 初始化路径的下游（state.json 位置、events.jsonl 位置）都会变化。**关键约束**：现有 state.json 在旧嵌套位置可能存在，启动期需迁移或标记为孤儿 |

### 改项 3：RecoverySubsystem 注入 WAL + StateManager

| 维度 | 说明 |
|------|------|
| **根因** | C1 隐式契约 (3) + C6 隐式契约 (1)/(2)：Daemon.ts L54 构造 RecoverySubsystem 时只传 2 个参数（pathResolver + runtimeDir），跳过了可选的 `wal` 和 `stateManager`。导致 fallback rebuild 路径永远返回 `workItems: []`，覆盖真实 state.json — 这是 WI-001 "内存幽灵" 的精准根因 |
| **源文件** | `packages/daemon-core/src/daemon/Daemon.ts` |
| **涉及行** | L54（`this.recoverySubsystem = new RecoverySubsystem(pathResolver, runtimeDir)`） |
| **接口变化** | RecoverySubsystem 构造函数已有 `wal?` 和 `stateManager?` 可选参数（L52），无需修改接口定义，只需在 Daemon 构造时传入 |
| **影响面** | RecoverySubsystem.checkAndRepair() 的行为将从 "fallback 退化路径" 切换到 "真实 rebuild 路径"。这是本次变更中**风险最高的改项**：fallback 路径在某些 events.jsonl 状态下可能反而更容忍异常，真实 rebuild 路径可能暴露之前被掩盖的边界条件 |

### 改项 4：ProjectManager 不再为每个项目创建独立 StateManager

| 维度 | 说明 |
|------|------|
| **根因** | C5 隐式契约 (1)：ProjectManager.ts L60、L63 每次 registerProject 都新建独立 WAL + StateManager 实例，与 daemon 全局 StateManager 形成多写者 |
| **源文件** | `packages/daemon-core/src/project/ProjectManager.ts` |
| **涉及行** | L60（`new WAL(...)`）、L63（`new StateManager(...)`）、L84（`ctx.wal = wal`）、L85（`ctx.stateManager = stateManager`）、L20-L21（`ProjectContext` 接口中 `wal?` 和 `stateManager?` 字段） |
| **接口变化** | ProjectContext 接口中 `wal` 和 `stateManager` 变为可选且通常为空（或删除）；ProjectManager 构造函数需接受 daemon 全局 StateManager 注入 |
| **影响面** | 依赖 `ProjectManager.getProjectContext()` 返回的 `wal` / `stateManager` 的下游代码需改为使用 daemon 全局实例。需排查 HTTPServer 和其它消费者对 `ctx.wal` / `ctx.stateManager` 的直接引用 |

### 文件变更汇总

| 文件 | 变更类型 | 行数估计 | 风险 |
|------|----------|----------|------|
| `daemon/Daemon.ts` | 修改 | ~20 行 | 高 — 核心组装变更 |
| `daemon/path-resolver.ts` | 可能微调 | ~5 行 | 低 — 仅调整验证逻辑 |
| `recovery/RecoverySubsystem.ts` | 无代码变更 | 0 行 | N/A — 仅消费端传入参数变化 |
| `project/ProjectManager.ts` | 修改 | ~30 行 | 中 — 接口变更影响下游 |
| `state/StateManager.ts` | 修改（新增方法） | ~5 行 | 低 — 仅暴露 getWal() |
| `wal/WAL.ts` | 无变更 | 0 行 | N/A |
| `http/HTTPServer.ts` | 可能微调 | ~3 行 | 低 — wal 引用来源变化 |

### 明确排除的范围

- **SessionRegistry WAL 化**（Phase 2）
- **Property 21 重写**（Phase 3）
- **HTTPServer.handleOpenCodeEvent sessionId 合并修复**（Phase 0，WI-004 已作为前置完成）
- **Plugin 端改动**（零改动，wire format 不变）
- **events.jsonl schema 变更**（schema 保持 `1.0`，向后兼容）

---

## 风险评估

### 总体风险等级：**中高**

### 风险矩阵

| # | 风险项 | 概率 | 影响 | 严重度 | 缓解策略 |
|---|--------|------|------|--------|----------|
| R1 | RecoverySubsystem 真实 rebuild 路径在特定 events.jsonl 状态下抛错（旧 fallback 反而容忍） | 中 | 高 | **高** | 按 §5.5 Phase 1 (iii)，RecoverySubsystem 注入可独立 revert，其它结构清理保留 |
| R2 | statePath 修正后，旧嵌套位置的 state.json 数据丢失（用户已有的 WI 状态无法恢复） | 低 | 高 | **中高** | 启动期检测旧位置文件，自动迁移或重建；旧文件标记为孤儿，不删除 |
| R3 | ProjectManager 消除 per-project StateManager 后，多项目场景的隔离语义被破坏 | 低 | 中 | **中** | 当前 daemon 只有 personal 模式在用，多项目场景尚未成熟；Phase 2 再处理 |
| R4 | WAL 单例化后，并发 appendEvent 的调用顺序变化导致事件时序与之前不同 | 低 | 中 | **中** | WAL.appendEvent 已有 fsync 保证原子写入，单实例反而消除竞态，风险实际降低 |
| R5 | StateManager.getWal() 暴露内部可变状态后，外部代码可能误操作 WAL 导致状态不一致 | 低 | 低 | **低** | getWal() 返回只读引用类型或加文档约束；HTTPServer 仅用于 appendEvent，不调用 readAllEvents + rebuild |

### 风险详细分析

#### R1：RecoverySubsystem 真实 rebuild 路径可靠性

这是本次变更**唯一的高严重度风险**。现状分析：

- **现状**：RecoverySubsystem.checkAndRepair() 在 stateManager 缺失时走 fallback `rebuildFromEvents()` (L305-L323)，该 fallback 版本只取 `lastEventId / lastEventTs`，永远返回 `workItems: []`
- **变更后**：注入 stateManager 后走 `stateManager.rebuildState()` 真实路径，重建完整 workItems
- **风险场景**：某些 events.jsonl 包含格式异常的事件（如 Phase 0 前遗留的缺少字段的事件），fallback 路径不 parse 这些事件的 workItem 数据所以不报错，但真实 rebuild 路径会 parse 并可能抛异常
- **回滚方案**：在 Daemon 构造中用 try/catch 包裹 RecoverySubsystem 的 wal+stateManager 注入；若 rebuild 抛错，回退到不注入的 fallback 路径，同时记录 WARN 日志

#### R2：旧 state.json 迁移

- PersonalPathResolver 将 `~/.specforge/runtime` 当 projectPath 拼接后产生嵌套路径 `~/.specforge/runtime/.specforge/runtime/state.json`
- 修正后 daemon 全局 state.json 将写到正确路径
- 若旧嵌套位置已有 state.json，启动期需检测并处理

---

## 回归测试范围

### 必须覆盖的测试场景

#### T1：Daemon 启动/重启循环（优先级 P0）

| 测试用例 | 验证点 | 覆盖的改项 |
|----------|--------|-----------|
| T1.1 daemon 冷启动 → state.json 不存在 → 从 events.jsonl rebuild | workItems 状态完整恢复 | 改项 2, 3 |
| T1.2 daemon 重启（有旧 state.json） → 一致性检查通过 → workItems 与 events.jsonl 吻合 | RecoverySubsystem 走真实 rebuild 路径，不返回空 workItems | 改项 3 |
| T1.3 daemon 启动 → 旧嵌套位置 state.json 存在 → 检测并标记孤儿 | 无数据丢失，无异常抛出 | 改项 2 |
| T1.4 daemon 启动 → events.jsonl 为空 → state.json 为空 → 正常空状态启动 | 不抛异常 | 改项 2, 3 |

#### T2：Work Item 状态转换（优先级 P0）

| 测试用例 | 验证点 | 覆盖的改项 |
|----------|--------|-----------|
| T2.1 创建 WI → transition intake → requirements → design | 所有 transition 写入同一 WAL 实例，monotonicSeq 递增无跳跃 | 改项 1 |
| T2.2 创建多个 WI → 交错 transition → events.jsonl 序列正确 | 多 WI 事件在单一 WAL 中有序 | 改项 1, 4 |
| T2.3 WI transition 后 daemon 重启 → rebuildState() 恢复所有 WI | 所有 WI 状态从 events.jsonl 正确重建 | 改项 1, 2, 3 |

#### T3：events.jsonl 完整性与向后兼容（优先级 P0）

| 测试用例 | 验证点 | 覆盖的改项 |
|----------|--------|-----------|
| T3.1 变更前的 events.jsonl → 变更后的 daemon 能完整 rebuild | 向后兼容，schema 不变 | 改项 1, 2, 3 |
| T3.2 变更后写入的 events.jsonl → WAL schema_version 仍为 '1.0' | 不引入新 schema | 改项 1 |
| T3.3 monotonicSeq 连续性验证：无重复、无回退 | 单例 WAL 的 seq 保证 | 改项 1 |

#### T4：ProjectManager 行为验证（优先级 P1）

| 测试用例 | 验证点 | 覆盖的改项 |
|----------|--------|-----------|
| T4.1 registerProject → ProjectContext 不含独立 wal/stateManager | per-project 实例已消除 | 改项 4 |
| T4.2 registerProject → daemon 全局 StateManager 的事件被正确写入 | 写操作走全局 WAL | 改项 4 |
| T4.3 unregisterProject → 无 WAL/StateManager 泄漏 | 资源清理正确 | 改项 4 |

#### T5：HTTPServer 事件路径（优先级 P1）

| 测试用例 | 验证点 | 覆盖的改项 |
|----------|--------|-----------|
| T5.1 POST /api/v1/ingest/event → 事件写入 WAL → events.jsonl 可读 | HTTPServer 引用的 WAL 实例与 StateManager 的 WAL 是同一对象 | 改项 1 |
| T5.2 连续 POST 多个事件 → monotonicSeq 递增 | 无竞态，无丢失 | 改项 1 |

#### T6：RecoverySubsystem 边界条件（优先级 P1）

| 测试用例 | 验证点 | 覆盖的改项 |
|----------|--------|-----------|
| T6.1 checkAndRepair() → stateManager 注入 → 真实 rebuild → workItems 非空 | 不再走 fallback 空路径 | 改项 3 |
| T6.2 events.jsonl 含损坏行 → checkAndRepair 容错处理 | 不崩溃，跳过坏行 | 改项 3 |
| T6.3 回滚场景：注入失败 → 退回 fallback → workItems 为空但不崩溃 | 回滚策略有效 | 改项 3 |

### 受影响的现有测试

以下现有测试文件需要确认在变更后仍然通过：

- `packages/daemon-core/tests/state/StateManager.test.ts`
- `packages/daemon-core/tests/recovery/RecoverySubsystem.test.ts`
- `packages/daemon-core/tests/project/ProjectManager.test.ts`
- `packages/daemon-core/tests/daemon/Daemon.test.ts`
- `packages/daemon-core/tests/wal/WAL.test.ts`

---

## KG 关联

### 直接关联的 KG 节点

以下 KG 节点来自 WI-001（daemon 核心功能建设的原始 WI），其实现代码是本次变更的直接目标：

| KG 节点 | 类型 | 关联原因 |
|----------|------|----------|
| `WI-001:task:2` — State Manager（WAL + state.json 派生） | task | 改项 1, 2, 3 直接修改 StateManager 的创建和使用方式 |
| `WI-001:task:3` — Recovery 子系统 | task | 改项 3 修改 RecoverySubsystem 的构造参数注入 |
| `WI-001:task:4` — Multi-project Manager | task | 改项 4 消除 ProjectManager 的 per-project StateManager |
| `WI-001:task:9` — Daemon 启动/关闭/握手 | task | 改项 1, 2, 3 都涉及 Daemon.ts 构造和 start() 流程 |

### WI-002 Investigation 关联

WI-002 没有直接生成 KG 节点（investigation 工作流不产生 task/requirement 节点），但其 research 产出是本次变更的全部理论基础：

| Research 产物 | 关联的隐式契约 | 对应改项 |
|---------------|---------------|----------|
| 01-contracts.md — C1 隐式契约 (1) | WAL 多实例竞态 | 改项 1 |
| 01-contracts.md — C1 隐式契约 (2) | path-resolver 嵌套 statePath | 改项 2 |
| 01-contracts.md — C1 隐式契约 (3) | RecoverySubsystem 不注入 | 改项 3 |
| 01-contracts.md — C5 隐式契约 (1) | per-project StateManager | 改项 4 |
| 01-contracts.md — C6 隐式契约 (1)/(2) | fallback rebuild 返回空 workItems | 改项 3 |
| 01-contracts.md — C7 隐式契约 (1) | WAL `_lastSeq` 实例隔离 | 改项 1 |
| 01-contracts.md — C8 隐式契约 (1)/(4) | StateManager 独立 WAL + 并发写无保护 | 改项 1, 4 |
| 01-contracts.md — C10 隐式契约 (1) | PersonalPathResolver 嵌套 | 改项 2 |
| 03-comparison-matrix.md — D4-D | 跨模块变更范围评估 | 全部改项 |
| 05-recommendation.md — §5.5 Phase 1 | 完整范围、回滚条件、兼容方式 | 全部改项 |

### WI-004 关联

| KG 节点 | 类型 | 关联原因 |
|----------|------|----------|
| `WI-004:task:1` — sf-design-gate handler 参数名修复 | task | 前置条件：Gate 实现缺陷已修复，避免本 WI 被 Gate 阻塞 |
| `WI-004:task:2` — sf-verification-gate handler 修复 | task | 同上 |

### WI-003 关联（间接）

WI-003（工具裂缝修复）修复了 sf_state_read 等工具实现缺陷，是本 WI 的前置条件之一。

### 受影响的设计决策（Design Decision 节点）

本次变更不修改 KG 中的 design_decision 节点（Phase 1 是内部重构，不改变对外接口语义），但以下 design_decision 的实现代码会被触碰：

- DD: WAL-first guarantee（events.jsonl fsync before state.json update）— 单例化后此保证更可靠
- DD: StateManager is single source of truth — 从"名义上唯一"变为"事实上唯一"（消除多实例）
- DD: RecoverySubsystem Property 20（rebuild(events) == s'）— 注入后此 property 真正成立

---

## 兼容性保证

| 维度 | 保证 | 说明 |
|------|------|------|
| events.jsonl schema | **不变**（version `1.0`） | 不引入新 category，不修改事件格式 |
| state.json schema | **不变** | StateManager.persistState 的 JSON 结构不变 |
| HTTP API wire format | **不变** | Plugin 端零改动 |
| daemon.json manifest | **不变** | ProjectManager 的 manifest 逻辑不变 |
| handshake.json | **不变** | HandshakeManager 不受影响 |
| 旧嵌套 state.json | **保留为孤儿文件** | 不删除，由 verification 阶段记录 cleanup 任务 |

---

## 回滚策略

遵循 05-recommendation.md §5.5 Phase 1 (iii)：

1. **RecoverySubsystem 注入失败**：回滚改项 3（不注入 wal+stateManager），其它改项（1/2/4）可保留
2. **statePath 修正导致启动异常**：回滚改项 2，恢复用 runtimeDir 当 projectPath 的旧行为
3. **整体不可用**：完整 revert PR，所有 4 个改项一起回滚
4. **数据安全**：events.jsonl 在变更前后格式不变，回滚不损失任何事件数据
