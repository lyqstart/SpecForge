# Investigation Gate Contract Fix Bugfix Design

## Overview

SpecForge's Investigation Governance (§14.7 of `docs/standards/fused_standard.md`) is statically
complete but runtime-brittle. Acceptance testing of a single compliant investigation (WI-0001)
produced 11 gate failures, none of which reflected a substantive quality problem. Every failure came
from an undocumented or overly literal parsing contract in the two gate cores, plus a
`sf_state_read` authority flag that misreports event replay. Those failure loops then pushed the
`sf-orchestrator` across the §14.7.2 / §14.7.5 independence boundary: it read `findings_report.md`
and dictated the investigator's verdicts, root-cause status and justification instead of returning
structured `blocking_issues`.

The fix has two clusters:

- **A-cluster** — brittle / undocumented gate contracts: **P4** (exact bare-header matching),
  **P5** (token mention counted as declaration), **P6** (undocumented `EV-` evidence-ID prefix),
  **P7** (undocumented / inconsistent verdict vocabulary), **P10** (`rebuilt_from_events` reports
  replay when no event log existed), plus the cross-cutting requirement that blocking issues be
  self-explanatory.
- **D-cluster** — **P9**, the orchestrator eroding investigator independence, partly *caused* by the
  A-cluster loops.

The strategy is deliberately narrow: **loosen and clarify parsing** and **document the contracts**.
It MUST NOT weaken the substantive §14.7.2 root-cause credibility rules. The genuine
investigation-credibility gate (≥2 distinct evidence for `ROOT_CAUSE_CONFIRMED`, no confirmation with
unclosed / partial hypotheses, single PREMISE / OBSERVER_EFFECT declaration, two-competing-hypotheses
rule) must remain fully enforced. Changes concentrate in section-detection regexes, declaration
counting, an agreed evidence-ID form, an agreed verdict vocabulary, one truthful authority flag, and
the orchestrator steering behavior — never in the credibility predicates themselves.

## Glossary

- **Bug_Condition (C)**: The condition that triggers a defect — a substantively-valid investigation
  document (or a state read against an empty project) that is nonetheless mishandled by a brittle
  parsing contract, an undocumented token requirement, a misreported authority flag, or an
  independence-violating orchestration feedback path.
- **Property (P)**: The desired behavior — documents that satisfy the documented contract are
  accepted, the authority flag reflects reality, and gate failures are fed back as structured
  `blocking_issues` for independent revision.
- **Preservation**: The substantive §14.7.2 credibility rules, section-boundary behavior, genuine
  missing-section detection, and legitimate orchestration-on-success that MUST remain unchanged.
- **parseSections**: Function in `packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts`
  that extracts required sections from `investigation_plan.md` using the anchored regex
  `^#{2,3}\s*${name}\s*$`.
- **checkInvestigationPlanContent**: Function in `sf_requirements_gate_core.ts` that validates
  investigation-plan content, including the single PREMISE / OBSERVER_EFFECT declaration rule.
- **extractMarkdownSection / checkFindingsReportContent**: Functions in
  `packages/daemon-core/src/tools/lib/sf_design_gate_core.ts` that detect sections and validate
  `findings_report.md`, including verdict vocabulary and the `EV-*` evidence-ID match.
- **sf_state_read**: Tool handler in `packages/daemon-core/src/tools/handlers/sf-state-read.ts` that
  returns project state and the `rebuilt_from_events` authority flag.
- **canonical section name**: The bare required-section token in `REQUIREMENTS_GATE_SPECS` /
  `DESIGN_GATE_SPECS` (e.g. `预期产出`, `调查结论`).
- **explicit declaration**: A marked declaration line (e.g. a `PREMISE:` / `OBSERVER_EFFECT:` field
  in the designated section) as opposed to a prose mention of a token in a discussion / decision
  matrix.
- **canonical evidence-ID form**: The single agreed evidence-reference format (`EV-*`) shared by the
  contract, templates, and the Findings Gate.

## Bug Details

### Bug Condition

