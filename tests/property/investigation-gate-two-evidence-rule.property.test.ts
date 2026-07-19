/**
 * Preservation property test — Property 9
 * ≥2 Distinguishable Evidence for `ROOT_CAUSE_CONFIRMED`.
 *
 * **Validates: Requirements 3.3**
 *
 * PRESERVATION BASELINE (observation-first): this test captures a §14.7.2 credibility
 * predicate that MUST NOT change. It is written to PASS on the CURRENT (UNFIXED) code and
 * to keep passing after the fix.
 *
 * OBSERVED CURRENT BEHAVIOR: under `ROOT_CAUSE_CONFIRMED`, `checkFindingsReportContent`
 * extracts the DISTINCT `EV-*` references from the `事实与证据` section
 * (`\bEV-[A-Za-z0-9_-]+\b`, de-duplicated) and raises the blocking issue
 * `ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用…` whenever fewer than two
 * distinguishable references are present. With two or more distinct references the
 * ≥2-evidence blocking issue is NOT raised.
 *
 * The fix (this spec) only changes *what counts* as an evidence ID / verdict / section
 * header and later enriches the wording of this blocking issue (task 16.7) — it must never
 * change *how many* distinguishable references `ROOT_CAUSE_CONFIRMED` requires. This test
 * therefore asserts on the STABLE prefix of the blocking issue so it survives the wording
 * enrichment while still guarding the ≥2 threshold.
 *
 * NOTE: This is a PRESERVATION test, not a bug-condition test. It is EXPECTED TO PASS on
 * the unfixed code (credibility baseline). Do NOT weaken the credibility predicate.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { checkFindingsReportContent } from "../../packages/daemon-core/src/tools/lib/sf_design_gate_core"
import type { GateResult } from "../../packages/daemon-core/src/tools/lib/sf_design_gate_core"

// ============================================================
// Constants
// ============================================================

/**
 * Stable prefix of the ≥2-evidence blocking issue. The full message currently ends with
 * `（EV-*）` and is enriched by task 16.7 to name the canonical form `EV-<id>`; matching on
 * this prefix keeps the preservation assertion valid across that wording change while still
 * pinning the credibility rule.
 */
const TWO_EVIDENCE_ISSUE_PREFIX = "ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用"

/** A findings-report body asserting the confirmed root-cause status. */
const ROOT_CAUSE_CONFIRMED_CONTENT = [
  "# Findings Report",
  "",
  "## 根因判定",
  "ROOT_CAUSE_CONFIRMED",
  "",
].join("\n")

// ============================================================
// Helpers
// ============================================================

function raisesTwoEvidenceIssue(result: GateResult): boolean {
  return result.blocking_issues.some(issue => issue.includes(TWO_EVIDENCE_ISSUE_PREFIX))
}

/**
 * Build a `事实与证据` section that cites the given canonical-form `EV-*` references. Every
 * other credibility dimension is irrelevant here: the assertions target ONLY the
 * ≥2-evidence blocking issue, which is unaffected by the presence of other blocking issues.
 */
function buildEvidenceSection(evidenceIds: readonly string[]): string {
  const lines = [
    "CODE_OBSERVED：命令输出显示初始化在依赖注入之前执行。",
    "一级原始证据可回溯到 `src/init.ts` 的调用栈。",
  ]
  for (const id of evidenceIds) {
    lines.push(`- 证据 ${id}：命令输出片段可回溯到原始事件日志。`)
  }
  return lines.join("\n")
}

function runGate(evidenceIds: readonly string[]): GateResult {
  return checkFindingsReportContent(ROOT_CAUSE_CONFIRMED_CONTENT, {
    事实与证据: buildEvidenceSection(evidenceIds),
  })
}

// ============================================================
// Generators
// ============================================================

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("")

/** A single canonical-form evidence ID `EV-<alnum{1,6}>` (ends on a word char). */
const evidenceIdArb = fc
  .array(fc.constantFrom(...ALNUM), { minLength: 1, maxLength: 6 })
  .map(chars => `EV-${chars.join("")}`)

/**
 * 0, 1 or 2+ DISTINCT canonical-form evidence IDs. Uniqueness is by value so the generated
 * count equals the number of distinguishable references the gate will extract.
 */
const distinctEvidenceIdsArb = fc.uniqueArray(evidenceIdArb, { minLength: 0, maxLength: 6 })

// ============================================================
// Property Tests
// ============================================================

describe("Property 9 (preservation): ≥2 distinguishable evidence for ROOT_CAUSE_CONFIRMED", () => {
  it("raises the ≥2-evidence blocking issue iff fewer than two distinct EV-* references are cited", () => {
    fc.assert(
      fc.property(distinctEvidenceIdsArb, evidenceIds => {
        const distinctCount = new Set(evidenceIds).size
        const result = runGate(evidenceIds)

        if (distinctCount < 2) {
          // 0 or 1 distinguishable references -> confirmation is blocked.
          expect(raisesTwoEvidenceIssue(result)).toBe(true)
        } else {
          // 2+ distinguishable references -> the ≥2-evidence rule is satisfied.
          expect(raisesTwoEvidenceIssue(result)).toBe(false)
        }
      }),
      { numRuns: 200 }
    )
  })

  it("counts DISTINCT references only: repeating a single EV-* id still fails the rule", () => {
    fc.assert(
      fc.property(
        evidenceIdArb,
        fc.integer({ min: 2, max: 5 }),
        (id, repetitions) => {
          const repeated = Array.from({ length: repetitions }, () => id)
          const result = runGate(repeated)
          // Only one distinguishable reference -> confirmation stays blocked.
          expect(raisesTwoEvidenceIssue(result)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("concrete: zero EV-* references under ROOT_CAUSE_CONFIRMED is blocked", () => {
    expect(raisesTwoEvidenceIssue(runGate([]))).toBe(true)
  })

  it("concrete: a single EV-* reference under ROOT_CAUSE_CONFIRMED is blocked", () => {
    expect(raisesTwoEvidenceIssue(runGate(["EV-001"]))).toBe(true)
  })

  it("concrete: two distinct EV-* references satisfy the ≥2-evidence rule", () => {
    const result = runGate(["EV-001", "EV-002"])
    expect(raisesTwoEvidenceIssue(result)).toBe(false)
    expect(result.details?.evidence_ids).toEqual(expect.arrayContaining(["EV-001", "EV-002"]))
  })
})
