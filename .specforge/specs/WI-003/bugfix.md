---
bugfix_format: structured
work_item: WI-003
related_investigation: WI-002
symptom_target: 症状 1（事件路由断链）
---

# WI-003 Bugfix — Phase 0 热修：OpenCode 事件路由断链

## 1. 当前行为

### 1.1 症状表现

SpecForge daemon 日志持续输出以下警告：

```
[SessionRegistry] No session binding found for OpenCode event subtype: unknown, projectPath: undefined
```

该警告出现在 OpenCode plugin 已成功完成 `register`（daemon 已颁发 `sessionId`）之后，plugin 后续通过 `postEvent` 发送 `type: 'opencode.event'` 事件时。SessionRegistry 的 4 步映射逻辑全部 miss 后落入兜底 WARN（`SessionRegistry.ts` L548）。

### 1.2 精确代码路径（引用 WI-002 调查证据链）

完整的事件传递路径如下（引用 `02-symptom-chains.md` Hop 1–7）：

| 跳点 | 位置 | 事实 |
|------|------|------|
| Hop 1 | `reconnecting-daemon-client.ts` L407–L437 | Plugin 调用 `register(projectPath)` POST 到 `/api/v1/ingest/register` |
| Hop 2 | `HTTPServer.ts` L913–L938 | `handleIngestRegister` 调用 `sessionRegistry.registerPluginSession(projectId, projectPath)` 颁发 `identity.sessionId`，并写入 `projectBindings.set(identity.sessionId, projectPath)`（`SessionRegistry.ts` L179） |
| Hop 3 | `reconnecting-daemon-client.ts` L82–L104 | Plugin 调用 `postEventToDaemon`，body 格式为 `{ sessionId, type, data, ts }`——**sessionId 仅在 HTTP body 顶层**，不复制到 `data` 内部 |
| Hop 4 | `HTTPServer.ts` L949–L1003 | `handleIngestEvent` 解码 body 为 `{ sessionId?, type?, data?, ts? }` |
| Hop 5 | `HTTPServer.ts` L1010–L1043 | `routeIngestEvent` 取出 `request.sessionId`（L1013），调用 `handleOpenCodeEvent(sessionId, data, ts)`（L1026） |
| **Hop 6（断链点）** | `HTTPServer.ts` L1130–L1148 | **`handleOpenCodeEvent(sessionId, data, _ts)` 收到 `sessionId` 但完全丢弃**——仅将 `payload`（= `data`）转发给 `SessionRegistry`，`sessionId` 仅在 catch 块日志中使用（L1146），**不进入 SessionRegistry 调用参数** |
| Hop 7 | `SessionRegistry.ts` L513–567 | `handleOpenCodeEvent` 的 4 步映射全部 miss（详见 1.3） |

### 1.3 SessionRegistry 4 步映射必然 miss 的原因

`SessionRegistry.handleOpenCodeEvent(subType, data)` 从 `data` 内部寻找 session 标识，但 `data` 不包含 daemon 颁发的 `sessionId`：

- **Step 1（L519–L523）**：检查 `data.sessionId`（小写）→ plugin 不把顶层 sessionId 复制进 data → **永远 undefined → miss**
- **Step 2（L526–L529）**：检查 `data.sessionID`（大写，OpenCode 原生 ID）→ `projectBindings` 的 key 是 daemon 颁发的 sessionId（`SessionRegistry.ts` L179），不是 OpenCode 自带 sessionID → **key 不匹配 → miss**
- **Step 3（L532–L539）**：遍历 `projectBindings` 按 `projectPath` 查找 → OpenCode 原生 event 不一定带 `projectPath` 字段 → **大概率 miss**
- **Step 4（L542–L551）**：兜底逻辑 → 仅处理 `subType === 'session.created'` 且有 `projectPath` 的场景；其余全部输出 L548 WARN → **所有非 session.created 事件路由失败**

### 1.4 日志中 `subtype: unknown, projectPath: undefined` 的来源

- `subType` 字段缺失时，`HTTPServer.ts` L1138 将其 fallback 为 `'unknown'`
- `projectPath` 字段缺失时，模板字符串 `${projectPath}` 直接拼接为字面值 `"undefined"`

两个字段共同还原了观察到的日志输出。

---

## 2. 预期行为

### 2.1 修复后的行为

