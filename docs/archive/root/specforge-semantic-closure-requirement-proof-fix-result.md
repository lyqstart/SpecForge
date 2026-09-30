# SpecForge Semantic Closure Requirement Proof Fix

## 背景

`semantic-closure-fj1-regression.test.ts` 中两个负向场景已经被 validator 判定为 `passed=false`，但其中 `REQ-FLUSH-WIRED` / `REQ-SERVER-UPLOAD` 的 `has_passed_evidence` 没有失败。

根因不是测试夹具，而是 `semantic-closure-core.ts` 中 `requirementHasClosureEvidence()` 过宽：当多个 MUST requirement 共用一个 task 时，某个 requirement 可以通过“同一 task 上其它 evidence”被间接认为有 passed evidence。

这会留下 fj1 类漏洞：本地落盘证据可能通过共享 task 让 server upload / flush wiring 看起来完成。

## 修复

修改 `requirementHasClosureEvidence()`：

- MUST requirement 必须由直接支持该 requirement id 的 passed 且非弱 evidence 证明；
- 不再允许通过共享 task 上的其它 evidence 间接证明 requirement；
- 保留 `required_evidence_refs` 的硬检查；
- 保留 task 自身的 evidence_refs 检查；
- 不改变 close_gate / producer / builder 接口。

## 影响

修复后：

- `REQ-FLUSH-WIRED` 缺少 `EV-FLUSH-WIRED` 时，会同时触发：
  - `semantic_requirement_REQ-FLUSH-WIRED_required_evidence_passed`
  - `semantic_requirement_REQ-FLUSH-WIRED_has_passed_evidence`
  - `semantic_task_TASK-IMPLEMENT-LOGGING_refs_exist` / `semantic_task_TASK-IMPLEMENT-LOGGING_evidence_passed`
- `REQ-SERVER-UPLOAD` 缺少 server upload evidence 时同理；
- fj1 回归测试中的“flush 未接入真实运行路径”和“只有本地日志 evidence、缺 server upload evidence”会被更准确地阻断。

## 验证命令

```powershell
cd D:\code\temp\SpecForge\packages\daemon-core

bun run test -- tests/unit/semantic-closure-core.test.ts tests/unit/semantic-closure-builder.test.ts tests/unit/sf-semantic-closure-run.test.ts tests/unit/close-gate-semantic-closure.test.ts tests/unit/close-gate-extension-request.test.ts tests/unit/sf-v11-close-gate.test.ts tests/unit/semantic-closure-fj1-regression.test.ts

bun run build
```
