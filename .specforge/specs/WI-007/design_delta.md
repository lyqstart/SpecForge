# WI-007 Design Delta: Property 21 重写与悬空契约清理（Phase 3 — 收尾）

> **增量设计文档** — 基于 impact_analysis.md 和 WI-002 调查产出，定义 Phase 3 清理变更的精确设计方案。

---

## 1. 增量设计描述

### DD-1 Property 21 注释重写

refs: [impact_analysis §1.1 L13-L17]
constrained_by: 无运行时约束（纯注释变更）

**目标文件**: `packages/daemon-core/src/recovery/RecoverySubsystem.ts` L13-L17

**旧文本**（当前）:
```
 * Property 21: Session Reconnect Scope
 * For all Daemon runtime event streams, "automatic reconnection attempts to old
 * OpenCode sessions" may only occur within the Daemon startup process; after
 * startup completes, even if old sessions are detected as alive, the Daemon
 * must not automatically initiate reconnection.
```

**新文本**（目标）:
```
 * Property 21: Session WAL Replay Scope
 * For all Daemon runtime event streams, WAL-replay-based session state reconstruction
 * may only occur within the Daemon startup process; after startup completes, the
 * Daemon must not automatically initiate session state reconstruction via WAL replay.
```

**变更理由**: Phase 2（WI-006）已将 session 恢复机制从"网络探测 OpenCode 进程是否存活"改为"纯本地 WAL 重放"（`SessionRegistry.startupReplay`）。Property 21 的语义约束——"仅限启动期"——不变，但描述的机制已从"重连"变为"重放重建"。

**影响范围**: 仅影响注释文本，不影响任何运行时行为。

---

### DD-2 死代码删除：detectOldSessions + reconnectOldSessions

refs: [impact_analysis §1.1 L458-L491, L500-L538, WI-002 research/01-contracts C6 隐式契约 (4)]
constrained_by: 无运行时约束（删除已废弃路径）

#### 删除清单

| 方法 | 行号 | 删除理由 |
|------|------|----------|
| `detectOldSessions()` | L458-L491 | 功能已被 `SessionRegistry.startupReplay` 替代。该方法从 events.jsonl 读 `session.activated/terminated` 做差集，但 Phase 2 已为这些事件创建了 producer（SessionRegistry WAL-first writes），`startupReplay` 完整重放所有 session 事件并恢复 pending/active/history/bindings/aliases |
| `reconnectOldSessions()` | L500-L538 | 功能已被 `SessionRegistry.startupReplay` 替代。该方法遍历旧活跃 session 调用 `attemptSessionReconnect`，而 `checkAndRepair` L99-L107 已调用 `startupReplay` 完成等价且更完整的恢复 |

#### 保留清单（经 grep 验证）

| 方法 | 行号 | 保留理由 |
|------|------|----------|
| `attemptSessionReconnect()` | L354-L375 | **保留但重写注释**。被外部调用者使用：`RecoverySubsystem.test.ts` L102、`property-21.test.ts` L120/L306/L322。该方法实现 Property 21 的核心守卫逻辑（startup phase 检查），删除会破坏现有测试契约。注释中"reconnect"措辞需更新 |
| `performSessionReconnect()` | L381-L408 | **保留**。是 `attemptSessionReconnect` 的私有辅助方法，提供 `SessionReconnectResult` 返回值。虽然当前是模拟实现（总是返回 reconnected=true），但作为 `attemptSessionReconnect` 的内部实现，应随其保留 |
| `getReconnectionScopeStatus()` | L544-L554 | **保留**。被 `property-21.test.ts` L195/L203/L211/L301/L317/L328 广泛使用于验证 startup phase 状态。方法名虽含"reconnection"，但其语义——报告 startup phase 状态——在 WAL 重放时代仍然正确 |

#### 功能替代关系确认

```
旧路径（删除）:
  Daemon.start() → recoverySubsystem.reconnectOldSessions()
    → detectOldSessions() [读 events.jsonl 做 activated/terminated 差集]
    → 对每个活跃 session 调用 attemptSessionReconnect()
      → performSessionReconnect() [模拟返回 reconnected=true]

新路径（Phase 2 已实现）:
  Daemon.start() → recoverySubsystem.checkAndRepair()
    → wal.readAllEvents()
    → stateManager.rebuildState()
    → sessionRegistry.startupReplay(sessionEvents)  [L99-L107]
      → 处理 6 种 session 事件类型
      → 恢复 pendingSessions/activeSessions/historySessions
      → 恢复 projectBindings + aliasMap
```

