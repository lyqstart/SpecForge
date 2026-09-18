# SpecForge 目录布局（v1.1）

> ⚠️ 本文档由 `scripts/render-layout.ts` 从 `packages/types/src/directory-layout.ts` 自动生成。
> 不要手动编辑。

## 项目目录名

```
SPEC_DIR_NAME = '.specforge'
```

## v1.1 Active Paths (.specforge/)

### committed 区（提交到 Git）

| Key | 路径 | 说明 |
|-----|------|------|
| config | `config` | 项目配置目录 — `<root>/.specforge/config/` |
| project | `project` | 项目级正式规格目录 — `<root>/.specforge/project/` |
| workItems | `work-items` | Work Item 事务根目录 — `<root>/.specforge/work-items/` |

### configFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| configFiles.projectRules | `config/project-rules.md` | — |
| configFiles.prodEnv | `config/prod-environment.md` | — |
| configFiles.project | `config/project.json` | — |

### projectFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| projectFiles.specManifest | `project/spec_manifest.json` | — |
| projectFiles.extensionRegistry | `project/extension_registry.json` | — |
| projectFiles.requirementsIndex | `project/requirements_index.md` | — |
| projectFiles.designIndex | `project/design_index.md` | — |
| projectFiles.architecture | `project/architecture.md` | — |
| projectFiles.glossary | `project/glossary.md` | — |
| projectFiles.decisions | `project/decisions.md` | — |
| projectFiles.traceMatrix | `project/trace_matrix.md` | — |
| projectFiles.modulesRoot | `project/modules` | — |

### workItemFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| workItemFiles.workItemJson | `work_item.json` | — |
| workItemFiles.intake | `intake.md` | — |
| workItemFiles.changeClassification | `change_classification.md` | — |
| workItemFiles.impactAnalysis | `impact_analysis.md` | — |
| workItemFiles.triggerResult | `trigger_result.json` | — |
| workItemFiles.requirements | `requirements.md` | — |
| workItemFiles.design | `design.md` | — |
| workItemFiles.requirementsDelta | `requirements_delta.md` | — |
| workItemFiles.designDelta | `design_delta.md` | — |
| workItemFiles.domainAnalysis | `domain_analysis.md` | — |
| workItemFiles.moduleBoundaryAnalysis | `module_boundary_analysis.md` | — |
| workItemFiles.architectureMigrationMap | `architecture_migration_map.md` | — |
| workItemFiles.projectSpecVersionBefore | `project_spec_version_before.json` | — |
| workItemFiles.projectSpecVersionAfter | `project_spec_version_after.json` | — |
| workItemFiles.tasks | `tasks.md` | — |
| workItemFiles.traceDelta | `trace_delta.md` | — |
| workItemFiles.candidateManifest | `candidate_manifest.json` | — |
| workItemFiles.candidates | `candidates` | — |
| workItemFiles.candidateFiles.project | `project` | — |
| workItemFiles.candidateFiles.modulesRoot | `project/modules` | — |
| workItemFiles.candidateFiles.requirements | `requirements.candidate.md` | — |
| workItemFiles.candidateFiles.design | `design.candidate.md` | — |
| workItemFiles.candidateFiles.tasks | `tasks.md` | — |
| workItemFiles.candidateFiles.traceDelta | `trace_delta.md` | — |
| workItemFiles.gates | `gates` | — |
| workItemFiles.gateSummary | `gate_summary.md` | — |
| workItemFiles.userDecision | `user_decision.json` | — |
| workItemFiles.verificationReport | `verification_report.md` | — |
| workItemFiles.mergeReport | `merge_report.md` | — |
| workItemFiles.evidence | `evidence` | — |
| workItemFiles.evidenceManifest | `evidence/evidence_manifest.json` | — |
| workItemFiles.extensionRequest | `extension_request.json` | — |
| workItemFiles.extensionDelta | `extension_delta.md` | — |

### gitignored 区（运行时数据）

| Key | 路径 | 说明 |
|-----|------|------|
| runtime | `runtime` | 运行时状态目录（gitignored）— `<root>/.specforge/runtime/` |

### runtimeFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| runtimeFiles.events | `runtime/events.jsonl` | authoritative workflow event log |
| runtimeFiles.state | `runtime/state.json` | — |
| runtimeFiles.checkpoints | `runtime/checkpoints` | — |
| runtimeFiles.logs | `runtime/logs` | — |


---