The defects manifest when a **substantively-valid** investigation artifact is processed by a
**literal** contract, or when the state authority flag is derived without checking reality, or when a
gate failure triggers independence-violating feedback. Concretely:

- **P4**: A required section is present but its header carries a trailing parenthetical / annotation
  (e.g. `## 预期产出（执行阶段，非本 plan）` or `## 调查结论（直接回答原始问题）`). The anchored
  regexes (`^#{2,3}\s*${name}\s*$` in `parseSections`; the `\s*$`-anchored pattern in
  `extractMarkdownSection`) require the header to end at the canonical name, so the section is
  reported as `Missing section: <name>` even though it exists.
- **P5**: An investigation plan discusses alternative PREMISE_* / OBSERVER_EFFECT_* states in prose
  (e.g. a decision matrix explaining the chosen status). `checkInvestigationPlanContent` collects
  every token occurrence with `matchAll`, dedupes, and requires exactly one — so naming alternatives
  in prose trips `必须且只能声明一个合法 PREMISE/OBSERVER_EFFECT 状态`.
- **P6**: A findings report cites evidence as `E1..E12` while `checkFindingsReportContent` matches
  only `\bEV-[A-Za-z0-9_-]+\b`, yielding `evidence_ids: []` and failing the ≥2-evidence rule. The
  `EV-` prefix is documented nowhere in the contract or templates.
- **P7**: A findings report labels a hypothesis `FALSIFIED` / `REFUTED` / `PARTIAL`. The Findings
  Gate accepts only `confirmed|rejected|unknown|已确认|已排除|被推翻|未知|部分确认|partially_confirmed`
  adjacent to the hypothesis ID, so the verdict is unrecognized and fails
  `假设 Hn 必须在同一结果项中给出明确判定`. The accepted set is neither documented nor consistent with
  the template (which lists only `confirmed / rejected / unknown`).
- **P10**: `sf_state_read(all)` runs in a project with no `runtime/events.jsonl` / `runtime/state.json`
  yet returns `{"success": true, "rebuilt_from_events": true, "work_items": {}}`. The flag is set
  `true` solely because `rebuildFromEventsFile` is a function, not because an event log existed and
  was replayed.
- **P9**: When an investigation Gate fails, the `sf-orchestrator` reads `findings_report.md` and
  dispatches revision prompts prescribing hypothesis verdict tokens, the final root-cause status,
  the premise status and verbatim justification, contrary to §14.7.2 / §14.7.5.
- **Cross-cutting**: When any P4–P7 check fails, `blocking_issues` does not name the exact expected
  header token, evidence-ID format, or accepted verdict vocabulary — forcing agents to
  reverse-engineer the parser.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input — one of:
           { kind: 'section', doc, canonicalName, headerText }
           { kind: 'declaration', section, declaredStatuses, proseMentionedStatuses }
           { kind: 'evidence', report, citedEvidenceIds }
           { kind: 'verdict', report, hypothesisId, verdictToken }
           { kind: 'state_read', projectHasEventLog, reportedRebuiltFromEvents }
           { kind: 'gate_failure_feedback', blockingIssues, feedbackPrescribesConclusion }
  OUTPUT: boolean

  MATCH input.kind:

    'section':        # P4
      RETURN headerTextStartsWith(input.headerText, input.canonicalName)   # canonical name is a prefix
             AND sectionIsReportedMissing(input.doc, input.canonicalName)  # but gate says missing

    'declaration':    # P5
      RETURN countExactly(input.declaredStatuses) == 1                     # exactly one real declaration
             AND gateCountsProseMentions(input.proseMentionedStatuses)     # yet gate counts prose tokens too

    'evidence':       # P6
      RETURN citesEvidenceInDocumentedForm(input.citedEvidenceIds)         # per documented canonical form
             AND gateMatchesZeroEvidence(input.citedEvidenceIds)           # but gate extracts none

    'verdict':        # P7
      RETURN verdictInDocumentedVocabulary(input.verdictToken)             # per documented vocabulary
             AND gateRejectsVerdict(input.hypothesisId, input.verdictToken)# but gate does not recognize it

    'state_read':     # P10
      RETURN input.projectHasEventLog == false
             AND input.reportedRebuiltFromEvents == true                   # flag claims replay anyway

    'gate_failure_feedback':  # P9
      RETURN input.feedbackPrescribesConclusion == true                    # orchestrator dictates conclusions
