---
name: superpowers-writing-plans
description: 指导 Agent 为每个 task 生成结构化的执行计划
autoload: false
---

# Superpowers Writing Plans

## 指令

在为每个 task 生成执行计划时，你必须包含以下四个部分：

### 1. 前置条件（Prerequisites）
- 列出执行此 task 前必须满足的条件
- 包括：依赖的文件、已完成的前置 task、需要的环境配置

### 2. 执行步骤（Steps）
- 按顺序列出具体的执行步骤
- 每个步骤必须是可操作的、明确的
- 总步骤数不得超过 30 个（如果超过，说明 task 粒度过大，需要拆分）

### 3. 预期产物（Expected Outputs）
- 列出此 task 完成后应产生的文件或变更
- 包括：新建文件、修改文件、删除文件

### 4. 验证方法（Verification）
- 列出验证此 task 完成的具体命令或检查方法
- 必须包含 verification_commands 字段
- 每个验证命令必须是可自动执行的

## 粒度控制

- 每个 task 的执行步骤不得超过 30 个
- 如果一个 task 需要超过 30 个步骤，必须将其拆分为多个子 task
- 每个 task 应该可以在单次子 Agent 执行中完成
