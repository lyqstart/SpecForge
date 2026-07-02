# SpecForge v1.2.3 changed_files_audit Historical Blocked Writes Hotfix Report

## 1. 背景

fj1 项目 WI-0002 在实现阶段暴露真实治理阻塞：Write Guard 日志中存在 5 条历史 `blocked_write_attempts`。这些事件均为权限范围发现过程中的正常阻断事件：首次写入时白名单不完整，Write Guard 正确阻断；随后通过 `sf_code_permission` 扩展授权范围，最终实际变更文件全部在授权范围内。

当前 `sf_changed_files_audit` 将所有历史 `blocked_write_attempts` 永久计为 violation，导致 WI 无法推进到 `implementation_done`。这不是 fj1 代码问题，而是 SpecForge 审计语义缺陷。

## 2. 根因

`packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts` 原逻辑将 `blockedWrites.map(...)` 全部合入 `violations`，并以 `auditResult.passed && blockedWriteViolations.length === 0` 作为最终通过条件。

因此，只要 append-only `write_guard_log.jsonl` 中曾出现过 blocked write，即使该写入没有落盘、后续已授权、最终 changed files 全部合法，审计仍会永久 FAIL。

## 3. 修复语义

本次 hotfix 保留 Write Guard append-only 审计事实，不清理、不覆盖、不隐藏历史日志，只改变 blocked write 的审计分类：

| 分类 | 含义 | 是否阻断 |
|---|---|---|
| `historical_blocked_discovery_resolved` | 历史 blocked attempt 已被最终授权范围覆盖，并且存在同路径后续 allowed write | 否 |
| `historical_blocked_no_effect` | 历史 blocked attempt 已被最终授权范围覆盖，但最终无同路径实际写入 | 否，作为历史/说明事件 |
| `unresolved_blocked_attempt` | blocked attempt 未被最终授权范围覆盖，无法证明已解决 | 是 |

实际 out-of-scope factual changed files 仍由 `runChangedFilesAudit` 判定，必须 FAIL。

## 4. 修改文件

- `packages/daemon-core/src/tools/lib/changed-files-audit.ts`
  - 导出 `normalizeAuditPath`、`pathMatchesForAudit`、`operationMatchesForAudit`，供 blocked write 分类复用同一套路径/操作匹配规则。

- `packages/daemon-core/src/tools/lib/blocked-write-classification.ts`
  - 新增 blocked write 分类逻辑。

- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts`
  - 将“所有 blocked writes 都是 violations”改为“仅 unresolved blocked attempts 是 violations”。
  - 保留旧字段 `blocked_write_attempts`。
  - 新增 `resolved_blocked_write_attempts`、`unresolved_blocked_write_attempts`、`blocked_write_classifications`。
  - 更新 `changed_files_audit.md` 输出，明确展示 Historical / Resolved 与 Unresolved blocked writes。

- `tests/regression/v1.2.3-changed-files-audit-historical-blocks.test.ts`
  - 新增 4 个回归用例。

## 5. 安全边界

本修复不降低 Write Guard 的安全性：

1. 不删除 `write_guard_log.jsonl`。
2. 不忽略 blocked writes。
3. 不移除 `blocked_write_attempts` 字段。
4. 不允许实际 out-of-scope changed files 通过。
5. 不绕过 `close_gate`。
6. 不修改 `events.jsonl`、`runtime/state.json` 或状态机主链路。

## 6. 验收项

建议执行：

```powershell
bun test tests/regression/v1.2.3-changed-files-audit-historical-blocks.test.ts
bun test tests/regression/v1.2.2-write-guard-runtime-hotfix.test.ts
bun run build
```

期望结果：

```text
v1.2.3 regression tests PASS
v1.2.2 regression tests PASS
build PASS
```

## 7. 后续

本修复适合作为 v1.2.3 hotfix，因为它来自真实项目 fj1 的治理阻塞。v1.3 后续仍可继续扩展更完整的 audit model，例如正式的 resolved marker、用户确认 reconciliation、audit waiver workflow 等，但 v1.2.3 先修复“历史 blocked write 永久卡死 WI”的真实问题。
