# Implementation Plan: SpecForge V3.6 (Session Continuity + New Workflows)

## Overview

This implementation plan follows a dependency-driven phase ordering: state machine and KG types first (no external deps), then gate mode system, continuity engine, skill files + orchestrator, knowledge extraction, tests, and finally documentation. All code is TypeScript targeting the existing SpecForge tool/lib architecture.

## Tasks

- [ ] 1. State Machine Extensions + KG Type Extensions (Phase 1 — no external deps)
  - [ ] 1.1 Extend WorkflowType union and add 4 transition tables in `state_machine.ts`
    - Add `"change_request" | "refactor" | "ops_task" | "investigation"` to `WorkflowType` union
    - Add `CHANGE_REQUEST_TRANSITIONS`, `REFACTOR_TRANSITIONS`, `OPS_TASK_TRANSITIONS`, `INVESTIGATION_TRANSITIONS` as `ReadonlyMap<string, readonly string[]>` constants
    - Extend `getTransitionTable()` with 4 new case branches
    - Ensure existing 4 workflow transition tables are unchanged
    - File: `.opencode/tools/lib/state_machine.ts`
    - _Requirements: 2.2, 2.3, 3.2, 3.3, 4.2, 4.3, 5.2, 5.3, 8.1_

  - [ ] 1.2 Add workflow-specific guards in `sf_state_transition_core.ts`
    - Implement `checkWorkflowGuards(workflowType, from, to, workItem, transitionContext?)` function
    - Guard 1: refactor `development` state — enforce `risk_path` metadata (high→review, low→verification, missing→blocked)
    - Guard 2: investigation `findings_report_gate → completed` — require `transitionContext.user_accepted === true`
    - Integrate guards after standard `isValidTransition` check
    - Update `.opencode/tools/sf_state_transition.ts` input Zod schema to accept optional `transition_context` parameter (Record<string, unknown>)
    - Pass transition_context to core's checkWorkflowGuards function
    - Files: `.opencode/tools/lib/sf_state_transition_core.ts`, `.opencode/tools/sf_state_transition.ts`
    - _Requirements: 3.1, 3.2, 3.8, 5.1, 5.13, 6.3, 6.4_

  - [ ] 1.3 Extend KG NodeType/EdgeType unions in `sf_knowledge_graph_core.ts`
    - Add `"refactor_target"` and `"ops_action"` to `NodeType` union
    - Add `"affects"` to `EdgeType` union
    - Extend `VALID_NODE_TYPES` and `VALID_EDGE_TYPES` arrays
    - Add `RefactorTargetMetadata` and `OpsActionMetadata` interfaces
    - Ensure existing types and validation functions remain unchanged
    - File: `.opencode/tools/lib/sf_knowledge_graph_core.ts`
    - _Requirements: 9.7, 9.8_

  - [ ] 1.4 Write property tests for state machine transitions (Property 1, 12, 13)
    - **Property 1: State machine transition validity** — for all 8 workflow types, `isValidTransition` returns true iff (from, to) is in the transition table
    - **Property 12: Refactor risk_path guard** — development transitions enforced by risk_path metadata
    - **Property 13: Investigation user_accepted guard** — findings_report_gate→completed requires user_accepted=true
    - File: `tests/property/state_machine.property.test.ts`
    - **Validates: Requirements 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.3, 6.4, 8.1, 8.4, 3.8, 5.13**

  - [ ] 1.5 Write property test for KG type extensibility (Property 11)
    - **Property 11: KG type extensibility** — new NodeType/EdgeType values pass validation, existing types unchanged, existing graph.json queries don't fail
    - File: `tests/property/kg_types.property.test.ts`
    - **Validates: Requirements 9.7, 9.8**

- [ ] 2. Checkpoint — Run `bun test` and verify: all tests pass, no regression from existing 1028 tests, report new test count and total pass count

