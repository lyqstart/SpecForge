# Implementation Plan

## Overview

This plan follows the exploratory bugfix workflow: first surface counterexamples that demonstrate
each defect on the **UNFIXED** code (Properties 1–6, bug-condition checking), then capture the
behavior that must not change (Properties 7–15, preservation checking), then apply the fixes and
re-run both suites (fix-checking + preservation-checking).

**Source under test:**
- `packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts` (`parseSections`, `checkInvestigationPlanContent`)
- `packages/daemon-core/src/tools/lib/sf_design_gate_core.ts` (`extractMarkdownSection`, `checkFindingsReportContent`)
- `packages/daemon-core/src/state/StateManager.ts` (`rebuildFromEventsFile` / `rebuildState`)
- `packages/daemon-core/src/tools/handlers/sf-state-read.ts` (`rebuilt_from_events`)
- `setup/userlevel-opencode/agents/sf-investigator.md`, `setup/userlevel-opencode/agents/sf-orchestrator` steering

**Tests:** `bun`/`vitest` unit tests in `tests/unit/tools/lib/`, property-based tests (`fast-check`) in `tests/property/`.

**Defect-to-property map:** P4 → Properties 1, 7, 8 · P5 → Properties 2, 11 · P6 → Properties 3, 9 ·
P7 → Properties 4, 10 · P10 → Properties 5, 15 · P9 + cross-cutting → Properties 6, 14.

## Tasks

- [x] 1. Write bug condition exploration test — prefix/annotation-tolerant section detection (P4)
  - **Property 1: Bug Condition** - Prefix / Annotation-Tolerant Section Detection
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples showing present sections reported as missing
  - **Scoped PBT Approach**: scope the property to the concrete failing headers from the design examples
  - Requirements gate: call `parseSections` on a doc containing `## 预期产出（执行阶段，非本 plan）`; assert the section is recognized (NOT `Missing section: 预期产出`)
  - Findings gate: call `extractMarkdownSection` / `checkFindingsReportContent` on a report with five decorated headers (`## 调查结论（直接回答原始问题）`, `事实与证据`, `调用链与首次偏离点`, `假设验证结果`, `因果链`); assert all five recognized
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (proves headers with trailing parentheticals are treated as missing)
  - Document counterexamples (e.g. "`## 预期产出（执行阶段，非本 plan）` → `Missing section: 预期产出`")
  - Mark complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2_

- [x] 2. Write bug condition exploration test — only explicit declarations count (P5)
  - **Property 2: Bug Condition** - Only Explicit PREMISE / OBSERVER_EFFECT Declarations Count
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the over-count when alternatives are named in prose
  - **Scoped PBT Approach**: scope to a `问题前提与观察者影响` section declaring `OBSERVER_EFFECT_NONE` once while mentioning `OBSERVER_EFFECT_CONTROLLED` and `OBSERVER_EFFECT_UNKNOWN` in a decision matrix
  - Call `checkInvestigationPlanContent`; assert the single-declaration rule passes (only one real declaration)
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS with `必须且只能声明一个合法 PREMISE/OBSERVER_EFFECT 状态` (3 tokens counted)
  - Document the counterexample (prose mentions counted as declarations)
  - Mark complete when test is written, run, and failure is documented
  - _Requirements: 2.3_

- [x] 3. Write bug condition exploration test — canonical evidence-ID form accepted (P6)
  - **Property 3: Bug Condition** - Canonical Evidence-ID Form Accepted
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface `evidence_ids: []` when evidence is cited in a non-`EV-` form the contract never documented
  - Call `checkFindingsReportContent` on a report citing `E1`, `E7` under `ROOT_CAUSE_CONFIRMED`
  - Assert the cited evidence is extracted / the ≥2-evidence rule is satisfied for documented-form evidence
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS — `evidence_ids: []` and `ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用（EV-*）`
  - Document counterexample and confirm the `EV-` prefix is undocumented in `sf-investigator.md`
  - Mark complete when test is written, run, and failure is documented
  - _Requirements: 2.4_

