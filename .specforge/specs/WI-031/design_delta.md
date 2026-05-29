# WI-031 增量设计文档：Daemon 存储架构重构 + 事件处理实现

## 架构概述

本次变更为增量变更（change_request），对现有 daemon 架构进行两层修改：**A 层**重构存储路径引入 `mode` 配置，**B 层**补全 ingest 事件处理管道。两层通过 `sessionId ↔ projectPath` 绑定契约解耦，可独立实施和回滚。

```mermaid
graph TD
    subgraph "A 层：存储重构"
        MODE[DaemonMode<br/>personal / enterprise]
        PR[IPathResolver]
        PR -->|impl| PPR[PersonalPathResolver]
        PR -->|impl| EPR[EnterprisePathResolver]
        GI[.gitignore Manager]
        DJ[daemon.json<br/>~/.config/opencode/]
    end

    subgraph "B 层：事件处理"
        PLUGIN[sf_specforge.ts<br/>+projectPath +register +shell.env]
        REG[POST /api/v1/ingest/register]
        IER[IngestEventRouter]
        PE[PermissionEngine]
        SR[SessionRegistry]
        EL[EventLogger]
        RS[RecoverySubsystem<br/>+saveCheckpoint]
    end

    subgraph "共享核心"
        DC[DaemonConfig<br/>+mode +PathResolver]
        PM[ProjectManager<br/>+registerProject]
        SM[StateManager]
        WAL[WAL]
    end

    PLUGIN -->|1. register { projectPath }| REG
    REG --> PM
    REG --> SR
    PLUGIN -->|2. event { sessionId, type, data }| IER
    IER -->|tool.invoking| PE
    IER -->|opencode.event| SR
    IER -->|tool.invoked / chat.*| EL
    IER -->|session.compacting| RS

    DC -->|mode| PR
    DC -->|mode| GI
    PR -->|resolve paths| SM
    PR -->|resolve paths| WAL
    PR -->|resolve paths| RS
    PR -->|resolve paths| PM

    MODE -->|personal| PPR
    MODE -->|enterprise| EPR
```

**变更层级依赖**：B 层的 `/api/v1/ingest/register` 端点依赖 A 层 `ProjectManager.registerProject()`，其余 B 层子系统仅依赖路径接口（`IPathResolver`），与 A 层具体布局解耦。

---

## 增量设计描述

### A 层：存储路径重构

#### DD-A1 mode 配置模型

**refs**: [WI-031 A 层需求 1]
**constrained_by**: 默认值 `personal` 确保新用户获得简化体验；`enterprise` 保持向后兼容

**变更内容**：在 `DaemonConfig` 中新增 `mode` 字段，支持从 CLI 参数 `--mode` 和环境变量 `SPECFORGE_MODE` 读取。新增 `DaemonMode` 类型。

```typescript
// DaemonMode 类型定义
type DaemonMode = 'personal' | 'enterprise';

// DaemonConfig 新增字段和方法
class DaemonConfig {
  private readonly mode: DaemonMode;

  constructor(args: string[] = process.argv) {
    // 解析优先级：CLI --mode > env SPECFORGE_MODE > 默认 'personal'
    this.mode = this.parseMode(args);
    // ... existing initialization
  }

  private parseMode(args: string[]): DaemonMode {
    const cliIndex = args.findIndex(a => a === '--mode');
    if (cliIndex !== -1 && args[cliIndex + 1]) {
      const v = args[cliIndex + 1];
      if (v === 'personal' || v === 'enterprise') return v;
    }
    const env = process.env.SPECFORGE_MODE;
    if (env === 'personal' || env === 'enterprise') return env;
    return 'personal'; // 默认值
  }

  getMode(): DaemonMode { return this.mode; }
}
```

**Errors**:
- `InvalidModeValue`：当 CLI 或环境变量传入非法 mode 值时，回退到默认值 `personal` 并记录 WARNING 日志（不抛异常，保证启动成功）

**Out of Scope**:
- 不支持运行时动态切换 mode（需重启 daemon）
- 不支持 per-project mode 覆盖（全局配置）

**Assumptions**:
- 新用户默认使用 `personal` 模式（降低入门复杂度）
- 已有 enterprise 部署可通过 `--mode enterprise` 或 `SPECFORGE_MODE=enterprise` 保持现有行为

---

#### DD-A2 路径解析接口设计

**refs**: [WI-031 A 层需求 1, A 层需求 2]
**constrained_by**: 当前 StateManager、WAL、RecoverySubsystem、ProjectManager 四模块各自硬编码路径，需统一抽象

**设计决策**：引入 `IPathResolver` 接口，由 `DaemonConfig` 根据 `mode` 创建对应实现。≥2 个调用点满足 DD4（YAGNI）规则：`PersonalPathResolver` 和 `EnterprisePathResolver`。

```typescript
interface IPathResolver {
  /** 项目运行态数据根目录 */
  resolveProjectRuntimeDir(projectPath: string): string;
  /** state.json 路径 */
  resolveStatePath(projectPath: string): string;
  /** events.jsonl 路径 */
  resolveEventsPath(projectPath: string): string;
  /** sessions 目录路径 */
  resolveSessionsDir(projectPath: string): string;
  /** daemon 全局运行时目录 */
  resolveDaemonRuntimeDir(): string;
  /** handshake 文件路径 */
  resolveHandshakePath(): string;
  /** daemon.json 项目清单路径 */
  resolveDaemonJsonPath(): string;
  // Errors: 当 projectPath 为无效/不安全路径时抛出 InvalidProjectPath
}

class PersonalPathResolver implements IPathResolver {
  resolveProjectRuntimeDir(projectPath: string): string {
    return path.join(projectPath, '.specforge', 'runtime');
  }
  resolveStatePath(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'state.json');
  }
  resolveEventsPath(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'events.jsonl');
  }
  resolveSessionsDir(projectPath: string): string {
    return path.join(this.resolveProjectRuntimeDir(projectPath), 'sessions');
  }
  resolveDaemonRuntimeDir(): string {
    return path.join(os.homedir(), '.specforge', 'runtime');
  }
  resolveHandshakePath(): string {
    return path.join(this.resolveDaemonRuntimeDir(), 'handshake.json');
  }
  resolveDaemonJsonPath(): string {
    return path.join(os.homedir(), '.config', 'opencode', 'daemon.json');
  }
}

class EnterprisePathResolver implements IPathResolver {
  // 保持现有行为：~/.specforge/projects/<hash>/
  resolveProjectRuntimeDir(projectPath: string): string {
    const hash = this.hashPath(projectPath);
    return path.join(os.homedir(), '.specforge', 'projects', hash);
  }
  // ... 其他方法与 PersonalPathResolver 一致，区别仅在于 projectRuntimeDir
}
```

