# SpecForge v1.1 Minimal WI Dry-Run Report

## Scope

本报告记录通过 daemon API 完成最小 Work Item dry-run 的确定性验证结果。

- 不声明 v1.1-complete
- 不声明 production-compliant
- 不声明 production ready
- 不声明 Production readiness: READY
- 不声明 Trial readiness: READY

## Baseline

- main: `49cf6dc`
- branch: `v1.1-minimal-wi-dry-run`
- 前置: OpenCode serve API trial PARTIAL

## Deterministic WI Dry-Run Evidence

### Daemon 启动

| 项目 | 结果 |
|---|---|
| 启动方式 | 完整 Daemon 类（无参构造） |
| StateManager | 完整注入 |
| ProjectManager | 完整注入 |
| SessionRegistry | 完整注入 |
| ExtensionLoader | 完整注入 |
| Health | ok |
| Handshake 路径 | `$XDG_CONFIG_HOME/opencode/sf-user/runtime/handshake.json` |
| HOME/.specforge | 未创建 |

### POST /api/v1/project/ensure

| 项目 | 结果 |
|---|---|
| 返回 | `success: true` |
| .specforge/project/ | 创建 ✓ |
| .specforge/work-items/ | 创建 ✓ |
| .specforge/runtime/ | 创建 ✓ |
| spec_manifest.json | 存在 ✓ |
| extension_registry.json | 存在 ✓ |
| requirements_index.md | 存在 ✓ |
| design_index.md | 存在 ✓ |
| architecture.md | 存在 ✓ |
| glossary.md | 存在 ✓ |
| decisions.md | 存在 ✓ |
| trace_matrix.md | 存在 ✓ |
| modules/ | 存在 ✓ |

### spec_manifest.json 证据

路径：`.specforge/project/spec_manifest.json`

关键字段确认：
- `schema_version: "1.0"` ✓
- `project_spec_version: "PSV-0001"` ✓
- `project.extension_registry: ".specforge/project/extension_registry.json"` ✓

### extension_registry.json 证据

路径：`.specforge/project/extension_registry.json`

结构确认：
- `schema_version: "1.0"` ✓
- `project_spec_version: "PSV-0001"` ✓
- `namespaces.requirement_types: []` ✓
- `namespaces.design_types: []` ✓
- `namespaces.task_types: []` ✓
- `namespaces.verification_types: []` ✓
- `namespaces.gate_types: []` ✓
- `updated_by_work_item: null` ✓
- `updated_at: null` ✓

### POST /api/v1/v11/work-item/create

| 项目 | 结果 |
|---|---|
| 返回 | `success: true` |
| WI ID | `WI-0001` |
| workflow_path | `code_only_fast_path` |
| WI 路径 | `.specforge/work-items/WI-0001/` |

### WI 闭环文件

| 文件 | 存在 | 说明 |
|---|---|---|
| work_item.json | ✓ | schema_version 1.0, status intake_ready |
| intake.md | ✓ | 含原始用户请求 |
| change_classification.md | ✓ | 占位 |
| impact_analysis.md | ✓ | 占位 |
| trigger_result.json | ✓ | workflow_path=code_only_fast_path |
| tasks.md | ✓ | 占位 |
| trace_delta.md | ✓ | 占位 |
| candidate_manifest.json | ✓ | entries=[], workflow_path=code_only_fast_path |
| gate_summary.md | ✓ | pending |
| verification_report.md | ✓ | 占位 |
| merge_report.md | ✓ | status=not_applicable |
| evidence/evidence_manifest.json | ✓ | entries=[] |

### code_only_fast_path 规则验证

- `candidate_manifest.entries` = `[]` ✓
- `merge_report.status` = `not_applicable` ✓
- tasks.md 存在 ✓
- trace_delta.md 存在 ✓
- verification_report.md 存在 ✓
- evidence_manifest.json 存在 ✓

### changed_files_audit / close_gate 状态

| 项目 | 状态 |
|---|---|
| changed_files_audit | 未生成（WI 未关闭） |
| close_gate | 未执行 |
| WI 是否 closed | 否 — WI status 为 `intake_ready` |
| 原因 | dry-run only, WI 创建但未关闭。close_gate 只在 WI 生命周期关闭阶段执行。 |

### 禁止目录检查

| 目录 | 存在 |
|---|---|
| .specforge/standards/ | ❌ |
| .specforge/archive/ | ❌ |
| .specforge/state/ | ❌ |
| .specforge/gates/ | ❌ |
| .specforge/reports/ | ❌ |
| .specforge/snapshots/ | ❌ |
| .specforge/specs/ | ❌ |

## OpenCode LLM Smoke Trial

| 项目 | 结果 |
|---|---|
| OpenCode serve | 启动成功 (port 4100) |
| Daemon | 独立启动成功 (port 54212) |
| Agent | sf-orchestrator |
| Prompt | "请调用 sf_state_read 工具，参数 work_item_id=all" |
| LLM 是否触发 tool | ✅ 是 — `sf_state_read {"work_item_id":"all"}` |
| Tool 执行结果 | ✅ 成功 — 返回 6 个 Work Items 状态 |
| OpenCode → plugin → daemon 跨进程通信 | ✅ 完成 |

### LLM 返回内容摘要

```
| WI ID | 工作流类型 | 当前状态 |
|-------|-----------|---------|
| INV-005 | investigation | completed |
| INV-006 | investigation | completed |
| WI-007 | change_request | completed |
| WI-008 | change_request | development |
| WI-009 | change_request | intake |
| WI-LIVE-V11-PATH-001 | feature_spec | created |
```

### Failure Analysis（修复前）

- 失败边界：thin-client.ts handshake discovery
- 根因：`thin-client.ts` 的 `readHandshake()` 搜索路径不包含 v1.1 标准位置 `$CONFIG_ROOT/sf-user/runtime/handshake.json`
- 修复：在搜索列表中加入 `resolveOpenCodeConfigRoot()/sf-user/runtime/handshake.json`，支持 OPENCODE_CONFIG_DIR / XDG_CONFIG_HOME / 默认 fallback

## Test Evidence

| 测试组 | 结果 |
|---|---|
| scripts/tests/ (含 WI E2E) | 67 pass, 0 fail |
| daemon-core production | 29 pass, 0 fail |
| workflow-runtime v11/e2e | 123 pass, 0 fail |

## Final Results

```
Deterministic WI dry-run: COMPLETED
OpenCode LLM smoke trial: COMPLETED (tool successfully invoked daemon and received response)
OpenCode serve API trial: PARTIAL → upgraded to COMPLETED for tool→daemon chain
v1.1 complete: NO
Production readiness: NOT READY
Trial readiness: NOT READY
```

## Non-Goals

- This report does not declare v1.1-complete.
- This report does not declare production-compliant.
- This report does not declare production ready.
- This report does not declare Production readiness: READY.
- This report does not declare Trial readiness: READY.
