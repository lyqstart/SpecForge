# Bugfix Requirements Document

## Introduction

SpecForge's Investigation Governance (standard §14.7 in `docs/standards/fused_standard.md`) is
statically complete: the required Tools, Gates, agent contract and templates all exist. But real
opencode acceptance testing on branch `fix/investigation-governance-closure` (session transcripts
`session-ses_09c5.md` and `session-ses_09cc.md` at repo root) showed the investigation Gates behave
too brittly at runtime. A single compliant investigation (WI-0001) accumulated **11 gate failures**
across the Requirements Gate (investigation mode) and the Findings/Design Gate (investigation mode),
none of which reflected a substantive quality problem in the investigation. Every failure was caused
by an undocumented or overly literal parsing contract — exact bare headers, an `EV-` prefix that
appears nowhere in the contract, a verdict vocabulary narrower than the template, token *mentions*
counted as *declarations*, and a `sf_state_read` authority flag that reports replay-from-events even
when no event log existed.

Because the blocking issues did not name the exact expected header/format/vocabulary, the only way
forward was to reverse-engineer the parser. Under these gate-failure loops the `sf-orchestrator`
crossed the independence boundary defined in §14.7.2 / §14.7.5: it read `findings_report.md` and
dictated the exact hypothesis verdict tokens, the final root-cause status (`ROOT_CAUSE_PROBABLE` /
`ROOT_CAUSE_CONFIRMED` framing) and verbatim justification back to `sf-investigator`, instead of
returning the gate's structured `blocking_issues` for independent revision.

This bugfix covers two clusters:

- **A-cluster** — brittle / undocumented investigation gate contracts (defects P4, P5, P6, P7, P10).
- **D-cluster** — the orchestrator steering investigator conclusions (defect P9), which is partly
  *caused* by the A-cluster loops.

**Explicitly out of scope** (tracked separately): the Write Guard read-only false-positive (B) and
the daemon-down / HardStop deadlock (C).

This bugfix **loosens and clarifies parsing** and **documents the contracts**. It MUST NOT weaken the
substantive §14.7.2 root-cause credibility rules. The genuine investigation-credibility gate (≥2
distinct evidence for `ROOT_CAUSE_CONFIRMED`, no confirmation with unclosed/partial hypotheses,
single PREMISE/OBSERVER_EFFECT declaration, two-competing-hypotheses rule) must remain fully enforced.

Primary evidence used: `session-ses_09c5.md`, `session-ses_09cc.md`,
`packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts`,
`packages/daemon-core/src/tools/lib/sf_design_gate_core.ts`,
`setup/userlevel-opencode/agents/sf-investigator.md`, and standard §14.5.3 / §14.7.

## Bug Analysis

### Current Behavior (Defect)

**P4 — Section detection requires exact bare headers.**

1.1 WHEN an investigation document contains a required section whose header carries a trailing
parenthetical or annotation (e.g. `## 预期产出（执行阶段，非本 plan）`), THEN `parseSections` in
`sf_requirements_gate_core.ts` (anchored regex `^#{2,3}\s*${name}\s*$`) treats the section as absent
and the Requirements Gate returns `Missing section: 预期产出`, even though the section is present.

1.2 WHEN a findings report uses a decorated header for a required section (e.g.
`## 调查结论（直接回答原始问题）`), THEN `extractMarkdownSection` / `parseSections` used by
`checkFindingsReportContent` in `sf_design_gate_core.ts` reports the section as missing (observed:
`Missing section: 调查结论 / 事实与证据 / 调用链与首次偏离点 / 假设验证结果 / 因果链` in a report that
contained all of them), forcing a header-only rewrite.

**P5 — Token mention counted as declaration.**