- [x] 4. Write bug condition exploration test — documented verdict vocabulary recognized (P7)
  - **Property 4: Bug Condition** - Documented Verdict Vocabulary Recognized
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface unrecognized verdicts that should be valid rejections/partials
  - Call `checkFindingsReportContent` on a hypothesis line `H2 … FALSIFIED` (and variants `REFUTED`, `PARTIAL`)
  - Assert the verdict is recognized as a valid judgement
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS with `假设 H2 必须在同一结果项中给出明确判定`
  - Document counterexample; record that the gate set diverges from the template (`confirmed / rejected / unknown`)
  - Mark complete when test is written, run, and failure is documented
  - _Requirements: 2.5_

- [x] 5. Write bug condition exploration test — authority flag reflects reality (P10)
  - **Property 5: Bug Condition** - `rebuilt_from_events` Reflects Reality
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the flag claiming replay when no event log existed
  - Create a temp project with NO `runtime/events.jsonl` / `runtime/state.json`; call `sf_state_read(all)`
  - Assert `rebuilt_from_events === false` (no log existed)
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS — returns `{ success: true, rebuilt_from_events: true, work_items: {} }`
  - Document counterexample (flag derived from `typeof rebuildFromEventsFile === 'function'`, not reality)
  - Mark complete when test is written, run, and failure is documented
  - _Requirements: 2.6_

- [x] 6. Write bug condition exploration test — independent revision via structured feedback (P9)
  - **Property 6: Bug Condition** - Orchestrator Relays `blocking_issues` Without Prescribing Conclusions
  - **CRITICAL / edge case**: This test targets `sf-orchestrator` steering; it MUST FAIL (or reproduce the violation) on unfixed steering
  - **DO NOT attempt to fix the test or the steering when it fails**
  - **GOAL**: Reproduce conclusion-prescribing feedback after a gate failure
  - Force an investigation-gate failure (e.g. reuse the P7 verdict failure) and inspect the orchestrator revision prompt
  - Assert the prompt relays the gate's structured `blocking_issues` untouched and does NOT prescribe hypothesis verdicts, final root-cause status, premise status, or verbatim justification
  - Also assert (cross-cutting) that the P4–P7 `blocking_issues` name the exact expected header token, canonical evidence-ID form `EV-<id>`, and accepted verdict vocabulary
  - Run on UNFIXED code/steering
  - **EXPECTED OUTCOME**: Test FAILS — feedback dictates conclusions (e.g. "use `ROOT_CAUSE_PROBABLE`, label H2 `rejected` with this justification…") and blocking issues are opaque
  - Document counterexample referencing §14.7.2 / §14.7.5
  - Mark complete when test is written, run, and failure is documented
  - _Requirements: 2.7, 2.8_

- [x] 7. Write preservation property test — section boundary behavior (BEFORE fix)
  - **Property 7: Preservation** - Section Boundary Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code that a matched section ends at the next same-or-higher-level heading
  - Write a property-based test (`fast-check`) generating random bare/decorated headers with following headings of varying levels; assert the extracted section body spans exactly up to the next same-or-higher heading
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (baseline boundary behavior to preserve)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1_

- [x] 8. Write preservation property test — genuine missing-section detection (BEFORE fix)
  - **Property 8: Preservation** - Genuine Missing-Section Detection
  - **IMPORTANT**: Follow observation-first methodology
  - Observe that a document with NO header whose text starts with the canonical name fails `Missing section: <name>`
  - Write a property-based test generating docs lacking the canonical prefix; assert the gate still reports `Missing section: <name>`
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (baseline miss detection to preserve)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.2_

