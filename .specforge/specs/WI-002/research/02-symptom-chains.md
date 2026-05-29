# 02 — 双症状证据链（步骤 2，回答 Q1 之"症状-根因映射"）

> 每一跳引用源码行号。事实陈述，不下结论。

---

## 症状 1：`[SessionRegistry] No session binding found for OpenCode event subtype: unknown, projectPath: undefined`

**典型出现时机**：plugin 已成功 register、daemon 已颁发 sessionId，plugin 后续 postEvent type=`opencode.event` 时，SessionRegistry 在 4 步映射全部 miss 后落入 L548 兜底 WARN。

### 跳点链

#### Hop 1 — Plugin 端 register
**位置**：`packages/service-management/src/plugin/reconnecting-daemon-client.ts` L407-L437  
**事实**：plugin 调 `register(projectPath)` POST 到 `/api/v1/ingest/register`，body 是 `{ projectPath }`。

#### Hop 2 — Daemon 端 register 处理
**位置**：`packages/daemon-core/src/http/HTTPServer.ts` L913-L938 `handleIngestRegister`
- L928：`this.deps.projectManager.registerProject(request.projectPath)` → 拿到 ctx
- L929：`this.deps.sessionRegistry.registerPluginSession(ctx.projectId, request.projectPath)` → 拿到 identity
- L930-L934：响应 `{ sessionId: identity.sessionId, projectId: ctx.projectId, mode }`

**结果**：daemon 颁发的 `identity.sessionId` 被 plugin 持有；daemon 侧 SessionRegistry 的 `projectBindings.set(identity.sessionId, projectPath)`（SessionRegistry L179）已建立。

#### Hop 3 — Plugin 端 postEvent 发送 OpenCode 事件
**位置**：`packages/service-management/src/plugin/reconnecting-daemon-client.ts` L82-L104 `postEventToDaemon`
- L97：`body: JSON.stringify({ sessionId, type, data, ts: ts ?? Date.now() })`

**关键事实**：plugin **只在 HTTP body 顶层** 放 `sessionId`，**不把 sessionId 复制到 `data` 里**。`data` 是 OpenCode 原生 event 的 payload（含 OpenCode 自带的 `sessionID`、`subType` 等字段），plugin 不修改它。

#### Hop 4 — Daemon 端 ingest/event 入口
**位置**：`packages/daemon-core/src/http/HTTPServer.ts` L949-L1003 `handleIngestEvent`
- L952：解码 body → `request: { sessionId?, type?, data?, ts? }`
- L960-L962：若无 `request.sessionId` 只是 WARN，不拒绝
- L986：调 `this.routeIngestEvent(request)`

#### Hop 5 — 路由分发
**位置**：`packages/daemon-core/src/http/HTTPServer.ts` L1010-L1043 `routeIngestEvent`
- L1013：`const sessionId = request.sessionId ?? ''`  ← **顶层 sessionId 取出来了**
- L1015：`const data = request.data`
- L1025-L1027：`case 'opencode.event': await this.handleOpenCodeEvent(sessionId, data, ts)` ← **顶层 sessionId 作为第 1 个参数传下去**

#### Hop 6 — HTTPServer 适配层（症状 1 的精确代码位置）
**位置**：`packages/daemon-core/src/http/HTTPServer.ts` L1130-L1148 `private async handleOpenCodeEvent`
```ts
private async handleOpenCodeEvent(
  sessionId: string, data: unknown, _ts: number   // ← sessionId 收到了
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
  } catch (err) { ... }
}
```

**关键事实**：第 1 个参数 `sessionId` **在整个函数体内只被用于 catch 块的日志（L1146）**，**完全没有进入 SessionRegistry 的调用参数**。

#### Hop 7 — SessionRegistry 端尝试映射
**位置**：`packages/daemon-core/src/session/SessionRegistry.ts` L513-L551 `handleOpenCodeEvent`
- L514：`const projectPath = data.projectPath as string | undefined` — OpenCode 原生 payload 不一定带 projectPath
- L519-L523 (Step 1)：`const daemonSessionId = data.sessionId as string | undefined; if (daemonSessionId && this.projectBindings.has(daemonSessionId)) ...`  
  → **由于 plugin 没把 sessionId 复制进 data，`data.sessionId` 永远 undefined**。**Step 1 必 miss**。
