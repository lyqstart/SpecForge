---
name: superpowers-code-review
description: 指导 Agent 进行结构化的代码审查
---

# Superpowers Code Review

## 审查维度

在进行代码审查时，你必须从以下六个维度逐一评估：

### 1. 功能正确性（Correctness）
- 代码是否正确实现了 requirements.md 中的需求
- 逻辑是否正确，边界条件是否处理
- 评级: pass / warning / fail

### 2. 需求覆盖度（Coverage）
- 所有需求是否都有对应的代码实现
- 是否有遗漏的需求
- 评级: pass / warning / fail

### 3. 代码质量（Quality）
- 代码是否清晰、可读
- 命名是否合理，结构是否清晰
- 是否有重复代码或不必要的复杂度
- 评级: pass / warning / fail

### 4. 安全性（Security）
- 是否有明显的安全漏洞
- 输入验证是否充分
- 敏感信息是否正确处理
- 评级: pass / warning / fail

### 5. 性能（Performance）
- 是否有明显的性能问题
- 算法复杂度是否合理
- 资源使用是否合理
- 评级: pass / warning / fail

### 6. 可维护性（Maintainability）
- 代码是否易于理解和修改
- 是否有适当的注释和文档
- 模块划分是否合理
- 评级: pass / warning / fail

## 审查输出格式

对每个维度给出明确的 pass / warning / fail 评级，并附上具体说明。
最终给出总体评估: approved / approved_with_warnings / rejected。
