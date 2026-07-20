/**
 * Bug condition exploration property test — Property 4 (P7)
 * Documented Verdict Vocabulary Recognized.
 *
 * **Validates: Requirements 2.5**
 *
 * BUG CONDITION (isBugCondition('verdict')): a findings report labels a hypothesis
 * verdict using a token that belongs to the documented verdict vocabulary
 * (rejection synonyms `falsified` / `refuted`, partial synonym `partial`), yet the
 * Findings Gate does not recognize it and fails with
 * `假设 H2 必须在同一结果项中给出明确判定`.
 *
 * EXPECTED (fixed) BEHAVIOR: the verdict is recognized as a valid judgement, so the
 * gate does NOT raise the "must give an explicit verdict" blocking issue for H2.
 *
 * CRITICAL: This test is EXPECTED TO FAIL on the UNFIXED code. The failure confirms
 * the bug exists (the gate's accepted set diverges from the documented template
 * `confirmed / rejected / unknown`). DO NOT fix the code or the test when it fails.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { checkFindingsReportContent } from "../../packages/daemon-core/src/tools/lib/sf_design_gate_core"

// ============================================================
// Generators
// ============================================================

/**
 * Verdict tokens that the documented vocabulary treats as valid rejection / partial
 * judgements but that the UNFIXED gate does not recognize.
 * (P7 counterexamples surfaced during acceptance testing: FALSIFIED / REFUTED / PARTIAL.)
 */
const documentedVerdictArb = fc.constantFrom(
  "FALSIFIED",
  "REFUTED",
  "PARTIAL",
  "falsified",
  "refuted",
  "partial",
  "Falsified",
  "Refuted",
  "Partial"
)

/**
 * Build a substantively-valid 假设验证结果 (hypothesis verification) section where the
 * primary hypothesis H1 carries a recognized verdict and H2 carries the documented
 * verdict token under test. Two competing hypotheses satisfy the ≥2 rule, and the
 * section records an actual experimental result.
 */
function buildHypothesisSection(h2Verdict: string): string {
  return [
    "### 假设验证结果",
    "",
    "- H1：主假设——认为初始化顺序错误。判定：rejected。实验结果：命令输出显示顺序正确，证据 EV-001。",
    `- H2：竞争假设——认为缓存未失效。判定：${h2Verdict}。实际结果：日志证据表明缓存已失效，证据 EV-002。`,
    "",
  ].join("\n")
}

/**
 * A minimal findings-report content string. The verdict-recognition logic reads the
 * pre-parsed 假设验证结果 section, so the full content only needs to be well-formed
 * enough to exercise the code path.
 */
function buildContent(hypothesisSection: string): string {
  return [
    "# Findings Report",
    "",
    "## 根因判定",
    "ROOT_CAUSE_PROBABLE",
    "",
    "## 假设验证结果",
    hypothesisSection,
    "",
  ].join("\n")
}

const H2_MISSING_VERDICT_ISSUE = "假设 H2 必须在同一结果项中给出明确判定"

// ============================================================
// Property Test
// ============================================================

describe("Property 4 (P7): documented verdict vocabulary recognized", () => {
  it("recognizes documented rejection/partial verdicts on a hypothesis line (no 'missing verdict' blocking issue for H2)", () => {
    fc.assert(
      fc.property(documentedVerdictArb, (verdict) => {
        const hypothesisSection = buildHypothesisSection(verdict)
        const content = buildContent(hypothesisSection)
        const sections: Record<string, string> = {
          假设验证结果: hypothesisSection,
        }

        const result = checkFindingsReportContent(content, sections)

        // Expected (fixed) behavior: the documented verdict is recognized, so H2 is
        // NOT flagged as missing an explicit judgement.
        expect(result.blocking_issues).not.toContain(H2_MISSING_VERDICT_ISSUE)
      }),
      { numRuns: 50 }
    )
  })

  it("concrete counterexample: H2 … FALSIFIED is recognized as a valid judgement", () => {
    const hypothesisSection = buildHypothesisSection("FALSIFIED")
    const content = buildContent(hypothesisSection)
    const sections: Record<string, string> = {
      假设验证结果: hypothesisSection,
    }

    const result = checkFindingsReportContent(content, sections)

    expect(result.blocking_issues).not.toContain(H2_MISSING_VERDICT_ISSUE)
  })
})
