# LockManager 实现文档

## 概述

`LockManager` 是一个基于 `proper-lockfile` 的文件锁管理器，用于防止多个 `specforge init` 进程并发执行。

## 设计约束

本实现严格遵守以下编码规范：

### async-resource-coding-standards

- **C1**: `Promise.race` 超时时在 `finally` 中 `clearTimeout` 败者 timer
- **JS1**: 构造器只赋值依赖句柄，不做 I/O
- **JS2**: 实现 `Symbol.asyncDispose` 接口
- **JS3**: `acquire/release` 必须配对使用 `try/finally`

### lessons-injected

- **P5/X2**: 提供 `getActiveLockCount()` 自检 API，副作用必须可检测
- **T1**: 测试中使用动态追踪列表清理资源

## 核心特性

### 1. 锁文件路径

- 默认路径：`~/.specforge/.init.lock`
- 可通过构造函数自定义

### 2. 锁文件元数据

锁文件包含以下元数据（JSON 格式）：

```json
{
  "pid": 12345,
  "hostname": "my-computer",
  "timestamp": "2026-05-19T12:34:56.789Z"
}
```

### 3. 超时机制

- `acquire(timeoutMs)` 支持超时参数
- 超时返回 `false`，不抛错
- 使用 `Promise.race` + `clearTimeout` 实现

### 4. 幂等性

- `release()` 可在未 `acquire` 时调用，不抛错
- 多次 `release()` 不会出错
- 已持有锁时再次 `acquire()` 立即返回 `true`

### 5. AsyncDisposable 支持

支持 TypeScript 5.2+ 的 `await using` 语法：

```typescript
await using lock = new DefaultLockManager(lockPath);
await lock.acquire(5000);
// ... 使用锁保护的资源
// 离开作用域自动释放
```

## 使用示例

### 基本用法

```typescript
import { createLockManager } from "./utils/lock-manager.js";

const lock = createLockManager("~/.specforge");

try {
  const acquired = await lock.acquire(5000); // 5 秒超时
  if (!acquired) {
    console.error("Failed to acquire lock (timeout)");
    process.exit(2);
  }

  // ... 执行需要锁保护的操作

} finally {
  await lock.release();
}
```

### 使用 await using 语法

```typescript
import { createLockManager } from "./utils/lock-manager.js";

await using lock = createLockManager("~/.specforge");

const acquired = await lock.acquire(5000);
if (!acquired) {
  console.error("Failed to acquire lock (timeout)");
  process.exit(2);
}

// ... 执行需要锁保护的操作
// 离开作用域自动释放
```

## 技术细节

### proper-lockfile 配置

使用以下配置确保跨平台兼容性：

```typescript
{
  retries: {
    retries: Math.floor(timeoutMs / 100),
    minTimeout: 100,
    maxTimeout: 100,
  },
  stale: 30000, // 30 秒后认为锁过期
  realpath: false, // Windows 兼容性
}
```

### copyFile + unlink 模式

`proper-lockfile` 使用 `copyFile + unlink` 而非 `rename`，避免 Windows 上的 EPERM 错误（与 `scripts/sync-task-status.ts` 同款策略）。

## 测试覆盖

单元测试覆盖以下场景：

1. ✅ 成功获取锁
2. ✅ 超时返回 false
3. ✅ 第一个释放后第二个可获取
4. ✅ 未 acquire 时 release 幂等
5. ✅ 多次 release 幂等
6. ✅ Symbol.asyncDispose 支持
7. ✅ await using 语法支持
8. ✅ 锁文件元数据正确
9. ✅ 自动创建锁目录
10. ✅ 已持有锁时再次 acquire 返回 true
11. ✅ createLockManager 工厂函数

## 依赖

- `proper-lockfile`: ^4.1.2
- `@types/proper-lockfile`: ^4.1.4

## 相关文件

- 实现：`packages/cli/src/utils/lock-manager.ts`
- 测试：`packages/cli/tests/unit/lock-manager.test.ts`
- 导出：`packages/cli/src/utils/index.ts`

## Requirements 映射

- **REQ-3.9**: 锁文件路径 `~/.specforge/.init.lock`
- **REQ-3.9**: 锁文件元数据 `{ pid, hostname, timestamp }`
- **REQ-3.9**: 并发第二个 init 退出码 2 + stderr 含锁路径（由调用方实现）

## 注意事项

1. **构造器无副作用**：`new DefaultLockManager(lockPath)` 不会创建文件或目录
2. **acquire 前自动创建目录**：`acquire()` 会自动创建锁文件的父目录
3. **超时不抛错**：超时返回 `false`，由调用方决定如何处理
4. **测试必须清理**：测试的 `afterEach` 必须断言 `getActiveLockCount() === 0`
