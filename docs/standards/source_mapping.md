# v1.1 Standard Source Mapping

> Maps every section of the SpecForge v1.1 Fused Standard (including Patch 1) to implementation files, 
> old rules, legacy compatibility notes, actor roles, state transitions, gates, path policies, and write guard rules.

---

## 1. Section → Implementation File Mapping

### §0: General Principles (总则)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §0.1 SpecForge Goals | `AGENT_CONSTITUTION.md` | Agent doc | Core goal statement; agents must acknowledge |
| §0.2 Supreme Constraints | `AGENT_CONSTITUTION.md`, `packages/daemon-core/src/gate-runner-v11.ts` | Agent doc + code | 10 critical controls must be in Runtime, not agent trust |
| §0.3 Priority Hierarchy | `packages/types/src/constants.ts` | Code constant | `STANDARD_PRIORITY` array for error/warning messages |

**Old Rules Replaced**: None (new in v1.1).

---

### §1: Directory Boundaries & Path Governance (目录边界与路径治理)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §1.1 Two-layer Model | `packages/types/src/directory-layout.ts` | Types | `SPEC_DIR_NAME`, `projectFiles`, `workItemFiles`, `runtimeFiles` |
| §1.2 OpenCode Extension Layer | `packages/types/src/directory-layout.ts` | Types | `opencodeExtensionPaths` map |
| §1.3 MVP Directory | `packages/types/src/directory-layout.ts`, `packages/daemon-core/src/path-policy.ts` | Types + enforcement | `mvpForbiddenDirs` list |
| §1.4 Governance File Location | `packages/daemon-core/src/path-policy.ts` | Enforcement | `isStandardLocation()` |
| §1.5 Path Service | `packages/types/src/directory-layout.ts` | Types | 19 path generation functions |
| §1.6 Path Policy | `packages/daemon-core/src/path-policy.ts` | Enforcement | 7 path rules + actor-based canCreate/Read/Write |
| §1.7 Legacy Paths | `packages/daemon-core/src/path-policy.ts` | Enforcement | `isLegacyPath()`, `legacyReadOnly` flag |

**Old Rules Replaced**:
- v1.0: `.specforge/specs/` was the primary spec directory → v1.1: `.specforge/project/` is truth source, `.specforge/specs/` is legacy read-only
- v1.0: No Path Policy → v1.1: Centralized PathPolicy enforcement
- v1.0: `directory-layout.ts` was constants only → v1.1: Upgraded to Path Service with generation functions

**Legacy Compatibility Notes**:
- Old `.specforge/specs/<WI-ID>/` remains readable for migration purposes
- New WIs must never write to old specs paths
- `spec_migration_path` (§7.6) handles structured migration

---

### §2: Project-Level Spec Truth Source (项目级正式规格真相源)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §2.1 Directory Structure | `packages/types/src/directory-layout.ts` | Types | `projectFiles` map with all 8+ files |
| §2.2 File Responsibilities | `packages/types/src/schema.ts` | Types | Schema per file type |
| §2.3 spec_manifest.json | `packages/types/src/schema.ts` (SpecManifestSchema) | Types | Must include `extension_registry` per Patch1 §3 |
| §2.4 Version Rules | `packages/daemon-core/src/merge-runner-v11.ts` | Enforcement | `incrementSpecVersion()`, `updateSpecManifest()` |

**Old Rules Replaced**:
- v1.0: No `spec_manifest.json` → v1.1: Required with schema_version, project_spec_version
- v1.0: No `extension_registry.json` → v1.1: Required by Patch1
- v1.0: No `project_spec_version` monotonic increment → v1.1: Mandatory per merge

---

### §3: ID & Format Rules (ID 与基础格式规则)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §3.1 MODULE_CODE | `packages/types/src/constants.ts` | Constant | `MODULE_CODE_REGEX` |
| §3.2 Fixed ID Regex | `packages/types/src/constants.ts` | Constant | 5 ID regex patterns |
| §3.3 Centralized Implementation | `tools/lib/id-rules.ts` | Utility | All validation and generation functions |

**Old Rules Replaced**:
- v1.0: ID rules scattered across gates/parsers → v1.1: Centralized in `id-rules.ts`

---

