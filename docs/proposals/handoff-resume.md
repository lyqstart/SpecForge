# Handoff Prompt — 会话中断后的续接

> **本文件用法**：上一个会话因 token 上限或其他原因中断，新开会话后让 sf-orchestrator 接续之前的工作。

---

## 你在新会话里要说什么

### 推荐说法（一行搞定）

```
请阅读 docs/proposals/handoff-resume.md 并按指令续接之前的 SpecForge 治理工作。
```

### 备选说法（如果上面的太短模型不重视）

```
之前的会话因 token 上限中断了，请你接手继续。
具体做法请严格按 docs/proposals/handoff-resume.md 执行。
不要重新设计或重新规划，只接续未完成的部分。
```

---

## sf-orchestrator 收到这条指令后该做什么

> **本节是给 orchestrator 看的执行协议**

### Step 1：先走启动流程（必须）

按 sf-orchestrator 的"启动流程"完成步骤 0-4，**但不要在 intake 阶段重新问需求**——本文件后续会告诉你上下文。

### Step 2：读取所有 Work Item 状态

```
调用 sf_state_read(work_item_id="all")
```

按照状态判断当前进展：

| 看到 | 含义 | 你要做什么 |
|---|---|---|
| WI-010 completed | P0 完成 | 看是否有 WI-011 |
| WI-011 不存在 | P0 完成、P1 未启动 | **执行** `docs/proposals/handoff-p1.md` |
| WI-011 状态 ≠ completed | **P1 进行中，被中断** | **续接 P1（见 Step 3）** |
| WI-011 completed | P1 完成 | 看是否有 WI-012 |
| WI-012 不存在 | P1 完成、P2 未启动 | **执行** `docs/proposals/handoff-p2.md` |
| WI-012 状态 ≠ completed | **P2 进行中，被中断** | **续接 P2（见 Step 3）** |
| WI-012 completed | 三阶段全完成 | **执行** `docs/proposals/handoff-final-verification.md` |

### Step 3：续接进行中的 WI（关键）

如果发现某个 WI 在中间状态（不是 completed 也不是 blocked），按以下顺序还原上下文：

#### 3.1 读 WI 当前阶段的产物文件

```
查看 .specforge/specs/<WI-XXX>/ 目录下已有的文件
按文件存在情况判断进度：
  - 只有 intake.md → 卡在 intake → requirements 流转
  - 有 requirements.md / refactor_analysis.md → 卡在需求/分析阶段后
  - 有 design.md / refactor_plan.md → 卡在设计阶段后
  - 有 tasks.md → 卡在任务规划后
  - 有 review_report.md → 卡在 review 后
  - 有 verification_report.md → 卡在验证后
```

#### 3.2 读 sub-agent 归档（看历史细节）

```
查看 .specforge/archive/agent_runs/<WI-XXX>-* 下的所有目录
每个目录的 work_log.md 含上次 sub-agent 的工作记录、遇到的问题、产出文件
找出最后一次 sub-agent 的输出，理解上次卡在哪个具体任务
```

#### 3.3 读 handoff 文件了解原始计划

```
- WI-010 (P0) 续接 → 读 .specforge/specs/WI-010/refactor_plan.md（已有完整 T1-T6 任务表）
- WI-011 (P1) 续接 → 读 docs/proposals/handoff-p1.md（含 T1-T11 任务清单）+ .specforge/specs/WI-011/tasks.md（如果已生成）
- WI-012 (P2) 续接 → 读 docs/proposals/handoff-p2.md（含 T1-T8 任务清单）+ .specforge/specs/WI-012/tasks.md
```

#### 3.4 对照已完成和未完成的任务

把"任务计划清单" 与 "已完成的产物" 做交集对比，明确：

- 已完成的任务（保留产物，**不要重做**）
- 未完成的任务（这是本次会话要做的）
- 部分完成的任务（看 work_log 判断要不要从头还是续做）

#### 3.5 向用户报告续接计划

在动手前，**先用一段精简的话告诉用户**：

```
检测到 WI-XXX 在 [当前阶段] 被中断。

已完成部分：
- ✅ T1：...（产物：xxx.ts）
- ✅ T2：...（产物：yyy.md）

未完成部分：
- ⏳ T3：...（计划做这个）
- 📋 T4：...
- 📋 T5：...

我将从 T3 开始续接。预计本次会话能完成 T3-T5（不会一次做完所有剩余任务，避免再次 context 耗尽）。

是否同意？[y/n]
```

