# Tasks: Daemon 事件循环阻塞修复

> work_item_id: WI-019
> workflow_type: bugfix_spec
> stage: tasks
> generated_by: sf-task-planner

---

## 任务总览

| Batch | Task | DD | 文件 | 依赖 | 类型 |
|-------|------|-----|------|------|------|
| 1 (并行) | TASK-1 | DD-1 | WAL.ts | 无 | 必修复 |
| 1 (并行) | TASK-2 | DD-2 | StateManager.ts | 无 | 必修复 |
| 1 (并行) | TASK-3 | DD-3 | RecoverySubsystem.ts | 无 | 必修复 |
| 1 (并行) | TASK-4 | DD-4 | sf_project_init_core.ts | 无 | 必修复 |
| 1 (并行) | TASK-5 | DD-5 | thin-client.ts | 无 | 必修复 |
| 2 (串行) | TASK-6 | DD-6 | WAL.ts | TASK-1 | 可选 |
| 2 (并行) | TASK-7 | DD-7 | HandshakeManager.ts, Daemon.ts | 无 | 可选 |

> **Batch 1**：5 个任务修改 5 个不同文件，互不冲突，可并行执行。
> **Batch 2**：TASK-6 与 TASK-1 修改同一文件（WAL.ts），必须串行。TASK-7 修改独立文件，可与 TASK-6 并行。

---

## Batch 1 — 必修复任务（可并行）

---

### TASK-1 将 WAL.appendEvent 中的 fsyncSync 替换为异步 fs.promises FileHandle.sync()

**context_block**（executor 必读）：
- **What**: 修改 `packages/daemon-core/src/wal/WAL.ts` 中 `appendEvent` 方法（第 74-78 行），将 `fsSync.openSync` + `fsSync.fsyncSync` + `fsSync.closeSync` 替换为 `fs.open` (promises) + `handle.sync()` + `handle.close()`
- **Why**: 实现 REQ-1 blocking point #1。当前 `fsSync.fsyncSync` 在 Windows 上调用 `FlushFileBuffers`，同步阻塞事件循环 50~500ms，导致 HTTP 服务器无法 accept 新连接
- **Refs**: DD-1（设计文档 DD-1 段，WAL.appendEvent 异步 fsync）
- **Constraints**:
  - `fs` (promises) 已在文件第 8 行导入，无需新增 import
  - 替换后 `fsSync` import（第 9 行）在文件中再无引用，必须删除该行
  - `appendEvent` 方法签名不变：`appendEvent(event: Event): Promise<void>`
  - `await handle.sync()` 返回前数据已落盘（语义等价于 fsSync.fsyncSync）
  - 遵守 project-rules：代码风格匹配相邻文件
- **Done When**:
  - `fsSync.openSync` / `fsSync.fsyncSync` / `fsSync.closeSync` 不再出现在 `appendEvent` 方法中
  - `import * as fsSync from 'fs'` 行已删除
  - `npx tsc --noEmit` 在 `packages/daemon-core` 目录下通过（0 错误）
  - `npx vitest run` 全部通过

**依赖**: 无

**修改文件**:
- `packages/daemon-core/src/wal/WAL.ts`（第 9 行删除 import，第 74-78 行替换实现）

**替换模式**:

定位 `appendEvent` 方法（第 66-80 行），将第 74-78 行：
```typescript
    const fd = fsSync.openSync(this.eventsPath, 'a');
    try {
      fsSync.fsyncSync(fd);
    } finally {
      fsSync.closeSync(fd);
    }
```

替换为：
```typescript
    const handle = await fs.open(this.eventsPath, 'a');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
```

同时删除第 9 行：
```typescript
import * as fsSync from 'fs';
```

**verification_commands**:
- `npx tsc --noEmit`（cwd: packages/daemon-core，检查编译无类型错误）
- `npx vitest run`（cwd: packages/daemon-core，确保现有测试全部通过）
- `node -e "const fs = require('fs'); const src = fs.readFileSync('src/wal/WAL.ts','utf8'); console.assert(!src.includes('fsSync.'), 'fsSync still present'); console.assert(!src.includes('import * as fsSync'), 'fsSync import still present'); console.log('OK: fsSync removed from WAL.ts')"`（cwd: packages/daemon-core，检查 fsSync 已彻底移除）

