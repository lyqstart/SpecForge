# WI-007 Tasks: Property 21 重写与悬空契约清理（Phase 3 — 收尾）

## 概览

| 维度 | 值 |
|------|-----|
| Work Item | WI-007 |
| 变更类型 | change_request（注释重写 + 死代码删除 + 文档同步） |
| 任务数 | 3 |
| 并行批次 | 1（全部可并行） |
| 涉及文件数 | 8 |
| 预估总行变更 | ~76 行删除 + ~162 行新增/重写 |

---

## 执行计划

```
批次 1（全部并行，无文件冲突）:
  ├─ TASK-1: RecoverySubsystem + Daemon.ts 源码变更（DD-1 + DD-2 + DD-3 + DD-6）
  ├─ TASK-2: property-21.test.ts 全文重写（DD-4）
  └─ TASK-3: .kiro/specs/ + DEVELOPMENT.md 文档同步（DD-5）
```

---

## Pre-check 自问自答验收清单

1. **每个 DD 都有对应的 task 覆盖吗？** — ✅ DD-1/DD-2/DD-3/DD-6 → TASK-1；DD-4 → TASK-2；DD-5 → TASK-3
2. **每个 task 的 context_block 是否充分？** — ✅ 每个 task 包含精确的旧文本/新文本/行号/删除范围/保留清单，executor 无需回查 design.md
3. **verification_commands 是否真能机器跑？** — ✅ 全部使用 `npx tsc --noEmit`、`npx vitest run`、`grep` 命令，返回 0/非 0 退出码
4. **并行批次内的 task 是否互相独立？** — ✅ TASK-1 改 RecoverySubsystem.ts + Daemon.ts；TASK-2 改 property-21.test.ts；TASK-3 改 .kiro/specs/ + DEVELOPMENT.md。零文件重叠
5. **有没有共享代码需要先建独立 task？** — ✅ 无共享代码。本次是纯清理（删除+重写），不引入新代码

---

### TASK-1 源码变更：注释重写 + 死代码删除 + 调用点清理

**context_block**（executor 必读）：
- **What**: 对 RecoverySubsystem.ts 和 Daemon.ts 执行 4 项变更：Property 21 注释重写（L13-L17）、内部注释同步（L46/L355/L357/L365）、删除 `detectOldSessions` 和 `reconnectOldSessions` 方法（L450-L538）、Daemon.ts 调用点清理（L183-L188）
- **Why**: Phase 2（WI-006）已将 session 恢复机制从"网络探测 OpenCode 进程"改为"纯本地 WAL 重放"（`SessionRegistry.startupReplay`）。Property 21 语义约束不变（"仅限启动期"），但描述机制从"reconnection"变为"WAL replay"。旧的 `detectOldSessions`/`reconnectOldSessions` 已被 `startupReplay` 严格上位替代，属于悬空死代码
- **Refs**: DD-1（Property 21 注释重写）、DD-2（死代码删除）、DD-3（Daemon 调用点清理）、DD-6（内部注释同步）
- **REQ**: REQ-1 (Property 21 注释重写), REQ-2 (老代码删除), REQ-4 (内部注释同步), REQ-12.4 (Session startup-only 约束), REQ-12.5 (Session recovery scope)
- **Constraints**:
  - 不引入新依赖
  - 不修改任何保留方法的签名或逻辑（`attemptSessionReconnect`、`performSessionReconnect`、`getReconnectionScopeStatus` 必须原封不动保留）
  - 不修改 `SessionReconnectResult` 接口定义（L30-L35）
  - 不修改方法名（`attemptSessionReconnect` 等方法名暂不重命名，留给后续 WI）
  - 遵守项目 TypeScript strict mode
- **Done When**:
  1. RecoverySubsystem.ts L13-L17 注释已替换为新文本（见下方精确替换指令）
  2. RecoverySubsystem.ts L46 内部注释已更新
  3. RecoverySubsystem.ts L355/L357/L365 内部注释已更新
  4. RecoverySubsystem.ts 中 `detectOldSessions()` 方法（L450-L491，含 JSDoc）完整删除
  5. RecoverySubsystem.ts 中 `reconnectOldSessions()` 方法（L493-L538，含 JSDoc）完整删除
  6. Daemon.ts L183-L188 已清理为 2 行紧凑注释+调用（见下方精确替换指令）
  7. `npx tsc --noEmit` 编译通过（在 `packages/daemon-core/` 目录下）
  8. `npx vitest run` 全量测试通过（在 `packages/daemon-core/` 目录下）

**精确变更指令**（executor 按此执行）：

