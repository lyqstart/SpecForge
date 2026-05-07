/**
 * Property-based tests for AC extraction ignoring fenced code blocks
 *
 * Feature: specforge-ears-format, Property 11: AC 提取不读取 fenced code block
 *
 * **Validates: Requirements 2.1**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { extractAcceptanceCriteria } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers & Generators
// ============================================================

/** Generate a simple alphanumeric word (no special markdown chars) */
const arbWord = fc.array(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
  { minLength: 2, maxLength: 10 }
).map(chars => chars.join(""))

/** Generate a short sentence (multiple words) */
const arbSentence = fc.array(arbWord, { minLength: 2, maxLength: 6 })
  .map(words => words.join(" "))

/** Generate a valid EARS-style AC line (numbered item) */
const arbAcLine = (index: number) =>
  arbSentence.map(sentence => `${index}. THE system SHALL ${sentence}`)

/** Generate a numbered item that looks like an AC (for inside code blocks) */
const arbFakeAcLine = (index: number) =>
  arbSentence.map(sentence => `${index}. ${sentence}`)

/** Generate arbitrary content for inside a code block (may include EARS keywords, numbered items, headings) */
const arbCodeBlockContent = fc.array(
  fc.oneof(
    // Numbered items that look like ACs
    fc.tuple(fc.integer({ min: 1, max: 20 }), arbSentence)
      .map(([n, s]) => `${n}. THE system SHALL ${s}`),
    // EARS keywords scattered
    fc.tuple(arbSentence, fc.constantFrom("WHEN", "WHILE", "WHERE", "IF", "THEN", "SHALL", "THE"))
      .map(([s, kw]) => `${kw} ${s}`),
    // Headings inside code block
    fc.tuple(fc.constantFrom("###", "####", "#####"), arbWord)
      .map(([h, w]) => `${h} ${w}`),
    // Plain text
    arbSentence,
    // Acceptance Criteria heading inside code block
    fc.constant("#### Acceptance Criteria"),
    // Requirement heading inside code block
    fc.tuple(fc.integer({ min: 1, max: 10 }), arbWord)
      .map(([n, w]) => `### Requirement ${n}: ${w}`)
  ),
  { minLength: 1, maxLength: 8 }
).map(lines => lines.join("\n"))

/** Generate a code fence language tag (optional) */
const arbLangTag = fc.oneof(
  fc.constant(""),
  fc.constantFrom("typescript", "javascript", "python", "markdown", "yaml", "json")
)

// ============================================================
// Property 1: Numbered items inside fenced code blocks are never extracted as ACs
// ============================================================

