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
| OpenCode serve | 启动成功 (port 4099) |
| Agent | sf-orchestrator |
| Prompt | "请调用 sf_state_read 工具查看当前项目状态" |
| LLM 是否触发 tool | ✅ 是 — `sf_state_read {"work_item_id":"all"}` |
| Tool 执行结果 | 失败：daemon 连接错误 |
| 失败原因 | OpenCode serve 进程的 plugin 未正确发现 daemon handshake（env 传递问题） |

**结论**：LLM（通过 sf-orchestrator agent）**成功触发了 SpecForge tool 调用**。tool 执行层面的 daemon 连接问题是进程间 env 传递问题，不是 LLM/agent/tool 注册问题。

## Test Evidence

| 测试组 | 结果 |
|---|---|
| scripts/tests/ (含 WI E2E) | 67 pass, 0 fail |
| daemon-core production | 29 pass, 0 fail |
| workflow-runtime v11/e2e | 123 pass, 0 fail |

## Final Results

```
Deterministic WI dry-run: COMPLETED
OpenCode LLM smoke trial: PARTIAL (LLM triggered tool, but daemon connection failed in serve process)
OpenCode serve API trial: PARTIAL
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
