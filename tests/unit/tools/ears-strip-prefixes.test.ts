/**
 * Unit tests for stripPrefixes function
 * Validates: Requirements 7.7, 5.1
 */

import { describe, it, expect } from "vitest"
import { stripPrefixes } from "../../../.opencode/tools/lib/sf_ears_parser.ts"

describe("stripPrefixes", () => {
  describe("编号前缀剥离", () => {
    it("should strip number prefix with space (e.g., '1. ')", () => {
      const result = stripPrefixes("1. THE system SHALL respond.")
      expect(result.body).toBe("THE system SHALL respond.")
      expect(result.declaredPattern).toBeUndefined()
    })

    it("should strip number prefix without space (e.g., '1.')", () => {
      const result = stripPrefixes("1.THE system SHALL respond.")
      expect(result.body).toBe("THE system SHALL respond.")
      expect(result.declaredPattern).toBeUndefined()
    })

    it("should strip multi-digit number prefix (e.g., '12. ')", () => {
      const result = stripPrefixes("12. WHEN event occurs, THE system SHALL respond.")
      expect(result.body).toBe("WHEN event occurs, THE system SHALL respond.")
      expect(result.declaredPattern).toBeUndefined()
    })

    it("should strip number prefix with multiple spaces (e.g., '1.  ')", () => {
      const result = stripPrefixes("1.  THE system SHALL respond.")
      expect(result.body).toBe("THE system SHALL respond.")
      expect(result.declaredPattern).toBeUndefined()
    })

    it("should handle input without number prefix", () => {
      const result = stripPrefixes("THE system SHALL respond.")
      expect(result.body).toBe("THE system SHALL respond.")
      expect(result.declaredPattern).toBeUndefined()
    })
  })

  describe("[Pattern-label] 提取", () => {
    it("should extract valid [Event-driven] label", () => {
      const result = stripPrefixes("1. [Event-driven] WHEN event occurs, THE system SHALL respond.")
      expect(result.body).toBe("WHEN event occurs, THE system SHALL respond.")
      expect(result.declaredPattern).toBe("Event-driven")
    })

    it("should extract valid [Ubiquitous] label", () => {
      const result = stripPrefixes("2. [Ubiquitous] THE system SHALL respond.")
      expect(result.body).toBe("THE system SHALL respond.")
      expect(result.declaredPattern).toBe("Ubiquitous")
    })

    it("should extract valid [State-driven] label", () => {
      const result = stripPrefixes("3. [State-driven] WHILE active, THE system SHALL respond.")
      expect(result.body).toBe("WHILE active, THE system SHALL respond.")
      expect(result.declaredPattern).toBe("State-driven")
    })

    it("should extract valid [Optional-feature] label", () => {
      const result = stripPrefixes("4. [Optional-feature] WHERE enabled, THE system SHALL respond.")
      expect(result.body).toBe("WHERE enabled, THE system SHALL respond.")
      expect(result.declaredPattern).toBe("Optional-feature")
    })

    it("should extract valid [Unwanted-behavior] label", () => {
      const result = stripPrefixes("5. [Unwanted-behavior] IF error, THEN THE system SHALL respond.")
      expect(result.body).toBe("IF error, THEN THE system SHALL respond.")
      expect(result.declaredPattern).toBe("Unwanted-behavior")
    })

    it("should extract valid [Complex] label", () => {
      const result = stripPrefixes("6. [Complex] WHERE x, WHEN y, THE system SHALL respond.")
      expect(result.body).toBe("WHERE x, WHEN y, THE system SHALL respond.")
      expect(result.declaredPattern).toBe("Complex")
    })

    it("should strip invalid label but set declaredPattern to undefined", () => {
      const result = stripPrefixes("1. [InvalidLabel] THE system SHALL respond.")
      expect(result.body).toBe("THE system SHALL respond.")
      expect(result.declaredPattern).toBeUndefined()
    })

    it("should strip label without space after bracket", () => {
      const result = stripPrefixes("1. [Event-driven]WHEN event, THE system SHALL respond.")
      expect(result.body).toBe("WHEN event, THE system SHALL respond.")
      expect(result.declaredPattern).toBe("Event-driven")
    })

    it("should handle label with multiple spaces after bracket", () => {
      const result = stripPrefixes("1. [Event-driven]  WHEN event, THE system SHALL respond.")
      expect(result.body).toBe("WHEN event, THE system SHALL respond.")
      expect(result.declaredPattern).toBe("Event-driven")
    })
  })

  describe("边界情况", () => {
    it("should handle empty string", () => {
      const result = stripPrefixes("")
      expect(result.body).toBe("")
      expect(result.declaredPattern).toBeUndefined()
    })

    it("should handle only number prefix", () => {
      const result = stripPrefixes("1. ")
      expect(result.body).toBe("")
      expect(result.declaredPattern).toBeUndefined()
    })

    it("should handle only number prefix and label", () => {
      const result = stripPrefixes("1. [Event-driven] ")
      expect(result.body).toBe("")
      expect(result.declaredPattern).toBe("Event-driven")
    })

    it("should not treat brackets in middle of text as label", () => {
      const result = stripPrefixes("1. WHEN [something] happens, THE system SHALL respond.")
      expect(result.body).toBe("WHEN [something] happens, THE system SHALL respond.")
      expect(result.declaredPattern).toBeUndefined()
    })

    it("should handle label without number prefix", () => {
      const result = stripPrefixes("[Event-driven] WHEN event, THE system SHALL respond.")
      expect(result.body).toBe("WHEN event, THE system SHALL respond.")
      expect(result.declaredPattern).toBe("Event-driven")
    })
  })
})
