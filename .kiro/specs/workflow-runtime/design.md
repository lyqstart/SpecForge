# Design Document

## Overview

本设计文档描述 workflow runtime 的实现方案，专门实现 compositeGate 语义（Property 29）以及相关的基础 workflow 执行能力。

## Architecture

### 核心组件

1. **WorkflowEngine**
   - 负责加载和执行 workflow 定义
   - 管理 workflow 实例的生命周期
   - 维护状态机转换

2. **GateRunner**
   - 负责执行单个 Gate
   - 实现 `check()` 方法
   - 支持同步知识图谱功能

3. **CompositeGateRunner** (p1)
   - 负责执行 compositeGate
   - 支持 `sequential` 和 `parallel` 模式
   - 支持 `fail_fast` 和 `collect_all` 失败策略

4. **EventPublisher**
   - 负责将 workflow 事件发布到 Event Bus
   - 保证事件的有序性和一致性

### 数据模型

```typescript
interface WorkflowDefinition {
  id: string;
  displayName: string;
  intent: string;
  stateMachine: StateMachine;
  artifacts: ArtifactDefinition[];
}

interface StateMachine {
  initial: string;
  states: Record<string, WorkflowState>;
}

interface WorkflowState {
  agent: string;
  gate: GateDefinition;
  skills: string[];
  next?: string | Record<string, string>;
}

interface GateDefinition {
  type: 'simple' | 'composite';
  id: string;
  // 其他 Gate 特定字段
}

interface CompositeGateDefinition extends GateDefinition {
  type: 'composite';
  mode: 'sequential' | 'parallel';
  failPolicy: 'fail_fast' | 'collect_all';
  children: GateDefinition[];
}

interface GateResult {
  passed: boolean;
  reason?: string;
  details?: Record<string, any>;
}

interface WorkflowInstance {
  id: string;
  workflowId: string;
  currentState: string;
  history: WorkflowEvent[];
  createdAt: Date;
  updatedAt: Date;
}
```

## Implementation Details

### WorkflowEngine 实现

WorkflowEngine 负责：
1. 从文件系统加载 workflow 定义
2. 创建和管理 workflow 实例
3. 执行状态转换
4. 与 Agent 系统集成

### GateRunner 实现

GateRunner 负责：
1. 加载和执行 Gate 定义
2. 调用 `check()` 方法
3. 处理 Gate 执行结果
4. 可选地同步知识图谱

### CompositeGateRunner 实现 (p1)

CompositeGateRunner 是 GateRunner 的特殊实现，负责：
1. 按指定模式执行子 Gate
2. 管理子 Gate 的执行顺序和并发
3. 根据失败策略处理子 Gate 失败
4. 汇总执行结果

#### 执行模式
- **sequential**: 按顺序执行子 Gate，前一个完成后才开始下一个
- **parallel**: 并发执行所有子 Gate

#### 失败策略
- **fail_fast**: 任一子 Gate 失败立即停止执行并返回失败
- **collect_all**: 执行所有子 Gate 后汇总结果

### 事件系统集成

所有 workflow 执行事件通过 EventPublisher 发布到 Event Bus，包括：
1. Workflow 实例创建事件
2. 状态转换事件
3. Gate 执行开始/结束事件
4. 错误事件

## Correctness Properties

### Property 1: Workflow State Machine Consistency

*For all* workflow 实例 w，其状态转换必须遵循 workflow 定义中的 state machine 规则。

**Validates: Requirements 1.2**

### Property 2: Gate Execution Determinism

*For all* Gate g 和相同输入，`g.check()` 必须返回相同结果（假设无外部状态变化）。

**Validates: Requirements 2.2**

### Property 3: Composite Gate Sequential Execution

*For all* compositeGate g 且 `mode = sequential`，子 Gate 必须按定义顺序执行。

**Validates: Requirements 3.3**

### Property 4: Composite Gate Parallel Execution

*For all* compositeGate g 且 `mode = parallel`，子 Gate 必须并发执行。

**Validates: Requirements 3.4**

### Property 5: Fail Fast with Parallel Mode

*For all* compositeGate g 且 `mode = parallel` 且 `failPolicy = fail_fast`，当任一子 Gate 失败时，必须取消尚未完成的子 Gate。

**Validates: Requirements 3.5**

### Property 6: Event Ordering

*For all* workflow 实例 w，其事件必须按时间顺序记录，且事件顺序反映实际执行顺序。

**Validates: Requirements 4.3**

## Error Handling

### Gate 执行失败
- 记录详细错误信息到事件日志
- 根据 workflow 定义决定下一步操作（重试、失败、暂停）

### Workflow 状态不一致
- 检测状态不一致时暂停 workflow
- 提供修复工具或手动干预接口

### 资源不足
- 监控系统资源使用情况
- 优雅降级或排队等待资源

## Testing Strategy

### 单元测试
- 测试单个 Gate 的执行
- 测试状态机转换逻辑
- 测试事件发布机制

### 集成测试
- 测试 workflow 端到端执行
- 测试与 Event Bus 的集成
- 测试错误恢复机制

### 属性测试 (Property-Based Testing)
- 验证上述 Correctness Properties
- 使用随机生成的 workflow 定义进行测试
- 验证边界条件和异常情况

## Dependencies

1. **Event Bus**: 用于事件发布和订阅
2. **Session Registry**: 用于身份验证和权限检查
3. **Knowledge Graph**: 用于 Gate 的知识图谱同步功能
4. **Agent System**: 用于执行 workflow 中的 Agent 步骤