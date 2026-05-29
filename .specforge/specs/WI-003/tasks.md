# WI-003 Tasks — Phase 0 热修：OpenCode 事件路由断链

## 任务规划概述

| 属性 | 值 |
|------|-----|
| **任务总数** | 3 |
| **并行批次** | 0（全部串行） |
| **串行链** | TASK-1 → TASK-2 → TASK-3 |
| **改动文件范围** | `packages/daemon-core/` 内 2 个源文件 + 3 个测试文件 |
| **预估总改动行数** | ~45 行（~13 行源码 + ~32 行测试） |

## 自问自答验收清单

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | 每个 DD 都有对应的 task 覆盖吗？ | ✅ DD-1→TASK-1, DD-2(2.1/2.2/2.3/2.4)→TASK-2, DD-7→TASK-3, DD-3/4/5/6 为设计分析段落无需独立 task |
| 2 | 每个 task 的 context_block 是否充分？ | ✅ 每个 task 包含 What/Why/Refs/Constraints/Done When，executor 不需回查 design.md |
| 3 | verification_commands 是否真能机器跑？ | ✅ 全部使用 `npx vitest run <path>` 从 daemon-core 目录执行，vitest 已在 devDependencies |
| 4 | 并行批次内的 task 是否互相独立？ | ✅ 全串行，无并行批次 |
| 5 | 有没有共享代码需要先建独立 task？ | ✅ 无——TASK-1 和 TASK-2 改不同文件，无共享新代码 |

---

### TASK-1 HTTPServer.handleOpenCodeEvent — sessionId 合并进 payload

**context_block**（executor 必读）：

- **What**: 修改 `HTTPServer.ts` 的 `handleOpenCodeEvent` 方法，将函数参数 `sessionId`（daemon 颁发的 UUIDv7）合并进传递给 SessionRegistry 的 payload 中，作为 `payload.sessionId` 的 fallback 值
- **Why**: 当前 `handleOpenCodeEvent` 收到顶层 `sessionId` 参数但完全丢弃，仅将 `payload`（= `data`）转发给 SessionRegistry。导致 SessionRegistry 的 Step 1（`data.sessionId`）永远读到 undefined → 4 步映射全部 miss → `No session binding found` WARN 日志
- **Refs**: DD-1（HTTPServer.handleOpenCodeEvent 修改设计）、CP-1（sessionId 合并幂等性）
- **Constraints**:
  - 不引入新依赖
  - 不改变 plugin wire format（plugin 端零改动）
  - `payload.sessionId` 已存在时不覆盖（使用 `??` fallback）
  - 修改仅限 `HTTPServer.ts` L1137–L1140 的参数构造表达式
  - 遵守 TypeScript strict mode
- **Done When**:
  - `HTTPServer.handleOpenCodeEvent` 传递给 `sessionRegistry.handleOpenCodeEvent` 的第二个参数包含 `sessionId` 字段
  - 当 `payload` 无 `sessionId` 时，合并后 `result.sessionId === sessionId`（注入 daemon ID）
  - 当 `payload` 已有 `sessionId` 时，合并后 `result.sessionId === payload.sessionId`（不覆盖）

**执行步骤**：

1. 打开 `packages/daemon-core/src/http/HTTPServer.ts`，定位到 L1137–L1140
2. 将：
   ```ts
   this.deps.sessionRegistry?.handleOpenCodeEvent?.(
     payload.subType ?? 'unknown',
     payload,
   );
   ```
   修改为：
   ```ts
   this.deps.sessionRegistry?.handleOpenCodeEvent?.(
     payload.subType ?? 'unknown',
     { ...payload, sessionId: payload.sessionId ?? sessionId },
   );
   ```
3. 创建单元测试文件 `packages/daemon-core/tests/unit/http-server-handleOpenCodeEvent.test.ts`
4. 编写测试覆盖 CP-1 幂等性：
   - 场景 A：payload 无 sessionId → 合并后 result.sessionId === 顶层 sessionId
   - 场景 B：payload 已有 sessionId → 合并后 result.sessionId === payload 原值（不覆盖）
   - 场景 C：payload.sessionId 为 null/undefined → 使用 fallback sessionId

- **依赖**: 无
- refs: [REQ-001, REQ-005, DD-1, CP-1]
- files: [packages/daemon-core/src/http/HTTPServer.ts, packages/daemon-core/tests/unit/http-server-handleOpenCodeEvent.test.ts]
- **verification_commands**:
  - `npx vitest run tests/unit/http-server-handleOpenCodeEvent.test.ts` — 验证 REQ-001（sessionId 丢弃问题修复）、REQ-005（sessionId 合并进 payload）
- **manual_verification_checks**:
  - 确认 HTTPServer.ts 的改动仅涉及 L1137–L1140 参数构造，无副作用

---

### TASK-2 SessionRegistry — alias 别名表 + 映射增强

