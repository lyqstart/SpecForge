# SpecForge 开发测试记录

> 本文件记录开发过程中每个功能的测试情况，用于最终决策：完善 / 取消 / 正式部署。

---

## 状态说明

| 状态 | 含义 |
|------|------|
| 🟢 通过 | 功能按预期工作，可进入正式部署 |
| 🟡 部分通过 | 核心功能可用，但有已知问题需完善 |
| 🔴 失败 | 功能不可用，需要修复或重新设计 |
| ⚪ 未测试 | 尚未进行测试 |
| ❌ 取消 | 经评估决定不纳入当前版本 |

---

## 测试轮次记录

### 第 1 轮：五子棋项目（2026-05-03 上午）
- 结果：完整闭环跑通，但 custom tool 有 D.split 错误，子 Agent 调度情况不明
- 发现 ISS-001~ISS-008

### 第 2 轮：计算器项目-旧代码（2026-05-03 下午）
- 结果：Orchestrator 跳过工作流直接写代码
- 原因：test1 残留五子棋代码，AI 误判为"已有项目修改"

### 第 3 轮：计算器项目-新代码（2026-05-03 晚）
- 结果：✅ 完整闭环跑通，所有 custom tool 正常，Gate 被实际调用，子 Agent 被真正调度
- 耗时：约 50 分钟（08:44 → 09:35）
- 模型：zai-coding-plan/glm-5.1
- 状态流转：12 条完整记录
- sf_ 工具调用：32 次
- 子 Agent 调度：11 次（通过 task 工具）

---

## 1. 基础骨架

| 功能 | 状态 | 测试轮次 | 问题与备注 |
|------|------|----------|------------|
| 目录结构创建 | 🟢 | 第 3 轮 | install.ps1 正确创建 |
| state.json 初始化 | 🟢 | 第 3 轮 | 最终状态 completed |
| events.jsonl 初始化 | 🟢 | 第 3 轮 | 12 条完整记录 |
| AGENT_CONSTITUTION.md | 🟢 | 第 3 轮 | 文件存在，第 3 轮未出现违规 |
| project.json / risk_policy.json | 🟢 | 第 3 轮 | |

## 2. Agent 体系

| 功能 | 状态 | 测试轮次 | 问题与备注 |
|------|------|----------|------------|
| sf-orchestrator 加载 | 🟢 | 第 3 轮 | Tab 可切换 |
| sf-requirements 调度 | 🟢 | 第 3 轮 | trace 中有 task(subagent_type=sf-requirements) |
| sf-design 调度 | 🟢 | 第 3 轮 | trace 中有 task(subagent_type=sf-design) |
| sf-task-planner 调度 | 🟢 | 第 3 轮 | trace 中有 task(subagent_type=sf-task-planner) |
| sf-executor 调度 | 🟢 | 第 3 轮 | trace 中有多次 task 调用 |
| sf-debugger 调度 | ⚪ | | 未触发失败场景 |
| sf-reviewer 调度 | 🟢 | 第 3 轮 | trace 中有 task 调用 |
| sf-verifier 调度 | 🟢 | 第 3 轮 | trace 中有 task 调用 |
| opencode.json 配置生效 | 🟢 | 第 3 轮 | |
| permission.task=deny 生效 | 🟢 | 第 3 轮 | 子 Agent 未互相调用 |
| Tab 切换到 sf-orchestrator | 🟢 | 第 3 轮 | |

## 3. Custom Tools

| 功能 | 状态 | 测试轮次 | 问题与备注 |
|------|------|----------|------------|
| sf_state_read | 🟢 | 第 3 轮 | 4 次调用，正常 |
| sf_state_transition | 🟢 | 第 3 轮 | 12 次调用，与 events.jsonl 完全吻合 |
| sf_doc_lint | 🟢 | 第 3 轮 | 3 次调用，检测到缺少章节并触发修复 |
| sf_requirements_gate | 🟢 | 第 3 轮 | 2 次调用 |
| sf_design_gate | 🟢 | 第 3 轮 | 3 次调用（含 Gate fail 后重试） |
| sf_tasks_gate | 🟢 | 第 3 轮 | 4 次调用（含 Gate fail 后重试） |
| sf_verification_gate | 🟢 | 第 3 轮 | 2 次调用 |
| sf_doctor | 🟢 | 第 3 轮 | 启动时自动执行 |

## 4. Plugin

| 功能 | 状态 | 测试轮次 | 问题与备注 |
|------|------|----------|------------|
| sf_event_logger 加载 | 🟢 | 第 3 轮 | |
| tool.execute.before 记录 | 🟢 | 第 3 轮 | |
| tool.execute.after 记录 | 🟢 | 第 3 轮 | 32 条 sf_ 工具记录 |
| agent.dispatched 记录 | 🟡 | 第 3 轮 | 有记录但 agent 名显示 unknown（字段名不匹配，已修复） |
| session 事件记录 | 🟢 | 第 3 轮 | |
| result_preview | 🟡 | 第 3 轮 | 全部为空字符串，OpenCode 平台限制 |

## 5. Skills

| 功能 | 状态 | 测试轮次 | 问题与备注 |
|------|------|----------|------------|
| superpowers-brainstorming | 🟢 | 第 3 轮 | task prompt 中明确要求加载此 skill |
| superpowers-verification-before-completion | ⚪ | | 需确认 verifier 是否加载 |

## 6. 工作流（端到端）