- [ ] 3. Gate Mode System (Phase 2 — depends on state machine for workflow types)
  - [ ] 3.1 Implement GateModeSpec strategy table and mode dispatch in `sf_requirements_gate_core.ts`
    - Define `GateModeSpec` interface and `RequirementsGateMode` type
    - Add `REQUIREMENTS_GATE_SPECS` strategy table with 3 modes: `change_request`, `refactor`, `investigation`
    - Implement `checkImpactAnalysisContent`, `checkRefactorAnalysisContent`, `checkInvestigationPlanContent` checkFn functions
    - Extend `checkRequirementsGate` signature with `options?: { mode?: RequirementsGateMode }`
    - When no mode passed: delegate to existing logic (backward compatible)
    - When mode passed: lookup spec table → read targetFile → parse sections → call checkFn
    - Unknown mode: return fail with warning
    - Local verification: run existing Gate test fixtures without mode parameter, confirm output unchanged
    - File: `.opencode/tools/lib/sf_requirements_gate_core.ts`
    - _Requirements: 11.1, 11.5, 11.6, 2.6, 3.6, 5.6_

  - [ ] 3.2 Implement GateModeSpec strategy table and mode dispatch in `sf_design_gate_core.ts`
    - Define `DesignGateMode` type
    - Add `DESIGN_GATE_SPECS` strategy table with 4 modes: `change_request`, `ops_task`, `refactor`, `investigation`
    - Implement mode-specific checkFn functions for each mode
    - Extend `checkDesignGate` signature with `options?: { workflowType?: string; mode?: DesignGateMode }`
    - ops_task mode: validate rollback coverage, rollback trigger conditions, destructive command identification
    - investigation mode: validate conclusions have evidence, recommendations are actionable
    - Local verification: run existing Gate test fixtures without mode parameter, confirm output unchanged
    - File: `.opencode/tools/lib/sf_design_gate_core.ts`
    - _Requirements: 11.2, 11.5, 11.6, 2.8, 3.7, 3.8, 4.6, 5.9_

  - [ ] 3.3 Implement mode dispatch in `sf_verification_gate_core.ts`
    - Define `VerificationGateMode` type
    - Add `VERIFICATION_GATE_SPECS` strategy table with 3 modes: `refactor`, `ops_task`, `change_request`
    - refactor mode: check all existing tests pass + code quality improvement
    - ops_task mode: check operation results match ops_plan.md expected results
    - change_request mode: check regression test coverage of affected areas
    - Extend `checkVerificationGate` signature with `options?: { mode?: VerificationGateMode }`
    - Local verification: run existing Gate test fixtures without mode parameter, confirm output unchanged
    - File: `.opencode/tools/lib/sf_verification_gate_core.ts`
    - _Requirements: 11.4, 11.5, 11.6, 3.9, 4.8_

  - [ ] 3.4 Update Gate tool wrappers to pass mode parameter
    - Update `sf_requirements_gate.ts` to accept and forward `mode` option to core
    - Update `sf_design_gate.ts` to accept and forward `mode` option to core
    - Update `sf_verification_gate.ts` to accept and forward `mode` option to core
    - Ensure no changes to `sf_tasks_gate.ts` (no mode parameter needed)
    - Files: `.opencode/tools/sf_requirements_gate.ts`, `.opencode/tools/sf_design_gate.ts`, `.opencode/tools/sf_verification_gate.ts`
    - _Requirements: 11.3, 11.5, 8.3, 8.5_

  - [ ] 3.5 Write property test for Gate mode dispatch (Property 10)
    - **Property 10: Gate mode dispatch correctness** — for any (gate_type, mode, document_content), Gate returns pass iff all required sections present and pass conditions met; no mode = V3.5 behavior
    - File: `tests/property/gate_mode.property.test.ts`
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.5**

- [ ] 4. Checkpoint — Run `bun test` and verify: all tests pass, no regression from existing 1028 tests, report new test count and total pass count

