# Investigation Plan: events.jsonl / state.json 并发写入一致性调查

> Work Item: INV-001
> Workflow Type: investigation
> Date: 2026-05-31
> Status: plan

---

## 调查目标

本调查旨在通过**纯静态代码分析**（无运行时测试）回答以下 6 个核心问题：

| # | 核心问题 | 优先级 |
|---|----------|--------|
| Q1 | WAL 和 EventLogger 通过不同文件句柄并发写入 `events.jsonl` 时，是否存在竞态条件（数据交错、丢失、截断）？ | P0 |
| Q2 | StateManager、EventLogger、RecoverySubsystem 三个组件各自全量覆写 `state.json`，是否可能互相损坏数据？ | P0 |
| Q3 | 三个组件的序列化格式是否一致？不同包定义的 `Event` 接口是否存在字段不兼容？ | P0 |
| Q4 | Daemon.ts 中的初始化/连线顺序是否能防止冲突？存在哪些并发写入触发路径？ | P1 |
| Q5 | 为什么项目级 `.specforge/runtime/state.json` 和 `events.jsonl` 尚未生成？ | P1 |
| Q6 | 近期提交（`307f873`, `742155d`, `d7d8a94`, `fccc7f5`）是否引入或修复了与并发写入相关的问题？ | P2 |

---

## 调查范围

### 包含（In scope）

#### 1. 目标文件与路径解析

| 文件 | 用户级路径（`~/.specforge/runtime/`） | 项目级路径（`<project>/.specforge/runtime/`） |
|------|----------------------------------------|---------------------------------------------------|
| `events.jsonl` | `resolveUserPath('runtime') + '/events.jsonl'` | `resolveProjectPath(projectPath, 'runtime') + '/events.jsonl'` |
| `state.json` | `resolveUserPath('runtime') + '/state.json'` | `resolveProjectPath(projectPath, 'runtime') + '/state.json'` |

#### 2. 审查的源文件（完整读取 + 逐行分析）

| 包 | 文件 | 审查重点 |
|----|------|----------|
| `packages/daemon-core/src/wal/WAL.ts` | 全部 258 行 | `appendEvent()` 的 write + fsync 路径；`rotateIfNeeded()` 的并发安全性；序列化格式 (`JSON.stringify(event)`) |
| `packages/daemon-core/src/state/StateManager.ts` | 全部 445 行 | `writeStateFile()` 覆写 + fsync；`persistState()` → `writeStateFile()` 调用链；`isDaemonGlobal` 分支逻辑 |
| `packages/observability/src/event-logger/index.ts` | 全部 663 行 | `append()` 的 `fileHandle.write()` + `sync()`；`rebuildState()` 的覆写逻辑；序列化格式 (`JSON.stringify(event)`) |
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | 全部 540 行 | `writeState()` 覆写 + fsync；`checkAndRepair()` / `repairInconsistency()` 中的状态写入；`saveCheckpoint()` |
| `packages/daemon-core/src/daemon/Daemon.ts` | 全部 383 行 | **构造函数**（第 48-125 行）：StateManager、EventLogger、RecoverySubsystem 的创建和注入 | **`start()`**（第 127-198 行）：初始化顺序、EventBus 持久化钩子注册 |
| `packages/daemon-core/src/daemon/path-resolver.ts` | 全部 217 行 | `PersonalPathResolver` vs `EnterprisePathResolver` 的 daemon 级与项目级路径差异 |
| `packages/daemon-core/src/daemon/DaemonConfig.ts` | 全部 159 行 | `getRuntimeDir()` 委托链 |
| `packages/daemon-core/src/event-bus/EventBus.ts` | 全部 354 行 | `setPersistenceHook()` 机制；`publish()` 中的 WAL-first 保证 |
| `packages/daemon-core/src/types.ts` | 全部 278 行 | daemon-core `Event` 接口定义 |
| `packages/observability/src/types/index.ts` | 全部 270 行 | observability `Event` 接口定义（与 daemon-core 类型对比） |

