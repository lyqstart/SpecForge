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

### 第 4 轮：待办事项 + PostgreSQL（2026-05-03 晚）
- 测试内容：两个 Work Item 连续执行 + Review Repair Loop
- WI-1（待办事项）：✅ 完整闭环，权限弹窗消除
- WI-2（PostgreSQL 支持）：✅ 完整闭环，Review Repair Loop 正常工作
- 耗时：WI-1 约 40 分钟，WI-2 约 47 分钟
- 状态流转：WI-1 12 条 + WI-2 12 条 = 24 条完整记录
- 新发现：
  - ISS-012：子 Agent 越权调用 sf_state_transition（sf-requirements 自行流转状态）
  - ISS-013：验证体系深度不足（26/26 verification 通过但实际功能不可用——WI-2 的添加按钮无效）
  - Review Repair Loop 正常工作（CORS 问题被发现→修复→二次审查通过）
  - 多 Work Item 支持正常（WI-1 completed 后 WI-2 独立创建和执行）
  - Orchestrator 在需求不明确时主动提问（WI-2 的技术选型确认）
- 耗时：约 50 分钟（08:44 → 09:35）
- 模型：zai-coding-plan/glm-5.1
- 状态流转：12 条完整记录
- sf_ 工具调用：32 次
- 子 Agent 调度：11 次（通过 task 工具）

### 第 5 轮：V1 Complete 功能验证（2026-05-04）
- 测试内容：V1 Complete 新增功能验证（4 种工作流、新 Plugin/Skill、Gate 一致性）
- WI-001（待办事项 feature_spec）：✅ 完整闭环跑通
  - 但 verification_gate 回退 3 次（缺 verification_report.md、缺 e2e 内容）
  - sf-verifier 花大量 steps 写测试脚本但没写 verification_report.md → ISS-017
- WI-002（bugfix_spec）：✅ 完整 bugfix 工作流跑通
  - 正确跳过 review 阶段（bugfix 工作流无 review）
  - sf-requirements 在 bugfix 分析时写了 32 次 bash（安装 jsdom/puppeteer 等）→ ISS-015
- 新发现：
  - ISS-014：install.ps1 未复制 V1 Complete 新增文件（新 Plugin、新 Skill 目录）
  - ISS-015：sf-requirements 在 bugfix 模式下浪费 steps 写测试脚本（32 次 bash）
  - ISS-017：sf-verifier 未优先写 verification_report.md，导致 verification_gate 反复回退
- 修复措施：
  - ISS-014 已修复：install.ps1 改为动态扫描所有 Plugin（`*.ts`）和所有 Skill 目录
  - ISS-015 已修复：sf-requirements.md 增加"Bugfix 分析模式"约束（禁止写测试脚本、禁止安装依赖）
  - ISS-017 已修复：sf-verifier.md 增加"核心产出优先级"约束（必须尽早写 verification_report.md）
  - 所有 7 个子 Agent 增加"工作日志要求"章节（完成任务后写 work_log.md 到 archive_path）
  - sf-orchestrator.md 增加 archive_path 传递协议（调度子 Agent 时传递归档路径）

### 第 6 轮：倒计时网页 feature_spec（2026-05-04）
- 测试内容：V1 Complete 修复验证 + work_log.md 生成验证
- WI-001（倒计时网页 feature_spec）：✅ 完整闭环跑通（43 分钟）
  - 所有 4 个 Gate 一次通过（无回退！）
  - verification_gate 一次通过（ISS-017 修复生效）
  - 11/12 个子 Agent 生成了 work_log.md（ISS-016 部分生效）
- 新发现：
  - ISS-018：sf-reviewer 未生成 work_log.md（permission.edit=deny 导致无法用 write 工具，需改用 bash 写入）
  - ISS-019：Orchestrator 尝试 requirements → design 直跳（被状态机拒绝后修正，但不应先试错）
  - ISS-020：子 Agent 越权调用 Gate 工具（sf-requirements 调了 sf_requirements_gate，sf-task-planner 调了 sf_tasks_gate）
  - ISS-021：verification_gate 语义不一致（先流转到 verification_gate 状态，后才调用 sf_verification_gate 工具）
  - ISS-022：prompt 中没有显式 run_id 字段
- 统计数据：
  - 总耗时：43 分 29 秒
  - sf_ 工具调用：26 次
  - 子 Agent 调度：12 次
  - 状态流转：13 次
  - 最耗时阶段：development（18m09s）、verification（7m55s）
