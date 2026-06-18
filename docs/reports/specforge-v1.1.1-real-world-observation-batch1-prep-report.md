# SpecForge v1.1.1 真实使用观察 Batch 1 准备报告

## 结论

PASS：已合并准备 quick_change / feature_spec / bugfix_spec 三个真实观察场景。

## 本轮继承的脚本经验

- 继续使用 Python，不再用 PowerShell 写复杂脚本。
- 文件系统操作统一基于 REPO_ROOT / relative_path，不依赖脚本当前目录。
- daemon / build / smoke 产生的 telemetry.jsonl 必须前后还原。
- 仓库只保留报告，观察运行项目和日志放到仓库外 %TEMP%。
- 本轮按用户要求加快进度，把 quick_change、feature_spec、bugfix_spec 合并为一个观察批次。

## 基线

- baseline tag：v1.1.1
- observation branch：trial/v1.1-real-world-observation
- userlevel root：C:\Users\luo\.config\opencode
- synchronized userlevel assets：96

## 仓库外观察目录

`C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1`

## 三个合并观察场景

### 01_quick_change：quick_change 最小改动观察

- 项目目录：`C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1\quick-change-project`
- Prompt：`C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1\01-quick-change-prompt.txt`

### 02_feature_spec：feature_spec 小功能观察

- 项目目录：`C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1\feature-spec-project`
- Prompt：`C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1\02-feature-spec-prompt.txt`

### 03_bugfix_spec：bugfix_spec 小缺陷观察

- 项目目录：`C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1\bugfix-spec-project`
- Prompt：`C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1\03-bugfix-spec-prompt.txt`

## 后续执行

1. 打开 `C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1\README_RUN_ORDER.md`，按顺序运行三个 OpenCode 场景。
2. 三个场景完成后运行 `C:\Users\luo\AppData\Local\Temp\SpecForge_v111_real_world_observation_batch1\validate_after_opencode.py`。
3. 验证通过后提交 result report。