#### 3. Git 变更分析

| Commit | 日期 | 说明 | 分析重点 |
|--------|------|------|----------|
| `307f873` | 2026-05-30 | fix: fsyncSync/execSync 阻塞事件循环 | WAL/StateManager/RecoverySubsystem 的 fsync 从同步改为异步；引入了 WAL 归档功能 |
| `742155d` | 2026-05-31 | chore: sync working tree state | 工作树状态同步 |
| `d7d8a94` | 2026-05-30 | chore: commit render-layout output | 目录布局渲染输出 |
| `fccc7f5` | 2026-05-29 | 修复目录结构 | 目录结构调整 |

#### 4. 分析维度

- **文件句柄生命周期**：每个写入操作的 `open → write → sync → close` 完整路径
- **序列化格式对比**：daemon-core `Event` vs observability `Event` 的字段级差异
- **并发写入窗口**：识别所有可能并发的写入时刻，分析是否有互斥保护
- **初始化/连线顺序**：Daemon.ts 中的组件创建顺序是否影响写入安全
- **项目级文件生成逻辑**：`isDaemonGlobal` 参数对路径选择的影响

### 不包含（Out of scope）

- 运行时并发压测（如多线程/多进程同时写入）
- 性能基准测试（吞吐量、延迟）
- 操作系统级文件系统行为差异分析（ext4 vs NTFS vs APFS）
- 网络文件系统（NFS/SMB）场景
- 非目标文件的其他日志文件（`logs/telemetry.jsonl` 等）
- 代码修复实现（本调查仅产出分析报告）

---

## 调查方法

### Phase 1：写入路径全量追踪

逐文件追踪每个对 `events.jsonl` 和 `state.json` 的写入调用：

#### 1.1 events.jsonl 写入路径

```
路径 A：StateManager.transition() / appendEvent()
  → WAL.appendEvent()
    → fs.appendFile(eventsPath, line)     [第 76 行]
    → fs.open(eventsPath, 'a')            [第 79 行]
    → handle.sync()                        [第 81 行]
    → handle.close()                       [第 83 行]

路径 B：EventBus.publish()
  → persistenceHook(daemon-core Event)
    → EventLogger.append(event as observability Event)  [Daemon.ts 第 166 行]
      → fs.open(eventsPath, 'a')          [EventLogger 第 327 行]
      → fileHandle.write(line)            [第 331 行]
      → fileHandle.sync()                 [第 334 行]
      → fileHandle.close()                [第 343 行]

路径 C：WAL.rotateIfNeeded()
  → fs.rename(eventsPath, archivePath)    [第 235 行]
  → fs.writeFile(eventsPath, '')          [第 236 行]
```

关键检查点：
- 路径 A 的 `fs.appendFile` + 独立 `fs.open('a').sync()` 与路径 B 的 `fs.open('a').write().sync().close()` 是否可以交错执行？
- 路径 A/B 写同一文件但使用不同 `fileHandle`（`appendFile` 隐式句柄 vs 显式 `fs.open`），是否会导致数据交错？
- 路径 C 的 `fs.rename` + `fs.writeFile` 是否会在路径 A/B 写入过程中执行，导致写入目标文件被替换？

#### 1.2 state.json 写入路径

```
路径 D：StateManager.persistState()
  → writeStateFile(state)
    → fs.writeFile(statePath, JSON.stringify(state))   [第 418 行]
    → fs.open(statePath, 'a')                          [第 419 行]
    → handle.sync()                                     [第 421 行]
    → handle.close()                                    [第 423 行]

路径 E：EventLogger.rebuildState()
  → fs.writeFile(statePath, JSON.stringify(state))     [第 491 行]
  → fs.open(statePath, 'r+')                           [第 494 行]
  → stateHandle.sync()                                  [第 496 行]
  → stateHandle.close()                                 [第 498 行]

路径 F：RecoverySubsystem.writeState(state)
  → fs.writeFile(statePath, JSON.stringify(state))     [第 495 行]
  → fs.open(statePath, 'a')                            [第 498 行]
  → handle.sync()                                       [第 500 行]
  → handle.close()                                      [第 502 行]
```

