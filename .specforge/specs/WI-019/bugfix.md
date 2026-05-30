# Bugfix: Daemon 运行中突然不可达

## 当前行为 (Current Behavior)

### 症状描述

SpecForge daemon 在 Windows 上运行期间，间歇性地出现 HTTP 连接失败，客户端报错：

```
Daemon connection failed: Unable to connect. Is the computer able to access the url?
```

### 触发条件

| 序号 | 触发条件 | 具体场景 |
|------|----------|----------|
| 1 | **sf_state_transition 调用** | Orchestrator 执行状态流转时，daemon 处理请求过程中 HTTP 服务短暂不可达 |
| 2 | **并发工具调用** | 在 fsync 阻塞期间，所有并发到达的 HTTP 请求（sf_safe_bash、sf_doc_lint 等）全部失败 |
| 3 | **events.jsonl 体积大** | events.jsonl 达到 6.4 MB 时，每次 fsync 耗时显著增加，加剧阻塞 |

### 故障时序

```
T0: Orchestrator HTTP 请求到达 daemon → sf_state_transition
T1: daemon 处理请求 → WAL.appendEvent → fs.appendFile (events.jsonl) → OK
T2: WAL fsyncSync(events.jsonl, 6.4MB) [Windows FlushFileBuffers 50~500ms]
     └─ 此时 Node.js 事件循环完全阻塞
     └─ HTTP 服务器无法 accept() 新连接
     └─ 所有并发客户端 receive "Unable to connect"
T3: StateManager.writeStateFile → fs.writeFile (state.json) → OK
T4: StateManager fsyncSync(state.json) [Windows FlushFileBuffers 10~50ms]
     └─ 事件循环再次阻塞
T5: 两个 fsyncSync 完成 → 事件循环恢复 → HTTP 服务器恢复正常
```

### 影响范围

| 受影响组件 | 影响描述 |
|------------|----------|
| sf_state_transition | 自身请求在阻塞期间处于 pending 状态 |
| sf_safe_bash | 并发工具调用全部连接失败 |
| sf_doc_lint / sf_*_gate 等 | 同上 |
| thin-client 单例 | 已缓存的 port/token 有效但连接失败，无重试机制 |
| handshake.json | daemon 崩溃后未清理，残留旧端口信息 |

### 次级问题

1. **handshake.json 残留**：daemon 崩溃退出时 handshake.json 未清理，重启后 thin-client 可能读到旧端口/旧 token 导致 401
2. **thin-client 单例不刷新端口**：DaemonClient 实例缓存 baseUrl 和 token，daemon 重启换端口后，只有 401 响应才触发 reload()，但连接超时/拒绝不会触发 reload
3. **events.jsonl 无归档机制**：文件持续追加增长（目前已 6.4 MB），每次 fsync 耗时随文件大小线性增长，形成恶性循环

---

## 预期行为 (Expected Behavior)

### 核心目标

daemon 的 HTTP 服务始终可接受新连接，内部 I/O 操作（包括 fsync）不得阻塞事件循环。

### 修复后行为

1. **fsync 异步化**：所有 `fsSync.fsyncSync` 调用替换为非阻塞方案（如 `fsync()` 使用 libuv 线程池，或迁移到 `fs.promises` 的回调式 fsync）
2. **HTTP 服务独立性**：Node.js 事件循环在 fsync 执行期间仍能处理 I/O 事件，HTTP accept 不受影响
3. **并发请求不丢失**：sf_state_transition 执行期间，其他并发工具调用正常返回
4. **handshake.json 生命周期管理**：
   - daemon 正常退出和异常退出时均清理 handshake.json
   - 启动时检查残留 handshake.json 并处理冲突
5. **thin-client 端口感知**：连接失败时自动重读 handshake.json 刷新端口和 token（不依赖 401 响应）
6. **events.jsonl 归档**：实现 WAL 日志轮转或定期归档机制，控制单个文件大小上限

---

## 不变行为 (Invariant Behavior)

以下行为在修复时必须保持不变：

### 1. WAL 写入语义不变

| 不变量 | 说明 | 当前实现 |
|--------|------|----------|
| 事件先写 events.jsonl 再写 state.json | WAL ordering 保证：崩溃恢复时 events.jsonl 是最新状态的权威来源 | appendFile → fsync → writeFile → fsync |
| fsync 保证数据落盘 | 每次事件写入后必须确保操作系统缓冲区刷入物理磁盘 | fsSync.fsyncSync(fd) |
| monotonicSeq 单调递增 | 每个事件的 seq 严格递增，不因并发或重试出现乱序 | createEvent 中递增 _lastSeq |

### 2. 数据持久化保证不变

- state.json 和 events.jsonl 的写入必须保证 `fsync` 语义（数据已刷盘）
- 不能将 fsync 改为仅 `fdatasync` 或完全移除 fsync（否则崩溃时可能丢失数据）
- 不能将同步 fsync 改为异步后丢失刷盘完成的时序保证

### 3. HTTP API 契约不变

- `/api/v1/tool/invoke` 的请求/响应格式不变
- handshake.json 的格式 (`pid`, `port`, `token`, `startedAt`, `schemaVersion`) 不变
- 认证 token 机制不变

### 4. 崩溃恢复语义不变

- daemon 崩溃后重启，必须能从 events.jsonl + state.json 恢复完整状态
- WAL 中未完成的事务（events.jsonl 中有记录但 state.json 中未反映）必须在恢复时重放

---

## 根因分析 (Root Cause Analysis)

### 核心根因：`fsSync.fsyncSync` 阻塞 Node.js 事件循环

#### 为什么 fsyncSync 会阻塞

Node.js 的 `fs.fsyncSync(fd)` 是**同步系统调用**，直接委托给操作系统的 `fsync()`：

