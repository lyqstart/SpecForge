# Intake: 修复 events.jsonl/state.json 并发写入一致性问题

## Bug 概述
基于 INV-001 调查结论，Daemon 中多个组件通过不同文件句柄写入相同的用户级运行时文件，存在竞态条件、数据损坏和一致性风险。

## 当前行为（缺陷）
1. **C1 — events.jsonl 双写竞态**：WAL (daemon-core) 和 EventLogger (observability) 通过独立文件句柄写入同一文件，WAL rotation 时出现事件丢失窗口
2. **C2 — state.json 三重覆写**：StateManager、EventLogger、RecoverySubsystem 都用 fs.writeFile() 全量覆写，Last-Write-Wins 无锁保护
3. **C3 — RecoverySubsystem 错误路径**：使用嵌套遗留路径 `~/.specforge/runtime/.specforge/runtime/state.json` 而非用户级路径
4. **C4 — Event 类型不兼容**：daemon-core Event (actor?:string) 与 observability Event (actor:AgentIdentity|null) 字段级不兼容，运行时 as unknown as 强制转换
5. **C5 — EventLogger 未初始化**：Daemon.start() 从未调用 eventLogger.initialize()
6. **M2 — 重复事件写入**：EventBus persistenceHook 导致每条状态转换被写入两次

## 预期行为
1. events.jsonl 有唯一写入者，所有事件通过统一路径持久化
2. state.json 写入有并发保护（版本号/乐观锁），不会静默覆盖
3. RecoverySubsystem 使用正确的用户级路径
4. 两个包的 Event 类型兼容或通过适配层转换
5. EventLogger 在 Daemon 启动时正确初始化
6. 无重复事件写入

## 不变行为
- WAL 的创建、读取、回放功能不受影响
- StateManager 的状态转换逻辑不受影响
- EventBus 的 pub/sub 路由功能不受影响
- RecoverySubsystem 的一致性检查和修复逻辑不受影响
- 现有的 HTTP API 和工具处理器行为不变

## 根因（来自 INV-001）
Daemon.ts 中 StateManager(isDaemonGlobal=true) 和 EventLogger(basePath=runtimeDir) 被配置为操作完全相同的两个文件路径，但设计上分属不同层次（WAL=持久化层，EventBus=通信层），缺乏统一的写入协调机制。

## 参考
- 完整调查报告：`.specforge/specs/INV-001/findings_report.md`
- 相关源码：WAL.ts, StateManager.ts, EventLogger/index.ts, RecoverySubsystem.ts, Daemon.ts, types.ts