关键检查点：
- 路径 D/E/F 都使用 `fs.writeFile`（全量覆写），时序重叠时最后一个完成的写入将覆盖前面的结果（Last-Write-Wins 竞态）
- 路径 E 使用 `'r+'` 模式打开文件（要求文件已存在），而路径 D/F 使用 `'a'` 模式
- 全量覆写之间是否有任何形式的锁或版本号？

### Phase 2：Daemon 连线逻辑分析

分析 Daemon.ts 中的组件创建和初始化顺序：

```
构造函数 (第 48-125 行)：
  Line 52: 创建 pathResolver (PersonalPathResolver 或 EnterprisePathResolver)
  Line 53: runtimeDir = config.getRuntimeDir() = resolveUserPath('runtime')
           → ~/.specforge/runtime
  Line 54: stateManager = new StateManager(pathResolver, runtimeDir, true)
           注：isDaemonGlobal=true → 使用 daemon 级路径
           → WAL 写入 ~/.specforge/runtime/events.jsonl
  Line 95: eventLogger = new EventLogger(runtimeDir)
           → eventsPath = ~/.specforge/runtime/events.jsonl
           → statePath = ~/.specforge/runtime/state.json
  Line 163-167: eventBus.setPersistenceHook(event → eventLogger.append(event))
```

**发现**：`stateManager`（第 54 行）和 `eventLogger`（第 95 行）被创建为操作**相同的两个文件**：
- `~/.specforge/runtime/events.jsonl` — 被 WAL（通过 StateManager）和 EventLogger 同时写入
- `~/.specforge/runtime/state.json` — 被 StateManager、EventLogger、RecoverySubsystem 三个组件覆写

初始化顺序（`start()` 第 127-198 行）：
1. `recoverySubsystem.beginStartupPhase()` — 第 133 行
2. `handshakeManager.enforceSingleInstance()` — 第 136 行
3. `httpServer.start()` — 第 139 行
4. `stateManager.initialize()` — 第 151 行（**WAL 初始化 + rebuild + persist**）
5. `recoverySubsystem.checkAndRepair()` — 第 152-156 行（**可能覆写 state.json**）
6. `eventBus.start()` — 第 159 行
7. `eventBus.setPersistenceHook(...)` — 第 163-167 行（**此后所有 EventBus 事件都会通过 EventLogger 写入 events.jsonl**）
8. `eventLogger.initialize()` — **缺失！EventLogger.initialize() 从未被调用**

### Phase 3：Event 类型/序列化格式对比

对比两个包中定义的 `Event` 接口：

| 字段 | daemon-core `Event` | observability `Event` | 兼容？ |
|------|---------------------|----------------------|--------|
| `schema_version` | `'1.0'` (可选) | `'1.0'` (必填) | ⚠️ daemon-core 可选 |
| `eventId` | `string` | `string` | ✅ |
| `ts` | `number` | `number` | ✅ |
| `monotonicSeq` | `number` (可选) | `number` (必填) | ⚠️ daemon-core 可选 |
| `projectId` | `string` (可选) | `string` (必填) | ⚠️ daemon-core 可选 |
| `workItemId` | `string` (可选) | `string \| null` | ⚠️ 语义不同 |
| `actor` | `string` (可选) | `AgentIdentity \| null` | ❌ 类型完全不同 |
| `category` | `string` (可选) | `EventCategory` | ⚠️ observability 更严格 |
| `action` | `string` | `string` | ✅ |
| `payload` | `Record<string, unknown>` | `unknown` (可选) | ⚠️ daemon-core 必填 |
| `metadata` | `{ schemaVersion, source }` (必填) | ❌ 不存在 | ❌ daemon-core 独有 |
| `payloadBlobRef` | ❌ 不存在 | `string` (可选) | ❌ observability 独有 |

