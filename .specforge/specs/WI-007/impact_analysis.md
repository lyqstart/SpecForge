# WI-007 影响分析：Property 21 重写与悬空契约清理（Phase 3 — 收尾）

## 变更范围

### 1.1 源码变更

| 文件 | 行号 | 变更类型 | 变更内容 |
|------|------|----------|----------|
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | L13-L17 | **重写** | Property 21 注释化不变式：从"启动期重连 OpenCode 进程"改为"启动期 WAL 重放重建 session 状态" |
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | L458-L491 | **删除** | `detectOldSessions()` 方法：读取 events.jsonl 中 `session.activated/terminated` 做差集，返回活跃旧 session 列表 |
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | L500-L538 | **删除** | `reconnectOldSessions()` 方法：遍历旧活跃 session 调用 `attemptSessionReconnect` |
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | L354-L375 | **评估** | `attemptSessionReconnect()`：仍被外部接口需求保留（Daemon.start L185 注释暗示保留），但需审查是否仅被 reconnectOldSessions 调用 |
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | L381-L408 | **评估** | `performSessionReconnect()`：私有方法，仅被 `attemptSessionReconnect` 调用，需同步评估 |
| `packages/daemon-core/src/daemon/Daemon.ts` | L183-L188 | **修改** | 删除 `reconnectOldSessions()` 调用（L185），更新 Property 21 相关注释（L183、L187） |
| `packages/daemon-core/tests/property/property-21.test.ts` | 全文 343 行 | **重写** | 4 个测试用例直接调用 `detectOldSessions`（L165）和 `reconnectOldSessions`（L169），需重写为基于 `startupReplay` 的验证 |

### 1.2 规格文档变更（.kiro/specs/）

| 文件 | 行号 | 当前内容 | 目标变更 |
|------|------|----------|----------|
| `.kiro/specs/v6-architecture-overview/design.md` | L1049-L1053 | "对旧 OpenCode session 的自动重连尝试只能出现在 Daemon 启动流程内" | 重写为"启动期 WAL 重放重建 session 状态仅限启动流程" |
| `.kiro/specs/daemon-core/requirements.md` | L45-L48 | "automatic reconnection attempts to old OpenCode sessions" | 重写为"WAL replay-based session state reconstruction" |
| `.kiro/specs/daemon-core/design.md` | L201 | "Limit session reconnection to startup only (Property 21)" | 更新为"Limit session WAL replay reconstruction to startup only (Property 21)" |
| `.kiro/specs/daemon-core/tasks.md` | L18, L115-L116, L237 | Property 21 相关测试任务描述 | 更新措辞 |

**注意**：`.kiro/specs/version-unification/` 中的 Property 21（L865: Manifest_Migrator legacy detection）是 **不同的 Property 21**（属于 version-unification 包），与本 WI 的 daemon-core Property 21 无关，**不应修改**。

### 1.3 开发文档变更

| 文件 | 行号 | 变更内容 |
|------|------|----------|
| `packages/daemon-core/DEVELOPMENT.md` | L83 | 更新 Property 21 描述为 WAL 重放语义 |

### 1.4 不受影响的文件

| 文件 | 原因 |
|------|------|
| `docs/archive/OPENCODE_INTEGRATION_BRIEF.md` | grep 确认无 Property 21 / detectOldSessions / reconnectOldSessions 引用 |
| `.kiro/specs/version-unification/*` | Property 21 含义不同（Manifest_Migrator），非本 WI 范围 |
| `packages/version-unification/tests/property/version-unification-property-21.property.test.ts` | 同上，属于不同包的不同 Property 21 |
| `tests/integration/fixtures/sf_v6_arch_check/backup/*.md` | 历史备份文件，不修改 |

### 1.5 变更量级统计

| 类别 | 文件数 | 估计行数变更 |
|------|--------|-------------|
| 源码（RecoverySubsystem.ts） | 1 | ~90 行删除 + ~5 行重写 |
| 源码（Daemon.ts） | 1 | ~4 行修改 |
| 测试（property-21.test.ts） | 1 | 全文重写 ~100-150 行 |
| .kiro/specs/ | 4 | ~10 行措辞更新 |
| 开发文档 | 1 | ~1 行更新 |
| **合计** | **7** | **~110 行删除 + ~160 行新增/重写** |

