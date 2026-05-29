# TASK-12 工作日志

## 任务摘要
增强插件 `sf_specforge.ts` 支持 `projectPath`、daemon 注册和 `shell.env` hook。

## 执行过程

### 1. 读取设计文档和现有代码
- 读取 `specforge/specs/WI-031/design_delta.md`，理解 DD-B7 和 DD-AB1 段的设计要求
- 读取 `.opencode-/plugins/sf_specforge.ts`，理解现有插件结构
- 读取 `packages/service-management/src/plugin/reconnecting-daemon-client.ts`，确认 `register()` 和 `getShellEnv()` 方法已就位（TASK-10）
- 读取 `tests/integration/plugin_startup.test.ts`，确认该测试测试的是旧版 init 逻辑，非本次修改目标

### 2. 实施修改
对 `.opencode-/plugins/sf_specforge.ts` 做了以下修改：

1. **projectPath 提取**：从 `input.directory` 提取 `projectPath`
2. **daemon 注册**：`try-catch` 包裹 `daemonClient.register(projectPath)`，成功保存 `sessionId`，失败记录 WARNING 并降级
3. **sessionId 传播**：所有 9 个 `postEvent()` 调用都追加了 `sessionId`
4. **shell.env hook**：新增 hook 调用 `daemonClient.getShellEnv(sessionId)` 并使用 `Object.assign(o.env, envVars)` 注入

### 3. 验证

#### TypeScript 编译检查
运行 `npx tsc --noEmit` 对插件文件进行类型检查，发现的错误均为预存问题：
- `TS5097`: `.ts` 扩展名导入（需 `allowImportingTsExtensions`）
- `TS2739`: `hot-reload.ts` 类型不完整
- `TS2308`: `config-merge` 重复导出

以上错误均在修改前已存在，不影响本次变更的正确性。

#### 集成测试
运行 `npx vitest run tests/integration/plugin_startup.test.ts`：
- 失败原因：import `../../.opencode/tools/lib/sf_specforge_plugin_entry` 模块不存在
- 该测试测试的是旧版 init 逻辑（`determineStartupMode`、`executeInitialize`），与本次修改的 daemon 插件无关

#### R7 合规检查
- 无硬编码 IP ✅
- 无硬编码端口 ✅
- 无硬编码绝对路径 ✅
- 无新依赖声明 ✅

### 4. 最终结论
TASK-12 修改完成：
- ✅ 插件启动时从 `input.directory` 提取 `projectPath`
- ✅ 调用 `daemonClient.register(projectPath)` 获取 `sessionId`
- ✅ daemon 不可达时降级运行（sessionId 为空字符串）
- ✅ 所有 `postEvent` 调用附带 `sessionId`
- ✅ `shell.env` hook 注册并调用 `daemonClient.getShellEnv()`
- ✅ daemon 不可达时 `getShellEnv` 返回空对象 `{}`（daemonClient 已实现）
- ✅ 无新增类型错误（预存 `tsc` 错误与本次修改无关）

### 5. 工具调用统计
- read: 8 次
- glob: 5 次
- edit: 1 次
- grep: 3 次
- sf_safe_bash: 3 次
- sf_artifact_write: 1 次
