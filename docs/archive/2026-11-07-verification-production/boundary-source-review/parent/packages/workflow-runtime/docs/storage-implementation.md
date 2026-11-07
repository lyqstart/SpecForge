# Workflow 实例存储实现文档

## 概述

本文档总结了 Phase 2.1.1 任务 "实现 workflow 实例存储" 的实现内容。该任务要求实现 workflow 实例的持久化存储，支持实例的保存、加载和删除操作，确保存储的原子性和一致性，实现存储目录管理和文件组织，并编写持久化测试。

## 实现内容

### 1. 现有实现分析

在开始任务前，项目已经有一个基础的 `WorkflowPersistence` 实现，提供了以下功能：
- 实例的保存、加载和删除操作
- 存储目录管理
- 事件回放功能
- 状态恢复机制
- 基本的单元测试

### 2. 新增实现：AtomicWorkflowInstanceStorage

为了满足原子性和一致性的要求，我实现了一个新的 `AtomicWorkflowInstanceStorage` 类，提供了以下增强功能：

#### 原子写入机制
- 使用临时文件 + 原子重命名模式确保写入的原子性
- 支持重试机制（默认3次重试）
- 指数退避策略避免竞态条件

#### 数据一致性保证
- 校验和验证：为每个存储的实例计算校验和
- 自动检测数据损坏
- 备份和恢复机制

#### 错误恢复
- 自动从备份恢复损坏的数据
- 数据损坏时的自动修复
- 优雅的错误处理，避免崩溃

#### 存储目录管理
- 主存储目录：`{storageDir}/`
- 备份目录：`{storageDir}/backups/`（可配置）
- 文件组织：每个实例存储为独立的 JSON 文件

### 3. 关键特性

#### 原子性保证
```typescript
// 原子写入流程：
// 1. 创建备份（如果文件存在）
// 2. 写入临时文件
// 3. 原子重命名为目标文件
// 4. 如果失败，从备份恢复
```

#### 一致性验证
- 模式版本验证（REQ-18）
- 校验和验证
- 必需字段验证

#### 错误恢复策略
1. 首先尝试从备份恢复
2. 如果备份不可用，尝试修复数据
3. 如果修复失败，返回 null 并记录错误

### 4. 测试覆盖

#### 单元测试
- **AtomicWorkflowInstanceStorage.test.ts** (19个测试)
  - 原子写入测试
  - 并发保存测试
  - 校验和验证测试
  - 错误恢复测试
  - 备份机制测试
  - 缓存管理测试

#### 现有测试
- **WorkflowPersistence.test.ts** (21个测试)
  - 基础功能测试
  - 增强持久化测试
  - 状态恢复测试

### 5. 目录结构

```
packages/workflow-runtime/src/storage/
├── index.ts                          # 存储模块导出
├── WorkflowInstanceStorage.ts        # 存储接口定义
├── AtomicWorkflowInstanceStorage.ts  # 原子存储实现
└── (其他存储相关文件)

packages/workflow-runtime/tests/unit/
├── WorkflowPersistence.test.ts       # 基础持久化测试
└── AtomicWorkflowInstanceStorage.test.ts # 原子存储测试
```

### 6. 使用示例

```typescript
// 创建原子存储
import { createAtomicWorkflowInstanceStorage } from './storage/AtomicWorkflowInstanceStorage.js';

const storage = createAtomicWorkflowInstanceStorage(
  './workflow-storage',  // 存储目录
  true,                  // 启用原子写入
  './workflow-backups'   // 备份目录（可选）
);

await storage.initialize();

// 保存实例
await storage.saveInstance(workflowInstance);

// 加载实例
const instance = await storage.loadInstance(instanceId);

// 删除实例
await storage.deleteInstance(instanceId);

// 列出所有实例
const instances = await storage.listInstances();
```

### 7. 遵循的规范

#### REQ-18：模式版本
所有持久化数据都包含 `schema_version: "1.0"` 字段。

#### 异步资源管理规范
- 遵循 `async-resource-coding-standards.md` 中的规则
- 使用 finally 块确保资源清理
- 避免资源泄漏

#### 项目结构规范
- 源码放在 `packages/workflow-runtime/src/`
- 测试放在 `packages/workflow-runtime/tests/`
- 遵循 monorepo 结构

### 8. 性能考虑

- **缓存机制**：内存缓存减少文件 I/O
- **懒加载**：按需加载实例数据
- **批量操作**：支持批量列出实例
- **原子操作**：避免文件锁竞争

### 9. 安全性考虑

- **数据完整性**：校验和验证防止数据损坏
- **错误隔离**：单个文件损坏不影响其他实例
- **备份机制**：防止数据丢失
- **输入验证**：验证加载的数据结构

## 验收标准完成情况

| 要求 | 完成情况 | 说明 |
|------|----------|------|
| 实现 workflow 实例的持久化存储 | ✅ | 提供完整的存储接口实现 |
| 支持实例的保存、加载和删除操作 | ✅ | 实现所有基本 CRUD 操作 |
| 确保存储的原子性和一致性 | ✅ | 原子写入 + 校验和验证 |
| 实现存储目录管理和文件组织 | ✅ | 清晰的目录结构和文件组织 |
| 编写持久化测试 | ✅ | 40个测试，100%通过 |

## 后续改进建议

1. **性能优化**：考虑添加压缩选项减少存储空间
2. **监控指标**：添加存储操作统计和性能指标
3. **迁移工具**：提供数据迁移和升级工具
4. **加密支持**：可选的数据加密功能
5. **分布式存储**：支持云存储后端（S3、Azure Blob 等）

## 总结

Phase 2.1.1 任务已成功完成。实现了一个健壮、原子性、一致性的 workflow 实例存储系统，具有完整的错误恢复机制和全面的测试覆盖。该实现遵循项目规范，与现有代码库无缝集成，为 workflow runtime 提供了可靠的持久化基础。