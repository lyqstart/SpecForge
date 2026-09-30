# SpecForge v1.1 Runtime State Consistency Model

版本：v1.0  
阶段：Post-P0 Hardening / 优先级 3  
适用分支：`hardening/v1.1-post-p0-cleanup`

## 1. 结论先行

v1.1 的状态一致性模型必须按“运行时状态事实源 + 持久化镜像 + 审计/报告证据”分层，不能让 Agent 根据多个文件自行猜状态。

最终规则：

| 文件 | 定位 | 是否状态事实源 | 写入者 | 用途 |
|---|---|---:|---|---|
| `.specforge/runtime/state.json` | daemon runtime state source | 是 | 受控 daemon tool | 判定当前 WI 主状态、状态推进、Close Gate 状态修复 |
| `.specforge/work-items/<WI>/work_item.json` | Work Item metadata mirror | 否，属于持久化镜像 | 受控 daemon tool | UI/审计/兼容读取，必须跟随 runtime 同步 |
| `events.jsonl` / WAL | append-only audit log | 否 | event / WAL subsystem | 审计、恢复、重放，不直接替代当前状态 |
| `gate_summary.md` | Gate 报告 | 否 | gate runner | 用户审批前置证据，不负责表达 WI 当前状态 |
| `user_decision.json` | 用户决策证据 | 否 | user_decision_recorder | 记录真实用户审批/拒绝，merge success 后冻结 |
| `merge_report.md` | merge 结果证据 | 否 | merge runner | code_permission enable 的前置证据 |
| `verification_report.md` | 验证结果证据 | 否 | verifier | close_gate 前置证据 |
| `evidence_manifest.json` | 证据索引 | 否 | verifier / evidence writer | close_gate 前置证据 |
| `close_gate.md` | 关闭审计报告 | 否 | close_gate | 关闭结果报告，不是状态源 |

核心判断：

```text
当前状态以 runtime/state.json 为准；
work_item.json.status 是兼容镜像；
报告文件只能证明阶段结果，不能代表状态机状态；
Agent 不得手工修状态，只能调用受控 tool。
```

## 2. 为什么必须这样分层

P0 修复暴露的问题不是“某个文件写错”，而是多个文件同时带有状态含义，导致 Agent 可以选择性引用对自己有利的文件：

```text
runtime/state.json 显示 gates_running / gates_failed
user_decision.json 显示 approved
merge_report.md 显示 success
work_item.json.status 可能滞后
close_gate.md 又可能显示通过或失败
```

如果不定义事实源，就会出现三类治理漏洞：

1. **状态绕行**：Gate 未通过，却拿 user_decision.json 或手工状态推进继续 merge。
2. **状态滞后死锁**：真实受控步骤完成，但 runtime/work_item 镜像不同步，导致 close 卡住。
3. **审计污染**：Agent 手工覆盖报告文件，把失败链路伪装成成功链路。

因此，状态必须由 daemon 统一写；报告只能作为证据；Agent 只能读结论、调用 tool，不能直接修状态。

## 3. 状态事实源

### 3.1 runtime/state.json

`runtime/state.json` 是 v1.1 daemon 状态机事实源。daemon 在判定当前 Work Item 是否可进入审批、merge、code_permission、close 时，应优先读取它。

要求：

```text
1. current_state 表示当前 WI 的主状态。
2. workItems[] 是多 WI 兼容结构，必须和顶层 current_state 同步。
3. 顶层 status 如保留，只能作为 legacy mirror，必须等于 current_state。
4. daemon tool 写状态时必须同时更新 updated_at、last_transition_actor、last_transition_evidence。
5. Agent 不得直接编辑 runtime/state.json。
```

### 3.2 work_item.json

`work_item.json` 是 Work Item 元数据与兼容镜像。它可以被 UI、报告、静态读取使用，但在 runtime/state.json 存在时，不应作为 daemon 判定当前状态的第一事实源。

要求：

```text
1. status 保留，作为 legacy mirror。
2. status 必须由受控 daemon tool 同步更新。
3. status 不得由 Agent 手工修复。
4. work_item.json 可以保存 allowed_write_files_snapshot、code_permission_revoked 等阶段事实。
5. 当 runtime/state.json 与 work_item.json.status 不一致时，应记录 state lag，而不是让 Agent 猜。
```

## 4. 报告与证据文件

### 4.1 gate_summary.md

`gate_summary.md` 是 Gate 结果报告，不是状态源。

规则：

```text
1. Gate runner 负责生成/更新。
2. User Decision 前置校验可以读取它判断 gate 是否 passed。
3. close_gate 不应覆盖 gate_summary.md 来“修复历史”。
4. 如果存在 close 阶段需要的衍生 Gate 事实，应写入独立 refresh 文件或 close_gate 自身报告，不应篡改原 gate_summary.md。
```

### 4.2 user_decision.json

`user_decision.json` 是用户审批证据，不是状态源。

规则：

```text
1. 只有 user_decision_recorder 能写。
2. user_approved 必须记录 decided_by=user。
3. sf-orchestrator 只能作为 recorded_by，不能作为 decided_by。
4. merge success 后 user_decision 冻结，禁止 invalidate。
5. 如果后续需求变化，应新建 Work Item，不得改写已 merge 的用户决策。
```

### 4.3 merge_report.md

