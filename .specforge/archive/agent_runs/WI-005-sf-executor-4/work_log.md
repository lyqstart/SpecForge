# Work Log: WI-005 TASK-4 — Daemon.ts 改项 1/2/3 组装重构

## 任务摘要
重构 Daemon.ts 构造函数，整合改项 1（消除独立 WAL）、改项 2（StateManager isDaemonGlobal）、改项 3（RecoverySubsystem 注入 WAL+StateManager）的所有组装变更。同时在 start() 方法中为 checkAndRepair() 添加 try/catch 回退保护。

## 执行过程

1. **读取配置文件**：读取 `.specforge/project-rules.md`（prod-environment.md 不存在）、`design_delta.md`（全量 632 行）、当前 `Daemon.ts`（300 行）
2. **读取依赖文件**：读取 `StateManager.ts`（确认 getWal() 和 isDaemonGlobal 已由 TASK-1/TASK-3 添加）、`RecoverySubsystem.ts`（确认构造函数已支持可选注入 wal/stateManager）
3. **应用 6 处代码修改**：
   - L44: 删除 `private wal: WAL;` 字段声明
   - L53: StateManager 构造改为 `new StateManager(pathResolver, pathResolver.resolveDaemonRuntimeDir(), true)`
   - L54: RecoverySubsystem 构造改为注入模式（带 fallback try/catch 获取 wal 和 stateManager）
   - L82: 删除 `this.wal = new WAL(path.join(runtimeDir, 'events.jsonl'))` 构造
   - L88: HTTPServer deps 中 `wal: this.wal` → `wal: this.stateManager.getWal()`
   - L136: `checkAndRepair()` 包裹 try/catch
4. **清理无用 import**：`import * as path from 'path'` 已无引用，删除
5. **验证编译**：`npx tsc --noEmit` — 仅存在 1 个 pre-existing TS2345 错误（EventBus persistence hook 类型不兼容），stash 后验证确认该错误在修改前就已存在
6. **验证单元测试**：`npx vitest run tests/unit/daemon.test.ts` — 首次因残留 handshake.json 超时，清理后 2/2 通过
7. **R7 检查**：无硬编码 IP/端口/绝对路径

## 遇到的问题

1. **首次测试超时**：因上一次测试遗留 handshake.json 文件导致端口锁定。清理文件后通过。
2. **Pre-existing TS 编译错误**：EventBus persistence hook 中 `Event` 类型与 observability 包的 `Event` 类型 `schema_version` 字段不兼容。已在 stash 前后对比确认不是本次引入。

## 最终结论

任务成功完成。6 处代码修改全部按 design_delta.md 规格执行，无偏差。

### 产出文件
- `packages/daemon-core/src/daemon/Daemon.ts` — 修改（6 处变更 + 1 处 import 清理）

### 变更明细
| # | 位置 | 变更 |
|---|------|------|
| 1 | 原 L44 | 删除 `private wal: WAL;` 字段 |
| 2 | 原 L53 | StateManager 构造加 `isDaemonGlobal=true` + `resolveDaemonRuntimeDir()` |
| 3 | 原 L54 | RecoverySubsystem 注入 WAL+StateManager（带 fallback） |
| 4 | 原 L82 | 删除独立 WAL 构造 |
| 5 | 原 L88 | HTTPServer wal 来源改为 `this.stateManager.getWal()` |
| 6 | 原 L136 | checkAndRepair() 包裹 try/catch |
| 7 | 原 L28 | 删除无用 `import * as path` |

## 工具调用统计
- read: 5 次（project-rules, design_delta, Daemon.ts, StateManager.ts, RecoverySubsystem.ts）
- edit: 7 次（6 处业务变更 + 1 处 import 清理）
- bash: 6 次（tsc 编译 ×3, vitest ×2, git stash/pop ×2）
- grep: 4 次（WAL 引用检查 ×2, R7 检查 ×2）
- sf_artifact_write: 1 次（本 work_log）
