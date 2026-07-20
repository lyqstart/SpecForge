/**
 * Preservation property test — Property 11
 * Single PREMISE / OBSERVER_EFFECT explicit-declaration rule.
 *
 * **Validates: Requirements 3.5**
 *
 * PRESERVATION BASELINE (observation-first): This test captures behavior that MUST
 * NOT change across the P5 fix. It MUST PASS on the current UNFIXED code and keep
 * passing after the fix.
 *
 * The §14.7.2 credibility rule requires that a `问题前提与观察者影响` section declare
 * EXACTLY ONE legal PREMISE status and EXACTLY ONE legal OBSERVER_EFFECT status. When a
 * document makes MORE THAN ONE explicit declaration of either kind, the gate must still
 * fail with the corresponding single-declaration blocking issue.
 *
 * OBSERVED behavior on the UNFIXED code (`checkInvestigationPlanContent`):
 *   - It `matchAll`s PREMISE_* / OBSERVER_EFFECT_* tokens over the whole section body,
 *     dedupes them (via a Set), and requires the DISTINCT count to be exactly one.
 *   - So two distinct PREMISE tokens ⇒ raises the PREMISE single-declaration issue;
 *     two distinct OBSERVER_EFFECT tokens ⇒ raises the OBSERVER_EFFECT one; exactly one
 *     distinct token of a kind ⇒ no issue for that kind.
 *
 * COMPLEMENTS the P5 fix: the P5 fix changes only *what counts* as a declaration
 * (explicit `PREMISE:` / `OBSERVER_EFFECT:` declaration LINES vs prose mentions), never
 * *how many* are required. To stay valid across both the unfixed (distinct-token) and
 * fixed (declaration-line) implementations, this test uses explicit declaration LINES
 * each carrying a DISTINCT status token, so the declaration-line count and the
 * distinct-token count agree by construction.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { checkInvestigationPlanContent } from "../../packages/daemon-core/src/tools/lib/sf_requirements_gate_core"

// ============================================================
// Constants
// ============================================================

/** Blocking issue raised when the PREMISE single-declaration rule is violated. */
const PREMISE_SINGLE_DECLARATION_ISSUE =
  "问题前提与观察者影响必须且只能声明一个合法 PREMISE 状态"

/** Blocking issue raised when the OBSERVER_EFFECT single-declaration rule is violated. */
const OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE =
  "问题前提与观察者影响必须且只能声明一个合法 OBSERVER_EFFECT 状态"

/** The four legal PREMISE status tokens recognized by the gate. */
const PREMISE_STATUSES = [
  "PREMISE_REPRODUCED",
  "PREMISE_HISTORICALLY_EVIDENCED",
  "PREMISE_CONTRADICTED",
  "PREMISE_NOT_REPRODUCED",
] as const

/** The four legal OBSERVER_EFFECT status tokens recognized by the gate. */
const OBSERVER_EFFECT_STATUSES = [
  "OBSERVER_EFFECT_NONE",
  "OBSERVER_EFFECT_CONTROLLED",
  "OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE",
  "OBSERVER_EFFECT_UNKNOWN",
] as const

// ============================================================
// Generators
// ============================================================

/** A non-empty subset (distinct tokens) of the legal PREMISE statuses. */
const premiseStatusesArb = fc.subarray([...PREMISE_STATUSES], { minLength: 1 })

/** A non-empty subset (distinct tokens) of the legal OBSERVER_EFFECT statuses. */
const observerStatusesArb = fc.subarray([...OBSERVER_EFFECT_STATUSES], { minLength: 1 })

/**
 * Build a `问题前提与观察者影响` section with one explicit declaration LINE per
 * supplied status token. Each declaration is a distinct status, so the number of
 * declaration lines equals the number of distinct tokens.
 */
function buildPremiseSection(
  premiseTokens: readonly string[],
  observerTokens: readonly string[]
): string {
  const lines = [
    "问题前提与观察者影响",
    "",
    ...premiseTokens.map((token) => `PREMISE: ${token}`),
    ...observerTokens.map((token) => `OBSERVER_EFFECT: ${token}`),
    "",
  ]
  return lines.join("\n")
}

// ============================================================
// Property Test
// ============================================================

describe("Property 11 (preservation): single PREMISE / OBSERVER_EFFECT explicit-declaration rule", () => {
  it("requires exactly one declared status of each kind: 2+ explicit declarations still fail, exactly one still passes", () => {
    fc.assert(
      fc.property(premiseStatusesArb, observerStatusesArb, (premiseTokens, observerTokens) => {
        const premiseSection = buildPremiseSection(premiseTokens, observerTokens)
        const sections: Record<string, string> = {
          问题前提与观察者影响: premiseSection,
        }

        const result = checkInvestigationPlanContent("", sections)

        // PREMISE: more than one explicit declaration must still fail; exactly one must not.
        if (premiseTokens.length === 1) {
          expect(result.blocking_issues).not.toContain(PREMISE_SINGLE_DECLARATION_ISSUE)
        } else {
          expect(result.blocking_issues).toContain(PREMISE_SINGLE_DECLARATION_ISSUE)
        }

        // OBSERVER_EFFECT: same rule, independently.
        if (observerTokens.length === 1) {
          expect(result.blocking_issues).not.toContain(OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE)
        } else {
          expect(result.blocking_issues).toContain(OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("concrete: two distinct PREMISE declarations fail the single-declaration rule", () => {
    const sections: Record<string, string> = {
      问题前提与观察者影响: buildPremiseSection(
        ["PREMISE_REPRODUCED", "PREMISE_HISTORICALLY_EVIDENCED"],
        ["OBSERVER_EFFECT_NONE"]
      ),
    }
    const result = checkInvestigationPlanContent("", sections)
    expect(result.blocking_issues).toContain(PREMISE_SINGLE_DECLARATION_ISSUE)
    expect(result.blocking_issues).not.toContain(OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE)
  })

  it("concrete: two distinct OBSERVER_EFFECT declarations fail the single-declaration rule", () => {
    const sections: Record<string, string> = {
      问题前提与观察者影响: buildPremiseSection(
        ["PREMISE_REPRODUCED"],
        ["OBSERVER_EFFECT_NONE", "OBSERVER_EFFECT_CONTROLLED"]
      ),
    }
    const result = checkInvestigationPlanContent("", sections)
    expect(result.blocking_issues).toContain(OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE)
    expect(result.blocking_issues).not.toContain(PREMISE_SINGLE_DECLARATION_ISSUE)
  })

  it("concrete: exactly one declaration of each kind satisfies the single-declaration rule", () => {
    const sections: Record<string, string> = {
      问题前提与观察者影响: buildPremiseSection(
        ["PREMISE_REPRODUCED"],
        ["OBSERVER_EFFECT_NONE"]
      ),
    }
    const result = checkInvestigationPlanContent("", sections)
    expect(result.blocking_issues).not.toContain(PREMISE_SINGLE_DECLARATION_ISSUE)
    expect(result.blocking_issues).not.toContain(OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE)
  })
})