- L526-L529 (Step 2)：`const opencodeSessionId = data.sessionID as string | undefined; if (!internalSessionId && opencodeSessionId && this.projectBindings.has(opencodeSessionId)) ...`  
  → OpenCode 原生 `sessionID` 大写，可能确实存在于 data 中；**但 `projectBindings` 的 key 是 daemon 颁发的 sessionId（L179），不是 OpenCode 自带 sessionID**。**Step 2 必 miss**。
- L532-L539 (Step 3)：`for (const [sid, pp] of this.projectBindings) { if (pp === projectPath) ... }`  
  → OpenCode 原生 event 不一定带 `projectPath`，且 `projectBindings` 里存的是 register 时的 `request.projectPath`，与 OpenCode 自己的 projectPath 可能形式不同（绝对路径 vs OpenCode 内部规范化）。**Step 3 大概率 miss**。
- L542-L551 (Step 4)：兜底 — 若 `subType === 'session.created'` 且有 projectPath，则 `registerPluginSession`（再注册一次）；否则 **L548 `console.warn(...) No session binding found for OpenCode event subtype: ${subType}, projectPath: ${projectPath}`**

**最终输出形态**：`subType` 字段缺失时 L1138 fallback 为 `'unknown'`、`projectPath` 字段缺失时 `${undefined}` 直接拼接为字面值 `"undefined"`。两个字段共同还原了 intake.md 中观察到的 log：
> `[SessionRegistry] No session binding found for OpenCode event subtype: unknown, projectPath: undefined`

### 症状 1 根因（事实陈述）

**断链点 = HTTPServer.ts L1130-L1148**：HTTP 顶层 `sessionId` 收到了但没有传给 SessionRegistry。

**辅助原因**：即使传下去了，SessionRegistry L520 读的字段名是 `data.sessionId`（小写 d），与 HTTP 顶层 `request.sessionId` 同名巧合，但**未在 contracts 中显式声明 caller 必须把顶层 sessionId 注入 data**——属于隐式契约（C2 隐式契约 (1)）的违反。

### 症状 1 涉及的隐式契约违反
- C4 隐式契约 (1)：HTTPServer.handleOpenCodeEvent 丢弃 sessionId
- C2 隐式契约 (1)：SessionRegistry.handleOpenCodeEvent 假设 caller 提供 `data.sessionId`
- C3 隐式契约 (1)+(2)：AgentIdentity 不存在 OpenCode 原生 sessionID 字段，daemon 颁发的 sessionId 是单方面的
- C9 隐式契约 (1)：Plugin 永远在顶层放 sessionId，不复制到 data

---

## 症状 2：`sf_state_read WI-001` 有值 vs `.specforge/runtime/state.json` 的 `workItems: []`

**典型出现时机**：daemon 重启后或 sf_state_transition 调用后，通过 sf_state_read 工具能查到 WI-001，但磁盘 state.json 显示 `workItems: []`。

### 跳点链

#### Hop 1 — 工具调用入口
**位置**：`packages/daemon-core/src/tools/handlers/sf-state-transition.ts` L5-L48
- L15-L28：fromState='' 时 guard：检查 `<baseDir>/.specforge/manifest.json`，缺失返回 `PROJECT_NOT_INITIALIZED`
- L35-L43：`await deps.workflowEngine.transitionFull({...})` ← 真正写入入口

#### Hop 2 — WorkflowEngine 调用 daemon 全局 StateManager
**位置**：`packages/daemon-core/src/daemon/Daemon.ts` L60-L74
```ts
this.workflowEngine = new WorkflowEngine({
  onTransition: async ({ workItemId, fromState, toState, workflowType, evidence, actor }) => {
    await this.stateManager.transition(             // ← 注意 this.stateManager 是哪一个
      workItemId, fromState, toState,
      typeof actor === 'string' ? actor : 'system',
      workflowType || 'feature_spec',
      evidence ? { evidence } : {},
    );
  },
});
```

**关键事实**：`this.stateManager` 是 Daemon.ts L53 创建的**全局** StateManager：
```ts
this.stateManager = new StateManager(pathResolver, runtimeDir);  // L53
```
其中 `runtimeDir` 来自 `this.config.getRuntimeDir()` —— 这是 **daemon 全局 runtime 目录**（典型为 `~/.specforge/runtime`，参 path-resolver L143-L145）。

