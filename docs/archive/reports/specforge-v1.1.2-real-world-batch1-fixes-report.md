# SpecForge v1.1.2 Real-World Batch 1 Fixes Report

## 结论

PASS

## 本轮继承的脚本经验

- 继续使用 Python，不再用 PowerShell 写复杂脚本。
- 所有文件操作都使用 REPO_ROOT / relative_path，不依赖当前目录。
- 运行产物污染 Git 工作区的问题已多次发生，必须前后还原 telemetry。
- observation 分支先保留；v1.1.2 补丁完成后必须返回 trial/v1.1-real-world-observation 处理 Batch 1。
- observation Batch 1 报告是失败证据，不能删除；必须先提交到 observation 分支或 stash。
- 能合并处理就合并处理：本轮同时处理 close_gate 状态滞后和 trace_delta 受控镜像。
- 跨分支切换时，只能删除本脚本自己的失败报告；不能删除其他流程的证据报告。
- AU v3 暴露了 status --porcelain 解析错误：不能 strip 掉前导状态列；范围检查改用 git diff --name-only / git ls-files --others。

## Batch 1 失败根因

1. quick_change/typo quick_change 代码和证据完成，但 runtime/state.json 与 work_item.json 仍停在 created，close_gate 因状态镜像滞后拒绝关闭。
2. feature_spec 中 candidate_manifest 指向 candidates/trace_delta.md，但 sf_artifact_write 只把 trace_delta 写到 WI 根和 specs，导致 Agent 试图用 sf_safe_bash 复制 WI 产物并触发 hard_stop。
3. bugfix 观察 prompt 被合理路由为 quick_change，后续 observation 回归需要换一个真正 bugfix_spec prompt。

## 本轮修复

- `sf-v11-close-gate.ts`：在 runCloseGate 全证据校验仍然生效的前提下，允许 evidence-complete 的 created/candidate_* 状态作为状态镜像滞后修复入口，避免 close 死锁。
- `sf-artifact-write.ts`：`trace_delta.md` 通过受控工具写入时自动镜像到 `candidates/trace_delta.md`，禁止 Agent 为修正候选路径再用 shell 写 `.specforge/work-items`。

## 已完成

- 已删除未跟踪文件：docs/reports/specforge-v1.1.2-real-world-batch1-fixes-report.md（AU v4 前置遗留报告）
- 当前已在补丁分支：hardening/v1.1.2-real-world-batch1-fixes
- v1.1.1 tag 存在
- 补丁前 工作区仅包含允许变更
- close_gate 状态滞后修复已存在，跳过重复修改
- trace_delta candidate mirror 修复已存在，跳过重复修改
- bun run build 通过
- packages/daemon-core npx tsc 通过
- git diff --check 通过