**结论**: `startupReplay` 是 `reconnectOldSessions` 的严格上位替代——不仅恢复活跃 session，还恢复 pending/history/bindings/aliases，覆盖范围更广。

---

### DD-3 Daemon.ts 调用点清理

refs: [impact_analysis §1.1 Daemon.ts L183-L188]
constrained_by: 无运行时约束

**目标文件**: `packages/daemon-core/src/daemon/Daemon.ts` L183-L188

**当前代码**:
```typescript
// Property 21: Attempt to reconnect old sessions from previous Daemon run
// This only succeeds because we're still in the startup phase
await this.recoverySubsystem.reconnectOldSessions();

// Property 21: Complete startup - no more reconnection attempts allowed
this.recoverySubsystem.completeStartup();
```

**目标代码**:
```typescript
// Property 21: Complete startup - no more WAL replay session reconstruction allowed
this.recoverySubsystem.completeStartup();
```

**变更要点**:
1. 删除 L185 `await this.recoverySubsystem.reconnectOldSessions()` 调用——冗余，因为 `checkAndRepair()`（L151 调用位置）已内部调用 `startupReplay`
2. 更新 L187 注释措辞，从"reconnection"改为"WAL replay session reconstruction"
3. 合并 L183-L184 和 L187-L188 为紧凑的两行注释+调用

**安全性**: `checkAndRepair()` 在 `Daemon.start()` 中更早执行（L151 位置），其内部 L99-L107 已调用 `sessionRegistry.startupReplay(sessionEvents)`。L185 的 `reconnectOldSessions()` 是在 `startupReplay` 之后执行的冗余路径，删除不影响功能。

---

### DD-4 property-21.test.ts 重写策略

refs: [impact_analysis §1.1 property-21.test.ts, §3.1]
constrained_by: 测试框架 vitest + fast-check

**目标文件**: `packages/daemon-core/tests/property/property-21.test.ts`（全文重写 ~100-150 行）

**重写策略**: 测试从验证"重连机制"改为验证"WAL 重放的启动期约束"，但核心不变式——startup phase 检查——不变。

#### 测试用例映射

| 旧用例 | 新用例 | 变更要点 |
|--------|--------|----------|
| 21.1: "should deny reconnection after startup completes" | 21.1: "should deny WAL replay session reconstruction after startup completes" | 调用 `attemptSessionReconnect` 的逻辑不变（该方法保留），但测试描述和注释更新措辞 |
| 21.2: "should not reconnect sessions detected after startup" | 21.2: "should not reconstruct session state via replay after startup" | **核心重写**：不再调用 `detectOldSessions()`/`reconnectOldSessions()`（已删除）。改为验证 `checkAndRepair` 在 post-startup 阶段不触发 `startupReplay` 的副作用 |
| 21.3: "should correctly track reconnection scope boundaries" | 21.3: "should correctly track WAL replay scope boundaries" | `getReconnectionScopeStatus()` 保留，断言逻辑不变，仅更新描述措辞 |
| 21.4: PBT "reconnect scope limitation" | 21.4: PBT "WAL replay scope limitation" | 使用 `attemptSessionReconnect` + `getReconnectionScopeStatus` 验证 scope 约束，不再调用已删除 API |

**关键约束**:
- 新测试**必须保留** Property 21 的核心语义验证："startup phase 外不允许 session 状态重建"
- 测试可直接使用 `attemptSessionReconnect`（保留）和 `getReconnectionScopeStatus`（保留），无需依赖已删除方法
- 21.2 用例需要构造 mock `SessionRegistry` 注入 `RecoverySubsystem`，验证 `startupReplay` 仅在 startup phase 被调用

---

### DD-5 文档同步策略

refs: [impact_analysis §1.2, §1.3]
constrained_by: 无运行时约束

#### 5.1 .kiro/specs/ 文档更新