---

### TASK-2 将 StateManager.writeStateFile 中的 fsyncSync 替换为异步 fs.promises FileHandle.sync()

**context_block**（executor 必读）：
- **What**: 修改 `packages/daemon-core/src/state/StateManager.ts` 中 `writeStateFile` 方法（第 420-424 行），将 `fsSync.openSync` + `fsSync.fsyncSync` + `fsSync.closeSync` 替换为 `fs.open` (promises) + `handle.sync()` + `handle.close()`
- **Why**: 实现 REQ-2 blocking point #2。每次 `sf_state_transition` 在 WAL fsync 之后还需对 state.json 做第二次 fsync（10~50ms），加剧事件循环阻塞
- **Refs**: DD-2（设计文档 DD-2 段，StateManager.writeStateFile 异步 fsync）
- **Constraints**:
  - `fs` (promises) 已在文件中导入（`import * as fs from 'fs/promises'`）
  - 替换后 `fsSync` import 在文件中再无引用，必须删除该行
  - `writeStateFile` 方法签名不变：`writeStateFile(state: ProjectState): Promise<void>`
  - 调用方 `persistState()`（第 412 行）已 `await this.writeStateFile(state)`，无需变更
- **Done When**:
  - `fsSync.openSync` / `fsSync.fsyncSync` / `fsSync.closeSync` 不再出现在 `writeStateFile` 方法中
  - `import * as fsSync from 'fs'` 行已删除
  - `npx tsc --noEmit` 在 `packages/daemon-core` 目录下通过
  - `npx vitest run` 全部通过

**依赖**: 无（与 TASK-1 修改不同文件，可并行）

**修改文件**:
- `packages/daemon-core/src/state/StateManager.ts`（删除 fsSync import，第 420-424 行替换实现）

**替换模式**:

定位 `writeStateFile` 方法（第 418-426 行），将第 420-424 行：
```typescript
    const fd = fsSync.openSync(this.statePath, 'a');
    try {
      fsSync.fsyncSync(fd);
    } finally {
      fsSync.closeSync(fd);
    }
```

替换为：
```typescript
    const handle = await fs.open(this.statePath, 'a');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
```

同时删除文件中的 `import * as fsSync from 'fs'` 行。

**verification_commands**:
- `npx tsc --noEmit`（cwd: packages/daemon-core）
- `npx vitest run`（cwd: packages/daemon-core）
- `npx vitest run src/state/StateManager.test.ts`（cwd: packages/daemon-core，针对性运行 StateManager 测试）

---

### TASK-3 将 RecoverySubsystem 中 writeState 和 saveCheckpoint 的 fsyncSync 替换为异步 fs.promises FileHandle.sync()

**context_block**（executor 必读）：
- **What**: 修改 `packages/daemon-core/src/recovery/RecoverySubsystem.ts` 中两处 fsyncSync 调用：`writeState` 方法（第 499-503 行）和 `saveCheckpoint` 方法（第 523-527 行），均替换为 `fs.open` + `handle.sync()` + `handle.close()`
- **Why**: 实现 REQ-3 blocking points #3 和 #4。崩溃恢复子系统在写 state.json 和 checkpoint 快照时也使用同步 fsync，阻塞事件循环
- **Refs**: DD-3（设计文档 DD-3 段，RecoverySubsystem 异步 fsync）
- **Constraints**:
  - `fs` (promises) 已在文件中导入
  - 替换后 `fsSync` import 在文件中再无引用，必须删除
  - `writeState` 方法签名不变：`writeState(state: ProjectState): Promise<void>`
  - `saveCheckpoint` 方法签名不变：`saveCheckpoint(sessionId: string, snapshotData: unknown): Promise<void>`
  - `saveCheckpoint` 的 catch 块保持不动（写盘失败仅 log 不抛）
- **Done When**:
  - 两处 fsyncSync 调用均替换为异步版本
  - `import * as fsSync from 'fs'` 行已删除
  - `npx tsc --noEmit` 在 `packages/daemon-core` 目录下通过
  - `npx vitest run` 全部通过

**依赖**: 无（与 TASK-1/TASK-2 修改不同文件，可并行）

**修改文件**:
- `packages/daemon-core/src/recovery/RecoverySubsystem.ts`（删除 fsSync import，第 499-503 行和第 523-527 行替换实现）

