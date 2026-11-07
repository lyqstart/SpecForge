# Semantic Closure Report

- Work Item: WI-0001
- Status: PASSED
- Source: tool_argument
- Contract: semantic-closure/v1
- Manifest: .specforge/work-items/WI-0001/.semantic_closure.json
- Timestamp: 2026-11-07T07:27:06.083Z

## Errors

- None

## Warnings

- None

## Diagnostics

- Semantic closure was supplied through the typed sf_semantic_closure_run contract.

## Recovery Contract

- Preferred input: typed `semantic_closure` argument.
- Required normal-flow sections: outcomes, requirements, design_decisions, tasks, evidence, project_integration.
- Evidence used for completion must be passed, non-weak, and reference the semantic target it proves.
- After any verification input changes, regenerate with force=true before running verification_gate.

## Checks

| Check ID | Passed | Description |
|---|---:|---|
| semantic_has_outcomes | yes | At least one user outcome is declared |
| semantic_has_requirements | yes | At least one requirement is declared |
| semantic_has_design_decisions | yes | At least one design decision is declared |
| semantic_has_tasks | yes | At least one task is declared |
| semantic_has_evidence | yes | At least one evidence item is declared |
| semantic_unique_ids | yes | Semantic closure entity ids are unique |
| semantic_outcome_OUT-1_requirements_exist | yes | Outcome OUT-1 references existing requirements |
| semantic_outcome_OUT-1_has_requirement | yes | Outcome OUT-1 is covered by at least one requirement |
| semantic_outcome_OUT-1_required_evidence_passed | yes | Outcome OUT-1 required evidence exists, passed, and is not weak evidence |
| semantic_outcome_OUT-1_has_passed_evidence | yes | Outcome OUT-1 is proven by passed behavioral evidence |
| semantic_outcome_OUT-2_requirements_exist | yes | Outcome OUT-2 references existing requirements |
| semantic_outcome_OUT-2_has_requirement | yes | Outcome OUT-2 is covered by at least one requirement |
| semantic_outcome_OUT-2_required_evidence_passed | yes | Outcome OUT-2 required evidence exists, passed, and is not weak evidence |
| semantic_outcome_OUT-2_has_passed_evidence | yes | Outcome OUT-2 is proven by passed behavioral evidence |
| semantic_outcome_OUT-3_requirements_exist | yes | Outcome OUT-3 references existing requirements |
| semantic_outcome_OUT-3_has_requirement | yes | Outcome OUT-3 is covered by at least one requirement |
| semantic_outcome_OUT-3_required_evidence_passed | yes | Outcome OUT-3 required evidence exists, passed, and is not weak evidence |
| semantic_outcome_OUT-3_has_passed_evidence | yes | Outcome OUT-3 is proven by passed behavioral evidence |
| semantic_outcome_OUT-4_requirements_exist | yes | Outcome OUT-4 references existing requirements |
| semantic_outcome_OUT-4_has_requirement | yes | Outcome OUT-4 is covered by at least one requirement |
| semantic_outcome_OUT-4_required_evidence_passed | yes | Outcome OUT-4 required evidence exists, passed, and is not weak evidence |
| semantic_outcome_OUT-4_has_passed_evidence | yes | Outcome OUT-4 is proven by passed behavioral evidence |
| semantic_outcome_OUT-5_requirements_exist | yes | Outcome OUT-5 references existing requirements |
| semantic_outcome_OUT-5_has_requirement | yes | Outcome OUT-5 is covered by at least one requirement |
| semantic_outcome_OUT-5_required_evidence_passed | yes | Outcome OUT-5 required evidence exists, passed, and is not weak evidence |
| semantic_outcome_OUT-5_has_passed_evidence | yes | Outcome OUT-5 is proven by passed behavioral evidence |
| semantic_outcome_OUT-6_requirements_exist | yes | Outcome OUT-6 references existing requirements |
| semantic_outcome_OUT-6_has_requirement | yes | Outcome OUT-6 is covered by at least one requirement |
| semantic_outcome_OUT-6_required_evidence_passed | yes | Outcome OUT-6 required evidence exists, passed, and is not weak evidence |
| semantic_outcome_OUT-6_has_passed_evidence | yes | Outcome OUT-6 is proven by passed behavioral evidence |
| semantic_requirement_REQ-CORE-001_refs_exist | yes | Requirement REQ-CORE-001 references existing outcomes, design decisions, and tasks |
| semantic_requirement_REQ-CORE-001_has_design | yes | Requirement REQ-CORE-001 is realized by at least one design decision |
| semantic_requirement_REQ-CORE-001_has_task | yes | MUST requirement REQ-CORE-001 is covered by at least one task |
| semantic_requirement_REQ-CORE-001_required_evidence_passed | yes | MUST requirement REQ-CORE-001 required evidence exists, passed, and is not weak evidence |
| semantic_requirement_REQ-CORE-001_has_passed_evidence | yes | MUST requirement REQ-CORE-001 is proven by passed behavioral evidence |
| semantic_requirement_REQ-CORE-002_refs_exist | yes | Requirement REQ-CORE-002 references existing outcomes, design decisions, and tasks |
| semantic_requirement_REQ-CORE-002_has_design | yes | Requirement REQ-CORE-002 is realized by at least one design decision |
| semantic_requirement_REQ-CORE-002_has_task | yes | MUST requirement REQ-CORE-002 is covered by at least one task |
| semantic_requirement_REQ-CORE-002_required_evidence_passed | yes | MUST requirement REQ-CORE-002 required evidence exists, passed, and is not weak evidence |
| semantic_requirement_REQ-CORE-002_has_passed_evidence | yes | MUST requirement REQ-CORE-002 is proven by passed behavioral evidence |
| semantic_requirement_REQ-CORE-003_refs_exist | yes | Requirement REQ-CORE-003 references existing outcomes, design decisions, and tasks |
| semantic_requirement_REQ-CORE-003_has_design | yes | Requirement REQ-CORE-003 is realized by at least one design decision |
| semantic_requirement_REQ-CORE-003_has_task | yes | MUST requirement REQ-CORE-003 is covered by at least one task |
| semantic_requirement_REQ-CORE-003_required_evidence_passed | yes | MUST requirement REQ-CORE-003 required evidence exists, passed, and is not weak evidence |
| semantic_requirement_REQ-CORE-003_has_passed_evidence | yes | MUST requirement REQ-CORE-003 is proven by passed behavioral evidence |
| semantic_requirement_REQ-CORE-004_refs_exist | yes | Requirement REQ-CORE-004 references existing outcomes, design decisions, and tasks |
| semantic_requirement_REQ-CORE-004_has_design | yes | Requirement REQ-CORE-004 is realized by at least one design decision |
| semantic_requirement_REQ-CORE-004_has_task | yes | MUST requirement REQ-CORE-004 is covered by at least one task |
| semantic_requirement_REQ-CORE-004_required_evidence_passed | yes | MUST requirement REQ-CORE-004 required evidence exists, passed, and is not weak evidence |
| semantic_requirement_REQ-CORE-004_has_passed_evidence | yes | MUST requirement REQ-CORE-004 is proven by passed behavioral evidence |
| semantic_requirement_REQ-CORE-005_refs_exist | yes | Requirement REQ-CORE-005 references existing outcomes, design decisions, and tasks |
| semantic_requirement_REQ-CORE-005_has_design | yes | Requirement REQ-CORE-005 is realized by at least one design decision |
| semantic_requirement_REQ-CORE-005_has_task | yes | MUST requirement REQ-CORE-005 is covered by at least one task |
| semantic_requirement_REQ-CORE-005_required_evidence_passed | yes | MUST requirement REQ-CORE-005 required evidence exists, passed, and is not weak evidence |
| semantic_requirement_REQ-CORE-005_has_passed_evidence | yes | MUST requirement REQ-CORE-005 is proven by passed behavioral evidence |
| semantic_requirement_REQ-CORE-006_refs_exist | yes | Requirement REQ-CORE-006 references existing outcomes, design decisions, and tasks |
| semantic_requirement_REQ-CORE-006_has_design | yes | Requirement REQ-CORE-006 is realized by at least one design decision |
| semantic_design_DD-CORE-001_refs_exist | yes | Design decision DD-CORE-001 references existing requirements and tasks |
| semantic_design_DD-CORE-001_has_requirement | yes | Design decision DD-CORE-001 is justified by at least one requirement |
| semantic_design_DD-CORE-001_has_task | yes | Design decision DD-CORE-001 is implemented by at least one task |
| semantic_design_DD-CORE-002_refs_exist | yes | Design decision DD-CORE-002 references existing requirements and tasks |
| semantic_design_DD-CORE-002_has_requirement | yes | Design decision DD-CORE-002 is justified by at least one requirement |
| semantic_design_DD-CORE-002_has_task | yes | Design decision DD-CORE-002 is implemented by at least one task |
| semantic_design_DD-CORE-003_refs_exist | yes | Design decision DD-CORE-003 references existing requirements and tasks |
| semantic_design_DD-CORE-003_has_requirement | yes | Design decision DD-CORE-003 is justified by at least one requirement |
| semantic_design_DD-CORE-003_has_task | yes | Design decision DD-CORE-003 is implemented by at least one task |
| semantic_design_DD-CORE-004_refs_exist | yes | Design decision DD-CORE-004 references existing requirements and tasks |
| semantic_design_DD-CORE-004_has_requirement | yes | Design decision DD-CORE-004 is justified by at least one requirement |
| semantic_design_DD-CORE-004_has_task | yes | Design decision DD-CORE-004 is implemented by at least one task |
| semantic_design_DD-CORE-005_refs_exist | yes | Design decision DD-CORE-005 references existing requirements and tasks |
| semantic_design_DD-CORE-005_has_requirement | yes | Design decision DD-CORE-005 is justified by at least one requirement |
| semantic_design_DD-CORE-005_has_task | yes | Design decision DD-CORE-005 is implemented by at least one task |
| semantic_design_DD-CORE-006_refs_exist | yes | Design decision DD-CORE-006 references existing requirements and tasks |
| semantic_design_DD-CORE-006_has_requirement | yes | Design decision DD-CORE-006 is justified by at least one requirement |
| semantic_design_DD-CORE-006_has_task | yes | Design decision DD-CORE-006 is implemented by at least one task |
| semantic_task_TASK-WI-0001-001_refs_exist | yes | Task TASK-WI-0001-001 references existing requirements, design decisions, and evidence |
| semantic_task_TASK-WI-0001-001_has_requirement | yes | Task TASK-WI-0001-001 implements at least one requirement |
| semantic_task_TASK-WI-0001-001_has_design | yes | Task TASK-WI-0001-001 implements at least one design decision |
| semantic_task_TASK-WI-0001-001_evidence_passed | yes | Task TASK-WI-0001-001 evidence exists, passed, and is not weak evidence |
| semantic_task_TASK-WI-0001-002_refs_exist | yes | Task TASK-WI-0001-002 references existing requirements, design decisions, and evidence |
| semantic_task_TASK-WI-0001-002_has_requirement | yes | Task TASK-WI-0001-002 implements at least one requirement |
| semantic_task_TASK-WI-0001-002_has_design | yes | Task TASK-WI-0001-002 implements at least one design decision |
| semantic_task_TASK-WI-0001-002_evidence_passed | yes | Task TASK-WI-0001-002 evidence exists, passed, and is not weak evidence |
| semantic_task_TASK-WI-0001-003_refs_exist | yes | Task TASK-WI-0001-003 references existing requirements, design decisions, and evidence |
| semantic_task_TASK-WI-0001-003_has_requirement | yes | Task TASK-WI-0001-003 implements at least one requirement |
| semantic_task_TASK-WI-0001-003_has_design | yes | Task TASK-WI-0001-003 implements at least one design decision |
| semantic_task_TASK-WI-0001-003_evidence_passed | yes | Task TASK-WI-0001-003 evidence exists, passed, and is not weak evidence |
| semantic_task_TASK-WI-0001-004_refs_exist | yes | Task TASK-WI-0001-004 references existing requirements, design decisions, and evidence |
| semantic_task_TASK-WI-0001-004_has_requirement | yes | Task TASK-WI-0001-004 implements at least one requirement |
| semantic_task_TASK-WI-0001-004_has_design | yes | Task TASK-WI-0001-004 implements at least one design decision |
| semantic_task_TASK-WI-0001-004_evidence_passed | yes | Task TASK-WI-0001-004 evidence exists, passed, and is not weak evidence |
| semantic_task_TASK-WI-0001-005_refs_exist | yes | Task TASK-WI-0001-005 references existing requirements, design decisions, and evidence |
| semantic_task_TASK-WI-0001-005_has_requirement | yes | Task TASK-WI-0001-005 implements at least one requirement |
| semantic_task_TASK-WI-0001-005_has_design | yes | Task TASK-WI-0001-005 implements at least one design decision |
| semantic_task_TASK-WI-0001-005_evidence_passed | yes | Task TASK-WI-0001-005 evidence exists, passed, and is not weak evidence |
| semantic_evidence_EV-0014_refs_exist | yes | Evidence EV-0014 references existing semantic targets |
| semantic_evidence_EV-0021_refs_exist | yes | Evidence EV-0021 references existing semantic targets |
| semantic_evidence_EV-0022_refs_exist | yes | Evidence EV-0022 references existing semantic targets |
| semantic_project_integration_closed | yes | Project integration is merged or not_applicable |
