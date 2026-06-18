# SpecForge v1.1 clean worktree build order fix

## 目标

修复干净 worktree 中 root build 并行构建导致内部 workspace 包尚未产出，进而使 CLI、daemon-core 等后置包找不到内部依赖的问题。

## 修复内容

1. root package.json 的 build 脚本改为：先渲染 workflow Skill 文档，再调用 scripts/build-workspace.ts。
2. scripts/build-workspace.ts 按确定顺序构建 workspace packages。
3. build-workspace 使用 process.execPath 调用当前 Bun 可执行文件，避免 Windows 下 Bun.spawnSync 直接调用字符串 bun 出现 ENOENT。
4. 验证范围包括 root build、P0 governance regression、Skill governance policy、git diff --check。

## 结论

以脚本最终输出为准。
