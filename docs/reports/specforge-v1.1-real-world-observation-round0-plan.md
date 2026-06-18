# SpecForge v1.1 真实使用观察 Round 0 计划

生成时间：2026-06-18 11:26:35 +08:00

当前分支：trial/v1.1-real-world-observation
当前 HEAD：d72592b0fe113aba174d59601d41e6735cff7d81
正式发布 tag：v1.1-final
正式发布 tag commit：7a211837b2fd03cb2b4d7d7bd7edbd18a9dd14c4

## 1. 阶段定位

v1.1-final 已完成封版。本阶段不再改 v1.1-final，不移动历史 tag，不直接在 main 上补丁式开发。

本阶段目标是用 v1.1-final/main 最终集成结果进行真实 OpenCode 使用观察，识别测试无法覆盖的真实安装、调用、流程、提示、状态闭环问题。

## 2. 观察分支

观察分支：trial/v1.1-real-world-observation

该分支只用于记录真实使用观察，不承载大规模功能开发。如果发现真实 bug，应另开 hardening/v1.1.1-patch 分支处理。

## 3. Round 0 已完成的基线检查

- 已确认工作区干净。
- 已确认 tag v1.1-final 存在。
- 已确认 main 包含 v1.1-final。
- 已创建或切换到真实使用观察分支。
- 已执行 bun run build。
- 已执行 P0 governance regression test。
- 已执行 Skill governance policy test。

## 4. Round 1 真实使用观察清单

### 4.1 安装与加载

- 在真实 OpenCode 用户配置环境中安装 SpecForge。
- 确认 plugin 能被 OpenCode 加载。
- 确认 userlevel tools 可见。
- 确认 8 个 workflow skills 可见。
- 确认 agents 可见。

### 4.2 最小工作项链路

- 创建一个最小 WI。
- 执行 quick_change。
- 观察 orchestrator 是否按 workflow skill 行为流转。
- 观察状态文件、事件文件、报告文件是否一致。

### 4.3 规格变更链路

- 执行一次 feature_spec 或 bugfix_spec。
- 观察 candidate gate、user approval、merge、code_permission、verification、close_gate 是否闭环。
- 特别确认 sf-orchestrator 不能伪造 user_approved。

### 4.4 失败路径

- 制造一个 gate failed 场景。
- 确认 failed / gates_running 阶段不能进入 user_approved。
- 确认错误信息能告诉用户下一步该做什么。

### 4.5 体验问题

记录以下问题：

- 哪一步用户最不理解。
- 哪个错误信息不清楚。
- 哪个 tool/skill 调用不稳定。
- 是否出现状态卡住。
- 是否出现测试未覆盖但真实使用影响效率的问题。

## 5. 记录模板

| 编号 | 场景 | 操作 | 预期 | 实际 | 证据路径 | 结论 | 后续处理 |
|---|---|---|---|---|---|---|---|
| OBS-001 | 安装加载 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |
| OBS-002 | quick_change | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |
| OBS-003 | feature_spec/bugfix_spec | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |
| OBS-004 | gate failed | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 | 待填写 |

## 6. 后续分支策略

如果真实观察发现 bug：

`powershell
cd D:\code\temp\SpecForge
git checkout main
git pull yc main
git checkout -b hardening/v1.1.1-patch
`

如果进入 v1.2 规划：

`powershell
cd D:\code\temp\SpecForge
git checkout main
git pull yc main
git checkout -b roadmap/v1.2-planning
`

## 7. 禁止事项

- 不移动 v1.1-final。
- 不删除历史 tag。
- 不在观察分支上做大规模功能开发。
- 不把真实使用问题混入 v1.2 规划。
- v1.1.1 只修真实使用暴露的缺陷。