**变更 A — RecoverySubsystem.ts L13-L17（Property 21 顶部注释重写，DD-1）**:

旧文本（精确替换）：
```
 * Property 21: Session Reconnect Scope
 * For all Daemon runtime event streams, "automatic reconnection attempts to old
 * OpenCode sessions" may only occur within the Daemon startup process; after
 * startup completes, even if old sessions are detected as alive, the Daemon
 * must not automatically initiate reconnection.
```

新文本：
```
 * Property 21: Session WAL Replay Scope
 * For all Daemon runtime event streams, WAL-replay-based session state reconstruction
 * may only occur within the Daemon startup process; after startup completes, the
 * Daemon must not automatically initiate session state reconstruction via WAL replay.
```

**变更 B — RecoverySubsystem.ts L46（内部注释同步，DD-6）**:

旧文本：`// Property 21: Track startup phase to limit reconnection attempts`
新文本：`// Property 21: Track startup phase to limit WAL replay session reconstruction`

**变更 C — RecoverySubsystem.ts L355（attemptSessionReconnect JSDoc，DD-6）**:

旧文本：`Attempt session reconnection (only during startup - Property 21)`
新文本：`Attempt session WAL replay reconstruction (only during startup - Property 21)`

**变更 D — RecoverySubsystem.ts L357-L359（attemptSessionReconnect JSDoc body，DD-6）**:

旧文本：
```
   * Property 21: Reconnection attempts may only occur within Daemon startup process.
   * After startup completes, even if old sessions are detected as alive,
   * the Daemon must not automatically initiate reconnection.
```

新文本：
```
   * Property 21: WAL replay session reconstruction may only occur within Daemon startup process.
   * After startup completes, the Daemon must not automatically initiate session state reconstruction via WAL replay.
```

**变更 E — RecoverySubsystem.ts L365（attemptSessionReconnect 内部注释，DD-6）**:

旧文本：`// Property 21: Only attempt reconnection during startup phase`
新文本：`// Property 21: Only attempt WAL replay during startup phase`

**变更 F — RecoverySubsystem.ts L450-L538（删除两个方法，DD-2）**:

删除范围：从 `detectOldSessions()` 的 JSDoc 开头（`/**` 在 L450 附近）到 `reconnectOldSessions()` 方法体的闭合 `}` （L538）——包括中间的空行。具体是从以下文本开始：

```
  /**
   * Detect old sessions from previous Daemon run
   ...
  async reconnectOldSessions(): Promise<SessionReconnectResult[]> {
    ...
    return results;
  }
```

**保留**（不可删除）：
- `hasCompletedStartup()` 方法（L442-L448）— 在删除范围之前
- `getReconnectionScopeStatus()` 方法（L544-L554 附近，删除后行号会变化）— 在删除范围之后
- `attemptSessionReconnect()` 方法（L354-L375）— 在删除范围之前
- `performSessionReconnect()` 方法（L381-L408）— 在删除范围之前

**变更 G — Daemon.ts L183-L188（调用点清理，DD-3）**:

旧文本（精确替换，L183-L188）：
```typescript
    // Property 21: Attempt to reconnect old sessions from previous Daemon run
    // This only succeeds because we're still in the startup phase
    await this.recoverySubsystem.reconnectOldSessions();

    // Property 21: Complete startup - no more reconnection attempts allowed
    this.recoverySubsystem.completeStartup();
```

新文本：
```typescript
    // Property 21: Complete startup - no more WAL replay session reconstruction allowed
    this.recoverySubsystem.completeStartup();
```

