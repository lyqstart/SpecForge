# WI-024 Tasks: HandshakeManager 双重写入 + Windows 互斥锁修复

> 工作流类型: quick_change
> 关联文件: intake.md

---

## 任务依赖总览

```
┌──────────┐
│  TASK-1  │  (无依赖)
└──────────┘
```

- **并行批次 1**: TASK-1
- **串行任务**: 无

---

### TASK-1 修复 enforceSingleInstance() Windows fallback 冗余写入 + PID 存在性验证

**context_block**（executor 必读）:
- **What**: 修改 `packages/daemon-core/src/daemon/HandshakeManager.ts` 中 `enforceSingleInstance()` 方法的 Windows fallback 分支（当前第 49-53 行），用 PID 存在性验证替换冗余写入
- **Why**:
  - 问题 1 🐛: 第 51-52 行的 `writeFileSync` + `fsyncSync` 在 Windows fallback 中写入一次 PID，然后第 62 行统一写入又覆盖一次，功能上无危害但代码冗余，且注释 "try to open exclusively" 与实际行为不符
  - 问题 2 🐛: Windows 上缺乏真正的互斥保护，当前 fallback 只写了 PID 但没有做任何独占性检查，二次启动检测缺失（Windows 上可同时运行两个 Daemon）
- **Refs**: intake.md（[WI-024 变更描述](intake.md)）
- **核心改动**:
  - **删除**: 第 50-53 行的 Windows fallback 冗余写入（`writeFileSync` + `fsyncSync` on `this.lockFd`）
  - **替换为**:
    1. `readFileSync(lockFile, 'utf-8')` 读取锁文件内容
    2. `parseInt()` 解析出 `existingPid`
    3. `process.kill(existingPid, 0)` 验证 PID 是否存活
    4. **存活 → 拒绝启动**: 关闭 fd，抛 `Error('Another Daemon instance is already running')`
    5. **ESRCH / ERR_INVALID_ARG_TYPE → 覆盖**: 进程不存在或无效 PID，fall through 到第 62 行写入当前 PID
    6. **EPERM / EACCES → 保守拒绝**: 进程存在但无权限，关闭 fd，抛错误
    7. 如果文件是空的（首次启动）或读取失败 → 正常 fall through 写入当前 PID
  - **保持不动**: 第 62 行的统一写入 `writeFileSync(this.lockFd, String(process.pid))` + `fsyncSync`
  - **保持不动**: `cleanup()` 方法（不变）
  - **保持不动**: Unix `flockSync(LOCK_EX | LOCK_NB)` 路径
- **Constraints**:
  - 仅修改 `packages/daemon-core/src/daemon/HandshakeManager.ts` 这一个文件
  - 不引入任何新依赖（仅使用 `fs` 标准库和 `process.kill`）
  - 不修改 `cleanup()` 方法
  - 不修改 Unix flock 分支
  - 第 62 行统一写入必须保留
  - 外层 catch（第 65 行）的 fd 清理逻辑不变
- **Done When**:
  - 第 50-53 行的旧冗余 `writeFileSync` + `fsyncSync` 被删除
  - Windows fallback 中实现了 `process.kill(pid, 0)` 的 PID 存在性验证
  - `process.kill` 的 3 种错误码（ESRCH / ERR_INVALID_ARG_TYPE / EPERM / EACCES）都被正确处理
  - `cleanup()` 方法未被改动
  - 第 62 行统一写入 `writeFileSync(this.lockFd, String(process.pid))` 仍然存在
  - `bun run build` 或 `tsc --noEmit` 编译通过（语法正确）

- **依赖**: 无
- refs: [intake.md]
- files: [packages/daemon-core/src/daemon/HandshakeManager.ts]
- **预计改动**: 约 20 行（删除 3 行冗余代码 + 插入 ~20 行新逻辑）
- **verification_commands**:
  - `node -e "const c=require('fs').readFileSync('packages/daemon-core/src/daemon/HandshakeManager.ts','utf8'); const lines=c.split('\n'); const hasOld=lines.some((l,i)=>l.includes('writeFileSync(this.lockFd, String(process.pid))') && i<55); process.exit(hasOld?1:0)"` — 确认第 50-53 行的旧冗余写入被删除（在 55 行前没有 writeFileSync + process.pid）
  - `node -e "const c=require('fs').readFileSync('packages/daemon-core/src/daemon/HandshakeManager.ts','utf8'); process.exit(c.includes('process.kill(')?0:1)"` — 确认新的 PID 验证逻辑（`process.kill` 调用）存在
  - `node -e "const c=require('fs').readFileSync('packages/daemon-core/src/daemon/HandshakeManager.ts','utf8'); process.exit(c.includes(\"code === 'ESRCH'\")?0:1)"` — 确认 ESRCH 错误处理存在
  - `node -e "const c=require('fs').readFileSync('packages/daemon-core/src/daemon/HandshakeManager.ts','utf8'); process.exit(c.includes(\"code === 'EPERM'\")?0:1)"` — 确认 EPERM/EACCES 错误处理存在
  - `node -e "const c=require('fs').readFileSync('packages/daemon-core/src/daemon/HandshakeManager.ts','utf8'); const m=c.match(/async cleanup\(\)[\s\S]*?\n  \}/); const hasRemoveHandshake=m&&m[0].includes('removeHandshake'); const hasReleaseLock=m&&m[0].includes('lockFd'); process.exit(hasRemoveHandshake&&hasReleaseLock?0:1)"` — 确认 `cleanup()` 方法未被改动
  - `node -e "const c=require('fs').readFileSync('packages/daemon-core/src/daemon/HandshakeManager.ts','utf8'); const lines=c.split('\n'); const writeLine=lines.findIndex(l=>l.includes('writeFileSync(this.lockFd, String(process.pid))')); process.exit(writeLine>=58?0:1)"` — 确认第 62 行统一写入保留（索引 >= 58，即新代码中保留在方法后半部分）
  - `cd packages/daemon-core && npx tsc --noEmit 2>&1` — TypeScript 编译通过
