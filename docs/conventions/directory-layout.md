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
| project | `project` | 项目级正式规格目录 — `<root>/.specforge/project/` |
| workItems | `work-items` | Work Item 事务根目录 — `<root>/.specforge/work-items/` |

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
| workItemFiles.requirementsDelta | `requirements_delta.md` | — |
| workItemFiles.designDelta | `design_delta.md` | — |
| workItemFiles.tasks | `tasks.md` | — |
| workItemFiles.traceDelta | `trace_delta.md` | — |
| workItemFiles.candidateManifest | `candidate_manifest.json` | — |
| workItemFiles.candidates | `candidates` | — |
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
| runtimeFiles.wal | `runtime/wal.jsonl` | — |
| runtimeFiles.state | `runtime/state.json` | — |
| runtimeFiles.checkpoints | `runtime/checkpoints` | — |
| runtimeFiles.logs | `runtime/logs` | — |

## Legacy Paths (read-only / deprecated)

> ⚠️ 以下路径已从 LAYOUT 移除，仅供 legacy readers 读取，新代码不得使用这些路径进行写入。

### 项目级 Legacy Paths

| Key | 路径 | 说明 |
|-----|------|------|
| specsReadOnly | `specs` | 旧规格目录（legacy read-only）— `<root>/.specforge/specs/` |
| manifest | `manifest.json` | 旧根级 manifest — `<root>/.specforge/manifest.json` |
| config | `config` | 旧配置目录 — `<root>/.specforge/config/` |
| knowledge | `knowledge` | 旧知识目录 — `<root>/.specforge/knowledge/` |
| knowledgeGraph | `knowledge/graph.json` | 旧知识图谱 — `<root>/.specforge/knowledge/graph.json` |

#### legacyPaths.configFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| configFiles.projectRules | `config/project-rules.md` | — |
| configFiles.prodEnv | `config/prod-environment.md` | — |
| configFiles.project | `config/project.json` | — |
| configFiles.riskPolicy | `config/risk_policy.json` | — |
| configFiles.skillFragments | `config/skill_fragments.json` | — |

### 用户级 Legacy Paths (~/.specforge/)

| Key | 路径 | 说明 |
|-----|------|------|
| runtime | `runtime` | 运行时状态目录 — `~/.specforge/runtime/` |
| runtimeHandshake | `runtime/handshake.json` | 握手文件 — `~/.specforge/runtime/handshake.json` |
| runtimeState | `runtime/state.json` | 持久化状态 — `~/.specforge/runtime/state.json` |
| runtimeEvents | `runtime/events.jsonl` | 事件日志 — `~/.specforge/runtime/events.jsonl` |
| runtimeDaemonLock | `runtime/daemon.lock` | Daemon 锁文件 — `~/.specforge/runtime/daemon.lock` |
| hostProfile | `host-profile.json` | 主机配置文件 — `~/.specforge/host-profile.json` |
| logs | `logs` | 日志目录 — `~/.specforge/logs/` |
| projects | `projects` | 项目目录 — `~/.specforge/projects/` |
| templates | `templates` | 模板目录 — `~/.specforge/templates/` |
| backups | `backups` | 备份目录 — `~/.specforge/backups/` |

---