- 平台限制（不修复）：
  - result_preview 全为空（ISS-010/ISS-023 同源，OpenCode 平台限制）
  - agent.completed 中 agent=unknown（ISS-009/ISS-024 同源）
  - 工具失败没有 exit_code/status（ISS-025，OpenCode hook 数据限制）

### 第 7 轮：倒计时 bugfix_spec（2026-05-04）
- 测试内容：bugfix_spec 工作流 + 第 6 轮 5 个修复验证
- WI-001（倒计时声音提示 bugfix_spec）：✅ 完整闭环跑通（30 分 47 秒）
  - bugfix 工作流完整链路正确（正确跳过 review 阶段）
  - design_gate fail → 回退 → 修订 → pass，Gate 回退机制正常
  - 第 6 轮 5 个修复全部验证通过：ISS-019 ✅ ISS-020 ✅ ISS-021 ✅ ISS-022 ✅ ISS-015 ✅
  - 所有 9 个子 Agent run 都生成了 work_log.md
- 新发现：
  - sf-verifier 73 次 toolcalls（22 次失败 rg + 31 次重复 grep + 多次写入失败）
  - sf-verifier 报告中有未实际执行的检查被标记为 pass（0.5 检查）
  - sf-verifier 写入过程中把 countdown.html 内容写进了 verification_report.md（后修复）
- 修复措施：
  - sf-verifier.md 全面重写验证策略：命令失败熔断、批量 Python 脚本、禁止重复检查、稳定写入方式、toolcalls 预算 ≤25
- 统计数据：
  - 总耗时：30 分 47 秒
  - sf_ 工具调用：28 次
  - 子 Agent 调度：9 次
  - 状态流转：13 次（含 1 次 design_gate 回退）

### 第 8 轮：Quick Change 改颜色（2026-05-04）
- 测试内容：quick_change 工作流（改 1 行 CSS）
- WI-001（倒计时数字改蓝色 quick_change）：✅ 完整闭环跑通（13 分 16 秒）
  - Orchestrator 正确识别 small_change，建议 Quick Change，等用户确认
  - 状态流转正确跳过 requirements、design、review
  - task-planner 8 次 toolcalls / 47 秒，executor 7 次 / 49 秒——都很高效
  - sf-verifier 被调度两次（17 + 15 = 32 次 toolcalls），第一次 verification_gate 因缺 e2e 章节失败
- 新发现：
  - verification_gate 第一次 fail 原因：Orchestrator 没把 gate 的 e2e 要求传给 verifier，导致返工
  - 两次 sf-verifier 使用相同 run_id（WI-001-sf-verifier-1），证据链混乱
  - 改 1 行 CSS 总耗时 13 分钟，verification 占 10 分 17 秒——轻量流程失去意义
  - verifier 总 32 次 toolcalls 超过预算 25
- 修复措施：
  - sf-orchestrator.md：调度 verifier 时必须传递 gate 完整要求（5 个必需章节）
  - sf-orchestrator.md：Gate fail 重新调度时必须生成新 run_id
  - sf-verifier.md：增加 verification_report.md 必需章节清单
- 统计数据：
  - 总耗时：13 分 16 秒（目标 ≤5 分钟）
  - sf_ 工具调用：11 次
  - 子 Agent 调度：4 次（task-planner + executor + verifier ×2）
  - 状态流转：6 次

### 第 9 轮：Quick Change 改背景色（2026-05-04）
- 测试内容：Quick Change 修复验证（第 8 轮修复后重测）
- WI-001（倒计时背景色改浅灰 quick_change）：✅ 完整闭环跑通（8 分 10 秒）
  - verification_gate 一次通过 ✅（第 8 轮修复生效）
  - run_id 唯一 ✅
  - sf-verifier 16 次 toolcalls（目标 ≤15，接近达标）
  - verification 阶段 4m59s（目标 ≤2m，未达标）
  - 总耗时 8m10s（目标 ≤5m，未达标）
- 根因分析：
  - verifier 慢不是因为 toolcalls 多，而是模型生成脚本/报告时思考时间长（264s 思考 vs 5.6s 执行）
  - 1 行 CSS 变更做了 36 项检查，过度验证
  - inline Python → temp file → PowerShell 的尝试链路浪费时间
- 修复措施：
  - sf-verifier.md：增加 Quick Change 轻量验证模式（只检查 4-6 项核心断言，toolcalls ≤10）
  - sf-verifier.md：统一文件写入方式为 Python lines.append，禁止多种方式尝试
  - sf-orchestrator.md：Quick Change 调度 verifier 时传递 workflow_type 和轻量验证指令