**替换模式**:

第一处 `writeState`（第 499-503 行）：
```typescript
    const fd = fsSync.openSync(this.statePath, 'a');
    try {
      fsSync.fsyncSync(fd);
    } finally {
      fsSync.closeSync(fd);
    }
```
→ 替换为：
```typescript
    const handle = await fs.open(this.statePath, 'a');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
```

第二处 `saveCheckpoint`（第 523-527 行）：
```typescript
      const fd = fsSync.openSync(checkpointPath, 'a');
      try {
        fsSync.fsyncSync(fd);
      } finally {
        fsSync.closeSync(fd);
      }
```
→ 替换为：
```typescript
      const handle = await fs.open(checkpointPath, 'a');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
```

同时删除 `import * as fsSync from 'fs'` 行。

**verification_commands**:
- `npx tsc --noEmit`（cwd: packages/daemon-core）
- `npx vitest run`（cwd: packages/daemon-core）
- `npx vitest run src/recovery/RecoverySubsystem.test.ts`（cwd: packages/daemon-core，针对性运行 RecoverySubsystem 测试）

---

### TASK-4 将 sf_project_init_core 中 execSync 替换为 async exec

**context_block**（executor 必读）：
- **What**: 修改 `packages/daemon-core/src/tools/lib/sf_project_init_core.ts` 中 `generateDevEnvironment` 函数（第 300-317 行），将 3 处 `execSync` 调用替换为 `promisify(exec)` 的异步版本 `execAsync`
- **Why**: 实现 REQ-4 blocking point #5。`execSync("node --version")` 等同步子进程调用阻塞事件循环 100~5000ms，daemon 初始化时可能导致 HTTP 服务不可达
- **Refs**: DD-4（设计文档 DD-4 段，sf_project_init_core execSync → async exec）
- **Constraints**:
  - 在文件顶部新增 `import { exec } from 'node:child_process'` 和 `import { promisify } from 'node:util'`
  - `const execAsync = promisify(exec)`
  - 删除 3 处 `const { execSync } = await import("node:child_process")` 动态导入
  - `execAsync` 返回 `{ stdout: string, stderr: string }`，需取 `.stdout` 字段（不是直接返回 string）
  - `generateDevEnvironment()` 已是 `async function`，返回 `Promise<string>`，无需改调用方签名
  - 三个 version 探测保持串行顺序（await 串行）
  - `timeout` 选项在 promisified exec 中行为一致（超时抛异常 → catch 块忽略 → 返回 "unknown"）
- **Done When**:
  - 3 处 `execSync` 调用均替换为 `await execAsync(...)` 并取 `.stdout`
  - 顶层新增 `import { exec }` 和 `import { promisify }`
  - 无动态 `await import("node:child_process")` 残留
  - `npx tsc --noEmit` 在 `packages/daemon-core` 目录下通过

**依赖**: 无（与 TASK-1/2/3 修改不同文件，可并行）

**修改文件**:
- `packages/daemon-core/src/tools/lib/sf_project_init_core.ts`（第 290-319 行）

**替换模式**:

在文件顶部（与其他 import 并列）新增：
```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
```

第 300-302 行（Node.js 版本探测）从：
```typescript
    const { execSync } = await import("node:child_process")
    const nodeOut = execSync("node --version", { encoding: "utf-8", timeout: 5000 }).trim()
    nodeVersion = nodeOut.startsWith("v") ? nodeOut : `v${nodeOut}`
```
替换为：
```typescript
    const { stdout: nodeOut } = await execAsync("node --version", { timeout: 5000 })
    const nodeVersionTrimmed = nodeOut.trim()
    nodeVersion = nodeVersionTrimmed.startsWith("v") ? nodeVersionTrimmed : `v${nodeVersionTrimmed}`
```

第 308-310 行（Bun 版本探测）从：
```typescript
    const { execSync } = await import("node:child_process")
    const bunOut = execSync("bun --version", { encoding: "utf-8", timeout: 5000 }).trim()
    bunVersion = bunOut
```
替换为：
```typescript
    const { stdout: bunOut } = await execAsync("bun --version", { timeout: 5000 })
    bunVersion = bunOut.trim()
```