`merge_report.md` 是 merge 结果证据。

规则：

```text
1. code_permission enable 必须要求 merge_report.md Status=success 且 Successful > 0。
2. merge failed 或 merge_report 缺失时，code_permission enable 必须拒绝。
3. merge_report.md 不代表当前状态，只代表 merge 阶段结果。
```

### 4.4 verification_report.md 与 evidence_manifest.json

二者是 close_gate 的验证前置证据。

规则：

```text
1. verification_report 必须表达 pass/fail。
2. evidence_manifest 必须包含可核查证据。
3. close_gate 必须同时校验验证结果、证据、changed_files_audit、code_permission revoke。
4. 不能只靠“Agent 说已验证”关闭 WI。
```

### 4.5 close_gate.md

`close_gate.md` 是关闭审计报告，不是状态源。

规则：

```text
1. close_gate passed 后，由 close_gate handler 同步 runtime/state.json 和 work_item.json 到 closed。
2. close_gate failed 时不得手工改 closed。
3. close_gate.md 只能记录关闭检查结果，不应反向作为状态事实源。
```

## 5. Tool 写权限边界

| Tool / Handler | 可写状态 | 可写报告/证据 | 禁止事项 |
|---|---:|---:|---|
| `sf_gate_run` | 可推进 gates_running / approval_required | 可写 gate_summary | 不得审批，不得 merge |
| `sf_user_decision_record` | 可从 approval_required 推进 approved | 可写 user_decision | 不得在 gate failed/running 时审批；merge success 后不得 invalidate |
| `sf_merge_run` | 可推进 merge 相关状态 | 可写 merge_report | 不得开启 code_permission |
| `sf_code_permission` | 可写写权限镜像/快照 | 可写 permission facts | merge failed/missing 时不得 enable |
| `sf_changed_files_audit` | 不应主导状态 | 可写 audit report | 不得 close |
| `sf_close_gate` | 可在严格证据通过后写 closed | 可写 close_gate / filesystem diff evidence | 不得覆盖失败证据伪造通过 |
| Agent / Skill | 不可直接写状态 | 不可直接改核心证据 | 不得手工修状态、不得猜状态、不得绕过受控 tool |

## 6. close_gate 是否可以修复状态滞后

可以，但只能修复“受控步骤已完成、状态镜像滞后”的情况，不能修复治理失败。

允许 close_gate 修复：

```text
1. runtime/state.json 仍停在 approved / merged / implementation_done 等允许的滞后状态；
2. user_decision.json approved 且合法；
3. merge_report.md success 且 Successful > 0；
4. code_permission 已 revoke；
5. verification_report pass；
6. evidence_manifest 有证据；
7. changed_files_audit pass；
8. write_guard 无越权写入。
```

禁止 close_gate 修复：

```text
1. gate failed；
2. user_decision 缺失或 rejected；
3. merge failed；
4. code_permission 仍 enabled；
5. verification failed；
6. evidence 缺失；
7. changed_files_audit failed；
8. 存在越权写入。
```

这一区分很关键：close_gate 可以解决状态滞后死锁，但不能成为治理绕行入口。

## 7. legacy status 字段处理

`status` 字段暂时保留，但降级为兼容镜像。

规则：

```text
1. runtime/state.json.status 如存在，必须等于 current_state。
2. runtime.workItems[].status 如存在，必须等于 current_state。
3. work_item.json.status 如存在，必须等于 runtime 中该 WI 的 current_state。
4. 新代码不得把 status 当成第一事实源。
5. 后续如要删除 status，必须先完成兼容迁移，不在 v1.1 Post-P0 阶段贸然删除。
```

## 8. 状态不一致处理策略

| 场景 | 处理 |
|---|---|
| runtime=approval_required，work_item=created | user_decision_record 成功后同步两者到 approved |
| runtime=approved，merge_report=success，work_item=approved | 后续受控 tool 推进，不由 Agent 手工改 |
| runtime=implementation_done，work_item=merged | close_gate 证据全通过后可统一写 closed |
| runtime=gates_failed，gate_summary=failed，但 user_decision=approved | 判定为治理异常，禁止 merge/close |
| merge_report=success 后 user_decision 被 invalidate | 禁止，要求新建 WI |
| close_gate failed 后 Agent 想改状态 | 禁止，报告阻塞原因 |

## 9. 后续代码实现要求

本文件是设计收口，不在本 commit 中改业务代码。后续如实现，应遵守：

```text
1. 新增统一 StateConsistencyService 或等价模块。
2. 所有状态写入集中封装，不在 handler 中散落写 JSON。
3. 每次状态推进写入 transition evidence。
4. close_gate 的 state-lag repair 要有明确审计字段。
5. 新增状态一致性测试：runtime/work_item 同步、status mirror、close 修复滞后、治理失败不可修复。
6. 不删除 legacy status，先转为兼容镜像。
```

## 10. 验收标准

本设计进入实现阶段前，至少满足：

```text
1. 所有开发者知道 runtime/state.json 是状态事实源。
2. 所有报告文件不再被当成状态源。
3. user_decision merge 后冻结规则明确。
4. close_gate 状态滞后修复边界明确。
5. Agent/Skill 不得手工修状态的规则可同步到 Skill。
6. 后续测试可以围绕这些不变量编写。
```