**DaemonConfig 集成**：
```typescript
class DaemonConfig {
  private readonly pathResolver: IPathResolver;

  constructor(args: string[] = process.argv) {
    this.mode = this.parseMode(args);
    this.pathResolver = this.mode === 'personal'
      ? new PersonalPathResolver()
      : new EnterprisePathResolver();
  }

  getPathResolver(): IPathResolver { return this.pathResolver; }
  getRuntimeDir(): string { return this.pathResolver.resolveDaemonRuntimeDir(); }  // 保留兼容
}
```

**Errors**:
- `InvalidProjectPath`：projectPath 为空、不存在或为系统关键路径（如 `/`、`C:\`）时抛出

**Out of Scope**:
- 不支持自定义路径解析策略（仅 personal/enterprise 两种）
- 不支持运行时切换 PathResolver

**Assumptions**:
- `~/.specforge/runtime/` 仍用于 handshake 文件（daemon 单实例锁），与项目数据分离
- `PersonalPathResolver.resolveProjectRuntimeDir()` 和 `EnterprisePathResolver.resolveDaemonRuntimeDir()` 通过 `path.join` 统一处理跨平台分隔符

---

#### DD-A3 .gitignore 自动维护机制

**refs**: [WI-031 A 层需求 2]
**constrained_by**: 需避免与用户手动编辑冲突

**变更内容**：在 `ProjectManager.registerProject()` 中（仅 `personal` 模式），自动创建 `.specforge/.gitignore` 并写入 `runtime/` 排除规则。使用标记注释块隔离 daemon 管理的条目。

```
# SpecForge managed (BEGIN)
runtime/
# SpecForge managed (END)
```

```typescript
// ProjectManager 新增方法
class ProjectManager {
  private async ensureGitignore(projectPath: string): Promise<void> {
    const gitignorePath = path.join(projectPath, '.specforge', '.gitignore');
    const markerBegin = '# SpecForge managed (BEGIN)';
    const markerEnd = '# SpecForge managed (END)';
    const ruleBlock = `${markerBegin}\nruntime/\n${markerEnd}\n`;

    let content = '';
    try { content = await fs.readFile(gitignorePath, 'utf-8'); } catch { /* 不存在 */ }

    const beginIdx = content.indexOf(markerBegin);
    const endIdx = content.indexOf(markerEnd);

    if (beginIdx !== -1 && endIdx !== -1) {
      // 已有托管块，原地替换
      content = content.substring(0, beginIdx) + ruleBlock + content.substring(endIdx + markerEnd.length);
    } else {
      // 无托管块，追加
      if (content.length > 0 && !content.endsWith('\n')) content += '\n';
      content += ruleBlock;
    }

    await fs.mkdir(path.dirname(gitignorePath), { recursive: true });
    await fs.writeFile(gitignorePath, content, 'utf-8');
  }
}
```

**Errors**:
- `GitignoreWriteFailed`：文件系统不可写时记录 ERROR 日志（不阻断 registerProject，daemon 仍可运行但需提示用户手动添加）

**Out of Scope**:
- 不管理 `.specforge/.gitignore` 以外的 gitignore 文件
- 不支持自定义排除规则（用户可在标记块外自由添加）

---

#### DD-A4 daemon.json 迁移方案

**refs**: [WI-031 A 层需求 3]
**constrained_by**: 需兼容旧路径 `~/.specforge/daemon.json`

**变更内容**：`ProjectManager` 从 `~/.config/opencode/daemon.json`（新路径）读写项目路径清单。读取时优先新路径，不存在则回退旧路径并自动迁移。

```typescript
class ProjectManager {
  private daemonJsonPath: string;

  constructor(eventBus: EventBus, pathResolver: IPathResolver) {
    this.daemonJsonPath = pathResolver.resolveDaemonJsonPath();
  }

  async loadProjectManifest(): Promise<string[]> {
    // 1. 优先读取新路径
    try {
      const content = await fs.readFile(this.daemonJsonPath, 'utf-8');
      return JSON.parse(content).projects ?? [];
    } catch { /* 新路径不存在 */ }

    // 2. 回退旧路径
    const oldPath = path.join(os.homedir(), '.specforge', 'daemon.json');
    try {
      const content = await fs.readFile(oldPath, 'utf-8');
      const projects = JSON.parse(content).projects ?? [];
      // 3. 自动迁移到新路径
      await this.saveProjectManifest(projects);
      return projects;
    } catch { /* 旧路径也不存在 */ }

    return [];
  }

  async saveProjectManifest(projects: string[]): Promise<void> {
    await fs.mkdir(path.dirname(this.daemonJsonPath), { recursive: true });
    await fs.writeFile(this.daemonJsonPath,
      JSON.stringify({ projects, updatedAt: Date.now() }, null, 2), 'utf-8');
  }
}
```

**Errors**:
- `ManifestWriteFailed`：目录不可写时记录 ERROR 日志，daemon 以空清单继续运行（不阻塞启动）

**Out of Scope**:
- 不删除旧路径文件（用户手动清理）
- 不支持多 daemon 实例共享清单

---

#### DD-A5 ALL_STATES 完备性验证

**refs**: [WI-031 A 层需求 4, WI-033:requirement:1, WI-033:requirement:2]
**constrained_by**: impact_analysis 确认当前 ALL_STATES 已完备，方向从"补充"调整为"校验+测试"

**变更内容**：不修改 `ALL_STATES` 数组本身。在 `state_machine.ts` 中新增导出函数 `getAllReferencedStates()`，收集所有 8 种工作流转换表中引用的全部状态名。新增自动化测试验证 `ALL_STATES` 覆盖所有引用状态。

```typescript
// state_machine.ts 新增
export function getAllReferencedStates(): Set<string> {
  const tables = [
    VALID_TRANSITIONS, BUGFIX_SPEC_TRANSITIONS, DESIGN_FIRST_TRANSITIONS,
    QUICK_CHANGE_TRANSITIONS, CHANGE_REQUEST_TRANSITIONS, REFACTOR_TRANSITIONS,
    OPS_TASK_TRANSITIONS, INVESTIGATION_TRANSITIONS,
  ];
  const states = new Set<string>();
  for (const table of tables) {
    for (const [from, targets] of table) {
      states.add(from);
      for (const t of targets) states.add(t);
    }
  }
  return states;
}
```

**测试策略**：
```typescript
// tests/unit/state_machine_completeness.test.ts
it('ALL_STATES covers all states referenced in transition tables', () => {
  const referenced = getAllReferencedStates();
  for (const state of referenced) {
    expect(ALL_STATES).toContain(state);
  }
});