第 316-318 行（Git 版本探测）从：
```typescript
    const { execSync } = await import("node:child_process")
    const gitOut = execSync("git --version", { encoding: "utf-8", timeout: 5000 }).trim()
    gitVersion = gitOut.replace("git version ", "")
```
替换为：
```typescript
    const { stdout: gitOut } = await execAsync("git --version", { timeout: 5000 })
    gitVersion = gitOut.trim().replace("git version ", "")
```

**verification_commands**:
- `npx tsc --noEmit`（cwd: packages/daemon-core，检查编译无类型错误）
- `node -e "const fs = require('fs'); const src = fs.readFileSync('src/tools/lib/sf_project_init_core.ts','utf8'); console.assert(!src.includes('execSync'), 'execSync still present'); console.assert(src.includes('execAsync'), 'execAsync not found'); console.assert(src.includes('import { exec }'), 'exec import not found'); console.log('OK: execSync replaced with execAsync')"`（cwd: packages/daemon-core）

---

### TASK-5 修复 thin-client 连接失败时自动重读 handshake 并重试

**context_block**（executor 必读）：
- **What**: 修改 `setup/userlevel-opencode/tools/lib/thin-client.ts` 中 `DaemonClient.call` 方法的 catch 块（第 112-118 行），新增 `isConnectionError` 检测函数，在连接级别错误（fetch failed / ECONNREFUSED 等）时自动调用 `this.reload()` 重读 handshake.json 并重试一次
- **Why**: 实现 REQ-5 次级问题。当前 thin-client 仅在 HTTP 401 响应时触发 reload()，但 daemon 崩溃重启换端口后，连接超时/拒绝不会触发端口刷新，导致 thin-client 永久失联
- **Refs**: DD-5（设计文档 DD-5 段，thin-client 连接失败重读 handshake）
- **Constraints**:
  - 不改动 `DaemonClient` 的公共 API（`call`、`reload`、`invokeTool` 签名不变）
  - `isConnectionError` 新增为模块级私有函数（不导出）
  - `AbortError`（超时）不触发 reload（超时是网络延迟，非端口变化）
  - reload 失败时静默忽略（daemon 可能完全未运行）
  - retry 仍失败时抛出 retryErr（不是原始 err）
  - 遵守 project-rules：代码风格匹配相邻文件
- **Done When**:
  - `isConnectionError` 函数已添加在文件中
  - catch 块在非 AbortError 的连接错误时调用 `this.reload()` 并 retry
  - `npx tsc --noEmit` 在 daemon-core 目录下通过（跨包引用无类型错误）
  - 手动验证：mock fetch 第一次抛 `TypeError: fetch failed`，第二次正常返回 → `call()` 返回预期数据

**依赖**: 无（与 TASK-1/2/3/4 修改不同文件，可并行）

**修改文件**:
- `setup/userlevel-opencode/tools/lib/thin-client.ts`（第 112-118 行 catch 块 + 新增 isConnectionError 函数）

**替换模式**:

在文件中 `export class DaemonClient` 之前新增 `isConnectionError` 函数：

```typescript
/**
 * Detect connection-level errors that indicate daemon may have restarted.
 * These errors suggest handshake.json is stale: daemon restarted with new port/token.
 */
function isConnectionError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    const code = (err as NodeJS.ErrnoException).code?.toLowerCase() || '';

    // Node.js fetch() errors
    if (msg.includes('fetch failed')) return true;
    if (msg.includes('econnrefused')) return true;
    if (msg.includes('econnreset')) return true;
    // System-level error codes
    if (code === 'econnrefused') return true;
    if (code === 'econnreset') return true;
    if (code === 'enotfound') return true;
    if (code === 'econnaborted') return true;

    return false;
}
```

将 catch 块（第 112-118 行）从：
```typescript
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error('Daemon request timed out (30s)');
      }
      throw new Error(
        `Daemon connection failed: ${(err as Error).message}`,
      );
    }
```

替换为：
```typescript
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error('Daemon request timed out (30s)');
      }

      // Connection-level errors: reload handshake and retry once
      if (isConnectionError(err as Error)) {
        try { this.reload(); } catch {
          // Reload may fail if daemon is not running at all
        }
        try {
          // Retry once with fresh handshake
          return await this.call<T>(method, urlPath, body);
        } catch (retryErr) {
          // Retry failed — throw the retry error for clarity
          throw retryErr;
        }
      }

      throw new Error(
        `Daemon connection failed: ${(err as Error).message}`,
      );
    }
```

