/**
 * Preservation property test — Property 12
 * Two-competing-hypotheses rule.
 *
 * **Validates: Requirements 3.6**
 *
 * PRESERVATION BASELINE (observation-first): This test captures behavior that MUST
 * NOT change across the fix. It MUST PASS on the current UNFIXED code and keep
 * passing after the fix.
 *
 * The §14.7.2 credibility rule requires that an investigation plan declare at least
 * TWO competing hypotheses, OR explicitly justify the documented single-hypothesis
 * exception. When a plan declares FEWER than two competing hypotheses without that
 * exception, the gate must still fail with the two-competing-hypotheses blocking issue.
 *
 * OBSERVED behavior on the UNFIXED code (`checkInvestigationPlanContent`):
 *   - It extracts hypothesis IDs from the `候选假设` section via `\bH\d+\b` (case
 *     insensitive), uppercases them, and dedupes them (via a Set) to a DISTINCT count.
 *   - It raises the blocking issue
 *     `调查计划必须包含至少两个合理竞争假设，或明确证明客观上不存在第二个合理假设`
 *     when the distinct count is `< 2` AND the section does NOT contain the documented
 *     single-hypothesis exception phrase (`不存在第二个合理假设` /
 *     `single-hypothesis exception`).
 *   - So 0 or 1 distinct hypothesis (no exception) ⇒ the rule fires; ≥2 distinct
 *     hypotheses ⇒ the rule does not fire; 1 hypothesis WITH the exception phrase ⇒
 *     the rule does not fire.
 *
 * This test asserts ONLY the two-competing-hypotheses rule fires/does-not-fire as
 * observed; other blocking issues raised by the gate are irrelevant to this property.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { checkInvestigationPlanContent } from "../../packages/daemon-core/src/tools/lib/sf_requirements_gate_core"

// ============================================================
// Constants
// ============================================================

/** Blocking issue raised when the two-competing-hypotheses rule is violated. */
const TWO_HYPOTHESES_ISSUE =
  "调查计划必须包含至少两个合理竞争假设，或明确证明客观上不存在第二个合理假设"

/** Documented single-hypothesis exception phrases that suppress the rule. */
const EXCEPTION_PHRASES = [
  "经分析客观上不存在第二个合理假设，故仅提出单一假设。",
  "This investigation qualifies for the documented single-hypothesis exception.",
] as const

// ============================================================
// Generators
// ============================================================

/**
 * A set of DISTINCT hypothesis IDs (H1, H2, ...) of size 1..6. Because the gate
 * dedupes IDs, using distinct integers makes the declared count equal the distinct
 * count by construction, exercising both the `< 2` and `>= 2` branches.
 */
const distinctHypothesisIdsArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 99 }), { minLength: 1, maxLength: 6 })
  .map((nums) => nums.map((n) => `H${n}`))

/** One of the documented single-hypothesis exception phrases. */
const exceptionPhraseArb = fc.constantFrom(...EXCEPTION_PHRASES)

/**
 * Build a `候选假设` section listing one bullet per hypothesis ID, optionally
 * appending a documented single-hypothesis exception justification.
 */
function buildHypothesisSection(
  ids: readonly string[],
  exceptionPhrase?: string
): string {
  const lines = [
    "候选假设",
    "",
    ...ids.map(
      (id, i) => `- ${id}: 竞争假设描述 ${i + 1}，可能导致该问题的一个原因。`
    ),
  ]
  if (exceptionPhrase !== undefined) {
    lines.push("", exceptionPhrase)
  }
  lines.push("")
  return lines.join("\n")
}

// ============================================================
// Property Tests
// ============================================================

describe("Property 12 (preservation): two-competing-hypotheses rule", () => {
  it("fires when fewer than two competing hypotheses are declared (no exception), and not when two or more are declared", () => {
    fc.assert(
      fc.property(distinctHypothesisIdsArb, (ids) => {
        const sections: Record<string, string> = {
          候选假设: buildHypothesisSection(ids),
        }

        const result = checkInvestigationPlanContent("", sections)

        const distinctCount = new Set(ids.map((id) => id.toUpperCase())).size
        if (distinctCount < 2) {
          expect(result.blocking_issues).toContain(TWO_HYPOTHESES_ISSUE)
        } else {
          expect(result.blocking_issues).not.toContain(TWO_HYPOTHESES_ISSUE)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("does not fire for a single hypothesis when the documented single-hypothesis exception is present", () => {
    fc.assert(
      fc.property(exceptionPhraseArb, (exceptionPhrase) => {
        const sections: Record<string, string> = {
          候选假设: buildHypothesisSection(["H1"], exceptionPhrase),
        }

        const result = checkInvestigationPlanContent("", sections)

        expect(result.blocking_issues).not.toContain(TWO_HYPOTHESES_ISSUE)
      }),
      { numRuns: 20 }
    )
  })

  it("concrete: a single hypothesis without exception fails the two-competing-hypotheses rule", () => {
    const sections: Record<string, string> = {
      候选假设: buildHypothesisSection(["H1"]),
    }
    const result = checkInvestigationPlanContent("", sections)
    expect(result.blocking_issues).toContain(TWO_HYPOTHESES_ISSUE)
  })

  it("concrete: zero hypotheses (empty section) fails the two-competing-hypotheses rule", () => {
    const sections: Record<string, string> = {
      候选假设: "候选假设\n\n（尚未提出任何假设）\n",
    }
    const result = checkInvestigationPlanContent("", sections)
    expect(result.blocking_issues).toContain(TWO_HYPOTHESES_ISSUE)
  })

  it("concrete: two competing hypotheses satisfy the two-competing-hypotheses rule", () => {
    const sections: Record<string, string> = {
      候选假设: buildHypothesisSection(["H1", "H2"]),
    }
    const result = checkInvestigationPlanContent("", sections)
    expect(result.blocking_issues).not.toContain(TWO_HYPOTHESES_ISSUE)
  })
})
