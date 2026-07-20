/**
 * Bug condition exploration property test — Property 2 (P5)
 * Only Explicit PREMISE / OBSERVER_EFFECT Declarations Count.
 *
 * **Validates: Requirements 2.3**
 *
 * BUG CONDITION (isBugCondition('declaration')): an investigation plan declares
 * exactly ONE OBSERVER_EFFECT status on an explicit declaration line
 * (`OBSERVER_EFFECT: OBSERVER_EFFECT_NONE`) while ALSO *mentioning* alternative
 * statuses (`OBSERVER_EFFECT_CONTROLLED`, `OBSERVER_EFFECT_UNKNOWN`) in a prose
 * decision matrix that explains why the chosen status was selected. The
 * `问题前提与观察者影响` section therefore contains exactly one real declaration.
 *
 * EXPECTED (fixed) BEHAVIOR: `checkInvestigationPlanContent` counts only the explicit
 * declaration line toward the single-declaration rule, so it does NOT raise
 * `问题前提与观察者影响必须且只能声明一个合法 OBSERVER_EFFECT 状态`.
 *
 * CRITICAL: This test is EXPECTED TO FAIL on the UNFIXED code. The unfixed gate uses
 * `matchAll` over the whole section body, so it counts the three distinct tokens
 * (NONE + CONTROLLED + UNKNOWN) and fails the single-declaration rule. That failure
 * confirms the bug exists (prose mentions are counted as declarations).
 * DO NOT fix the code or the test when it fails.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { checkInvestigationPlanContent } from "../../packages/daemon-core/src/tools/lib/sf_requirements_gate_core"

// ============================================================
// Constants
// ============================================================

/** The single-declaration blocking issue the fixed gate must NOT raise for one real declaration. */
const OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE =
  "问题前提与观察者影响必须且只能声明一个合法 OBSERVER_EFFECT 状态"

/** Alternative OBSERVER_EFFECT tokens that get *mentioned* (not declared) in the decision matrix. */
const OBSERVER_EFFECT_ALTERNATIVES = [
  "OBSERVER_EFFECT_CONTROLLED",
  "OBSERVER_EFFECT_UNKNOWN",
] as const

// ============================================================
// Generators
// ============================================================

/**
 * A non-empty subset of the alternative OBSERVER_EFFECT tokens to mention in prose.
 * The concrete WI-0001 counterexample mentions BOTH alternatives, so the default
 * generator always includes at least one alternative and often both.
 */
const proseAlternativesArb = fc
  .subarray([...OBSERVER_EFFECT_ALTERNATIVES], { minLength: 1 })

/**
 * Build a `问题前提与观察者影响` section that:
 *  - declares exactly ONE OBSERVER_EFFECT status on an explicit declaration line, and
 *  - *mentions* the given alternative tokens in a prose decision matrix explaining the choice.
 * A single valid PREMISE declaration keeps the premise rule out of the picture.
 */
function buildPremiseSection(proseAlternatives: readonly string[]): string {
  const matrixLines = proseAlternatives.map(
    (token) => `  - ${token}：已排除——当前复现未修改被观测对象，故不适用。`
  )
  return [
    "问题前提与观察者影响",
    "",
    "PREMISE: PREMISE_REPRODUCED",
    "OBSERVER_EFFECT: OBSERVER_EFFECT_NONE",
    "",
    "决策矩阵（说明为何选择 OBSERVER_EFFECT_NONE，其余状态仅作对比讨论，并非声明）：",
    ...matrixLines,
    "",
  ].join("\n")
}

// ============================================================
// Property Test
// ============================================================

describe("Property 2 (P5): only explicit OBSERVER_EFFECT declarations count", () => {
  it("counts one explicit OBSERVER_EFFECT declaration even when alternatives are named in prose (no single-declaration blocking issue)", () => {
    fc.assert(
      fc.property(proseAlternativesArb, (proseAlternatives) => {
        const premiseSection = buildPremiseSection(proseAlternatives)
        const sections: Record<string, string> = {
          问题前提与观察者影响: premiseSection,
        }

        const result = checkInvestigationPlanContent("", sections)

        // Expected (fixed) behavior: only the explicit `OBSERVER_EFFECT:` declaration
        // line counts, so the single-declaration rule is satisfied by the one real
        // declaration and must NOT be raised.
        expect(result.blocking_issues).not.toContain(
          OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE
        )
      }),
      { numRuns: 50 }
    )
  })

  it("concrete counterexample: OBSERVER_EFFECT_NONE declared once, CONTROLLED + UNKNOWN mentioned in a decision matrix", () => {
    const premiseSection = buildPremiseSection([...OBSERVER_EFFECT_ALTERNATIVES])
    const sections: Record<string, string> = {
      问题前提与观察者影响: premiseSection,
    }

    const result = checkInvestigationPlanContent("", sections)

    expect(result.blocking_issues).not.toContain(
      OBSERVER_EFFECT_SINGLE_DECLARATION_ISSUE
    )
  })
})
