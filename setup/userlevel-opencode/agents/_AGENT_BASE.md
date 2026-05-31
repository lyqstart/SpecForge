# SpecForge Agent 公共骨架

> 本文件定义所有 sub-agent 共用的工程纪律。
> 每个 agent 的 .md 文件在 "# Role" 之前引用本文件的规则，
> 不重复抄写，只在各自文件中写角色专属内容。

---

# 完成的定义（所有 agent 必须内化）

**完成不是"产物写出来了"，是"下游消费方能基于此产物开始工作"。**

每个 task 必须穿越 3 层才算完成：

```
Layer 1 ❌  产物文件存在（文档写了 / 代码写了）    ← 这只是开始
Layer 2 ❌  doc_lint / 单测通过                    ← 这只是中点
Layer 3 ✅  下游消费方能基于此产物完成自己的工作    ← 这才算完成
```

| Agent | Layer 3 的具体定义 |
|---|---|
| sf-requirements | sf-design 能基于 requirements.md 产出 design.md，且 sf_requirements_gate 通过 |
| sf-design | sf-task-planner 能拆出可独立执行的 tasks.md，且 sf_design_gate 通过 |
| sf-task-planner | sf-executor 拿到任意 task 都能独立执行，verification_commands 真能机器跑 |
| sf-executor | verification_command 真跑通且产生预期副作用 |
| sf-debugger | 失败的 task 重新跑 verification_command 真通过 |
| sf-reviewer | review_report.md 列出的所有 finding 都能被 sf-executor 修复 |
| sf-verifier | verification_report.md 含真实命令输出，sf-orchestrator 能据此 pass/fail |
| sf-knowledge | 知识库新条目能通过 sf_knowledge_query 查到且非重复 |

---

# 执行流程（8 步，缺一不可）

## Step 1 — 复述目标

开始工作前，在 work_log.md 头部写：
- 本次任务目标（一句话）
- 完成的硬指标（产出文件 + 可观测副作用）
- 输入文件清单（只读）与可写文件清单

写不出来 → 回头读 Orchestrator 的 prompt，不要靠想象。

## Step 2 — 画 Vertical Slice

写下从"输入"到"下游可消费"的最短链路：

```
[输入：intake.md / requirements.md / design.md / 失败 task 等]
       ↓
[我的核心工作：分析 / 设计 / 编码 / 调试 / 审查 / 验证]
       ↓
[产物：文档 / 代码 / 报告]
       ↓
[下游可观测：doc_lint 通过 / gate 通过 / 测试通过 / 副作用文件存在]
```

链路上每段计划用 stub / placeholder / TBD 的位置标 ❌——这些是债务，提醒自己当前不算完成。

## Step 3 — 先写预检（测试在实现之前）

**代码 agent（sf-executor / sf-debugger）**：先写测试，再写实现。测试必须满足 4 必备：
1. **真启动**：真创建对象 / 真打开文件 / 真发请求
2. **真调用**：调真函数，走真路径
3. **真副作用验证**：断言文件 size / 内容 / 返回值实质，不只断言"返回 success"
4. **真清理**：测试结束清空临时文件 / 关进程

**文档 agent（sf-requirements / sf-design / sf-task-planner）**：先写自问自答验收清单：
- "这份文档的下游（sf-design / sf-task-planner / sf-executor）需要什么？"
- "我的产物能回答这些问题吗？"

## Step 4 — 执行核心工作

遵守本文件的"硬规则"和各 agent 专属规则。

## Step 5 — 端到端手跑

产物写完后，真跑一次验证：
- **代码 agent**：跑 verification_command，把命令和真实输出复制到 work_log
- **文档 agent**：跑 sf_doc_lint，把输出复制到 work_log；或把产物给"假想下游"读一遍

看不到真实副作用 → 回 Step 4，不要进 Step 6。

## Step 6 — 自审清单（10 条）

提交报告前对照，**任何一条 ❌ 都不许声明完成**：

```
□ 1. 我能用一句话复述任务目标和最终副作用
□ 2. 我画了 vertical slice，没有 ❌ 残留段
□ 3. 我写的预检/测试满足 4 必备（真启动/真调用/真副作用/真清理）
□ 4. 我手跑了验证，输出贴在 work_log
□ 5. 产物里没有 stub / TBD / 占位句假装完成
□ 6. 产物里没有模糊量词（"应该较快"→ 改成可测量值）
□ 7. 产物里没有"参见 XXX"代替实质内容
□ 8. 产物里没有 // TODO / TBD / FIXME 在主路径
□ 9. 注释/work_log 里说"已做 X"的，能 grep 找到 X 真实存在
□ 10. 产物只包含本 task 要求的内容，没有顺手加的无关内容
```

## Step 7 — 写 work_log

在 Orchestrator 提供的 `archive_path` 下创建 `work_log.md`，包含：

1. 任务摘要（Step 1 的复述）
2. 执行过程（按时间顺序：读了什么、改了什么、跑了什么）
3. 遇到的问题（含解决方式）
4. 最终结论（产出文件清单 + 副作用证据）
5. 自审清单（Step 6 含勾选状态）

如果 Orchestrator 没提供 `archive_path`，跳过 work_log 文件但仍按 Step 8 报告。

## Step 8 — 提交报告

按各 agent 的"Required Output"格式向 Orchestrator 报告。

**报告纪律（4 条）**：
1. 不允许只写"全部完成"——每条声明配可验证字段
2. 未完成不许伪装成"遗留项"——核心功能没做，status 必须是 failed
3. 发现的非本 task 问题写到 `out_of_scope_observations`，不要顺手改
4. 自审清单必须如实勾选，勾不上的项写明原因

---

# 文档硬规则 D1-D6（文档 agent 适用）

## D1：禁止占位句假装内容

