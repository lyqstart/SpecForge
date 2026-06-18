# SpecForge v1.1.2 真实使用观察 Batch 1 复测准备报告

## 结论

PASS：已将 v1.1.2 合入 observation 分支，并准备 quick_change / feature_spec / bugfix_spec 三个复测场景。

## 本轮纠错经验

- 发布动作能合并就合并，不能无意义拆小步。
- observation 失败报告是证据，不能删除。
- v1.1.2 只是 close_gate 容错修复，后续仍必须根治 daemon 状态唯一真相源问题。
- validator 必须检查业务文件本身，不能从 .specforge 文档误判 marker。
- validator 必须检查 work_item.json 与 runtime/state.json 是否都进入 closed。

## 基线

- baseline tag：v1.1.2
- observation branch：trial/v1.1-real-world-observation
- userlevel root：C:\Users\luo\.config\opencode
- synchronized userlevel assets：98

## 仓库外复测目录

`C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun`

## 复测场景

### 01_quick_change：quick_change 最小改动复测

- 项目目录：`C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun\quick-change-project`
- Prompt：`C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun\01-quick-change-prompt.txt`

### 02_feature_spec：feature_spec 小功能复测

- 项目目录：`C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun\feature-spec-project`
- Prompt：`C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun\02-feature-spec-prompt.txt`

### 03_bugfix_spec：bugfix_spec 小缺陷复测

- 项目目录：`C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun\bugfix-spec-project`
- Prompt：`C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun\03-bugfix-spec-prompt.txt`

## 后续执行

1. 打开 `C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun\README_RUN_ORDER.md`，按顺序运行三个 OpenCode 场景。
2. 三个场景完成后运行 `C:\Users\luo\AppData\Local\Temp\SpecForge_v112_real_world_observation_batch1_rerun\validate_after_opencode.py`。
3. 验证通过后提交 result report。

