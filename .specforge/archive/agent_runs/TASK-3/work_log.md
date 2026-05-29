# TASK-3 执行日志: daemon-core daemon/ + handlers/ 路径切换

## 任务目标
将 4 个文件中的硬编码 `.specforge` 路径字符串替换为 `@specforge/types/directory-layout` 导出的常量和函数。

## 修改摘要

### 文件 1: packages/daemon-core/src/daemon/path-resolver.ts (5 处)
- **Import 添加**: `SPEC_DIR_NAME`, `resolveProjectPath`, `USER_LAYOUT`, `resolveUserPath` from `@specforge/types/directory-layout`
- `path.join(projectPath, '.specforge', 'runtime')` → `resolveProjectPath(projectPath, 'runtime')` (PersonalPathResolver.resolveProjectRuntimeDir)
- `path.join(os.homedir(), '.specforge', 'runtime')` → `resolveUserPath('runtime')` (PersonalPathResolver.resolveDaemonRuntimeDir)
- `path.join(os.homedir(), '.specforge', 'projects', hash)` → `resolveUserPath('projects', hash)` (EnterprisePathResolver.resolveProjectRuntimeDir)
- `path.join(os.homedir(), '.specforge', 'runtime')` → `resolveUserPath('runtime')` (EnterprisePathResolver.resolveDaemonRuntimeDir)
- JSDoc 更新: `.specforge/` → `${SPEC_DIR_NAME}/` / `${SPEC_USER_DIR_NAME}/`

### 文件 2: packages/daemon-core/src/daemon/Daemon.ts (2 处)
- **Import 添加**: `SPEC_DIR_NAME` from `@specforge/types/directory-layout`
- `path.join(runtimeDir, '.specforge', 'runtime', 'state.json')` → `path.join(runtimeDir, SPEC_DIR_NAME, 'runtime', 'state.json')`
- `path.join(runtimeDir, '.specforge', 'runtime', 'events.jsonl')` → `path.join(runtimeDir, SPEC_DIR_NAME, 'runtime', 'events.jsonl')`

### 文件 3: packages/daemon-core/src/daemon/HandshakeManager.ts (1 处 JSDoc)
- JSDoc 更新: `~/.specforge/runtime/daemon.lock` → `resolveUserPath('runtime')/daemon.lock`

### 文件 4: packages/daemon-core/src/tools/handlers/sf-state-transition.ts (2 处)
- **Import 添加**: `SPEC_DIR_NAME`, `resolveProjectPath` from `@specforge/types/directory-layout`
- `join(baseDir, '.specforge', 'manifest.json')` → `resolveProjectPath(baseDir, 'manifest')`
- 错误消息硬编码 `.specforge/manifest.json` → `${SPEC_DIR_NAME}/manifest.json`

## 验证结果

### bun test packages/daemon-core/
- 全部测试通过 (exitCode: 0)
- Daemon startup/shutdown 性能测试通过
- Types 测试全部通过

### 硬编码残留扫描
- 4 个文件中 grep `'.specforge'` → 0 匹配
- Daemon.ts 中仅剩 JSDoc 注释内的 `${SPEC_DIR_NAME}` 引用（合法）

## 自检
- R1: 无硬编码配置 — ✅ 通过
- R2: 无硬编码端口 — ✅ 不涉及
- R3: 无硬编码绝对路径 — ✅ 通过
- R4: 新依赖已声明 — ✅ @specforge/types 已在 monorepo 内
- R5: 最小改动 — ✅ 仅替换路径字符串，无格式/风格变更
