# SpecForge v1.3.2 Hotfix — no-code investigation changed_files_audit

## 问题

正式项目 WI-0035 是 `investigation` 审查工作流，按治理规则不应启用 `code_permission`；但状态机在 `implementation_running -> implementation_done` 前要求 `changed_files_audit.md`，而 `sf_changed_files_audit` 又强制要求曾启用 `code_permission`。这导致合法 no-code investigation 工作流进入死锁：

```text
investigation 禁止 code_permission
changed_files_audit 强制 code_permission
implementation_done 又强制 changed_files_audit
```

## 修复原则

本修复不放宽实现型 WI 的代码治理规则，只新增受限 no-code 审计路径：

1. 普通实现型 WI 仍必须先 `sf_code_permission`，再 `sf_changed_files_audit`。
2. no-code investigation/review/audit 类 WI 可调用：

```text
sf_changed_files_audit(work_item_id=WI-XXXX, mode=no_code_change)
```

3. no-code 模式只在以下条件下 PASS：
   - workflow_type / workflow_path 属于 investigation/review/audit/no-code 范围；
   - code_permission 从未启用；
   - 没有业务/项目文件变更；
   - 没有未解决的 Write Guard 阻断；
   - 只允许治理产物写入 `.specforge/work-items/<WI>/`。
4. 如果之前因 `CODE_PERMISSION_NOT_ENABLED` 产生 hard_stop，no-code audit 通过后可以清除该 latch。
5. close_gate 接受 `changed_files_audit.md` 的 `not_applicable / no_code_change / PASS`，但仅限 no-code workflow。

## 修改文件

- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts`
  - 新增 `mode=no_code_change` / `audit_mode=not_applicable`。
  - no-code 模式允许在 `CODE_PERMISSION_NOT_ENABLED` hard_stop 下运行。
  - no-code 模式通过后写入 `changed_files_audit.md`，结论为 `PASS` + `not_applicable / no_code_change`。
  - no-code 模式不启用 code_permission，不生成 allowed_write_files。

- `packages/daemon-core/src/tools/lib/close-gate.ts`
  - close_gate 对 no-code audit 进行受限识别。
  - investigation/review/audit/no-code 工作流可在 code_permission 从未启用的情况下关闭。
  - 普通 feature/bugfix/refactor 实现型 WI 仍要求 code_permission revoked。

- `setup/userlevel-opencode/tools/sf_changed_files_audit.ts`
  - OpenCode wrapper 暴露 `mode` / `audit_mode` 参数。

- `packages/daemon-core/tests/unit/no-code-changed-files-audit.test.ts`
  - 覆盖 no-code audit 正向、hard_stop 清除、feature_spec 禁用 no-code 模式。

- `packages/daemon-core/tests/unit/close-gate-no-code-audit.test.ts`
  - 覆盖 close_gate 接受 investigation no-code audit，并拒绝 feature_spec 冒用。

## WI-0035 恢复路径

修复部署后，对已暂停的 WI-0035 应按以下方式继续：

```text
1. 如仍存在 CODE_PERMISSION_NOT_ENABLED hard_stop，可先用 sf_hard_stop_resolve 记录 false_positive；
2. 调用 sf_changed_files_audit(work_item_id=WI-0035, mode=no_code_change)；
3. 确认 changed_files_audit.md 里 ## Result: PASS；
4. 推进 implementation_running -> implementation_done；
5. 继续 verification；
6. 调用 sf_semantic_closure_run；
7. 调用 sf_close_gate。
```

如果发现 WI-0035 实际存在业务代码变更，必须停止，不得使用 no-code 模式关闭。

## 建议版本

建议发布为：

```text
v1.3.2
```

原因：这是 v1.3.1 之后的治理工具链 hotfix，修复 no-code investigation 工作流无法关闭的问题，不改变 v1.3 主体语义闭包能力。