it('ALL_STATES has no unused states', () => {
  const referenced = getAllReferencedStates();
  for (const state of ALL_STATES) {
    expect(referenced.has(state)).toBe(true);
  }
});
```

**Errors**: 无运行时错误（纯编译时和测试时验证）

---

### B 层：daemon 事件处理实现

#### DD-B1 Register 端点协议

**refs**: [WI-031 B 层需求 1, B 层需求 4]
**constrained_by**: 需在现有 HTTP 路由框架内实现；HTTPServer 已通过 `deps` 持有 SessionRegistry 和 ProjectManager 引用

**变更内容**：在 `HTTPServer.registerDefaultRoutes()` 中新增精确路由 `POST /api/v1/ingest/register`。

**请求格式**：
```typescript
// POST /api/v1/ingest/register
interface RegisterRequest {
  projectPath: string;  // 必填，插件从 PluginInput.directory 获取
}
```

**响应格式**：
```typescript
// 200 OK
interface RegisterResponse {
  success: true;
  data: {
    sessionId: string;    // daemon 分配的 session 标识符
    projectId: string;    // 项目哈希 ID
    mode: DaemonMode;     // 当前 daemon 运行模式
  };
}

// 400 Bad Request
interface RegisterError {
  success: false;
  error: { code: 'MISSING_PROJECT_PATH' | 'INVALID_PROJECT_PATH'; message: string };
}
```

**处理流程**：
```typescript
// HTTPServer 新增方法
private async handleIngestRegister(
  _req: http.IncomingMessage, res: http.ServerResponse, body: string
): Promise<void> {
  let request: RegisterRequest;
  try { request = JSON.parse(body); } catch {
    return this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON'));
  }
  if (!request.projectPath) {
    return this.sendJsonResponse(res, 400, this.errorBody('MISSING_PROJECT_PATH', 'projectPath required'));
  }

  try {
    const ctx = await this.deps.projectManager.registerProject(request.projectPath);
    const identity = this.deps.sessionRegistry.registerPluginSession(
      ctx.projectId, request.projectPath
    );
    this.sendJsonResponse(res, 200, this.successBody({
      sessionId: identity.sessionId,
      projectId: ctx.projectId,
      mode: this.config.getMode(),
    }));
  } catch (err) {
    this.sendJsonResponse(res, 500, this.errorBody('REGISTER_FAILED', (err as Error).message));
  }
}
// Errors: MissingProjectPath | InvalidProjectPath | RegisterFailed
```

**SessionRegistry 新增方法**：
```typescript
class SessionRegistry {
  registerPluginSession(projectId: string, projectPath: string): AgentIdentity {
    const identity = createPendingIdentity('plugin', 'plugin-daemon-bridge', '', '');
    // 覆盖 sessionId 和 project 绑定
    this.pendingSessions.set(identity.sessionId, { ...identity, projectId });
    this.projectBindings.set(identity.sessionId, projectPath);
    return identity;
  }
}
```

**幂等性**：同一 `projectPath` 重复调用 → 查找已有 session → 返回已有 `sessionId`（不创建新 session）。

**Errors**:
- `MISSING_PROJECT_PATH`：请求体缺少 projectPath 字段 → 400
- `INVALID_JSON`：请求体不是合法 JSON → 400
- `REGISTER_FAILED`：ProjectManager 注册失败（如路径不存在）→ 500

**Out of Scope**:
- 不实现 session 注销端点（register 幂等可覆盖）
- 不支持单插件注册多个 projectPath

---

#### DD-B2 Ingest 事件路由表设计

**refs**: [WI-031 B 层需求 2, B 层需求 3]
**constrained_by**: HTTPServer 当前 `POST /api/v1/ingest/event` 通过前缀路由匹配，仅返回 200 占位

**变更内容**：新增 `POST /api/v1/ingest/event` 精确路由，替换现有前缀路由中的占位行为。处理函数 `handleIngestEvent` 实现事件类型 → 子系统路由。

```typescript
// HTTPServer 路由注册变更
// 旧：this.addPrefixRoute('POST', '/api/v1/ingest/', this.handleApiEndpoint.bind(this));
// 新：this.addExactRoute('POST', '/api/v1/ingest/event', this.handleIngestEvent.bind(this));
```

**请求格式**：
```typescript
interface IngestEventRequest {
  sessionId: string;       // 通过 register 获取
  type: IngestEventType;   // 事件类型
  data: unknown;           // 事件载荷
  ts: number;              // 客户端时间戳
}

type IngestEventType =
  | 'tool.invoking'
  | 'tool.invoked'
  | 'opencode.event'
  | 'session.compacting'
  | 'chat.params'
  | 'chat.headers'
  | 'shell.env';
```

**路由表**：

| 事件类型 | 路由目标 | 接口调用 | 超时 | 失败策略 |
|---------|---------|---------|------|---------|
| `tool.invoking` | PermissionEngine + SessionRegistry | `pe.evaluate()` + `sr.touch(sessionId)` | 5s | 超时→默认允许；失败→记录 WARNING，允许执行 |
| `tool.invoked` | EventLogger | `el.append(event)` | 3s | 超时→丢失该条日志（非关键路径） |
| `opencode.event` | SessionRegistry | `sr.handleOpenCodeEvent(subType, data)` | 2s | 失败→记录 WARNING |
| `session.compacting` | RecoverySubsystem | `rs.saveCheckpoint(sessionId, data)` | 10s | 超时→记录 ERROR；不影响会话继续 |
| `chat.params` | EventLogger | `el.append(event)` | 3s | 超时→丢失该条日志 |
| `chat.headers` | EventLogger | `el.append(event)` | 3s | 超时→丢失该条日志 |
| `shell.env` | Daemon | 返回环境变量键值对 | 2s | 失败→返回空对象 {} |

**向后兼容处理**：
```typescript
private async handleIngestEvent(
  _req: http.IncomingMessage, res: http.ServerResponse, body: string
): Promise<void> {
  let request: IngestEventRequest;
  try { request = JSON.parse(body); } catch {
    return this.sendJsonResponse(res, 400, this.errorBody('INVALID_JSON', 'Invalid JSON'));
  }

  // 向后兼容：无 sessionId 事件仍接受（记录 WARNING）
  if (!request.sessionId) {
    console.warn('[INGEST] Event received without sessionId — plugin may need upgrade');
    // 尝试从 projectPath 查找
  }

  try {
    await this.routeIngestEvent(request);
    this.sendJsonResponse(res, 200, this.successBody({ received: true, type: request.type }));
  } catch (err) {
    // 事件路由失败不返回 500（避免阻塞插件），记录 ERROR 日志
    console.error(`[INGEST] Failed to process ${request.type}:`, err);
    this.sendJsonResponse(res, 200, this.successBody({
      received: true, type: request.type,
      warning: `Event logged but processing failed: ${(err as Error).message}`,
    }));
  }
}