END FUNCTION
```

### Examples

- **P4 (requirements gate)**: `## 预期产出（执行阶段，非本 plan）` present → gate returns
  `Missing section: 预期产出`. Expected: section recognized.
- **P4 (findings gate)**: A report containing `## 调查结论（直接回答原始问题）` and four other decorated
  headers → `Missing section: 调查结论 / 事实与证据 / 调用链与首次偏离点 / 假设验证结果 / 因果链`.
  Expected: all five recognized.
- **P5**: A `问题前提与观察者影响` section that declares `OBSERVER_EFFECT_NONE` once but names
  `OBSERVER_EFFECT_CONTROLLED` and `OBSERVER_EFFECT_UNKNOWN` in a decision-matrix explanation → gate
  counts 3 and fails. Expected: only the one declaration counts.
- **P6**: `事实与证据` cites `E1`, `E7` → `evidence_ids: []`, fails
  `ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用（EV-*）`. Expected: documented form is accepted.
- **P7**: `H2 ... FALSIFIED` → fails `假设 H2 必须在同一结果项中给出明确判定`. Expected: `FALSIFIED`
  (or the documented equivalent) is recognized as a rejection verdict.
- **P10**: Fresh project, no `runtime/events.jsonl` → `sf_state_read(all)` returns
  `rebuilt_from_events: true`. Expected: `rebuilt_from_events: false`.
- **P9**: Findings Gate fails on P7; orchestrator replies "use `ROOT_CAUSE_PROBABLE`, declare
  `PREMISE_HISTORICALLY_EVIDENCED`, and label H2 `rejected` with this justification: …". Expected:
  orchestrator returns the gate's `blocking_issues` verbatim and lets the investigator revise.
- **Edge case (genuine miss)**: A plan with no header whose text starts with `预期产出` at all →
  must still fail `Missing section: 预期产出` (preserved).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Section boundary detection: a matched section still ends at the next same-or-higher-level heading
  (`parseSections` / `extractMarkdownSection` boundary logic) (Req 3.1).
- Genuine missing-section detection: a section with no header starting with the canonical name still
  fails with `Missing section: <name>` (Req 3.2).
- `ROOT_CAUSE_CONFIRMED` still requires ≥2 distinguishable original evidence references in the
  canonical evidence-ID form (Req 3.3).
- A partially confirmed / unclosed primary hypothesis still forbids `ROOT_CAUSE_CONFIRMED` (Req 3.4).
- More than one PREMISE or OBSERVER_EFFECT **explicit declaration** still fails the
  single-declaration rule (Req 3.5).
- Fewer than two competing hypotheses (without the documented single-hypothesis exception) still
  fails the two-competing-hypotheses rule (Req 3.6).
- `PREMISE_CONTRADICTED` / `PREMISE_NOT_REPRODUCED`, or
  `OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE` / `OBSERVER_EFFECT_UNKNOWN` without immutable historical
  original evidence, still forbids `ROOT_CAUSE_CONFIRMED` (Req 3.7).
- On gate **pass**, the orchestrator still advances state, runs gates and coordinates the workflow
  exactly as before; the independence guarantee applies only to failure feedback (Req 3.8).
- In a project that DOES have a project-level event log, `sf_state_read(all)` still replays it and
  reports `rebuilt_from_events: true` with correct `work_items` (Req 3.9).

**Scope:**
All inputs that do NOT match a bug condition must be completely unaffected. This includes:
- Documents whose headers are already bare canonical names (matched exactly as before).
- Investigation credibility predicates in `checkFindingsReportContent` (evidence count, premise /
  observer-effect gating, hypothesis closure) — the fix changes *what counts as an evidence ID or a
  verdict token*, never *how many are required or when confirmation is forbidden*.
