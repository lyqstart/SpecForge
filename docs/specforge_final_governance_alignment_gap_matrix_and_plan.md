# SpecForge Final Governance Alignment：设计标准对标审计与一次性改造方案

> 日期：2026-06-20  
> 目标：不再按旧规则渐进式补洞，直接把当前代码改造成最终设计标准要求的系统。  
> 适用分支：`hardening/v1.1.3-daemon-control-plane-alignment`  
> 核心原则：旧代码、旧规则、旧流程只作为待改造对象，不作为验收标准。

---

## 1. 目标重申

本任务的目标不是：

```text
保持旧流程还能 closed；
逐个补旧代码漏洞；
兼容旧规则；
旧规则回归通过就算完成。
```

本任务的目标是：

```text
把现有代码直接改成最终设计标准要求的运行系统；
删除或废弃不符合最终标准的旧逻辑；
统一 daemon、wrapper、Agent、Skill、installer、live runtime 的职责与接口；
用最终规则的正向和负向测试验证。
```

旧规则测试只允许作为最后的兼容风险观察，不能作为主验收。

---

## 2. 设计标准的最终目标

根据 SpecForge 最终融合标准，系统必须满足以下最终规则。

### 2.1 Work Item 是唯一变更事务入口

```text
任何变更只能通过 Work Item 事务进入系统；
禁止无 WI 直接修改代码或正式规格；
所有变更都必须有 intake / classification / impact / trigger / tasks / trace / audit / verification / close。
```

### 2.2 状态权威唯一

```text
events.jsonl / StateManager = 唯一权威状态事件源；
runtime/state.json = 从权威事件投影生成的运行缓存；
work_item.json = WI 元数据档案，不是状态源。
```

### 2.3 最终状态机唯一

最终主状态必须是：

```text
created
intake_ready
impact_analyzing
impact_analyzed
workflow_selected
candidate_preparing
candidate_prepared
gates_running
gates_failed
approval_required
approved
merge_ready
merging
merged
post_merge_verified
implementation_ready
implementation_running
implementation_done
verification_running
verification_done
closed
blocked
rejected
superseded
```

旧状态不得作为运行主链路，例如：

```text
intake
requirements
requirements_gate
design_gate
tasks_gate
development
review
bugfix_analysis
bugfix_gate
fix_design
```

这些只能被删除、迁移或作为只读 legacy 输入，不得继续驱动流程。

### 2.4 workflow_type 与 workflow_path 分离

```text
workflow_type = 具体工作流身份；
workflow_path = 治理路径。
```

示例：

```text
feature_spec + requirement_change_path
bugfix_spec + requirement_change_path
quick_change + code_only_fast_path
```

daemon 不得因为 `workflow_path=requirement_change_path` 就把 `bugfix_spec` 静默改成 `feature_spec`。

### 2.5 Candidate 与正式规格分离

```text
Candidate 必须位于当前 WI 的 candidates/** 下；
Candidate 不能直接覆盖 .specforge/project/**；
candidate_manifest entries 必须引用 canonical candidates path；
Merge Runner 才能把 Candidate 写入正式 project spec。
```

### 2.6 User Decision 权威

```text
用户审批只能由 sf_user_decision_record 记录；
user_decision.json 是唯一审批产物；
user_approved 必须携带 user_response_quote；
auto_approved 必须携带 auto_approval_policy_id；
Orchestrator 不得代替用户批准；
work_item.json 不得承载审批字段。
```

### 2.7 Code Permission / Write Guard 权威

```text
代码只能在 code_permission_service 授权后写入；
executor 只能写 allowed_write_files；
executor 不得写 .specforge/work-items/** 治理产物；
changed_files_audit 必须统计越界写入和 blocked_write_attempts；
close_gate 必须检查 code_permission revoked、blocked_write_attempts=0。
```

### 2.8 Tool Contract 权威

```text
daemon handler 要求的字段，OpenCode wrapper 必须暴露；
setup 源、installer、live 用户目录、当前运行 schema 必须一致；
wrapper 修改后必须重启 OpenCode；
不能只修 live 文件；
不能让 Agent 用 comments/reason 伪装结构化字段。
```

### 2.9 Agent / Skill 只描述最终流程

```text
Agent/Skill 文档不得保留旧状态、旧 gate_type、旧 mode、旧 bugfix.md 主链路；
发现工具缺口必须阻断并报告；
不得用 shell、work_item、手写 JSON 绕过受控工具。
```

---

## 3. 当前代码差距矩阵