- **依赖**: 无
- refs: [DD-1, DD-2, DD-3, DD-6]
- requirements: [REQ-1, REQ-2, REQ-4, REQ-12.4, REQ-12.5]
- files: [packages/daemon-core/src/recovery/RecoverySubsystem.ts, packages/daemon-core/src/daemon/Daemon.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx tsc --noEmit`
  - unit: `cd packages/daemon-core && npx vitest run`
  - regression: `cd packages/daemon-core && node -e "const r = require('./dist/recovery/RecoverySubsystem'); const proto = r.RecoverySubsystem.prototype; if (typeof proto.detectOldSessions === 'function') { console.error('FAIL: detectOldSessions still exists'); process.exit(1); } if (typeof proto.reconnectOldSessions === 'function') { console.error('FAIL: reconnectOldSessions still exists'); process.exit(1); } console.log('PASS: deleted methods not found'); process.exit(0);"`
- **manual_verification_checks**:
  - 确认 RecoverySubsystem.ts 中 `detectOldSessions` 和 `reconnectOldSessions` 文本完全消失
  - 确认 Daemon.ts 中不再有 `reconnectOldSessions` 调用

---

### TASK-2 property-21.test.ts 全文重写

**context_block**（executor 必读）：
- **What**: 重写 `packages/daemon-core/tests/property/property-21.test.ts`（全文 ~100-150 行），将测试从验证"reconnection 机制"改为验证"WAL replay 的启动期约束"
- **Why**: TASK-1 删除了 `detectOldSessions()` 和 `reconnectOldSessions()` 方法。旧测试 21.2 直接调用这两个已删除 API，必须重写。Property 21 的核心语义不变——"startup phase 外不允许 session 状态重建"——但验证的机制从"reconnection"变为"WAL replay scope"
- **Refs**: DD-4（property-21.test.ts 重写策略）
- **REQ**: REQ-2 (老代码删除后测试同步), REQ-12.4 (Session startup-only 约束), REQ-12.5 (Session recovery scope), REQ-5.4 (Property-based testing)
- **Constraints**:
  - 测试框架：vitest + fast-check（已有依赖）
  - **保留的 API（可调用）**：
    - `attemptSessionReconnect(sessionId: string): Promise<boolean>` — startup phase 内返回 true/false，phase 外返回 false
    - `getReconnectionScopeStatus(): { isInStartupPhase: boolean; hasStartupCompleted: boolean; reconnectionAllowed: boolean }` — 报告 startup phase 状态
    - `beginStartupPhase()` / `completeStartup()` — 控制 startup phase 生命周期
    - `isStartupPhase(): boolean` / `hasCompletedStartup(): boolean` — 查询方法
    - `initialize(): Promise<void>` — 初始化
  - **已删除的 API（禁止调用）**：
    - `detectOldSessions()` — 已被 SessionRegistry.startupReplay 替代
    - `reconnectOldSessions()` — 已被 SessionRegistry.startupReplay 替代
  - 4 个测试用例必须保留，用例编号 21.1/21.2/21.3/21.4 不变
  - PBT 用例（21.4）至少 100 次迭代
  - 不引入新的外部依赖
- **Done When**:
  1. property-21.test.ts 已重写，4 个测试用例全部通过
  2. 文件中不含 `detectOldSessions` 或 `reconnectOldSessions` 引用
  3. `npx vitest run tests/property/property-21.test.ts` 通过
  4. Property 21 核心语义被验证：startup phase 外 attemptSessionReconnect 返回 false

**测试用例规格**：

| 用例 ID | 标题 | 验证内容 | 实现要点 |
|---------|------|----------|----------|
| 21.1 | "should deny WAL replay session reconstruction after startup completes" | `attemptSessionReconnect` 在 startup 完成后返回 false | 与旧版逻辑相同（该方法保留），更新描述措辞 |
| 21.2 | "should not reconstruct session state via replay after startup" | 验证 startup phase 外 session 状态重建被阻止 | **核心重写**：不再调用 detectOldSessions/reconnectOldSessions。改为：创建 session 事件 → 完成 startup → 调用 `attemptSessionReconnect` → 验证返回 false → 验证 `getReconnectionScopeStatus().reconnectionAllowed === false` |
| 21.3 | "should correctly track WAL replay scope boundaries" | `getReconnectionScopeStatus` 正确追踪 3 个阶段 | 逻辑与旧版相同（该方法保留），更新描述措辞 |
| 21.4 | PBT "WAL replay scope limitation (≥100 iter)" | 随机场景下 startup-only 约束恒成立 | 使用 `attemptSessionReconnect` + `getReconnectionScopeStatus` 验证，不调用已删除 API。≥120 次迭代，80% pass rate |

**文件头注释更新**：
```typescript
/**
 * Property 21: Session WAL Replay Scope Test
 * 
 * Feature: daemon-core, Property 21: Session WAL Replay Scope
 * Derived-From: v6-architecture-overview Property 21
 * 
 * Property Statement:
 * For all Daemon runtime event streams, WAL-replay-based session state reconstruction
 * may only occur within the Daemon startup process; after startup completes, the
 * Daemon must not automatically initiate session state reconstruction via WAL replay.
 * 
 * Validates: Requirements 5.4, 5.5
 */
```

**describe 块标题**：`'Property 21: Session WAL Replay Scope'`

**关键实现提示**：
- 21.2 用例：不需要 mock SessionRegistry。只需验证 `attemptSessionReconnect` 在 post-startup 阶段返回 false（这验证了 Property 21 的核心约束——startup phase 外禁止重建）。同时用 `getReconnectionScopeStatus` 确认状态正确
- 21.4 PBT 用例：生成随机 `sessionCount`、`baseTs`、`reconnectInStartup`、`reconnectAfterStartup` 参数，与旧版结构类似但去除对已删除 API 的调用
- 所有用例使用 `RecoverySubsystem(testProjectPath)` 直接构造（无需 DI），然后调用 `initialize()`

- **依赖**: 无
- refs: [DD-4]
- requirements: [REQ-2, REQ-12.4, REQ-12.5, REQ-5.4]
- files: [packages/daemon-core/tests/property/property-21.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/property/property-21.test.ts`
  - regression: `cd packages/daemon-core && node -e "const fs = require('fs'); const content = fs.readFileSync('tests/property/property-21.test.ts', 'utf8'); if (content.includes('detectOldSessions')) { console.error('FAIL: detectOldSessions still referenced'); process.exit(1); } if (content.includes('reconnectOldSessions')) { console.error('FAIL: reconnectOldSessions still referenced'); process.exit(1); } console.log('PASS: no deleted API references'); process.exit(0);"`
- **manual_verification_checks**:
  - 确认 4 个测试用例覆盖 Property 21 核心语义（startup-only WAL replay 约束）
  - 确认 PBT 用例迭代次数 ≥ 100

---

### TASK-3 文档同步：.kiro/specs/ + DEVELOPMENT.md 措辞更新

**context_block**（executor 必读）：
- **What**: 更新 5 个文档文件中所有 Property 21 相关措辞，从"reconnect/reconnection"改为"WAL replay session reconstruction"
- **Why**: Phase 2 将 session 恢复机制从"网络探测重连"改为"WAL 重放重建"，文档措辞必须与实现保持一致
- **Refs**: DD-5（文档同步策略）
- **REQ**: REQ-3 (.kiro/specs/ 文档同步), REQ-4 (DEVELOPMENT.md 更新), REQ-12.4 (Session startup-only 约束), REQ-12.5 (Session recovery scope)
- **Constraints**:
  - 仅修改措辞/描述文本，不修改需求编号（Requirements 5.4, 5.5 不变）
  - 不修改 `.kiro/specs/version-unification/` 下的任何文件（不同的 Property 21）
  - 不修改 `docs/archive/OPENCODE_INTEGRATION_BRIEF.md`（grep 确认无相关引用）
  - 每个文件只修改 design_delta.md §5.1/§5.2 中指定的行号位置
- **Done When**:
  1. 5 个文件中所有指定行号已更新
  2. `.kiro/specs/` 下不含 `Property 21.*[Rr]econnect` 旧措辞
  3. `DEVELOPMENT.md` L83 已更新
  4. `.kiro/specs/version-unification/` 下文件未被修改

**精确变更指令**（executor 按此执行）：

**文件 1 — `.kiro/specs/v6-architecture-overview/design.md` L1049-L1053**:

旧文本（L1049-L1053）：
```
#### Property 21: Session Reconnect Scope

*For all* Daemon 运行期事件流，"对旧 OpenCode session 的自动重连尝试"只能出现在 Daemon 启动流程内；启动完成后，即便检测到存活的旧 session，Daemon 也不得自动发起重连。

**Validates: Requirements 12.4, 12.5**
```

新文本：
```
#### Property 21: Session WAL Replay Scope

*For all* Daemon 运行期事件流，WAL 重放重建 session 状态仅限 Daemon 启动流程内；启动完成后，Daemon 不得自动发起 session 状态重建（via WAL replay）。

**Validates: Requirements 12.4, 12.5**
```

**文件 2 — `.kiro/specs/daemon-core/requirements.md` L45-L48**:

旧文本（L45-L48）：
```
### Property 21: Session Reconnect Scope
*For all* Daemon runtime event streams, "automatic reconnection attempts to old OpenCode sessions" may only occur within the Daemon startup process; after startup completes, even if old sessions are detected as alive, the Daemon must not automatically initiate reconnection.

**Validates: Requirements 12.4, 12.5**
```

新文本：
```
### Property 21: Session WAL Replay Scope
*For all* Daemon runtime event streams, WAL-replay-based session state reconstruction may only occur within the Daemon startup process; after startup completes, the Daemon must not automatically initiate session state reconstruction via WAL replay.

**Validates: Requirements 12.4, 12.5**
```

**文件 3 — `.kiro/specs/daemon-core/design.md` L201**:

旧文本：`- Limit session reconnection to startup only (Property 21)`
新文本：`- Limit session WAL replay reconstruction to startup only (Property 21)`

**文件 4 — `.kiro/specs/daemon-core/design.md` L298**:

旧文本：`7. **Property 21 (Reconnect Scope)**: Generate runtime scenarios, verify reconnect limits`
新文本：`7. **Property 21 (WAL Replay Scope)**: Generate runtime scenarios, verify replay scope limits`

**文件 5 — `.kiro/specs/daemon-core/tasks.md` L18**:

旧文本：`- Property 21: Session Reconnect Scope`
新文本：`- Property 21: Session WAL Replay Scope`

**文件 6 — `.kiro/specs/daemon-core/tasks.md` L115**:

旧文本：`  - **Property 21 Test**: Verify reconnect scope limitation`
新文本：`  - **Property 21 Test**: Verify WAL replay scope limitation`

**文件 7 — `.kiro/specs/daemon-core/tasks.md` L237-L246**:

旧文本（L237-L246）：
```
### Property 21: Session Reconnect Scope Test
**Strategy**: Generate runtime scenarios with old sessions. Verify:
1. Reconnection attempts only during startup
2. Post-startup session detection doesn't trigger reconnection
3. Reconnection logic respects scope boundaries

**Generators**:
- Random startup/shutdown sequences
- Random old session detection timing
- Random reconnection success/failure scenarios
```

新文本：
```
### Property 21: Session WAL Replay Scope Test
**Strategy**: Generate runtime scenarios with session events. Verify:
1. WAL replay session reconstruction only during startup
2. Post-startup attemptSessionReconnect returns false
3. WAL replay scope boundaries correctly tracked

**Generators**:
- Random startup/shutdown sequences
- Random session event timing
- Random reconnection success/failure scenarios
```

**文件 8 — `packages/daemon-core/DEVELOPMENT.md` L83**:

旧文本：`- Property 21: Session Reconnect Scope`
新文本：`- Property 21: Session WAL Replay Scope`

**排除列表（禁止修改）**：
- `.kiro/specs/version-unification/` 下所有文件
- `docs/archive/OPENCODE_INTEGRATION_BRIEF.md`
- `tests/integration/fixtures/sf_v6_arch_check/backup/*.md`

- **依赖**: 无
- refs: [DD-5]
- requirements: [REQ-3, REQ-4, REQ-12.4, REQ-12.5]
- files: [.kiro/specs/v6-architecture-overview/design.md, .kiro/specs/daemon-core/requirements.md, .kiro/specs/daemon-core/design.md, .kiro/specs/daemon-core/tasks.md, packages/daemon-core/DEVELOPMENT.md]
- **verification_commands**:
  - regression: `cd D:/code/temp/SpecForge && node -e "const fs=require('fs');const c=fs.readFileSync('.kiro/specs/daemon-core/requirements.md','utf8');if(!c.includes('Session WAL Replay Scope')){console.error('FAIL: requirements.md not updated');process.exit(1);}console.log('PASS: requirements.md updated');"`
  - regression: `cd D:/code/temp/SpecForge && node -e "const fs=require('fs');const c=fs.readFileSync('packages/daemon-core/DEVELOPMENT.md','utf8');if(!c.includes('Session WAL Replay Scope')){console.error('FAIL: DEVELOPMENT.md not updated');process.exit(1);}console.log('PASS: DEVELOPMENT.md updated');"`
  - regression: `cd D:/code/temp/SpecForge && node -e "const fs=require('fs');const c=fs.readFileSync('.kiro/specs/daemon-core/design.md','utf8');if(!c.includes('WAL replay reconstruction')){console.error('FAIL: design.md not updated');process.exit(1);}if(!c.includes('WAL Replay Scope')){console.error('FAIL: design.md Property 21 title not updated');process.exit(1);}console.log('PASS: design.md updated');"`
  - regression: `cd D:/code/temp/SpecForge && node -e "const fs=require('fs');const c=fs.readFileSync('.kiro/specs/daemon-core/tasks.md','utf8');if(!c.includes('Session WAL Replay Scope')){console.error('FAIL: tasks.md not updated');process.exit(1);}console.log('PASS: tasks.md updated');"`
  - regression: `cd D:/code/temp/SpecForge && node -e "const fs=require('fs');const c=fs.readFileSync('.kiro/specs/v6-architecture-overview/design.md','utf8');if(!c.includes('WAL 重放重建')){console.error('FAIL: v6 overview not updated');process.exit(1);}console.log('PASS: v6 overview updated');"`
- **manual_verification_checks**:
  - 确认 `.kiro/specs/version-unification/` 下文件未被修改
  - 确认所有旧措辞 "reconnect"/"reconnection" 在 Property 21 上下文中已替换
