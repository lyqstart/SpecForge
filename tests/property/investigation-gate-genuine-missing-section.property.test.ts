/**
 * Preservation property test — Property 8 (P4 cluster)
 * Genuine Missing-Section Detection.
 *
 * **Validates: Requirements 3.2**
 *
 * PRESERVATION BASELINE (observation-first): this test captures behavior that MUST NOT change
 * across the P4 fix. It is written to PASS on the current UNFIXED code and to keep passing
 * after the prefix/annotation-tolerant matcher is introduced.
 *
 * OBSERVED BEHAVIOR: when a document contains NO header whose text starts with the canonical
 * section name, `parseSections` returns an empty body for that name (`sections[name] === ""`),
 * and the Requirements Gate therefore reports `Missing section: <name>` (see
 * `checkRequirementsGate`, which computes
 * `missing = requiredSections.filter(s => !sections[s]?.trim())` and maps each to
 * `` `Missing section: ${s}` ``).
 *
 * The P4 fix only LOOSENS matching so that a header whose text *begins with* the canonical
 * name (optionally followed by a trailing parenthetical / annotation) is recognized. A document
 * that lacks the canonical prefix entirely is a genuine miss and MUST still fail with
 * `Missing section: <name>` — that is the invariant this test guards.
 *
 * The function under test is `parseSections` in
 * `packages/daemon-core/src/tools/lib/sf_requirements_gate_core.ts`; the gate's missing-section
 * report is reproduced locally via `reportMissing` to mirror `checkRequirementsGate` exactly.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { parseSections } from "../../packages/daemon-core/src/tools/lib/sf_requirements_gate_core"

// ============================================================
// Canonical section names (from the P4 design examples)
// ============================================================

/** Canonical required-section tokens the gate looks for. */
const CANONICAL_NAMES = [
  "预期产出",
  "调查结论",
  "事实与证据",
  "调用链与首次偏离点",
  "假设验证结果",
  "因果链",
] as const

/**
 * The set of Chinese characters that appear in any canonical name. Decoy headers / body text
 * are generated from an ASCII-only alphabet, so they provably cannot contain any canonical
 * name as a substring — guaranteeing the generated document is a genuine miss.
 */
const CANONICAL_CHARS = new Set([...CANONICAL_NAMES.join("")])

// ============================================================
// Gate mirror — reproduce `checkRequirementsGate`'s missing-section report
// ============================================================

/**
 * Mirror of the gate's missing-section computation: a section is missing when its parsed body
 * is empty/whitespace, and each missing name is reported as `Missing section: <name>`.
 */
function reportMissing(content: string, requiredSections: string[]): string[] {
  const sections = parseSections(content, requiredSections)
  return requiredSections
    .filter((s) => !sections[s]?.trim())
    .map((s) => `Missing section: ${s}`)
}

// ============================================================
// Generators — documents that lack the canonical prefix
// ============================================================

/** ASCII header token; cannot contain any canonical Chinese name. */
const asciiHeaderArb = fc
  .stringMatching(/^[A-Za-z][A-Za-z0-9 _-]{0,20}$/)
  .filter((s) => s.trim().length > 0)

/** ASCII body line; cannot contain any canonical Chinese name. */
const asciiBodyArb = fc
  .stringMatching(/^[A-Za-z0-9 .,_-]{1,40}$/)
  .filter((s) => s.trim().length > 0)

/** A markdown section: an h2/h3 header with a non-empty ASCII body. */
const decoySectionArb = fc
  .tuple(fc.constantFrom("##", "###"), asciiHeaderArb, asciiBodyArb)
  .map(([hashes, header, body]) => `${hashes} ${header}\n\n${body}\n`)

/** A whole document made of 1..5 decoy sections, none carrying a canonical prefix. */
const decoyDocArb = fc
  .array(decoySectionArb, { minLength: 1, maxLength: 5 })
  .map((sections) => `# Document\n\n${sections.join("\n")}`)

/**
 * Sanity guard: a document is a genuine miss for `name` only if no line matches the header
 * anchor `^#{2,3}\s*<name>\s*$` and the name never begins a header. ASCII docs trivially
 * satisfy this, but we assert it so the generator can never silently mask the property.
 */
function containsNoCanonicalHeader(doc: string, name: string): boolean {
  return doc
    .split("\n")
    .every((line) => !new RegExp(`^#{1,6}\\s*${name}`).test(line))
}

// ============================================================
// Property Tests
// ============================================================

describe("Property 8 (preservation): genuine missing-section detection", () => {
  it("a document with no canonical-prefixed header still reports `Missing section: <name>`", () => {
    fc.assert(
      fc.property(decoyDocArb, fc.constantFrom(...CANONICAL_NAMES), (doc, name) => {
        // Precondition: the generated doc genuinely lacks the canonical prefix.
        fc.pre(containsNoCanonicalHeader(doc, name))

        const missing = reportMissing(doc, [name])

        // Preserved behavior: the gate reports the section missing.
        expect(missing).toContain(`Missing section: ${name}`)
      }),
      { numRuns: 100 }
    )
  })

  it("all canonical names are reported missing when the document lacks every one", () => {
    fc.assert(
      fc.property(decoyDocArb, (doc) => {
        const missing = reportMissing(doc, [...CANONICAL_NAMES])

        // Every canonical section is absent -> all are reported missing.
        expect(missing.sort()).toEqual(
          CANONICAL_NAMES.map((n) => `Missing section: ${n}`).sort()
        )
      }),
      { numRuns: 100 }
    )
  })

  it("a header that embeds but does not START with the canonical name is still a genuine miss", () => {
    // `## 关于预期产出的备注` contains 预期产出 but does not begin with it, so it is NOT the
    // required section. This must fail both before AND after the prefix-tolerant fix.
    fc.assert(
      fc.property(fc.constantFrom("关于", "补充", "旧的", "废弃的"), (prefix) => {
        const name = "预期产出"
        const doc = [
          "# 调查计划",
          "",
          `## ${prefix}${name}的备注`,
          "",
          "这一节不是必需章节，仅在标题中间提到了该词。",
          "",
        ].join("\n")

        const missing = reportMissing(doc, [name])

        expect(missing).toContain(`Missing section: ${name}`)
      }),
      { numRuns: 20 }
    )
  })

  it("concrete counterexample: a plan with no 预期产出 header reports `Missing section: 预期产出`", () => {
    const doc = [
      "# 调查计划",
      "",
      "## 调查范围",
      "",
      "描述调查边界。",
      "",
      "## 候选假设",
      "",
      "H1、H2 两个竞争假设。",
      "",
    ].join("\n")

    const missing = reportMissing(doc, ["预期产出"])

    expect(missing).toEqual(["Missing section: 预期产出"])
  })
})