### §4: Work Item Transaction Model (Work Item 事务模型)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §4.1 WI Nature | `AGENT_CONSTITUTION.md` | Agent doc | "No WI = no code change" principle |
| §4.2 WI Directory | `packages/types/src/directory-layout.ts` | Types | `workItemFiles` map with all 16+ files |
| §4.3 Required Closure Files | `packages/daemon-core/src/gate-runner-v11.ts` (required_files_gate) | Enforcement | 12 mandatory files |
| §4.4 work_item.json | `packages/types/src/schema.ts` (WorkItemJsonSchema) | Types | Minimal structure + extensible fields |
| §4.5 intake.md | `packages/daemon-core/src/gate-runner-v11.ts` (entry_gate) | Enforcement | Original request preservation |

**Old Rules Replaced**:
- v1.0: WI files in `.specforge/specs/<WI-ID>/` → v1.1: `.specforge/work-items/<WI-ID>/`
- v1.0: No mandatory closure files → v1.1: 12 files required for all WIs
- v1.0: intake could be overwritten → v1.1: Must preserve original user request

---

### §5: State Machine (状态机)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §5.1 Main States | `packages/types/src/constants.ts` | Enum | 23 states |
| §5.2 Forbidden Transitions | `packages/daemon-core/src/state-machine-v11.ts` | Enforcement | 12 forbidden transitions |
| §5.3 Authorized Actors | `packages/daemon-core/src/state-machine-v11.ts` | Enforcement | 7 authorized subjects |
| §5.4 Resume Mechanism | `packages/daemon-core/src/state-machine-v11.ts` | Enforcement | 7-item resume check |

→ See Section 3 below for full transition table.

---

### §6: Request Entry, Classification & Path Selection (用户请求入口、分类与路径选择)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §6.1 Unified Entry | `~/.config/opencode/agents/sf-orchestrator.md` | Agent doc | Only sf-orchestrator accepts requests |
| §6.2 Classification & Impact | `packages/daemon-core/src/change-classification.ts`, `packages/daemon-core/src/impact-analysis.ts` | Code | Two-stage analysis |
| §6.3 Match Types | `packages/types/src/constants.ts` (MATCH_TYPES) | Constant | 6 types |
| §6.4 workflow_path Enum | `packages/types/src/constants.ts` (WORKFLOW_PATHS) | Constant | 7 paths |
| §6.5 Path Priority | `packages/daemon-core/src/workflow-path-selector-v11.ts` | Code | Priority ordering |
| §6.6 Unknown Upgrade | `packages/daemon-core/src/workflow-path-selector-v11.ts` | Code | 4 upgrade rules |
| §6.7 code-only Strict Checks | `packages/daemon-core/src/workflow-path-selector-v11.ts` | Code | 9 boolean checks |

**Old Rules Replaced**:
- v1.0: No formal classification → v1.1: `change_classification.md` mandatory
- v1.0: No impact analysis → v1.1: `impact_analysis.md` mandatory
- v1.0: No trigger_result.json → v1.1: Machine-readable path selection output
- v1.0: code-only could skip workflow → v1.1: Still requires full WI lifecycle

---

### §7: Workflow Path Standards (Workflow Path 标准)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §7.1 requirement_change_path | `packages/daemon-core/src/workflow-path-selector-v11.ts` | Code | 7 trigger conditions, 8 required outputs, 8 gates |
| §7.2 design_change_path | Same | Code | 6 triggers, escalation to requirement_change_path |
| §7.3 architecture_change_path | Same | Code | 7 triggers, highest priority |
| §7.4 task_change_path | Same | Code | 3 triggers, merge not_applicable allowed |
| §7.5 code_only_fast_path | Same | Code | 7 triggers, candidate_manifest.entries = [] |
| §7.6 spec_migration_path | Same | Code | 5 rules for legacy migration |
| §7.7 rollback_path | Same | Code | 5 rules for controlled reverse change |

---

### §8: Candidate, Delta & Manifest (Candidate、Delta 与 Manifest)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §8.1 Delta | `packages/types/src/schema.ts` (DeltaSchema) | Types | 4 delta types |
| §8.2 Candidate | `packages/daemon-core/src/gate-runner-v11.ts` (candidate_manifest_gate) | Enforcement | 6 Candidate rules |
| §8.3 Candidate Manifest | `packages/types/src/schema.ts` (CandidateManifestSchema) | Types | Full structure |
| §8.4 Manifest Rules | `packages/daemon-core/src/gate-runner-v11.ts`, `packages/daemon-core/src/merge-runner-v11.ts` | Enforcement | 6 manifest rules |