- State reads against projects with a real event log.
- Legitimate orchestration on gate success.

**Note:** The expected correct behavior for buggy inputs is defined in the Correctness Properties
section (Properties 1–6). This section focuses on what must NOT change (Properties 7–15).

## Hypothesized Root Cause

Based on the bug analysis and the two gate cores, the most likely issues are:

1. **Over-anchored section regexes (P4)**: Both detectors terminate the header at the canonical name.
   - `parseSections`: `^#{2,3}\s*${escapedName}\s*$` — the trailing `\s*$` rejects any annotation.
   - `extractMarkdownSection`: `^(#{1,6})\s+(?:\d+[.、)]\s*)?${name}\s*$` — same trailing anchor.
   - Root cause: the anchor should allow a trailing parenthetical / annotation *after* the canonical
     name while still requiring the canonical name as a prefix.

2. **Mention-vs-declaration conflation (P5)**: `checkInvestigationPlanContent` (and the mirrored
   block in `checkFindingsReportContent`) `matchAll`s PREMISE_* / OBSERVER_EFFECT_* tokens anywhere
   in the section body, so prose that *names* alternatives is counted as *declaring* them.
   - Root cause: there is no notion of an explicit declaration line; any token occurrence counts.

3. **Undocumented evidence-ID contract (P6)**: The Findings Gate hard-codes `\bEV-[A-Za-z0-9_-]+\b`
   but neither `sf-investigator.md` nor the templates ever state the `EV-` form (they say only
   "证据 ID 必须能回溯到真实证据").
   - Root cause: the parser and the human-facing contract were never reconciled on one canonical form.

4. **Undocumented / inconsistent verdict vocabulary (P7)**: The gate's accepted set
   (`confirmed|rejected|unknown|已确认|已排除|被推翻|未知|部分确认|partially_confirmed`) is wider than
   the template (`confirmed / rejected / unknown`) yet still misses common verdicts (`FALSIFIED`,
   `REFUTED`, `PARTIAL`), and none of it is documented as the authoritative vocabulary.
   - Root cause: the accepted set, the template, and the contract diverged.

5. **Authority flag derived from capability, not reality (P10)**: `sf-state-read.ts` sets
   `rebuilt_from_events = true` whenever `rebuildFromEventsFile` is a function, regardless of whether
   `events.jsonl` existed or any events were replayed. `rebuildFromEventsFile` / `rebuildState`
   return `void` / a state object, never a signal of whether a log existed.
   - Root cause: no replay-occurred signal is threaded from the WAL read up to the handler.

6. **Independence boundary not enforced in feedback path (P9)**: The orchestrator has read access to
   `findings_report.md` and no rule forbids it from composing conclusion-prescribing revision prompts.
   The A-cluster failure loops (opaque `blocking_issues`) make prescribing the "right" answer the
   path of least resistance.
   - Root cause: steering (`sf-orchestrator`) lacks an explicit contract to pass structured
     `blocking_issues` through untouched on failure, amplified by cross-cutting opacity.

## Correctness Properties

Property 1: Bug Condition — Prefix / annotation-tolerant section detection (P4)

_For any_ investigation document whose required-section header text begins with the canonical section
name followed by a trailing parenthetical or annotation (isBugCondition `section` returns true), the
fixed `parseSections` and `extractMarkdownSection` SHALL match the section by treating the canonical
name as a prefix of the header text (ignoring trailing parentheticals / annotations) and SHALL NOT
report it as missing.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Only explicit declarations count (P5)

_For any_ investigation plan that declares exactly one PREMISE / OBSERVER_EFFECT status on an explicit
declaration line while also mentioning alternative statuses in prose (isBugCondition `declaration`
returns true), the fixed `checkInvestigationPlanContent` SHALL count only the explicit declaration
toward the single-declaration rule and SHALL NOT fail
`必须且只能声明一个合法 PREMISE/OBSERVER_EFFECT 状态`.

**Validates: Requirements 2.3**