- [ ] 5. Continuity Engine (Phase 3 — depends on state machine for WorkflowType)
  - [ ] 5.1 Create `sf_continuity_core.ts` with detection logic
    - Implement `detectContextExhaustion(runFailed, traceEntries, archiveResult, runId, sessionId)` function
    - Implement dual-condition detection: run must be failed AND trace entries must contain exhaustion patterns
    - Pattern matching only on `tool_call` entries' `error_message` field (not arbitrary text)
    - Cutoff: filter by run_id/session_id, then last 100 entries intersected with last 10 minutes
    - SECONDARY detection: check archive `exit_reason` field only
    - Define `ExhaustionDetectionResult`, `TraceEntry`, `ArchiveResult` types
    - File: `.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.1_

  - [ ] 5.2 Implement Context_Snapshot extraction in `sf_continuity_core.ts`
    - Implement `extractContextSnapshot(options)` function
    - Extract `completed_work` from tool_calls.jsonl write/edit calls + disk verification
    - Extract `verification_commands_passed` from bash calls with exit_code=0
    - Extract `key_decisions` with priority: work_log.md → agent_summary messages → empty array
    - Extract `pending_work` with priority: work_log.md → infer from stage expected_output
    - Conditional optional fields based on workflow_type (code workflows vs investigation vs ops_task)
    - Return null if both completed_work and artifacts are empty (extraction failed)
    - File: `.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.2, 1.3, 7.2_

  - [ ] 5.3 Implement key message filtering in `sf_continuity_core.ts`
    - Implement `filterKeyMessages(conversation, maxCount)` function
    - Priority types: user_instruction, agent_summary, tool_call_result, error_message, file_change_description
    - Skip types: file_read_repeat, intermediate_reasoning, formatted_output
    - Reverse iteration with prepend, cap at maxCount
    - File: `.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.4_

  - [ ] 5.4 Implement continuation prompt generation and archive merge in `sf_continuity_core.ts`
    - Implement `generateContinuationPrompt(originalTask, snapshot, continuationIndex)` function
    - Include: original task, all snapshot fields, continuation instruction text, formatted run_id
    - Implement `mergeArchives(originalArchive, continuationArchive)` function
    - Merge: files_changed union, duration_ms sum, tool_calls concatenation, continuation_chain array
    - Define `ContinuationMetadata`, `MergedArchive`, `AgentRunArchive` types
    - File: `.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.5, 1.7, 1.8_

  - [ ] 5.5 Create `.opencode/tools/sf_continuity.ts` — Tool wrapper that exposes sf_continuity_core functions to Orchestrator
    - Operations: detect_exhaustion, extract_snapshot, generate_prompt, merge_archives, check_continuation_limit
    - Zod schema for input validation
    - Returns structured results that Orchestrator can consume
    - File: `.opencode/tools/sf_continuity.ts`
    - _Requirements: 1.1, 1.2, 1.5, 1.8_

  - [ ] 5.6 Implement readContinuityConfig() and enforceContinuationLimit() in sf_continuity_core.ts
    - Read project.json continuity section, default max_continuations=1, clamp to max 2
    - enforceContinuationLimit: check root_run_id continuation count, return blocked if exceeded
    - File: `.opencode/tools/lib/sf_continuity_core.ts`
    - _Requirements: 1.6_

  - [ ] 5.7 Write property tests for Continuity Engine (Properties 2-8)
    - **Property 2: Context exhaustion detection (dual-condition)** — detected=true iff runFailed AND trace has exhaustion pattern in error_message
    - **Property 3: Context_Snapshot structure completeness** — all universal fields present, optional fields based on workflow_type
    - **Property 4: Key message filtering** — count ≤ N, only priority types included, no skip types
    - **Property 5: Continuation prompt structure** — contains original task, snapshot info, continuation instruction, correct run_id format
    - **Property 6: Continuation counter enforcement** — allows exactly max_continuations, blocks after
    - **Property 7: Continuation chain metadata** — root_run_id consistent, parent_run_id = predecessor, index increments from 1
    - **Property 8: Archive merge correctness** — files_changed = union, duration = sum, tool_calls = concat
    - File: `tests/property/continuity.property.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 7.2**

- [ ] 6. Checkpoint — Run `bun test` and verify: all tests pass, no regression from existing 1028 tests, report new test count and total pass count

- [ ] 7. Skill Files + Orchestrator Prompt (Phase 4 — depends on all above)
  - [ ] 7.1 Create `sf-workflow-change-request` Skill file
    - YAML frontmatter (name, description, autoload: false)
    - State machine diagram (intake → ... → completed)
    - Skill binding matrix (stage → Agent → Skill → artifact)
    - Stage execution protocols for each stage
    - Include artifact template sections (required sections that Gate mode will check) in the Skill's stage execution protocol
    - Gate mode specifications (impact_analysis_gate uses sf_requirements_gate mode="change_request", etc.)
    - KG sync points and scopes
    - Parallel task execution support (V3.3 protocol)
    - File: `.opencode/skills/sf-workflow-change-request/SKILL.md`
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11_

  - [ ] 7.2 Create `sf-workflow-refactor` Skill file
    - YAML frontmatter (name, description, autoload: false)
    - State machine diagram with dual-path (low-risk vs high-risk)
    - Skill binding matrix
    - Stage execution protocols
    - Include artifact template sections (required sections that Gate mode will check) in the Skill's stage execution protocol
    - Risk path determination logic (refactor_plan_gate decides path)
    - Verification: behavior invariance + code quality improvement
    - File: `.opencode/skills/sf-workflow-refactor/SKILL.md`
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

  - [ ] 7.3 Create `sf-workflow-ops-task` Skill file
    - YAML frontmatter (name, description, autoload: false)
    - State machine diagram
    - Skill binding matrix
    - Stage execution protocols
    - Include artifact template sections (required sections that Gate mode will check) in the Skill's stage execution protocol
    - ops_plan safety requirements (rollback plan, trigger conditions, destructive command identification, backup declaration)
    - Execution safety protocol (fail-stop on mismatch, rollback trigger check)
    - Execution protocol must specify: sf-executor MUST stop before steps marked `requires_user_confirmation` and request user confirmation via Orchestrator before proceeding
    - Serial execution default, parallel only when ops_plan.md marks `parallel: true`
    - File: `.opencode/skills/sf-workflow-ops-task/SKILL.md`
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12_

  - [ ] 7.4 Create `sf-workflow-investigation` Skill file
    - YAML frontmatter (name, description, autoload: false)
    - State machine diagram
    - Skill binding matrix
    - Stage execution protocols
    - Include artifact template sections (required sections that Gate mode will check) in the Skill's stage execution protocol
    - findings_report_gate user acceptance flow (pass + accept → completed, user requests more → research)
    - No development/review/verification stages
    - No KG sync (no structured traceability chain)
    - Knowledge extraction with candidate status
    - File: `.opencode/skills/sf-workflow-investigation/SKILL.md`
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13_

  - [ ] 7.5 Update Orchestrator: intent classification + priority + disambiguation
    - Add 4 new intent classification rules with keyword lists
    - Add 6-level priority ordering
    - Add low-confidence disambiguation UX template (present 2-3 candidates)
    - File: `.opencode/agents/sf-orchestrator.md`
    - _Requirements: 6.1, 6.6, 6.7_

  - [ ] 7.6 Update Orchestrator: Skill routing + session recovery
    - Add 4 new Skill routing table entries
    - Add session recovery support for 4 new workflow types
    - File: `.opencode/agents/sf-orchestrator.md`
    - _Requirements: 6.2, 6.5_

  - [ ] 7.7 Update Orchestrator: Continuity detection + snapshot + dispatch
    - Add Cross-Session Continuity protocol: detect exhaustion via sf_continuity tool → extract snapshot → generate continuation prompt → dispatch new sub-agent
    - Include continuity.extraction_failed handling: when extraction returns null, transition to blocked and append continuity.extraction_failed event to events.jsonl
    - Include continuation metadata writing: after continuation run completes, write continuation_parent_run_id, continuation_root_run_id, continuation_index to Agent_Run_Archive result.json
    - File: `.opencode/agents/sf-orchestrator.md`
    - _Requirements: 1.1, 1.2, 1.5, 1.9, 1.10, 7.1_

  - [ ] 7.8 Update Orchestrator: max_continuations + blocked + archive merge
    - Add max_continuations enforcement (check via sf_continuity tool before each continuation)
    - Add blocked fallback when limit reached (report continuation chain history to user)
    - Add archive merge protocol after successful continuation (call sf_continuity merge_archives)
    - File: `.opencode/agents/sf-orchestrator.md`
    - _Requirements: 1.6, 1.7, 1.8_

  - [ ] 7.9 Write property test for intent classification priority (Property 9)
    - **Property 9: Intent classification priority correctness** — for inputs matching multiple workflows, returns highest-priority intent or ambiguous when scores are close
    - File: `tests/property/intent_routing.property.test.ts`
    - **Validates: Requirements 6.1, 6.6**

- [ ] 8. Checkpoint — Run `bun test` and verify: all tests pass, no regression from existing 1028 tests, report new test count and total pass count

- [ ] 9. Knowledge Extraction Extension (Phase 5)
  - [ ] 9.1 Extend `sf_knowledge_base_core.ts` with workflow_type and confidence fields
    - Add `workflow_type?: WorkflowType` field to `KnowledgeEntry` interface
    - Add `confidence?: "high" | "medium" | "low"` field to `KnowledgeEntry` interface
    - Update knowledge entry creation logic: investigation → status="candidate", confidence="medium"; others → status="active", confidence="high"
    - Ensure existing entries without these fields continue to work (backward compatible)
    - File: `.opencode/tools/lib/sf_knowledge_base_core.ts`
    - _Requirements: 10.7, 10.8_

  - [ ] 9.2 Ensure knowledge extraction trigger via Skill protocol
    - Instead of adding trigger logic to sf_state_transition_core.ts, ensure all 4 new Workflow Skill files (7.1-7.4) include "completed 后触发知识提取" protocol description
    - Orchestrator consumes completed state transition and dispatches sf-knowledge (existing V5.0 pattern)
    - No code changes to sf_state_transition_core.ts for knowledge extraction
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 10. Checkpoint — Run `bun test` and verify: all tests pass, no regression from existing 1028 tests, report new test count and total pass count

- [ ] 11. Unit Tests + Integration Tests + Regression Tests (Phase 6)
  - [ ] 11.1 Write unit tests for state machine extensions
    - Test all legal transitions for each of the 4 new workflow transition tables
    - Test illegal transitions (skip stages, reverse flow) are rejected
    - Test `getTransitionTable` returns correct table for new workflow types
    - Regression: existing 4 workflow transition tables unchanged
    - File: `tests/unit/tools/lib/state_machine.test.ts`
    - _Requirements: 12.1, 8.1_

  - [ ] 11.2 Write unit tests for workflow-specific guards
    - Test refactor risk_path guard: high→review only, low→verification only, missing→blocked
    - Test investigation user_accepted guard: true→allow, false/undefined/missing→reject
    - File: `tests/unit/tools/lib/sf_state_transition_core.test.ts`
    - _Requirements: 12.1, 3.8, 5.13_

  - [ ] 11.3 Write unit tests for Gate mode dispatch
    - Test each mode's pass/fail scenarios for sf_requirements_gate
    - Test each mode's pass/fail scenarios for sf_design_gate
    - Test each mode's pass/fail scenarios for sf_verification_gate
    - Test no-mode backward compatibility (behavior = V3.5)
    - Test unknown mode returns fail + warning
    - Test ops_plan_gate safety checks (missing rollback plan/trigger conditions/backup → fail)
    - File: `tests/unit/tools/lib/gate_mode.test.ts`
    - _Requirements: 12.4, 12.8, 11.1, 11.2, 11.4, 11.6_

  - [ ] 11.4 Write unit tests for Continuity Engine
    - Test context exhaustion detection (various pattern matches, non-matching patterns, run not failed)
    - Test Context_Snapshot extraction (each workflow type's field selection)
    - Test key message filtering (priority and count limits)
    - Test continuation prompt generation (structure completeness)
    - Test archive merge (files_changed union, duration sum, tool_calls concat)
    - Test continuation counter (limit enforcement at 1 and 2)
    - File: `tests/unit/tools/lib/sf_continuity_core.test.ts`
    - _Requirements: 12.5, 12.6, 12.9_

  - [ ] 11.5 Write integration tests for Skill file loading and routing
    - Verify 4 new Skill files exist and have correct YAML frontmatter
    - Verify Orchestrator routing table maps correctly to new Skills
    - Verify intent classification routes new keywords to correct workflows
    - Regression: existing workflow trigger inputs still route to original workflows
    - File: `tests/integration/workflow_routing.test.ts`
    - _Requirements: 12.2, 12.3, 8.6_

  - [ ] 11.6 Write integration tests for KG sync and knowledge extraction
    - Test KG sync triggers at correct Gate pass points for each new workflow
    - Test investigation workflow does NOT sync KG
    - Test knowledge extraction triggers on completed for all 4 new workflows
    - Test investigation knowledge entries have status="candidate", confidence="medium"
    - Test non-investigation entries have status="active", confidence="high"
    - Test refactor_plan_gate pass triggers scope='tasks' sync for code_file + modifies edges (refactor has no tasks_gate)
    - File: `tests/integration/kg_knowledge_integration.test.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.7, 10.8, 12.11_

  - [ ] 11.7 Write regression tests for backward compatibility
    - Test existing 4 workflows' state machines unchanged
    - Test Gate tools without mode parameter behave identically to V3.5
    - Test existing 16 Custom Tools' input/output contracts unchanged
    - Test existing KG queries don't fail on new node/edge types
    - Test investigation findings_report_gate user acceptance flow (accept→completed, request more→research)
    - File: `tests/regression/v36_backward_compat.test.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 12.7, 12.10_

- [ ] 12. Checkpoint — Run `bun test` and verify: all tests pass, no regression from existing 1028 tests, report new test count and total pass count

- [ ] 13. Documentation Updates (Phase 7)
  - [ ] 13.1 Update AGENTS.md with new workflows, skills, and routing
    - Add 4 new workflows to workflow list (Section 4 equivalent for new workflows)
    - Add 4 new Skills to Skills table (Section 6)
    - Update routing table (Section 7.2) with 4 new entries
    - Add continuity configuration to config section
    - Add new KG types to Section 9
    - File: `AGENTS.md`
    - _Requirements: 6.2_

  - [ ] 13.2 Update the Plugin's project runtime initialization template with continuity defaults
    - Update `sf_specforge.ts` buildInitialProjectConfig to include `"continuity": { "max_continuations": 1, "key_messages_count": 20 }` in the generated project.json template
    - NOT directly modifying a specific project's specforge/config/project.json
    - Add test: new project initialization includes continuity config section
    - File: `.opencode/plugins/sf_specforge.ts`
    - _Requirements: 1.4, 1.6_

- [ ] 14. Final checkpoint — Run `bun test` and verify: all tests pass, no regression from existing 1028 tests, report new test count and total pass count

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code is TypeScript, targeting the existing `.opencode/tools/lib/` architecture
- Existing 4 workflows must remain completely unchanged (backward compatibility is a hard constraint)
