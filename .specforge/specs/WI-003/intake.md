# WI-003 Intake — Phase 0 热修：OpenCode 事件路由断链

## 工作流类型
bugfix_spec

## Bug 现象

### 症状 1（主，本次修复目标）
SpecForge daemon 日志持续出现：
```
[SessionRegistry] No session binding found for OpenCode event subtype: unknown, projectPath: undefined
```
OpenCode plugin 发来的 `opencode.event` 类型事件无法路由到对应 session。

### 症状 2（次要，不在本次范围）
`sf_state_read` 返回的 WorkItem 状态在 daemon 重启后从 `state.json` 中消失。
根因：Daemon.ts L54 RecoverySubsystem 未注入依赖 → 不在 Phase 0 范围。

## 根因（已通过 WI-002 调查定位，无需重复调查）

1. **HTTPServer.ts L1130-L1148** `handleOpenCodeEvent(sessionId, data, _ts)` 收到顶层 `sessionId` 参数但完全没用，仅把 payload 转发给 SessionRegistry。
2. **SessionRegistry.handleOpenCodeEvent L513-L567** 的 4 步映射只从 payload 内找 sessionId，必然 miss：
   - Step 1: `data.sessionId` → undefined（plugin 不复制到 data）
   - Step 2: `data.sessionID` → OpenCode sessionID（不匹配 daemon projectBindings key）
   - Step 3: `projectPath` → 通常缺失
   - Step 4: 兜底 → 仅处理 `session.created` 子类型，其余全部 WARN

## 修复范围（仅 Phase 0）

### 改动 1：HTTPServer.ts L1130-L1148
把顶层 sessionId 合并进 payload：
```ts
{ ...payload, sessionId: payload.sessionId ?? sessionId }
```
让顶层 `sessionId`（daemon 颁发的）成为 payload 的兜底。

### 改动 2：SessionRegistry.ts L513-L567
在现有 4 步映射上加 alias 表（OpenCode sessionID → daemon sessionId），alias 仅 in-memory：
- `Map<opencodeSessionID, daemonSessionId>` 别名表
- 在 `registerPluginSession` 时，如果 payload 有 `sessionID`（大写），建立别名
- 在 4 步映射 Step 2 之后加 alias 查找步骤

### 明确不动
- **不动 Daemon.ts L54**（Phase 1 处理 RecoverySubsystem 注入）
- **不引入 WAL 化**（Phase 2 处理）
- **不动 plugin 端代码**（wire format 不变，D5-A 完全兼容）

## WI-002 调查素材引用

- `02-symptom-chains.md`：症状 1 逐跳证据链（Hop 1-7），精确定位断链点
- `03-comparison-matrix.md` D1-A / D4-A / D5-A：方案 A 在 ID 一致性（partial）、模块边界（一文件+一行）、协议兼容性（完全兼容）维度的判定
- `05-recommendation.md` §5.5 Phase 0：完整修复范围、回滚条件、兼容性方式

## 期望产出

1. 单 PR ~30 行 .ts diff
2. 1 个 e2e 测试：plugin register → postEvent opencode.event → 路由命中不再 WARN
3. 完整 bugfix.md / design.md / tasks.md 规格链

## 约束

- **低成本优先**，串行执行，禁止并行 fan-out
- 进入 development 阶段写代码前**必须用户明确同意**
- 改动限于 `packages/daemon-core/src/http/HTTPServer.ts` 和 `packages/daemon-core/src/session/SessionRegistry.ts`

## 环境

- Runtime: Bun + Node.js
- 语言: TypeScript（strict mode）
- 包结构: monorepo（`packages/*`）
- 相关包: `packages/daemon-core/`

## 回滚条件（来自 05-recommendation.md §5.5 Phase 0）

若新 alias 命中逻辑导致 SessionRegistry 出现错误绑定（如同一 OpenCode sessionID 关联多个 daemon sessionId），直接 revert PR。不影响 events.jsonl / state.json schema。
