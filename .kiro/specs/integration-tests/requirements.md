# W3 集成测试需求

## 概述

W3 目标：在 W2 所有模块完成的基础上，进行跨模块集成联调，验证端到端场景，达成 V6.0 发版的核心质量门槛。

## 需求列表

### REQ-W3-1: feature_spec 端到端集成测试

WHEN 用户发起 feature_spec workflow 请求
THE system SHALL 完整执行 requirements → design → tasks → verification 四个 Gate
AND 每个 Gate 的状态转换必须被 Event Bus 记录
AND workflow 实例状态必须持久化到 WAL

**验收标准**：
- AC-1: WorkflowEngine 能加载 feature_spec workflow 定义
- AC-2: 四个 Gate 按顺序执行（RequirementsGate → DesignGate → TasksGate → VerificationGate）
- AC-3: 每个 Gate 执行产生对应的 workflow 事件
- AC-4: workflow 实例状态可从 WAL 恢复

### REQ-W3-2: 崩溃恢复集成测试（10 次随机 kill）

WHEN daemon 进程在 workflow 执行中途被强制终止
THE system SHALL 在重启后从 WAL 恢复 workflow 状态
AND 不丢失任何已提交的事件数据
AND 恢复后的 workflow 可继续执行

**验收标准**：
- AC-1: 10 次随机 kill 测试全部通过（0 数据丢失）
- AC-2: WAL 写入顺序正确（先 events.jsonl fsync → 再 state.json）
- AC-3: 恢复后 workflow 状态与 kill 前一致

### REQ-W3-3: 跨模块集成验证

WHEN 各模块协同工作
THE system SHALL 保证 permission-engine 权限检查在 workflow 执行前生效
AND observability 模块记录所有 workflow 事件到 CAS
AND scope-gate 验证 P1/P2 能力默认关闭

**验收标准**：
- AC-1: workflow 执行前权限检查通过
- AC-2: 事件写入 observability CAS 存储
- AC-3: scope-gate 拦截 P1/P2 能力调用

### REQ-W3-4: OpenClaw 模拟集成测试

WHEN 使用 OpenClaw 模拟器发起 spec 创建请求
THE system SHALL 通过 CLI 接口接收请求
AND 返回 jobId 供异步轮询
AND 最终返回完整的 spec 创建结果

**验收标准**：
- AC-1: CLI `--json` 模式返回 jobId
- AC-2: webhook 回调正确触发
- AC-3: 端到端流程在 60 秒内完成