- [x] 9. Write preservation property test — two-evidence rule for ROOT_CAUSE_CONFIRMED (BEFORE fix)
  - **Property 9: Preservation** - ≥2 Distinguishable Evidence for `ROOT_CAUSE_CONFIRMED`
  - **IMPORTANT**: Follow observation-first methodology; do NOT weaken the §14.7.2 credibility predicate
  - Observe that `checkFindingsReportContent` fails `ROOT_CAUSE_CONFIRMED` with fewer than 2 distinct `EV-*` references
  - Write a property-based test generating reports with 0/1/2+ distinct `EV-*` IDs under `ROOT_CAUSE_CONFIRMED`; assert confirmation requires ≥2
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (credibility baseline)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.3_

- [x] 10. Write preservation property test — partial/unclosed hypothesis forbids confirmation (BEFORE fix)
  - **Property 10: Preservation** - Partial / Unclosed Hypothesis Forbids `ROOT_CAUSE_CONFIRMED`
  - **IMPORTANT**: Follow observation-first methodology
  - Observe that a `partially_confirmed` / `部分确认` primary hypothesis forbids `ROOT_CAUSE_CONFIRMED`
  - Write a property-based test generating reports with partial/unclosed primary hypotheses; assert confirmation is forbidden
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (credibility baseline)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.4_

- [x] 11. Write preservation property test — single PREMISE / OBSERVER_EFFECT declaration rule (BEFORE fix)
  - **Property 11: Preservation** - Single Explicit Declaration Rule
  - **IMPORTANT**: Follow observation-first methodology
  - Observe that more than one PREMISE or OBSERVER_EFFECT **explicit declaration** still fails
  - Write a property-based test generating docs with 1 vs 2+ explicit declaration lines; assert exactly one declared status of each kind is required
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (credibility baseline; complements the P5 fix which changes only what counts as a declaration)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.5_

- [x] 12. Write preservation property test — two-competing-hypotheses rule (BEFORE fix)
  - **Property 12: Preservation** - Two-Competing-Hypotheses Rule
  - **IMPORTANT**: Follow observation-first methodology
  - Observe that a plan declaring fewer than two competing hypotheses (without the documented single-hypothesis exception) fails
  - Write a property-based test generating plans with 1 vs ≥2 competing hypotheses; assert the rule still fires
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (credibility baseline)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.6_

- [x] 13. Write preservation property test — premise / observer-effect gating of confirmation (BEFORE fix)
  - **Property 13: Preservation** - Premise / Observer-Effect Gating
  - **IMPORTANT**: Follow observation-first methodology
  - Observe that `PREMISE_CONTRADICTED` / `PREMISE_NOT_REPRODUCED`, or `OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE` / `OBSERVER_EFFECT_UNKNOWN` without immutable historical original evidence, forbids `ROOT_CAUSE_CONFIRMED`
  - Write a property-based test generating reports across premise / observer-effect states; assert confirmation is forbidden in the gated states
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (credibility baseline)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.7_

- [x] 14. Write preservation test — legitimate orchestration on success (BEFORE fix)
  - **Property 14: Preservation** - Legitimate Orchestration on Gate Success
  - **IMPORTANT**: Follow observation-first methodology
  - Observe that on gate **pass** the orchestrator advances state, runs gates, and coordinates the workflow as before
  - Write a test asserting a passing investigation gate still advances state / runs gates unchanged
  - Run on UNFIXED code/steering
  - **EXPECTED OUTCOME**: Tests PASS (success-path baseline the independence guarantee must not alter)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.8_

- [x] 15. Write preservation property test — state read with a real event log (BEFORE fix)
  - **Property 15: Preservation** - State Read With a Real Event Log
  - **IMPORTANT**: Follow observation-first methodology
  - Observe that a project WITH `runtime/events.jsonl` reports `rebuilt_from_events: true` and correct `work_items`
  - Write a property-based test generating projects with event logs of varying content; assert `rebuilt_from_events === true` and `work_items` replayed correctly
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (replay baseline to preserve; complements the P10 fix which only corrects the no-log case)
  - Mark complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.9_

