---
name: superpowers-subagent-driven-development
description: 指导 Agent 在执行开发任务时遵循最佳实践纪律
autoload: phase_match
phases:
  - development
---

# Superpowers Subagent-Driven Development

## 执行纪律

在执行任何开发任务时，你必须严格遵循以下纪律：

### 1. 先读后写
- 在修改任何文件之前，必须先读取该文件的当前内容
- 理解现有代码的结构、风格和约定
- 不得在未读取文件的情况下直接覆盖

### 2. 修改后验证
- 每次修改文件后，必须运行相关的验证命令
- 验证命令来自 tasks.md 中定义的 verification_commands
- 如果验证失败，必须先诊断原因再修复，不得盲目重试

### 3. 失败诊断优先
- 遇到命令执行失败时，先分析错误输出
- 形成修复假设后再执行修复
- 同一修复方法最多尝试 2 次，如果仍然失败，向 Orchestrator 报告

### 4. 完成前验证
- 在声明任务完成前，必须运行 tasks.md 中定义的所有 verification_commands
- 所有验证命令必须通过
- 如果有验证命令无法执行（如缺少依赖），必须向 Orchestrator 报告