Property 3: Bug Condition — Canonical evidence-ID form accepted (P6)

_For any_ findings report that cites evidence using the single documented canonical evidence-ID form
(isBugCondition `evidence` returns true), the fixed `checkFindingsReportContent` SHALL extract those
IDs so that evidence written per the documented form is accepted, and the contract, templates and
gate SHALL agree on that form.

**Validates: Requirements 2.4**

Property 4: Bug Condition — Documented verdict vocabulary recognized (P7)

_For any_ findings report that labels a hypothesis verdict using a token in the documented verdict
vocabulary (isBugCondition `verdict` returns true), the fixed Findings Gate SHALL recognize the
verdict, and the gate's accepted set SHALL match the vocabulary documented in the `sf-investigator`
contract and template exactly.

**Validates: Requirements 2.5**

Property 5: Bug Condition — Authority flag reflects reality (P10)

_For any_ `sf_state_read(all)` call in a project with no existing project-level event log
(isBugCondition `state_read` returns true), the fixed handler SHALL report
`rebuilt_from_events: false` (or an equivalently truthful flag) so the flag reflects whether an event
log actually existed and was replayed.

**Validates: Requirements 2.6**

Property 6: Bug Condition — Independent revision via structured feedback (P9)

_For any_ investigation-gate failure (isBugCondition `gate_failure_feedback` returns true), the
`sf-orchestrator` SHALL return the gate's structured `blocking_issues` to `sf-investigator` for
independent revision WITHOUT prescribing conclusions, hypothesis verdicts, root-cause status, premise
status, or justification text; and (cross-cutting) the `blocking_issues` for P4–P7 SHALL name the
exact expected header token, canonical evidence-ID format, and/or accepted verdict vocabulary.

**Validates: Requirements 2.7, 2.8**

Property 7: Preservation — Section boundary behavior

_For any_ input where the bug condition does NOT hold, the fixed section detectors SHALL produce the
same section boundaries as the original — a matched section still ends at the next
same-or-higher-level heading.

**Validates: Requirements 3.1**

Property 8: Preservation — Genuine missing-section detection

_For any_ document with no header whose text starts with the canonical name, the fixed gate SHALL
still fail with `Missing section: <name>`, exactly as the original.

**Validates: Requirements 3.2**

Property 9: Preservation — Two-evidence rule for ROOT_CAUSE_CONFIRMED

_For any_ findings report asserting `ROOT_CAUSE_CONFIRMED`, the fixed Findings Gate SHALL still
require at least two distinguishable original evidence references in the canonical evidence-ID form.

**Validates: Requirements 3.3**

Property 10: Preservation — Partial / unclosed hypothesis forbids confirmation

_For any_ findings report with a `partially_confirmed` / `部分确认` primary hypothesis, the fixed gate
SHALL still forbid `ROOT_CAUSE_CONFIRMED`.

**Validates: Requirements 3.4**

Property 11: Preservation — Single PREMISE / OBSERVER_EFFECT declaration rule

_For any_ document that makes more than one PREMISE or more than one OBSERVER_EFFECT **explicit
declaration**, the fixed gate SHALL still require exactly one declared status of each kind.

**Validates: Requirements 3.5**

Property 12: Preservation — Two-competing-hypotheses rule

_For any_ investigation plan declaring fewer than two competing hypotheses without the documented
single-hypothesis exception, the fixed gate SHALL still fail the two-competing-hypotheses rule.

**Validates: Requirements 3.6**

Property 13: Preservation — Premise / observer-effect gating of confirmation

_For any_ findings report where the premise is `PREMISE_CONTRADICTED` / `PREMISE_NOT_REPRODUCED`, or
the observer effect is `OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE` / `OBSERVER_EFFECT_UNKNOWN`, without
immutable historical original evidence, the fixed gate SHALL still forbid `ROOT_CAUSE_CONFIRMED`.

**Validates: Requirements 3.7**

Property 14: Preservation — Legitimate orchestration on success

