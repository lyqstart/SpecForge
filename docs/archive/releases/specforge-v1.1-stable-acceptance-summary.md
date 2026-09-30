# SpecForge v1.1 Stable Acceptance Summary

## 1. 验收结论

SpecForge v1.1 已通过稳定版发布验收。

验收不是只看单元测试通过，而是覆盖了四层证据：

1. 最终治理规则自动化回归；
2. Agent / Skill / Tool contract 一致性；
3. installer / live 用户目录部署一致性；
4. OpenCode live 环境真实运行验收。

最终正式基线：

```text
v1.1-stable
```

## 2. 验收链路

### 2.1 v1.1.3 daemon 状态控制面

验收重点：

- `StateManager/events.jsonl` 是唯一权威状态源；
- `runtime/state.json` 是 projection cache；
- `work_item.json` 不再作为状态源；
- `sf_state_transition` 不调用旧 transition；
- `sf_doctor` 报告 ProjectStateManager/events 权威链路。

结果：

```text
通过
```

### 2.2 v1.1.4 最终治理规则测试覆盖

验收重点：

- final state set 精确；
- 旧状态排除；
- workflow_type / workflow_path 严格兼容；
- user decision 结构化证据；
- work_item.json 禁止承载审批/状态权威；
- merge runner / code permission / close gate 新规则；
- close_gate 的 AUTHORITATIVE_STATE_MISMATCH fail-fast。

结果：

```text
14/14 tests passed
```

### 2.3 v1.1.5 Agent / Skill contract alignment

验收重点：

- Agent / Skill 文档均包含最终治理 contract；
- 文档中明确 `work_item.json is metadata only`；
- quick_change / bugfix / design / refactor / ops / investigation 等 Skill 与工具规则一致；
- 文档契约与程序测试对齐。

结果：

```text
通过
```

### 2.4 v1.1.6 安装部署一致性

验收重点：

- setup/userlevel-opencode 源目录完整；
- installer upgrade --force 通过；
- installer verify 通过；
- live 用户目录不残留 unmanaged legacy `sf-skill-*`；
- hidden `.specforge` template 同步；
- setup/live SHA256 一致；
- live observability template 存在并启用。

结果：

```text
通过
```

### 2.5 v1.1-stable-rc 发布候选验证

验收重点：

- 检查 v1.1.3～v1.1.6 baseline tag；
- 跑最终治理测试；
- 跑 workspace build；
- 跑 install/deployment consistency closure；
- 跑 live userlevel smoke。

结果：

```text
通过
```

### 2.6 v1.1-stable 真实运行验收

验收项目：

```text
D:\code\temp\SpecForge-v11-stable-real-run-acceptance
```

真实 WI：

```text
WI-0001
```

真实任务：

```text
创建 index.html，包含 <h1 style="color:blue">stable rc hello</h1>
```

真实状态链：

```text
created
-> intake_ready
-> impact_analyzing
-> impact_analyzed
-> workflow_selected
-> candidate_preparing
-> candidate_prepared
-> gates_running
-> approval_required
-> approved
-> merge_ready
-> merging
-> merged
-> post_merge_verified
-> implementation_ready
-> implementation_running
-> implementation_done
-> verification_running
-> verification_done
-> closed
```

关键工具链：

```text
sf_user_decision_record
sf_merge_run
sf_code_permission
sf_changed_files_audit
sf_close_gate
```

关键证据：

```text
user_response_quote="y"
merge status=not_applicable
allowed_write_files=index.html
changed_files_audit: in_scope=1, out_of_scope=0, blocked_write_attempts=0
verification_commands: 4/4 passed
close_gate: 30/30 passed
final state: closed
```

结果：

```text
通过
```

## 3. 验收边界

本次验收证明：

- v1.1 规则在自动化测试中生效；
- v1.1 规则在 Agent / Skill 文档中生效；
- v1.1 规则部署到了 live 用户目录；
- v1.1 规则在 OpenCode 真实运行中能闭环。

本次验收不覆盖：

- v1.2 项目级规格体系；
- Extension Subflow；
- 多模块大型项目规格合并；
- 团队协作与权限模型；
- 长期发布渠道自动化。

## 4. 结论

`v1.1-stable` 可以作为后续开发和维护的稳定基线。

后续开发应从 `main` 进入 v1.2 规划；v1.1 紧急修复应从 `maintenance/v1.1-stable` 分支处理。