---

## 风险评估

**总体风险等级：低**

### 2.1 风险项清单

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|------|------|------|----------|
| R1 | `detectOldSessions` / `reconnectOldSessions` 有外部调用者 | 极低 | 中 | grep 确认仅 Daemon.ts L185 和 property-21.test.ts L165/L169 调用；若无外部消费者则安全删除 |
| R2 | Property 21 测试重写后不覆盖原始语义 | 低 | 中 | 新测试需验证：startupReplay 仅在 startup phase 执行（等同于 Property 21 的"重连仅限启动期"约束） |
| R3 | 删除后遗留引用导致编译失败 | 极低 | 低 | TypeScript 编译器会立即报错；所有引用已通过 grep 枚举 |
| R4 | docs/.kiro 中遗漏 Property 21 旧措辞 | 低 | 低 | grep 已枚举所有引用（11 处 .kiro/specs/，排除 version-unification 后 4 处需改） |

### 2.2 低风险论证

1. **无业务逻辑变更**：本次 WI 是纯清理——重写注释措辞 + 删除已替代的死代码路径。不引入新行为。
2. **功能替代已验证**：Phase 2 verification_report.md 确认 `startupReplay` 已就位（验收标准 D: "startupReplay handles all 6 action types"），RecoverySubsystem.checkAndRepair L99-L107 已调用 `startupReplay`。
3. **悬空契约证据充分**：WI-002 research/01-contracts.md C6 隐式契约 (4) 明确标注 `detectOldSessions/reconnectOldSessions` 读取 `session.activated/terminated` 事件但无 producer——Phase 2 的 WAL-ification 为这些事件创建了 producer（SessionRegistry 所有写操作 WAL-first），同时 `startupReplay` 替代了差集计算逻辑。
4. **冗余路径确认**：Daemon.ts 启动流程中，`checkAndRepair()`（L151）已调用 `startupReplay`，随后的 `reconnectOldSessions()`（L185）是冗余调用。

### 2.3 功能替代关系确认

**旧路径（将被删除）**：
```
Daemon.start()
  → recoverySubsystem.reconnectOldSessions()        [L185]
    → 读取 events.jsonl 中 session.activated/terminated
    → 差集计算得到"活跃旧 session"
    → 对每个调用 attemptSessionReconnect()
      → performSessionReconnect() (模拟行为，无实际网络探测)
```

**新路径（Phase 2 已实现）**：
```
Daemon.start()
  → recoverySubsystem.checkAndRepair()               [L151]
    → wal.readAllEvents()
    → stateManager.rebuildState()
    → sessionRegistry.startupReplay(sessionEvents)   [L99-L107]
      → 处理 6 种 session 事件类型
      → 恢复 pendingSessions/activeSessions/historySessions
      → 恢复 projectBindings + aliasMap
      → 返回 ReplaySummary（replayedCount/restoredBindings/restoredAliases）
```

**结论**：`startupReplay` 不仅完全替代 `reconnectOldSessions` 的功能（从事件流重建活跃 session），还扩展了恢复范围（包括 pending/history/bindings/aliases），是严格的上位替代。

---

## 回归测试范围

### 3.1 需修改的测试

| 测试文件 | 测试用例 | 变更需求 |
|----------|----------|----------|
| `packages/daemon-core/tests/property/property-21.test.ts` | Property 21.1: Reconnection attempts only during startup | 重写为验证 `startupReplay` 仅在 startup phase 执行 |
| `packages/daemon-core/tests/property/property-21.test.ts` | Property 21.2: Post-startup detection doesn't trigger reconnection | 重写：验证 startupReplay 在 post-startup 调用无副作用（或改为验证 checkAndRepair 不在 startup phase 之外调 startupReplay） |
| `packages/daemon-core/tests/property/property-21.test.ts` | Property 21.3: Reconnection logic respects scope boundaries | 保留 `getReconnectionScopeStatus()` 验证（此方法不依赖旧 API） |
| `packages/daemon-core/tests/property/property-21.test.ts` | Property 21.4: Fast-check PBT (≥100 iterations) | 重写为 PBT 验证 startupReplay 的 scope 约束 |

### 3.2 需回归验证的现有测试（无修改，但需确认通过）