| 功能 | 状态 | 测试轮次 | 问题与备注 |
|------|------|----------|------------|
| 意图判断（new_feature） | 🟢 | 第 3 轮 | |
| Work Item 创建 | 🟢 | 第 3 轮 | |
| intake 阶段 | 🟢 | 第 3 轮 | |
| requirements 阶段 | 🟢 | 第 3 轮 | 10 条功能需求 + 6 条非功能需求 |
| requirements_gate | 🟢 | 第 3 轮 | pass |
| design 阶段 | 🟢 | 第 3 轮 | |
| design_gate | 🟢 | 第 3 轮 | 含 fail→重试→pass |
| tasks 阶段 | 🟢 | 第 3 轮 | 5 个任务 |
| tasks_gate | 🟢 | 第 3 轮 | 含 fail→重试→pass |
| development 阶段 | 🟢 | 第 3 轮 | 5 个任务全部完成 |
| review 阶段 | 🟢 | 第 3 轮 | approved，16 需求覆盖，2 warnings |
| verification 阶段 | 🟢 | 第 3 轮 | 43/43 命令通过，12/12 验收标准 |
| verification_gate | 🟢 | 第 3 轮 | pass |
| 完整闭环 | 🟢 | 第 3 轮 | intake → completed |
| Gate fail → 重试 | 🟢 | 第 3 轮 | design_gate 和 tasks_gate 均有 fail→修复→pass |
| Gate blocked → 报告用户 | ⚪ | | 未触发 |
| executor 失败重试 | ⚪ | | 未触发 |
| debugger 介入 | ⚪ | | 未触发 |

## 7. 留痕与审计

| 功能 | 状态 | 测试轮次 | 问题与备注 |
|------|------|----------|------------|
| trace.jsonl | 🟢 | 第 3 轮 | 完整记录所有工具调用和事件 |
| tool_calls.jsonl | 🟢 | 第 3 轮 | 32 条 sf_ 工具记录 |
| events.jsonl | 🟢 | 第 3 轮 | 12 条状态流转，完整覆盖 |
| 复盘可还原执行过程 | 🟢 | 第 3 轮 | 可还原完整的 Agent 调度和状态流转链 |

## 8. 安装与部署

| 功能 | 状态 | 测试轮次 | 问题与备注 |
|------|------|----------|------------|
| install.ps1 | 🟢 | 第 3 轮 | |
| reinstall.ps1 | 🟢 | 第 3 轮 | 含 -Clean 选项 |
| sf_doctor 自检 | 🟢 | 第 3 轮 | 启动时自动运行 |
| 权限弹窗 | 🟡 | 第 3 轮 | agent .md frontmatter 覆盖了 opencode.json，已修复 |

---

## 已知问题汇总

| 编号 | 问题 | 严重程度 | 状态 |
|------|------|----------|------|
| ISS-001 | sf_state_read 不支持 all | 中 | ✅ 已修复已验证 |
| ISS-002 | plugin 外部 import 加载失败 | 高 | ✅ 已修复已验证 |
| ISS-003 | tool 返回对象导致 D.split 错误 | 高 | ✅ 已修复已验证（第 3 轮） |
| ISS-004 | sf_ 工具 tool.execute.after 未触发 | 高 | ✅ 已修复已验证（第 3 轮，32 条记录） |
| ISS-005 | design→design_gate 重复流转 | 低 | ✅ 第 3 轮未复现 |
| ISS-006 | Orchestrator 用 bash 绕过 tool | 高 | ✅ 第 3 轮未复现（prompt 强化生效） |
| ISS-007 | 子 Agent 未被真正调度 | 高 | ✅ 已验证：第 3 轮 trace 中有 11 次 task 工具调用，子 Agent 被真正调度 |
| ISS-008 | Gate tool 未被实际调用 | 高 | ✅ 已修复已验证（第 3 轮，4 个 Gate 共 11 次调用） |
| ISS-009 | agent.dispatched 事件中 agent 名为 unknown | 低 | ✅ 已修复（字段名 subagent_type 不匹配） |
| ISS-010 | result_preview 全为空字符串 | 低 | 📌 OpenCode 平台限制，无法修复 |
| ISS-011 | 权限弹窗（agent .md frontmatter 覆盖 opencode.json） | 中 | ✅ 已修复（改为 allow） |

---

## 决策记录

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-05-03 | 不做 Provider Fallback（V1） | OpenCode 不支持动态切换 |
| 2026-05-03 | 不做 Model Router | 直接用 per-agent 配置 |
| 2026-05-03 | 开发阶段模型统一 glm-5.1 | 用户指定 |
| 2026-05-03 | 开发阶段权限全部 allow | 减少弹窗干扰测试 |
| 2026-05-03 | result_preview 为空不修复 | OpenCode 平台限制 |

---

## 最终评估

| 类别 | 正式部署 | 需完善 | 取消 |
|------|----------|--------|------|
| 基础骨架 | ✅ 全部通过 | | |
| Agent 体系 | ✅ 7/8 通过（debugger 未测试） | debugger 场景测试 | |
| Custom Tools | ✅ 全部通过 | | |
| Plugin | ✅ 核心功能通过 | result_preview 为空（平台限制） | |
| Skills | 🟡 brainstorming 确认使用 | verification skill 待确认 | |
| 工作流 | ✅ 完整闭环 + Gate fail 重试 | blocked/executor 失败场景 | |
| 留痕审计 | ✅ 全部通过 | | |
| 安装部署 | ✅ 全部通过 | | |