| 文件 | 行号 | 当前文本 | 目标文本 |
|------|------|----------|----------|
| `.kiro/specs/v6-architecture-overview/design.md` | L1049-L1053 | "对旧 OpenCode session 的自动重连尝试" 只能出现在 Daemon 启动流程内 | "WAL 重放重建 session 状态" 仅限启动流程 |
| `.kiro/specs/daemon-core/requirements.md` | L45-L48 | "automatic reconnection attempts to old OpenCode sessions" | "WAL replay-based session state reconstruction" |
| `.kiro/specs/daemon-core/design.md` | L201 | "Limit session reconnection to startup only (Property 21)" | "Limit session WAL replay reconstruction to startup only (Property 21)" |
| `.kiro/specs/daemon-core/design.md` | L298 | "Property 21 (Reconnect Scope): Generate runtime scenarios, verify reconnect limits" | "Property 21 (WAL Replay Scope): Generate runtime scenarios, verify replay scope limits" |
| `.kiro/specs/daemon-core/tasks.md` | L18 | "Property 21: Session Reconnect Scope" | "Property 21: Session WAL Replay Scope" |
| `.kiro/specs/daemon-core/tasks.md` | L115 | "Property 21 Test: Verify reconnect scope limitation" | "Property 21 Test: Verify WAL replay scope limitation" |
| `.kiro/specs/daemon-core/tasks.md` | L116 | "Requirements: 5.4, 5.5, Property 21" | 保持不变（需求编号不变） |
| `.kiro/specs/daemon-core/tasks.md` | L237-L241 | Property 21 测试策略描述 | 更新措辞为 WAL replay 语义 |

#### 5.2 DEVELOPMENT.md 更新

| 文件 | 行号 | 当前文本 | 目标文本 |
|------|------|----------|----------|
| `packages/daemon-core/DEVELOPMENT.md` | L83 | "Property 21: Session Reconnect Scope" | "Property 21: Session WAL Replay Scope" |

#### 5.3 排除列表（不修改）

| 文件 | 原因 |
|------|------|
| `.kiro/specs/version-unification/tasks.md` L226 | 不同的 Property 21（Manifest_Migrator legacy detection），与本 WI 无关 |
| `.kiro/specs/version-unification/design.md` L865 | 同上 |
| `docs/archive/OPENCODE_INTEGRATION_BRIEF.md` | grep 确认无 Property 21 / detectOldSessions / reconnectOldSessions 引用 |
| `tests/integration/fixtures/sf_v6_arch_check/backup/*.md` | 历史备份文件 |

#### 5.4 同步验证方法

1. 开发阶段完成后，执行 `grep -rn "reconnectOldSessions\|detectOldSessions" packages/ --include="*.ts"` — 预期零结果
2. 执行 `grep -rn "Property 21.*[Rr]econnect" .kiro/specs/` — 预期零结果（所有旧措辞已更新）
3. 执行 `grep -rn "Property 21.*[Rr]eplay\|WAL.*replay" .kiro/specs/` — 预期命中所有更新点

---

### DD-6 RecoverySubsystem 内部注释同步

refs: [DD-1, DD-2]
constrained_by: 无运行时约束

除了 L13-L17 的 Property 21 顶部注释重写外，RecoverySubsystem 内部还有多处 Property 21 相关注释需要更新措辞：

| 行号 | 当前措辞 | 目标措辞 |
|------|----------|----------|
| L46 | `// Property 21: Track startup phase to limit reconnection attempts` | `// Property 21: Track startup phase to limit WAL replay session reconstruction` |
| L355 | `Attempt session reconnection (only during startup - Property 21)` | `Attempt session WAL replay reconstruction (only during startup - Property 21)` |
| L357 | `Property 21: Reconnection attempts may only occur within Daemon startup process.` | `Property 21: WAL replay session reconstruction may only occur within Daemon startup process.` |
| L365 | `// Property 21: Only attempt reconnection during startup phase` | `// Property 21: Only attempt WAL replay during startup phase` |

**注意**: `attemptSessionReconnect` 和 `performSessionReconnect` 方法名暂不修改——方法名修改属于更大范围的重命名重构，可由后续 WI 处理。本次仅修改注释措辞。

---

## 2. 受影响模块

### 2.1 RecoverySubsystem（`packages/daemon-core/src/recovery/RecoverySubsystem.ts`）

**变更类型**: 注释重写 + 方法删除 + 内部注释同步

| 变更 | 行号 | 详细 |
|------|------|------|
| Property 21 注释重写 | L13-L17 | 机制描述从"reconnection"改为"WAL replay" |
| 内部注释同步 | L46, L355, L357, L365 | 措辞同步更新 |
| 删除 detectOldSessions | L458-L491 | 完整方法体 + JSDoc 删除（~34 行） |
| 删除 reconnectOldSessions | L500-L538 | 完整方法体 + JSDoc 删除（~39 行） |
| 保留 attemptSessionReconnect | L354-L375 | 保留方法体，仅更新注释 |
| 保留 performSessionReconnect | L381-L408 | 保留不动 |
| 保留 getReconnectionScopeStatus | L544-L554 | 保留不动 |