**关键发现**：daemon-core 和 observability 定义了**两个不兼容的 Event 接口**。当 EventLogger 的 `persistenceHook` 通过类型断言 (`as unknown as Event`) 将 daemon-core Event 传给 `eventLogger.append()` 时，observability 的 `validateEvent()` 会检查 `event.projectId`、`event.category`、`event.ts` 等字段——这些字段在 daemon-core Event 中均为可选，可能导致验证失败。

反之，当 WAL 将 daemon-core Event 写入 events.jsonl 后，EventLogger 的 `getEvents()` 将其解析为 observability Event 时，可能存在字段缺失。

### Phase 4：项目级文件生成逻辑分析

追踪项目级 `.specforge/runtime/state.json` / `events.jsonl` 的生成条件：

```
StateManager 构造函数（StateManager.ts 第 46-56 行）：
  if (isDaemonGlobal) {
    wal = new WAL(pathResolver.resolveDaemonEventsPath())       // ~/.specforge/runtime/events.jsonl
    statePath = pathResolver.resolveDaemonStatePath()           // ~/.specforge/runtime/state.json
  } else {
    wal = new WAL(pathResolver.resolveEventsPath(projectPath))  // <project>/.specforge/runtime/events.jsonl
    statePath = pathResolver.resolveStatePath(projectPath)      // <project>/.specforge/runtime/state.json
  }
```

在 Daemon.ts 中，唯一创建的 StateManager 使用 `isDaemonGlobal=true`（第 54 行），因此操作的是用户级路径 `~/.specforge/runtime/`。

**项目级 StateManager（`isDaemonGlobal=false`）仅在以下场景创建**：
- `ProjectManager` 内部（需要进一步分析）
- 工具处理器直接创建 StateManager 实例时（需要进一步分析）

### Phase 5：Git 变更影响分析

对每个目标 commit 执行：
1. `git show <commit> -- <file>` 查看 diff
2. 分析变更是否修改了写入路径、文件句柄管理、fsync 调用
3. 评估变更对并发写入安全性的影响（改善 or 恶化 or 无关）

---

## 分析框架

### 竞态条件分类

对每种发现的写入冲突，按以下矩阵评级：

| 风险等级 | 判定标准 |
|----------|----------|
| **Critical** | 可导致数据静默损坏，修复前系统不可用于生产 |
| **High** | 可导致数据不一致或事件丢失，影响核心功能 |
| **Medium** | 在特定时序下可导致问题，有条件触发 |
| **Low** | 理论风险，实际触发概率极低 |

### 竞态窗口识别模板

每个竞态条件按以下格式记录：

```markdown
### RC-N: 标题
- **文件**：目标文件路径
- **写入者**：Writer A vs Writer B
- **窗口描述**：时序重叠的写入操作
- **可能后果**：数据交错 / 丢失 / 截断 / 格式损坏
- **触发条件**：什么场景会触发并发
- **当前防护**：是否有任何同步机制
- **风险等级**：Critical / High / Medium / Low
```

---

## 预期产出格式

### 报告结构