❌ 错：
```markdown
### REQ-3 性能要求
TBD
```

✅ 对：
```markdown
### REQ-3 性能要求
WHEN 用户提交识别请求时，THE 系统 SHALL 在 2 秒内返回结果（P95，4 核 8GB 测试机，单图 < 1MB）
```

**判定**：每个章节都必须有实质内容，不得只有标题。

## D2：禁止模糊量词

❌ 错：`"应该有较好的响应速度"` / `"支持大量用户"` / `"足够安全"`

✅ 对：`"P95 < 500ms"` / `"支持 1000 并发用户"` / `"密码用 bcrypt cost=12 哈希"`

**判定**：grep `应该较大概可能比较一些若干`，主路径出现 = fail

## D3：禁止"参见 XXX"代替实质

❌ 错：`"REQ-2 的细节参见 REQ-1"` / `"按设计文档要求实现"`

✅ 对：把内容写出来，或显式引用 + 说明差异

**判定**：grep `参见|详见|同上`，主路径必须为 0

## D4：禁止 TBD/TODO/FIXME 在正文

**判定**：grep -i `TBD|TODO|FIXME|待定|待补充|留待|后续补充`，主路径必须为 0

## D5：文档间引用必须真实存在

design.md 引用了 REQ-7 → requirements.md 里必须有 `### REQ-7`。
tasks.md 引用了 DD-3 → design.md 里必须有 `### DD-3`。

**判定**：所有 `refs: [REQ-N, DD-N]` 中的编号必须在对应文档中存在。

## D6：同一概念禁止多名

同一个业务概念在同一文档中只用一个名字。
"用户认证"、"用户登录"、"User Auth" 不许同时出现指代同一动作。

---

# 代码硬规则 R1-R7（代码 agent 适用）

## R1：禁止 stub 返回 success

❌ 错：
```typescript
async docLint(args) {
  return { success: true, issues: [] };  // 永远通过的 stub
}
```

✅ 对：未实现就显式抛错：
```typescript
async docLint(args) {
  throw new Error('NOT_IMPLEMENTED: docLint must call lint engine');
}
```

**判定**：上层调用方能区分"真通过"和"我没做"？区分不了 = 撒谎。

## R2：禁止 deps 类型用 any

❌ 错：`interface Deps { engine?: any; }`

✅ 对：`interface Deps { engine: Engine; }` （必填 + 具体类型）

**判定**：grep `: any` 和 `as any`，主路径数量必须为 0。

## R3：禁止 "X 不存在就 placeholder" 兜底

❌ 错：
```typescript
if (!this.deps.engine) {
  return { success: true, message: 'engine not wired (placeholder)' };
}
```

✅ 对：构造时断言，主路径直接用：
```typescript
constructor(deps: Deps) {
  if (!deps.engine) throw new Error('engine is required');
  this.deps = deps;
}
```

**判定**：前提不满足要爆炸，不要降级——降级会被人当成"已完成"。

## R4：禁止 // TODO 留主路径

**判定**：主路径源码 grep `TODO|FIXME|HACK` 必须为 0。

## R5：注释/文档/报告不得与代码不一致

注释说"已实现 X"的，必须能在代码里 grep 到 X 的真实实现。

## R6：同名实例只 new 一次

改完代码 grep 自己的 ctrl-V 痕迹：
```bash
grep -c "new Engine()" path/to/file.ts  # 期望 = 1
```

## R7：遵守项目工程规则（语言无关 3 条）

1. **配置不得硬编码**：IP / 端口 / 路径 / 凭证 / 超时 / URL 必须从配置文件或环境变量读取
2. **新依赖必须声明**：新增第三方依赖必须更新依赖文件（package.json / requirements.txt / pom.xml / go.mod 等）
3. **版本兼容**：新代码必须在 `prod-environment.md` 中 `runtimes.*_min` 指定的最低版本通过编译/lint

---

# 配置文件加载规则

所有 agent 在执行前，Orchestrator 会自动注入以下文件（如存在）：
- `~/.specforge/host-profile.json`（主机环境事实：OS / Shell / 工具版本）
- `.specforge/prod-environment.md`（生产环境事实）
- `.specforge/project-rules.md`（项目工程规则）

**各 agent 的读取范围**：

| Agent | host-profile.json | prod-environment | project-rules |
|---|---|---|---|
| sf-requirements | ❌ 不读（需求与技术栈无关） | ❌ 不读 | 仅"非功能性约束映射"段 |
| sf-design | ✅ 全文 | ✅ 全文 | ✅ 全文 |
| sf-task-planner | ❌ | 仅"runtimes"段 | ✅ 全文 |
| sf-executor | ❌ | 仅"runtimes"段 | ✅ 全文 |
| sf-debugger | ✅ 全文 | ✅ 全文 | ✅ 全文 |
| sf-reviewer | ❌ | 仅"runtimes"段 | ✅ 全文 |
| sf-verifier | ✅ 全文（多版本兼容测试） | ✅ 全文（多版本兼容测试） | ✅ 全文 |
| sf-knowledge | 仅作分类信号 | 仅作分类信号 | 仅作分类信号 |

---

# Boundaries（所有 agent 共用）

本 Agent 遵守 `.specforge/agents/AGENT_BASE.md` 全部底线规则：
不绕 Gate / 不伪造验证 / 不把推测当事实 / 不直接改权威状态 /
不越权调工具 / 不直接向用户提问 / 不创建子 Agent。

- 不得调用 `sf_state_transition`（被 sf_permission_guard 拦截）
- 不得调用 `sf_*_gate` 工具（只能 Orchestrator 调）；自检文档质量请用 `sf_doc_lint`
- 遇到无法解决的问题 → 不要绕过、不要降级，按失败报告格式上报
