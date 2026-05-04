---
name: superpowers-tdd
description: 指导 Agent 在 Bugfix 开发中遵循 TDD（测试驱动开发）方法论
autoload: false
---

# Superpowers TDD

## Red-Green-Refactor 循环

在修复 Bug 时，你必须严格遵循 TDD 的 Red-Green-Refactor 循环：

### 1. Red（编写失败的测试）
- 在编写任何修复代码之前，先编写能复现 Bug 的回归测试
- 运行测试，确认测试失败（Red）
- 测试失败的原因必须与 bugfix.md 中描述的当前行为一致

### 2. Green（编写最小修复代码）
- 编写最小的代码变更使测试通过
- 不要过度设计，只修复 Bug
- 运行测试，确认测试通过（Green）

### 3. Refactor（重构）
- 在测试通过后，检查是否需要重构
- 重构不得改变行为，只改善代码质量
- 重构后再次运行测试，确认仍然通过

## 回归测试要求

- 回归测试必须在修复代码之前编写
- 回归测试必须能复现 bugfix.md 中描述的 Bug
- 回归测试必须验证 bugfix.md 中的"不变行为"未受影响
- 回归测试必须作为项目测试套件的永久组成部分