```markdown
# Investigation Report: events.jsonl / state.json 并发写入一致性

## 1. 执行摘要
- 发现的 Critical 风险数量
- 是否建议即刻修复

## 2. 写入路径分析

### 2.1 events.jsonl 写入路径
- 路径 A: [详细描述 + 代码引用]
- 路径 B: [详细描述 + 代码引用]
- 路径 C: [详细描述 + 代码引用]

### 2.2 state.json 写入路径
- 路径 D: [详细描述 + 代码引用]
- 路径 E: [详细描述 + 代码引用]
- 路径 F: [详细描述 + 代码引用]

## 3. 竞态条件分析

### RC-1: [标题]
- 风险等级: Critical/High/Medium/Low
- 证据: [代码行号 + 时序图]
- 建议修复: [方向性建议]

### RC-2: ...
...

## 4. 序列化格式一致性
- 字段级对比表
- 不兼容字段分析
- 实际影响评估

## 5. 项目级文件生成分析
- StateManager 实例化位置
- isDaemonGlobal 分支分析
- ProjectManager 内部逻辑
- 根因结论

## 6. Git 变更影响总结
- 每个 commit 的变更分析与风险评估

## 7. 修复建议（方向性）
- 按优先级排序的建议
- 短期缓解措施
- 长期架构改进

## 8. 附件
- 完整调用链路图（Mermaid）
- 文件句柄生命周期表
```

### 交付物

| 文件 | 位置 |
|------|------|
| 调查计划 | `.specforge/specs/INV-001/investigation_plan.md`（本文件） |
| 调查报告 | `.specforge/specs/INV-001/investigation_report.md` |

---

## 调查步骤（执行清单）

| Step | 描述 | 预计耗时 |
|------|------|----------|
| S1 | 读取全部 10 个源文件完整内容 | 30 min |
| S2 | 追踪每个 events.jsonl 写入调用（WAL, EventLogger） | 20 min |
| S3 | 追踪每个 state.json 写入调用（StateManager, EventLogger, RecoverySubsystem） | 20 min |
| S4 | 分析 Daemon.ts 构造函数和 start() 的连线逻辑 | 30 min |
| S5 | 对比两个 Event 接口的字段级差异 | 15 min |
| S6 | 分析项目级路径的 StateManager 实例化位置 | 20 min |
| S7 | 逐 commit 审查 Git diff | 30 min |
| S8 | 绘制完整调用链路 Mermaid 图 | 20 min |
| S9 | 撰写报告：填写所有 RC 条目、格式对比表、修复建议 | 40 min |
| S10 | 自检：确保所有 Q1-Q6 均有明确结论 | 15 min |

---

## 参考资料

| 文档 | 路径 |
|------|------|
| 目录布局规范 | `packages/types/src/directory-layout.ts` |
| 路径解析器 | `packages/daemon-core/src/daemon/path-resolver.ts` |
| Daemon 配置 | `packages/daemon-core/src/daemon/DaemonConfig.ts` |
| 类型定义（daemon-core） | `packages/daemon-core/src/types.ts` |
| 类型定义（observability） | `packages/observability/src/types/index.ts` |
| 工程经验（异步资源生命周期） | `docs/engineering-lessons/async-resource-lifecycle.md` |
| 方案 A（目录结构治理） | `docs/proposals/2026-05-29-directory-structure-governance.md` |

---

## Out of Scope

- 运行时并发测试（本调查严格限定为静态代码分析）
- 性能基准测试
- OS 级文件系统行为差异分析
- 代码修复实现
- 网络文件系统场景
- 非目标日志文件（`logs/` 目录下的其他 `.jsonl` 文件）

---

## Assumptions

1. Node.js `fs/promises` 模块的 `fs.writeFile`、`fs.appendFile` 等操作在单个进程中不提供文件级互斥锁
2. Daemon 进程为单进程运行（`enforceSingleInstance()` 保证），因此仅需分析进程内并发（Event Loop 层面的交错执行）
3. `fs.writeFile` 对同一文件的并发调用在 Node.js 中表现为 Last-Write-Wins 语义（无原子性保证）
4. EventBus 的 `publish()` 是异步的（`async publish`），且 `persistenceHook` 在 handler fan-out 之前执行
5. Daemon 运行在 `personal` 模式下（默认），使用 `PersonalPathResolver`
6. 主机环境为 Windows 10（`win32`），但文件系统行为应平台无关（仅分析 Node.js API 语义）
