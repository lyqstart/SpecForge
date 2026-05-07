/**
 * Property-based tests for empty document / front-matter only / no AC section scenarios
 *
 * Feature: specforge-ears-format, Property 15: 空文档 / front-matter only / 無 AC section
 *
 * **Validates: Requirements 2.1, 4.1**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { checkEarsCompliance } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers: Generators
// ============================================================

/**
 * Generate whitespace-only strings (spaces, tabs, newlines)
 */
const arbWhitespaceOnly = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r\n", "  ", "\t\t"), { minLength: 0, maxLength: 10 })
  .map((parts) => parts.join(""))

/**
 * Generate a random YAML field name that is NOT "requirements_format"
 */
const arbFieldName = fc.constantFrom(
  "title",
  "version",
  "author",
  "status",
  "date",
  "project",
  "category",
  "priority",
  "tags",
  "description",
  "spec_type",
  "owner"
)

/**
 * Generate a random YAML field value (simple string, no newlines)
 */
const arbFieldValue = fc.constantFrom(
  "some-value",
  "1.0",
  "draft",
  "2024-01-01",
  "my-project",
  "high",
  "feature",
  "true",
  "false",
  "active",
  "John Doe",
  "v2"
)

/**
 * Generate a random YAML field line like "field_name: value"
 */
const arbYamlField = fc
  .tuple(arbFieldName, arbFieldValue)
  .map(([name, value]) => `${name}: ${value}`)

/**
 * Generate body content that does NOT contain "#### Acceptance Criteria" section
 */
const arbBodyWithoutAcSection = fc
  .array(
    fc.constantFrom(
      "## Overview",
      "### Requirement 1: Something",
      "Some paragraph text here.",
      "- A list item",
      "",
      "Another line of content.",
      "## Introduction",
      "This is a description.",
      "### Notes",
      "- Item one",
      "- Item two"
    ),
    { minLength: 0, maxLength: 8 }
  )
  .map((lines) => lines.join("\n"))

/**
 * Generate body content with ### Requirement headings but NO #### Acceptance Criteria
 */
const arbBodyWithRequirementsNoAc = fc
  .tuple(
    fc.integer({ min: 1, max: 5 }),
    fc.array(
      fc.constantFrom(
        "Some description text.",
        "- A list item",
        "",
        "More details here.",
        "##### Sub-section",
        "Implementation notes."
      ),
      { minLength: 1, maxLength: 4 }
    )
  )
  .map(([reqCount, bodyLines]) => {
    const sections: string[] = []
    for (let i = 1; i <= reqCount; i++) {
      sections.push(`### Requirement ${i}: Feature ${i}`)
      sections.push(...bodyLines)
    }
    return sections.join("\n")
  })

/**
 * Generate arbitrary content that does NOT start with "---" (no front-matter)
 */
const arbContentWithoutFrontMatter = fc
  .tuple(
    fc.constantFrom(
      "# Requirements Document",
      "## Introduction",
      "Some text at the start",
      "# Title",
      "## Section",
      "Plain text content",
      "- List item",
      "1. Numbered item"
    ),
    fc.array(
      fc.constantFrom(
        "## Requirements",
        "### Requirement 1: Something",
        "#### Acceptance Criteria",
        "1. THE system SHALL respond.",
        "Some paragraph text here.",
        "- A list item",
        "",
        "Another line of content.",
        "WHEN something happens, THE system SHALL do something.",
        "Random text with special chars: $#@!%^&*()",
        "```\ncode block\n```",
        "### Requirement 2: Another",
        "#### Details",
        "IF error occurs, THEN THE system SHALL handle it."
      ),
      { minLength: 0, maxLength: 10 }
    )
  )
  .map(([firstLine, rest]) => `${firstLine}\n${rest.join("\n")}`)
  .filter((doc) => !doc.startsWith("---"))

// ============================================================
// Property 15: 空文档 / front-matter only / 無 AC section
// ============================================================

describe("Property 15: 空文档 / front-matter only / 無 AC section", () => {
  // ============================================================
  // Property 1: Empty documents never produce blocking_issues
  // ============================================================

  it("empty documents never produce blocking_issues in checkEarsCompliance", () => {
    const arbEmptyDoc = fc.oneof(
      fc.constant(""),
      arbWhitespaceOnly
    )

    fc.assert(
      fc.property(arbEmptyDoc, (doc) => {
        const result = checkEarsCompliance(doc)
        expect(result.blocking_issues).toEqual([])
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 2: Documents with only front-matter (no AC section) never produce blocking_issues
  // ============================================================

  it("documents with only front-matter (no AC section) never produce blocking_issues", () => {
    const arbFrontMatterOnlyDoc = fc
      .tuple(
        fc.array(arbYamlField, { minLength: 1, maxLength: 5 }),
        fc.constantFrom("ears", "legacy"),
        arbBodyWithoutAcSection
      )
      .map(([fields, formatValue, body]) => {
        const frontMatterLines = [
          ...fields,
          `requirements_format: ${formatValue}`,
        ]
        return `---\n${frontMatterLines.join("\n")}\n---\n${body}`
      })

    fc.assert(
      fc.property(arbFrontMatterOnlyDoc, (doc) => {
        const result = checkEarsCompliance(doc)
        expect(result.blocking_issues).toEqual([])
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 3: Documents without #### Acceptance Criteria produce no AC validation results
  // ============================================================

  it("documents without #### Acceptance Criteria section produce no AC validation results", () => {
    const arbDocWithRequirementsNoAc = fc
      .tuple(
        fc.array(arbYamlField, { minLength: 0, maxLength: 3 }),
        fc.constantFrom("ears", "legacy"),
        arbBodyWithRequirementsNoAc
      )
      .map(([fields, formatValue, body]) => {
        const frontMatterLines = [
          ...fields,
          `requirements_format: ${formatValue}`,
        ]
        return `---\n${frontMatterLines.join("\n")}\n---\n${body}`
      })

    fc.assert(
      fc.property(arbDocWithRequirementsNoAc, (doc) => {
        const result = checkEarsCompliance(doc)
        expect(result.details.total_acs).toBe(0)
        expect(result.details.results).toEqual([])
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 4: Legacy mode documents (no front-matter) never block regardless of content
  // ============================================================

  it("legacy mode documents (no front-matter) never block regardless of content", () => {
    fc.assert(
      fc.property(arbContentWithoutFrontMatter, (doc) => {
        const result = checkEarsCompliance(doc)
        expect(result.blocking_issues).toEqual([])
        expect(result.details.mode).toBe("legacy")
      }),
      { numRuns: 100 }
    )
  })
})