| 编号 | 最终规则 | 当前代码/行为 | 差距等级 | 处理方式 |
|---|---|---|---|---|
| G-01 | 最终状态机唯一 | `state_machine.ts` 仍保留旧状态和旧 workflow transition table | 严重 | 删除旧状态主链路；只保留 v1.1 最终状态机；旧状态只做 migration/read-only |
| G-02 | `workflow_type` 不得被 `workflow_path` 覆盖 | 当前仍存在 `WORKFLOW_PATH_TO_TYPE` default 映射，`requirement_change_path` 默认 feature_spec | 严重 | 改为 compatibility matrix；兼容则保留，不兼容则拒绝 |
| G-03 | bugfix_spec 是真实 workflow_type | bugfix Skill 仍含 `bugfix.md`、`bugfix_gate`、`fix_design`、`gate_type/mode` 旧协议 | 严重 | bugfix_spec 改为标准 Candidate 四件套，不保留旧 bugfix.md 主链路 |
| G-04 | User Decision 只能由 recorder 写入 | V12 实测暴露 wrapper 不支持字段，Agent 试图用 work_item 写审批 | 严重 | 修 wrapper/setup/live/installer；禁止 work_item 写 decision 字段 |
| G-05 | `user_approved` 必须有 `user_response_quote` | daemon 有校验，但 setup wrapper 未同步字段 | 严重 | wrapper schema 加字段，自检 live schema，重启 OpenCode |
| G-06 | `auto_approved` 必须有 `auto_approval_policy_id` | daemon 有校验，但 wrapper 未同步字段，policy schema 不完整 | 严重 | 定义 auto_approval_policies schema；wrapper 加字段；负向测试 |
| G-07 | Candidate manifest entries 只能是 `candidates/**` | artifact-write 有 canonicalize，但 bugfix 实测 trace_delta 仍出现 WI 根路径 | 中-严重 | Gate 层硬拒绝非 candidates path；artifact-write 不再容忍旧 path |
| G-08 | `work_item.json` 不是状态/审批源 | artifact-write 支持写 work_item，且 normalize 时仍写 status | 严重 | 移除新写 status；禁止 decision 字段；close_gate 检查污染 |
| G-09 | gate_summary 后 Candidate/Gate 冻结 | 目前主要依赖流程约束，冻结不够系统 | 中 | 增加 artifact write freeze guard |
| G-10 | Merge Runner 只读 user_decision.json | 需要确认 merge_ready_gate / merge runner 不读 work_item 决策字段 | 中 | merge 前强制验证 user_decision hash / gate_summary hash |
| G-11 | Executor 不得写治理产物 | V11.3 已基本实现，但需纳入最终规则测试 | 中 | 保留实现，增加负向测试 |
| G-12 | Agent/Skill 不保留 legacy | Orchestrator / bugfix skill 仍出现 legacy 描述和旧状态 | 严重 | 重写相关 Agent/Skill，只保留最终流程 |
| G-13 | Tool wrapper 与 daemon 契约一致 | 当前已出现 daemon 要字段、wrapper 无字段的问题 | 严重 | 增加 wrapper contract self-check |
| G-14 | live runtime 与 setup 一致 | quick-change 是现场修 live wrapper 后才过 | 严重 | 安装源、补丁包、live 同步并强制自检 |
| G-15 | 正向/负向测试覆盖最终规则 | 现有测试仍偏“能 closed” | 严重 | 建立最终规则测试矩阵，正向+负向同时跑 |

---

## 4. 一次性改造范围

本次不再叫 V13 小修，命名为：

```text
Final Governance Alignment
```

目标：一次性对齐最终标准。

---

## 5. 需要直接修改/重写的文件组

### 5.1 Runtime / State / Workflow

```text
packages/daemon-core/src/tools/lib/state_machine.ts
packages/daemon-core/src/tools/lib/state-machine-v11.ts
packages/daemon-core/src/tools/handlers/sf-state-transition.ts
packages/daemon-core/src/tools/handlers/sf-v11-work-item-create.ts
packages/daemon-core/src/tools/lib/state-coordinator-v11.ts
```

要求：

```text
1. v1.1 最终状态机成为唯一运行状态机；
2. 删除旧状态主链路；
3. workflow_type / workflow_path 分离；
4. 添加 workflow compatibility matrix；
5. 禁止 legacy intake；
6. 创建只能进入 created；
7. 空 work_item_id 拒绝，创建时省略则 daemon 分配。
```

---

### 5.2 User Decision / Approval

```text
packages/daemon-core/src/tools/handlers/sf-v11-decision.ts
packages/daemon-core/src/tools/lib/user-decision-recorder-v11.ts
packages/daemon-core/src/tools/lib/governance-invariants-v11.ts
setup/userlevel-opencode/tools/sf_user_decision_record.ts
```

要求：

