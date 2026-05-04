# AGENTS.md - SpecForge Agent 总览文档

> 本文件是 SpecForge 系统中所有 Agent、调用层级、权限模型和工作流的总览文档。

---

## 1. Agent 列表

| Agent 名称 | 类型 | 职责概述 | 模型 | 关键权限 |
|------------|------|----------|------|----------|
| sf-orchestrator | primary | 项目管理、用户沟通、意图判断、工作流选择、阶段推进、子 Agent 调度 | anthropic/claude-sonnet-4-20250514 | task=allow, edit=ask, bash=ask |
| sf-requirements | subagent | 需求分析与 requirements.md 文档生成 | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-design | subagent | 设计文档生成（design.md） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-task-planner | subagent | 任务拆分与规划（tasks.md） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-executor | subagent | 代码编写与任务执行 | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-debugger | subagent | 调试与问题修复 | anthropic/claude-sonnet-4-20250514 | task=deny, edit=ask, bash=ask |
| sf-reviewer | subagent | 代码与文档审查（只读） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=deny, bash=ask |
| sf-verifier | subagent | 验证与测试执行（只读） | anthropic/claude-sonnet-4-20250514 | task=deny, edit=deny, bash=ask |

---

## 2. 调用层级

```
Depth 0: 用户 / OpenCode 主会话
  └── Depth 1: sf-orchestrator (primary agent)
        ├── Depth 2: sf-requirements (subagent)
        ├── Depth 2: sf-design (subagent)
        ├── Depth 2: sf-task-planner (subagent)
        ├── Depth 2: sf-executor (subagent)
        ├── Depth 2: sf-debugger (subagent)
        ├── Depth 2: sf-reviewer (subagent)
        └── Depth 2: sf-verifier (subagent)
```

**调用规则：**
- 最大调用深度为 3 层（用户 → Orchestrator → Sub-Agent）
- 只有 sf-orchestrator 可以调度子 Agent（permission.task = allow）
- 子 Agent 之间不可互相调用（所有子 Agent 的 permission.task = deny）
- 用户只与 sf-orchestrator 直接交互，子 Agent 不可直接向用户提问

---

## 3. 权限模型

### 3.1 核心权限约束

| 权限维度 | sf-orchestrator | 其余 7 个子 Agent | sf-reviewer / sf-verifier 特殊限制 |
|----------|----------------|-------------------|-------------------------------------|
| permission.task | allow（可调度子 Agent） | deny（不可调度其他 Agent） | deny |
| permission.edit | ask | ask | **deny**（不可编辑文件） |
| permission.bash | ask | ask | ask |
| permission.skill | ask | ask | ask |

### 3.2 权限模型说明

1. **子 Agent 隔离（permission.task = deny）**
   - 所有 7 个子 Agent 的 task 权限设为 deny
   - OpenCode 不会在子 Agent 的工具描述中展示其他 Agent，使其无法感知其他 Agent 的存在
   - 防止子 Agent 之间形成调用闭环或不可控的 Agent 链

2. **只读 Agent（permission.edit = deny）**
   - sf-reviewer 和 sf-verifier 不可编辑文件
   - 确保审查和验证的独立性——审查者不能自行修改代码

3. **状态变更集中管控**
   - 所有工作流状态变更必须通过 `sf_state_transition` 工具执行
   - 任何 Agent 不得直接读写 `specforge/runtime/state.json`
   - 状态流转工具内置乐观锁验证和合法性检查

4. **全局底线规则**
   - 所有 Agent 遵守 `specforge/agents/AGENT_CONSTITUTION.md` 中定义的 9 条底线规则
   - 包括：不得绕过 Gate、不得伪造验证、不得把推测当事实、不得直接修改权威状态等

---

## 4. Feature Spec 工作流（Requirements-First）

### 4.1 完整阶段流程

```
intake → requirements → requirements_gate → design → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
```

### 4.2 各阶段说明

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 | Gate 工具 |
|------|---------------|-------------|------|-----------|
| intake | —（Orchestrator 自行收集） | — | intake.md, spec.json | — |
| requirements | sf-requirements | superpowers-brainstorming | requirements.md | sf_requirements_gate |
| design | sf-design | — | design.md | sf_design_gate |
| tasks | sf-task-planner | — | tasks.md | sf_tasks_gate |
| development | sf-executor | — | 代码文件 | — |
| review | sf-reviewer | — | 审查意见 | — |
| verification | sf-verifier | superpowers-verification-before-completion | 验证报告 | sf_verification_gate |