**Interface 变更**:
```typescript
// 删除的公开方法
- detectOldSessions(): Promise<string[]>           // DELETED
- reconnectOldSessions(): Promise<SessionReconnectResult[]>  // DELETED

// 保留的公开方法（接口不变）
+ attemptSessionReconnect(sessionId: string): Promise<boolean>  // KEPT
+ getReconnectionScopeStatus(): { isInStartupPhase: boolean; hasStartupCompleted: boolean; reconnectionAllowed: boolean }  // KEPT
```

---

### 2.2 Daemon（`packages/daemon-core/src/daemon/Daemon.ts`）

**变更类型**: 调用点删除 + 注释更新

| 变更 | 行号 | 详细 |
|------|------|------|
| 删除 reconnectOldSessions 调用 | L183-L185 | 删除 3 行（注释 + 调用） |
| 更新 completeStartup 注释 | L187 | 从"reconnection"改为"WAL replay" |

---

### 2.3 property-21.test.ts（`packages/daemon-core/tests/property/property-21.test.ts`）

**变更类型**: 全文重写

| 旧依赖 | 新依赖 | 说明 |
|--------|--------|------|
| `detectOldSessions()` L165 | **删除** | 改为验证 startupReplay scope |
| `reconnectOldSessions()` L169 | **删除** | 改为验证 startupReplay scope |
| `attemptSessionReconnect()` L120, L306, L322 | **保留** | 方法保留，测试调用不变 |
| `getReconnectionScopeStatus()` L195, L203, L211, L301, L317, L328 | **保留** | 方法保留，断言逻辑不变 |

---

### 2.4 .kiro/specs/ 文档（4 个文件）

| 文件 | 变更量 | 说明 |
|------|--------|------|
| `.kiro/specs/v6-architecture-overview/design.md` | ~3 行 | Property 21 措辞重写 |
| `.kiro/specs/daemon-core/requirements.md` | ~3 行 | Property 21 措辞重写 |
| `.kiro/specs/daemon-core/design.md` | ~2 行 | Property 21 相关描述更新 |
| `.kiro/specs/daemon-core/tasks.md` | ~5 行 | Property 21 测试任务描述更新 |

---

### 2.5 DEVELOPMENT.md

| 文件 | 变更量 | 说明 |
|------|--------|------|
| `packages/daemon-core/DEVELOPMENT.md` | ~1 行 | Property 21 标题措辞更新 |

---

### 2.6 RecoverySubsystem.test.ts

**变更类型**: 可能需要更新

| 位置 | 说明 |
|------|------|
| L101-L106 | `attemptSessionReconnect` 单元测试 — 方法保留，测试应继续通过。注释措辞可选择性更新 |

---

## 3. 兼容性影响

### 3.1 API Surface 变更

**删除的公开 API**:
- `RecoverySubsystem.detectOldSessions(): Promise<string[]>`
- `RecoverySubsystem.reconnectOldSessions(): Promise<SessionReconnectResult[]>`

**影响分析**（基于 grep 结果）:

| 调用者 | 文件 | 行号 | 影响 |
|--------|------|------|------|
| Daemon.ts | `Daemon.ts` | L185 | **已处理**：DD-3 删除此调用 |
| property-21.test.ts | `property-21.test.ts` | L165, L169 | **已处理**：DD-4 重写测试 |
| 无其他调用者 | — | — | grep 确认 `detectOldSessions`/`reconnectOldSessions` 仅在上述 2 处被调用 |

**结论**: 无外部消费者。两个被删除方法的所有调用者都在本 WI 变更范围内，安全删除。

### 3.2 Fallback 策略

虽然 grep 确认无外部消费者，但制定防御性 fallback 以防万一：

> **Fallback**: 若发现 `detectOldSessions` 或 `reconnectOldSessions` 有未预期的外部消费者，保留 API 签名但内部转调 `sessionRegistry.startupReplay()`，并标记 `@deprecated`。此 fallback 的触发条件是 TypeScript 编译失败（引用已删除方法）。

### 3.3 Test 兼容性

| 测试文件 | 兼容性 | 说明 |
|----------|--------|------|
| `property-21.test.ts` | **需重写** | 4 个用例中 2 个直接调用已删除 API |
| `RecoverySubsystem.test.ts` | **兼容** | 仅调用 `attemptSessionReconnect`（保留） |
| `recovery-session-replay.test.ts` | **兼容** | 不依赖已删除 API |
| `daemon-lifecycle.test.ts` | **需回归验证** | 若有 `reconnectOldSessions` 调用断言需更新 |
| 其他 property 测试 | **兼容** | 不涉及 |

