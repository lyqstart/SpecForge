# Work Log — WI-005 TASK-6

## 任务摘要

在 Daemon.ts 的 `start()` 方法中，`stateManager.initialize()` 之前，添加旧嵌套路径检测和处理逻辑。检测 `~/.specforge/runtime/.specforge/runtime/state.json` 和 `~/.specforge/runtime/.specforge/runtime/events.jsonl` 是否存在，如存在则合并/标记孤儿。

## 执行过程

1. **读取配置文件**：读取 `.specforge/project-rules.md`（investigation 约束，本次 development 任务可忽略其"不修改业务代码"约束）、`.specforge/specs/WI-005/design_delta.md` 了解详细设计。

2. **读取现有代码**：
   - `packages/daemon-core/src/daemon/Daemon.ts`（312 行）— 已被先前 TASK-5 修改，包含改项 1-4 的变更
   - `packages/daemon-core/src/daemon/DaemonConfig.ts` — 理解 `getRuntimeDir()` 返回值
   - `packages/daemon-core/src/daemon/path-resolver.ts` — 确认 `resolveDaemonRuntimeDir()` 返回 `~/.specforge/runtime`
   - `tests/unit/daemon.test.ts` — 理解现有测试模式

3. **实施变更**：
   - 添加 `import * as fs from 'fs/promises'`（path 已有导入）
   - 添加 `detectAndHandleLegacyState(runtimeDir: string)` 私有方法：
     - 检测旧嵌套 state.json → 仅打 warn 日志，保留文件
     - 检测旧嵌套 events.jsonl → 读取、去重（按 eventId）、合并到 canonical 路径、重命名为 .orphaned
   - 在 `start()` 中 `stateManager.initialize()` 前调用 `this.detectAndHandleLegacyState(this.config.getRuntimeDir())`

4. **修正编译问题**：发现 `start()` 方法中 `runtimeDir` 是构造函数的局部变量，不可直接引用。改用 `this.config.getRuntimeDir()` 获取。

5. **编译验证**：`npx tsc --noEmit` — 有一个预存在的类型错误（line 161 eventLogger.append 类型不匹配），与本次变更无关。

6. **单元测试**：`npx vitest run tests/unit/daemon.test.ts` — 2/2 通过。

## 遇到的问题

1. **`runtimeDir` 作用域问题**：`runtimeDir` 是 `constructor()` 的局部变量，在 `start()` 中不可用。解决：使用 `this.config.getRuntimeDir()` 替代。

2. **预存在的编译错误**：`tsc --noEmit` 报 line 161 类型错误（`eventLogger.append(event)` 的 `schema_version` 类型不匹配），这是先前 TASK 改了类型定义但未修复此调用点导致的，不在本 TASK 范围内。

## 最终结论

**任务完成**。所有变更仅涉及 `packages/daemon-core/src/daemon/Daemon.ts`。

### 产出文件列表
- `packages/daemon-core/src/daemon/Daemon.ts` — 新增 `detectAndHandleLegacyState()` 方法 + `start()` 中调用

### 验证结果
- 编译：1 个预存在的类型错误（非本 TASK 引入）
- 单元测试：2/2 通过

## 工具调用统计
- read: 6 次（Daemon.ts, DaemonConfig.ts, design_delta.md, project-rules.md, daemon.test.ts, Daemon.ts 验证）
- edit: 3 次（添加 imports, 添加方法, 添加调用）
- grep: 5 次（检查现有 imports, runtimeDir 用法, path 用法, R7 检查）
- bash: 7 次（tsc 编译, vitest 测试, git diff, git show, 检查等）
- glob: 1 次（查找测试文件）