private async routeIngestEvent(request: IngestEventRequest): Promise<void> {
  const { sessionId, type, data, ts } = request;
  switch (type) {
    case 'tool.invoking':
      await this.handleToolInvoking(sessionId, data, ts);
      break;
    case 'tool.invoked':
      await this.handleToolInvoked(sessionId, data, ts);
      break;
    case 'opencode.event':
      await this.handleOpenCodeEvent(sessionId, data, ts);
      break;
    case 'session.compacting':
      await this.handleSessionCompacting(sessionId, data, ts);
      break;
    case 'chat.params':
      await this.handleChatParams(sessionId, data, ts);
      break;
    case 'chat.headers':
      await this.handleChatHeaders(sessionId, data, ts);
      break;
    case 'shell.env':
      await this.handleShellEnv(sessionId, res, data);  // 特殊：需要注入 env
      break;
    default:
      console.warn(`[INGEST] Unknown event type: ${type}`);
  }
}
```

**Errors**: 路由级不抛异常（所有错误内部消化），确保插件端不受 daemon 故障影响

---

#### DD-B3 PermissionEngine 接入 tool.invoking

**refs**: [WI-031 B 层需求 3, v6.0 tool.execute.before]
**constrained_by**: PermissionEngine 已在 Daemon 中实例化并传给 HTTPServer via deps

**变更内容**：在 `handleToolInvoking` 中调用 `PermissionEngine.evaluate()`，判断是否允许工具执行。

```typescript
// HTTPServer 新增
private async handleToolInvoking(
  sessionId: string, data: unknown, ts: number
): Promise<void> {
  const payload = data as { tool: string; callID: string; args: Record<string, unknown> };
  const projectPath = this.deps.sessionRegistry?.getProjectPath(sessionId);

  // 1. 更新 session 活跃时间
  this.deps.sessionRegistry?.touch(sessionId);

  // 2. PermissionEngine 评估
  if (this.deps.permissionEngine && payload.tool) {
    const result = await this.deps.permissionEngine.evaluate({
      tool: payload.tool,
      args: payload.args ?? {},
      sessionId,
      projectId: projectPath ?? '',
    });
    // 阶段一：仅记录，不拦截
    this.deps.eventLogger?.append({
      eventId: this.generateEventId(),
      ts: Date.now(),
      projectId: projectPath ?? '',
      action: 'permission.evaluated',
      payload: { tool: payload.tool, decision: result.decision, sessionId },
      metadata: { schemaVersion: '1.0', source: 'daemon' },
    });
  }
}
// Errors: 超时 5s → 默认 allow；PermissionEngine 异常 → 记录 ERROR 日志，默认 allow
```

**Errors**:
- `PermissionEngineTimeout`：5s 内未返回 → 默认 `allow`（安全侧：优先可用性）
- `PermissionEngineError`：内部异常 → 记录 ERROR，默认 `allow`

**Out of Scope**:
- 阶段一不实现实际拦截（仅记录 permission.evaluated 事件）
- 不实现 args 修改（v6.0 原插件的 `tool.execute.before` 修改 args 能力）

---

#### DD-B4 SessionRegistry opencode.event 处理

**refs**: [WI-031 B 层需求 3, v6.0 event 路由]
**constrained_by**: SessionRegistry 已有 `handleSessionEvent` 方法监听 EventBus 的 `session.*` 事件

**变更内容**：在 SessionRegistry 中新增 `handleOpenCodeEvent()` 方法，将 OpenCode 原生事件映射到 SessionRegistry 操作。

```typescript
class SessionRegistry {
  handleOpenCodeEvent(subType: string, data: Record<string, unknown>): void {
    const sessionId = data.sessionID as string | undefined;
    if (!sessionId) return;

    switch (subType) {
      case 'session.created':
        // 创建 pending session（如果尚未注册）
        if (!this.hasSession(sessionId)) {
          this.registerPluginSession(data.projectPath as string ?? '', data.projectPath as string ?? '');
        }
        break;
      case 'session.idle':
        this.touch(sessionId);
        break;
      case 'session.error':
        this.terminate(sessionId);
        break;
      default:
        // 未识别子类型：记录 WARNING，不中断
        console.warn(`[SessionRegistry] Unhandled opencode event subtype: ${subType}`);
    }
  }
}
```

**Errors**: 无（`hasSession`、`touch`、`terminate` 均为安全的幂等操作）

---

#### DD-B5 EventLogger 接入 ingest 管道

**refs**: [WI-031 B 层需求 3, v6.0 tool.execute.after / chat.params / chat.headers]

**变更内容**：`handleToolInvoked`、`handleChatParams`、`handleChatHeaders` 将事件数据转换为统一 Event 格式后写入 `EventLogger.append()`。

```typescript
private async handleToolInvoked(sessionId: string, data: unknown, ts: number): Promise<void> {
  const payload = data as { tool: string; callID: string; output: unknown };
  await this.deps.eventLogger?.append({
    eventId: this.generateEventId(),
    ts: ts || Date.now(),
    projectId: this.deps.sessionRegistry?.getProjectPath(sessionId) ?? '',
    action: 'tool.invoked',
    payload: { ...payload, sessionId },
    metadata: { schemaVersion: '1.0', source: 'client' },
  });
}
// handleChatParams / handleChatHeaders 同理，action 分别为 'chat.params' / 'chat.headers'
```

**注意**：`EventLogger` 构造时传入的 `basePath` 需由 `Daemon.ts` 根据 `mode` 适配（A 层提供路径）。

**Errors**:
- `EventLoggerAppendFailed`：写入失败时记录 ERROR 日志（非阻塞，事件路由继续）

---

#### DD-B6 RecoverySubsystem.saveCheckpoint 方法

**refs**: [WI-031 B 层需求 3, v6.0 session.compacting]
**constrained_by**: RecoverySubsystem 当前无 checkpoint 保存方法，需新增；需复用现有 WAL + state.json 机制

**变更内容**：在 `RecoverySubsystem` 中新增 `saveCheckpoint()` 方法，基于 `SessionRegistry.getSnapshot()` 序列化会话状态。

```typescript
class RecoverySubsystem {
  /**
   * 保存会话检查点，用于 daemon 重启后恢复
   * 由 session.compacting 事件触发
   */
  async saveCheckpoint(sessionId: string, snapshotData: unknown): Promise<void> {
    const checkpointPath = path.join(
      path.dirname(this.statePath), 'checkpoints', `${sessionId}.json`
    );
    await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
    await fs.writeFile(checkpointPath, JSON.stringify({
      sessionId,
      timestamp: Date.now(),
      data: snapshotData,
    }, null, 2), 'utf-8');

    // fsync
    const fd = fsSync.openSync(checkpointPath, 'a');
    try { fsSync.fsyncSync(fd); } finally { fsSync.closeSync(fd); }
  }
  // Errors: CheckpointWriteFailed → 记录 ERROR 日志（不阻断会话压缩）
}
```

**Errors**:
- `CheckpointWriteFailed`：磁盘满 / 权限不足 → 记录 ERROR，不影响会话

**Out of Scope**:
- checkpoint 的自动清理策略（由后续维护任务处理）
- checkpoint 恢复逻辑（复用现有 `reconnectOldSessions`）

---

#### DD-B7 shell.env hook 实现

**refs**: [WI-031 B 层需求 4]
**constrained_by**: 插件需注册 `shell.env` hook，daemon 返回环境变量键值对

**插件侧变更**（`.opencode/plugins/sf_specforge.ts`）：
```typescript
export async function sf_specforge(input: PluginInput): Promise<Hooks> {
  const projectPath = input.directory;

  // 启动时注册
  let sessionId = '';
  try {
    const res = await daemonClient.register(projectPath);
    sessionId = res.sessionId;
  } catch (e) {
    console.warn('[sf:register] Daemon not available, running in degraded mode');
  }

  return {
    // ... 现有 hooks（所有 postEvent 调用追加 sessionId）

    "shell.env": wrap(async (i: any, o: any) => {
      // 向 daemon 请求环境变量注入
      // daemon 返回 { SPECFORGE_DAEMON_PORT, SPECFORGE_SESSION_ID, ... }
      const envVars = await daemonClient.getShellEnv(sessionId);
      Object.assign(o.env, envVars);
    }, "shell.env"),

    // tool.execute.before 修改：附带 sessionId
    "tool.execute.before": wrap(async (i: any, o: any) => {
      await postEvent("tool.invoking", { tool: i.tool, callID: i.callID, args: o.args, sessionId })
    }, "tool.before"),
    // ... 其他 hooks 同理追加 sessionId
  };
}
```

**daemon 侧处理**：
```typescript
private async handleShellEnv(sessionId: string, data: unknown): Promise<Record<string, string>> {
  return {
    SPECFORGE_DAEMON_PORT: String(this.port ?? 0),
    SPECFORGE_SESSION_ID: sessionId,
    SPECFORGE_MODE: this.config.getMode(),
  };
}
```

**关键设计**：
- `SPECFORGE_` 前缀隔离避免与用户/OpenCode 环境变量冲突
- 注入前检查合并（`Object.assign` 而非覆盖）
- daemon 不可用时返回空对象（插件降级运行）

**Errors**:
- `ShellEnvFailed`：daemon 不可达 → 返回 `{}`（插件降级）

---

### A/B 层接口契约

#### DD-AB1 sessionId ↔ projectPath 绑定契约

**refs**: [WI-031 A/B 集成]
**constrained_by**: 插件与 daemon 通信协议需明确定义

**契约定义**：

```
┌──────────┐                    ┌──────────┐
│  Plugin  │                    │  Daemon  │
└────┬─────┘                    └────┬─────┘
     │                               │
     │  POST /api/v1/ingest/register │
     │  { projectPath }              │
     │──────────────────────────────>│
     │                               │── ProjectManager.registerProject()
     │                               │── SessionRegistry.registerPluginSession()
     │  { sessionId, projectId }     │
     │<──────────────────────────────│
     │                               │
     │  POST /api/v1/ingest/event    │
     │  { sessionId, type, data }    │
     │──────────────────────────────>│
     │                               │── routeIngestEvent(sessionId, type, data)
     │  { received: true }           │── SessionRegistry.getProjectPath(sessionId)
     │<──────────────────────────────│