### 4.3 Gate 结果处理

| Gate 结果 | 动作 |
|-----------|------|
| pass | 状态流转到下一阶段 |
| fail | 回退到 Gate 对应的前一阶段，重新调度子 Agent 修订 |
| blocked | 状态流转到 blocked，向用户报告阻塞原因并等待指示 |

### 4.4 失败重试策略

- **executor 失败**：最多重试 2 次（首次 + 1 次重试）
- **debugger 介入**：executor 重试耗尽后调度 sf-debugger，最多 1 次
- **review repair loop**：review 发现问题时最多 1 次修复循环
- **超过限制**：标记 task 为 blocked，停止自动重试，等待用户指示

---

## 5. 可用 Custom Tools

| 工具名 | 文件路径 | 用途 |
|--------|----------|------|
| sf_state_read | `.opencode/tools/sf_state_read.ts` | 读取 Work Item 当前工作流状态 |
| sf_state_transition | `.opencode/tools/sf_state_transition.ts` | 执行状态流转（含乐观锁验证和合法性检查） |
| sf_doc_lint | `.opencode/tools/sf_doc_lint.ts` | 检查规格文档的结构合规性 |
| sf_requirements_gate | `.opencode/tools/sf_requirements_gate.ts` | 检查 requirements.md 质量 |
| sf_design_gate | `.opencode/tools/sf_design_gate.ts` | 检查 design.md 质量 |
| sf_tasks_gate | `.opencode/tools/sf_tasks_gate.ts` | 检查 tasks.md 质量 |
| sf_verification_gate | `.opencode/tools/sf_verification_gate.ts` | 检查验证阶段测试结果 |

---

## 6. 可用 Skills

| Skill 名称 | 文件路径 | 用途 | 加载时机 |
|------------|----------|------|----------|
| superpowers-brainstorming | `.opencode/skills/superpowers-brainstorming/SKILL.md` | 指导 Agent 从 7 个维度进行需求头脑风暴 | requirements 阶段（sf-requirements 加载） |
| superpowers-verification-before-completion | `.opencode/skills/superpowers-verification-before-completion/SKILL.md` | 要求 Agent 在声明完成前提供验证证据 | verification 阶段（sf-verifier 加载） |
| sf-workflow-feature-spec | `.opencode/skills/sf-workflow-feature-spec/SKILL.md` | Feature Spec 工作流阶段执行协议 | 意图分类为 feature_spec 后（Orchestrator 加载） |
| sf-workflow-bugfix-spec | `.opencode/skills/sf-workflow-bugfix-spec/SKILL.md` | Bugfix Spec 工作流阶段执行协议 | 意图分类为 bugfix_spec 后（Orchestrator 加载） |
| sf-workflow-design-first | `.opencode/skills/sf-workflow-design-first/SKILL.md` | Design-First 工作流阶段执行协议 | 意图分类为 feature_spec_design_first 后（Orchestrator 加载） |
| sf-workflow-quick-change | `.opencode/skills/sf-workflow-quick-change/SKILL.md` | Quick Change 工作流阶段执行协议 | 意图分类为 quick_change 后（Orchestrator 加载） |

---

## 7. 工作流 Skill 加载协议（V3.2 新增）

### 7.1 加载时机

Orchestrator 在以下两种场景加载 Workflow Skill：

1. **新工作流**：意图分类完成 → 确定 Workflow_Type → 加载 Skill → 创建 Work Item
2. **会话恢复**：检测到进行中的 Work Item → 读取 workflow_type → 加载 Skill → 继续执行

### 7.2 路由映射

| Workflow_Type | Workflow_Skill |
|---------------|---------------|
| feature_spec | sf-workflow-feature-spec |
| bugfix_spec | sf-workflow-bugfix-spec |
| feature_spec_design_first | sf-workflow-design-first |
| quick_change | sf-workflow-quick-change |

### 7.3 加载规则

- 每次工作流执行只加载一个 Workflow_Skill
- 加载失败时停止工作流，不降级
- Workflow_Skill 中不包含共享协议（Gate、重试等），这些保留在路由层