**context_block**（executor 必读）：

- **What**: 在 `SessionRegistry.ts` 中（1）新增 `sessionAliases: Map<string, string>` 私有字段，（2）修改 Step 2 映射逻辑从直接查 `projectBindings` 改为通过 alias 表间接查找，（3）在 Step 4 之后添加 lazy-alias 建立逻辑：当 Step 1 成功解析 `internalSessionId` 且 `data` 携带 OpenCode `sessionID` 时，自动建立 alias 映射
- **Why**: 修复前 Step 2 直接用 `projectBindings.has(opencodeSessionId)` 查找——OpenCode sessionID 不是 projectBindings 的 key（projectBindings 的 key 是 daemon 颁发的 sessionId），必然 miss。alias 表提供 `opencodeSessionID → daemonSessionId` 的辅助查找路径。lazy-alias 确保首次通过 Step 1（依赖 TASK-1 注入的 sessionId）命中后，后续事件可走 alias 快速路径
- **Refs**: DD-2.1（sessionAliases 字段声明）、DD-2.2（registerPluginSession 注释占位）、DD-2.3（Step 2 alias 查找）、DD-2.4（lazy-alias 建立）、CP-2（alias 表幂等性）
- **Constraints**:
  - alias 表 in-memory only，不引入持久化（Phase 0 约束，REQ-004）
  - 不修改 `registerPluginSession` 函数签名
  - 不修改 `getSnapshot` / `restoreFromSnapshot`（alias 不纳入序列化）
  - `projectBindings` 的 key 语义不变（daemon sessionId 仍为主键）
  - alias 冲突策略：先到先得（`!this.sessionAliases.has(opencodeSessionId)` 确保不重复建立）
  - 遵守 TypeScript strict mode
- **Done When**:
  - `sessionAliases` 字段已声明在 `projectBindings` 之后（L54 附近）
  - Step 2 改为通过 `sessionAliases.get(opencodeSessionId)` 查找，不再直接用 `projectBindings.has(opencodeSessionId)`
  - Step 4 之后、`switch (subType)` 之前添加 lazy-alias 逻辑
  - 同一 `(opencodeSessionId, daemonSessionId)` 对多次调用 `handleOpenCodeEvent` 后，alias 值不变（CP-2 幂等性）
  - 现有 `tests/unit/session.test.ts` 全部通过（不变行为验证）

**执行步骤**：

1. 打开 `packages/daemon-core/src/session/SessionRegistry.ts`
2. **DD-2.1** — 在 L54 `private projectBindings` 之后、L55 `private subscription` 之前插入：
   ```ts
   /**
    * Alias table: OpenCode native sessionID → daemon sessionId.
    * Built at registerPluginSession time when OpenCode payload carries sessionID.
    * In-memory only (Phase 0); daemon restart loses this mapping.
    */
   private sessionAliases: Map<string, string> = new Map();
   ```
3. **DD-2.2** — 在 L179 `this.projectBindings.set(identity.sessionId, projectPath);` 之后添加注释占位：
   ```ts
   // Build alias: callers may pass an OpenCode-native sessionID in context;
   // currently no callers provide it, but the hook is in place for when
   // handleIngestRegister evolves to pass plugin context data.
   ```
4. **DD-2.3** — 定位 Step 2 区块（L525–L529），将：
   ```ts
   // 2. If not found, try OpenCode sessionID in projectBindings
   const opencodeSessionId = data.sessionID as string | undefined;
   if (!internalSessionId && opencodeSessionId && this.projectBindings.has(opencodeSessionId)) {
     internalSessionId = opencodeSessionId;
   }
   ```
   替换为：
   ```ts
   // 2. If not found, try OpenCode sessionID via alias table
   const opencodeSessionId = data.sessionID as string | undefined;
   if (!internalSessionId && opencodeSessionId) {
     const aliased = this.sessionAliases.get(opencodeSessionId);
     if (aliased && this.projectBindings.has(aliased)) {
       internalSessionId = aliased;
     }
   }
   ```
5. **DD-2.4** — 在 `if (!internalSessionId)` 块之后、`switch (subType)` 之前（约 L551 之后）插入 lazy-alias 逻辑：
   ```ts
   // Lazy-alias: establish OpenCode sessionID → daemon sessionId mapping
   if (internalSessionId && opencodeSessionId && !this.sessionAliases.has(opencodeSessionId)) {
     this.sessionAliases.set(opencodeSessionId, internalSessionId);
   }
   ```