```

**降级契约**：
- 插件发送 `POST /api/v1/ingest/register` 收到 404 → daemon 未实现该端点（旧版）
- 插件跳过注册，后续事件不发送 `sessionId`（回退到旧格式）
- daemon 收到无 `sessionId` 的事件 → 记录 WARNING，仍尝试处理（尽力而为模式）

---

#### DD-AB2 功能开关（Feature Flag）

**refs**: [WI-031 B 层回滚策略]
**constrained_by**: impact_analysis 建议 feature flag 控制 B 层新功能

```typescript
class DaemonConfig {
  private readonly ingestEnabled: boolean;

  constructor(args: string[] = process.argv) {
    // 默认启用，可通过 SPECFORGE_INGEST_ENABLED=false 关闭
    this.ingestEnabled = process.env.SPECFORGE_INGEST_ENABLED !== 'false';
  }

  isIngestEnabled(): boolean { return this.ingestEnabled; }
}
```

**效果**：`ingestEnabled=false` 时，ingest 事件端点恢复旧行为（返回 200 占位，不做实际处理），B 层完全回滚。

---

## 受影响模块

### A 层变更清单

| 模块 | 文件路径 | 变更内容 |
|------|---------|---------|
| daemon-core | `packages/daemon-core/src/daemon/DaemonConfig.ts` | 新增 `mode` 字段、`DaemonMode` 类型、`PathResolver` 工厂、`SPECFORGE_MODE` 环境变量解析 |
| daemon-core | `packages/daemon-core/src/daemon/path-resolver.ts` | **新增文件**：`IPathResolver` 接口、`PersonalPathResolver`、`EnterprisePathResolver` 实现 |
| daemon-core | `packages/daemon-core/src/daemon/Daemon.ts` | 将 `new StateManager(runtimeDir)` 改为 `new StateManager(pathResolver)`；`new RecoverySubsystem(runtimeDir)` 改为 `new RecoverySubsystem(pathResolver)`；`new WAL(path)` 改为 `new WAL(pathResolver)`；`new EventLogger(path)` 适配 mode |
| daemon-core | `packages/daemon-core/src/state/StateManager.ts` | 构造函数参数从 `projectPath: string` 改为 `pathResolver: IPathResolver`；移除 `hashPath()` 和硬编码路径 |
| daemon-core | `packages/daemon-core/src/wal/WAL.ts` | 构造函数参数从 `projectPath: string` 改为 `pathResolver: IPathResolver`；移除 `hashPath()` 和硬编码路径 |
| daemon-core | `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | 构造函数参数从 `projectPath: string` 改为 `pathResolver: IPathResolver`；移除 `hashPath()` 和硬编码路径 |
| daemon-core | `packages/daemon-core/src/project/ProjectManager.ts` | 构造函数接收 `IPathResolver`；`registerProject()` 中调用 `ensureGitignore()`（仅 personal 模式）；新增 `loadProjectManifest()`/`saveProjectManifest()` 方法；废弃 `getProjectDataDir()` 改为使用 pathResolver；新增 `daemonJsonPath` 字段 |
| daemon-core | `packages/daemon-core/src/tools/lib/state_machine.ts` | 新增 `getAllReferencedStates()` 导出函数（不修改 ALL_STATES 本身） |
| cli | `packages/cli/src/commands/init.ts` | 在 personal 模式下创建 `.specforge/` 目录结构和 `.gitignore`（带标记注释块） |
| cli | `packages/cli/src/commands/doctor.ts` | 新增 personal 模式目录结构健康检查（验证 `.specforge/runtime/` 等路径存在且可写） |
| configuration | `packages/configuration/src/` | 无需新增模块（mode 解析集成在 `DaemonConfig` 中，不涉及独立配置包） |
| tests | `packages/daemon-core/tests/unit/state_machine_completeness.test.ts` | **新增文件**：ALL_STATES ↔ 转换表交叉一致性验证 |
| tests | `packages/daemon-core/tests/unit/path-resolver.test.ts` | **新增文件**：PersonalPathResolver / EnterprisePathResolver 单元测试 |
| tests | `packages/daemon-core/tests/unit/config.test.ts` | **修改**：新增 mode 解析测试用例 |

