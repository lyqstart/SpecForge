/**
 * Preservation property test — Property 13
 * Premise / Observer-Effect Gating of `ROOT_CAUSE_CONFIRMED`.
 *
 * **Validates: Requirements 3.7**
 *
 * PRESERVATION BASELINE (observation-first): this test captures a §14.7.2 credibility
 * predicate that MUST NOT change. It is written to PASS on the CURRENT (UNFIXED) code and
 * to keep passing after the fix.
 *
 * OBSERVED CURRENT BEHAVIOR of `checkFindingsReportContent` when a findings report asserts
 * `ROOT_CAUSE_CONFIRMED` (statuses are read from the `问题前提与证据完整性` section):
 *
 *   - PREMISE gate: unless the single declared PREMISE status is `PREMISE_REPRODUCED` or
 *     `PREMISE_HISTORICALLY_EVIDENCED`, the gate raises
 *     `问题前提未复现且无不可变历史原证据时不得声明 ROOT_CAUSE_CONFIRMED`. Concretely this
 *     fires for `PREMISE_CONTRADICTED` and `PREMISE_NOT_REPRODUCED`.
 *
 *   - OBSERVER-EFFECT gate: when the declared OBSERVER_EFFECT status is
 *     `OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE` or `OBSERVER_EFFECT_UNKNOWN` AND the premise
 *     is NOT `PREMISE_HISTORICALLY_EVIDENCED` (no immutable historical original evidence),
 *     the gate raises
 *     `现场在原始取证前已被改变或观察者影响未知，且无历史原证据时不得声明 ROOT_CAUSE_CONFIRMED`.
 *
 * In both gated states the gate result is a failure — confirmation is forbidden.
 *
 * This is a §14.7.2 credibility predicate: the fix in this spec only changes *what counts*
 * as a section header / declaration / evidence ID / verdict token, never *when* confirmation
 * is forbidden. The assertions below encode the behavior actually observed on the current
 * (UNFIXED) code and must keep passing after the fix.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { checkFindingsReportContent } from "../../packages/daemon-core/src/tools/lib/sf_design_gate_core"
import type { GateResult } from "../../packages/daemon-core/src/tools/lib/sf_design_gate_core"

// ============================================================
// Constants
// ============================================================

/** Blocking issue raised by the PREMISE gate. */
const PREMISE_ISSUE =
  "问题前提未复现且无不可变历史原证据时不得声明 ROOT_CAUSE_CONFIRMED"

/** Blocking issue raised by the OBSERVER-EFFECT gate. */
const OBSERVER_ISSUE =
  "现场在原始取证前已被改变或观察者影响未知，且无历史原证据时不得声明 ROOT_CAUSE_CONFIRMED"

type PremiseStatus =
  | "PREMISE_REPRODUCED"
  | "PREMISE_HISTORICALLY_EVIDENCED"
  | "PREMISE_CONTRADICTED"
  | "PREMISE_NOT_REPRODUCED"

type ObserverStatus =
  | "OBSERVER_EFFECT_NONE"
  | "OBSERVER_EFFECT_CONTROLLED"
  | "OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE"
  | "OBSERVER_EFFECT_UNKNOWN"

const PREMISE_STATUSES: readonly PremiseStatus[] = [
  "PREMISE_REPRODUCED",
  "PREMISE_HISTORICALLY_EVIDENCED",
  "PREMISE_CONTRADICTED",
  "PREMISE_NOT_REPRODUCED",
]

const OBSERVER_STATUSES: readonly ObserverStatus[] = [
  "OBSERVER_EFFECT_NONE",
  "OBSERVER_EFFECT_CONTROLLED",
  "OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE",
  "OBSERVER_EFFECT_UNKNOWN",
]

// ============================================================
// Expected gating predicates (mirror of the observed source behavior)
// ============================================================

/** Premise gate fires unless the premise is reproduced or historically evidenced. */
function premiseGated(premise: PremiseStatus): boolean {
  return !["PREMISE_REPRODUCED", "PREMISE_HISTORICALLY_EVIDENCED"].includes(premise)
}

/**
 * Observer-effect gate fires when the scene was changed / observer effect is unknown AND
 * there is no immutable historical original evidence (premise !== HISTORICALLY_EVIDENCED).
 */
function observerGated(premise: PremiseStatus, observer: ObserverStatus): boolean {
  return (
    ["OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE", "OBSERVER_EFFECT_UNKNOWN"].includes(observer) &&
    premise !== "PREMISE_HISTORICALLY_EVIDENCED"
  )
}

// ============================================================
// Report builders
// ============================================================

/**
 * Build the `问题前提与证据完整性` section declaring exactly one PREMISE status and exactly
 * one OBSERVER_EFFECT status (so the single-declaration rule extracts them deterministically).
 */