1. **HTTPServer.ts** `handleOpenCodeEvent` 将顶层 `sessionId` 合并进 payload，确保 daemon 颁发的 sessionId 传递给 SessionRegistry
2. **SessionRegistry.ts** `handleOpenCodeEvent` 的 Step 1 映射（`data.sessionId`）能直接命中 `projectBindings` 中 daemon 颁发的 key，成功路由事件
3. `[SessionRegistry] No session binding found for OpenCode event subtype: unknown, projectPath: undefined` 警告消失
4. 对于 `data.sessionID`（OpenCode 大写 sessionID），通过 alias 别名表映射到 daemon sessionId，提供第二条路由路径

### 2.2 修复后的数据流

```
Plugin postEvent → body: { sessionId: "daemon-uuid", type: "opencode.event", data: { subType, sessionID, ... } }
    ↓
HTTPServer.handleOpenCodeEvent("daemon-uuid", data, ts)
    ↓ 合并 sessionId 进 payload: { ...payload, sessionId: payload.sessionId ?? "daemon-uuid" }
SessionRegistry.handleOpenCodeEvent(subType, { subType, sessionID, ..., sessionId: "daemon-uuid" })
    ↓
Step 1: data.sessionId = "daemon-uuid" → projectBindings.has("daemon-uuid") → 命中 ✓
    ↓
路由成功 → 事件正常处理
```

### 2.3 可测量的验收标准

1. Plugin register → postEvent `opencode.event` → `[SessionRegistry] No session binding found` 日志 **不再出现**
2. 事件路由后 SessionRegistry 正确执行 `touch`/`terminate` 等后续操作（通过 `subType` 分发到 L553–L566 的 switch 分支）
3. 现有 `events.jsonl` 和 `state.json` schema 无变化
4. Plugin 端代码零改动，wire format 不变

---

## 3. 不变行为

以下行为在修复前后必须保持一致，任何改动如果影响这些行为则不可接受：

### 3.1 Plugin wire format 不变

- Plugin 调用 `register(projectPath)` 的请求格式不变
- Plugin 调用 `postEventToDaemon` 的 body 格式不变（`{ sessionId, type, data, ts }`，sessionId 仅在顶层）
- Plugin 不需要升级或修改任何代码

### 3.2 events.jsonl schema 不变

- 不引入新的 WAL event category（`session.*` 事件属于 Phase 2 范围）
- 现有 events.jsonl 文件的读写行为不受影响

### 3.3 state.json schema 不变

- state.json 的 `ProjectState` 结构（`workItems`、`lastEventId`、`lastEventTs`）不变
- 不新增 `sessions.json` 或其他持久化文件

### 3.4 其他 session 类型路由不受影响

- `tool.invoking` / `tool.invoked` / `session.compacting` / `chat.params` / `chat.headers` / `shell.env` 等事件类型的路由路径不变
- 这些事件类型有独立的 handler（`HTTPServer.ts` L1019–L1038），不经过 `handleOpenCodeEvent`

### 3.5 多客户端会聚点语义保留

- SessionRegistry 作为"多客户端会聚点"的角色不变
- `projectBindings: Map<sessionId, projectPath>` 的主键语义不变（daemon 颁发的 sessionId 仍为主键）
- Alias 表是新增的辅助查找结构，不改变主键语义

### 3.6 Daemon.ts 不动

- `Daemon.ts` L54 RecoverySubsystem 构造不修改（属于 Phase 1 范围）
- `Daemon.ts` 全局 StateManager 与 per-project StateManager 的关系不变

### 3.7 RecoverySubsystem 不动

- RecoverySubsystem 的 `checkAndRepair`、`rebuildFromEvents`、`repairInconsistency` 逻辑不变
- Property 20（一致性修复）和 Property 21（重连仅限启动期）不变

---

## 4. 根因分析

### 4.1 根因定位

**根因已由 WI-002 investigation 定位（引用 `02-symptom-chains.md` 症状 1 根因结论）。**

**断链点 = `HTTPServer.ts` L1130–L1148 `handleOpenCodeEvent` 方法**：

```ts
// HTTPServer.ts L1130-L1148
private async handleOpenCodeEvent(
  sessionId: string, data: unknown, _ts: number   // ← sessionId 参数收到了
): Promise<void> {
  const payload = (data ?? {}) as { subType?: string } & Record<string, unknown>;
  try {
    await this.withTimeout(
      (async () => {
        this.deps.sessionRegistry?.handleOpenCodeEvent?.(
          payload.subType ?? 'unknown',
          payload,                                  // ← 只传 payload(=data)，丢弃 sessionId
        );
      })(),
      2_000,
      undefined,
    );
  } catch (err) {
    console.warn(`[INGEST] SessionRegistry.handleOpenCodeEvent error for session ${sessionId}:`, err);
    // ↑ sessionId 仅在这里的 catch 日志中使用，不进入业务逻辑
  }
}
```