_For any_ investigation gate that passes, the `sf-orchestrator` SHALL still advance state, run gates
and coordinate the workflow exactly as before; the independence guarantee SHALL NOT block or alter
legitimate orchestration on success.

**Validates: Requirements 3.8**

Property 15: Preservation — State read with a real event log

_For any_ `sf_state_read(all)` call in a project that DOES have a project-level event log, the fixed
handler SHALL still replay that log and report `rebuilt_from_events: true` with correct `work_items`.

**Validates: Requirements 3.9**

## Fix Implementation

Assuming the root-cause analysis is correct, the changes are confined to parsing / declaration
counting, one agreed evidence-ID form, one agreed verdict vocabulary, one authority flag, and the
orchestrator feedback contract. No credibility predicate is altered.

### Changes Required

**1. Prefix / annotation-tolerant section detection (P4)**

**File**: `packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts`
**Function**: `parseSections`
- Replace the trailing anchor in the header regex so the canonical name is matched as a prefix,
  allowing an optional trailing parenthetical / annotation before end-of-line. Conceptually:
  `^#{2,3}\s*${escapedName}(?:\s*[（(].*[)）])?\s*$` — or, more robustly, match
  `^#{2,3}\s*${escapedName}(\s+.*)?$` restricted so the trailing text is a parenthetical /
  annotation rather than a different word forming another section name.
- Keep the existing next-heading boundary scan unchanged (Property 7).

**File**: `packages/daemon-core/src/tools/lib/sf_design_gate_core.ts`
**Function**: `extractMarkdownSection` (and any `parseSections` used by `checkFindingsReportContent`)
- Apply the identical prefix/annotation-tolerant rule to the heading regex, preserving the numeric
  prefix allowance `(?:\d+[.、)]\s*)?` and the same-or-higher-level boundary scan.
- Factor the tolerant matcher into a shared helper so both cores stay consistent.

**2. Only explicit declarations count (P5)**

**File**: `packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts`
**Function**: `checkInvestigationPlanContent` (and the mirrored premise/observer block in
`checkFindingsReportContent` in `sf_design_gate_core.ts`)
- Count PREMISE_* / OBSERVER_EFFECT_* statuses only from an explicit declaration line — a line
  matching a declaration marker such as `^\s*(?:-\s*)?(?:PREMISE|问题前提)\s*[:：]` /
  `^\s*(?:-\s*)?(?:OBSERVER_EFFECT|观察者影响)\s*[:：]` — instead of `matchAll` over the whole body.
- Prose mentions of alternative tokens (decision matrices, rationale) are ignored.
- The template must show the explicit declaration line so investigators know the canonical form
  (see contract change 6).

**3. Canonical evidence-ID form, documented (P6)**

**Decision**: Adopt `EV-*` (`EV-[A-Za-z0-9_-]+`) as the single canonical evidence-ID form (the gate
already uses it; the requirements/design docs of this very spec use it), and document it everywhere.
**File**: `setup/userlevel-opencode/agents/sf-investigator.md`
- Document the canonical evidence-ID form `EV-<id>` in the contract and in the `事实与证据` /
  `evidence/` template, replacing the vague "证据 ID 必须能回溯到真实证据" with the concrete form plus
  the traceability rule.
**File**: `sf_design_gate_core.ts` (`checkFindingsReportContent`) — keep the `\bEV-[A-Za-z0-9_-]+\b`
matcher (now documented), and surface the form in the blocking issue (change 6).

**4. Verdict vocabulary, documented and consistent (P7)**

**Decision**: Define one authoritative verdict vocabulary and make the template and gate agree.
Canonical set (English + Chinese synonyms):
`confirmed / rejected / unknown / partially_confirmed` with accepted synonyms
`已确认 / 已排除 / 被推翻 / 未知 / 部分确认`, plus the rejection synonyms surfaced in testing
(`falsified / refuted`) and the partial synonym (`partial`).
**File**: `setup/userlevel-opencode/agents/sf-investigator.md`
- Update the hypothesis table legend (currently `confirmed / rejected / unknown`) to list the full
  authoritative vocabulary and its meaning.