**Old Rules Replaced**:
- v1.0: No Candidate model → v1.1: Complete file candidate, not patch
- v1.0: No manifest → v1.1: candidate_manifest.json mandatory
- v1.0: Direct spec writes → v1.1: Only through Candidate + Gate + User Decision + Merge

---

### §9: Gate, Gate Report & Gate Summary (Gate、Gate Report 与 Gate Summary)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §9.1 Gate Definition | `packages/daemon-core/src/gate-runner-v11.ts` | Code | Gate Runner class |
| §9.2 Gate Categories | `packages/types/src/constants.ts` (GATE_TYPES) | Constant | 14+ gate types |
| §9.3 hard_gate / soft_gate | `packages/types/src/constants.ts` (HARD_GATES, SOFT_GATES) | Constant | Two sets |
| §9.4 Gate Report | `packages/types/src/schema.ts` (GateReportSchema) | Types | Full report structure |
| §9.5 Gate Summary | `packages/daemon-core/src/gate-runner-v11.ts` (generateGateSummary) | Code | 6-question summary |
| §9.6 Freeze Rules | `packages/daemon-core/src/gate-runner-v11.ts` (checkFreeze) | Enforcement | Freeze enforcement |

→ See Section 5 below for full gate check matrix.

---

### §10: User Decision

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §10.1 Definition | `packages/daemon-core/src/user-decision-recorder-v11.ts` | Code | Recorder class |
| §10.2 Binding Data | `packages/types/src/schema.ts` (UserDecisionSchema) | Types | 13 required fields |
| §10.3 Status Enum | `packages/types/src/constants.ts` (USER_DECISION_STATUS) | Constant | 7 statuses |
| §10.4 Rules | `packages/daemon-core/src/user-decision-recorder-v11.ts` | Enforcement | 8 rules |
| §10.5 Write Authority | `packages/daemon-core/src/write-guard-v11.ts` | Enforcement | Only Recorder can write |

**Old Rules Replaced**:
- v1.0: `needs_revision` → v1.1: `request_changes`
- v1.0: `deferred` → v1.1: `pending` or `expired`
- v1.0: Chat approval → v1.1: Only structured user_decision.json

---

### §11: Merge Runner & Version Update (Merge Runner 与版本更新)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §11.1 Definition | `packages/daemon-core/src/merge-runner-v11.ts` | Code | MergeRunner class |
| §11.2 merge_ready_gate | `packages/daemon-core/src/gate-runner-v11.ts` | Enforcement | 14-item check |
| §11.3 Execution Rules | `packages/daemon-core/src/merge-runner-v11.ts` | Enforcement | 6 execution rules |
| §11.4 merge_report.md | `packages/types/src/schema.ts` (MergeReportSchema) | Types | Report structure |
| §11.5 Version Update | `packages/daemon-core/src/merge-runner-v11.ts` | Code | 5 version rules |
| §11.6 post_merge_gate | `packages/daemon-core/src/gate-runner-v11.ts` | Enforcement | 10-item check |

**Old Rules Replaced**:
- v1.0: No Merge Runner → v1.1: Only Merge Runner can write `.specforge/project/**`
- v1.0: No project_spec_version → v1.1: Monotonic increment mandatory
- v1.0: Agents could write spec files → v1.1: Only Merge Runner

---

### §12: code_permission, allowed_write_files & Write Guard

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §12.1 code_permission | `packages/types/src/schema.ts` (WorkItemJsonSchema) | Types | `code_change_allowed`, `allowed_write_files` |
| §12.2 Release Authority | `packages/daemon-core/src/write-guard-v11.ts` | Enforcement | Only code_permission_service |
| §12.3 Release Conditions | `packages/daemon-core/src/write-guard-v11.ts` | Enforcement | 9 conditions |
| §12.4 allowed_write_files | `packages/daemon-core/src/write-guard-v11.ts` | Enforcement | 6 rules |
| §12.5 Write Guard | `packages/daemon-core/src/write-guard-v11.ts` | Code | Full interception system |
| §12.6 Interception Rules | `packages/daemon-core/src/write-guard-v11.ts` | Enforcement | 10 rules |
| §12.7 changed_files_audit | `packages/daemon-core/src/write-guard-v11.ts` | Code | 6-item audit |

→ See Section 7 below for full write guard rule table.

---