#### Hop 3 — StateManager 的 statePath 推导
**位置**：`packages/daemon-core/src/state/StateManager.ts` L47-L52
```ts
constructor(pathResolver, projectPath) {
  this.projectPath = projectPath;              // ← projectPath = runtimeDir = "~/.specforge/runtime"
  this.wal = new WAL(pathResolver.resolveEventsPath(projectPath));
  this.statePath = pathResolver.resolveStatePath(projectPath);   // ← 关键
}
```

**Personal mode（path-resolver.ts L131-L132）**：
```ts
resolveStatePath(projectPath: string): string {
  return path.join(this.resolveProjectRuntimeDir(projectPath), 'state.json');
}
resolveProjectRuntimeDir(projectPath: string): string {       // L126-L129
  validateProjectPath(projectPath);
  return path.join(projectPath, '.specforge', 'runtime');
}
```

**计算结果（symbolic）**：当 `projectPath = "~/.specforge/runtime"` 时，  
`statePath = "~/.specforge/runtime/.specforge/runtime/state.json"`  ← **嵌套路径！**

**这意味着 daemon 全局 StateManager 写的 state.json 不是项目根目录下的 `.specforge/runtime/state.json`**，而是 `~/.specforge/runtime/.specforge/runtime/state.json`（或同等嵌套位置，取决于 `getRuntimeDir()` 的实际值）。

> **附注**：未直接读 `DaemonConfig.getRuntimeDir()` 源码，但 path-resolver L144 显示 `resolveDaemonRuntimeDir()` 返回 `path.join(os.homedir(), '.specforge', 'runtime')`。若 DaemonConfig 沿用相同语义，则 daemon 全局 stateManager 写到嵌套位置；即使语义不同，**只要不等于"项目根目录"，本断点的结论都成立**：daemon 全局 StateManager 写到的 statePath 与 `.specforge/runtime/state.json`（项目根目录下那个）不同。

#### Hop 4 — sf_state_read 工具的读取路径
**事实**：sf_state_read 返回 WI-001 数据，这表明 daemon **in-memory** 的 `workItemStates: Map` 里确实有 WI-001（来自 transition() → applyStateTransition L330）。**但这个 in-memory 状态属于 daemon 全局 StateManager**，flush 时写到嵌套 statePath，**不写到 `D:\code\temp\SpecForge\.specforge\runtime\state.json`**。

#### Hop 5 — 项目根目录 state.json 的真实写入者
**位置**：`packages/daemon-core/src/project/ProjectManager.ts` L49-L89 `registerProject`
- L63：`const stateManager = new StateManager(this.pathResolver, projectPath)` — projectPath 这次是真实业务路径（如 `D:\code\temp\SpecForge`）
- L64：`await stateManager.initialize()` — 触发 rebuildState + persistState
- L74-L88：把这个 stateManager 存到 ProjectContext.stateManager

**关键事实**：**只有 `D:\code\temp\SpecForge\.specforge\runtime\state.json` 这个文件才是项目根目录下的 state.json**，**但它不被 sf_state_transition / WorkflowEngine.onTransition 路径写入**（那条路径走的是 daemon 全局 stateManager）。这个 per-project stateManager 的写入路径目前只有：
- 初始化时 rebuildState + persistState（L73-L76 在 StateManager.initialize）
- 任何调用方拿到 `ProjectContext.stateManager` 后主动调 `.transition()` — **但代码中没找到这样的调用方**

#### Hop 6 — RecoverySubsystem 在启动期覆盖
**位置**：`packages/daemon-core/src/recovery/RecoverySubsystem.ts` 
- Daemon.ts L54 构造：`this.recoverySubsystem = new RecoverySubsystem(pathResolver, runtimeDir)` — **未注入 wal/stateManager**
- 启动时 Daemon.ts L136 调 `await this.recoverySubsystem.checkAndRepair()`
- RecoverySubsystem L82-L94 `checkAndRepair()` 分支：
  ```ts
  const events = this.wal ? await this.wal.readAllEvents() : await this.loadEvents();
  let rebuiltState: ProjectState;
  if (this.stateManager) {
    rebuiltState = await this.stateManager.rebuildState();
  } else {
    rebuiltState = await this.rebuildFromEvents(events);  // ← 走 fallback
  }
  ```
