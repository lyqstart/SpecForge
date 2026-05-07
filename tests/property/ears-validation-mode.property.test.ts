/**
 * Property-based tests for EARS validation mode selection (parseValidationMode)
 *
 * Feature: specforge-ears-format, Property 2: 验证模式选择正确性
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 4.1, 4.4**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { parseValidationMode } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers: Generators for front-matter fields and body content
// ============================================================

/**
 * Generate a random YAML field name that is NOT "requirements_format"
 */
const arbFieldName = fc
  .constantFrom(
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
 * Generate random body content (after front-matter)
 */
const arbBodyContent = fc
  .array(
    fc.constantFrom(
      "## Requirements",
      "### Requirement 1: Something",
      "#### Acceptance Criteria",
      "1. THE system SHALL respond.",
      "Some paragraph text here.",
      "- A list item",
      "",
      "Another line of content."
    ),
    { minLength: 0, maxLength: 5 }
  )
  .map((lines) => lines.join("\n"))

// ============================================================
// Property 1: requirements_format: ears always returns strict mode
// ============================================================

describe("Property 2: 验证模式选择正确性", () => {
  it("requirements_format: ears always returns strict mode", () => {
    // Generate documents with front-matter containing requirements_format: ears
    // with varying other fields before and after
    const arbEarsDoc = fc
      .tuple(
        fc.array(arbYamlField, { minLength: 0, maxLength: 3 }),
        fc.array(arbYamlField, { minLength: 0, maxLength: 3 }),
        arbBodyContent
      )
      .map(([fieldsBefore, fieldsAfter, body]) => {
        const frontMatterLines = [
          ...fieldsBefore,
          "requirements_format: ears",
          ...fieldsAfter,
        ]
        return `---\n${frontMatterLines.join("\n")}\n---\n${body}`
      })

    fc.assert(
      fc.property(arbEarsDoc, (doc) => {
        const result = parseValidationMode(doc)
        expect(result).toEqual({ ok: true, mode: "strict" })
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 2: requirements_format: legacy always returns legacy mode
  // ============================================================

  it("requirements_format: legacy always returns legacy mode", () => {
    // Generate documents with front-matter containing requirements_format: legacy
    // with varying other fields before and after
    const arbLegacyDoc = fc
      .tuple(
        fc.array(arbYamlField, { minLength: 0, maxLength: 3 }),
        fc.array(arbYamlField, { minLength: 0, maxLength: 3 }),
        arbBodyContent
      )
      .map(([fieldsBefore, fieldsAfter, body]) => {
        const frontMatterLines = [
          ...fieldsBefore,
          "requirements_format: legacy",
          ...fieldsAfter,
        ]
        return `---\n${frontMatterLines.join("\n")}\n---\n${body}`
      })

    fc.assert(
      fc.property(arbLegacyDoc, (doc) => {
        const result = parseValidationMode(doc)
        expect(result).toEqual({ ok: true, mode: "legacy" })
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 3: No front-matter always returns legacy mode
  // ============================================================

  it("no front-matter always returns legacy mode", () => {
    // Generate documents that do NOT start with "---" front-matter delimiters
    const arbNoFrontMatter = fc
      .tuple(
        fc.constantFrom(
          "# Requirements Document",
          "## Introduction",
          "Some text",
          "",
          "### Requirement 1"
        ),
        arbBodyContent
      )
      .map(([firstLine, body]) => `${firstLine}\n${body}`)
      .filter((doc) => !doc.startsWith("---"))

    fc.assert(
      fc.property(arbNoFrontMatter, (doc) => {
        const result = parseValidationMode(doc)
        expect(result).toEqual({ ok: true, mode: "legacy" })
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 4: Front-matter without requirements_format returns legacy mode
  // ============================================================

  it("front-matter without requirements_format always returns legacy mode", () => {
    // Generate documents with front-matter that has other fields but NOT requirements_format
    const arbNoFormatFieldDoc = fc
      .tuple(
        fc.array(arbYamlField, { minLength: 1, maxLength: 5 }),
        arbBodyContent
      )
      .map(([fields, body]) => {
        return `---\n${fields.join("\n")}\n---\n${body}`
      })

    fc.assert(
      fc.property(arbNoFormatFieldDoc, (doc) => {
        const result = parseValidationMode(doc)
        expect(result).toEqual({ ok: true, mode: "legacy" })
      }),
      { numRuns: 100 }
    )
  })
})