6. 创建单元测试文件 `packages/daemon-core/tests/unit/session-registry-alias.test.ts`
7. 编写测试覆盖 CP-2 alias 幂等性 + DD-2.3 Step 2 alias 查找 + DD-2.4 lazy-alias 建立：
   - 场景 A：首次事件携带 `sessionId`（daemon ID）和 `sessionID`（OpenCode ID）→ Step 1 命中 + lazy-alias 建立
   - 场景 B：后续事件仅携带 `sessionID`（OpenCode ID）→ Step 2 通过 alias 命中
   - 场景 C：多次调用同一 `(opencodeSessionId, daemonSessionId)` → alias 值始终为首次建立的值（CP-2）
   - 场景 D：不同 OpenCode sessionID 映射到不同 daemon sessionId → 各自独立

- **依赖**: TASK-1
- refs: [REQ-002, REQ-006, DD-2, CP-2]
- files: [packages/daemon-core/src/session/SessionRegistry.ts, packages/daemon-core/tests/unit/session-registry-alias.test.ts]
- **verification_commands**:
  - `npx vitest run tests/unit/session-registry-alias.test.ts` — 验证 REQ-002（4 步映射修复）、REQ-004（不变行为）、REQ-006（alias 别名表）
- **manual_verification_checks**:
  - 确认 `getSnapshot` / `restoreFromSnapshot` 方法未修改（alias 不纳入序列化）
  - 确认现有 `tests/unit/session.test.ts` 全部通过：`npx vitest run tests/unit/session.test.ts`

---

### TASK-3 端到端测试 — plugin register → postEvent → 路由命中

**context_block**（executor 必读）：

- **What**: 创建集成测试，模拟完整的 `registerPluginSession → HTTPServer.handleOpenCodeEvent → SessionRegistry.handleOpenCodeEvent` 数据流，验证修复后事件路由不再 miss，不再出现 `No session binding found` 警告
- **Why**: bugfix.md §2.3 定义了 4 条验收标准，其中第 1 条（WARN 日志不再出现）和第 2 条（事件路由后正确执行 touch/terminate）需要端到端集成测试来验证。TASK-1 和 TASK-2 的单元测试只覆盖单个组件，此测试验证两处修改的协同效果
- **Refs**: DD-7（端到端测试设计）、CP-3（路由完整性）
- **Constraints**:
  - 测试通过 mock HTTPServer 的 deps 注入，不启动真实 HTTP 服务器
  - 测试仅覆盖修复后路由命中的核心路径（DD-7 constraint）
  - 不验证 events.jsonl / state.json（不变行为，非核心路径）
  - 遵守现有集成测试模式（参考 `tests/integration/api-endpoints.test.ts` 的 mock 风格）
- **Done When**:
  - 模拟 `registerPluginSession` → 传入 `handleOpenCodeEvent(sessionId, data, ts)` → SessionRegistry Step 1 命中 → 不输出 WARN
  - 事件路由后 `touch` 被调用（subType="session.idle"）
  - 首次事件后 alias 建立成功，后续仅携带 `sessionID` 的事件也能通过 alias 路由命中
  - 全部 3 个测试文件（TASK-1/2/3）通过

**执行步骤**：

1. 创建集成测试文件 `packages/daemon-core/tests/integration/opencode-event-routing.test.ts`
2. 编写集成测试，按 DD-7 测试步骤：
   - **Setup**：创建 SessionRegistry 实例（真实 EventBus），准备 HTTPServer mock deps（`sessionRegistry` 注入）
   - **Test 1 — 基本路由命中**：
     1. 调用 `sessionRegistry.registerPluginSession("project-1", "/path/to/project")`
     2. 构造 payload = `{ subType: "session.idle", sessionID: "oc-test-session-id" }`
     3. 模拟 HTTPServer 调用：`sessionRegistry.handleOpenCodeEvent("session.idle", { ...payload, sessionId: identity.sessionId })`
     4. 验证 WARN 日志未出现（spy on console.warn）
     5. 验证 session.lastActiveAt 被更新（touch 被调用）
   - **Test 2 — alias 快速路径**：
     1. 在 Test 1 基础上，发送第二事件仅携带 `sessionID`（不携带 `sessionId`）
     2. 验证通过 alias 表仍能路由命中（Step 2 命中）
   - **Test 3 — 路由完整性（CP-3）**：
     1. 注册多个 session
     2. 每个发送不同 subType 事件
     3. 验证所有事件均路由成功，无 WARN
3. 运行全部 3 个测试文件确认通过

- **依赖**: TASK-1, TASK-2
- refs: [REQ-003, DD-7, CP-3]
- files: [packages/daemon-core/tests/integration/opencode-event-routing.test.ts]
- **verification_commands**:
  - `npx vitest run tests/integration/opencode-event-routing.test.ts` — 验证 REQ-003（验收标准：路由命中、WARN 消失）、REQ-007（回滚条件：alias 无错误绑定）
- **manual_verification_checks**:
  - 确认测试覆盖 bugfix.md §2.3 的 4 条验收标准中的第 1 条（WARN 不再出现）和第 2 条（touch/terminate 正确执行）
  - 确认全部测试文件通过：`npx vitest run`（从 daemon-core 目录）