- L305-L323 fallback `rebuildFromEvents(events)`：**只取 `lastEventId / lastEventTs`，workItems 永远 `[]`**
- L137-L139：若 issue 非空（如 `state_mismatch`、`out_of_order`、`missing_event`）则调 `await this.repairInconsistency(result)`
- L228-L257 `repairInconsistency` L244-L250：
  ```ts
  if (this.stateManager) {
    repairedState = await this.stateManager.rebuildState();
  } else {
    repairedState = await this.rebuildFromEvents(events);  // ← 又是 fallback
  }
  await this.writeState(repairedState);                    // ← 写穿 workItems:[] 到 state.json
  ```

**关键事实**：RecoverySubsystem 的 `eventsPath / statePath` 来自构造时的 projectPath = `runtimeDir`（Daemon.ts L54），与 daemon 全局 stateManager 写的 statePath 是**同一嵌套路径**。它**不写到项目根目录的 state.json**——但它内部的 `loadState` / `writeState` 都用 `this.statePath`，因此**症状 2 在项目根目录的 state.json 上的表现可能不是 RecoverySubsystem 直接造成的**。

### 症状 2 根因（事实陈述）

**根因不是单一断点，而是三条裂缝叠加**：

1. **裂缝 A — 双 StateManager 并存**：
   - Daemon 全局 StateManager（projectPath=runtimeDir，写到嵌套 statePath）
   - ProjectManager 内部 per-project StateManager（projectPath=业务路径，写到 `D:\code\temp\SpecForge\.specforge\runtime\state.json`）
   - sf_state_transition 走的是前者；项目根目录的 state.json 由后者拥有但**没人写**

2. **裂缝 B — RecoverySubsystem 构造缺少 stateManager 注入**（Daemon.ts L54 vs RecoverySubsystem L52）：
   - 走 fallback `rebuildFromEvents`（L305）这条**永远返回 workItems:[]** 的退化路径
   - 然后 `writeState` 用空 workItems 覆盖 statePath
   - 这至少在嵌套 statePath 上把 workItems 抹平

3. **裂缝 C — 项目根目录 state.json 是 per-project StateManager 的"幽灵文件"**：
   - 在 ProjectManager.registerProject 调用时 stateManager.initialize() L73-L76 会 rebuildState + persistState
   - rebuildState 读项目根 events.jsonl —— 实证素材：`.specforge/runtime/events.jsonl` size = 0
   - 空 events → rebuildState 返回空 workItems → persistState 写空 state.json
   - **这就是 `D:\code\temp\SpecForge\.specforge\runtime\state.json` 显示 `workItems: []` 的实际机理**

**与 intake.md 描述对照**：intake 说"daemon 内存权威态 vs 磁盘持久态裂缝"。实证显示的是更微妙的"**两套权威态 + 一套幽灵磁盘态**"：
- daemon 全局 in-memory 状态（含 WI-001）→ sf_state_read 见
- 嵌套 statePath 上的 state.json（被 RecoverySubsystem 在启动期覆盖为空）→ 用户不直接看
- 项目根目录 state.json（被 per-project StateManager 初始化写空）→ **用户实际看到的 workItems:[]**

### 症状 2 涉及的隐式契约违反
- C1 隐式契约 (2)：Daemon 把 runtimeDir 当 projectPath 传入 StateManager
- C1 隐式契约 (3)：Daemon 构造 RecoverySubsystem 时不注入 wal/stateManager
- C5 隐式契约 (1)：ProjectManager 创建独立 StateManager 实例
- C6 隐式契约 (1)：RecoverySubsystem 在 stateManager 缺失时走零化 fallback
- C6 隐式契约 (2)：RecoverySubsystem 把零化结果 writeState 覆盖磁盘
- C8 隐式契约 (4)：StateManager 同 statePath 无并发保护，依赖路径不冲突的约定
- C10 隐式契约 (1)：PathResolver 不防御嵌套 projectPath

### 关于"flush 时机"
StateManager.transition 走 WAL-first 完整路径（L137-L161）：
1. WAL append + fsync（L154 `await this.wal.appendEvent(event)`）
2. apply to in-memory（L157）
3. persistState 写 state.json + fsync（L160）

**flush 触发条件 = 每次 transition() 调用，且强 fsync，不存在 batch 延迟**。这说明症状 2 **不是 flush 没触发**，而是触发了但**写到了错的文件**。
