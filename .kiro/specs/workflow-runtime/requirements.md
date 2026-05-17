# Requirements Document

## Introduction

本 spec 承接 V6 架构概览 spec（v6-architecture-overview）中的 Property 29（compositeGate 语义），专门实现 workflow runtime 的核心能力。

**scopeTag: p0（基础）/ p1（组合）**
- p0：基础 workflow runtime 能力，包括状态机执行、Gate 基础执行、事件流转
- p1：组合能力，包括 compositeGate 语义、并行执行、失败策略

## Requirements

### Requirement 1: Workflow Runtime 基础能力

**User Story:** 作为 workflow 执行引擎，我希望能够加载和执行 workflow 定义，管理状态机转换。

#### Acceptance Criteria

1. THE Workflow_Runtime SHALL 能够加载 JSON 格式的 workflow 定义文件
2. THE Workflow_Runtime SHALL 维护 workflow 实例的状态机，支持状态转换
3. THE Workflow_Runtime SHALL 为每个 workflow 实例生成唯一标识符
4. THE Workflow_Runtime SHALL 记录 workflow 执行事件到 events.jsonl

### Requirement 2: Gate 执行引擎

**User Story:** 作为 Gate 执行者，我希望能够执行单个 Gate 并返回 GateResult。

#### Acceptance Criteria

1. THE Gate_Runner SHALL 能够加载和执行 Gate 定义
2. THE Gate_Runner SHALL 实现 `check()` 方法并返回 `GateResult`
3. THE Gate_Runner SHALL 支持 Gate 的同步知识图谱功能（可选）
4. THE Gate_Runner SHALL 记录 Gate 执行结果到事件日志

### Requirement 3: compositeGate 语义（p1）

**User Story:** 作为需要组合 Gate 的用户，我希望能够定义和执行 compositeGate，支持不同的执行模式和失败策略。

#### Acceptance Criteria

1. THE compositeGate_Runner SHALL 支持 `sequential` 和 `parallel` 两种执行模式
2. THE compositeGate_Runner SHALL 支持 `fail_fast` 和 `collect_all` 两种失败策略
3. WHEN `mode = sequential`，THE compositeGate_Runner SHALL 按顺序执行子 Gate
4. WHEN `mode = parallel`，THE compositeGate_Runner SHALL 并发执行子 Gate
5. WHEN `failPolicy = fail_fast` 且 `mode = parallel`，THE compositeGate_Runner SHALL 在任一子 Gate 失败时取消尚未完成的子 Gate 并返回失败
6. WHEN `failPolicy = collect_all`，THE compositeGate_Runner SHALL 完成所有子 Gate 后汇总失败原因

### Requirement 4: 事件系统集成

**User Story:** 作为可观测性系统，我希望 workflow runtime 的事件能够集成到 V6 的统一事件系统中。

#### Acceptance Criteria

1. THE Workflow_Runtime SHALL 将所有执行事件发布到 Event Bus
2. THE Workflow_Runtime SHALL 支持事件订阅机制
3. THE Workflow_Runtime SHALL 保证事件的有序性和一致性
4. THE Workflow_Runtime SHALL 支持从 events.jsonl 重建 workflow 状态

### Requirement 5: 错误处理与恢复

**User Story:** 作为可靠性要求高的用户，我希望 workflow runtime 能够处理执行错误并提供恢复机制。

#### Acceptance Criteria

1. THE Workflow_Runtime SHALL 处理 Gate 执行失败的情况
2. THE Workflow_Runtime SHALL 支持 workflow 实例的暂停和恢复
3. THE Workflow_Runtime SHALL 提供错误重试机制（可配置）
4. THE Workflow_Runtime SHALL 支持从崩溃中恢复 workflow 状态

## References

1. 父 spec: v6-architecture-overview
2. 承接 Property: Property 29（compositeGate 语义）
3. 相关 Requirements: 23, 24（来自父 spec）