### 第 11 轮：V2.0 Quick Change 首次测试（2026-05-04）
- 测试内容：V2.0 新工具首次实战（sf_batch_verify + sf_artifact_write）
- WI-001（按钮文字改"启动" quick_change）：✅ 完整闭环跑通（6 分 04 秒）
  - sf-verifier 5 次 toolcalls ✅（目标 ≤8）
  - sf_batch_verify 使用 ✅
  - sf_artifact_write 使用 ✅（1 次模板渲染失败后修正）
  - verification_gate 一次通过 ✅
  - Gate 结果结构化记录到 events.jsonl ✅
- 新发现：
  - Orchestrator 创建 Work Item 时未传 workflow_type，导致状态机流转失败
  - Orchestrator 手动修改 state.json/spec.json 修正（违反规则）
  - sf_artifact_write 模板渲染 e2e_tests 字段类型错误（字符串 vs 数组）
- 修复措施：
  - sf_state_transition_core.ts：创建 Work Item 时 workflow_type 必填，不再默认 feature_spec
  - sf_artifact_write_core.ts：renderVerificationReport 增加 schema 容错（数组字段自动归一化）

### 第 10 轮：Design-First 秒表 feature_spec_design_first（2026-05-04）
- 测试内容：Design-First 工作流验证
- WI-001（网页版秒表 feature_spec_design_first）：✅ 完整闭环跑通（53 分 06 秒）
  - Design-First 阶段顺序正确：design → design_gate → requirements → requirements_gate
  - design_gate 第一次 fail（缺需求引用）→ 回退 → 修订 → pass
  - sf-reviewer 生成了 work_log.md（ISS-018 修复验证通过）
  - 110/110 验证全部通过
- 新发现：
  - sf-verifier 27 次 toolcalls / 17m46s（严重异常，模型等待 1055s vs 工具执行 10.5s）
  - Design-First 的 design_gate 在 requirements 之前强制检查需求引用（语义冲突）
  - verification evidence 计数不一致（transition 写 110/110，report 口径 77 项）
- 已记录为 V2 需求：Design-First 专用 gate

---

## V1 最终评估

### 测试轮次总览

| 轮次 | 测试内容 | 工作流 | 结果 | 耗时 |
|------|----------|--------|------|------|
| 1 | 五子棋 | feature_spec | 闭环跑通，发现 ISS-001~008 | - |
| 2 | 计算器-旧代码 | feature_spec | 失败，Orchestrator 跳过工作流 | - |
| 3 | 计算器-新代码 | feature_spec | ✅ 完整闭环 | ~50m |
| 4 | 待办事项+PostgreSQL | feature_spec ×2 | ✅ 双 WI 闭环 + Review Repair Loop | ~87m |
| 5 | V1 Complete 验证 | feature_spec + bugfix_spec | ✅ 闭环，发现 ISS-014~017 | - |
| 6 | 倒计时网页 | feature_spec | ✅ 闭环，4 Gate 一次通过 | 43m |
| 7 | 倒计时声音 bugfix | bugfix_spec | ✅ 闭环，5 项修复全部验证通过 | 31m |
| 8 | 改颜色 | quick_change | ✅ 闭环，但 verifier 返工 | 13m |
| 9 | 改背景色 | quick_change | ✅ 闭环，verifier 一次通过 | 8m |

### V1 功能验证状态

| 功能 | 状态 | 说明 |
|------|------|------|
| feature_spec 工作流 | ✅ 通过 | 第 3/4/6 轮验证 |
| bugfix_spec 工作流 | ✅ 通过 | 第 5/7 轮验证 |
| quick_change 工作流 | ✅ 通过 | 第 8/9 轮验证（效率待 V2 优化） |
| design_first 工作流 | ⚪ 未测试 | 留到 V2 |
| 状态机合法性检查 | ✅ 通过 | 第 7 轮起无非法直跳 |
| Gate 回退重试 | ✅ 通过 | design_gate fail → 回退 → pass |
| Review Repair Loop | ✅ 通过 | 第 4 轮验证 |
| 子 Agent 调度 | ✅ 通过 | 所有 8 个 Agent 被正确调度 |
| Gate 权限隔离 | ✅ 通过 | 第 7 轮起子 Agent 不再调 Gate |
| work_log.md 生成 | ✅ 通过 | 第 7 轮起全部生成 |
| run_id 唯一性 | ✅ 通过 | 第 9 轮验证 |
| archive_path 传递 | ✅ 通过 | 第 7 轮起全部传递 |
| sf_doctor 自检 | ✅ 通过 | 每轮启动时执行 |
| 留痕审计 | ✅ 通过 | events/trace/tool_calls 完整 |

