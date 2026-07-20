/**
 * Preservation property test — Property 10
 * Partial / Unclosed Hypothesis Forbids `ROOT_CAUSE_CONFIRMED`.
 *
 * **Validates: Requirements 3.4**
 *
 * OBSERVED BASELINE BEHAVIOR (UNFIXED code): `checkFindingsReportContent`, when a
 * findings report asserts `ROOT_CAUSE_CONFIRMED` while its 假设验证结果 (hypothesis
 * verification) section contains a `partially_confirmed` / `部分确认` verdict, adds the
 * blocking issue `存在部分确认或未闭合的主要假设时不得声明 ROOT_CAUSE_CONFIRMED` and the
 * gate result is a failure. In other words, a partial / unclosed primary hypothesis
 * FORBIDS a `ROOT_CAUSE_CONFIRMED` declaration.
 *
 * This is a §14.7.2 credibility predicate that MUST NOT change: the P7 verdict-vocabulary
 * fix only changes which verdict tokens are recognized, never when confirmation is
 * forbidden. This preservation baseline is EXPECTED TO PASS on the UNFIXED code and must
 * keep passing after the fix.
 *
 * OBSERVATION-FIRST: the assertions below encode the behavior actually observed on the
 * current code, not an aspirational contract.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { checkFindingsReportContent } from "../../packages/daemon-core/src/tools/lib/sf_design_gate_core"

// ============================================================
// Constants
// ============================================================

/** The blocking issue raised when a partial / unclosed hypothesis coexists with confirmation. */
const PARTIAL_HYPOTHESIS_ISSUE =
  "存在部分确认或未闭合的主要假设时不得声明 ROOT_CAUSE_CONFIRMED"

// ============================================================
// Generators
// ============================================================

/**
 * Partial / unclosed verdict tokens that the gate recognizes as "partially confirmed".
 * These are exactly the tokens matched by the credibility predicate `/(partially_confirmed|部分确认)/i`.
 */
const partialVerdictArb = fc.constantFrom(
  "partially_confirmed",
  "Partially_Confirmed",
  "PARTIALLY_CONFIRMED",
  "部分确认"
)

/** The primary hypothesis identifier carrying the partial verdict. */
const hypothesisIdArb = fc.integer({ min: 1, max: 9 }).map((n) => `H${n}`)

/** Some free-form experimental-result prose so the section is otherwise well-formed. */
const experimentProseArb = fc.constantFrom(
  "实验结果：命令输出仅覆盖部分路径，尚未闭合。",
  "实际结果：日志证据只能部分支持该假设。",
  "actual result: partial evidence, hypothesis not fully closed."
)

// ============================================================
// Report builders
// ============================================================

/**
 * Build a 假设验证结果 section where the primary hypothesis carries a partial /
 * unclosed verdict, and a competing hypothesis is rejected (so the ≥2-hypotheses and
 * "must have a rejection" checks do not mask the partial-hypothesis predicate).
 */
function buildHypothesisSection(
  primaryId: string,
  competingId: string,
  partialVerdict: string,
  prose: string
): string {
  return [
    "### 假设验证结果",
    "",
    `- ${primaryId}：主假设——初始化顺序错误。判定：${partialVerdict}。${prose}证据 EV-001。`,
    `- ${competingId}：竞争假设——缓存未失效。判定：rejected。实验结果：命令输出排除该假设，证据 EV-002。`,
    "",
  ].join("\n")
}

/**
 * A findings report asserting ROOT_CAUSE_CONFIRMED. The root-cause status is read from
 * the full content via matchAll, so ROOT_CAUSE_CONFIRMED must appear here exactly once.
 */
function buildContent(hypothesisSection: string): string {
  return [
    "# Findings Report",
    "",
    "## 根因判定",
    "ROOT_CAUSE_CONFIRMED",
    "",
    "## 假设验证结果",
    hypothesisSection,
    "",
  ].join("\n")
}

// ============================================================
// Property Test
// ============================================================

describe("Property 10 (Preservation): partial / unclosed hypothesis forbids ROOT_CAUSE_CONFIRMED", () => {
  it("forbids ROOT_CAUSE_CONFIRMED when the hypothesis section contains a partial/unclosed verdict", () => {
    fc.assert(
      fc.property(
        partialVerdictArb,
        hypothesisIdArb,
        experimentProseArb,
        (partialVerdict, primaryId, prose) => {
          // Ensure a distinct competing hypothesis id.
          const competingId = primaryId === "H2" ? "H3" : "H2"
          const hypothesisSection = buildHypothesisSection(
            primaryId,
            competingId,
            partialVerdict,
            prose
          )
          const content = buildContent(hypothesisSection)
          const sections: Record<string, string> = {
            假设验证结果: hypothesisSection,
          }

          const result = checkFindingsReportContent(content, sections)

          // Baseline behavior to preserve: confirmation is forbidden and the specific
          // partial-hypothesis blocking issue is raised.
          expect(result.status).toBe("fail")
          expect(result.blocking_issues).toContain(PARTIAL_HYPOTHESIS_ISSUE)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("concrete baseline: a 部分确认 primary hypothesis under ROOT_CAUSE_CONFIRMED is rejected", () => {
    const hypothesisSection = buildHypothesisSection(
      "H1",
      "H2",
      "部分确认",
      "实验结果：证据仅部分支持。"
    )
    const content = buildContent(hypothesisSection)
    const sections: Record<string, string> = {
      假设验证结果: hypothesisSection,
    }

    const result = checkFindingsReportContent(content, sections)

    expect(result.status).toBe("fail")
    expect(result.blocking_issues).toContain(PARTIAL_HYPOTHESIS_ISSUE)
  })
})
