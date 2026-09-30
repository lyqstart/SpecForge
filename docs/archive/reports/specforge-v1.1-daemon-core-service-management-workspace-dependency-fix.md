# SpecForge v1.1 daemon-core service-management workspace dependency fix

## 结论

通过

## 修复内容

- daemon-core 显式声明 @specforge/service-management workspace 依赖。
- Daemon.ts 使用 @specforge/service-management 根入口导入 shutdown API。
- 修复 clean checkout / clean worktree 下 TypeScript 无法解析 workspace 内部包的问题。

## 已完成

- 分支检查通过
- 已接管上一轮预期残留改动：M bun.lock; M packages/daemon-core/package.json; ?? docs/reports/specforge-v1.1-daemon-core-service-management-workspace-dependency-fix.md
- 已为 daemon-core 声明 @specforge/service-management workspace 依赖
- Daemon.ts 已保持从 @specforge/service-management 根入口导入 shutdown API
- bun install 通过
- bun run build 通过
- P0 governance regression test 通过
- Skill governance policy test 通过
- git diff --check 通过

## 失败原因

- 无

## 验证项

- bun install
- bun run build
- P0 governance regression test
- Skill governance policy test
- git diff --check
