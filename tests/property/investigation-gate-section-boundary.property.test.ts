/**
 * Preservation property test — Property 7 (P4 preservation)
 * Section Boundary Behavior.
 *
 * **Validates: Requirements 3.1**
 *
 * PRESERVATION (observation-first): the section-detection boundary logic MUST NOT change when the
 * P4 fix loosens *which* headers match. The behavior captured here is the CURRENT behavior of the
 * shared `parseSections` detector (used by both the requirements gate and, via import, the findings
 * gate for required-section extraction):
 *
 *   - A matched required section is an `h2`/`h3` header (`^#{2,3}\s*${name}\s*$`).
 *   - Its extracted body starts immediately after the header line and spans EXACTLY up to — but not
 *     including — the next same-or-higher-level heading. For the required `h2` section, the next
 *     same-or-higher-level heading is the next `h1` or `h2` (`^#{1,2}\s+`).
 *   - Deeper subheadings (`h3`–`h6`) are NOT boundaries: they are part of the section body.
 *   - If there is no subsequent same-or-higher-level heading, the body spans to the end of the
 *     document.
 *
 * This test is EXPECTED TO PASS on the UNFIXED code (it encodes the baseline boundary behavior) and
 * MUST keep passing after the P4 fix, which changes only header *matching* (prefix / annotation
 * tolerance), never the next-heading boundary scan.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { parseSections } from "../../packages/daemon-core/src/tools/lib/sf_requirements_gate_core"

// ============================================================
// Canonical (bare) required-section names from the design examples.
// Bare names are used because the UNFIXED detector only matches bare headers; boundary behavior is
// what is under observation here, not header tolerance (that is Property 1).
// ============================================================

const CANONICAL_SECTIONS = [
  "预期产出",
  "调查结论",
  "事实与证据",
  "调用链与首次偏离点",
  "假设验证结果",
  "因果链",
] as const

// ============================================================
// Generators — plain, heading-free content lines and structural variety.
// ============================================================

/** A safe body word: alphanumerics only, so a generated line can never look like a markdown heading. */
const safeWordArb = fc.constantFrom(
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "content",
  "body",
  "detail",
  "note",
  "observation",
  "证据",
  "内容",
  "说明"
)

/** A non-empty content line with no leading '#'. */
const safeLineArb = fc
  .array(safeWordArb, { minLength: 1, maxLength: 5 })
  .map((words) => words.join(" "))

/** A deeper subheading (h3–h6) that must be treated as part of the body, never a boundary. */
const subHeadingArb = fc
  .tuple(fc.integer({ min: 3, max: 6 }), safeLineArb)
  .map(([level, title]) => `${"#".repeat(level)} ${title}`)

/**
 * A body block: interleaved content lines and deeper (h3–h6) subheadings. None of these lines match
 * the `^#{1,2}\s+` boundary pattern, so the whole block belongs to the section body.
 */
const bodyBlockArb = fc
  .array(fc.oneof({ weight: 3, arbitrary: safeLineArb }, { weight: 1, arbitrary: subHeadingArb }), {
    minLength: 1,
    maxLength: 8,
  })

/** A terminating same-or-higher-level heading: h1 or h2 (relative to the required h2 section). */
const terminatorArb = fc
  .tuple(fc.integer({ min: 1, max: 2 }), safeLineArb)
  .map(([level, title]) => `${"#".repeat(level)} ${title}`)

// ============================================================
// Helpers
// ============================================================

/** Build a document with a bare h2 required-section header, a body block, and optional trailing content. */
function buildDoc(sectionName: string, bodyBlock: string[], trailing: string[]): string {
  return [`## ${sectionName}`, ...bodyBlock, ...trailing].join("\n")
}

// ============================================================
// Property Tests
// ============================================================

describe("Property 7 (P4 preservation): section boundary behavior", () => {
  it("body spans exactly up to the next same-or-higher-level heading", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CANONICAL_SECTIONS),
        bodyBlockArb,
        terminatorArb,
        fc.array(safeLineArb, { minLength: 0, maxLength: 4 }),
        (sectionName, bodyBlock, terminator, afterLines) => {
          // Content after the terminator heading must NOT be part of the section body.
          const trailing = [terminator, ...afterLines]
          const doc = buildDoc(sectionName, bodyBlock, trailing)

          const sections = parseSections(doc, [sectionName])

          // Expected body: everything between the header and the terminator heading, trimmed.
          const expected = bodyBlock.join("\n").trim()
          expect(sections[sectionName]).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("deeper (h3–h6) subheadings are part of the body, not boundaries; body spans to EOF when no h1/h2 follows", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CANONICAL_SECTIONS),
        bodyBlockArb,
        (sectionName, bodyBlock) => {
          // No terminating h1/h2 heading -> the section body runs to the end of the document,
          // including any deeper subheadings inside the body block.
          const doc = buildDoc(sectionName, bodyBlock, [])

          const sections = parseSections(doc, [sectionName])

          const expected = bodyBlock.join("\n").trim()
          expect(sections[sectionName]).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("only the FIRST same-or-higher-level heading terminates the section", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CANONICAL_SECTIONS),
        bodyBlockArb,
        terminatorArb,
        terminatorArb,
        (sectionName, bodyBlock, firstTerminator, secondTerminator) => {
          // Two consecutive same-or-higher-level headings; the body must end at the FIRST one.
          const doc = buildDoc(sectionName, bodyBlock, [
            firstTerminator,
            "some following prose",
            secondTerminator,
            "more prose",
          ])

          const sections = parseSections(doc, [sectionName])

          const expected = bodyBlock.join("\n").trim()
          expect(sections[sectionName]).toBe(expected)
        }
      ),
      { numRuns: 100 }
    )
  })

  // ----------------------------------------------------------
  // Concrete examples anchoring the observed baseline behavior.
  // ----------------------------------------------------------

  it("concrete: h2 section ends at the next h2 heading; h3 subheading stays inside", () => {
    const doc = [
      "## 事实与证据",
      "第一条原始证据 EV-1。",
      "### 证据细节",
      "细节说明内容。",
      "## 调查结论",
      "结论内容不应包含在事实与证据章节内。",
    ].join("\n")

    const sections = parseSections(doc, ["事实与证据"])

    expect(sections["事实与证据"]).toBe(
      ["第一条原始证据 EV-1。", "### 证据细节", "细节说明内容。"].join("\n")
    )
    expect(sections["事实与证据"]).not.toContain("调查结论")
    expect(sections["事实与证据"]).not.toContain("不应包含")
  })

  it("concrete: h2 section ends at the next h1 heading", () => {
    const doc = [
      "## 调查结论",
      "结论正文。",
      "# 附录",
      "附录内容不属于调查结论。",
    ].join("\n")

    const sections = parseSections(doc, ["调查结论"])

    expect(sections["调查结论"]).toBe("结论正文。")
    expect(sections["调查结论"]).not.toContain("附录")
  })

  it("concrete: section spans to EOF when no h1/h2 heading follows", () => {
    const doc = [
      "## 因果链",
      "根因到症状的链条描述。",
      "#### 补充",
      "补充细节，仍属于因果链章节。",
    ].join("\n")

    const sections = parseSections(doc, ["因果链"])

    expect(sections["因果链"]).toBe(
      ["根因到症状的链条描述。", "#### 补充", "补充细节，仍属于因果链章节。"].join("\n")
    )
  })
})
