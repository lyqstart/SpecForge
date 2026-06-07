# SpecForge v1.1 Complete Implementation Plan

> Version: 1.1  
> Standard: `docs/standards/fused_standard.md`  
> Status: Executable Plan

---

## 1. Overview

The v1.1 standard defines a spec-driven workflow system with 23 main sections plus Patch 1 (extension_registry). This implementation plan covers every section, mapped to concrete modules, with phases, dependencies, and verification criteria.

### 1.1 Standard Sections Summary

| Section | Title | Core Concern |
|---------|-------|--------------|
| §0 | General Principles | Goals, supreme constraints, priority hierarchy |
| §1 | Directory Boundaries & Path Governance | Two-layer model, Path Service, Path Policy, legacy paths |
| §2 | Project-Level Spec Truth Source | `spec_manifest.json`, module structure, versioning |
| §3 | ID & Format Rules | MODULE_CODE, WI/REQ/AC/DD/TASK ID regex |
| §4 | Work Item Transaction Model | WI lifecycle, required files, directory layout |
| §5 | State Machine | 23 states, forbidden transitions, authorized actors |
| §6 | Request Entry, Classification & Path Selection | Unified entry, classification, impact analysis, trigger result |
| §7 | Workflow Path Standards | 7 paths with triggers, required outputs, gate sequences |
| §8 | Candidate, Delta & Manifest | Delta model, Candidate rules, manifest structure |
| §9 | Gate, Gate Report & Gate Summary | 14+ gate types, hard/soft gates, freeze rules |
| §10 | User Decision | 7 status values, binding data, write authority |
| §11 | Merge Runner & Version Update | merge_ready_gate, execution rules, post_merge_gate, versioning |
| §12 | code_permission, allowed_write_files & Write Guard | Permission release, file whitelist, write interception |
| §13 | Trace, Verification & Evidence | Trace types, verification_report, evidence_manifest |
| §14 | Agent Responsibility Boundaries | Controlled subjects vs. normal agents, handoff, escalation |
| §15 | close_gate & WI Closure | 17-item checklist, post-closure rules |
| §16 | Rollback & Superseded | Rollback WI rules, superseded marking |
| §17 | MVP Required Capabilities | 17 mandatory capabilities, hard checks, weak-allowed |
| §18 | Deferred Capabilities | 25+ post-MVP items |
| §19 | Prohibitions | Directory, write, and process prohibitions |
| §20 | Playbook Constraints | Round structure, round gates, recommended sequence |
| §21 | End-to-End Acceptance Scenarios | 5 required E2E tests |
| §22 | Final Closed-Loop Main Chain | Full pipeline from request to closed |
| §23 | Standard Usage | Instructions for agents, runtime, gates, playbooks |
| Patch1 | extension_registry.json & Extension Subflow | Registry structure, extension request, sf-extension agent, extension gate |

---

## 2. Phase 1: Types Foundation

**Goal**: Establish all shared type definitions, constants, schemas, and ID rules used by every other module.

### 2.1 `packages/types/src/directory-layout.ts`

**Standard Ref**: §1.1–§1.7, §2.1, §4.2

**What to implement**:
- `SPEC_DIR_NAME` constant = `.specforge`
- `projectFiles` map: `spec_manifest`, `extension_registry`, `requirements_index`, `design_index`, `architecture`, `glossary`, `decisions`, `trace_matrix`
- `workItemFiles` map: every file listed in §4.2 WI directory
- Path Service functions: `projectRoot()`, `projectSpecManifest()`, `projectRequirementsIndex()`, `projectDesignIndex()`, `projectArchitecture()`, `projectGlossary()`, `projectDecisions()`, `projectTraceMatrix()`, `projectModulesRoot()`, `moduleRoot()`, `moduleJson()`, `moduleRequirements()`, `moduleDesign()`, `moduleTrace()`, `workItemsRoot()`, `workItemRoot()`, `workItemJson()`, `workItemIntake()`, `workItemRuntimeLog()`
- MVP forbidden directories: `standards/`, `archive/`, `state/`, `gates/`, `reports/`, `snapshots/`
- OpenCode extension layer paths: `~/.config/opencode/agents/`, `tools/`, `plugins/`, `skills/`, `sf-user/`
- Legacy paths: `.specforge/specs/<WI-ID>/` with read-only flag