function buildPremiseSection(premise: PremiseStatus, observer: ObserverStatus): string {
  return [
    "### 问题前提与证据完整性",
    "",
    `- PREMISE: ${premise}`,
    `- OBSERVER_EFFECT: ${observer}`,
    "问题前提与观察者影响已在原始取证条件下记录。",
    "",
  ].join("\n")
}

/**
 * A findings report asserting ROOT_CAUSE_CONFIRMED. Root-cause status is read from the full
 * content via matchAll, so ROOT_CAUSE_CONFIRMED must appear here exactly once. The premise
 * section is also embedded so the whole document is coherent, but the gate reads it from the
 * `sections` map.
 */
function buildContent(premiseSection: string): string {
  return [
    "# Findings Report",
    "",
    "## 根因判定",
    "ROOT_CAUSE_CONFIRMED",
    "",
    "## 问题前提与证据完整性",
    premiseSection,
    "",
  ].join("\n")
}

function runGate(premise: PremiseStatus, observer: ObserverStatus): GateResult {
  const premiseSection = buildPremiseSection(premise, observer)
  return checkFindingsReportContent(buildContent(premiseSection), {
    问题前提与证据完整性: premiseSection,
  })
}

function raisesPremiseIssue(result: GateResult): boolean {
  return result.blocking_issues.some(issue => issue.includes(PREMISE_ISSUE))
}

function raisesObserverIssue(result: GateResult): boolean {
  return result.blocking_issues.some(issue => issue.includes(OBSERVER_ISSUE))
}

// ============================================================
// Property Tests
// ============================================================

describe("Property 13 (preservation): premise / observer-effect gating of ROOT_CAUSE_CONFIRMED", () => {
  it("raises the premise blocking issue iff the premise is contradicted / not reproduced", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PREMISE_STATUSES),
        fc.constantFrom(...OBSERVER_STATUSES),
        (premise, observer) => {
          const result = runGate(premise, observer)
          expect(raisesPremiseIssue(result)).toBe(premiseGated(premise))
        }
      ),
      { numRuns: 200 }
    )
  })

  it("raises the observer-effect blocking issue iff the scene changed / unknown without historical evidence", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PREMISE_STATUSES),
        fc.constantFrom(...OBSERVER_STATUSES),
        (premise, observer) => {
          const result = runGate(premise, observer)
          expect(raisesObserverIssue(result)).toBe(observerGated(premise, observer))
        }
      ),
      { numRuns: 200 }
    )
  })

  it("forbids ROOT_CAUSE_CONFIRMED (fails) whenever a premise or observer-effect gate fires", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PREMISE_STATUSES),
        fc.constantFrom(...OBSERVER_STATUSES),
        (premise, observer) => {
          if (!premiseGated(premise) && !observerGated(premise, observer)) {
            return // only assert on the gated states
          }
          const result = runGate(premise, observer)
          expect(result.status).toBe("fail")
        }
      ),
      { numRuns: 200 }
    )
  })

  // ----------------------------------------------------------
  // Concrete baselines
  // ----------------------------------------------------------

  it("concrete: PREMISE_CONTRADICTED forbids confirmation via the premise gate", () => {
    const result = runGate("PREMISE_CONTRADICTED", "OBSERVER_EFFECT_NONE")
    expect(raisesPremiseIssue(result)).toBe(true)
    expect(result.status).toBe("fail")
  })

  it("concrete: PREMISE_NOT_REPRODUCED forbids confirmation via the premise gate", () => {
    const result = runGate("PREMISE_NOT_REPRODUCED", "OBSERVER_EFFECT_CONTROLLED")
    expect(raisesPremiseIssue(result)).toBe(true)
    expect(result.status).toBe("fail")
  })

  it("concrete: OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE without historical evidence forbids confirmation", () => {
    const result = runGate("PREMISE_REPRODUCED", "OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE")
    expect(raisesObserverIssue(result)).toBe(true)
    expect(result.status).toBe("fail")
  })

  it("concrete: OBSERVER_EFFECT_UNKNOWN without historical evidence forbids confirmation", () => {
    const result = runGate("PREMISE_REPRODUCED", "OBSERVER_EFFECT_UNKNOWN")
    expect(raisesObserverIssue(result)).toBe(true)
    expect(result.status).toBe("fail")
  })

  it("concrete: PREMISE_HISTORICALLY_EVIDENCED exempts the observer-effect gate", () => {
    const result = runGate("PREMISE_HISTORICALLY_EVIDENCED", "OBSERVER_EFFECT_UNKNOWN")
    expect(raisesObserverIssue(result)).toBe(false)
    expect(raisesPremiseIssue(result)).toBe(false)
  })
})
