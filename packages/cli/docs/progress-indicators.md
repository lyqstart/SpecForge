# 进度指示器使用指南

## 概述

SpecForge CLI 提供了进度指示器功能，用于在异步操作和长时间运行的任务中向用户提供反馈。进度指示器遵循双模式输出系统：

- **交互模式**：显示动画spinner和进度条
- **JSON模式**：不显示进度指示，保持输出干净可解析

## 功能特性

### 1. 异步操作Spinner
- 仅交互模式下显示
- 动画spinner表示操作进行中
- 支持消息更新
- 成功/失败状态指示

### 2. 长操作进度条
- 仅交互模式下显示
- 可视化进度条
- 百分比显示
- 耗时统计
- 剩余时间估算

### 3. `--wait`模式状态更新
- 交互模式：spinner + 状态更新
- JSON模式：结构化状态输出
- 支持所有作业状态（pending, running, completed, failed, blocked, cancelled）

## 使用示例

### 基本Spinner使用

```typescript
import { createSimpleProgress } from './src/progress/SimpleProgress';

// 交互模式
const progress = createSimpleProgress(true, 'Processing data...');
progress.start();

// 更新消息
progress.update('Saving results...');

// 完成
progress.succeed('Operation completed successfully!');
// 或
progress.fail('Operation failed!');
```

### 作业进度跟踪

```typescript
import { createSimpleJobProgress } from './src/progress/SimpleProgress';

// 创建作业进度跟踪器
const jobProgress = createSimpleJobProgress(true, 'job-123');

// 更新状态
jobProgress.update({ status: 'running' });

// 完成作业
jobProgress.complete({ status: 'completed' });
// 或
jobProgress.complete({ status: 'failed', error: 'Network timeout' });
```

### 集成到JobTracker

JobTracker 已自动集成进度指示器。使用 `--wait` 标志时，进度指示器会自动显示：

```bash
# 交互模式 - 显示spinner和状态更新
specforge job job-123 --wait

# JSON模式 - 不显示进度，输出结构化状态
specforge job job-123 --wait --json
```

## 实现细节

### 进度指示器接口

```typescript
interface SimpleProgress {
  start(): void;
  update(message: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  stop(): void;
}
```

### 作业进度跟踪器接口

```typescript
interface JobProgressTracker {
  update(status: { status: string; error?: string }): void;
  complete(status: { status: string; error?: string }): void;
  stop(): void;
}
```

## 测试

进度指示器包含完整的单元测试：

```bash
# 运行进度指示器测试
bun test tests/simple-progress.test.ts

# 运行所有CLI测试
bun test
```

## 设计原则

1. **双模式一致性**：进度指示器不影响JSON模式的输出结构
2. **资源清理**：所有timer和资源在完成后正确清理
3. **错误处理**：进度指示器不会掩盖实际错误
4. **性能**：进度更新不会影响操作性能

## 扩展性

进度指示器设计为可扩展的。未来可以添加：

1. **多级进度**：嵌套进度指示
2. **自定义动画**：用户可选的spinner样式
3. **进度事件**：进度变化的回调事件
4. **进度持久化**：长时间操作的进度保存和恢复

## 注意事项

1. 在非TTY环境（如CI管道）中，进度指示器会自动禁用
2. JSON模式下的进度更新会输出结构化状态，便于机器解析
3. 进度指示器使用 `process.stdout.write` 直接输出，确保与日志系统兼容
4. 所有进度指示器都遵循异步资源生命周期管理规范