1.3 WHEN an investigation plan *discusses* alternative PREMISE_* / OBSERVER_EFFECT_* states in prose
(e.g. a decision matrix explaining why one status was chosen over others), THEN
`checkInvestigationPlanContent` collects every `PREMISE_*` / `OBSERVER_EFFECT_*` token occurrence,
deduplicates them, requires exactly one, and fails with
`问题前提与观察者影响必须且只能声明一个合法 PREMISE/OBSERVER_EFFECT 状态` (observed: 3 distinct
OBSERVER_EFFECT tokens counted because alternatives were named in the body).

**P6 — Evidence-ID `EV-` prefix required but undocumented.**

1.4 WHEN a findings report cites evidence using `E1..E12`-style labels, THEN
`checkFindingsReportContent` matches only `\bEV-[A-Za-z0-9_-]+\b`, produces `evidence_ids: []`, and
fails `ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用（EV-*）`; the mandatory `EV-` prefix is
not documented in the `sf-investigator` contract or templates (`setup/userlevel-opencode/agents/sf-investigator.md`
mentions only "证据 ID 必须能回溯到真实证据", never the `EV-` form).

**P7 — Hypothesis-verdict vocabulary undocumented and inconsistent.**

1.5 WHEN a findings report labels a hypothesis with a verdict such as `FALSIFIED`, `REFUTED` or
`PARTIAL`, THEN the Findings Gate (which accepts only tokens matching
`confirmed|rejected|unknown|已确认|已排除|被推翻|未知|部分确认|partially_confirmed` adjacent to the
hypothesis ID) does not recognize the verdict and fails `假设 Hn 必须在同一结果项中给出明确判定`; the
accepted vocabulary is neither documented in the contract nor consistent with the template, which
only lists `confirmed / rejected / unknown`.

**P10 — `rebuilt_from_events` reports replay when no event log existed.**

1.6 WHEN `sf_state_read(all)` runs in a project that has no project-level
`runtime/events.jsonl` or `runtime/state.json`, THEN it returns `{"success": true,
"rebuilt_from_events": true, "work_items": {}}` — asserting the state was rebuilt from a replayed
event log even though no event log existed, which contradicts the authority flag's meaning.

**P9 (D-cluster) — Orchestrator eroding investigator independence.**

1.7 WHEN an investigation Gate fails, THEN under the resulting failure loops the `sf-orchestrator`
reads `findings_report.md` and dispatches revision prompts that prescribe the investigator's
conclusions — dictating which hypothesis verdict tokens to use, the exact final root-cause status
(e.g. "use `ROOT_CAUSE_PROBABLE` or a clearly-labeled UNKNOWN"), the premise status to declare, and
verbatim justification text — contrary to §14.7.2 / §14.7.5 (`不得预设期望结论 / 不代写专业产物`).

**Cross-cutting — blocking issues are not self-explanatory.**

1.8 WHEN any of the P4–P7 checks fail, THEN the Gate's `blocking_issues` do not name the exact
expected header token, evidence-ID format, or accepted verdict vocabulary, so the only way to pass is
to reverse-engineer the parser, which pushes agents toward gate-pleasing edits rather than
substantive fixes.

### Expected Behavior (Correct)

**P4 — Prefix / annotation-tolerant section detection.**

2.1 WHEN an investigation document contains a required section whose header text begins with the
canonical section name followed by a trailing parenthetical or annotation, THEN `parseSections` SHALL
match the section by treating the canonical name as a prefix of the header text (ignoring trailing
parentheticals/annotations) and SHALL NOT report it as missing.

2.2 WHEN a findings report uses a decorated header (canonical name plus trailing annotation) for a
required section, THEN `extractMarkdownSection` / the findings-report section detection SHALL match
the section by the same prefix/annotation-tolerant rule, so a report that contains all required
topics is not reported as missing sections.

**P5 — Only explicit declarations count.**

2.3 WHEN an investigation plan discusses alternative PREMISE_* / OBSERVER_EFFECT_* states in prose,
THEN `checkInvestigationPlanContent` SHALL count only an explicit declaration line (e.g. a
`PREMISE:` / `OBSERVER_EFFECT:` field or an equivalent marked declaration) toward the
single-declaration rule, so discussing alternatives in prose does not trip
`必须且只能声明一个合法 PREMISE/OBSERVER_EFFECT 状态`.

