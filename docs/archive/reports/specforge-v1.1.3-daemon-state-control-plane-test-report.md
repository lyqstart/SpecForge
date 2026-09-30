# SpecForge v1.1.3 Daemon 状态控制面专项验证报告

> 分支：`hardening/v1.1.3-daemon-control-plane-alignment`  
> 共同基线：`373ab4233364c47f0bc2b886bfb1a9aa02d1ac31`  
> 修复包：`hotfix_06_state_control_plane_fix01`  
> 测试范围：daemon 状态唯一真相源、状态双写、旧状态拒绝、quick_change 正向链、merge_runner 接管、close_gate 前置守卫  
> 测试结论：核心状态控制面专项验证已闭环

---

## 1. 背景

本轮专项验证用于确认 hotfix_06 / fix01 是否真正解决 daemon 状态控制面的根因问题。

前置问题包括：

1. `sf_state_transition` 曾同时调用 `workflowEngine.transitionFull()` 与 `projectSm.transition()`，形成双写状态源。
2. `work_item.json.status` 曾被误当作状态同步目标，导致状态源语义混乱。
3. `quick_change / code_only_fast_path` 在 `merge_report.status=not_applicable` 时曾卡在 `approved`。
4. `sf_code_permission` 曾对 `code_only_fast_path` 跳过状态推进。
5. 旧状态如 `development / review / implementation / done` 必须被最终状态机拒绝。
6. `close_gate` 只能从 `verification_done` 且证据齐全、写权限撤销后推进到 `closed`。

---

## 2. 当前共同基线

用户确认本地与远程完全一致：

```text
git rev-parse HEAD
373ab4233364c47f0bc2b886bfb1a9aa02d1ac31

git rev-parse yc/hardening/v1.1.3-daemon-control-plane-alignment
373ab4233364c47f0bc2b886bfb1a9aa02d1ac31

git status --short
<无输出>
```

因此，本轮验证基于同一个 GitHub / 本地共同代码基线。

---

## 3. Hotfix 06 fix01 build 结果

`apply_hotfix_06_state_control_plane_fix01.ps1` 执行结果：

```text
RESULT: HOTFIX_06_FIX01_APPLIED
CAUSE: State control plane corrected patch applied from GitHub baseline and build passed.
```

构建结果：

```text
@specforge/daemon-core: OK
Deterministic workspace build complete
```

修复范围：

```text
packages/daemon-core/src/tools/handlers/sf-state-transition.ts
packages/daemon-core/src/tools/handlers/sf-v11-merge.ts
packages/daemon-core/src/tools/handlers/sf-v11-code-permission.ts
packages/daemon-core/src/tools/handlers/sf-artifact-write.ts
packages/daemon-core/src/tools/lib/artifact-schema-validation.ts
```

---

## 4. S0 / S0b：新代码加载与静态方向确认

### 4.1 S0 结论

S0 通过 `sf_doctor` 和 `sf_state_read` 检查运行环境。

结论：

```text
S0：条件通过，但 sf_doctor 诊断能力不足。
```

原因：

- `sf_state_read` 返回 `rebuilt_from_events=true`，说明读路径可以从事件重建。
- 但 `sf_doctor` 仍用旧字段 `deps.stateManager` 判断 `stateManager: missing`。
- `sf_doctor` 没有检查 `projectManager.getProjectStateManager(projectRoot)`。
- 因此，`sf_doctor` 当前不能作为最终状态控制面是否正常的充分证据。

### 4.2 S0b 结论

S0b 通过本地源码静态检查确认：

```text
sf-state-transition.ts / workflowEngine.transitionFull：无输出
state-coordinator-v11.ts / workflowEngine.transitionFull：只在注释中出现
workflow_engine_transition_full_used: false：存在
projectSm.transition：存在
merge_not_applicable: true：存在
reason: 'code_only_fast_path'：无输出
```

结论：

```text
S0b：通过。
```

---

## 5. S1：读写同源测试

### 测试目标

验证 `sf_state_transition` 写路径与 `sf_state_read` 读路径看到同一个权威状态。

### 执行链路

```text
created → intake_ready
sf_state_read = intake_ready
intake_ready → impact_analyzing
sf_state_read = impact_analyzing
```

### 关键证据

```text
events.jsonl 末条：intake_ready → impact_analyzing
runtime/state.json：current_state = impact_analyzing
sf_state_read：impact_analyzing
work_item.json.status：created
```

### 结论

`work_item.json.status=created` 时，daemon 仍接受 `from_state=intake_ready → impact_analyzing`，说明：

```text
sf_state_transition 没有把 work_item.json.status 当 actual state；
sf_state_read 也没有把 work_item.json.status 当读取源。
```

结论：

```text
S1：通过。
```

---

## 6. S2：禁止双写测试

### 测试目标