### V1 已知限制（不修，留 V2）

| 编号 | 限制 | 根因 |
|------|------|------|
| LIM-001 | result_preview 全为空 | OpenCode 平台限制 |
| LIM-002 | agent.completed 中 agent=unknown | OpenCode 平台限制 |
| LIM-003 | 工具失败没有 exit_code/status | OpenCode hook 数据限制 |
| LIM-004 | verifier 用 bash 写文件（edit=deny 与产物要求冲突） | 架构矛盾，V2 需 artifact writer |
| LIM-005 | verifier 现场生成脚本和报告导致慢 | 需固定模板 + 结构化 JSON |
| LIM-006 | work_log toolcall 统计不可信（Agent 自报） | 需 Orchestrator 从 trace 自动生成 |
| LIM-007 | Quick Change 总耗时 8 分钟（目标 5 分钟） | 受 LIM-004/005/006 制约 |

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
| 权限弹窗 | 🟢 | 第 4 轮 | 已修复，第 4 轮无弹窗 |

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
| ISS-011 | 权限弹窗（agent .md frontmatter 覆盖 opencode.json） | 中 | ✅ 已修复已验证（第 4 轮无弹窗） |
| ISS-012 | 子 Agent 越权调用 sf_state_transition | 中 | ✅ 已修复：所有子 Agent 增加"禁止调用 sf_state_transition"约束 |
| ISS-013 | 验证体系深度不足 | 高 | 📌 V1 完整版：verification 通过但实际功能不可用（WI-2 添加按钮无效），需增加端到端测试 |
| ISS-014 | install.ps1 未复制 V1 Complete 新增文件 | 中 | ✅ 已修复：改为动态扫描所有 Plugin 和 Skill 目录 |
| ISS-015 | sf-requirements bugfix 模式浪费 steps 写测试脚本 | 高 | ✅ 已修复：增加 Bugfix 分析模式约束（禁止写测试脚本、禁止安装依赖） |
| ISS-016 | 子 Agent 工作日志缺失（archive_path 未传递） | 中 | ✅ 已修复：7 个子 Agent 增加工作日志要求，Orchestrator 增加 archive_path 传递协议 |
| ISS-017 | sf-verifier 未优先写 verification_report.md | 高 | ✅ 已修复：增加核心产出优先级约束（必须尽早写 verification_report.md） |
| ISS-018 | sf-reviewer 未生成 work_log.md（edit=deny 无法用 write 工具） | 高 | ✅ 已修复：强化 prompt，明确要求用 bash Set-Content 写入 |
| ISS-019 | Orchestrator 尝试 requirements → design 直跳 | 高 | ✅ 已修复：Gate pass 后强制两步流转模板，禁止试错式跳转 |
| ISS-020 | 子 Agent 越权调用 Gate 工具 | 中高 | ✅ 已修复：所有子 Agent 增加"禁止调用 Gate 工具"约束 |
| ISS-021 | verification_gate 语义不一致（先流转再调 gate） | 中高 | ✅ 已修复：统一 Gate 调用顺序（先调 Gate 工具 → 确认 pass → 再流转状态） |
| ISS-022 | prompt 中没有显式 run_id | 中 | ✅ 已修复：调度模板增加 run_id 和 agent_type 字段 |
| ISS-023 | Gate 结果 result_preview 为空 | 低 | 📌 OpenCode 平台限制（ISS-010 同源） |
| ISS-024 | agent.completed 中 agent=unknown | 低 | 📌 OpenCode 平台限制（ISS-009 同源） |
| ISS-025 | 工具失败没有 exit_code/status | 低 | 📌 OpenCode hook 数据限制 |

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
| Agent 体系 | ✅ 7/8 通过（debugger 未测试） | 子 Agent 越权流转状态（ISS-012） | |
| Custom Tools | ✅ 全部通过 | Gate 格式匹配已修复 | |
| Plugin | ✅ 核心功能通过 | result_preview 为空（平台限制）、conversations.jsonl 待验证 | |
| Skills | 🟢 brainstorming 确认使用 | verification skill 待确认 | |
| 工作流 | ✅ 完整闭环 + Gate fail 重试 + Review Repair Loop + 多 Work Item | executor 失败→debugger 场景未触发 | |
| 留痕审计 | ✅ events.jsonl 24 条完整记录 | | |
| 安装部署 | ✅ 全部通过，权限弹窗已消除 | | |
| 验证体系 | 🟡 结构性检查通过 | 需增加端到端功能测试（ISS-013） | |
