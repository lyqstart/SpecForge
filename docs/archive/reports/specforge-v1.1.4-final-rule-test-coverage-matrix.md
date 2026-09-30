# SpecForge v1.1.4 Final Rule Test Coverage Closure Matrix

> 目标：不是重建一套测试，而是把 v1.1.3 人工验证过的最终治理规则补进已有 `packages/daemon-core` 自动化回归体系。
>
> 新增测试文件：
>
> `packages/daemon-core/tests/v11-final-governance-regression.test.ts`

## Fix02 调整说明

Fix01 的两个失败断言是测试文件与当前源码命名不一致，不是生产规则失败：

| Fix01 错误断言 | 当前源码真实命名 | Fix02 调整 |
|---|---|---|
| `resolveWorkflowTypeForPath` 应在 `sf-state-transition.ts` 中出现 | handler 内部函数名为 `resolveWorkflowTypeForTransition`，公共函数 `resolveWorkflowTypeForPath` 位于 `state_machine.ts` | handler 源断言改为 `resolveWorkflowTypeForTransition` + `isWorkflowTypeCompatibleWithPath` |
| `validateArtifactContent` 应在 `sf-artifact-write.ts` 中出现 | 当前实现使用 `validateArtifactJson` | 源断言改为 `validateArtifactJson` + `findForbiddenWorkItemDecisionFields` |

## 覆盖矩阵

| 最终治理规则 | 覆盖方式 | 自动化断言 |
|---|---|---|
| StateManager/events 是唯一权威状态源 | 静态源断言 | `sf-state-transition.ts` 不得调用 `workflowEngine.transitionFull()`，并声明 `workflow_engine_transition_full_used: false` |
| `runtime/state.json` 是 projection cache | 静态源断言 | `state-coordinator-v11.ts` 必须声明 projection cache |
| `work_item.json` 不是状态源 | 静态源断言 | `state-coordinator-v11.ts` 必须声明 metadata；`artifact-schema-validation.ts` 禁止 status mutation |
| 最终状态机不含旧状态 | 单元断言 | `FINAL_STATES` 精确等于最终状态集；`development/review/implementation/done/completed/intake/requirements/design` 被拒绝 |
| P3 主链路完整 | 单元断言 | `created → ... → closed` 每一跳均为合法 transition |
| workflow_type/path 强制配对 | 单元断言 + 源断言 | `bugfix_spec + code_only_fast_path` 解析为 `undefined`，handler 含 `WORKFLOW_TYPE_PATH_CONFLICT` |
| code_only_fast_path 默认 quick_change | 单元断言 | `resolveWorkflowTypeForPath('code_only_fast_path') === 'quick_change'` |
| `user_approved` 必须有顶层 `user_response_quote` | 源断言 | `sf-v11-decision.ts` 包含 `USER_APPROVED_REQUIRES_EXPLICIT_USER_RESPONSE_QUOTE` |
| comments/reason 不作为审批证据 | 边界约束 | wrapper 暴露 comments/reason，但 handler 只接受顶层证据字段 |
| `auto_approved` 必须有 `auto_approval_policy_id` | 源断言 | `sf-v11-decision.ts` 包含 `AUTO_APPROVED_REQUIRES_POLICY_ID` |
| `work_item.json` 禁止审批字段 | 源断言 | `artifact-schema-validation.ts` 包含 `WORK_ITEM_CANNOT_CARRY_USER_DECISION` 与 forbidden fields |
| merge_runner 从 approved 接管 not_applicable merge | 源断言 | `sf-v11-merge.ts` 包含 `approved/merge_ready/merging/merged/merge_not_applicable` |
| code_permission 不跳过 code_only_fast_path | 源断言 | `sf-v11-code-permission.ts` 不得含 `reason: code_only_fast_path` 跳过逻辑 |
| close_gate 非 verification_done fail-fast | 源断言 | `AUTHORITATIVE_STATE_MISMATCH` 必须出现在 artifact missing error 前 |
| sf_doctor 诊断 ProjectStateManager/events | 源断言 | `sf-doctor.ts` 包含 `projectStateManager`、`StateManager/events`、`metadata_not_state_source` |
| v1.1.3 验证报告固化 | 文件存在与内容断言 | docs report 必须存在并含 S5b/S6/common baseline |

## 运行命令

仅跑新增最终规则测试：

```powershell
cd D:\code\temp\SpecForge\packages\daemon-core
bun run test -- tests/v11-final-governance-regression.test.ts
```

完整 build：

```powershell
cd D:\code\temp\SpecForge
bun run build
```

## 收口标准

```text
v11-final-governance-regression.test.ts PASS
bun run build PASS
git status --short 只包含本测试包新增/替换文件
```