等用户确认后再动手。**不要默默接着干**——给用户一个否决的机会，万一她想换策略。

### Step 4：分批推进，每批留充足余量

每个 sub-agent 派单后：
- 验证产物
- 流转状态
- **如果发现当前会话已用 token 超过 60%**，立即把工作日志写好，向用户报告"建议本次会话停下，下次再续接"

---

## 常见中断场景与续接策略

### 场景 1：在 development 阶段中断（最常见）

**症状**：WI 状态 = development，但 tasks.md 里某些 task 未完成。

**续接做法**：
1. 读 `tasks.md` 看任务清单
2. 读 archive 看哪些 task 已被 executor 处理
3. 对比 KG 看哪些 code_file 节点已建（说明对应文件已动过）
4. 用 grep/sf_safe_bash 验证文件实际状态
5. 派 executor 续接剩余任务

### 场景 2：在 review/verification 阶段中断

**症状**：WI 状态 = review 或 verification，但 review_report.md / verification_report.md 不存在或不完整。

**续接做法**：
1. 重新调度 sf-reviewer / sf-verifier
2. 不需要重做之前阶段的工作（development 已完成）

### 场景 3：在 Gate 失败的修订循环中中断

**症状**：状态在 development、review、verification 间反复跳动，伴随 archive 多次 executor/reviewer run。

**续接做法**：
1. 读最新 Gate 调用的 blocking_issues
2. 派 sub-agent 专项修复 blocking_issues
3. 不要重新跑早已 pass 的 Gate

### 场景 4：在 KG 同步或 state_transition 失败时中断

**症状**：sub-agent 报告完成但 state_transition 失败（比如 development → verification 守卫拒绝）。

**续接做法**：
1. 用 sf_state_read 看当前实际状态
2. 用 handoff-p1.md / handoff-p2.md 中的"已知 SpecForge bug 规避方法"绕过
3. 例如：risk_path 守卫拒绝 → 走 development → review → verification 路径

---

## ⚠️ 续接时绝对不要做的事

| 错误做法 | 正确做法 |
|---|---|
| ❌ 重新读 handoff 文件然后从头开始 | ✅ 先看 sf_state_read 知道在哪儿，再针对性续接 |
| ❌ 假设上次的产物有问题，重新生成 | ✅ 默认上次产物有效，只补未完成部分 |
| ❌ 试图一次会话做完所有剩余任务 | ✅ 评估剩余 token，分批推进，留 30% 余量给收尾 |
| ❌ 跳过启动流程直接干活 | ✅ 仍然走启动流程步骤 0-4（这是 orchestrator 的硬规则） |
| ❌ 重新设计方案或重新规划 | ✅ 严格按原 handoff 文件的任务清单 |

---

## 用户给 orchestrator 的最简续接提示词（重复在此方便复制）

**首选**：
```
请阅读 docs/proposals/handoff-resume.md 并按指令续接之前的 SpecForge 治理工作。
```

**如果模型反应迟钝**：
```
之前会话因 token 上限中断了。请你接手继续，但严格按 docs/proposals/handoff-resume.md 执行。
不要重新设计或重新规划，只接续未完成的部分。开始前先告诉我续接计划，等我确认。
```

**如果你知道上次卡在具体哪步**（比如你看到对话历史里 P1 跑到 T5 卡住）：
```
之前会话因 token 上限中断在 WI-011 P1 的 T5（setup/ 搬迁）附近。
请按 docs/proposals/handoff-resume.md 续接，从 T5 开始。先告诉我续接计划。
```

---

## 终极保险：手动检查清单

如果你担心 orchestrator 续接不准确，你（用户）可以**在新会话开始前自己手动跑这些命令**确认当前状态：

```powershell
# 1. 看所有 WI 状态
cd D:\code\temp\SpecForge

# 2. 看每个 WI 的产物文件
ls .specforge/specs/WI-010/
ls .specforge/specs/WI-011/
ls .specforge/specs/WI-012/

# 3. 看最近的 archive
ls .specforge/archive/agent_runs/ | Sort-Object LastWriteTime -Descending | Select-Object -First 5

# 4. 看 daemon 健康
# （在新会话里调 sf_doctor 也行）
```

然后在新会话里告诉 orchestrator 你看到的状态：
```
当前状态：WI-011 在 development 阶段，已完成 T1-T4（看 specs/WI-011/ 有 xxx），
T5 setup/ 搬迁未开始。请从 T5 续接。
```

明确的上下文 + 明确的起点 = 续接最稳。