**verification_commands**:
- `node -e "const fs = require('fs'); const src = fs.readFileSync('setup/userlevel-opencode/tools/lib/thin-client.ts','utf8'); console.assert(src.includes('isConnectionError'), 'isConnectionError function not found'); console.assert(src.includes('this.reload()'), 'reload call not found in catch block'); console.log('OK: connection retry logic present')"`（cwd: 仓库根目录）
- `npx tsc --noEmit`（cwd: packages/daemon-core，确保跨包引用无类型错误）

---

## Batch 2 — 可选修复任务

---

### TASK-6 [可选] 实现 WAL events.jsonl 归档机制

**context_block**（executor 必读）：
- **What**: 在 `packages/daemon-core/src/wal/WAL.ts` 中新增文件轮转逻辑：当 `events.jsonl` 超过 5MB 阈值时，自动重命名为 `events-{timestamp}.jsonl.bak` 并创建新的空 `events.jsonl`，保留最近 3 个归档文件
- **Why**: 实现 REQ-6 次级问题。当前 events.jsonl 无限增长（已达 6.4MB），虽然 TASK-1 已将 fsync 异步化（不再阻塞事件循环），但大文件仍影响启动加载速度和磁盘占用
- **Refs**: DD-6（设计文档 DD-6 段，WAL 归档机制）
- **Constraints**:
  - 本任务**依赖 TASK-1**（修改同一文件 WAL.ts），必须在 TASK-1 完成后执行
  - 新增常量 `WAL_MAX_SIZE = 5 * 1024 * 1024` 和 `WAL_MAX_ARCHIVE_FILES = 3`
  - 新增私有方法 `rotateIfNeeded()` 和 `cleanupOldArchives()`
  - `appendEvent` 中在 `fs.appendFile` 之前调用 `await this.rotateIfNeeded()`（非阻塞）
  - 归档文件名格式：`events-{ISO-8601}.jsonl.bak`
  - 所有文件操作使用 `fs.promises`（异步，不阻塞事件循环）
  - `rotateIfNeeded` 失败时静默记录日志，不中断事件写入
- **Done When**:
  - `rotateIfNeeded` 和 `cleanupOldArchives` 方法已添加到 WAL 类
  - `appendEvent` 方法在 appendFile 之前调用 `await this.rotateIfNeeded()`
  - `npx tsc --noEmit` 在 `packages/daemon-core` 目录下通过
  - `npx vitest run` 全部通过

**依赖**: TASK-1（WAL.ts 异步 fsync 修复必须先完成，避免 merge 冲突）

**修改文件**:
- `packages/daemon-core/src/wal/WAL.ts`（新增常量、rotateIfNeeded、cleanupOldArchives 方法；修改 appendEvent 追加 rotateIfNeeded 调用）

**新增代码模式**:

在 `WAL` 类中（`appendEvent` 方法之前或之后），新增常量和方法：

```typescript
const WAL_MAX_SIZE = 5 * 1024 * 1024; // 5MB threshold
const WAL_MAX_ARCHIVE_FILES = 3;       // Keep at most 3 archive files
```

在 `WAL` 类中新增方法：

```typescript
  /**
   * Rotate events.jsonl if it exceeds WAL_MAX_SIZE.
   * Renames current file to events-{timestamp}.jsonl.bak and creates a new empty file.
   * Non-blocking: all file operations use fs.promises.
   */
  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fs.stat(this.eventsPath);
      if (stat.size < WAL_MAX_SIZE) return;
    } catch {
      // File doesn't exist yet, no rotation needed
      return;
    }

    // Rotate: rename current events.jsonl → events-{timestamp}.jsonl.bak
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `events-${timestamp}.jsonl.bak`;
    const archiveDir = path.dirname(this.eventsPath);
    const archivePath = path.join(archiveDir, archiveName);

    await fs.rename(this.eventsPath, archivePath);
    await fs.writeFile(this.eventsPath, '');

    // Cleanup old archives
    await this.cleanupOldArchives();

    console.log(`[WAL] Rotated events.jsonl → ${archivePath}`);
  }

  /**
   * Remove oldest archive files when count exceeds WAL_MAX_ARCHIVE_FILES.
   */
  private async cleanupOldArchives(): Promise<void> {
    const archiveDir = path.dirname(this.eventsPath);
    const files = await fs.readdir(archiveDir);
    const archives = files
      .filter(f => f.startsWith('events-') && f.endsWith('.jsonl.bak'))
      .sort(); // Alphabetical sort ≈ chronological (ISO-8601 timestamps)
    while (archives.length > WAL_MAX_ARCHIVE_FILES) {
      const oldest = archives.shift()!;
      await fs.unlink(path.join(archiveDir, oldest)).catch(() => {});
    }
  }
```