### 4.2 根因机制

HTTP 层 `routeIngestEvent`（L1013）正确提取了 `request.sessionId` 并作为第 1 个参数传递给 `handleOpenCodeEvent`。但 `handleOpenCodeEvent` 方法体**只把 `payload`（即 `data`）转发给 SessionRegistry**，`sessionId` 参数在整个函数体内仅出现在 catch 块的错误日志中。

这导致 SessionRegistry 的 `handleOpenCodeEvent` 收到的 `data` 中不包含 daemon 颁发的 `sessionId`，4 步映射全部 miss。

### 4.3 辅助原因（隐式契约违反）

引用 WI-002 调查结论（`02-symptom-chains.md` §症状 1 涉及的隐式契约违反）：

| 编号 | 隐式契约违反 | 说明 |
|------|------------|------|
| C4 | HTTPServer.handleOpenCodeEvent 丢弃 sessionId | 直接断链点 |
| C2 | SessionRegistry.handleOpenCodeEvent 假设 caller 提供 `data.sessionId` | SessionRegistry 依赖 `data.sessionId`（L520）但从未在接口契约中声明 caller 必须注入 |
| C9 | Plugin 永远在顶层放 sessionId，不复制到 data | Plugin 的设计是"顶层传 ID，data 不碰"，daemon 适配层未感知这一约定 |

### 4.4 为什么只修 Phase 0

| 范围 | 属于 | 不属于 Phase 0 的原因 |
|------|------|----------------------|
| HTTPServer.ts L1130–L1148（sessionId 合并进 payload） | Phase 0 ✓ | — |
| SessionRegistry.ts L513–L567（alias 表 + 映射增强） | Phase 0 ✓ | — |
| Daemon.ts RecoverySubsystem 依赖注入 | Phase 1 | 需要重构 StateManager 单例化，变更跨模块 |
| SessionRegistry WAL 化 | Phase 2 | 需要引入新 event category 和 schema 演进机制 |
| ProjectManager per-project StateManager 消除 | Phase 1 | 需要统一 StateManager 实例管理 |

---

## 5. 修复方案概述

### 5.1 改动 1：HTTPServer.ts L1130–L1148

将顶层 `sessionId` 合并进 payload，作为 `data.sessionId` 的兜底值：

```ts
// 修改前（L1137–L1140）：
this.deps.sessionRegistry?.handleOpenCodeEvent?.(
  payload.subType ?? 'unknown',
  payload,
);

// 修改后：
this.deps.sessionRegistry?.handleOpenCodeEvent?.(
  payload.subType ?? 'unknown',
  { ...payload, sessionId: payload.sessionId ?? sessionId },
);
```

**效果**：daemon 颁发的 sessionId 进入 payload，SessionRegistry Step 1（`data.sessionId`）直接命中 `projectBindings`。

### 5.2 改动 2：SessionRegistry.ts — alias 别名表

新增 in-memory alias 表：`Map<opencodeSessionID, daemonSessionId>`

- 在 `registerPluginSession` 返回后，若 payload 携带 OpenCode `sessionID`（大写），建立 alias 映射
- 在 `handleOpenCodeEvent` 的 Step 2 之后增加 alias 查找步骤：`data.sessionID` → alias 表 → daemon sessionId

**效果**：即使 Step 1 miss（如 payload 中有同名 `sessionId` 字段被 OpenCode 原生值覆盖），Step 2 通过 alias 表仍可路由。

### 5.3 不动的部分

- Daemon.ts（任何行）
- Plugin 端代码
- RecoverySubsystem
- events.jsonl / state.json schema
- 其他事件类型的 handler

---

## 6. 回滚条件

引用 `05-recommendation.md` §5.5 Phase 0：

> 若新 alias 命中逻辑导致 SessionRegistry 出现错误绑定（如同一 OpenCode sessionID 关联多个 daemon sessionId），直接 revert PR。不影响 events.jsonl / state.json schema。

---

## 7. 跨 WI 参考

- **WI-002**：Investigation 完成根因定位，本 bugfix 直接引用其调查结论
- **WI-033**：`ALL_STATES` 状态完备性和状态验证覆盖全部工作流——本修复不涉及状态机变更，但 alias 表的建立应确保不干扰现有工作流的状态流转路径
