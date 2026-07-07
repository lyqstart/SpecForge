# Package 5B：semantic-closure-core 纯函数库

## 1. 本包目标

本包只新增语义闭包校验核心和单元测试，不接入 `close-gate.ts`，不推进状态机，不修改任何运行时状态。

新增文件：

```text
packages/daemon-core/src/tools/lib/semantic-closure-core.ts
packages/daemon-core/tests/unit/semantic-closure-core.test.ts
docs/specforge-semantic-closure-core-result.md
```

## 2. 为什么先做纯函数

当前 close gate 已经有 required files、user decision、code permission revoked、changed files audit、merge_report、evidence manifest 等硬检查，但这些检查仍主要围绕“文件存在、报告非空、状态文本包含 pass/success”。语义闭包要避免 fj1 这类问题，必须先把用户目标到证据的机器可校验规则抽出来。

因此本包先建立纯函数：

```ts
validateSemanticClosure(manifest)
```

它只接收一个 `.semantic_closure.json` 风格对象，返回：

```ts
{
  passed: boolean,
  checks: SemanticClosureCheck[],
  errors: SemanticClosureIssue[],
  warnings: SemanticClosureIssue[]
}
```

## 3. 当前最小硬约束

本包实现的最小硬约束：

1. 必须声明至少一个 `outcome`、`requirement`、`task`、`evidence`。
2. 所有语义对象 id 不得重复。
3. 每个用户目标 `OUT` 必须被至少一个需求承接。
4. 每个 `MUST` 需求必须被至少一个 task 承接。
5. 每个 `MUST` 需求必须有 passed 且非弱证据证明。
6. 每个用户目标必须有 passed 且非弱证据证明。
7. 显式 `required_evidence_refs` 必须存在、passed、且不能是弱证据。
8. task 显式引用的 evidence 必须存在、passed、且不能是弱证据。
9. design decision 必须引用至少一个 requirement。
10. `project_integration.status` 必须是 `merged` 或 `not_applicable`。

弱证据包括：

```text
L0 / L1 / L2
file-only / compile-only / build-only / static-only
```

这些证据可以作为辅助证据，但不能作为关闭用户目标或 MUST 需求的完成证据。

## 4. 单元测试覆盖

新增单元测试覆盖：

1. 完整 OUT → REQ → DD → TASK → EV 闭包通过。
2. compile-only / file-only 证据不能关闭 MUST 需求。
3. unknown evidence 不能作为 required evidence。
4. 缺失 project integration 会失败。
5. design decision 没有 requirement 依据会失败。

## 5. 本包没有做什么

本包没有：

1. 修改 `close-gate.ts`。
2. 修改 `sf-v11-close-gate.ts` handler。
3. 生成 `.semantic_closure.json`。
4. 修改 requirements/design/tasks/evidence 写入逻辑。
5. 改变任何状态机行为。

这些放到后续 Package 5C / 5D。

## 6. 建议本地验证命令

```powershell
cd D:\code\temp\SpecForge\packages\daemon-core
bun test tests/unit/semantic-closure-core.test.ts
bun run build
```

如果 `bun test` 参数传递不兼容，可执行：

```powershell
bun run test -- tests/unit/semantic-closure-core.test.ts
bun run build
```

## 7. 建议提交信息

```text
test(gates): add semantic closure core validator
```