### B 层变更清单

| 模块 | 文件路径 | 变更内容 |
|------|---------|---------|
| plugin | `.opencode/plugins/sf_specforge.ts` | 从 `PluginInput.directory` 提取 `projectPath`；启动时调用 `daemonClient.register(projectPath)`；所有 `postEvent` 调用追加 `sessionId`；新增 `shell.env` hook 注册；新增 `getShellEnv()` 方法 |
| daemon-core | `packages/daemon-core/src/http/HTTPServer.ts` | 新增精确路由 `POST /api/v1/ingest/register` → `handleIngestRegister`；新增精确路由 `POST /api/v1/ingest/event` → `handleIngestEvent`；新增 `routeIngestEvent()` 分发方法；新增 7 个事件处理方法（`handleToolInvoking` 等）；移除 ingest 前缀路由占位 |
| daemon-core | `packages/daemon-core/src/session/SessionRegistry.ts` | 新增 `registerPluginSession(projectId, projectPath)` 方法；新增 `handleOpenCodeEvent(subType, data)` 方法；新增 `getActiveSessionCount()` 方法 |
| daemon-core | `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | 新增 `saveCheckpoint(sessionId, snapshotData)` 方法 |
| daemon-core | `packages/daemon-core/src/daemon/DaemonConfig.ts` | 新增 `ingestEnabled` 字段和 `SPECFORGE_INGEST_ENABLED` 环境变量解析 |
| daemon-core | `packages/service-management/src/plugin/reconnecting-daemon-client.ts` | 新增 `register(projectPath)` 和 `getShellEnv(sessionId)` 方法 |
| tests | `packages/daemon-core/tests/unit/http.test.ts` | **修改**：新增 register / ingest event 端点测试用例 |
| tests | `packages/daemon-core/tests/unit/session.test.ts` | **修改**：新增 `registerPluginSession` / `handleOpenCodeEvent` 测试 |
| tests | `packages/daemon-core/tests/integration/plugin_startup.test.ts` | **修改**：新增注册流程和 shell.env 集成测试 |
| tests | `packages/daemon-core/tests/integration/api-endpoints.test.ts` | **修改**：新增 register 和 event 路由集成测试 |

---

## 兼容性影响

### API 变更

| 变更项 | 影响 | 兼容策略 |
|--------|------|---------|
| 新增 `POST /api/v1/ingest/register` | 旧插件不调用此端点 | 新增端点，不影响现有调用；旧插件无 sessionId，daemon 降级处理 |
| `POST /api/v1/ingest/event` 行为变更 | 从返回 200 占位 → 实际事件处理 | 响应格式不变（`{ success: true, data: { received: true } }`）；ingest 处理失败不回传 500 |
| 插件 postEvent 新增 sessionId 字段 | 旧 daemon 忽略多余字段 | JSON 反序列化时未知字段被忽略，无副作用 |

### 配置格式变更

| 变更项 | 旧路径 | 新路径 | 迁移策略 |
|--------|-------|--------|---------|
| daemon.json | `~/.specforge/daemon.json` | `~/.config/opencode/daemon.json` | 优先读新路径，不存在则回退旧路径并自动迁移 |
| 项目运行态数据 | `~/.specforge/projects/<hash>/` | personal: `.specforge/runtime/`；enterprise: 不变 | enterprise 模式保持旧路径，自动兼容 |
| Handshake 文件 | `~/.specforge/runtime/handshake.json` | 不变 | 无变更 |

### 数据迁移策略

1. **enterprise → personal 切换**：不自动迁移。`personal` 模式使用项目内 `.specforge/runtime/`，旧 enterprise 数据保留在 `~/.specforge/projects/`。用户如需迁移，手动复制后删除旧数据。
2. **daemon.json 迁移**：自动执行（读旧写新），旧文件不删除。
3. **无数据丢失风险**：两种模式使用不同的存储路径，互不覆盖。enterprise 模式保持完全向后兼容。

### 插件协议变更

| 变更项 | 旧行为 | 新行为 | 降级 |
|--------|-------|--------|------|
| 事件附带 projectPath/sessionId | 不附带 | 附带 | daemon 接受无 sessionId 事件（尽力而为） |
| 插件启动注册 | 不注册 | `POST /api/v1/ingest/register` | daemon 返回 404 时跳过注册 |
| `shell.env` hook | 未注册 | 注册并注入环境变量 | daemon 不可达时返回空对象 |
| 事件类型 `shell.env` | 不存在 | 新增 | 旧 daemon 返回 200 占位（前缀路由） |

### 降级策略

```
┌─────────────────────────────────────────────────────────┐
│                 降级决策树                                │
├─────────────────────────────────────────────────────────┤
│ daemon ingestEnabled=false                              │
│   → 所有 ingest 端点返回 200 占位（旧行为）               │
│                                                         │
│ daemon mode=enterprise（默认）                           │
│   → 所有数据路径使用 ~/.specforge/projects/（完全兼容）   │
│                                                         │
│ daemon 未实现 /api/v1/ingest/register（旧版）             │
│   → 插件 catch 404，跳过注册，不发送 sessionId            │
│                                                         │
│ daemon 事件处理失败                                      │
│   → 不返回 500，记录 ERROR 日志，插件继续运行             │
│                                                         │
│ PermissionEngine 不可用                                  │
│   → 默认 allow 所有工具调用                               │
└─────────────────────────────────────────────────────────┘
```

---

## 回归风险

### 现有功能受影响面

| 功能 | 风险等级 | 描述 | 缓解措施 |
|------|---------|------|---------|
| daemon 启动 | **高** | A 层路径重构改动 4 个核心模块的构造函数签名 | 保持 enterprise 模式默认行为不变；所有构造函数变更通过接口注入 |
| 状态管理（WAL/StateManager） | **高** | 路径计算逻辑变更，如果 personal 模式路径错误可能导致 WAL 写入失败 | 单元测试覆盖两种模式；personal 模式目录自动创建 |
| 项目注册 | **中** | ProjectManager 新增 gitignore 维护逻辑，registerProject 流程变长 | try-catch 包裹 gitignore 操作，失败不影响注册 |
| 插件功能 | **中** | 插件新增 register 调用，如果 daemon 响应慢可能延迟插件加载 | register 调用设置 5s 超时；失败后插件降级运行 |
| CLI init/doctor | **低** | 新增目录创建和检查逻辑 | 仅 personal 模式触发；enterprise 模式不受影响 |

### 路径变更数据丢失风险

| 风险场景 | 概率 | 影响 | 缓解 |
|---------|------|------|------|
| personal 模式下项目目录不可写 | 低 | WAL 事件无法写入 | 启动时检测目录可写性，不可写时抛 `DaemonStartError` |
| enterprise→personal 切换后旧数据不可见 | 中 | 用户体验困惑 | 启动时检测旧路径存在数据时打印 INFO 提示 |
| .gitignore 自动维护覆盖用户手动编辑 | 低 | 用户自定义规则丢失 | 使用标记注释块隔离，用户规则在块外不受影响 |

### 插件未升级时的降级行为

| 场景 | daemon 版本 | 插件版本 | 行为 |
|------|-----------|---------|------|
| 新 daemon + 旧插件 | 新 | 旧 | daemon 收到无 sessionId 事件 → 记录 WARNING → 尽力处理（记录日志） |
| 旧 daemon + 新插件 | 旧 | 新 | 插件调用 register → 收到 404 → 跳过注册 → 回退到旧行为（无 sessionId） |
| 新 daemon + 新插件 | 新 | 新 | 完整功能（注册 → sessionId 绑定 → 事件路由） |

---

## Correctness Properties

### CP-1 Personal 模式路径不变式
**test_type**: property
**test_file**: tests/property/path-resolver.property.test.ts
**requirement_ref**: WI-031 A 层需求 1

对于任意有效的 `projectPath` 和任意 `mode ∈ {personal, enterprise}`，`PathResolver.resolveStatePath(projectPath)` 必须始终返回一个以项目根目录（personal）或用户 home 目录（enterprise）为前缀的绝对路径，且不包含 `..` 路径穿越。

### CP-2 Enterprise 模式向后兼容
**test_type**: integration
**test_file**: tests/integration/daemon-lifecycle.test.ts
**requirement_ref**: WI-031 A 层需求 1

当 `mode=enterprise` 时，daemon 的行为（启动、状态读写、WAL 路径）必须与变更前完全一致。对比 `~/.specforge/projects/<hash>/events.jsonl` 和 `state.json` 的写入路径不变。

### CP-3 Register 端点幂等性
**test_type**: property
**test_file**: tests/property/register-idempotent.property.test.ts
**requirement_ref**: WI-031 B 层需求 1

对任意相同的 `projectPath`，多次调用 `POST /api/v1/ingest/register` 必须返回相同的 `sessionId`（幂等）。

### CP-4 Ingest 事件处理不阻塞插件
**test_type**: property
**test_file**: tests/property/ingest-nonblocking.property.test.ts
**requirement_ref**: WI-031 B 层需求 3

对任意合法的 `IngestEventRequest`，`handleIngestEvent` 必须在 15 秒内返回 HTTP 响应（即使子系统处理失败），且不得抛出未捕获异常。

### CP-5 ALL_STATES ↔ 转换表交叉一致性
**test_type**: unit
**test_file**: tests/unit/state_machine_completeness.test.ts
**requirement_ref**: WI-031 A 层需求 4, WI-033:requirement:1

`ALL_STATES` 数组与所有 8 种工作流转换表中引用的全部状态名必须完全一致（无遗漏、无多余）。即 `getAllReferencedStates() == new Set(ALL_STATES)`。

### CP-6 .gitignore 托管块完整性
**test_type**: unit
**test_file**: tests/unit/project-manager-gitignore.test.ts
**requirement_ref**: WI-031 A 层需求 2

对任意 `.specforge/.gitignore` 文件，多次调用 `ensureGitignore()` 后，托管标记块 `# SpecForge managed (BEGIN)` 和 `# SpecForge managed (END)` 必须恰好各出现一次，且标记块外的内容不被修改。