- **Linux/macOS**：`fsync()` 通常耗时 < 5ms，因为操作系统在后台异步写盘，fsync 仅提交缓冲区
- **Windows**：`fsync()` 映射到 `FlushFileBuffers()`，这是一个**同步阻塞调用**，必须等待磁盘控制器确认数据已写入物理介质后才返回

在 Windows 上，`FlushFileBuffers()` 的耗时取决于：
- 文件大小（大文件刷盘更慢）
- 磁盘类型（HDD 远慢于 SSD）
- 文件系统碎片化程度
- 操作系统缓存压力

当 events.jsonl 达到 6.4 MB 时，`FlushFileBuffers` 耗时可达 50~500ms。在此期间，Node.js 的事件循环线程被完全阻塞，无法执行任何异步操作——包括 HTTP 服务器的 `accept()`。

#### 阻塞点清单

每次 `sf_state_transition` 请求触发两个 fsync 操作，分布在以下位置：

| # | 文件 | 行号 | 操作 | 触发次数 | 典型耗时 (Win) |
|---|------|------|------|----------|----------------|
| 1 | `wal/WAL.ts` | 74-78 | `fsSync.openSync` + `fsSync.fsyncSync` (events.jsonl) | 每次 appendEvent | 50~500ms |
| 2 | `state/StateManager.ts` | 420-424 | `fsSync.openSync` + `fsSync.fsyncSync` (state.json) | 每次 persistState | 10~50ms |
| 3 | `recovery/RecoverySubsystem.ts` | 499-501 | `fsSync.openSync` + `fsSync.fsyncSync` (state.json) | 恢复写入 | 10~50ms |
| 4 | `recovery/RecoverySubsystem.ts` | 523-527 | `fsSync.openSync` + `fsSync.fsyncSync` (checkpoint) | 会话快照 | 5~30ms |
| 5 | `tools/lib/sf_project_init_core.ts` | 300-317 | `execSync` (node/bun/git --version) | sf_project_init 时 | 100~5000ms |

**单次 sf_state_transition 的累计阻塞时间**：阻塞点 #1 + #2 = **60~550ms**

#### 故障链条完整分析

```
sf_state_transition 请求
    │
    ├─► StateManager.handleTransition()
    │       │
    │       ├─► WAL.appendEvent(event)
    │       │       ├─► fs.appendFile (async, 不阻塞) ✓
    │       │       └─► fsSync.fsyncSync(events.jsonl, 6.4MB)  ← 【阻塞 50~500ms】
    │       │               │
    │       │               ▼ 事件循环冻结
    │       │               HTTP accept() 无法执行
    │       │               并发请求全部超时/拒绝连接
    │       │
    │       └─► StateManager.persistState()
    │               ├─► fs.writeFile (async, 不阻塞) ✓
    │               └─► fsSync.fsyncSync(state.json)  ← 【阻塞 10~50ms】
    │                       │
    │                       ▼ 事件循环再次冻结
    │
    └─► 响应返回（总延迟 ~500ms）
```

#### 为什么在 Windows 上特别严重

| 因素 | Windows | Linux/macOS |
|------|---------|------------|
| fsync 语义 | `FlushFileBuffers` 强制物理写盘 | `fsync` 提交缓冲区（通常很快） |
| 文件大小影响 | 大文件显著增加耗时 | 影响较小 |
| 事件循环线程 | Node.js 单线程同步阻塞 | 同左，但阻塞时间短 |
| 典型 fsync 耗时 | 10~500ms | 1~5ms |

#### 次级根因分析

##### 1. handshake.json 生命周期管理缺失

- **创建**：daemon 启动时写入 handshake.json
- **清理**：仅在 `process.on('exit')` 同步钩子中清理，但以下场景不触发：
  - `process.kill(pid, 'SIGKILL')` / `taskkill /F`
  - 系统崩溃 / 强制关机
  - `process.on('exit')` 中的 `fs.unlinkSync` 本身可能因权限问题失败
- **结果**：残留 handshake.json 指向旧端口，thin-client 读取后连接失败

##### 2. thin-client 单例端口刷新机制缺陷

`thin-client.ts:155-159`：
```typescript
export function getDaemonClient(): DaemonClient {
  if (!_instance) {
    _instance = new DaemonClient();
  }
  return _instance;
}
```

- `reload()` 仅在两个场景被调用：构造函数和 401 响应
- **连接超时/拒绝**（`TypeError: fetch failed`）不会触发 reload
- daemon 重启换端口后，thin-client 永久失联

##### 3. events.jsonl 无归档导致性能退化

- 文件持续追加，每次 fsync 刷整个文件的元数据
- 文件越大 → FlushFileBuffers 越慢 → 阻塞越久 → 并发失败越频繁
- 形成正反馈循环：使用越多，文件越大，阻塞越严重

### 证据摘要

| 证据 | 类型 | 来源 |
|------|------|------|
| 用户报告 "Unable to connect" 间歇出现 | 症状 | intake.md |
| 故障仅在 sf_state_transition 时触发 | 触发条件 | intake.md |
| 阻塞时间 50~500ms，之后自动恢复 | 症状时序 | intake.md |
| events.jsonl 已达 6.4 MB | 恶化因素 | intake.md |
| WAL.ts:74-76 使用 fsSync.fsyncSync | 代码证据 | 源码静态分析 |
| StateManager.ts:422 使用 fsSync.fsyncSync | 代码证据 | 源码静态分析 |
| Windows 上 fsync → FlushFileBuffers 同步阻塞 | 平台特性 | Node.js / Windows API 文档 |
| thin-client 仅在 401 时调用 reload() | 代码证据 | thin-client.ts:101-103 |
| handshake.json 仅在 exit hook 清理 | 代码证据 | daemon 生命周期代码 |
