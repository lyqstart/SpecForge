# WI-024 Intake: HandshakeManager 双重写入 + Windows 互斥锁修复

## 变更描述

修复 `packages/daemon-core/src/daemon/HandshakeManager.ts` 中 `enforceSingleInstance()` 方法的两个问题：

### 问题 1：Windows 上 PID 被写入两次（冗余写入）
- 第 51 行（Windows fallback）写入一次
- 第 62 行（统一写入）再写一次，覆盖前一次
- 功能上无危害，但代码冗余，且 Windows fallback 的注释"try to open exclusively"与实际行为不符

### 问题 2：Windows 上缺乏真正的互斥保护
- 当前 Windows fallback 只写了 PID，**没有做任何独占检查**
- 真正的二次启动检测缺失（Windows 上可同时运行两个 Daemon）
- 需要替换为 PID 存在性验证机制

## 修复方案

### Unix：不变
- 继续使用 `flock(LOCK_EX | LOCK_NB)`
- 删除第 50-53 行的冗余 Windows fallback（Unix 分支不会走到那里）
- PID 写入保留在第 62 行（统一写入点）

### Windows：替换为 PID 存在性验证
- 读取现有 `daemon.lock` 的内容，解析 PID
- 调用 `process.kill(pid, 0)` 检查该 PID 是否存活
- 存活 → 拒绝启动（抛 `"Another Daemon instance is already running"`）
- 不存在/无效 → 覆盖写入当前 PID
- 删除第 50-53 行的伪 fallback

### `isProcessAlive` 需处理 3 种错误码
- `ESRCH` → 进程不存在，返回 false
- `ERR_INVALID_ARG_TYPE` → PID 超出平台范围（如超大值），返回 false
- `EPERM` / `EACCES` → 进程存在但无权限，保守返回 true

### 资源安全
- OUTER catch 已确保所有异常路径的 fd 释放
- 新增的 `readExistingPid` 使用 `readFileSync`（内部自动管理 fd）
- `isProcessAlive` 不分配任何资源

## 影响范围
- 仅修改 `packages/daemon-core/src/daemon/HandshakeManager.ts`
- 改动约 20 行，集中在 `enforceSingleInstance()` 方法
- `cleanup()` 方法不变
- 无需修改测试/配置/文档

## 技术栈
- Node.js / TypeScript
- 仅使用标准库（fs, fsSync）
