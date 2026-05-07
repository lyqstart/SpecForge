/**
 * Unit tests for parseValidationMode function
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 4.1, 4.4
 */

import { describe, it, expect } from "vitest"
import { parseValidationMode } from "../../../.opencode/tools/lib/sf_ears_parser.ts"

describe("parseValidationMode", () => {
  describe("无 front-matter → legacy", () => {
    it("should return legacy mode for content without front-matter", () => {
      const content = "# Requirements\n\nSome content here."
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "legacy" })
    })

    it("should return legacy mode for empty content", () => {
      const result = parseValidationMode("")
      expect(result).toEqual({ ok: true, mode: "legacy" })
    })

    it("should return legacy mode when --- appears but not as front-matter", () => {
      const content = "Some text\n---\nrequirements_format: ears\n---\n"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "legacy" })
    })
  })

  describe("Front-matter without requirements_format → legacy", () => {
    it("should return legacy mode when front-matter has no requirements_format field", () => {
      const content = "---\ntitle: My Requirements\nauthor: Test\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "legacy" })
    })

    it("should return legacy mode when front-matter is empty", () => {
      const content = "---\n\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "legacy" })
    })
  })

  describe("requirements_format: ears → strict", () => {
    it("should return strict mode when requirements_format is ears", () => {
      const content = "---\nrequirements_format: ears\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "strict" })
    })
  })

  describe("requirements_format: legacy → legacy", () => {
    it("should return legacy mode when requirements_format is legacy", () => {
      const content = "---\nrequirements_format: legacy\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "legacy" })
    })
  })

  describe("Invalid value → error with message", () => {
    it("should return error for invalid value 'strict'", () => {
      const content = "---\nrequirements_format: strict\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({
        ok: false,
        error: 'Invalid requirements_format value: "strict". Must be "ears" or "legacy".',
      })
    })

    it("should return error for invalid value 'EARS' (case-sensitive)", () => {
      const content = "---\nrequirements_format: EARS\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({
        ok: false,
        error: 'Invalid requirements_format value: "EARS". Must be "ears" or "legacy".',
      })
    })

    it("should return error for invalid value 'foo'", () => {
      const content = "---\nrequirements_format: foo\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({
        ok: false,
        error: 'Invalid requirements_format value: "foo". Must be "ears" or "legacy".',
      })
    })
  })

  describe("Front-matter with extra fields (should still work)", () => {
    it("should correctly parse requirements_format among other fields", () => {
      const content = "---\ntitle: My Doc\nrequirements_format: ears\nauthor: Test\nversion: 1.0\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "strict" })
    })

    it("should correctly parse legacy mode among other fields", () => {
      const content = "---\ntitle: My Doc\nauthor: Test\nrequirements_format: legacy\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "legacy" })
    })
  })

  describe("Whitespace handling in value", () => {
    it("should trim trailing whitespace from value", () => {
      const content = "---\nrequirements_format: ears   \n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "strict" })
    })

    it("should trim trailing whitespace from legacy value", () => {
      const content = "---\nrequirements_format: legacy  \n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "legacy" })
    })

    it("should handle value with tab characters", () => {
      const content = "---\nrequirements_format: ears\t\n---\n\n# Requirements"
      const result = parseValidationMode(content)
      expect(result).toEqual({ ok: true, mode: "strict" })
    })
  })
})
