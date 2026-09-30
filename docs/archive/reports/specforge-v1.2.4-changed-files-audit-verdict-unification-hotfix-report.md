# SpecForge v1.2.4 Changed Files Audit Verdict Unification Hotfix Report

## 1. 背景

fj1 / WI-0002 在 SpecForge v1.2.3 后验证发现：

- `sf_changed_files_audit` 已经正确分类 5 条 historical blocked write attempts；
- `resolved_blocked_write_attempts = 5`；
- `unresolved_blocked_write_attempts = 0`；
- `out_of_scope = 0`；
- `violations = []`；
- `passed = true`。

但是 `sf_state_transition` 在 `implementation_running -> implementation_done` 时仍然拒绝推进，错误信息为：

```text
IMPLEMENTATION_AUDIT_NOT_PASSED: Blocked write attempts is 5
```

这说明 v1.2.3 只修复了 audit producer，没有统一所有 governance consumer 的审计通过/失败语义。

## 2. 根因

根因不是某个业务项目，也不是某个文件，而是 SpecForge 缺少统一的 changed-files audit verdict 模型。

旧逻辑分散在不同消费点中：

```text
blocked_write_attempts > 0 => FAIL
```

这会把“历史已解决阻断事件”误判成“最终实际越权写入”。

## 3. 修复范围

v1.2.4 不做点修，而是统一 changed_files_audit 判定语义。

新增：

```text
packages/daemon-core/src/tools/lib/changed-files-audit-verdict.ts
```

修改：

```text
packages/daemon-core/src/tools/lib/write-guard-runtime-v12.ts
```

新增回归测试：

```text
tests/regression/v1.2.4-changed-files-audit-verdict-unification.test.ts
```

## 4. 统一判定规则

`evaluateChangedFilesAuditVerdict()` 是 changed_files_audit 是否通过的统一判定源。

通过条件：

```text
Result = PASS
Out of scope = 0
Violations = 0
Unresolved blocked write attempts = 0
```

允许：

```text
Blocked write attempts > 0
```

但前提是报告具有 v1.2.3 的 resolved/unresolved 分类字段，且 unresolved=0。

安全兼容规则：

```text
旧报告 blocked_write_attempts > 0 但没有 resolved/unresolved 分类字段 => FAIL
```

## 5. 安全边界

本修复没有放宽真实越权写入检查：

- actual out-of-scope changed files 仍然 FAIL；
- unresolved blocked attempts 仍然 FAIL；
- explicit Result: FAIL 仍然 FAIL；
- legacy report with blocked attempts and no classification 仍然 FAIL。

## 6. 消除同源问题

`write-guard-runtime-v12.ts` 中的 `parseChangedFilesAuditPass()` 不再直接解析 raw `Blocked write attempts`，而是转调统一判定函数：

```ts
parseChangedFilesAuditVerdictPass(auditText)
```

`sf_state_transition` 继续调用 `parseChangedFilesAuditPass()`，但其底层语义已统一为 v1.2.4 verdict。

## 7. 回归测试

新增测试覆盖：

1. resolved historical blocked attempts 可通过；
2. unresolved blocked attempts 必须失败；
3. 旧格式报告 blocked>0 但无 resolved/unresolved 字段必须失败；
4. actual out-of-scope 必须失败；
5. explicit FAIL 必须失败；
6. `write-guard-runtime-v12.ts` 的 parser 必须委托统一 verdict，不得再写 raw blocked count 判定。

## 8. 预期 live acceptance

在 fj1 / WI-0002 中，升级到 v1.2.4 后应看到：

```text
sf_changed_files_audit: PASS
blocked_write_attempts: 5
resolved_blocked_write_attempts: 5
unresolved_blocked_write_attempts: 0
sf_state_transition implementation_running -> implementation_done: PASS
verification_gate: PASS
close_gate: PASS
WI-0002: closed
```
