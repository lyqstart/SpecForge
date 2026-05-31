# Intake: events.jsonl / state.json 并发写入一致性调查

## 调查目标
分析 `packages/daemon-core` 和 `packages/observability` 两个包中多个组件（WAL、EventLogger、StateManager、RecoverySubsystem）通过不同文件句柄同时写入 `~/.specforge/runtime/events.jsonl` 和 `~/.specforge/runtime/state.json` 是否存在竞态条件、数据损坏或一致性风险。

## 调查背景
- 上一轮分析发现：events.jsonl 被 WAL 和 EventLogger 同时写入；state.json 被 StateManager、EventLogger、RecoverySubsystem 三个组件全量覆写
- 最近提交 `307f873` (2026-05-30) 刚修复了 fsync 阻塞事件循环的问题，涉及 WAL、StateManager、RecoverySubsystem
- 用户指出项目级 `.specforge/runtime/` 下的这两个文件尚未生成

## 调查范围
- **包含**：代码逻辑层面的静态分析，检查所有写入路径、文件句柄管理、序列化格式一致性、竞态窗口
- **包含**：最近两天（2026-05-29 ~ 2026-05-31）的相关 Git 变更分析
- **包含**：项目级 `.specforge/runtime/state.json` / `events.jsonl` 的生成逻辑
- **不包含**：运行时并发测试、性能测试

## 调查方法
- 逐文件读取四个核心源文件的完整内容
- 追踪所有 writeFile / appendFile / fileHandle.write 调用路径
- 分析 Daemon.ts 中的初始化和连线逻辑
- 检查 Git diff 了解近期变更意图

## 期望产出
结构化风险分析报告，含：
- 每个写入路径的详细分析
- 竞态条件识别与风险等级评估
- 格式一致性验证
- 修复建议（如有问题）
- 项目级文件生成状态说明

## 时间约束
无硬性时间限制，基于代码分析完成即可。