```text
1. user_approved 必须有 user_response_quote；
2. auto_approved 必须有 auto_approval_policy_id；
3. comments/reason 不得替代结构化字段；
4. wrapper schema 暴露字段；
5. wrapper payload 透传；
6. user_decision.json 是唯一审批产物；
7. user_decision_record 才能推进 approval_required → approved；
8. 缺字段时 retry_allowed=true，但不得推进状态。
```

---

### 5.3 Artifact Authority

```text
packages/daemon-core/src/tools/handlers/sf-artifact-write.ts
packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts
packages/daemon-core/src/tools/lib/artifact-schema-validation.ts
packages/daemon-core/src/tools/lib/governance-invariants-v11.ts
```

要求：

```text
1. sf_artifact_write 不允许写 user_decision；
2. sf_artifact_write 不允许通过 work_item 写 decision 字段；
3. work_item.json 不再写新 status；
4. gate_summary_gate 后冻结 Candidate / Manifest / Gate / Summary；
5. Candidate manifest entries 只允许 candidates/**；
6. code_only_fast_path entries 必须为空；
7. trace_delta candidate 必须是 candidates/trace_delta.md。
```

---

### 5.4 Gate / Merge / Close

```text
packages/daemon-core/src/tools/lib/gate-chain.ts
packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts
packages/daemon-core/src/tools/handlers/sf-v11-merge.ts
packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts
packages/daemon-core/src/tools/lib/merge-runner-v11.ts
packages/daemon-core/src/tools/lib/close-gate.ts
```

要求：

```text
1. Gate Summary 后冻结；
2. merge_ready_gate 只读 user_decision.json；
3. Merge Runner 禁止读聊天/Agent comments/work_item decision 字段；
4. close_gate 检查 work_item.json 不含审批伪字段；
5. close_gate 检查 user_decision hash / candidate_manifest / gate_summary 绑定；
6. close_gate 检查 code_permission revoked；
7. close_gate 检查 blocked_write_attempts=0。
```

---

### 5.5 Tool Wrapper / Setup / Installer / Live

```text
setup/userlevel-opencode/tools/sf_user_decision_record.ts
setup/userlevel-opencode/tools/*.ts
setup/userlevel-opencode/agents/*.md
setup/userlevel-opencode/skills/*/SKILL.md
setup / installer 复制清单
```

要求：

```text
1. daemon 要求字段，wrapper 必须暴露；
2. setup 源和 live 文件一致；
3. installer 部署新 wrapper；
4. 补丁脚本自检 live wrapper；
5. README 明确 OpenCode 需要重启；
6. 不允许只修 live。
```

---

### 5.6 Agent / Skill

```text
setup/userlevel-opencode/agents/sf-orchestrator.md
setup/userlevel-opencode/agents/sf-requirements.md
setup/userlevel-opencode/agents/sf-design.md
setup/userlevel-opencode/agents/sf-task-planner.md
setup/userlevel-opencode/agents/sf-executor.md
setup/userlevel-opencode/agents/sf-verifier.md
setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md
setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md
```

要求：

```text
1. 删除旧状态、旧 gate_type、旧 mode；
2. 删除 bugfix.md 主链路；
3. 所有 workflow 统一最终主链路；
4. bugfix_spec 使用 Candidate 四件套；
5. quick_change 仍必须 WI + audit + verification + close_gate；
6. Orchestrator 不得绕过 tool schema；
7. 工具缺口必须阻断，不得 shell 修 live；
8. 用户审批必须等待明确用户回复。
```

---

## 6. 最终规则测试矩阵

### 6.1 正向实际项目测试

#### P1：feature_spec / requirement_change_path

输入：

```text
新增 about 页面，并在首页加入跳转链接。about 页面需要有 h1 标题 About，首页需要有一个能跳转到 about.html 的链接。
```

必须断言：

```text
workflow_type=feature_spec
workflow_path=requirement_change_path
Candidate entries 全部 candidates/**
trace_delta candidate = candidates/trace_delta.md
user_response_quote="批准"
user_decision.json 存在
approval_required → approved actor=user_decision_recorder
merge_report success
post_merge_gate passed
changed_files_audit passed
blocked_write_attempts=0
close_gate passed
final closed
```

#### P2：bugfix_spec / requirement_change_path

输入：

```text
修复 src/calculator.js 中 add 函数的 bug，让 npm test 或 node tests/calculator.test.js 通过。不要新增无关功能。
```

必须断言：

```text
workflow_type=bugfix_spec
workflow_path=requirement_change_path
不得映射成 feature_spec
不得使用旧 bugfix.md 主链路
Candidate 四件套存在
user_response_quote="批准"
只修改 src/calculator.js
tests/calculator.test.js 不变
package.json 不变
npm test pass
final closed
```