### 3.4 数据兼容性

| 数据文件 | 影响 |
|----------|------|
| `events.jsonl` | **无变更** — 事件 schema 不变 |
| `state.json` | **无变更** — 状态结构不变 |
| `sessions.json` | **无变更** — checkpoint 结构不变 |

---

## 4. 回归风险

### 4.1 风险矩阵

| # | 风险 | 概率 | 影响 | 缓解措施 | 验证方法 |
|---|------|------|------|----------|----------|
| R1 | detectOldSessions/reconnectOldSessions 有未发现的调用者 | 极低 | 中 | TypeScript 编译器会立即报错；grep 已枚举所有调用点 | `tsc --noEmit` |
| R2 | property-21 测试重写后不覆盖原始语义 | 低 | 中 | 新测试验证 `attemptSessionReconnect` 的 startup-only 约束 + `getReconnectionScopeStatus` 的 scope 追踪 | CI 测试通过 |
| R3 | 删除后遗留引用导致编译失败 | 极低 | 低 | TypeScript 编译器即时报错 | `tsc --noEmit` |
| R4 | .kiro/specs 中遗漏 Property 21 旧措辞 | 低 | 低 | grep 已枚举所有引用（11 处，排除 version-unification 后 4 处需改） | `grep -rn "reconnect.*Property 21\|Property 21.*reconnect" .kiro/` |
| R5 | daemon-lifecycle 集成测试依赖 reconnectOldSessions | 低 | 中 | 回归运行集成测试；若失败则更新测试断言 | CI 测试通过 |

### 4.2 编译时安全保障

TypeScript 编译器提供以下编译期安全网：
1. **删除方法引用检测**: 任何调用 `detectOldSessions()`/`reconnectOldSessions()` 的代码将产生编译错误
2. **类型兼容性检查**: `SessionReconnectResult` 类型仍被 `attemptSessionReconnect` 使用，不删除
3. **导出接口检查**: 删除公开方法后，外部导入将编译失败

### 4.3 测试安全网

| 测试层级 | 覆盖范围 | 说明 |
|----------|----------|------|
| 单元测试 | `attemptSessionReconnect` | 保留方法的行为不变（startup phase 检查） |
| 属性测试 | Property 21 核心语义 | 重写后仍验证 startup-only 约束 |
| 集成测试 | Daemon 启动流程 | 回归确认 `checkAndRepair` + `startupReplay` 正常工作 |

### 4.4 回滚条件

若删除后出现以下情况，执行回滚：
- property-21 测试无法通过重写满足原始语义约束 → 保留方法体但标记 `@deprecated`，内部转调 `startupReplay`
- daemon-lifecycle 集成测试依赖 `reconnectOldSessions` 调用 → 更新测试而非回滚代码

---

## 5. KG 追溯关系

### 5.1 Design Decision → Impact Analysis 映射

| DD | impact_analysis 关联 | WI-002 关联 |
|----|----------------------|-------------|
| DD-1 (注释重写) | §1.1 RecoverySubsystem L13-L17 | 01-contracts C6 显式不变式；03-comparison-matrix D9-D |
| DD-2 (死代码删除) | §1.1 L458-L491, L500-L538；§2.2 低风险论证；§2.3 功能替代关系 | 01-contracts C6 隐式契约 (4) 悬空契约证据 |
| DD-3 (Daemon 调用点) | §1.1 Daemon.ts L183-L188 | 01-contracts C1 隐式契约 (3) |
| DD-4 (测试重写) | §3.1 需修改的测试；§3.3 建议新增测试 | — |
| DD-5 (文档同步) | §1.2 规格文档变更；§1.3 开发文档变更 | 05-recommendation §5.5 Phase 3 (i) |
| DD-6 (内部注释) | §1.1 RecoverySubsystem 全文 Property 21 引用 | — |

### 5.2 跨 WI 影响链

```
WI-002 (investigation: A+D Hybrid 推荐)
  ├─ 05-recommendation.md §5.5 定义 Phase 3 范围
  ├─ 01-contracts.md C6 隐式契约 (4) 指出悬空契约
  └─ 03-comparison-matrix.md D9-D Property 21 兼容性扩展
      ↓
  WI-003 (Phase 0: HTTPServer sessionId merge) ✅
  WI-004 (Phase 1a: WAL singleton) ✅
  WI-005 (Phase 1b: RecoverySubsystem DI) ✅
  WI-006 (Phase 2: SessionRegistry WAL-ification + startupReplay) ✅
  WI-007 (Phase 3: Property 21 rewrite + dead code cleanup) ← 本 WI
```

