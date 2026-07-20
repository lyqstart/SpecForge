/**
 * Bug condition exploration property test — Property 1 (P4)
 * Prefix / Annotation-Tolerant Section Detection.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * BUG CONDITION (isBugCondition('section')): an investigation document contains a required
 * section whose header text BEGINS with the canonical section name but carries a trailing
 * parenthetical / annotation (e.g. `## 预期产出（执行阶段，非本 plan）` or
 * `## 调查结论（直接回答原始问题）`). The section is genuinely present, yet the anchored
 * detectors reject it:
 *   - Requirements gate: `parseSections` uses `^#{2,3}\s*${name}\s*$` — the trailing `\s*$`
 *     forbids any annotation after the canonical name, so the section is reported
 *     `Missing section: <name>`.
 *   - Findings gate: the findings-report section detection (the same `parseSections`, driven
 *     by DESIGN_GATE_SPECS investigation requiredSections; mirrored by the private
 *     `extractMarkdownSection` for governance sections) rejects decorated headers the same way,
 *     so a report containing all required topics is reported as missing multiple sections.
 *
 * EXPECTED (fixed) BEHAVIOR: the canonical name is treated as a PREFIX of the header text —
 * an optional trailing parenthetical / annotation is ignored — so a present-but-decorated
 * section is recognized (non-empty body extracted) and NOT reported missing.
 *
 * CRITICAL: This test is EXPECTED TO FAIL on the UNFIXED code. The failure confirms the bug
 * exists (present sections with trailing parentheticals are treated as missing). DO NOT fix
 * the code or the test when it fails — this test encodes the expected behavior and will
 * validate the fix once it passes after implementation.
 *
 * NOTE on `extractMarkdownSection`: that helper is not exported and, in the findings gate, is
 * used only for system-governance sections. The findings report's required-section detection
 * runs through the shared `parseSections`, so this test exercises the real defect path for
 * both gates via `parseSections`.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { parseSections } from "../../packages/daemon-core/src/tools/lib/sf_requirements_gate_core"

// ============================================================
// Concrete canonical section names from the design examples
// ============================================================

/** The requirements-gate (investigation_plan.md) section from the P4 example. */
const REQUIREMENTS_SECTION = "预期产出"

/** The five findings-report (findings_report.md) sections from the P4 example. */
const FINDINGS_SECTIONS = [
  "调查结论",
  "事实与证据",
  "调用链与首次偏离点",
  "假设验证结果",
  "因果链",
] as const

// ============================================================
// Generators — scoped to the concrete failing headers
// ============================================================

/**
 * Non-empty annotation text placed inside the trailing parenthetical. Constrained to
 * exclude newlines and any bracket characters so the generated header stays a single
 * decorated line whose text still begins with the canonical name.
 */
const annotationArb = fc
  .stringMatching(/^[\u4e00-\u9fa5A-Za-z0-9，、,. plan非本执行阶段直接回答原始问题]+$/)
  .filter((s) => s.trim().length > 0 && s.trim().length <= 24)

/** Trailing parenthetical using full-width or half-width parentheses. */
const decoratedSuffixArb = fc
  .tuple(fc.constantFrom("（", "("), annotationArb, fc.constantFrom("）", ")"))
  .map(([open, text, close]) => `${open}${text.trim()}${close}`)

/** Optional whitespace between the canonical name and the trailing parenthetical. */
const gapArb = fc.constantFrom("", " ")

// ============================================================
// Document builders
// ============================================================

/** Build an investigation_plan.md-style doc with a single decorated required-section header. */
function buildRequirementsDoc(sectionName: string, suffix: string, gap: string): string {
  return [
    "# 调查计划",
    "",
    `## ${sectionName}${gap}${suffix}`,
    "",
    "本节给出调查完成后应交付的产出与验收口径，内容非空以便通过章节检测。",
    "",
  ].join("\n")
}

/** Build a findings_report.md-style doc where every required header carries a trailing annotation. */
function buildFindingsDoc(suffixes: Record<string, string>): string {
  const lines: string[] = ["# Findings Report", ""]
  for (const name of FINDINGS_SECTIONS) {
    lines.push(`## ${name}${suffixes[name]}`)
    lines.push("")
    lines.push(`本节 ${name} 的实质内容，用于确认章节被识别（非空）。`)
    lines.push("")
  }
  return lines.join("\n")
}

// ============================================================
// Property Tests
// ============================================================

describe("Property 1 (P4): prefix / annotation-tolerant section detection", () => {
  it("requirements gate: a 预期产出 header with a trailing parenthetical is recognized, not reported missing", () => {
    fc.assert(
      fc.property(decoratedSuffixArb, gapArb, (suffix, gap) => {
        const doc = buildRequirementsDoc(REQUIREMENTS_SECTION, suffix, gap)

        const sections = parseSections(doc, [REQUIREMENTS_SECTION])

        // Expected (fixed) behavior: canonical name matched as a prefix -> section present.
        expect(sections[REQUIREMENTS_SECTION]?.trim()).toBeTruthy()
      }),
      { numRuns: 50 }
    )
  })

  it("findings gate: five decorated required headers are all recognized, not reported missing", () => {
    fc.assert(
      fc.property(
        fc.record(
          Object.fromEntries(FINDINGS_SECTIONS.map((name) => [name, decoratedSuffixArb])) as Record<
            (typeof FINDINGS_SECTIONS)[number],
            fc.Arbitrary<string>
          >
        ),
        (suffixes) => {
          const doc = buildFindingsDoc(suffixes as Record<string, string>)

          const sections = parseSections(doc, [...FINDINGS_SECTIONS])
          const missing = FINDINGS_SECTIONS.filter((name) => !sections[name]?.trim())

          // Expected (fixed) behavior: every decorated header is recognized.
          expect(missing).toEqual([])
        }
      ),
      { numRuns: 50 }
    )
  })

  it("concrete counterexample: `## 预期产出（执行阶段，非本 plan）` is recognized", () => {
    const doc = buildRequirementsDoc(REQUIREMENTS_SECTION, "（执行阶段，非本 plan）", "")

    const sections = parseSections(doc, [REQUIREMENTS_SECTION])

    // On UNFIXED code this fails: parseSections returns "" -> Missing section: 预期产出.
    expect(sections[REQUIREMENTS_SECTION]?.trim()).toBeTruthy()
  })

  it("concrete counterexample: five decorated findings-report headers are all recognized", () => {
    const doc = buildFindingsDoc({
      调查结论: "（直接回答原始问题）",
      事实与证据: "（一级原始证据）",
      调用链与首次偏离点: "（预期 vs 实际）",
      假设验证结果: "（含实验结果）",
      因果链: "（根因到症状）",
    })

    const sections = parseSections(doc, [...FINDINGS_SECTIONS])
    const missing = FINDINGS_SECTIONS.filter((name) => !sections[name]?.trim())

    // On UNFIXED code this fails: all five report as
    // `Missing section: 调查结论 / 事实与证据 / 调用链与首次偏离点 / 假设验证结果 / 因果链`.
    expect(missing).toEqual([])
  })
})