### §13: Trace, Verification & Evidence (Trace、Verification 与 Evidence)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §13.1 Trace | `packages/types/src/constants.ts` (TRACE_TYPES) | Constant | REQ/AC/DD/TASK/FILE/TEST/EVIDENCE |
| §13.2 trace_delta.md | `packages/types/src/schema.ts` (TraceDeltaSchema) | Types | 6 impact types |
| §13.3 verification_report.md | `packages/types/src/schema.ts` (VerificationReportSchema) | Types | Must reference evidence |
| §13.4 evidence_manifest.json | `packages/types/src/schema.ts` (EvidenceManifestSchema) | Types | 8 evidence types |
| §13.5 verification_gate | `packages/daemon-core/src/gate-runner-v11.ts` | Enforcement | 6-item check |

---

### §14: Agent Responsibility Boundaries (Agent 职责边界)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §14.1 Controlled Subjects | `packages/types/src/constants.ts` (CONTROLLED_SUBJECTS) | Constant | 6 subjects |
| §14.2 Normal Agents | `packages/daemon-core/src/write-guard-v11.ts`, `AGENT_CONSTITUTION.md` | Enforcement + doc | 9 prohibitions |
| §14.3 Agent Handoff | `~/.config/opencode/agents/*.md` | Agent doc | 7 required fields |
| §14.4 Unknown & Escalation | `AGENT_CONSTITUTION.md` | Agent doc | Escalation signal format |

---

### §15: close_gate & WI Closure (close_gate 与 WI 关闭)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §15.1 Definition | `packages/daemon-core/src/gate-runner-v11.ts` (close_gate) | Code | Final lock |
| §15.2 close_gate Checklist | `packages/daemon-core/src/gate-runner-v11.ts` | Enforcement | 17-item checklist |
| §15.3 Post-closure Rules | `packages/daemon-core/src/write-guard-v11.ts`, `packages/daemon-core/src/state-machine-v11.ts` | Enforcement | closed → any transition blocked |

**Old Rules Replaced**:
- v1.0: No close_gate → v1.1: 17-item checklist mandatory
- v1.0: WI could be reopened → v1.1: closed WI immutable; must create new WI

---

### §16: Rollback & Superseded (回滚与 superseded)

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §16.1 Rollback WI | `packages/daemon-core/src/workflow-path-selector-v11.ts` (rollback_path) | Code | 7 rules |
| §16.2 Superseded | `packages/types/src/schema.ts` (WorkItemJsonSchema) | Types | `superseded_by` field |

**Old Rules Replaced**:
- v1.0: Could modify closed WI → v1.1: Must create new rollback WI
- v1.0: No version rollback constraint → v1.1: project_spec_version can only increment

---

### §17–§19: MVP, Deferred, Prohibitions

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §17.1 Hard Checks | `packages/daemon-core/src/gate-runner-v11.ts` | Enforcement | 14 hard checks in gates |
| §17.2 Weak-Allowed | `packages/daemon-core/src/gate-runner-v11.ts` | Enforcement | 5 gates can be minimal |
| §18 Deferred | (none — not implemented) | N/A | 25+ items deferred |
| §19.1 Directory Prohibitions | `packages/daemon-core/src/path-policy.ts` | Enforcement | 5 directory patterns |
| §19.2 Write Prohibitions | `packages/daemon-core/src/write-guard-v11.ts` | Enforcement | 9 write rules |
| §19.3 Process Prohibitions | `packages/daemon-core/src/gate-runner-v11.ts`, `packages/daemon-core/src/state-machine-v11.ts` | Enforcement | 8 process rules |

---

### §20–§23: Playbook, E2E, Main Chain, Usage

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| §20 Playbook Constraints | `docs/standards/implementation_plan.md` | Doc | Round structure and gates |
| §21 E2E Scenarios | `tests/e2e/` | Tests | 5 required scenarios |
| §22 Main Chain | `packages/daemon-core/src/gate-runner-v11.ts` (gate chains) | Code | Full pipeline implementation |
| §23 Standard Usage | `AGENT_CONSTITUTION.md`, agent docs | Doc | Usage instructions per audience |

---

### Patch1: extension_registry.json & Extension Subflow