**P6 — Canonical evidence-ID form agreed and documented.**

2.4 WHEN a findings report cites evidence, THEN the system SHALL define a single canonical
evidence-ID form and make the `sf-investigator` contract, the templates, and the Findings Gate agree
on it, so that evidence written per the documented form is accepted and the `EV-*` requirement is no
longer undocumented.

**P7 — Verdict vocabulary documented and consistent.**

2.5 WHEN a findings report labels a hypothesis verdict, THEN the accepted verdict vocabulary SHALL be
documented in the `sf-investigator` contract and template, and the Findings Gate's accepted set SHALL
match that documentation exactly, so a verdict written per the documented vocabulary is recognized.

**P10 — Authority flag reflects reality.**

2.6 WHEN `sf_state_read(all)` runs in a project with no existing project-level event log, THEN it
SHALL report `rebuilt_from_events: false` (or an equivalently truthful flag), so the flag reflects
whether an event log actually existed and was replayed.

**P9 — Independent revision via structured feedback.**

2.7 WHEN an investigation Gate fails, THEN the `sf-orchestrator` SHALL return the Gate's structured
`blocking_issues` to `sf-investigator` for independent revision WITHOUT prescribing conclusions,
hypothesis verdicts, root-cause status, premise status, or justification text.

**Cross-cutting — self-explanatory blocking issues.**

2.8 WHEN a P4–P7 check fails, THEN the Gate's `blocking_issues` SHALL name the exact expected header
token, the canonical evidence-ID format, and/or the accepted verdict vocabulary, so revision does not
require reverse-engineering the parser.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a section header is matched by the new prefix/annotation-tolerant rule, THEN the section
SHALL CONTINUE TO end at the next same-or-higher-level heading (existing boundary behavior in
`parseSections` / `extractMarkdownSection` is preserved).

3.2 WHEN a required investigation section is genuinely absent (no header whose text starts with the
canonical name), THEN the Gate SHALL CONTINUE TO fail with `Missing section: <name>`.

3.3 WHEN a findings report asserts `ROOT_CAUSE_CONFIRMED`, THEN the Findings Gate SHALL CONTINUE TO
require at least two distinguishable original evidence references in the canonical evidence-ID form.

3.4 WHEN a findings report contains a partially confirmed or unclosed primary hypothesis
(`partially_confirmed` / `部分确认`), THEN the Findings Gate SHALL CONTINUE TO forbid
`ROOT_CAUSE_CONFIRMED`.

3.5 WHEN an investigation plan or findings report declares more than one PREMISE state or more than
one OBSERVER_EFFECT state via explicit declaration lines, THEN the Gate SHALL CONTINUE TO require
exactly one declared status of each kind.

3.6 WHEN an investigation plan declares fewer than two competing hypotheses without proving no second
reasonable hypothesis exists, THEN the Gate SHALL CONTINUE TO fail the two-competing-hypotheses rule.

3.7 WHEN the problem premise is `PREMISE_CONTRADICTED` / `PREMISE_NOT_REPRODUCED`, or the observer
effect is `OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE` / `OBSERVER_EFFECT_UNKNOWN`, without immutable
historical original evidence, THEN the Findings Gate SHALL CONTINUE TO forbid `ROOT_CAUSE_CONFIRMED`.

3.8 WHEN an investigation Gate passes, THEN the `sf-orchestrator` SHALL CONTINUE TO advance state,
run gates and coordinate the workflow exactly as before; the independence guarantee applies only to
how failures are fed back and MUST NOT block or alter legitimate orchestration on success.

3.9 WHEN `sf_state_read(all)` runs in a project that DOES have a project-level event log, THEN it
SHALL CONTINUE TO replay that log and report `rebuilt_from_events: true` with the correct
`work_items` contents.