修改 `appendEvent` 方法，在 `const line = JSON.stringify(event) + '\n';` 之后、`await fs.appendFile(...)` 之前插入：

```typescript
    // Check file size and rotate if needed
    await this.rotateIfNeeded();
```

**verification_commands**:
- `npx tsc --noEmit`（cwd: packages/daemon-core）
- `npx vitest run`（cwd: packages/daemon-core）
- `node -e "const fs = require('fs'); const src = fs.readFileSync('src/wal/WAL.ts','utf8'); console.assert(src.includes('rotateIfNeeded'), 'rotateIfNeeded method not found'); console.assert(src.includes('cleanupOldArchives'), 'cleanupOldArchives method not found'); console.assert(src.includes('WAL_MAX_SIZE'), 'WAL_MAX_SIZE constant not found'); console.log('OK: WAL archive mechanism present')"`（cwd: packages/daemon-core）

---

### TASK-7 [可选] 实现 handshake.json 启动时孤儿检测清理 + 进程退出同步清理

**context_block**（executor 必读）：
- **What**: 
  1. 在 `packages/daemon-core/src/daemon/HandshakeManager.ts` 中新增 `cleanOrphanHandshake()` 方法，启动时检测残留 handshake.json（PID 不存在 → 删除；JSON 损坏 → 删除）
  2. 在 `packages/daemon-core/src/daemon/Daemon.ts` 的 `start()` 方法中（`enforceSingleInstance` 之前）调用 `cleanOrphanHandshake()`
  3. 在 `Daemon.ts` 的 `start()` 方法中注册 `process.on('exit')` 同步钩子做兜底清理
- **Why**: 实现 REQ-7 次级问题。daemon 崩溃/硬杀后 handshake.json 残留，导致 thin-client 读取旧端口连接失败；正常退出时清理保证下一次启动无残留
- **Refs**: DD-7（设计文档 DD-7 段，handshake 崩溃清理）
- **Constraints**:
  - `cleanOrphanHandshake()` 读取 handshake.json → 检查 PID 是否存活 → 不存活则删除
  - `isPidAlive(pid)` 使用 `process.kill(pid, 0)` 检测（跨平台最佳实践；注意 Windows 上不完全可靠，但保守策略——不清理可能存活的 PID——无风险）
  - JSON 解析失败（损坏文件）也删除
  - 文件不存在 (ENOENT) → 正常，静默跳过
  - `process.on('exit')` 是同步钩子，只能使用同步方法（`require('fs').unlinkSync`）
  - `process.on('exit')` 在 SIGKILL/系统崩溃时不触发（已知限制，可接受）
- **Done When**:
  - `HandshakeManager.ts` 包含 `cleanOrphanHandshake()` 和私有 `isPidAlive()` 方法
  - `Daemon.ts` 的 `start()` 中在 `enforceSingleInstance()` 之前调用 `await this.handshakeManager.cleanOrphanHandshake()`
  - `Daemon.ts` 的 `start()` 中注册了 `process.on('exit')` 同步清理钩子
  - `npx tsc --noEmit` 在 `packages/daemon-core` 目录下通过
  - `npx vitest run` 全部通过

**依赖**: 无（修改 HandshakeManager.ts 和 Daemon.ts，与其他任务无文件冲突）

**修改文件**:
- `packages/daemon-core/src/daemon/HandshakeManager.ts`（新增 cleanOrphanHandshake 和 isPidAlive 方法）
- `packages/daemon-core/src/daemon/Daemon.ts`（start() 方法中新增 cleanOrphanHandshake 调用 + process.on('exit') 注册）

**新增代码模式 — HandshakeManager.ts**:

在 `HandshakeManager` 类中新增方法（放在 `readHandshake` 方法之前或之后）：

```typescript
  /**
   * Clean up orphan handshake.json from a previous crashed daemon instance.
   * 
   * Reads the handshake file, checks if the recorded PID is still alive,
   * and removes the file if the PID is dead or the file is corrupt.
   * Called once at daemon startup, before enforceSingleInstance().
   */
  async cleanOrphanHandshake(): Promise<void> {
    const handshakeFile = this.config.getHandshakeFile();
    try {
      const content = await fs.readFile(handshakeFile, 'utf-8');
      const handshake: HandshakeFile = JSON.parse(content);

      // Check if the PID from handshake is still alive
      const pidAlive = this.isPidAlive(handshake.pid);
      if (!pidAlive) {
        console.log(`[HandshakeManager] Orphan handshake detected (PID ${handshake.pid} not running). Cleaning up.`);
        await fs.unlink(handshakeFile);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // No handshake file — normal
      } else if (error instanceof SyntaxError) {
        // Corrupt file — clean it up
        console.warn(`[HandshakeManager] Corrupt handshake file detected. Cleaning up.`);
        await fs.unlink(handshakeFile).catch(() => {});
      }
    }
  }

  /**
   * Cross-platform PID liveness check.
   * Uses process.kill(pid, 0) which is reliable on Unix.
   * On Windows, signal 0 is not fully supported but the conservative
   * behavior (may return false for alive PIDs → no cleanup → safe).
   */
  private isPidAlive(pid: number): boolean {
    try {
      // signal 0 = test existence without sending actual signal
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
```

**新增代码模式 — Daemon.ts**:

在 `start()` 方法中，`// 1. Enforce single instance` 之前插入：

```typescript
    // 0. Clean orphan handshake from previous crashed instance
    await this.handshakeManager.cleanOrphanHandshake();
```

在 `start()` 方法末尾（在 `this.isRunning = true` 之后、`this.registerShutdownTasks()` 之前或之后均可），新增 process.on('exit') 同步清理钩子：

```typescript
    // Register synchronous exit handler for best-effort handshake cleanup
    // Note: This fires on normal exit and most error exits, but NOT on SIGKILL or system crash.
    process.on('exit', (code) => {
      const handshakeFile = this.config.getHandshakeFile();
      try {
        require('fs').unlinkSync(handshakeFile);
      } catch {
        // Best effort cleanup — ignore errors
      }
    });
```

**verification_commands**:
- `npx tsc --noEmit`（cwd: packages/daemon-core）
- `npx vitest run`（cwd: packages/daemon-core）
- `node -e "const fs = require('fs'); const hm = fs.readFileSync('src/daemon/HandshakeManager.ts','utf8'); console.assert(hm.includes('cleanOrphanHandshake'), 'cleanOrphanHandshake not found in HandshakeManager'); console.assert(hm.includes('isPidAlive'), 'isPidAlive not found in HandshakeManager'); const dm = fs.readFileSync('src/daemon/Daemon.ts','utf8'); console.assert(dm.includes('cleanOrphanHandshake'), 'cleanOrphanHandshake call not found in Daemon'); console.assert(dm.includes(\"process.on('exit'\"), 'process.on(exit) not found in Daemon'); console.log('OK: handshake cleanup logic present')"`（cwd: packages/daemon-core）

---

## 附录：Trace Matrix

| DD | Task | 文件 | 验证方式 |
|----|------|------|----------|
| DD-1 | TASK-1 | WAL.ts | tsc + vitest + grep 检查 fsSync 已移除 |
| DD-2 | TASK-2 | StateManager.ts | tsc + vitest + 针对性测试 |
| DD-3 | TASK-3 | RecoverySubsystem.ts | tsc + vitest + 针对性测试 |
| DD-4 | TASK-4 | sf_project_init_core.ts | tsc + grep 检查 execSync 已移除 |
| DD-5 | TASK-5 | thin-client.ts | tsc + grep 检查 isConnectionError |
| DD-6 | TASK-6 | WAL.ts | tsc + vitest + grep 检查 rotateIfNeeded |
| DD-7 | TASK-7 | HandshakeManager.ts, Daemon.ts | tsc + vitest + grep 检查 cleanOrphanHandshake |