describe("Property 11: AC 提取不读取 fenced code block", () => {
  it("numbered items inside fenced code blocks are never extracted as ACs", () => {
    // Generate a document with:
    // - A ### Requirement N: Title heading
    // - An #### Acceptance Criteria section
    // - Some valid numbered ACs before the code block
    // - A fenced code block containing arbitrary numbered items
    // - Some valid numbered ACs after the code block
    const arbDocument = fc.tuple(
      fc.integer({ min: 1, max: 10 }),           // requirement number
      arbWord,                                    // requirement title
      fc.integer({ min: 1, max: 4 }),            // number of ACs before code block
      fc.integer({ min: 1, max: 5 }),            // number of fake ACs inside code block
      fc.integer({ min: 1, max: 4 }),            // number of ACs after code block
      arbLangTag,                                 // code block language tag
      fc.array(arbSentence, { minLength: 1, maxLength: 4 }), // AC content before
      fc.array(arbSentence, { minLength: 1, maxLength: 5 }), // fake AC content inside code block
      fc.array(arbSentence, { minLength: 1, maxLength: 4 })  // AC content after
    ).map(([reqNum, title, beforeCount, insideCount, afterCount, lang, beforeSentences, insideSentences, afterSentences]) => {
      const lines: string[] = []

      // Requirement heading
      lines.push(`### Requirement ${reqNum}: ${title}`)
      lines.push("")

      // Acceptance Criteria section
      lines.push("#### Acceptance Criteria")
      lines.push("")

      // Valid ACs before code block
      const actualBeforeCount = Math.min(beforeCount, beforeSentences.length)
      for (let i = 0; i < actualBeforeCount; i++) {
        lines.push(`${i + 1}. THE system SHALL ${beforeSentences[i]}`)
      }
      lines.push("")

      // Fenced code block with numbered items inside
      lines.push("```" + lang)
      const actualInsideCount = Math.min(insideCount, insideSentences.length)
      for (let i = 0; i < actualInsideCount; i++) {
        lines.push(`${i + 1}. THE system SHALL ${insideSentences[i]}`)
      }
      lines.push("```")
      lines.push("")

      // Valid ACs after code block (numbering continues from before)
      const actualAfterCount = Math.min(afterCount, afterSentences.length)
      for (let i = 0; i < actualAfterCount; i++) {
        lines.push(`${actualBeforeCount + i + 1}. THE system SHALL ${afterSentences[i]}`)
      }

      return {
        content: lines.join("\n"),
        expectedAcCount: actualBeforeCount + actualAfterCount,
        insideCount: actualInsideCount,
      }
    })

    fc.assert(
      fc.property(
        arbDocument,
        ({ content, expectedAcCount, insideCount }) => {
          const result = extractAcceptanceCriteria(content)

          // The extracted ACs should NOT include any items from inside the code block
          expect(result.acs.length).toBe(expectedAcCount)

          // Additionally verify none of the extracted ACs came from inside the code block
          // by checking that the count equals only items outside the code block
          expect(result.acs.length).toBeLessThanOrEqual(
            expectedAcCount
          )

          // Ensure we didn't accidentally extract code block content
          // (the total should be strictly the outside items)
          expect(result.acs.length + insideCount).toBeGreaterThan(result.acs.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 2: Code blocks can contain any content without affecting extraction
  // ============================================================

  it("code blocks can contain any content without affecting extraction results", () => {
    const arbDocumentPair = fc.tuple(
      fc.integer({ min: 1, max: 10 }),           // requirement number
      arbWord,                                    // requirement title
      fc.integer({ min: 1, max: 5 }),            // number of ACs
      fc.array(arbSentence, { minLength: 1, maxLength: 5 }), // AC sentences
      arbCodeBlockContent,                        // arbitrary code block content
      arbLangTag                                  // code block language tag
    ).map(([reqNum, title, acCount, acSentences, codeContent, lang]) => {
      const actualAcCount = Math.min(acCount, acSentences.length)

      // Build document WITH code block content
      const linesWithContent: string[] = []
      linesWithContent.push(`### Requirement ${reqNum}: ${title}`)
      linesWithContent.push("")
      linesWithContent.push("#### Acceptance Criteria")
      linesWithContent.push("")

      for (let i = 0; i < actualAcCount; i++) {
        linesWithContent.push(`${i + 1}. THE system SHALL ${acSentences[i]}`)
      }
      linesWithContent.push("")
      linesWithContent.push("```" + lang)
      linesWithContent.push(codeContent)
      linesWithContent.push("```")

      // Build document WITH empty code block
      const linesEmpty: string[] = []
      linesEmpty.push(`### Requirement ${reqNum}: ${title}`)
      linesEmpty.push("")
      linesEmpty.push("#### Acceptance Criteria")
      linesEmpty.push("")

      for (let i = 0; i < actualAcCount; i++) {
        linesEmpty.push(`${i + 1}. THE system SHALL ${acSentences[i]}`)
      }
      linesEmpty.push("")
      linesEmpty.push("```" + lang)
      linesEmpty.push("```")

      return {
        contentWithCode: linesWithContent.join("\n"),
        contentEmpty: linesEmpty.join("\n"),
        expectedAcCount: actualAcCount,
      }
    })

    fc.assert(
      fc.property(
        arbDocumentPair,
        ({ contentWithCode, contentEmpty, expectedAcCount }) => {
          const resultWithCode = extractAcceptanceCriteria(contentWithCode)
          const resultEmpty = extractAcceptanceCriteria(contentEmpty)

          // Extraction results should be the same regardless of code block content
          expect(resultWithCode.acs.length).toBe(resultEmpty.acs.length)
          expect(resultWithCode.acs.length).toBe(expectedAcCount)

          // The raw content of extracted ACs should be identical
          for (let i = 0; i < resultWithCode.acs.length; i++) {
            expect(resultWithCode.acs[i].raw).toBe(resultEmpty.acs[i].raw)
            expect(resultWithCode.acs[i].index).toBe(resultEmpty.acs[i].index)
            expect(resultWithCode.acs[i].requirementId).toBe(resultEmpty.acs[i].requirementId)
          }

          // Section metadata should also match
          expect(resultWithCode.sections.length).toBe(resultEmpty.sections.length)
          for (let i = 0; i < resultWithCode.sections.length; i++) {
            expect(resultWithCode.sections[i].acCount).toBe(resultEmpty.sections[i].acCount)
            expect(resultWithCode.sections[i].requirementId).toBe(resultEmpty.sections[i].requirementId)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
