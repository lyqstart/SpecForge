# Work Log — WI-005 TASK-3

## 任务摘要
修改 StateManager 构造函数，新增第三个参数 `isDaemonGlobal: boolean = false`，当为 `true` 时使用 `resolveDaemonEventsPath()` 和 `resolveDaemonStatePath()` 初始化 WAL 和 statePath，避免嵌套路径问题。

## 执行过程

1. **读取配置文件**：读取了 `.specforge/prod-environment.md`（不存在）、`.specforge/project-rules.md`（确认是 investigation 规则，但本次是 development task，按 task 指令执行）
2. **读取源码**：读取 `StateManager.ts`，确认构造函数位于 L47-L52，签名 `(pathResolver, projectPath)`
3. **读取 path-resolver.ts**：确认 `resolveDaemonStatePath()` 和 `resolveDaemonEventsPath()` 方法已存在于 IPathResolver 接口和两个实现类中（TASK-2 依赖已满足）
4. **读取现有测试**：读取 `tests/unit/state.test.ts`，了解测试结构和模式
5. **修改 StateManager.ts 构造函数**：
   - 签名从 `(pathResolver, projectPath)` 改为 `(pathResolver, projectPath, isDaemonGlobal = false)`
   - 构造函数体增加 if/else 分支：isDaemonGlobal 为 true 时用 daemon 路径，否则用 project 路径
   - `this.projectPath = projectPath` 保持不变
6. **添加测试**：新增 4 个测试用例覆盖 isDaemonGlobal 参数
7. **编译验证**：`npx tsc --noEmit` — 无 StateManager 相关错误（Daemon.ts:145 有一个预先存在的类型不兼容问题，与本次修改无关）
8. **单元测试验证**：`npx vitest run tests/unit/state.test.ts` — 17/17 全部通过

## 遇到的问题
- 编译时发现 `Daemon.ts:145` 有预先存在的 `Event.schema_version` 类型不兼容错误（`"1.0" | undefined` 不可赋值给 `"1.0"`），与本次修改完全无关
- sf_safe_bash 因 shell 不可用被拒绝，改用内置 bash 工具完成

## 最终结论
任务成功完成。

### 修改文件列表
1. `packages/daemon-core/src/state/StateManager.ts` — 构造函数签名 + 初始化逻辑
2. `packages/daemon-core/tests/unit/state.test.ts` — 新增 4 个测试用例

### 验证结果
- 编译：StateManager.ts 无编译错误 ✅（Daemon.ts 预存问题不影响）
- 单元测试：17/17 通过 ✅（含 4 个新增测试 + 13 个原有测试全部向后兼容）

## 工具调用统计
- read: 6 次（配置文件、源码、测试文件）
- edit: 2 次（StateManager.ts、state.test.ts）
- bash: 4 次（编译检查 ×2、单元测试 ×2）
- sf_artifact_write: 1 次（本日志）