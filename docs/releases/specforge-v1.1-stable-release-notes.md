# SpecForge v1.1 Stable Release Notes

## 1. 发布结论

`v1.1-stable` 是 SpecForge v1.1 的正式稳定版基线。

本版本完成了从“规则可描述”到“规则可执行、可测试、可部署、可真实运行验收”的闭环：

- daemon 状态控制面完成统一；
- 最终治理规则完成自动化回归覆盖；
- Agent / Skill / Tool contract 完成对齐；
- installer / live 用户目录完成一致性验证；
- OpenCode live 环境完成真实 `quick_change / code_only_fast_path` 验收；
- 正式 tag：`v1.1-stable`。

## 2. 稳定基线

| 基线 | 说明 |
|---|---|
| `v1.1.3-daemon-control-plane-alignment-complete` | daemon 状态控制面治理完成 |
| `v1.1.4-final-rule-test-coverage-closure-complete` | 最终治理规则自动化回归覆盖完成 |
| `v1.1.5-agent-skill-contract-alignment-complete` | Agent / Skill 文档契约与最终治理规则对齐完成 |
| `v1.1.6-install-deployment-consistency-complete` | 安装部署一致性与 live 用户目录一致性完成 |
| `v1.1-stable-rc` | v1.1 稳定版候选完成 |
| `v1.1-stable` | v1.1 正式稳定版完成 |

## 3. v1.1 解决的核心问题

### 3.1 状态唯一真相源

v1.1 明确：

```text
StateManager / events.jsonl 是唯一权威状态源。
runtime/state.json 是 projection cache。
work_item.json 是 WI metadata，不是状态源，不是审批源，不是状态推进源。
```

`sf_state_transition` 不允许再绕过状态控制面调用旧的 `workflowEngine.transitionFull()`。

### 3.2 最终状态机收口

v1.1 使用最终治理状态集合，不再使用旧主流程状态：

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

旧状态不得作为主流程状态：

```text
development
review
implementation
done
completed
intake
requirements
design
```

### 3.3 workflow_type / workflow_path 严格兼容

v1.1 明确：

```text
workflow_type=quick_change <-> workflow_path=code_only_fast_path
```

`workflow_type=bugfix_spec` 不兼容 `code_only_fast_path`。

只传 `workflow_path=code_only_fast_path` 时，可以窄化默认到 `quick_change`；显式不兼容时必须 fail-closed，不得静默覆盖。

### 3.4 审批边界明确

v1.1 明确：

- `user_approved` 必须有顶层 `user_response_quote`；
- `auto_approved` 必须有 `auto_approval_policy_id`；
- `comments` / `reason` 不能代替结构化审批证据；
- `work_item.json` 禁止承载审批字段。

### 3.5 merge / code permission / audit / close gate 职责明确

v1.1 明确：

- `sf_merge_run` 接管 `approved -> merge_ready -> merging -> merged`；
- `code_only_fast_path` 的 merge status 可以是 `not_applicable`，但仍必须经过 `sf_merge_run`；
- `sf_code_permission` 不得因为 `code_only_fast_path` 跳过，应推进到 `implementation_running`；
- 写入前必须受 code permission / Write Guard 约束；
- 实现后必须执行 `sf_changed_files_audit`；
- `sf_close_gate` 在非 `verification_done` 时必须优先返回 `AUTHORITATIVE_STATE_MISMATCH`。

### 3.6 安装部署一致性

v1.1.6 固化：

- setup 源目录；
- installer upgrade / verify；
- live OpenCode 用户目录；
- template library；
- hidden `.specforge` 模板；
- legacy unmanaged `sf-skill-*` cleanup；
- setup/live SHA256 一致性。

## 4. 真实运行验收

v1.1-stable 正式发布前完成真实 OpenCode 验收：

```text
项目：D:\code\temp\SpecForge-v11-stable-real-run-acceptance
WI：WI-0001
workflow_type：quick_change
workflow_path：code_only_fast_path
最终状态：closed
目标文件：index.html
目标内容：<h1 style="color:blue">stable rc hello</h1>
```

真实链路经过：

```text
sf_user_decision_record
sf_merge_run
sf_code_permission
sf_changed_files_audit
sf_close_gate
```

关键结果：

```text
changed_files_audit: in_scope=1, out_of_scope=0, blocked_write_attempts=0
close_gate: 30/30 passed
final state: closed
```

## 5. 升级与验证

升级 live 用户目录：

```powershell
cd D:\code\temp\SpecForge
bun scripts/sf-installer.ts upgrade --force
bun scripts/sf-installer.ts verify
```

运行安装部署一致性验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-install-deployment-consistency.ps1
```

运行 RC 验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-v11-stable-rc-closure.ps1
```

运行真实验收验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-v11-stable-real-run-acceptance.ps1
```

## 6. 维护策略

`v1.1-stable` tag 是不可变稳定基线。

建议后续分支策略：

```text
main：后续 v1.2 开发
maintenance/v1.1-stable：v1.1 紧急修复
v1.1-stable：不可变正式稳定版 tag
```

v1.1 之后，不应继续在 v1.1 主线上追加零散治理补丁。若发现必须修复的问题，应走 maintenance 分支，并评估是否 cherry-pick 到 main。

## 7. 已知边界

v1.1 已完成治理执行链闭环，但以下内容属于 v1.2 范围：

- 项目级规格体系；
- Extension Subflow；
- 更强的程序级 Write Guard；
- 大型项目模块级 spec 演进；
- 多 WI 对同一项目级 spec 的变更合并策略；
- 规格版本与代码版本的长期映射策略。
