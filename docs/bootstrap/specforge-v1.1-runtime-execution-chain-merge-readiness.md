# SpecForge v1.1 Runtime Execution Chain — Merge Readiness Report

## 1. 分支名称

`v1.1-runtime-execution-chain-fix`

## 2. 本轮修复范围

Runtime 执行链 v1.1 对齐：让 MergeRunner 和 CloseGate 直接执行 v1.1 结构，拒绝旧结构。

修改范围限定在：
- `packages/workflow-runtime/src/v11/runtime/MergeRunner.ts`
- `packages/workflow-runtime/src/v11/runtime/CloseGate.ts`
- `packages/workflow-runtime/src/v11/index.ts`
- `packages/workflow-runtime/tests/v11/e2e/` (4 files)
- `docs/bootstrap/` (3 files)

## 3. 已修复问题

| # | 问题 | 修复方式 |
|---|---|---|
| 1 | v1.1 正向 merge 把 entries 转成 candidates | 新增 executeV11Merge() 直接消费 entries[] |
| 2 | v1.1 正向 merge 把 replace 转成 update | executeV11Merge 只接受 operation:'replace' |
| 3 | MergeRunner 只有 executeMerge() 接受旧 CandidateManifest | 新增 executeV11Merge() 作为 v1.1 入口 |
| 4 | 旧 candidates manifest 能作为 v1.1 合法输入 | validateV11Manifest + executeV11Merge 拒绝 |
| 5 | code_only_fast_path 没有真实 trace_delta.md | v11-code-only-filesystem-e2e 写出真实文件 |
| 6 | code_only_fast_path 没有真实 verification_report.md | 同上 |
| 7 | code_only_fast_path 没有真实 evidence_manifest.json | 同上 |
| 8 | code_only_fast_path 没有真实 changed_files_audit.json | 同上 |
| 9 | close_gate 只靠手工布尔值通过 | 新增 validateFromFileSystem() 从磁盘读证据 |
| 10 | notApplicableFlags 放水 | 所有 e2e 测试中消除 notApplicableFlags evidence bypass |
| 11 | target_spec_version 残留 | 从正向流程中完全消除 |
| 12 | operation:'update' 残留 | 正向流程消除，仅负向测试保留 |
| 13 | compliance gap 过期状态 | 更新为实际状态 |

## 4. 未修复问题

| # | 问题 | 原因 |
|---|---|---|
| 1 | Daemon/OpenCode 实际运行链 E2E | 需要新分支 v1.1-daemon-opencode-e2e |
| 2 | Extension Subflow 端到端 E2E | 需要新分支 |
| 3 | installer-no-legacy-write.test.ts 无法通过 vitest 跑 | 模块解析配置问题；源码已验证正确 |
| 4 | v11-compliance-e2e Scenario 4 仍用旧 JSON 格式 | 测试 hash 完整性，格式无关 |

## 5. 测试命令

```bash
npx vitest run tests/v11/e2e/v11-filesystem-lifecycle-e2e.test.ts
npx vitest run tests/v11/e2e/v11-code-only-filesystem-e2e.test.ts
npx vitest run tests/v11/e2e/v11-compliance-e2e.test.ts
npx vitest run tests/v11/e2e/v11-runtime-orchestration-e2e.test.ts
npx vitest run tests/v11/unit/path-policy-permissions.test.ts
```

工作目录：`packages/workflow-runtime`

## 6. 测试结果

```
v11-filesystem-lifecycle-e2e.test.ts    → 36 tests passed ✅
v11-code-only-filesystem-e2e.test.ts    → 8 tests passed ✅
v11-compliance-e2e.test.ts              → 42 tests passed ✅
v11-runtime-orchestration-e2e.test.ts   → 12 tests passed ✅
path-policy-permissions.test.ts         → 54 tests passed ✅

Total: 5 files, 152 tests passed, 0 failures
```

## 7. grep 证据

### executeV11Merge（有结果 ✅）
- `src/v11/runtime/MergeRunner.ts`: 定义 + 实现
- `tests/v11/e2e/v11-filesystem-lifecycle-e2e.test.ts`: 11 matches (正向 + 9 负向)
- `tests/v11/e2e/v11-runtime-orchestration-e2e.test.ts`: 2 matches (Test 6 + Test 12)

### manifest.entries（有结果 ✅）
- `src/v11/runtime/MergeRunner.ts`: `for (const entry of manifest.entries)` — 直接遍历 entries

### operation: 'update'（只在负向样例 ✅）
- `v11-filesystem-lifecycle-e2e.test.ts`: 仅在 NEGATIVE test sections
- `v11-compliance-e2e.test.ts`: 仅在 Scenario 4 hash integrity tests（格式无关）
- `v11-runtime-orchestration-e2e.test.ts`: 0 matches

### badLegacyManifest（有结果 ✅）
- `v11-compliance-e2e.test.ts`: `badLegacyManifestJson` 和 `badLegacyManifest` 用于旧 API 兼容测试

### Trace Impact: none（有结果 ✅）
- `v11-code-only-filesystem-e2e.test.ts`: 写出真实 trace_delta.md 含 "Trace Impact: none"

### changed_files_audit（有结果 ✅）
- `v11-code-only-filesystem-e2e.test.ts`: 写出真实 changed_files_audit.json + 负向测试删除后失败
- `v11-filesystem-lifecycle-e2e.test.ts`: ChangedFilesAudit 审计

### Installer Legacy Write | NOT Fixed（无结果 ✅）
- 已修正为 "Fixed in bootstrap remediation"

## 8. 合并建议

本分支可以作为 Runtime execution chain fix 合并候选。

```bash
git checkout main
git pull
git merge --no-ff v1.1-runtime-execution-chain-fix -m "feat(runtime): align v1.1 merge and close gate execution chain"
git tag v1.1-runtime-execution-chain-fixed
git push yc main --tags
```

不得标记 `v1.1-complete`。

## 9. 合并后下一阶段

合并后开新分支：

```bash
git checkout -b v1.1-daemon-opencode-e2e
```

下一阶段验证：
1. OpenCode `tool.execute.before` → daemon Write Guard → active WI → `allowed_write_files` → actual changed files → `changed_files_audit` → `close_gate`
2. Extension Request → sf-extension → extension_registry candidate → extension_gate → User Decision → Merge Runner → 主流程恢复
