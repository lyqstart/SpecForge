/**
 * Bug condition exploration property test — Property 3 (P6)
 * Canonical Evidence-ID Form Accepted.
 *
 * **Validates: Requirements 2.4**
 *
 * BUG CONDITION (isBugCondition('evidence')): a findings report cites evidence using a
 * concise `E<n>` label (e.g. `E1`, `E7`) — the form a real investigator naturally used
 * during acceptance testing (WI-0001) because the mandatory `EV-` prefix is documented
 * NOWHERE in the `sf-investigator` contract (`sf-investigator.md` only says
 * "证据 ID 必须能回溯到真实证据"). The Findings Gate matches evidence with
 * `\bEV-[A-Za-z0-9_-]+\b`, extracts `evidence_ids: []`, and — under
 * `ROOT_CAUSE_CONFIRMED` — fails the ≥2-evidence rule with
 * `ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用（EV-*）`.
 *
 * EXPECTED (fixed) BEHAVIOR: evidence cited per the single documented canonical form is
 * extracted, so the ≥2-evidence rule is satisfied for a report that genuinely cites two
 * distinguishable original evidence references — the gate does NOT raise the
 * ≥2-evidence blocking issue and `details.evidence_ids` contains the cited references.
 *
 * CRITICAL: This test is EXPECTED TO FAIL on the UNFIXED code. The failure confirms the
 * bug exists (the required `EV-` prefix is undocumented and evidence cited in the
 * observed form is extracted as none). DO NOT fix the code or the test when it fails.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { checkFindingsReportContent } from "../../packages/daemon-core/src/tools/lib/sf_design_gate_core"

// ============================================================
// Constants
// ============================================================

/** The ≥2-evidence blocking issue raised under ROOT_CAUSE_CONFIRMED. */
const TWO_EVIDENCE_ISSUE = "ROOT_CAUSE_CONFIRMED 至少需要两个可区分的原始证据引用（EV-*）"

// ============================================================
// Generators
// ============================================================

/**
 * Two distinct concise evidence labels of the `E<n>` form observed in WI-0001
 * (e.g. `E1`, `E7`). This is the non-`EV-` form the contract never documented.
 */
const conciseEvidencePairArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 12 }), { minLength: 2, maxLength: 2 })
  .map(([a, b]) => [`E${a}`, `E${b}`] as const)

// ============================================================
// Report builders
// ============================================================

/**
 * Build a substantively-valid findings report that asserts ROOT_CAUSE_CONFIRMED and is
 * complete on every credibility dimension EXCEPT that its two distinguishable original
 * evidence references are cited in the concise `E<n>` form. This isolates P6: the only
 * reason the report should be rejected on unfixed code is the undocumented evidence-ID
 * form.
 */
function buildSections(ev1: string, ev2: string): Record<string, string> {
  return {
    调查结论: [
      "针对原始调查问题：为什么初始化在依赖注入之前完成？",
      "直接回答：根因是初始化顺序错误，在依赖注入之前触发。",
    ].join("\n"),
    问题前提与证据完整性: "PREMISE_REPRODUCED；OBSERVER_EFFECT_NONE。原始证据已在事件日志中固化。",
    假设验证结果: [
      `- H1：主假设——初始化顺序错误。判定：confirmed。实验结果：命令输出证实顺序错误（证据 ${ev1}）。`,
      `- H2：竞争假设——缓存未失效。判定：rejected。实验结果：命令输出排除该假设（证据 ${ev2}）。`,
    ].join("\n"),
    事实与证据: [
      `CODE_OBSERVED：命令输出显示初始化在依赖注入之前执行。`,
      `一级原始证据 ${ev1} 与 ${ev2} 可回溯到 \`src/init.ts\` 的调用栈。`,
    ].join("\n"),
    调用链与首次偏离点: "首次偏离点：预期（expected）初始化在注入之后；实际（actual）在注入之前。",
    因果链: "根本缺陷 → 触发条件（启动时序）→ 用户症状（空引用）。",
  }
}

function buildContent(): string {
  return ["# Findings Report", "", "## 根因判定", "ROOT_CAUSE_CONFIRMED", ""].join("\n")
}

// ============================================================
// Property Test
// ============================================================

describe("Property 3 (P6): canonical evidence-ID form accepted", () => {
  it("extracts two distinguishable cited evidence references so ROOT_CAUSE_CONFIRMED does not fail the ≥2-evidence rule", () => {
    fc.assert(
      fc.property(conciseEvidencePairArb, ([ev1, ev2]) => {
        const sections = buildSections(ev1, ev2)
        const content = buildContent()

        const result = checkFindingsReportContent(content, sections)

        // Expected (fixed) behavior: both cited references are extracted...
        expect(result.details?.evidence_ids).toEqual(expect.arrayContaining([ev1, ev2]))
        // ...so the report is NOT rejected for having too few evidence references.
        expect(result.blocking_issues).not.toContain(TWO_EVIDENCE_ISSUE)
      }),
      { numRuns: 50 }
    )
  })

  it("concrete counterexample: a report citing E1 and E7 under ROOT_CAUSE_CONFIRMED is accepted for evidence count", () => {
    const sections = buildSections("E1", "E7")
    const content = buildContent()

    const result = checkFindingsReportContent(content, sections)

    expect(result.details?.evidence_ids).toEqual(expect.arrayContaining(["E1", "E7"]))
    expect(result.blocking_issues).not.toContain(TWO_EVIDENCE_ISSUE)
  })
})
