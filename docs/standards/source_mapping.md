# v1.1 Standard Source Mapping

Maps standard sections to implementation modules.

| Standard Section | Module(s) |
|---|---|
| §1.5 Path Service | directory-layout.ts, path-service.ts |
| §1.6 Path Policy | path-policy.ts |
| §2.1 Project Specs | directory-layout.ts (projectFiles) |
| §4.2 Work Items | directory-layout.ts (workItemFiles) |
| §5 State Machine | state-machine-v11.ts |
| §6 Workflow Path | workflow-path-selector-v11.ts, change-classification.ts, impact-analysis.ts |
| §9 Gates | gate-runner-v11.ts, gate-report.ts, gate-chain.ts, required-gates.ts |
| §10 User Decision | user-decision-recorder-v11.ts, user-decision.ts, waiver.ts |
| §11 Task Contract | (in task-planner) |
| §12 Write Guard | write-guard-v11.ts, allowed-write-files.ts, write-policy.ts, bash-guard.ts |
| §13 Evidence | verification-evidence-v11.ts, evidence.ts, evidence-manifest.ts, verification-report.ts |
| §15 Close Gate | close-gate.ts |
| Patch1 §5-§15 Extension | extension-subflow-v11.ts, extension-registry.ts, extension-request.ts, extension-gate.ts |