| Sub-section | Implementation File | Type | Notes |
|-------------|-------------------|------|-------|
| P1§1 Registry Positioning | `packages/types/src/directory-layout.ts` | Types | `.specforge/project/extension_registry.json` |
| P1§2 Directory Requirement | `packages/types/src/directory-layout.ts` | Types | Added to projectFiles |
| P1§3 spec_manifest Registration | `packages/types/src/schema.ts` (SpecManifestSchema) | Types | `extension_registry` field |
| P1§4 Registry Structure | `packages/types/src/schema.ts` (ExtensionRegistrySchema) | Types | 5 namespaces |
| P1§5 Usage Rules | `packages/daemon-core/src/extension-subflow-v11.ts` | Enforcement | Type check before generation |
| P1§6 Trigger Conditions | `packages/daemon-core/src/extension-subflow-v11.ts` | Code | 8 trigger conditions |
| P1§7 extension_request.json | `packages/types/src/schema.ts` (ExtensionRequestSchema) | Types | Request structure |
| P1§8 Initiation Authority | `~/.config/opencode/agents/sf-orchestrator.md` | Agent doc | Only sf-orchestrator dispatches |
| P1§9 sf-extension Agent | `~/.config/opencode/agents/sf-extension.md` | Agent doc | **New agent** |
| P1§10 extension_delta.md | `packages/types/src/schema.ts` | Types | 8-section delta format |
| P1§11 Extension Candidate | `packages/daemon-core/src/extension-subflow-v11.ts` | Code | Candidate generation |
| P1§12 Extension Gate | `packages/daemon-core/src/gate-runner-v11.ts` (extension_gate) | Enforcement | 11-item hard gate |
| P1§13 Extension User Decision | `packages/daemon-core/src/user-decision-recorder-v11.ts` | Code | Standard User Decision flow |
| P1§14 Extension Merge | `packages/daemon-core/src/merge-runner-v11.ts` | Code | Standard Merge flow |
| P1§15 Main Flow Recovery | `packages/daemon-core/src/extension-subflow-v11.ts` | Code | 5-item recovery checklist |
| P1§16 State Machine | `packages/daemon-core/src/state-machine-v11.ts` | Code | blocked + extension_required |
| P1§17 Write Guard | `packages/daemon-core/src/write-guard-v11.ts` | Enforcement | 4 extension-specific rules |
| P1§18 close_gate | `packages/daemon-core/src/gate-runner-v11.ts` | Enforcement | 5 extension checks |
| P1§19 E2E Scenario | `tests/e2e/extension-subflow.test.ts` | Test | Full extension subflow test |
| P1§20 Prohibitions | `packages/daemon-core/src/write-guard-v11.ts` | Enforcement | 8 extension prohibitions |

---

## 2. Old Rules: Deleted or Replaced

| Old Rule (v1.0) | Replaced By (v1.1) | Status |
|-----------------|---------------------|--------|
| `.specforge/specs/<WI-ID>/` as truth source | `.specforge/project/` + `.specforge/work-items/<WI-ID>/` | **Replaced** — old path read-only |
| `state.json` flat state | Per-WI `work_item.json` + project `spec_manifest.json` | **Replaced** — split state model |
| Agent self-policing | Runtime-enforced Write Guard, Gate Runner, State Machine | **Replaced** — trust replaced with enforcement |
| Chat approval for merge | `user_decision.json` by User Decision Recorder | **Replaced** — structured file only |
| `needs_revision` user decision status | `request_changes` | **Deleted** — mapped to `request_changes` |
| `deferred` user decision status | `pending` or `expired` | **Deleted** — context-dependent mapping |
| Direct spec file writes by agents | Candidate + Gate + User Decision + Merge Runner pipeline | **Replaced** — multi-step controlled flow |
| No candidate model | Full Candidate + Manifest model | **New** — no v1.0 equivalent |
| No extension registry | `extension_registry.json` + Extension Subflow | **New** — Patch1 addition |
| No close_gate | `close_gate` with 17-item checklist | **New** — no v1.0 equivalent |
| No changed_files_audit | Mandatory `changed_files_audit` | **New** — no v1.0 equivalent |
| `~/.specforge/` for new data | `~/.config/opencode/` for extension layer | **Replaced** — old path legacy-only |
| ID regex scattered across tools | Centralized `tools/lib/id-rules.ts` | **Consolidated** |

---

## 3. Actor Role Mapping