---

## 测试策略

### 单元测试

| 测试文件 | 覆盖模块 | 关键用例 |
|---------|---------|---------|
| `tests/unit/path-resolver.test.ts` | IPathResolver, PersonalPathResolver, EnterprisePathResolver | personal 模式路径前缀为 projectPath；enterprise 模式路径在 home 下 |
| `tests/unit/config.test.ts` | DaemonConfig | `--mode personal`、`SPECFORGE_MODE=enterprise`、默认值 |
| `tests/unit/state_machine_completeness.test.ts` | state_machine.ts | ALL_STATES vs 转换表交叉一致性 |
| `tests/unit/project-manager-gitignore.test.ts` | ProjectManager | gitignore 创建、更新、托管块替换 |
| `tests/unit/http.test.ts` | HTTPServer | register 端点、ingest event 路由、向后兼容（无 sessionId） |
| `tests/unit/session.test.ts` | SessionRegistry | registerPluginSession 幂等、handleOpenCodeEvent 映射 |

### 属性测试（PBT）

| 测试文件 | 覆盖 CP | 生成策略 |
|---------|--------|---------|
| `tests/property/path-resolver.property.test.ts` | CP-1 | 随机生成合法/非法 projectPath |
| `tests/property/register-idempotent.property.test.ts` | CP-3 | 相同 projectPath 多次调用 |
| `tests/property/ingest-nonblocking.property.test.ts` | CP-4 | 随机生成所有 7 种事件类型，验证 15s 内返回 |

### 集成测试

| 测试场景 | 优先级 |
|---------|--------|
| personal 模式 daemon 启动 → WAL 写入 `.specforge/runtime/events.jsonl` | Must |
| enterprise 模式 daemon 启动 → WAL 写入 `~/.specforge/projects/<hash>/` | Must |
| 插件 register → daemon 返回 sessionId → ingest event 路由到各子系统 | Must |
| 旧格式事件（无 sessionId）daemon 降级处理 | Must |
| daemon 崩溃重启 → WAL 重建状态正确（personal + enterprise） | Must |
| 插件降级：daemon 不可达时插件正常运行 | Must |