验证一次状态推进只产生一条权威事件，不再双写。

### 执行链路

```text
impact_analyzing → impact_analyzed
```

### 关键证据

```text
推进前 events.jsonl：3 条
推进后 events.jsonl：4 条
增量：+1 条
新增事件：impact_analyzing → impact_analyzed
sf_state_read：impact_analyzed
workflow_engine_transition_full_used=false
```

### 结论

一次合法 transition 只产生一条 state transition 事件。

结论：

```text
S2：通过。
```

---

## 7. S3：work_item.status 污染忽略测试

### 测试目标

验证 `work_item.json.status` 即使与权威状态不一致，也不会影响 `sf_state_read` 和 `sf_state_transition`。

### 执行情况

测试尝试通过 `sf_safe_bash` 主动写 `.specforge/work-items/WI-0001/work_item.json`，被 Write Guard 阻断。

这拆分为两个结论：

```text
S3a：外部 shell 主动污染 work_item.json.status → 被 Write Guard 阻断，通过。
S3b：work_item.json.status 已陈旧为 created，但实际状态为 impact_analyzed，daemon 仍按 events/state 推进，通过。
```

### 关键证据

```text
work_item.json.status = created
sf_state_read = impact_analyzed
sf_state_transition from_state=impact_analyzed → workflow_selected 成功
events.jsonl 只新增 1 条 impact_analyzed → workflow_selected
```

### 结论

```text
work_item.json.status 不参与 actual state 判断；
外部 shell 写 .specforge/work-items/** 被 Write Guard 阻断。
```

结论：

```text
S3：通过，拆分为 S3a/S3b 记录。
```

---

## 8. S4：旧状态拒绝测试

### 测试目标

验证最终状态机拒绝旧状态。

### 当前状态

```text
WI-0001 current_state = workflow_selected
events.jsonl 总数 = 5
```

### 非法目标状态

```text
workflow_selected → development
workflow_selected → review
workflow_selected → implementation
workflow_selected → done
```

### 结果

四次调用全部被拒绝，错误码为：

```text
INVALID_V11_TARGET_STATE
```

拒绝后：

```text
current_state 仍为 workflow_selected
events.jsonl 无新增
无 development / review / implementation / done 事件
```

### 结论

```text
S4：通过。
```

---

## 9. S5：quick_change 正向状态链

### 测试目标

验证 `quick_change / code_only_fast_path` 能从审批后自然推进到 `verification_done`。

### 关键约束

```text
workflow_type=quick_change
workflow_path=code_only_fast_path
candidate_manifest.entries=[]
merge_report.status=not_applicable
user_response_quote="批准"
只修改 index.html
changed_files_audit passed
verification_report conclusion=pass
未调用 sf_close_gate
```

### 状态链

```text
approval_required
→ approved
→ merge_ready
→ merging
→ merged
→ post_merge_verified
→ implementation_ready
→ implementation_running
→ implementation_done
→ verification_running
→ verification_done
```

### 产物核对

```text
candidate_manifest.entries = []
merge_report.status = not_applicable
user_decision.json: user_approved + user_response_quote="批准"
changed_files_audit: PASS, violations=0, blocked_write_attempts=0
verification_report: conclusion=pass
evidence_manifest: 覆盖 AC-1 / AC-2
index.html: hello v1.1.3 + color: blue
```

### 结论

S5 主链路通过。

但本次 S5 中 `approved → merge_ready` 由 orchestrator 手动推进，因此没有覆盖 hotfix_06 的 `sf_merge_run` 从 `approved` 直接接管修复点。

结论：

```text
S5：主链路通过；
S5b：需补测 merge_runner from approved。
```

---

## 10. S5b：merge_runner 从 approved 直接处理 not_applicable merge

### 测试目标

验证 hotfix_06 的关键修复点：

```text
sf_merge_run 在 approved 状态直接接管 code_only_fast_path not_applicable merge：
approved → merge_ready → merging → merged
```

### 执行对象

```text
WI-0002
workflow_type=quick_change
workflow_path=code_only_fast_path
candidate_manifest.entries=[]
```

### 核心结果

审批后：

```text
current_state = approved
未手动调用 approved → merge_ready
直接调用 sf_merge_run
```

`sf_merge_run` 单次调用产生三跳：

```text
approved → merge_ready
merge_ready → merging
merging → merged
```

三跳均为：

```text
actor = merge_runner
source = sf_v11_merge
merge_not_applicable = true
```

最终：

```text
merge_report.status = not_applicable
current_state = merged
```

### 结论

```text
S5b：通过。
```

该测试补上 S5 缺口，证明 `sf_merge_run` 已能从 `approved` 直接接管 not_applicable merge。

---

## 11. S6：close_gate 前置状态测试

S6 分为两段：

```text
S6a：非 verification_done 状态必须拒绝 close_gate
S6b：verification_done 且证据齐全、权限释放后才能 close
```