- [x] 16. Fix for brittle / undocumented investigation gate contracts and orchestrator independence

  - [x] 16.1 Extract a shared prefix/annotation-tolerant matcher and fix `parseSections` (P4)
    - Add a shared tolerant header matcher helper usable by both gate cores
    - In `sf_requirements_gate_core.ts` `parseSections`, replace the trailing anchor so the canonical name matches as a prefix followed by an optional trailing parenthetical/annotation (e.g. `^#{2,3}\s*${escapedName}(?:\s*[（(].*[)）])?\s*$`), while requiring the canonical name as a prefix
    - Preserve the existing next-heading boundary scan unchanged
    - _Bug_Condition: isBugCondition('section') — header text starts with canonical name + trailing annotation but reported missing_
    - _Expected_Behavior: expectedBehavior('section') — section recognized, not reported missing_
    - _Preservation: section boundary behavior (Property 7), genuine miss detection (Property 8)_
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 16.2 Apply the shared tolerant matcher in the design/findings gate (P4)
    - In `sf_design_gate_core.ts` `extractMarkdownSection` (and any `parseSections` used by `checkFindingsReportContent`), use the shared helper from 16.1
    - Preserve the numeric-prefix allowance `(?:\d+[.、)]\s*)?` and the same-or-higher-level boundary scan
    - _Bug_Condition: isBugCondition('section') — decorated findings-report headers reported missing_
    - _Expected_Behavior: expectedBehavior('section') — all required sections recognized_
    - _Preservation: Property 7, Property 8_
    - _Requirements: 2.2, 3.1, 3.2_

  - [x] 16.3 Count only explicit PREMISE / OBSERVER_EFFECT declaration lines (P5)
    - In `sf_requirements_gate_core.ts` `checkInvestigationPlanContent`, replace the whole-body `matchAll` with detection of explicit declaration lines matching a marker (e.g. `^\s*(?:-\s*)?(?:PREMISE|问题前提)\s*[:：]` / `^\s*(?:-\s*)?(?:OBSERVER_EFFECT|观察者影响)\s*[:：]`)
    - Apply the same change to the mirrored premise/observer block in `sf_design_gate_core.ts` `checkFindingsReportContent`
    - Prose mentions of alternative tokens (decision matrices / rationale) are ignored
    - _Bug_Condition: isBugCondition('declaration') — exactly one explicit declaration but prose mentions counted_
    - _Expected_Behavior: expectedBehavior('declaration') — only explicit declaration counts, no single-declaration failure_
    - _Preservation: single-declaration rule for 2+ explicit declarations (Property 11)_
    - _Requirements: 2.3, 3.5_

  - [x] 16.4 Adopt and document the canonical evidence-ID form `EV-<id>` (P6)
    - In `setup/userlevel-opencode/agents/sf-investigator.md`, document `EV-<id>` (`EV-[A-Za-z0-9_-]+`) as the single canonical evidence-ID form in the contract and the `事实与证据` / `evidence/` template, replacing the vague "证据 ID 必须能回溯到真实证据" with the concrete form plus the traceability rule
    - Keep the `\bEV-[A-Za-z0-9_-]+\b` matcher in `sf_design_gate_core.ts` (now documented)
    - _Bug_Condition: isBugCondition('evidence') — evidence cited in documented form but extracted as none_
    - _Expected_Behavior: expectedBehavior('evidence') — canonical-form IDs extracted and accepted; contract/template/gate agree_
    - _Preservation: ≥2-evidence rule for ROOT_CAUSE_CONFIRMED (Property 9)_
    - _Requirements: 2.4, 3.3_

  - [x] 16.5 Define one authoritative verdict vocabulary and sync gate + docs (P7)
    - Canonical set: `confirmed / rejected / unknown / partially_confirmed` with synonyms `已确认 / 已排除 / 被推翻 / 未知 / 部分确认`, plus rejection synonyms `falsified / refuted` and partial synonym `partial`
    - In `setup/userlevel-opencode/agents/sf-investigator.md`, update the hypothesis table legend to list the full authoritative vocabulary and meanings
    - In `sf_design_gate_core.ts` `checkFindingsReportContent`, extend the verdict alternation to match the documented set exactly (add `falsified|refuted|partial`)
    - _Bug_Condition: isBugCondition('verdict') — documented verdict token not recognized_
    - _Expected_Behavior: expectedBehavior('verdict') — documented verdict recognized; gate set equals documentation_
    - _Preservation: partial/unclosed hypothesis still forbids confirmation (Property 10)_
    - _Requirements: 2.5, 3.4_

  - [x] 16.6 Thread a real replayed signal into `rebuilt_from_events` (P10)
    - In `packages/daemon-core/src/state/StateManager.ts`, change `rebuildFromEventsFile()` / `rebuildState()` to report whether an event log actually existed and was replayed (e.g. return `{ replayed: boolean, eventCount: number }` derived from `wal.readAllEvents()`)
    - In `packages/daemon-core/src/tools/handlers/sf-state-read.ts`, set `rebuilt_from_events` from that signal instead of `typeof … === 'function'`; report `false` when no event log existed
    - Align `state-coordinator-v11.ts` (`rebuilt`) and note `sf-doctor.ts` `canRebuildFromEvents` for consistency without regressing out-of-scope callers
    - _Bug_Condition: isBugCondition('state_read') — no event log but flag reports replay_
    - _Expected_Behavior: expectedBehavior('state_read') — rebuilt_from_events == false when no log existed_
    - _Preservation: state read WITH a real log still reports true + correct work_items (Property 15)_
    - _Requirements: 2.6, 3.9_

  - [x] 16.7 Make P4–P7 blocking issues self-explanatory (cross-cutting)
    - In `sf_requirements_gate_core.ts` and `sf_design_gate_core.ts`, enrich `blocking_issues`:
      - P4 miss: include the exact expected canonical header token in the `Missing section` message
      - P5 miss: state that only an explicit `PREMISE:` / `OBSERVER_EFFECT:` declaration line counts
      - P6 miss: name the canonical evidence-ID form `EV-<id>` in the ≥2-evidence blocking issue
      - P7 miss: list the accepted verdict vocabulary in the `假设 Hn 必须…明确判定` blocking issue
    - _Bug_Condition: isBugCondition('gate_failure_feedback') cross-cutting — blocking_issues opaque_
    - _Expected_Behavior: expectedBehavior — blocking_issues name expected header token / evidence-ID form / verdict vocabulary_
    - _Preservation: no change to which credibility checks fire (Properties 9–13)_
    - _Requirements: 2.8_

  - [x] 16.8 Enforce orchestrator independence on failure (P9)
    - In `setup/userlevel-opencode/agents/sf-orchestrator` steering/contract, require that on investigation-gate **failure** the orchestrator relays the gate's structured `blocking_issues` to `sf-investigator` untouched and MUST NOT prescribe conclusions, hypothesis verdicts, root-cause status, premise status, or justification text
    - On gate **success**, orchestration behavior is unchanged
    - _Bug_Condition: isBugCondition('gate_failure_feedback') — feedback prescribes conclusions_
    - _Expected_Behavior: expectedBehavior('gate_failure_feedback') — blocking_issues passed through untouched, no prescription_
    - _Preservation: legitimate orchestration on success (Property 14)_
    - _Requirements: 2.7, 3.8_

  - [x] 16.9 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Prefix / Annotation-Tolerant Section Detection
    - **Property 2: Expected Behavior** - Only Explicit Declarations Count
    - **Property 3: Expected Behavior** - Canonical Evidence-ID Form Accepted
    - **Property 4: Expected Behavior** - Documented Verdict Vocabulary Recognized
    - **Property 5: Expected Behavior** - `rebuilt_from_events` Reflects Reality
    - **Property 6: Expected Behavior** - Independent Revision via Structured Feedback
    - **IMPORTANT**: Re-run the SAME tests from tasks 1–6 - do NOT write new tests
    - The tests from tasks 1–6 encode the expected behavior; when they pass, the fixes are confirmed
    - **EXPECTED OUTCOME**: All six tests PASS (confirms each defect is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 16.10 Verify preservation tests still pass
    - **Property 7: Preservation** - Section Boundary Behavior
    - **Property 8: Preservation** - Genuine Missing-Section Detection
    - **Property 9: Preservation** - ≥2 Evidence for ROOT_CAUSE_CONFIRMED
    - **Property 10: Preservation** - Partial / Unclosed Hypothesis Forbids Confirmation
    - **Property 11: Preservation** - Single Explicit Declaration Rule
    - **Property 12: Preservation** - Two-Competing-Hypotheses Rule
    - **Property 13: Preservation** - Premise / Observer-Effect Gating
    - **Property 14: Preservation** - Legitimate Orchestration on Success
    - **Property 15: Preservation** - State Read With a Real Event Log
    - **IMPORTANT**: Re-run the SAME tests from tasks 7–15 - do NOT write new tests
    - **EXPECTED OUTCOME**: All nine tests PASS (confirms no regression to §14.7.2 credibility predicates or boundary behavior)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 17. Checkpoint - Ensure all tests pass
  - Run the full gate unit suite (`tests/unit/tools/lib/sf_requirements_gate_core.test.ts`, `sf_design_gate_core.test.ts`), the property suite (`tests/property/`), and `sf-state-read` tests
  - Run the integration flows from the design: full investigation flow (zero spurious failures while a genuinely deficient report still fails), failure-feedback flow (orchestrator relays `blocking_issues` untouched; independent revision can pass), and success flow (passing gate still advances state)
  - Ensure all tests pass; ask the user if questions arise
  - _Requirements: All_

## Task Dependency Graph

Exploration bug-condition tests (wave 0) and preservation baselines (wave 1) run on UNFIXED code
before any fix. The shared tolerant matcher (16.1) precedes its reuse in the design gate (16.2);
self-explanatory blocking issues (16.7) depend on the parsing/vocabulary changes (16.1–16.5). The
fix-check (16.9) and preservation re-run (16.10) re-run the SAME tests from waves 0–1 and gate the
final checkpoint (17).

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3", "4", "5", "6"] },
    { "id": 1, "tasks": ["7", "8", "9", "10", "11", "12", "13", "14", "15"] },
    { "id": 2, "tasks": ["16.1", "16.3", "16.4", "16.5", "16.6", "16.8"] },
    { "id": 3, "tasks": ["16.2"] },
    { "id": 4, "tasks": ["16.7"] },
    { "id": 5, "tasks": ["16.9", "16.10"] },
    { "id": 6, "tasks": ["17"] }
  ]
}
```

## Notes

- **Two-phase methodology**: Tasks 1–6 are exploratory bug-condition tests that MUST FAIL on unfixed
  code (confirming the root-cause hypotheses); tasks 7–15 are preservation baselines that MUST PASS
  on unfixed code. Do not implement any fix until both suites have been written and run.
- **Property-based testing** is emphasized for preservation (tasks 7–13, 15) because the §14.7.2
  credibility predicates and section-boundary behavior span a large input domain; use `fast-check`
  generators in `tests/property/`.
- **Do not weaken credibility rules**: the fix changes only *what counts* as a section header, an
  explicit declaration, an evidence ID, or a verdict token — never *how many are required* or *when
  confirmation is forbidden*. Properties 9–13 guard this invariant.
- **Re-run, don't rewrite**: tasks 16.9 and 16.10 re-run the exact tests authored in tasks 1–6 and
  7–15. Authoring new tests there would break the fix-check / preservation-check contract.
- **Out of scope** (tracked separately): the Write Guard read-only false-positive (B) and the
  daemon-down / HardStop deadlock (C).
