/* eslint-disable */
/**
 * Preservation property test — Property 14
 * Legitimate Orchestration on Gate Success.
 *
 * **Validates: Requirements 3.8**
 *
 * PRESERVATION BASELINE (observation-first): This test captures behavior that MUST NOT
 * change across the P9 fix. It MUST PASS on the current UNFIXED steering and keep passing
 * after the fix.
 *
 * The P9 fix (task 16.8) enforces orchestrator independence ONLY on investigation-gate
 * FAILURE: on failure the `sf-orchestrator` must relay the gate's structured
 * `blocking_issues` untouched and must not prescribe conclusions. The independence
 * guarantee MUST NOT block or alter legitimate orchestration on gate SUCCESS: on gate
 * PASS the orchestrator still advances state, runs gates, and coordinates the workflow
 * exactly as before (§14.7.2 / §14.7.5 boundary applies to failure feedback only).
 *
 * OBSERVED success-path orchestration on the UNFIXED steering
 * (`setup/userlevel-opencode/agents/sf-orchestrator.md`):
 *   1. State advancement for non-sealing transitions goes through `sf_state_transition`.
 *   2. Gates run through the unified `sf_gate_run`; the gate runner collapses
 *      `gates_running` into `approval_required` (success) or `gates_failed` (failure).
 *   3. On gate PASS, decisions are recorded via `sf_user_decision_record`.
 *   4. After approval, the merge runs via `sf_merge_run`, then the post-merge gate runs
 *      through `sf_gate_run` again.
 *   5. For Investigation specifically, the gate result is what advances the workflow: the
 *      "do NOT proceed" restriction is scoped to the NON-pass case, so a passing gate is
 *      what permits proceeding to `findings_report.md` / the Findings Gate.
 *
 * These are the success-path coordination behaviors the P9 fix must preserve. This test
 * asserts they are present now (baseline) and — via a formatting-invariance property —
 * that their detection is a structural invariant of the steering, not an artifact of
 * exact whitespace. The P9 fix only ADDS failure-path prohibitions, so these assertions
 * keep passing after the fix.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "../..")
const ORCHESTRATOR_STEERING = resolve(
  REPO_ROOT,
  "setup/userlevel-opencode/agents/sf-orchestrator.md"
)

function readSteering(): string {
  return readFileSync(ORCHESTRATOR_STEERING, "utf8")
}

// ============================================================
// Observable surface — success-path orchestration predicates
// ============================================================

/** (1) Non-sealing state advancement is requested through `sf_state_transition`. */
function advancesStateViaTransition(text: string): boolean {
  return /sf_state_transition/.test(text)
}

/** (2) Gates are executed through the unified `sf_gate_run` runner. */
function runsGatesViaUnifiedRunner(text: string): boolean {
  return /sf_gate_run/.test(text)
}

/**
 * (2) The gate runner collapses `gates_running` into a SUCCESS target
 * (`approval_required`) or a FAILURE target (`gates_failed`). The success target proves
 * the gate-pass advancement path exists.
 */
function gateRunCollapsesToSuccessOrFailure(text: string): boolean {
  return /gates_running[\s\S]{0,40}approval_required[\s\S]{0,20}gates_failed/.test(text)
}

/** (3) On gate PASS, decisions are recorded via `sf_user_decision_record`. */
function onGatePassRecordsDecision(text: string): boolean {
  return /门禁通过后[\s\S]{0,60}sf_user_decision_record/.test(text)
}

/** (4) After approval, the merge runs via `sf_merge_run`. */
function afterApprovalRunsMerge(text: string): boolean {
  return /批准后[\s\S]{0,20}sf_merge_run/.test(text)
}

/**
 * (5) Investigation success path: the "do NOT proceed" restriction is scoped to the
 * NON-pass case (未返回 `pass` 时 … 禁止 … 生成 `findings_report.md`), so a PASS is what
 * permits proceeding to the findings report / Findings Gate. This confirms the gate
 * result is what advances the investigation workflow.
 */
function investigationPassGatesForwardProgress(text: string): boolean {
  return /Investigation Requirements Gate\s*未返回\s*`?pass`?\s*时[\s\S]{0,120}findings_report\.md/.test(
    text
  )
}

/** All success-path orchestration behaviors observed on the baseline steering. */
function successPathOrchestrationIntact(text: string): boolean {
  return (
    advancesStateViaTransition(text) &&
    runsGatesViaUnifiedRunner(text) &&
    gateRunCollapsesToSuccessOrFailure(text) &&
    onGatePassRecordsDecision(text) &&
    afterApprovalRunsMerge(text) &&
    investigationPassGatesForwardProgress(text)
  )
}

// ============================================================
// Part A — baseline: success-path orchestration is present & unchanged
// ============================================================

describe("Property 14 (preservation): legitimate orchestration on gate success", () => {
  it("advances non-sealing state through sf_state_transition", () => {
    expect(advancesStateViaTransition(readSteering())).toBe(true)
  })

  it("runs gates through the unified sf_gate_run runner", () => {
    expect(runsGatesViaUnifiedRunner(readSteering())).toBe(true)
  })

  it("collapses gates_running into approval_required (success) or gates_failed (failure)", () => {
    expect(gateRunCollapsesToSuccessOrFailure(readSteering())).toBe(true)
  })

  it("records the decision via sf_user_decision_record once the gate passes", () => {
    expect(onGatePassRecordsDecision(readSteering())).toBe(true)
  })

  it("runs the merge via sf_merge_run after approval", () => {
    expect(afterApprovalRunsMerge(readSteering())).toBe(true)
  })

  it("lets a passing investigation gate advance to findings_report.md / the Findings Gate", () => {
    expect(investigationPassGatesForwardProgress(readSteering())).toBe(true)
  })

  it("preserves the full success-path orchestration chain (state advance → gate run → decision → merge)", () => {
    expect(successPathOrchestrationIntact(readSteering())).toBe(true)
  })
})

// ============================================================
// Part B — property: success-path detection is a structural invariant
// ============================================================

/**
 * Benign, content-preserving formatting transforms. None of these change the substantive
 * steering content, so the success-path orchestration must remain detectable regardless.
 * This demonstrates the baseline is an invariant of the steering's meaning, not an
 * artifact of exact whitespace/line endings.
 */
const formattingTransformArb = fc.record({
  crlf: fc.boolean(), // convert LF -> CRLF
  trailingSpaces: fc.boolean(), // append trailing spaces to each line
  extraBlankLines: fc.boolean(), // insert extra blank lines between lines
})

function applyFormatting(
  text: string,
  opts: { crlf: boolean; trailingSpaces: boolean; extraBlankLines: boolean }
): string {
  let lines = text.split(/\r?\n/)
  if (opts.trailingSpaces) lines = lines.map(l => l + "   ")
  let joined = lines.join(opts.extraBlankLines ? "\n\n" : "\n")
  if (opts.crlf) joined = joined.replace(/\n/g, "\r\n")
  return joined
}

describe("Property 14 (preservation): success-path orchestration survives benign formatting", () => {
  it("detects the success-path orchestration chain under content-preserving formatting variations", () => {
    const steering = readSteering()
    fc.assert(
      fc.property(formattingTransformArb, opts => {
        const reformatted = applyFormatting(steering, opts)
        // The success-path chain is a structural invariant: benign formatting changes must
        // never make legitimate gate-success orchestration disappear.
        expect(successPathOrchestrationIntact(reformatted)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
