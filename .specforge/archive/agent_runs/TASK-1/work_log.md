# WI-011 TASK-1 执行日志

## 任务
扩展 directory-layout.ts 用户级路径 Schema

## 修改文件
1. `packages/types/src/directory-layout.ts` — 新增 107 行（原 281 行 → 385 行）
2. `packages/types/tests/directory-layout.test.ts` — 新增 93 行（原 265 行 → 357 行）

## 变更摘要
### directory-layout.ts
- 新增 `import * as os from 'node:os'`
- 新增 `SPEC_USER_DIR_NAME` 常量（= '.specforge'）
- 新增 `USER_LAYOUT` 常量（10 个 key：runtime, runtimeHandshake, runtimeState, runtimeEvents, runtimeDaemonLock, hostProfile, logs, projects, templates, backups）
- 新增 `UserLayoutKey` 类型
- 新增 `resolveUserPath()` 函数

### directory-layout.test.ts
- 新增 import：SPEC_USER_DIR_NAME, USER_LAYOUT, resolveUserPath, UserLayoutKey
- 新增 `SPEC_USER_DIR_NAME` describe（2 tests）
- 新增 `USER_LAYOUT` describe（11 tests — 每个 key 1 个 + 全 key 遍历）
- 新增 `resolveUserPath()` describe（3 tests）

## 验证命令
```bash
bun test packages/types/
```
结果：exitCode=0，所有测试通过（原有测试 + 新增 16 个测试全部 pass）

## 导出验证
```
SPEC_USER_DIR_NAME: .specforge
USER_LAYOUT keys: runtime, runtimeHandshake, runtimeState, runtimeEvents, runtimeDaemonLock, hostProfile, logs, projects, templates, backups
resolveUserPath(hostProfile): C:\Users\luo\.specforge\host-profile.json
resolveUserPath(projects, hash123): C:\Users\luo\.specforge\projects\hash123
resolveUserPath(runtime): C:\Users\luo\.specforge\runtime
```

## R7 自检
- 硬编码 IP：无 ✅
- 硬编码端口：无 ✅
- 硬编码绝对路径：无 ✅
- 新依赖：无（仅使用 node:os，Node.js 内置模块）✅
