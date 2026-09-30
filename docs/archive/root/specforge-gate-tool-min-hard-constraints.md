# Package 5：Gate / Tool 最小硬约束设计清单

> 目标：在不推翻 v1.1 状态权威、Candidate/Merge/Code Permission/Close Gate 现有机制的前提下，把“依据、承接、验证、融合”从 Agent/Skill 文档约束，推进到 Gate/Tool 的最小可执行硬约束。

---

## 1. 本包定位

本包只做设计清单，不直接改代码。

原因：当前 Agent MD / Skill MD 已经完成第一阶段融合，但它只能约束 Agent “应该怎么做”。fj1 日志类问题的根因不是 Agent 不会写漂亮报告，而是 Gate / Tool 允许以下情况通过：

1. 用户目标没有被结构化成可追踪 outcome；
2. requirement / design / task / evidence 之间只有文件级存在，没有语义闭环；
3. evidence 只证明“写了文件、编译通过、存在日志框架”，不能证明“用户要的行为实际完成”；
4. close gate 对 verification_report 和 evidence_manifest 的检查偏存在性和非空性。

因此 Package 5 的核心是：

```text
把“能不能 close”的判断，从文件齐全推进到最小语义闭环齐全。
```

---

## 2. 当前代码事实判断

### 2.1 已经足够硬的部分，不应该重做

以下能力已经比较硬，本轮不重写：

| 能力 | 当前事实 | 本轮处理 |
|---|---|---|
| 状态权威 | sf-v11-gate-run / sf-v11-close-gate 已经通过 state-coordinator-v11 / StateManager 做状态推进 | 保留 |
| close 前状态 | sf_close_gate 要求 authoritative current_state=verification_done | 保留 |
| code permission | close handler 会检查/revoke code permission，并同步 allowed_write_files_snapshot | 保留 |
| changed files audit | close handler 会生成/刷新 changed_files_audit，并结合 write_guard_log / filesystem diff | 保留 |
| user decision | close-gate 已调用 validateApprovedUserDecisionForClose | 保留 |
| candidate / merge | candidate_manifest、merge_report 已纳入 close 检查 | 保留 |

### 2.2 当前弱点

| 弱点 | 当前表现 | 风险 |
|---|---|---|
| trace_gate 弱 | v1.1 gate-runner 内 trace_gate 主要检查 trace_delta.md 非空 | 只要写个 trace_delta 就可能过 |
| spec_consistency_gate 弱 | 当前是 Basic spec consistency check，直接 passed | 不能挡住需求/设计/任务错位 |
| verification_gate 弱 | v1.1 verification_gate 主要检查 verification_report.md 和 evidence_manifest.json 存在 | 不能判断 evidence 是否证明用户目标 |
| close_gate 偏文件级 | close-gate 检查 required files、verification 非空、evidence_manifest 有 entries | 无法挡住 framework-only / compile-only |
| tasks_gate 不看任务上下文 | sf_tasks_gate_core 检查 verification_commands 和 typed verification，但不检查 context_block / done_when_behavior / allowed_write_files / 当前实现依据 | 任务可执行性不够硬 |
| trace_matrix 不覆盖 evidence | sf_trace_matrix_core 检查 requirements→design→tasks，未覆盖 outcome→evidence→close | 用户目标可能丢失 |

---

## 3. 总体原则

Package 5 不追求“大而全的语义理解”。

第一版只做 **最小可执行硬约束**：

```text
不做自然语言深度推理；
不引入 LLM 审判；
不要求完美语义判断；
只检查 Agent/Skill 已经被要求写出的结构化字段是否存在、是否互相引用、是否覆盖、是否声明无法证明。
```

也就是说，Gate/Tool 不负责“理解全部自然语言”，只负责检查下面四件事：

```text
依据：是否有 basis_refs / source_refs / observed refs；
承接：OUT → REQ → DD → TASK 是否有引用链；
验证：TASK/REQ/OUT 是否有 passed evidence 支撑；
融合：本 WI 对 project truth source / runtime behavior 的影响是否声明并验证。
```

---

## 4. 最小字段基线

### 4.1 不建议新增 work_item.json 字段

原因：work_item.json 已经被定义为元数据，不应该继续承担语义状态。

### 4.2 建议新增/规范一个机器可读文件

建议新增：

```text
.specforge/work-items/WI-XXXX/semantic_closure.json
```

它不是状态源，不推进 workflow，只是 Gate 可读的语义闭包索引。

由 orchestrator 或 verifier 在 verification 阶段前生成/刷新；close_gate 只读取它，不写它。