| 测试文件 | 验证内容 | 影响评估 |
|----------|----------|----------|
| `packages/daemon-core/tests/unit/recovery-session-replay.test.ts` | startupReplay 单元测试 | **不受影响**：测试不依赖 detectOldSessions/reconnectOldSessions |
| `packages/daemon-core/tests/integration/wal-singleton-e2e.test.ts` | WAL 单例端到端测试 | **不受影响**：不涉及旧 session 恢复路径 |
| `packages/daemon-core/tests/integration/daemon-lifecycle.test.ts` | Daemon 生命周期集成测试 | **可能受影响**：若测试验证 `reconnectOldSessions` 被调用，需确认该断言已更新 |
| `packages/daemon-core/tests/property/pbt-state.test.ts` | Property-based state 测试 | **不受影响** |
| `packages/daemon-core/tests/property/property-7.test.ts` | WAL Ordering 测试 | **不受影响** |
| `packages/daemon-core/tests/property/property-1.test.ts` | Property 1 测试 | **不受影响** |
| `packages/daemon-core/tests/property/property-30.test.ts` | Event Schema 测试 | **不受影响** |

### 3.3 建议新增的测试

| 测试 | 目的 |
|------|------|
| `RecoverySubsystem` 删除后 API 兼容性测试 | 确认 `detectOldSessions` / `reconnectOldSessions` 不再存在于导出接口中（TypeScript 编译期验证） |
| `Daemon.start()` 无 `reconnectOldSessions` 调用的冒烟测试 | 确认启动流程不再调用已删除方法 |

---

## KG 关联

### 4.1 相关 KG 节点

以下 KG 节点与本次变更相关，开发阶段完成后需同步更新：

| 节点类型 | 节点标识 | 关联说明 |
|----------|----------|----------|
| design_decision | WI-002 调查发现 | Property 21 悬空契约证据（C6 隐式契约 (4)）的原始来源 |
| design_decision | Property 20/21 不变量 | RecoverySubsystem L7-L17 声明的两个不变量，Property 21 措辞需更新 |
| code_file | RecoverySubsystem | 主要修改目标，Property 21 注释重写 + detectOldSessions/reconnectOldSessions 删除 |
| code_file | SessionRegistry | startupReplay 替代旧路径的执行者，Phase 2 已实现 |
| code_file | Daemon.ts | L183-L188 调用点需修改 |
| task | WI-006 tasks | Phase 2 任务定义中包含"Property 21 措辞重写"留给 Phase 3 的标注 |

### 4.2 跨 WI 影响链

```
WI-002 (investigation: A+D Hybrid 推荐)
  → WI-003 (Phase 0: HTTPServer sessionId merge) ✅
  → WI-004 (Phase 1a: WAL singleton) ✅
  → WI-005 (Phase 1b: RecoverySubsystem DI) ✅
  → WI-006 (Phase 2: SessionRegistry WAL-ification + startupReplay) ✅
  → WI-007 (Phase 3: Property 21 rewrite + dead code cleanup) ← 本 WI
```

---

## 5. 执行建议

### 5.1 建议执行顺序

1. **Step 1 — 删除死代码**：RecoverySubsystem.ts 删除 detectOldSessions + reconnectOldSessions；Daemon.ts 删除 L185 调用 + 更新注释
2. **Step 2 — 重写 Property 21 注释**：RecoverySubsystem.ts L13-L17
3. **Step 3 — 重写测试**：property-21.test.ts 全文重写
4. **Step 4 — 同步文档**：.kiro/specs/ + DEVELOPMENT.md 措辞更新
5. **Step 5 — 编译验证**：TypeScript 编译确认无遗留引用

### 5.2 兼容性策略

- 若发现 `detectOldSessions` 有外部消费者（grep 未发现），保留 API 签名但内部转调 `sessionRegistry.startupReplay`
- `attemptSessionReconnect` / `performSessionReconnect` / `getReconnectionScopeStatus` 方法评估是否保留——`getReconnectionScopeStatus` 仍可用于测试 startup phase 约束

### 5.3 回滚条件

- 若删除后 property-21 测试无法通过重写满足原始语义约束 → 保留方法体但标记 `@deprecated`，内部转调 startupReplay
- 若 daemon-lifecycle 集成测试依赖 `reconnectOldSessions` 调用 → 更新测试而非回滚代码