### 11.1 S6a：merged 状态拒绝 close_gate

测试对象：

```text
WI-0002 current_state = merged
```

执行：

```text
sf_close_gate(WI-0002)
```

结果：

```text
success = false
state_advanced = false
authoritative_state_used = true
closed_from_state = "merged"
events.jsonl 总行数不变
closed_events_count = 0
```

结论：

```text
S6a：通过。
```

注意：top-level error 为 `verification_report.md not found`，诊断优先级不理想。更理想的错误应优先报告：

```text
current authoritative state is merged, expected verification_done
```

这属于诊断体验问题，不影响状态守卫功能判定。

### 11.2 S6b：verification_done 正向关闭

测试对象：

```text
WI-0001 current_state = verification_done
```

前置证据：

```text
candidate_manifest.json：entries=[]
user_decision.json：user_approved + user_response_quote="批准"
merge_report.md：status=not_applicable
changed_files_audit.md：PASS, violations=0, blocked_write_attempts=0
verification_report.md：conclusion=pass
evidence/evidence_manifest.json：覆盖 AC-1 / AC-2
```

权限处理：

```text
code_permission query：code_change_allowed=true
sf_code_permission(action=revoke)
code_permission query：code_change_allowed=false，allowed_write_files=[]
```

执行：

```text
sf_close_gate(WI-0001)
```

结果：

```text
success = true
allChecksPassed = true
closed_from_state = "verification_done"
state_advanced = true
authoritative_state_used = true
code_permission_revoked = true
verification_done → closed
```

events：

```text
seq=33
from_state = verification_done
to_state = closed
actor = close_gate
source = sf_v11_close_gate
```

结论：

```text
S6b：通过。
```

---

## 12. 专项验证总表

| 测试项 | 目标 | 结论 |
|---|---|---|
| S0 | 运行环境初查 | 条件通过，doctor 诊断不足 |
| S0b | 静态方向确认 | 通过 |
| S1 | 读写同源 | 通过 |
| S2 | 禁止双写 | 通过 |
| S3 | work_item.status 污染忽略 | 通过，拆分 S3a/S3b |
| S4 | 旧状态拒绝 | 通过 |
| S5 | quick_change 正向链 | 主链路通过 |
| S5b | merge_runner from approved | 通过 |
| S6a | 非 verification_done close_gate 拒绝 | 通过 |
| S6b | verification_done 正向 close | 通过 |

---

## 13. 总体结论

daemon 状态控制面专项验证已闭环。

已证明：

```text
1. events.jsonl / runtime/state.json 投影是实际权威状态源；
2. work_item.json.status 不参与 actual state 判断；
3. sf_state_transition 不再双写；
4. 旧状态 development / review / implementation / done 被拒绝；
5. quick_change / code_only_fast_path 可以完整跑到 verification_done；
6. sf_merge_run 可以从 approved 直接接管 not_applicable merge；
7. close_gate 只能在 verification_done 且证据齐全、权限释放后推进到 closed。
```

---

## 14. 后续治理项

本轮验证发现两个不阻塞核心状态控制面的诊断治理项：

### G1：sf_doctor 诊断模型过旧

当前问题：

```text
sf_doctor 仍按旧 deps.stateManager 判断 stateManager: missing；
没有检查 projectManager.getProjectStateManager(projectRoot)；
不能准确表达 events / ProjectStateManager 权威链路。
```

建议治理：

```text
sf_doctor 增加：
- projectManager: ok/missing
- projectStateManager: ok/missing
- can_rebuild_from_events: true/false
- read_source: StateManager/events
- legacy_stateManager_dependency: absent/ignored
```

### G2：sf_close_gate 失败原因优先级不理想

当前问题：

```text
当 current_state=merged 时，top-level error 优先报 verification_report.md not found；
更理想的是优先报 authoritative_state_mismatch：
current authoritative state is merged, expected verification_done。
```

建议治理：

```text
close_gate 在所有证据文件检查前，先做 authoritative current_state 前置判断；
如果不是 verification_done，直接 fail-closed；
保留 closed_from_state / authoritative_state_used / allChecks 字段。
```

建议分支：

```text
diagnostics/v1.1.3-state-observability-cleanup
```

---

## 15. 当前建议下一步

1. 将本报告提交到仓库，例如：

```text
docs/reports/specforge-v1.1.3-daemon-state-control-plane-test-report.md
```

2. 清理运行日志脏文件：

```powershell
cd D:\code\temp\SpecForge
git status --short
git restore packages/daemon-core/.specforge/logs/telemetry.jsonl
```

3. 新建或继续当前分支，实施 G1/G2 诊断小治理。

4. G1/G2 完成后，再执行 P1/P2/P3 全量最终规则回归。

5. 全部通过后再 tag / release。