| Actor | Standard Ref | Can Transition States | Can Write | Cannot Write |
|-------|-------------|----------------------|-----------|-------------|
| **sf-orchestrator** | §5.3, §14.1 | All states (within allowed transitions) | WI files (within WI), runtime state | `.specforge/project/**` (directly) |
| **Gate Runner** | §5.3, §9.1 | gates_running → gates_failed/approval_required | `gates/**`, `gate_summary.md` | Candidates, user_decision, merge_report, project specs |
| **User Decision Recorder** | §5.3, §10.5 | approval_required → approved/rejected/request_changes | `user_decision.json` | Candidates, gates, merge_report, project specs |
| **Merge Runner** | §5.3, §11.1 | merge_ready → merging → merged | `.specforge/project/**`, `merge_report.md` | Everything else |
| **code_permission_service** | §5.3, §12.2 | → implementation_ready | `work_item.json` (code_change_allowed field) | Project specs, gates, user_decision |
| **Write Guard** | §12.5 | N/A (intercepts, doesn't transition) | Guard logs, violation records | N/A (non-writing actor) |
| **sf-extension** | Patch1 §9 | N/A (no state transitions) | `extension_request.json`, `extension_delta.md`, extension candidate | `.specforge/project/**`, user_decision, gates, merge_report |
| **Normal Agent** (sf-requirements, sf-design, etc.) | §14.2 | **None** — cannot transition | Deltas, tasks, trace_delta, candidate content, verification_report, evidence, handoff | Project specs, user_decision, gates, gate_summary, merge_report, state transitions |

---

## 4. State Machine Transition Table

### Allowed Transitions

| From | To | Authorized Actor | Gate Required |
|------|----|-----------------|---------------|
| `created` | `intake_ready` | sf-orchestrator | entry_gate |
| `intake_ready` | `impact_analyzing` | sf-orchestrator | — |
| `impact_analyzing` | `impact_analyzed` | sf-orchestrator | — |
| `impact_analyzed` | `workflow_selected` | sf-orchestrator | workflow_selection_gate |
| `workflow_selected` | `candidate_preparing` | sf-orchestrator | — |
| `workflow_selected` | `implementation_ready` | code_permission_service (code_only_fast_path) | required_files_gate |
| `candidate_preparing` | `candidate_prepared` | sf-orchestrator | candidate_manifest_gate |
| `candidate_prepared` | `gates_running` | Gate Runner | — |
| `gates_running` | `gates_failed` | Gate Runner | — |
| `gates_running` | `approval_required` | Gate Runner | gate_summary_gate |
| `gates_failed` | `candidate_preparing` | sf-orchestrator | — (retry) |
| `approval_required` | `approved` | User Decision Recorder | — |
| `approval_required` | `rejected` | User Decision Recorder | — |
| `approval_required` | `candidate_preparing` | sf-orchestrator | — (request_changes) |
| `approved` | `merge_ready` | sf-orchestrator | merge_ready_gate |
| `merge_ready` | `merging` | Merge Runner | — |
| `merging` | `merged` | Merge Runner | post_merge_gate |
| `merged` | `implementation_ready` | code_permission_service | — |
| `merged` | `post_merge_verified` | Gate Runner | post_merge_gate |
| `implementation_ready` | `implementation_running` | sf-orchestrator | — |
| `implementation_running` | `implementation_done` | sf-orchestrator | — |
| `implementation_done` | `verification_running` | sf-orchestrator | — |
| `verification_running` | `verification_done` | sf-orchestrator | verification_gate |
| `verification_done` | `closed` | sf-orchestrator | close_gate |
| Any non-terminal | `blocked` | sf-orchestrator | — |
| `blocked` | (previous state) | sf-orchestrator | resume_check |
| Any | `superseded` | sf-orchestrator | — (new WI created) |

### Forbidden Transitions (§5.2)

| From | To | Reason |
|------|----|--------|
| `created` | `implementation_running` | Skip intake/classification/impact |
| `intake_ready` | `implementation_running` | Skip impact analysis |
| `impact_analyzing` | `implementation_running` | Skip impact completion |
| `impact_analyzed` | `implementation_running` | Skip workflow selection |
| `workflow_selected` | `implementation_running` | Skip candidate/gate/merge (unless code_only) |
| `candidate_prepared` | `merging` | Skip Gate + User Decision |
| `approval_required` | `merging` | Skip User Decision |
| `approval_required` | `closed` | Must resolve (approve/reject/request_changes) |
| `merged` | `closed` | Must verify, audit, revoke permissions |
| `closed` | any | Closed WI is immutable |
| `blocked` | `closed` | Must resolve block first |
| `rejected` | `closed` | Must resolve rejection first |

---

## 5. Gate Check Matrix

| Gate ID | Type | Standard Ref | Input Files | Key Checks | Run By |
|---------|------|-------------|-------------|------------|--------|
| `entry_gate` | hard | §9.2 | work_item.json | WI exists, schema valid, status=created | Gate Runner |
| `workflow_selection_gate` | hard | §9.2 | trigger_result.json | workflow_path set, valid enum value, classification complete | Gate Runner |
| `required_files_gate` | hard | §9.2, §4.3 | WI directory | All 12 closure files exist or not_applicable | Gate Runner |
| `candidate_manifest_gate` | hard | §9.2, §8.3 | candidate_manifest.json | Schema valid, entries match files, hashes match, paths within WI | Gate Runner |
| `path_policy_gate` | hard | §9.2, §1.6 | All paths in manifest | POSIX, no `..`, no `~`, no `\`, relative only | Gate Runner |
| `schema_gate` | hard | §9.2 | All JSON files | Each JSON validates against its schema | Gate Runner |
| `spec_consistency_gate` | soft | §9.2, §17.2 | All spec files | Cross-reference consistency | Gate Runner |
| `trace_gate` | soft | §9.2, §17.2 | trace_delta.md | Trace links valid, REQ→AC→DD→TASK→FILE chain | Gate Runner |
| `workflow_specific_gate` | hard | §9.2 | Path-specific files | Depends on workflow_path | Gate Runner |
| `gate_summary_gate` | hard | §9.2, §9.5 | gate_summary.md, all gate reports | All required gates completed, summary generated, freeze triggers | Gate Runner |
| `merge_ready_gate` | hard | §11.2 | user_decision.json, candidate_manifest.json | 14-item checklist | Gate Runner |
| `post_merge_gate` | hard | §11.6 | merge_report.md, spec_manifest.json | 10-item checklist | Gate Runner |
| `verification_gate` | soft | §13.5 | verification_report.md, evidence_manifest.json | 6-item checklist | Gate Runner |
| `close_gate` | hard | §15.2 | All WI files | 17-item checklist | Gate Runner |
| `extension_gate` | hard | Patch1 §12 | extension_request.json, extension_delta.md, candidate | 11-item checklist | Gate Runner |

---

## 6. Path Policy Rule Table

| Rule ID | Standard Ref | Rule | Implementation | Example |
|---------|-------------|------|----------------|---------|
| PP-01 | §1.6.1 | Use project-root-relative paths | `validatePath()` rejects leading `/` | ✅ `.specforge/project/spec_manifest.json` |
| PP-02 | §1.6.2 | Use POSIX `/` separator | `validatePath()` rejects `\` | ❌ `.specforge\project\spec_manifest.json` |
| PP-03 | §1.6.3 | No absolute paths | `validatePath()` rejects `C:\`, `/home/` | ❌ `/home/user/.specforge/` |
| PP-04 | §1.6.4 | No `..` traversal | `validatePath()` rejects `..` | ❌ `../other-project/.specforge/` |
| PP-05 | §1.6.5 | No `~` expansion | `validatePath()` rejects `~` | ❌ `~/.specforge/` |
| PP-06 | §1.6.6 | No Windows backslash | `validatePath()` rejects `\` | ❌ `src\lib\module.ts` |
| PP-07 | §1.6.7 | Spec files need `.specforge/` prefix | `isSpecPath()` checks prefix | ✅ `.specforge/project/requirements_index.md` |
| PP-08 | §1.3 | MVP forbidden directories | `isMVPForbidden()` checks 6 patterns | ❌ `.specforge/standards/` |
| PP-09 | §1.4 | Governance files in docs/standards/ | `isStandardLocation()` validates | ✅ `docs/standards/fused_standard.md` |
| PP-10 | §1.7 | Legacy paths read-only | `isLegacyPath()` + write rejection | ⚠️ `.specforge/specs/WI-0001/` — read only |
| PP-11 | §1.7 | New WI must not write old paths | `canWrite()` rejects new writes to specs/ | ❌ Write to `.specforge/specs/WI-0099/` |
| PP-12 | §1.7 | No silent mixing of old/new specs | Migration audit in spec_migration_path | — |

---

## 7. Write Guard Rule Table

| Rule ID | Standard Ref | Condition | Action | Actor Scope |
|---------|-------------|-----------|--------|-------------|
| WG-01 | §12.6.1 | No active WI | **Block** all code writes | All actors |
| WG-02 | §12.6.2 | `code_change_allowed=false` | **Block** code write | All actors |
| WG-03 | §12.6.3 | File not in `allowed_write_files` | **Block** write | All actors except merge_runner (for specs) |
| WG-04 | §12.6.4 | Normal agent writing `.specforge/project/**` | **Block** write | Normal agents |
| WG-05 | §12.6.5 | Normal agent writing `user_decision.json` | **Block** write | Normal agents |
| WG-06 | §12.6.6 | Normal agent writing `gates/**` | **Block** write | Normal agents |
| WG-07 | §12.6.7 | Normal agent writing `gate_summary.md` | **Block** write | Normal agents |
| WG-08 | §12.6.8 | Normal agent writing `merge_report.md` | **Block** write | Normal agents |
| WG-09 | §12.6.9 | Freeze active + modify Candidate/Manifest/Gate Summary | **Block** write | All actors |
| WG-10 | §12.6.10 | WI is closed | **Block** all writes | All actors |
| WG-11 | Patch1 §17 | Normal agent writing `.specforge/project/extension_registry.json` | **Block** write | Normal agents |
| WG-12 | Patch1 §17 | Using unregistered extension type | **Block** spec generation | All agents |
| WG-13 | Patch1 §17 | Non-Merge-Runner writing extension_registry | **Block** write | All except merge_runner |

---

## 8. Legacy Compatibility Notes

### 8.1 Path Migration

| v1.0 Path | v1.1 Equivalent | Migration Strategy |
|-----------|-----------------|-------------------|
| `.specforge/specs/WI-0001/requirements.md` | `.specforge/project/modules/<MOD>/requirements.md` | Extract module, create structured project spec |
| `.specforge/specs/WI-0001/design.md` | `.specforge/project/modules/<MOD>/design.md` | Module-scoped design |
| `.specforge/specs/WI-0001/tasks.md` | `.specforge/work-items/WI-0001/tasks.md` | Move to work-items |
| `.specforge/runtime/state.json` | `.specforge/work-items/<WI>/work_item.json` + `.specforge/project/spec_manifest.json` | Split into per-WI + project manifest |
| `.specforge/config/` | `.specforge/config/` | **Preserved** — no change |

### 8.2 State Mapping

| v1.0 State | v1.1 State(s) | Notes |
|------------|---------------|-------|
| `intake` | `intake_ready` | Renamed for clarity |
| `design` | `candidate_preparing` (design_change_path) | Broader candidate model |
| `requirements` | `candidate_preparing` (requirement_change_path) | Broader candidate model |
| `development` | `implementation_running` | Renamed |
| `review` | `gates_running` / `approval_required` | Split into gate + user decision |
| `verification` | `verification_running` | Similar |
| `completed` | `closed` | Requires close_gate |

### 8.3 File Format Compatibility

| v1.0 Format | v1.1 Format | Breaking Change |
|-------------|-------------|-----------------|
| No schema_version | `schema_version: "1.0"` required | Yes — old files need migration |
| No hash fields | `manifest_hash`, `candidate_hash` required | Yes — must compute on migration |
| Free-form user decision | Structured `user_decision.json` with 13 fields | Yes — must re-generate |
| No extension_registry | `extension_registry.json` mandatory (can be empty) | Yes — must create empty registry |

---

## 9. Summary Statistics

| Category | Count |
|----------|-------|
| Standard sections (main) | 23 |
| Patch 1 sections | 20 |
| Total standard sections | 43 |
| Implementation modules | 16+ |
| TypeScript type files | 3 (directory-layout, schema, constants) |
| Core enforcement modules | 6 (path-policy, state-machine, gate-runner, write-guard, user-decision-recorder, merge-runner) |
| Workflow modules | 4 (change-classification, impact-analysis, workflow-path-selector, extension-subflow) |
| Utility modules | 1 (id-rules) |
| Agent definition files | 10+ |
| Skill files | 8+ |
| WI states | 23 |
| Forbidden transitions | 12 |
| Gate types | 15 |
| Write guard rules | 13 |
| Path policy rules | 12 |
| Close gate checklist items | 17 |
| Prohibitions (total) | 30+ |
| E2E test scenarios | 6 (5 main + 1 extension) |
| Deferred capabilities | 25+ |