最小结构：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-XXXX",
  "outcomes": [
    {
      "id": "OUT-1",
      "statement": "用户目标",
      "source_refs": ["intake.md#..."]
    }
  ],
  "requirements": [
    {
      "id": "REQ-1",
      "level": "MUST",
      "outcome_refs": ["OUT-1"],
      "basis_refs": ["intake.md#..."],
      "required_evidence": ["behavior", "integration"],
      "not_done_when": ["only writes framework without call path"]
    }
  ],
  "designs": [
    {
      "id": "DD-1",
      "req_refs": ["REQ-1"],
      "basis_refs": ["requirements.md#REQ-1"],
      "integration_impact": "changes runtime call path / project truth source / no integration required"
    }
  ],
  "tasks": [
    {
      "id": "TASK-1",
      "req_refs": ["REQ-1"],
      "design_refs": ["DD-1"],
      "allowed_write_files": ["src/..."],
      "done_when_behavior": "runtime behavior that proves completion",
      "required_evidence": ["behavior", "integration"]
    }
  ],
  "evidence": [
    {
      "id": "EV-1",
      "supports": ["TASK-1", "REQ-1", "OUT-1"],
      "type": "command | behavior | integration | artifact | manual",
      "level": "L1 | L2 | L3 | L4 | L5",
      "result": "passed | failed | blocked | unknown",
      "observed": "actual observable result, stdout excerpt, file diff, API response, runtime side effect"
    }
  ],
  "project_integration": {
    "required": true,
    "target_paths": [".specforge/project/trace_matrix.md"],
    "status": "merged | not_applicable | blocked"
  }
}
```

### 4.3 为什么要新增 semantic_closure.json，而不是只读 markdown

原因：

1. markdown 适合人读，不适合 Gate 稳定解析；
2. 当前 Gate 已经大量依赖 JSON：candidate_manifest.json、trigger_result.json、user_decision.json、evidence_manifest.json；
3. semantic_closure.json 只是索引，不替代 requirements/design/tasks/evidence 原文；
4. Gate 可以先要求该文件存在并结构合法，再逐步增强交叉校验。

---

## 5. Blocking / Warning 分级

### 5.1 第一版必须 blocking 的规则

| ID | 规则 | 放置位置 | 说明 |
|---|---|---|---|
| SC-B01 | semantic_closure.json 缺失或 JSON 无效 | close_gate | 非 code-only 快速路径必须 blocking；code_only_fast_path 可先 warning，下一阶段再 blocking |
| SC-B02 | outcomes 为空 | close_gate | 没有用户目标，不能 close |
| SC-B03 | MUST requirement 没有 outcome_refs | trace_gate / close_gate | 用户目标未承接 |
| SC-B04 | MUST requirement 没有 required_evidence | trace_gate / close_gate | 后续无法证明完成 |
| SC-B05 | design 没有 req_refs | trace_gate | 设计未承接需求 |
| SC-B06 | task 没有 req_refs 或 design_refs | tasks_gate / close_gate | 任务未承接上游 |
| SC-B07 | task 没有 done_when_behavior | tasks_gate | 防止“写了文件就算完成” |
| SC-B08 | task 需要代码修改但 allowed_write_files 为空 | tasks_gate | 防止 executor 执行时才发现无权限 |
| SC-B09 | evidence 为空或无 passed evidence | verification_gate / close_gate | 无证据不能 close |
| SC-B10 | 每个 OUT 没有 passed evidence 支撑 | verification_gate / close_gate | 用户目标未被证明 |
| SC-B11 | 每个 MUST REQ 没有 passed evidence 支撑 | verification_gate / close_gate | 必须需求未被证明 |
| SC-B12 | evidence.result 为 failed / blocked / unknown 但被用于支撑 OUT/REQ/TASK | verification_gate | 失败证据不能当完成证据 |
| SC-B13 | project_integration.required=true 但 status 不是 merged / not_applicable | close_gate | 防止项目级真相源未融合 |
| SC-B14 | changed_files_audit 失败或出现 unresolved out-of-scope | close_gate | 已有机制，应保持 blocking |
| SC-B15 | verification_report 明确出现 blocker/failed/unknown/unverified 且无 waiver | close_gate | 防止报告写了失败还 close |

### 5.2 第一版只 warning 的规则

| ID | 规则 | 放置位置 | 说明 |
|---|---|---|---|
| SC-W01 | SHOULD / MAY requirement 没有 evidence | trace_gate | 先 warning，避免过严 |
| SC-W02 | basis_refs 不是精确锚点，只是文件级引用 | trace_gate | 先 warning |
| SC-W03 | evidence.level 低于 required_evidence 建议等级 | verification_gate | 第一版先 warning，第二版可提升 |
| SC-W04 | manual evidence 无命令/截图/日志引用 | verification_gate | 先 warning |
| SC-W05 | project_integration.required 未声明 | close_gate | 第一版默认 warning，第二版可 blocking |

---

## 6. 各文件修改建议

### 6.1 `packages/daemon-core/src/tools/lib/gate-runner-v11.ts`

当前问题：

```text
verification_gate 只检查 verification_report.md 和 evidence/evidence_manifest.json 是否存在。
trace_gate 只检查 trace_delta.md 非空。
spec_consistency_gate 是弱实现。
workflow_specific_gate 默认 skipped。
```

建议：

1. 不直接在 gate-runner-v11.ts 写大量逻辑；
2. 新增纯函数库：

```text
packages/daemon-core/src/tools/lib/semantic-closure-core.ts
```

3. gate-runner-v11.ts 只调用：

```ts
checkSemanticTraceClosure(ctx)
checkSemanticVerificationClosure(ctx)
```

4. trace_gate：
   - 保留 trace_delta.md 非空检查；
   - 增加 semantic_closure.json 的 OUT→REQ→DD→TASK 结构检查；
   - 第一版：trace_gate 仍可保持 soft_gate，但如果 close_gate 复用相同 hard check，则不会放过最终 close。

5. verification_gate：
   - 增加 evidence→TASK/REQ/OUT passed coverage；
   - missing / failed / unknown evidence 直接 fail。

### 6.2 `packages/daemon-core/src/tools/lib/close-gate.ts`

当前问题：

```text
close-gate 检查 required files、verification_report 非空、verification_report 是否提到 evidence、evidence_manifest 是否有 entries。
这些不能证明用户目标完成。
```

建议：

1. 在 `runCloseGate()` 中 required files 后增加：

```text
close_semantic_closure_exists
close_semantic_closure_schema_valid
close_outcomes_have_passed_evidence
close_must_requirements_have_passed_evidence
close_project_integration_resolved
close_no_failed_or_unknown_supporting_evidence
```

2. close_gate 不负责生成 semantic_closure.json；只读取并判定。
3. close_gate 是最终硬门，所以这里的语义闭包检查必须 hard blocking。

### 6.3 `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts`

当前 handler 已经做了很多生命周期工作：状态检查、schema validation、candidate manifest、merge report、verification report、evidence manifest、code permission revoke、changed files audit、filesystem diff、runCloseGate、最终状态推进。

建议：

1. handler 不加语义细节；
2. 保持 handler 只做生命周期编排；
3. 语义检查放在 `lib/close-gate.ts` 和 `semantic-closure-core.ts`；
4. handler 只负责把 close_gate.json / close_gate.md 写出来。

### 6.4 `packages/daemon-core/src/tools/lib/sf_tasks_gate_core.ts`

当前问题：

```text
已检查 verification_commands，且对 typed verification 做了 REQ verification_strategy 交叉验证。
但不检查 context_block、allowed_write_files、done_when_behavior、current implementation basis。
```

建议新增检查：

| Check ID | 规则 | Blocking |
|---|---|---|
| tasks_context_block_exists | 每个 TASK 有 context_block 或等价结构 | 是 |
| tasks_allowed_write_files_declared | 需要代码修改的 TASK 有 allowed_write_files | 是 |
| tasks_done_when_behavior_declared | 每个 TASK 有行为完成条件 | 是 |
| tasks_not_done_when_declared | 每个 TASK 有 not_done_when 或引用 REQ not_done_when | warning |
| tasks_current_state_basis_declared | 修改既有系统的 TASK 有 current implementation / basis refs | 是 |
| tasks_evidence_required_declared | 每个 TASK 声明 required evidence 类型 | 是 |

### 6.5 `packages/daemon-core/src/tools/lib/sf_trace_matrix_core.ts`

当前问题：

```text
只检查 requirements.md、design.md、tasks.md 之间的覆盖率。
没有 outcome，也没有 evidence。
```

建议：

1. 保留现有检查，避免破坏旧逻辑；
2. 新增 semantic closure 读取；
3. 输出扩展：

```ts
outcome_coverage_summary
requirement_to_evidence_coverage_summary
design_to_task_coverage_summary
blocking_semantic_gaps
```

4. 第一版不强行替代原 extractRequirementIds / extractDesignSections；只新增结构化闭包检查。

### 6.6 `packages/daemon-core/src/tools/lib/sf_verification_gate_core.ts`

当前事实：

```text
该文件有 typed verification 检查能力，能按 required types 检查 verification_report.json / verification_report.md 等。
但 v1.1 gate-runner 的 verification_gate 没有直接复用这里的完整能力，只做存在性检查。
```

建议：

1. 不急着把两个 verification gate 大重构合并；
2. 第一版只在 v1.1 `verification_gate` 中调用 semantic closure 的证据覆盖检查；
3. 后续再评估是否把 `sf_verification_gate_core.ts` 的 typed verification 能力接入 v1.1 gate-runner。

### 6.7 `packages/daemon-core/src/tools/lib/evidence-manifest.ts`

建议：

1. 保留现有 evidence manifest 逻辑；
2. 新增可选字段规范，不破坏旧 entries：

```json
{
  "id": "EV-1",
  "supports": ["TASK-1", "REQ-1", "OUT-1"],
  "type": "behavior",
  "level": "L4",
  "result": "passed",
  "observed": "..."
}
```

3. semantic_closure.json 可以从 evidence_manifest.json 派生，但 close_gate 以 semantic_closure.json 为准。

### 6.8 `packages/daemon-core/src/tools/lib/required-gates.ts`

当前问题：

```text
trace_gate / spec_consistency_gate / workflow_specific_gate 是 soft。
```

建议：

第一版不直接把 trace_gate 改 hard，避免大量历史 workflow 断裂。

但必须做到：

```text
close_gate 内部的 semantic closure hard check 是最终硬门。
```

后续第二版再把 trace_gate 对 requirement_change_path / design_change_path / task_change_path 升级为 hard。

---

## 7. 推荐落地顺序

### Package 5A：设计清单

当前文件：

```text
docs/specforge-gate-tool-min-hard-constraints.md
```

### Package 5B：新增纯函数库，不接入状态

新增：

```text
packages/daemon-core/src/tools/lib/semantic-closure-core.ts
packages/daemon-core/src/tools/lib/__tests__/semantic-closure-core.test.ts
```

实现：

```text
readSemanticClosure(ctx)
validateSemanticClosureSchema(json)
checkTraceClosure(json)
checkVerificationClosure(json)
checkProjectIntegrationClosure(json)
```

### Package 5C：接入 close_gate，先挡最终 close

修改：

```text
packages/daemon-core/src/tools/lib/close-gate.ts
```

只新增 close checks，不改状态推进。

### Package 5D：接入 v1.1 gate-runner 的 trace_gate / verification_gate

修改：

```text
packages/daemon-core/src/tools/lib/gate-runner-v11.ts
```

让中间 gate 提前发现问题，但 close_gate 仍为最终硬门。

### Package 5E：增强 tasks_gate

修改：

```text
packages/daemon-core/src/tools/lib/sf_tasks_gate_core.ts
```

让 task 在进入执行前就具备可验证完成条件。

---

## 8. 最小测试用例设计

### 8.1 正向用例

| ID | 场景 | 预期 |
|---|---|---|
| P1 | OUT-1 → REQ-1 → DD-1 → TASK-1 → EV-1，全链路 passed | close_gate pass |
| P2 | code_only_fast_path，semantic_closure 标记 project_integration.not_applicable，EV 支撑 OUT/TASK | close_gate pass |
| P3 | 多个 MUST REQ 被同一个集成 evidence 支撑 | pass |

### 8.2 负向用例

| ID | 场景 | 预期 |
|---|---|---|
| N1 | semantic_closure.json 缺失 | close_gate fail |
| N2 | outcomes 为空 | close_gate fail |
| N3 | REQ-1 没有 outcome_refs | trace/close fail |
| N4 | TASK-1 没有 done_when_behavior | tasks_gate fail |
| N5 | EV-1 result=passed 但 supports 为空 | verification/close fail |
| N6 | OUT-1 没有任何 passed evidence | verification/close fail |
| N7 | 只有 compile/lint evidence，OUT 要求 behavior/integration | verification/close fail |
| N8 | evidence.result=unknown 但支撑 REQ-1 | verification/close fail |
| N9 | project_integration.required=true 但 status=blocked | close fail |
| N10 | verification_report 写明 failed/blocker 但 evidence_manifest 有 entries | close fail |

---

## 9. 不做的事

第一版明确不做：

```text
1. 不用 LLM 在 Gate 中做自然语言审判；
2. 不重构 StateManager；
3. 不重写 merge-runner；
4. 不改变 work_item.json 的状态含义；
5. 不强制所有历史 workflow 立即满足新字段；
6. 不把 trace_gate 立即全局改 hard；
7. 不让 executor / verifier 直接写 .specforge/project/**。
```

---

## 10. 结论

Package 5 的最小正确方向是：

```text
新增 semantic_closure.json 作为机器可读语义闭包索引；
新增 semantic-closure-core.ts 作为纯函数校验核心；
先接入 close_gate 作为最终硬门；
再接入 trace_gate / verification_gate 作为提前发现；
最后增强 tasks_gate，把可执行性问题前移。
```

这样能直接针对 fj1 类问题：

```text
如果只写了 Logger / LogPersistence 框架，
但没有 evidence 证明 Logger.flush 接入持久化、后端 /logs/batch 存在、本地和服务端均实际落盘，
则 OUT / REQ 没有 passed behavior/integration evidence，
close_gate 必须 fail。
```