#### P3：quick_change / code_only_fast_path

输入：

```text
把 index.html 里的 h1 文本从 hello 改为 hello v1.1.3，并给 h1 增加蓝色样式。不要新增页面，不要新增功能。
```

必须断言：

```text
workflow_type=quick_change
workflow_path=code_only_fast_path
candidate_manifest.entries=[]
merge_report.status=not_applicable
user_approved 带 user_response_quote 或 auto_approved 带 auto_approval_policy_id
只修改 index.html
changed_files_audit passed
final closed
```

---

### 6.2 负向测试

#### N1：user_approved 缺 user_response_quote

预期：

```text
sf_user_decision_record 失败
code=USER_APPROVAL_EVIDENCE_REQUIRED
状态仍 approval_required
不生成有效 user_decision.json
```

#### N2：user_response_quote 写在 comments

预期：

```text
失败
不得解析 comments 中的伪字段
```

#### N3：auto_approved 缺 auto_approval_policy_id

预期：

```text
失败
code=AUTO_APPROVAL_POLICY_REQUIRED
```

#### N4：work_item 伪写 decision

输入：

```text
sf_artifact_write file_type=work_item
content 包含 decision_status / user_response_quote
```

预期：

```text
失败
code=WORK_ITEM_CANNOT_CARRY_USER_DECISION
work_item.json 不得被污染
```

#### N5：workflow_path 覆盖 workflow_type

输入：

```text
workflow_type=bugfix_spec
workflow_path=requirement_change_path
```

预期：

```text
保持 bugfix_spec
不得改成 feature_spec
```

#### N6：candidate_manifest 非 canonical path

输入：

```text
trace_delta path = .specforge/work-items/WI-0001/trace_delta.md
```

预期：

```text
candidate_manifest_gate failed
```

#### N7：executor 写 .specforge

预期：

```text
Write Guard 阻断
changed_files_audit failed
close_gate failed
```

#### N8：closed 前 code_permission 未 revoke

预期：

```text
close_gate failed
```

---

## 7. 完成标准

Final Governance Alignment 只有满足以下条件才算完成：

```text
1. build 通过；
2. daemon / wrapper / setup / installer / live 自检通过；
3. OpenCode 重启后 schema 自检通过；
4. P1 / P2 / P3 三个正向项目全部 closed；
5. N1-N8 负向测试全部按预期失败；
6. 所有产物 zip 检查通过；
7. 没有旧状态主链路；
8. 没有旧 bugfix.md 主链路；
9. 没有 work_item 伪写 user decision；
10. 没有 comments/reason 伪装结构化字段；
11. 不依赖手工修 live；
12. 不依赖跳过审批；
13. 不以旧规则 closed 作为验收。
```

---

## 8. 实施方式

### 8.1 不是渐进式补丁

不再这样做：

```text
V13 修 wrapper
V14 修 work_item
V15 修 bugfix
V16 修 state
```

必须一次性做：

```text
Final Governance Alignment 整文件替换包
```

### 8.2 文件替换原则

```text
1. 先从当前分支读取真实代码；
2. 生成完整替换文件；
3. 脚本只负责备份、复制、自检；
4. 不在脚本中做复杂正则 patch；
5. 不用 PowerShell 拼 TypeScript 模板字符串；
6. 替换后 build；
7. 替换后部署到 setup 和 live；
8. 重启 OpenCode 后再测。
```

### 8.3 测试整改轮次

允许最多三轮，但每轮都是对最终目标的整体修正，不是旧规则补丁。

```text
第 1 轮：Final Governance Alignment 整体替换包
第 2 轮：根据 P/N 测试一次性修全部漏项
第 3 轮：完整回归确认
```

如果第 3 轮仍失败，说明差距矩阵漏项，必须回到矩阵重审，而不是继续打小补丁。

---

## 9. 下一步动作

下一步应直接做：

```text
Final Governance Alignment 实施包
```

包内必须包含：

```text
replacement_files/**
apply_final_governance_alignment.bat
apply_final_governance_alignment.ps1
verify_final_governance_alignment.ps1
README.md
test_matrix.md
```

其中 `verify_final_governance_alignment.ps1` 必须至少检查：

```text
state_machine.ts 不含旧主状态 intake/requirements_gate/development/review
sf_user_decision_record.ts 含 user_response_quote / auto_approval_policy_id
sf_artifact_write.ts 禁止 work_item decision 字段
bugfix Skill 不含 bugfix.md / bugfix_gate / fix_design
orchestrator 不含 legacy state 指令
setup wrapper 与 live wrapper hash 一致
```

