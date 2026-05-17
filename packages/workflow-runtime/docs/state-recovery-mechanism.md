# 状态恢复机制实现文档

## 概述

本文档描述了 workflow-runtime 模块中状态恢复机制的实现，包括从存储中恢复 workflow 实例状态、状态一致性验证、崩溃恢复场景支持等功能。

## 实现的功能

### 1. 从存储中恢复 workflow 实例状态

**核心组件**: `StateRecoveryManager`

**功能**:
- 从持久化存储加载 workflow 实例
- 从事件日志重建丢失的实例状态
- 支持缓存机制提高恢复性能
- 提供多种恢复策略和配置选项

**关键方法**:
- `recoverState(instanceId: string)`: 恢复单个实例状态
- `recoverFromEventLog(instanceId: string)`: 从事件日志恢复实例

### 2. 状态一致性验证

**功能**:
- 验证实例基本完整性（ID、workflowId 等必需字段）
- 检查状态机一致性（当前状态是否有效）
- 验证事件序列（无重复事件、时间戳顺序正确）
- 跨验证存储与事件日志的一致性

**验证类型**:
- `missing_instance`: 缺少必需字段
- `state_mismatch`: 无效的当前状态
- `event_sequence`: 事件序列问题（重复事件）
- `timestamp_order`: 时间戳顺序错误
- `missing_events`: 存储与事件日志不一致

**严重级别**:
- `high`: 阻止恢复的关键问题
- `medium`: 可能影响功能的问题
- `low`: 不影响功能的小问题

### 3. 崩溃恢复场景支持

**功能**:
- 批量恢复所有实例状态
- 自动检测并处理损坏的实例文件
- 从事件日志恢复丢失的实例
- 提供恢复统计和报告

**关键方法**:
- `performCrashRecovery()`: 执行崩溃恢复
- `createRecoverySnapshot()`: 创建恢复快照
- `getRecoveryStats()`: 获取恢复统计

### 4. 不一致性修复

**功能**:
- 自动修复可修复的不一致性
- 提供修复建议
- 支持配置是否自动修复

**修复策略**:
- 重置无效状态为初始状态
- 移除重复事件
- 按时间戳排序事件
- 从事件日志补充缺失的事件

## 架构设计

### 核心类

1. **`StateRecoveryManager`**
   - 主恢复管理器
   - 协调恢复、验证、修复流程
   - 提供统计和监控功能

2. **`EnhancedWorkflowPersistence`**
   - 增强的持久化类
   - 集成状态恢复功能
   - 向后兼容基础持久化接口

3. **`EventLogReader`**
   - 读取事件日志
   - 从事件重建状态
   - 支持事件过滤和查询

### 数据流

```
存储恢复流程:
1. 尝试从持久化存储加载实例
2. 如果失败，尝试从事件日志恢复
3. 验证实例一致性
4. 如果启用修复，修复不一致性
5. 如果需要，重放事件更新状态
6. 返回恢复的实例

崩溃恢复流程:
1. 列出所有存储的实例
2. 为每个实例执行存储恢复流程
3. 扫描事件日志查找未存储的实例
4. 从事件日志恢复这些实例
5. 汇总恢复结果和统计
```

## API 使用示例

### 基本恢复

```typescript
import { createEnhancedWorkflowPersistence } from '@specforge/workflow-runtime';

// 创建增强的持久化实例
const persistence = createEnhancedWorkflowPersistence('./storage');

// 恢复单个实例
const instance = await persistence.recoverState('instance-123');
```

### 使用 StateRecoveryManager

```typescript
import { createStateRecoveryManager } from '@specforge/workflow-runtime';

// 创建恢复管理器
const recoveryManager = createStateRecoveryManager(persistence, eventLogReader, {
  validateConsistency: true,
  repairInconsistencies: true,
  maxRecoveryAttempts: 3,
  enableEventReplay: true,
});

// 执行崩溃恢复
const result = await recoveryManager.performCrashRecovery();
console.log(`Recovered ${result.recoveredInstances.length} instances`);
```

### 一致性验证

```typescript
// 验证实例一致性
const validation = await recoveryManager.validateInstanceConsistency(instance);

if (!validation.isValid) {
  console.log('Inconsistencies found:');
  for (const inconsistency of validation.inconsistencies) {
    console.log(`- ${inconsistency.type}: ${inconsistency.description}`);
  }
  
  // 获取修复建议
  console.log('Recommendations:', validation.recommendations);
}
```

## 配置选项

### StateRecoveryOptions

```typescript
interface StateRecoveryOptions {
  // 是否验证一致性
  validateConsistency: boolean;
  
  // 是否自动修复不一致性
  repairInconsistencies: boolean;
  
  // 最大恢复尝试次数
  maxRecoveryAttempts: number;
  
  // 是否启用事件重放
  enableEventReplay: boolean;
}
```

## 测试覆盖

### 单元测试

1. **状态恢复测试**
   - 从存储恢复状态
   - 从事件日志恢复状态
   - 处理恢复失败

2. **一致性验证测试**
   - 验证有效实例
   - 检测各种不一致性
   - 验证修复建议

3. **崩溃恢复测试**
   - 批量恢复所有实例
   - 处理损坏的文件
   - 从事件日志恢复丢失实例

4. **修复功能测试**
   - 自动修复不一致性
   - 移除重复事件
   - 排序事件时间戳

### 集成测试

通过示例程序验证端到端功能:
- 创建多个实例
- 添加事件到日志
- 执行各种恢复操作
- 验证恢复结果

## 遵循的规范

### REQ-18: schema_version 字段
所有持久化数据结构都包含 `schema_version: "1.0"` 字段。

### 异步资源生命周期管理
- 使用 `finally` 块确保资源清理
- 避免 Promise.race 中的 timer 泄漏
- 实现适当的超时机制

### 项目目录结构规范
- 源码放在 `packages/workflow-runtime/src/`
- 测试放在 `packages/workflow-runtime/tests/`
- 示例放在 `packages/workflow-runtime/examples/`

## 性能考虑

1. **缓存机制**: 使用内存缓存减少磁盘读取
2. **懒加载**: 只在需要时读取事件日志
3. **批量操作**: 支持批量恢复提高效率
4. **增量恢复**: 只恢复发生变化的部分

## 错误处理

1. **优雅降级**: 部分失败不影响整体恢复
2. **详细日志**: 记录恢复过程中的所有操作
3. **可配置重试**: 支持配置重试次数和策略
4. **错误分类**: 区分可恢复和不可恢复错误

## 监控和统计

1. **恢复统计**: 跟踪恢复成功/失败率
2. **性能指标**: 记录恢复时间
3. **不一致性报告**: 统计发现的不一致性
4. **快照功能**: 创建恢复状态快照

## 扩展性

1. **插件架构**: 支持自定义验证规则
2. **策略模式**: 可配置恢复策略
3. **事件驱动**: 支持恢复事件通知
4. **可观测性**: 集成监控和告警系统