**Tests**:
- All path functions return POSIX-relative paths
- No absolute paths, no `..`, no `~`, no `\`
- MVP forbidden directories are rejected
- Legacy paths flagged as read-only

### 2.2 `packages/types/src/schema.ts`

**Standard Ref**: §2.3, §4.4, §8.3, §9.4, §10.2, Patch1 §4

**What to implement**:
- `SpecManifestSchema`: `schema_version`, `project_spec_version`, `project_name`, `project` (with `extension_registry`), `modules[]`, `last_merged_work_item`, `last_merged_at`
- `WorkItemJsonSchema`: `schema_version`, `work_item_id`, `status`, `workflow_path`, `code_change_allowed`, `allowed_write_files`, `created_at`, `updated_at`, `created_by`
- `CandidateManifestSchema`: `schema_version`, `work_item_id`, `workflow_path`, `base_spec_version`, `merge_required`, `entries[]`, `manifest_hash`
- `CandidateManifestEntry`: `candidate_path`, `target_path`, `operation`, `candidate_hash`, `target_base_hash`
- `GateReportSchema`: `schema_version`, `work_item_id`, `gate_id`, `gate_type`, `required`, `status`, `input_files`, `checks`, `blocking_issues`, `warnings`, `waiver_allowed`, `waiver_required`, `waiver_ids`, `started_at`, `finished_at`, `runner`
- `UserDecisionSchema`: all fields from §10.2
- `ExtensionRegistrySchema`: `schema_version`, `project_spec_version`, `namespaces`, `updated_by_work_item`, `updated_at`
- `ExtensionRequestSchema`: `schema_version`, `work_item_id`, `requested_by_agent`, `requested_namespace`, `requested_key`, `reason`, `blocking_current_flow`, `created_at`
- `TriggerResultSchema`: classification result with workflow_path and match type
- `EvidenceManifestSchema`: evidence entries with types, paths, hashes

**Tests**:
- Each schema validates its example JSON from the standard
- Extra fields rejected or handled per schema_version
- Required fields enforced

### 2.3 `packages/types/src/constants.ts`

**Standard Ref**: §3.1, §3.2, §5.1, §6.3, §6.4, §9.5, §10.3

**What to implement**:
- `MODULE_CODE_REGEX` = `/^[A-Z][A-Z0-9]{1,11}$/`
- `WI_ID_REGEX` = `/^WI-[0-9]{4}$/`
- `REQ_ID_REGEX` = `/^REQ-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/`
- `AC_ID_REGEX` = `/^AC-[A-Z][A-Z0-9]{1,11}-[0-9]{3}-[0-9]{2}$/`
- `DD_ID_REGEX` = `/^DD-[A-Z][A-Z0-9]{1,11}-[0-9]{3}$/`
- `TASK_ID_REGEX` = `/^TASK-WI-[0-9]{4}-[0-9]{3}$/`
- `WI_STATES` enum: all 23 states from §5.1
- `MATCH_TYPES`: `exact_match`, `partial_match`, `related_match`, `conflict_match`, `no_match`, `spec_gap_match`
- `WORKFLOW_PATHS`: 7 paths from §6.4
- `GATE_OVERALL_STATUS`: `passed`, `passed_with_waiver_required`, `failed`, `blocked`, `expired`, `invalidated`
- `USER_DECISION_STATUS`: `pending`, `approved`, `rejected`, `request_changes`, `waived`, `expired`, `invalidated`
- `GATE_TYPES`: all 14+ gates from §9.2 plus `extension_gate`
- `HARD_GATES` set: entry_gate, workflow_selection_gate, required_files_gate, candidate_manifest_gate, path_policy_gate, merge_ready_gate, post_merge_gate, close_gate, extension_gate
- `SOFT_GATES` set: spec_consistency_gate, trace_gate, verification_gate

**Tests**:
- All regex constants match valid IDs, reject invalid ones
- Enum completeness matches standard

### 2.4 `tools/lib/id-rules.ts`

**Standard Ref**: §3.1–§3.3

**What to implement**:
- `validateModuleCode(code: string): boolean`
- `validateWIId(id: string): boolean`
- `validateREQId(id: string): boolean`
- `validateACId(id: string): boolean`
- `validateDDId(id: string): boolean`
- `validateTASKId(id: string): boolean`
- `extractModuleFromREQ(id: string): string`
- `extractWIFromTASK(id: string): string`
- `generateWIId(existingCount: number): string`
- `generateREQId(module: string, existingCount: number): string`
- `generateACId(module: string, reqNum: number, existingCount: number): string`
- `generateDDId(module: string, existingCount: number): string`
- `generateTASKId(wiId: string, existingCount: number): string`

**Tests**:
- All validators accept valid, reject invalid
- All generators produce spec-compliant IDs
- Extraction functions work correctly

---

## 3. Phase 2: Core Modules

**Goal**: Implement the six core runtime control modules that enforce the standard's hard constraints.

### 3.1 `packages/daemon-core/src/path-policy.ts`

**Standard Ref**: §1.6, §1.7, §1.4

**What to implement**:
- `PathPolicy` class with methods:
  - `validatePath(path: string): PathValidationResult` — enforces §1.6 rules (POSIX, no `..`, no `~`, no `\`, relative only, `.specforge/` prefix for spec files)
  - `isSpecPath(path: string): boolean` — checks if path is under `.specforge/project/`
  - `isWorkItemPath(path: string): boolean` — checks if path is under `.specforge/work-items/`
  - `isRuntimePath(path: string): boolean` — checks if path is under `.specforge/runtime/`
  - `isLegacyPath(path: string): boolean` — checks `.specforge/specs/<WI-ID>/`
  - `isMVPForbidden(path: string): boolean` — checks against §1.3 forbidden directories
  - `isStandardLocation(path: string): boolean` — §1.4 governance files must be in `docs/standards/`
  - `canCreate(path: string, actor: ActorRole): boolean`
  - `canRead(path: string, actor: ActorRole): boolean`
  - `canWrite(path: string, actor: ActorRole): boolean`

**Actor Roles**: `sf-orchestrator`, `gate-runner`, `merge-runner`, `user-decision-recorder`, `code-permission-service`, `write-guard`, `normal-agent`, `sf-extension`

**Tests**:
- All §1.6 rules enforced
- Legacy paths flagged read-only
- MVP forbidden paths rejected
- Actor-specific write permissions correct
- Governance file paths validated

### 3.2 `packages/daemon-core/src/state-machine-v11.ts`

**Standard Ref**: §5.1–§5.4

**What to implement**:
- `StateMachine` class with:
  - `currentState: WI_STATE`
  - `transition(to: WI_STATE, actor: ActorRole): TransitionResult`
  - `getAllowedTransitions(): WI_STATE[]`
  - `getForbiddenTransitions(): WI_STATE[]` — all §5.2 entries
  - `isTransitionAllowed(from: WI_STATE, to: WI_STATE): boolean`
  - `getAuthorizedActors(): ActorRole[]` — §5.3
  - `checkResume(wiDir: string): ResumeCheckResult` — §5.4

**Forbidden Transitions** (must be explicitly blocked):
```
created → implementation_running
intake_ready → implementation_running
impact_analyzing → implementation_running
impact_analyzed → implementation_running
workflow_selected → implementation_running
candidate_prepared → merging
approval_required → merging
approval_required → closed
merged → closed
closed → any
blocked → closed
rejected → closed
```

**Tests**:
- All valid transitions allowed
- All §5.2 forbidden transitions blocked
- Only authorized actors can transition
- Resume check validates file existence and hash

### 3.3 `packages/daemon-core/src/gate-runner-v11.ts`

**Standard Ref**: §9.1–§9.6

**What to implement**:
- `GateRunner` class with:
  - `runGate(wiId: string, gateId: string, gateType: 'hard_gate' | 'soft_gate'): GateReport`
  - `runGateChain(wiId: string, workflowPath: string): GateReport[]`
  - `generateGateSummary(wiId: string): GateSummary`
  - `checkFreeze(wiId: string): FreezeStatus`
  - `validateGateReport(report: GateReport): boolean`

**Individual Gate Implementations**:

| Gate | Type | Key Checks |
|------|------|------------|
| `entry_gate` | hard | WI exists, work_item.json valid |
| `workflow_selection_gate` | hard | workflow_path set, trigger_result.json exists |
| `required_files_gate` | hard | All §4.3 files exist or not_applicable |
| `candidate_manifest_gate` | hard | Manifest valid, entries match candidates, hashes match |
| `path_policy_gate` | hard | All paths pass PathPolicy validation |
| `schema_gate` | hard | All JSON files validate against schemas |
| `spec_consistency_gate` | soft | Cross-reference consistency between specs |
| `trace_gate` | soft | Trace links valid and complete |
| `gate_summary_gate` | hard | All required gates completed, summary generated |
| `merge_ready_gate` | hard | All §11.2 checks (14 items) |
| `post_merge_gate` | hard | All §11.6 checks (10 items) |
| `verification_gate` | soft | All §13.5 checks (6 items) |
| `close_gate` | hard | All §15.2 checks (17 items) |
| `extension_gate` | hard | All Patch1 §12 checks (11 items) |

**Tests**:
- Each gate returns correct pass/fail for valid/invalid inputs
- Hard gates block on failure
- Soft gates allow waiver path
- Freeze enforcement works correctly
- Gate summary aggregates correctly

### 3.4 `packages/daemon-core/src/write-guard-v11.ts`

**Standard Ref**: §12.5–§12.7

**What to implement**:
- `WriteGuard` class with:
  - `checkWrite(path: string, actor: ActorRole, wiId: string | null): WriteCheckResult`
  - `interceptEdit(path: string, content: string, wiId: string): InterceptResult`
  - `interceptBashCommand(command: string, wiId: string | null): InterceptResult`
  - `auditChangedFiles(wiId: string): ChangedFilesAuditResult`
  - `recordViolation(wiId: string, path: string, actor: ActorRole): void`
  - `getViolations(wiId: string): Violation[]`
  - `hasUnresolvedViolations(wiId: string): boolean`

**10 Interception Rules** (§12.6):
1. No active WI → block code write
2. `code_change_allowed=false` → block code write
3. File not in `allowed_write_files` → block
4. Normal agent writing `.specforge/project/**` → block
5. Normal agent writing `user_decision.json` → block
6. Normal agent writing `gates/**` → block
7. Normal agent writing `gate_summary.md` → block
8. Normal agent writing `merge_report.md` → block
9. Freeze active: modify Candidate/Manifest/Gate Summary → block
10. Closed WI: any write → block

**changed_files_audit** (§12.7):
1. Actual changed file list
2. All within `allowed_write_files`
3. Indirect write side effects
4. Formatter/generator/package manager writes
5. No writes to spec area
6. No `escaped_write_incident`

**Tests**:
- All 10 interception rules produce correct block/allow
- Audit detects escaped writes
- Violations recorded correctly
- Bash command interception works for common write patterns

### 3.5 `packages/daemon-core/src/user-decision-recorder-v11.ts`

**Standard Ref**: §10.1–§10.5

**What to implement**:
- `UserDecisionRecorder` class with:
  - `createDecision(wiId: string, gateSummaryPath: string, manifestHash: string): UserDecision`
  - `recordApproval(wiId: string, decidedBy: string): UserDecision`
  - `recordRejection(wiId: string, reason: string): UserDecision`
  - `recordRequestChanges(wiId: string, feedback: string): UserDecision`
  - `recordWaiver(wiId: string, gateId: string, reason: string, risk: string, followUpWI: string): UserDecision`
  - `checkExpiry(wiId: string): UserDecision`
  - `invalidateDecision(wiId: string, reason: string): UserDecision`
  - `validateDecision(wiId: string): DecisionValidation`

**Legacy Status Mapping** (§10.3):
- `needs_revision` → `request_changes`
- `deferred` → `pending` or `expired`

**Tests**:
- All 7 status values handled
- Legacy status mapping works
- Expiry detection works
- Invalidation cascades correctly
- Only UserDecisionRecorder can write

### 3.6 `packages/daemon-core/src/merge-runner-v11.ts`

**Standard Ref**: §11.1–§11.6

**What to implement**:
- `MergeRunner` class with:
  - `executeMerge(wiId: string): MergeResult`
  - `validateMergeReadiness(wiId: string): MergeReadinessCheck` — all §11.2 checks
  - `performMerge(wiId: string): MergeExecution`
  - `incrementSpecVersion(wiId: string): void`
  - `updateSpecManifest(wiId: string): void`
  - `generateMergeReport(wiId: string): MergeReport`
  - `validatePostMerge(wiId: string): PostMergeCheck` — all §11.6 checks

**6 Execution Rules** (§11.3):
1. Only merge per candidate_manifest.json
2. No scanning candidates/** autonomously
3. No auto-ignoring hash mismatch
4. No auto-extending User Decision
5. No "try merge" on version conflict
6. No merging files outside manifest

**Tests**:
- Merge only processes manifest entries
- Version increment is atomic
- Hash verification post-merge
- Not_applicable path produces correct report
- All post_merge_gate checks pass for valid merge

---

## 4. Phase 3: Workflow Engine

**Goal**: Implement workflow path selection, change classification, impact analysis, and the extension subflow.

### 4.1 `packages/daemon-core/src/change-classification.ts`

**Standard Ref**: §6.2

**What to implement**:
- `ChangeClassifier` class with:
  - `classify(intakeMd: string, existingSpecs: ProjectSpecs): ClassificationResult`
  - Output: `change_classification.md` with recommendation for `workflow_path`

**Classification dimensions**:
- `requirement_changed`: boolean
- `design_changed`: boolean
- `architecture_changed`: boolean
- `task_changed`: boolean
- `code_only`: boolean
- `unknowns`: string[]

**Tests**:
- Correct classification for all 7 workflow paths
- Unknown field handling triggers upgrade

### 4.2 `packages/daemon-core/src/impact-analysis.ts`

**Standard Ref**: §6.2, §6.3

**What to implement**:
- `ImpactAnalyzer` class with:
  - `analyze(classification: ClassificationResult, projectSpecs: ProjectSpecs): ImpactAnalysisResult`
  - Match against existing specs (6 match types from §6.3)
  - Output: `impact_analysis.md` with `## Existing Spec Match` section
  - Output: `trigger_result.json` (machine-readable)

**Match Types**: `exact_match`, `partial_match`, `related_match`, `conflict_match`, `no_match`, `spec_gap_match`

**Tests**:
- All 6 match types produced correctly
- Impact analysis references intake
- trigger_result.json valid

### 4.3 `packages/daemon-core/src/workflow-path-selector-v11.ts`

**Standard Ref**: §6.4–§6.7, §7.1–§7.7

**What to implement**:
- `WorkflowPathSelector` class with:
  - `selectPath(classification: ClassificationResult, impact: ImpactAnalysisResult): WorkflowPath`
  - Path priority enforcement (§6.5)
  - Unknown upgrade rules (§6.6)
  - Code-only strict checks (§6.7)

**Path Requirements Table**:

| Path | Required Deltas | Required Gates | Merge Required |
|------|-----------------|----------------|----------------|
| `requirement_change_path` | requirements_delta, trace_delta | requirements_gate, trace_gate, gate_summary_gate, merge_ready_gate, post_merge_gate, close_gate | Yes |
| `design_change_path` | design_delta, trace_delta | design_gate, trace_gate, gate_summary_gate, merge_ready_gate, post_merge_gate, close_gate | Yes |
| `architecture_change_path` | architecture_delta, trace_delta | architecture_gate, trace_gate, gate_summary_gate, merge_ready_gate, post_merge_gate, close_gate | Yes |
| `task_change_path` | trace_delta | gate_summary_gate, close_gate | No (not_applicable) |
| `code_only_fast_path` | trace_delta | gate_summary_gate, close_gate | No (not_applicable) |
| `spec_migration_path` | migration_delta, trace_delta | migration_gate, trace_gate, gate_summary_gate, merge_ready_gate, post_merge_gate, close_gate | Yes |
| `rollback_path` | rollback_delta, trace_delta | rollback_gate, trace_gate, gate_summary_gate, merge_ready_gate, post_merge_gate, close_gate | Yes |

**Tests**:
- Correct path selection for all trigger conditions
- Unknown upgrade works
- Code-only strict checks enforced
- Path priority ordering correct

### 4.4 `packages/daemon-core/src/extension-subflow-v11.ts`

**Standard Ref**: Patch1 §1–§20

**What to implement**:
- `ExtensionSubflow` class with:
  - `handleExtensionRequest(wiId: string, request: ExtensionRequest): ExtensionSubflowResult`
  - `validateExtensionGate(wiId: string): GateReport`
  - `restoreMainFlow(wiId: string): RestoreResult`
- `ExtensionRegistryManager` class with:
  - `loadRegistry(projectRoot: string): ExtensionRegistry`
  - `validateType(namespace: string, key: string): boolean`
  - `checkTypeExists(namespace: string, key: string): boolean`

**Extension Gate Checks** (Patch1 §12):
1. extension_request.json exists
2. extension_delta.md exists
3. extension_registry candidate exists
4. candidate_manifest entry valid
5. target_path points to `.specforge/project/extension_registry.json`
6. New namespace valid
7. New key not duplicate
8. New key naming valid
9. Reason non-empty
10. Compatibility statement exists
11. No unrelated registry modifications

**Tests**:
- Extension request detection and blocking
- sf-extension agent invocation simulation
- Extension gate all 11 checks
- Main flow restoration with registry reload
- Candidate invalidation when registry changes

---

## 5. Phase 4: Agent & Skill Documentation

**Goal**: Update all agent definitions and skills to reflect v1.1 boundaries.

### 5.1 Agent Definitions

Each agent file at `~/.config/opencode/agents/` must be updated:

| Agent | File | Key v1.1 Changes |
|-------|------|-------------------|
| sf-orchestrator | `sf-orchestrator.md` | Add WI creation flow, classification dispatch, Extension Subflow trigger, state machine authority |
| sf-requirements | `sf-requirements.md` | Add Candidate generation rules, Delta format, forbidden writes |
| sf-design | `sf-design.md` | Add extension_request.json trigger, Candidate generation, extension type check |
| sf-task-planner | `sf-task-planner.md` | Add task contract format, allowed_write_files generation |
| sf-executor | `sf-executor.md` | Add Write Guard compliance, verification_commands enforcement |
| sf-debugger | `sf-debugger.md` | Add escalation signal format, boundary statement |
| sf-reviewer | `sf-reviewer.md` | Add Gate alignment, trace verification |
| sf-verifier | `sf-verifier.md` | Add evidence_manifest generation, close_gate prerequisites |
| sf-evidence-collector | `sf-evidence-collector.md` | Add evidence type registration in extension_registry |
| sf-extension | `sf-extension.md` | **New** — Extension design agent per Patch1 §9 |

### 5.2 AGENT_CONSTITUTION.md Updates

Must include:
- §0.2 Supreme Constraint: All agents bound by this standard
- §14.2 Normal Agent prohibitions: 9 items
- §14.3 Handoff format: 7 required fields
- §14.4 Unknown/escalation rules

### 5.3 Skill Files Updates

Each skill must add v1.1 checkpoint references:

| Skill | Key Additions |
|-------|---------------|
| `sf-workflow-feature-spec` | State machine alignment, candidate flow |
| `sf-workflow-bugfix-spec` | WI transaction model, verification gate |
| `sf-workflow-design-first` | Design candidate, extension check |
| `sf-workflow-change-request` | Change classification, impact analysis |
| `sf-workflow-quick-change` | code_only_fast_path strict checks |
| `sf-workflow-refactor` | architecture_change_path trigger |
| `sf-workflow-ops-task` | task_change_path, close_gate |
| `sf-workflow-investigation` | Evidence manifest, trace delta |

---

## 6. Phase 5: Verification

**Goal**: Prove all v1.1 requirements are correctly implemented.

### 6.1 Unit Tests (Per Module)

Each module from Phases 1–3 must have:
- Positive test cases (valid inputs pass)
- Negative test cases (invalid inputs blocked)
- Edge cases (empty inputs, boundary values, concurrent access)
- Schema validation tests

**Target**: ≥90% code coverage on core modules.

### 6.2 Integration Tests

**Test Matrix**:

| Test | Paths Covered | Gates Covered | Actors Covered |
|------|---------------|---------------|----------------|
| Full requirement_change_path | §7.1 | All 8 gates | All 6 controlled subjects |
| Full design_change_path | §7.2 | 7 gates | 4 actors |
| Full code_only_fast_path | §7.5 | 3 gates | 3 actors |
| Write Guard interception | §12.6 | — | All 10 rules |
| User Decision lifecycle | §10 | — | Recorder + orchestrator |
| Merge Runner execution | §11 | merge_ready + post_merge | Merge Runner only |
| Extension Subflow | Patch1 | extension_gate | sf-extension + orchestrator |
| Rollback WI | §16 | All rollback gates | orchestrator |
| Resume after interruption | §5.4 | — | State machine |

### 6.3 End-to-End Acceptance Tests (§21)

All 5 scenarios from §21 must pass:

1. **§21.1 requirement_change_path**: "给订单增加'已归档'状态" — full closed loop
2. **§21.2 design_change_path**: "登录失败后增加指数退避策略" — with requirement escalation test
3. **§21.3 code_only_fast_path**: "把保存按钮颜色调深一点" — no spec change but full WI lifecycle
4. **§21.4 Escaped write**: Agent tries to modify outside `allowed_write_files` — Write Guard blocks
5. **§21.5 User Decision invalidation**: Candidate changes after approval — decision invalidated

Plus **Patch1 §19 scenario**: Missing design type `retry_policy` triggers full Extension Subflow

### 6.4 Prohibition Tests (§19)

Verify all prohibitions are enforced:
- §19.1: 5 directory prohibitions blocked by PathPolicy
- §19.2: 9 write prohibitions blocked by WriteGuard
- §19.3: 8 process prohibitions blocked by StateMachine/GateRunner
- Patch1 §20: 8 extension prohibitions

### 6.5 Acceptance Criteria

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| All 14+ gates pass for valid inputs | Gate test matrix | 100% |
| All 10 Write Guard rules block correctly | Write Guard tests | 100% |
| All 12 forbidden transitions blocked | State machine tests | 100% |
| All 5 E2E scenarios pass | E2E test suite | 100% |
| All 22 prohibitions enforced | Prohibition tests | 100% |
| Zero TypeScript errors | `tsc --noEmit` | 0 errors |
| Zero unimplemented hard checks | Code audit | 0 gaps |

---

## 7. Per-Module Implementation Details

### 7.1 Module Dependency Graph

```
constants.ts ← schema.ts ← directory-layout.ts
                                    ↓
                            id-rules.ts
                                    ↓
    path-policy.ts ← state-machine-v11.ts ← gate-runner-v11.ts
                            ↓                       ↓
    change-classification.ts    write-guard-v11.ts
                            ↓                       ↓
    impact-analysis.ts          user-decision-recorder-v11.ts
                            ↓                       ↓
    workflow-path-selector-v11.ts ← merge-runner-v11.ts
                            ↓
    extension-subflow-v11.ts
```

### 7.2 Error Handling Strategy

- All modules use structured error types: `ValidationError`, `TransitionError`, `GateError`, `WriteGuardError`, `MergeError`
- Errors include: `code`, `message`, `standard_ref` (section number), `wi_id`, `actor`
- No silent failures — every error is logged and surfaced to orchestrator

### 7.3 Configuration

- `project.json`: project-level config (project name, module list)
- `risk_policy.json`: gate hardness policy (which gates are hard/soft)
- `prod-environment.md`: runtime environment settings

---

## 8. Migration Strategy: v1.0 → v1.1

### 8.1 Structural Changes

| v1.0 Concept | v1.1 Equivalent | Migration Action |
|-------------|-----------------|------------------|
| `.specforge/specs/<WI-ID>/` | `.specforge/work-items/<WI-ID>/` + `.specforge/project/` | Migrate via `spec_migration_path` |
| `state.json` (flat) | `work_item.json` (per-WI) + `spec_manifest.json` (project) | Split and restructure |
| No Candidate model | Candidate + Manifest + Gate + User Decision + Merge | New files generated |
| Agent self-policing | Runtime-enforced (Write Guard, Gate Runner, State Machine) | Replace trust with enforcement |
| No extension registry | `extension_registry.json` + Extension Subflow | New capability |
| No close_gate | `close_gate` with 17-item checklist | New gate |
| No changed_files_audit | `changed_files_audit` mandatory | New capability |

### 8.2 Migration Steps

1. **Audit**: Scan existing `.specforge/` for v1.0 structures
2. **Backup**: Git commit all current state
3. **Create project specs**: Extract from `specs/` to `project/` structure
4. **Generate `spec_manifest.json`**: From migrated project specs
5. **Generate `extension_registry.json`**: Empty initial registry
6. **Mark legacy as read-only**: PathPolicy flags all old paths
7. **Update state files**: Convert v1.0 state format to v1.1 `work_item.json`
8. **Validate**: Run all gates against migrated state
9. **Freeze legacy**: No further writes to `.specforge/specs/`

### 8.3 Rollback Plan

If migration fails:
1. Revert to pre-migration Git commit
2. All v1.0 structures restored
3. No data loss — migration only copies, never deletes original until validated

---

## 9. Verification Checklist

Use this checklist during implementation to verify each standard section is addressed:

- [ ] §0: Priority hierarchy enforced in code comments and error messages
- [ ] §1.1–§1.2: OpenCode extension layer paths in directory-layout.ts
- [ ] §1.3: MVP directory restrictions in PathPolicy
- [ ] §1.4: Governance file location validated (docs/standards/, not .specforge/standards/)
- [ ] §1.5: All 19 Path Service functions implemented
- [ ] §1.6: All 7 path rules enforced
- [ ] §1.7: Legacy paths flagged read-only
- [ ] §2.1: Project spec directory structure defined
- [ ] §2.3: spec_manifest.json schema matches example
- [ ] §2.4: Version rules in MergeRunner
- [ ] §3.1–§3.3: All ID regexes centralized in id-rules.ts
- [ ] §4.1–§4.5: WI directory, required files, intake rules
- [ ] §5.1: All 23 states in enum
- [ ] §5.2: All 12 forbidden transitions blocked
- [ ] §5.3: Only authorized actors can transition
- [ ] §5.4: Resume check validates 7 conditions
- [ ] §6.1–§6.7: Full classification → impact → trigger → path pipeline
- [ ] §7.1–§7.7: All 7 workflow paths with correct gates and outputs
- [ ] §8.1–§8.4: Delta, Candidate, Manifest models
- [ ] §9.1–§9.6: 14+ gates, hard/soft classification, freeze rules
- [ ] §10.1–§10.5: User Decision with all 7 statuses
- [ ] §11.1–§11.6: Merge Runner with all execution rules and gates
- [ ] §12.1–§12.7: code_permission, allowed_write_files, Write Guard, audit
- [ ] §13.1–§13.5: Trace types, verification_report, evidence_manifest, verification_gate
- [ ] §14.1–§14.4: Agent boundaries, handoff format, escalation rules
- [ ] §15.1–§15.3: close_gate 17-item checklist, post-closure rules
- [ ] §16.1–§16.2: Rollback and superseded handling
- [ ] §17.1: All 14 hard checks implemented
- [ ] §17.2: All 5 weak-allowed gates present (can be minimal)
- [ ] §19.1–§19.3: All 22 prohibitions enforced
- [ ] Patch1 §1–§20: Full extension_registry + Extension Subflow

---

## 10. Recommended Implementation Order

Based on §20.4 Round sequence:

| Round | Focus | Modules | Est. Tests |
|-------|-------|---------|-----------|
| 0 | Standard file placement, baseline | directory-layout.ts, constants.ts, schema.ts | 30 |
| 1 | Directory model + State Machine | path-policy.ts, state-machine-v11.ts, id-rules.ts | 45 |
| 2 | Classification + Impact + Path | change-classification.ts, impact-analysis.ts, workflow-path-selector-v11.ts | 35 |
| 3 | Requirements Candidate + Manifest | Candidate generation, manifest validation | 25 |
| 4 | Design/Architecture + Trace | Design/architecture candidates, trace_delta | 20 |
| 5 | Tasks + Permission + Write Guard | write-guard-v11.ts, allowed-write-files | 40 |
| 6 | Gate + Summary + Decision + Evidence | gate-runner-v11.ts, user-decision-recorder-v11.ts | 50 |
| 7 | Merge Runner + Versioning | merge-runner-v11.ts | 30 |
| 8 | Legacy read-only + Migration | spec_migration_path handling | 15 |
| 9 | E2E + close_gate hardening | Integration tests, close_gate | 25 |

**Total estimated tests**: ~315

---

## 11. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent behavior changes resist runtime enforcement | High | Write Guard must intercept ALL write entry points, not rely on agent compliance |
| Schema migration breaks existing projects | High | Migration path with validation gate; rollback via Git |
| Performance overhead of Write Guard on every write | Medium | Cache allowed_write_files per WI; batch audit |
| Extension Subflow blocking main flow too long | Medium | Clear escalation timeout; user notification |
| State machine complexity leads to dead states | Medium | Exhaustive transition table tests; state visualization |

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **WI** | Work Item — a controlled change transaction |
| **Candidate** | Complete file proposed to be written to project spec truth source |
| **Delta** | Description of changes (not the final write object) |
| **Manifest** | Machine-readable control list of candidates to merge |
| **Gate** | Process checkpoint — hard (blocking) or soft (waiver-able) |
| **Gate Summary** | Aggregated gate results before User Decision |
| **User Decision** | Structured approval file written by User Decision Recorder |
| **Merge Runner** | Only authorized writer to `.specforge/project/**` |
| **Write Guard** | Program-level write interceptor |
| **code_permission** | Hard switch controlling whether code writes are allowed |
| **allowed_write_files** | Precise whitelist of files a WI can write |
| **close_gate** | Final gate before WI closure with 17-item checklist |
| **Path Service** | Centralized path generation (no free-form path concatenation) |
| **Path Policy** | Rules for which paths can be created/read/written by whom |
| **extension_registry** | Project-level registry of allowed extension types |
| **Extension Subflow** | Controlled process for adding new extension types |
| **sf-extension** | Specialized agent for extension design |
| **project_spec_version** | Monotonically increasing version of project spec truth source |
| **base_spec_version** | The spec version a Candidate was built against |