### 5.3 KG 节点更新建议

| 节点 | 更新操作 | 说明 |
|------|----------|------|
| `code_file: RecoverySubsystem` | 更新 metadata | 删除 detectOldSessions/reconnectOldSessions 方法节点；更新 Property 21 注释描述 |
| `code_file: Daemon.ts` | 更新 metadata | 删除 reconnectOldSessions 调用引用 |
| `design_decision: Property 20/21 不变量` | 更新 metadata | Property 21 措辞从"reconnection"改为"WAL replay" |
| `design_decision: WI-002 调查发现` | 无需更新 | 历史节点，保持原始发现记录 |

---

## 6. 建议执行顺序

基于依赖关系，建议按以下顺序执行：

```
Step 1 — 删除死代码（DD-2 + DD-3）
  ├─ RecoverySubsystem.ts: 删除 detectOldSessions + reconnectOldSessions
  ├─ Daemon.ts: 删除 L185 调用 + 更新 L187 注释
  └─ 验证: tsc --noEmit 确认编译通过

Step 2 — 重写 Property 21 注释（DD-1 + DD-6）
  ├─ RecoverySubsystem.ts: L13-L17 顶部注释重写
  └─ RecoverySubsystem.ts: L46/L355/L357/L365 内部注释同步

Step 3 — 重写测试（DD-4）
  ├─ property-21.test.ts: 全文重写
  └─ RecoverySubsystem.test.ts: 可选注释更新
  └─ 验证: vitest run 确认所有 property-21 测试通过

Step 4 — 同步文档（DD-5）
  ├─ .kiro/specs/ 4 个文件措辞更新
  ├─ DEVELOPMENT.md 1 行更新
  └─ 验证: grep 确认无遗漏旧措辞

Step 5 — 编译 + 回归验证
  ├─ tsc --noEmit
  ├─ vitest run（全量测试）
  └─ grep 验证完整性
```

---

## Out of Scope

- **方法重命名**: `attemptSessionReconnect`/`performSessionReconnect`/`getReconnectionScopeStatus` 的方法名暂不修改——这属于更大范围的重命名重构，可由后续 WI 处理
- **新增功能**: 无任何新增功能，纯清理
- **events.jsonl snapshot/compaction 机制**: 不在本 WI 范围
- **ProjectManager 多项目 StateManager 拆分**: 不在本 WI 范围
- **性能优化**: 不在本 WI 范围
- **version-unification 包的 Property 21**: 不同的 Property 21（Manifest_Migrator），与本 WI 无关
- **OPENCODE_INTEGRATION_BRIEF.md**: grep 确认无相关引用，不需要修改
- **RecoverySubsystem 构造函数签名变更**: 不涉及

---

## Assumptions（设计假设）

- **Phase 0-2 已完成并验证**: 假设 WI-003/WI-004/WI-005/WI-006 的所有变更已合并且通过验证（Phase 2 verification_report.md 确认 startupReplay 已就位）
- **startupReplay 是严格上位替代**: 假设 `SessionRegistry.startupReplay()` 完全覆盖 `detectOldSessions`/`reconnectOldSessions` 的功能（恢复所有 session 状态：pending/active/history/bindings/aliases）
- **无外部消费者**: 假设 `detectOldSessions`/`reconnectOldSessions` 仅被 Daemon.ts 和 property-21.test.ts 调用（grep 已确认）
- **TypeScript 编译器足够**: 假设编译时类型检查能捕获所有遗留引用
- **测试重写可保留核心语义**: 假设 Property 21 的"startup-only"约束可通过 `attemptSessionReconnect` + `getReconnectionScopeStatus` 充分验证

---

## 变更量级总结

| 类别 | 文件数 | 估计行数变更 |
|------|--------|-------------|
| 源码（RecoverySubsystem.ts） | 1 | ~73 行删除 + ~10 行注释重写 |
| 源码（Daemon.ts） | 1 | ~3 行删除 + ~1 行注释更新 |
| 测试（property-21.test.ts） | 1 | 全文重写 ~100-150 行 |
| .kiro/specs/ | 4 | ~10 行措辞更新 |
| 开发文档 | 1 | ~1 行更新 |
| **合计** | **7** | **~76 行删除 + ~162 行新增/重写** |