**File**: `sf_design_gate_core.ts` (`checkFindingsReportContent`)
- Extend the verdict alternation to match the documented set exactly (add `falsified|refuted|partial`
  as rejection / partial synonyms) so the gate's accepted set equals the documentation.

**5. Truthful `rebuilt_from_events` flag (P10)**

**File**: `packages/daemon-core/src/state/StateManager.ts`
- Change `rebuildFromEventsFile()` (and/or `rebuildState()`) to report whether an event log actually
  existed and was replayed — e.g. return `{ replayed: boolean, eventCount: number }` derived from
  `wal.readAllEvents()` (replayed = the events file existed / eventCount > 0).
**File**: `packages/daemon-core/src/tools/handlers/sf-state-read.ts`
- Set `rebuilt_from_events` from that returned signal instead of from `typeof … === 'function'`. When
  no event log existed, report `false`.
- Apply the same correction in `state-coordinator-v11.ts` (`rebuilt`) and note `sf-doctor.ts`'s
  `canRebuildFromEvents` uses the same pattern — align for consistency (out-of-scope callers keep
  behavior but should not regress).

**6. Self-explanatory blocking issues (cross-cutting, P4–P7)**

**Files**: `sf_requirements_gate_core.ts`, `sf_design_gate_core.ts`
- P4 miss: include the exact expected canonical header token in the `Missing section` message.
- P6 miss: name the canonical evidence-ID form `EV-<id>` in the ≥2-evidence blocking issue.
- P7 miss: list the accepted verdict vocabulary in the `假设 Hn 必须…明确判定` blocking issue.
- P5 miss: state that only an explicit `PREMISE:` / `OBSERVER_EFFECT:` declaration line counts.

**7. Orchestrator independence on failure (P9)**

**File**: `setup/userlevel-opencode/agents/sf-orchestrator` steering / contract
- On investigation-gate **failure**, the orchestrator MUST pass the gate's structured
  `blocking_issues` through to `sf-investigator` untouched and MUST NOT prescribe conclusions,
  hypothesis verdicts, root-cause status, premise status, or justification text.
- On gate **success**, orchestration behavior is unchanged (Property 14).

## Testing Strategy

### Validation Approach

Two-phase: first surface counterexamples that demonstrate each defect on the UNFIXED code (confirming
or refuting the root-cause hypotheses), then verify the fix satisfies the fix-checking properties and
preserves the credibility rules and boundary behavior. Property-based testing is emphasized for
preservation because the credibility predicates span a large input domain.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or
refute the root-cause analysis; if refuted, re-hypothesize.

**Test Plan**: Feed the two gate cores real WI-0001-style documents (decorated headers, prose-mentioned
alternatives, `E1..E12` evidence, `FALSIFIED` verdicts), call `sf_state_read(all)` on an empty project,
and reproduce a failure-loop feedback prompt. Run on UNFIXED code to observe the exact failures.

**Test Cases**:
1. **P4 requirements header**: `parseSections` on a doc with `## 预期产出（执行阶段，非本 plan）` →
   expect `Missing section: 预期产出` (will fail on unfixed code).
2. **P4 findings headers**: `extractMarkdownSection` / `checkFindingsReportContent` on five decorated
   headers → expect the observed multi-missing failure (will fail on unfixed code).
3. **P5 declaration**: `checkInvestigationPlanContent` on a plan with one declaration + prose
   alternatives → expect the single-declaration failure (will fail on unfixed code).
4. **P6 evidence**: `checkFindingsReportContent` with `E1`,`E7` under `ROOT_CAUSE_CONFIRMED` →
   expect `evidence_ids: []` and the ≥2 failure (will fail on unfixed code).
5. **P7 verdict**: hypothesis line `H2 … FALSIFIED` → expect `假设 H2 … 明确判定` failure (will fail).
6. **P10 flag**: `sf_state_read(all)` in a temp project with no `events.jsonl` → expect
   `rebuilt_from_events: true` (will fail on unfixed code).