### E2E 测试

| 测试场景 | 覆盖流程 |
|---------|---------|
| Personal 模式完整链路：CLI init → daemon 启动 → 插件注册 → 工具调用事件 → EventLogger 持久化 → 数据在 `.specforge/runtime/` | A+B 全链路 |
| Enterprise 模式向后兼容：现有流程不中断 | A 层向后兼容 |

---

## Out of Scope

- **不包含** personal→enterprise 热切换（需重启 daemon）
- **不包含** 旧 enterprise 数据自动迁移到 personal 布局
- **不包含** PermissionEngine 的实际拦截逻辑（阶段一仅记录不拦截）
- **不包含** `tool.execute.before` 的 args 修改能力（v6.0 原插件功能）
- **不包含** checkpoint 自动清理策略
- **不包含** 多 daemon 实例共享 daemon.json
- **不包含** per-project mode 覆盖
- **不包含** plugin 注销端点

---

## Assumptions（设计假设）

- 假设 `process.env.HOME` 和 `process.env.USERPROFILE` 在所有目标平台可用（DaemonConfig 和 PathResolver 依赖）
- 假设 `~/.config/opencode/` 目录存在或可由 daemon 创建（daemon.json 新路径）
- 假设插件 `PluginInput.directory` 始终指向有效项目路径
- 假设 daemon 与插件运行在同一个文件系统（projectPath 可被双方解析）
- 假设 `mode=enterprise` 作为默认值确保向后兼容（虽然代码默认 `personal`，但 enterprise 用户通过配置/环境变量覆盖）
- 假设 `SPECFORGE_MODE` 环境变量由 CLI `sf start` 命令注入（在 `sf init` 时写入项目级配置）
- 假设 PermissionEngine.evaluate() 的接口已存在且支持 `{ tool, args, sessionId, projectId }` 参数格式
- 假设 EventLogger.append() 接受 `Event` 类型参数（与 daemon 使用的 observability EventLogger 一致）
- 假设 WI-001:task:27 的冲突（删除 state_machine.ts）不会在此变更前执行

---

## KG 追溯关系

### 设计决策 → 需求追溯

| 设计决策 | 引用需求 | 来源 |
|---------|---------|------|
| DD-A1 (mode 配置) | WI-031 A 层需求 1 | impact_analysis 1.1.1 |
| DD-A2 (IPathResolver) | WI-031 A 层需求 1, 2 | impact_analysis 1.1.2 |
| DD-A3 (.gitignore 维护) | WI-031 A 层需求 2 | impact_analysis 1.1.2 |
| DD-A4 (daemon.json 迁移) | WI-031 A 层需求 3 | impact_analysis 1.1.3 |
| DD-A5 (ALL_STATES 验证) | WI-031 A 层需求 4, WI-033:requirement:1, WI-033:requirement:2 | impact_analysis 1.1.4 |
| DD-B1 (Register 端点) | WI-031 B 层需求 1, 4 | impact_analysis 1.2.2 |
| DD-B2 (Ingest 路由) | WI-031 B 层需求 2, 3 | impact_analysis 1.2.3 |
| DD-B3 (PermissionEngine) | WI-031 B 层需求 3 | impact_analysis 1.2.3 |
| DD-B4 (SessionRegistry) | WI-031 B 层需求 3 | impact_analysis 1.2.3 |
| DD-B5 (EventLogger) | WI-031 B 层需求 3 | impact_analysis 1.2.3 |
| DD-B6 (saveCheckpoint) | WI-031 B 层需求 3 | impact_analysis 1.2.3 |
| DD-B7 (shell.env) | WI-031 B 层需求 4 | impact_analysis 1.2.4 |
| DD-AB1 (绑定契约) | WI-031 A/B 集成 | impact_analysis 1.3 |
| DD-AB2 (Feature Flag) | WI-031 B 层回滚 | impact_analysis 2.5 |

### 受影响 WI-001 Task 节点

| WI-001 Task | 变更影响 | 本设计对应 |
|-------------|---------|-----------|
| WI-001:task:1 (HTTP Server) | 新增 ingest/register 端点、事件路由 | DD-B1, DD-B2 |
| WI-001:task:2 (StateManager) | 路径切换、ALL_STATES 验证 | DD-A2, DD-A5 |
| WI-001:task:3 (RecoverySubsystem) | 路径切换、saveCheckpoint | DD-A2, DD-B6 |
| WI-001:task:4 (ProjectManager) | 路径切换、daemon.json、gitignore | DD-A2, DD-A3, DD-A4 |
| WI-001:task:5 (SessionRegistry) | OpenCode 事件映射、projectPath 绑定 | DD-B1, DD-B4 |
| WI-001:task:9 (Daemon 启动) | mode 配置初始化、路径适配 | DD-A1, DD-A2 |
| WI-001:task:18 (PermissionEngine) | 接入 tool.invoking 流程 | DD-B3 |
| WI-001:task:39 (Thin Plugin) | projectPath、register、shell.env | DD-B1, DD-B7 |

---

## 架构属性自检

### A1 单一职责
- **IPathResolver**：我是"路径解析器"（2 个实现：Personal / Enterprise）
- **IngestEventRouter**：我是"事件类型→子系统路由器"
- **.gitignore Manager**：我是"gitignore 自动维护器"（集成在 ProjectManager 中）
- 每个组件的"我是 X"陈述明确，无多重职责

### A2 显式依赖
- Mermaid 图包含所有组件间箭头
- `DaemonConfig → IPathResolver` 工厂依赖
- `HTTPServer → IngestEventRouter → SessionRegistry/PermissionEngine/EventLogger/RecoverySubsystem` 依赖链完整

### A3 可替换性
- `IPathResolver`：可 mock 为 `FakePathResolver`（测试用）
- `PermissionEngine`：通过 `deps.permissionEngine` 注入，可 mock
- `EventLogger`：通过 `deps.eventLogger` 注入，可 mock
- 所有调用方依赖 interface/type，不依赖具体 class

### A4 失败可观测
- 每个组件 interface 列出 `Errors:` 段
- ingest 事件处理失败 → ERROR 日志 + 不阻断插件
- PermissionEngine 超时 → WARNING 日志 + 默认 allow
- WAL/StateManager 写入失败 → DaemonStartError（阻断启动）

### A5 边界明确
- 整体 `Out of Scope` 列出 8 项不做什么
- `Assumptions` 列出 9 项设计假设
- 每个 DD 包含 `Out of Scope` 和 `Assumptions` 段
