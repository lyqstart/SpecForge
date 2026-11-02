# Change Plan — SPS Conformance Gap Repair

RUN_ID=CODEX-SF-20261103-SPS-GAP-REPAIR-A01
EXECUTION_MODE=CODEX_DIRECT
BASE_HEAD=c55f0b09dd24d18f4618b1b4fe608eed29b42d51
BRANCH=codex/sps-conformance-repair

## Goal
Repair the five confirmed conformance gaps recorded in `docs/project-status.md` and the archived audit, validate all affected producer-consumer paths, and classify deployment evidence. Preserve the original synthetic WI-0001 at `candidate_preparing`; do not infer approval or bypass Candidate seal/Gate.

## Bounded workstreams
1. Runtime Candidate implementation baseline truth validation: fix statement/scope-aware contradiction detection, bind to the actual Runtime-owned baseline, and cover true/false cases.
2. D18 consumers: align skills and agent instructions with the approved internal read-only containment boundary; do not broaden D18 or claim scripts/builds/tests are supported by the product.
3. Trace path consumers: align stale guidance/tool consumer paths with `.specforge/runtime/logs/trace.jsonl`; retain only genuinely historical references where clearly marked.
4. Design/Trace ownership: remove the conflicting `sf-design` instruction to write `trace_delta`; preserve `sf-task-planner` as the formal producer/owner and align its handoff semantics.
5. OpenCode Adapter production event bridge: implement the production subscription path between the OpenCode runtime client, Adapter and Daemon event ingress, with failure/termination behavior covered at unit and integration boundaries.
6. Synchronize source, deployment assets, installer/release inventory and required tests for each changed behavior.

## Product authority
SPS §6 Candidate integrity and REQ identity, §9.2 D18, §10.2 Adapter event subscription/translation, §19 conformance criteria; Authority Registry D16 and D18. No product scope expansion is authorized by this change plan.

## Validation
Follow `docs/project-status.md` REQUIRED_VALIDATION. Add focused regressions for the corrected behaviors; run the affected package tests and required workflow/release/install/deployment checks, then inspect the complete diff and working-tree scope. Deployment and fresh-host evidence must be reported separately from source tests.

## Write classification
- TRUTH_SOURCE_WRITES: none planned in `.specforge/**`; SPS/Authority Registry change only if implementation evidence proves a product-authority conflict, otherwise prohibited.
- REPOSITORY_TRACKED_WRITES: scoped source, consumers, tests, project status, and this archived evidence root.
- RUNTIME_OBSERVER_WRITES: none expected; declare any that occur.
- EXTERNAL_EVIDENCE_WRITES: this RUN_ID evidence root only by default.

## Stop
Stop after the five gap repairs, required validation, deployment classification and evidence reconciliation. Do not resume or mutate the original WI-0001 business project in this run.