7. **P9 feedback (edge)**: simulate a gate failure and inspect the orchestrator revision prompt →
   expect it to prescribe verdict / status / justification (may fail on unfixed steering).

**Expected Counterexamples**:
- Sections reported missing despite being present; declarations over-counted; zero evidence IDs;
  unrecognized verdicts; `rebuilt_from_events: true` with no log; conclusion-prescribing feedback.
- Possible causes: over-anchored regexes, mention-vs-declaration conflation, undocumented `EV-` form,
  divergent verdict vocabulary, capability-derived flag, missing independence contract.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the
expected behavior (Properties 1–6).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
    # 'section':     section recognized, not reported missing
    # 'declaration': only explicit declaration counted, no single-declaration failure
    # 'evidence':    canonical-form IDs extracted and accepted
    # 'verdict':     documented verdict recognized
    # 'state_read':  rebuilt_from_events == false when no log existed
    # 'gate_failure_feedback': blocking_issues passed through untouched, no prescription
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function
produces the same result as the original (Properties 7–15).

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because it generates
many documents across the input domain, catches edge cases manual tests miss, and gives strong
guarantees that the §14.7.2 credibility predicates and boundary behavior are unchanged.

**Test Cases**:
1. **Boundary preservation**: Observe on UNFIXED code that a matched section ends at the next
   same-or-higher-level heading; assert identical boundaries after the fix (Property 7).
2. **Genuine miss preservation**: Observe that a truly-absent section fails `Missing section: <name>`;
   assert unchanged after the fix (Property 8).
3. **Credibility preservation**: Observe UNFIXED behavior for the ≥2-evidence rule, partial-hypothesis
   ban, single-declaration rule, two-hypotheses rule, and premise/observer-effect gating; assert
   byte-identical gate results after the fix for non-buggy documents (Properties 9–13).
4. **Orchestration-on-success preservation**: Observe that a passing gate advances state / runs gates;
   assert unchanged after the fix (Property 14).
5. **State-read-with-log preservation**: Observe that a project WITH `events.jsonl` reports
   `rebuilt_from_events: true` and correct `work_items`; assert unchanged after the fix (Property 15).

### Unit Tests

- `parseSections` / `extractMarkdownSection`: decorated headers matched; bare headers unchanged;
  boundary at next same-or-higher heading; genuinely-absent section still missing.
- `checkInvestigationPlanContent`: one explicit declaration + prose alternatives passes; two explicit
  declarations still fail.
- `checkFindingsReportContent`: `EV-*` IDs extracted; documented verdict tokens (incl.
  `falsified`/`refuted`/`partial`) recognized; ≥2-evidence and partial-hypothesis bans intact.
- `sf-state-read`: empty project → `rebuilt_from_events: false`; project with log → `true` + correct
  `work_items`.
- Blocking-issue messages name the expected header token, evidence-ID form, and verdict vocabulary.

### Property-Based Tests

- Generate random decorated / bare / absent headers and assert detection + boundary invariants
  (Properties 1, 7, 8).
- Generate random declaration lines plus random prose token mentions and assert only declarations are
  counted (Properties 2, 11).
- Generate random findings reports across evidence counts, verdicts, premise / observer-effect states
  and assert the credibility predicates are unchanged for non-buggy inputs (Properties 9, 10, 12, 13).
- Generate random projects (with / without event logs) and assert the `rebuilt_from_events` flag
  matches reality (Properties 5, 15).

### Integration Tests

- Full investigation flow: replay a WI-0001-style plan + findings report through the Requirements
  Gate (investigation mode) and Findings/Design Gate (investigation mode) and assert zero spurious
  failures while a genuinely deficient report (e.g. 1 evidence under `ROOT_CAUSE_CONFIRMED`) still
  fails.
- Failure-feedback flow: force a gate failure and assert the orchestrator relays structured
  `blocking_issues` without prescribing conclusions, then assert an independent investigator revision
  can pass (Property 6).
- Success flow: assert a passing gate still advances state and coordinates the workflow (Property 14).
