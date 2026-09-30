# SpecForge v1.1.2 Real-World Batch 1 Main Integration Report

## 结论

PASS

## 分支

- main: main
- source: hardening/v1.1.2-real-world-batch1-fixes
- required tag: v1.1.1

## 本轮脚本经验继承

- 使用 Python，不再使用 PowerShell 编写复杂补丁脚本。
- observation 报告是失败证据，不能在补丁脚本中删除。
- telemetry.jsonl 是 tracked runtime residue，daemon/build/smoke 前后必须还原。
- 最终范围检查使用 diff --name-only、diff --cached --name-only、ls-files --others，不解析 status --porcelain 状态列。
- v1.1.2 合回 main 后，必须返回 trial/v1.1-real-world-observation 重新处理 Batch 1。

## 已完成

- 开始前 工作区干净
- main 对齐后 工作区干净
- v1.1.1 tag 存在
- 已合并补丁分支到 main：yc/hardening/v1.1.2-real-world-batch1-fixes
- bun run build 通过
- packages/daemon-core npx tsc 通过
- P0 governance regression test 通过
- Skill governance policy test 通过
- daemon runtime smoke 通过：已有 daemon 实例运行，且无 .d.ts/SPEC_DIR_NAME 错误
- git diff --check 通过

## 后续要求

- 本报告提交并 push main 后，下一步创建 v1.1.2 tag。
- v1.1.2 tag 完成后，必须回到 trial/v1.1-real-world-observation，合入 main/v1.1.2，重跑 Batch 1。
