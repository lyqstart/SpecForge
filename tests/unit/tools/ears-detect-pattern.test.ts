/**
 * Unit tests for detectPattern function
 *
 * Tests the Complex-first classification algorithm.
 * Requirements: 7.1-7.10
 */

import { describe, it, expect } from "vitest"
import { detectPattern } from "../../../.opencode/tools/lib/sf_ears_parser.ts"

describe("detectPattern", () => {
  describe("Basic pattern classification (strict mode)", () => {
    it("should classify Ubiquitous — starts with THE", () => {
      const result = detectPattern("THE system SHALL do something.", "strict")
      expect(result.pattern).toBe("Ubiquitous")
      expect(result.issues).toHaveLength(0)
    })

    it("should classify Event-driven — starts with WHEN", () => {
      const result = detectPattern("WHEN user clicks button, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Event-driven")
      expect(result.issues).toHaveLength(0)
    })

    it("should classify State-driven — starts with WHILE", () => {
      const result = detectPattern("WHILE system is active, THE system SHALL monitor.", "strict")
      expect(result.pattern).toBe("State-driven")
      expect(result.issues).toHaveLength(0)
    })

    it("should classify Optional-feature — starts with WHERE", () => {
      const result = detectPattern("WHERE feature is enabled, THE system SHALL display.", "strict")
      expect(result.pattern).toBe("Optional-feature")
      expect(result.issues).toHaveLength(0)
    })

    it("should classify Unwanted-behavior — starts with IF", () => {
      const result = detectPattern("IF error occurs, THEN THE system SHALL log.", "strict")
      expect(result.pattern).toBe("Unwanted-behavior")
      expect(result.issues).toHaveLength(0)
    })

    it("should return undefined and INVALID_PATTERN for unrecognized text", () => {
      const result = detectPattern("Some random text without EARS keywords.", "strict")
      expect(result.pattern).toBeUndefined()
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].code).toBe("INVALID_PATTERN")
      expect(result.issues[0].severity).toBe("blocking")
    })
  })

  describe("Complex pattern classification (strict mode)", () => {
    it("should classify Complex — WHERE + WHEN (2 condition clauses)", () => {
      const result = detectPattern("WHERE feature is enabled, WHEN user clicks, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Complex")
      expect(result.issues).toHaveLength(0)
    })

    it("should classify Complex — WHERE + WHILE + WHEN (3 condition clauses)", () => {
      const result = detectPattern("WHERE feature is enabled, WHILE system is active, WHEN event fires, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Complex")
      expect(result.issues).toHaveLength(0)
    })

    it("should classify Complex — WHILE + WHEN (correct order)", () => {
      const result = detectPattern("WHILE system is active, WHEN user clicks, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Complex")
      expect(result.issues).toHaveLength(0)
    })

    it("should report COMPLEX_WHEN_IF when both WHEN and IF are present", () => {
      const result = detectPattern("WHEN event fires, IF error occurs, THE system SHALL handle.", "strict")
      expect(result.pattern).toBe("Complex")
      expect(result.issues.some(i => i.code === "COMPLEX_WHEN_IF")).toBe(true)
      expect(result.issues.find(i => i.code === "COMPLEX_WHEN_IF")!.message).toBe("Complex 模式不允许同时使用 WHEN 和 IF")
    })

    it("should report COMPLEX_ORDER when clause order is violated (WHEN before WHERE)", () => {
      const result = detectPattern("WHEN event fires, WHERE feature is enabled, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Complex")
      expect(result.issues.some(i => i.code === "COMPLEX_ORDER")).toBe(true)
      expect(result.issues.find(i => i.code === "COMPLEX_ORDER")!.message).toBe("条件子句顺序错误")
    })

    it("should report COMPLEX_ORDER when WHILE comes before WHERE", () => {
      const result = detectPattern("WHILE active, WHERE feature enabled, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Complex")
      expect(result.issues.some(i => i.code === "COMPLEX_ORDER")).toBe(true)
    })

    it("should NOT report COMPLEX_ORDER for correct order WHERE → WHILE", () => {
      const result = detectPattern("WHERE feature enabled, WHILE active, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Complex")
      expect(result.issues.some(i => i.code === "COMPLEX_ORDER")).toBe(false)
    })

    it("should report both COMPLEX_WHEN_IF and COMPLEX_ORDER when applicable", () => {
      const result = detectPattern("IF error, WHEN event, WHERE feature, THE system SHALL handle.", "strict")
      expect(result.pattern).toBe("Complex")
      expect(result.issues.some(i => i.code === "COMPLEX_WHEN_IF")).toBe(true)
      expect(result.issues.some(i => i.code === "COMPLEX_ORDER")).toBe(true)
    })
  })

  describe("Complex-first priority", () => {
    it("should classify as Complex even when body starts with WHERE (which would be Optional-feature for single clause)", () => {
      const result = detectPattern("WHERE feature enabled, WHEN user clicks, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Complex")
      // Should NOT be "Optional-feature"
    })

    it("should classify as Complex even when body starts with WHILE (which would be State-driven for single clause)", () => {
      const result = detectPattern("WHILE active, WHEN event fires, THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Complex")
      // Should NOT be "State-driven"
    })
  })

  describe("Strict mode — case sensitivity", () => {
    it("should NOT match lowercase 'when' in strict mode", () => {
      const result = detectPattern("when user clicks, THE system SHALL respond.", "strict")
      // 'when' is lowercase, so in strict mode it won't match Event-driven
      // THE is not at the start of the string, so Ubiquitous won't match either
      // Result: INVALID_PATTERN
      expect(result.pattern).toBeUndefined()
      expect(result.issues.some(i => i.code === "INVALID_PATTERN")).toBe(true)
    })

    it("should NOT match lowercase 'where' in strict mode", () => {
      const result = detectPattern("where feature enabled, THE system SHALL respond.", "strict")
      // 'where' is lowercase, THE is not at start → INVALID_PATTERN
      expect(result.pattern).toBeUndefined()
      expect(result.issues.some(i => i.code === "INVALID_PATTERN")).toBe(true)
    })

    it("should NOT count lowercase condition clauses for Complex in strict mode", () => {
      const result = detectPattern("where feature enabled, when user clicks, THE system SHALL respond.", "strict")
      // lowercase 'where' and 'when' are not matched in strict mode
      // THE is not at start → INVALID_PATTERN
      expect(result.pattern).toBeUndefined()
      expect(result.issues.some(i => i.code === "INVALID_PATTERN")).toBe(true)
    })

    it("should match uppercase THE at start in strict mode", () => {
      const result = detectPattern("THE system SHALL respond.", "strict")
      expect(result.pattern).toBe("Ubiquitous")
      expect(result.issues).toHaveLength(0)
    })
  })

  describe("Legacy mode — case insensitivity", () => {
    it("should match lowercase 'when' in legacy mode", () => {
      const result = detectPattern("when user clicks, THE system SHALL respond.", "legacy")
      expect(result.pattern).toBe("Event-driven")
    })

    it("should match lowercase 'where' in legacy mode", () => {
      const result = detectPattern("where feature enabled, THE system SHALL respond.", "legacy")
      expect(result.pattern).toBe("Optional-feature")
    })

    it("should classify Complex with lowercase clauses in legacy mode", () => {
      const result = detectPattern("where feature enabled, when user clicks, THE system SHALL respond.", "legacy")
      expect(result.pattern).toBe("Complex")
    })

    it("should add warning for lowercase keywords in legacy mode", () => {
      const result = detectPattern("when user clicks, THE system SHALL respond.", "legacy")
      expect(result.pattern).toBe("Event-driven")
      expect(result.issues.some(i => i.severity === "warning")).toBe(true)
    })

    it("should NOT add warning when keywords are uppercase in legacy mode", () => {
      const result = detectPattern("WHEN user clicks, THE system SHALL respond.", "legacy")
      expect(result.pattern).toBe("Event-driven")
      expect(result.issues).toHaveLength(0)
    })

    it("should add warning for lowercase Complex clauses in legacy mode", () => {
      const result = detectPattern("where feature enabled, when user clicks, THE system SHALL respond.", "legacy")
      expect(result.pattern).toBe("Complex")
      expect(result.issues.some(i => i.severity === "warning")).toBe(true)
    })
  })

  describe("Legacy mode — severity", () => {
    it("should use 'warning' severity for INVALID_PATTERN in legacy mode", () => {
      const result = detectPattern("random text without keywords", "legacy")
      expect(result.pattern).toBeUndefined()
      expect(result.issues[0].severity).toBe("warning")
    })

    it("should use 'warning' severity for COMPLEX_WHEN_IF in legacy mode", () => {
      const result = detectPattern("WHEN event fires, IF error occurs, THE system SHALL handle.", "legacy")
      expect(result.issues.find(i => i.code === "COMPLEX_WHEN_IF")!.severity).toBe("warning")
    })

    it("should use 'warning' severity for COMPLEX_ORDER in legacy mode", () => {
      const result = detectPattern("WHEN event fires, WHERE feature enabled, THE system SHALL respond.", "legacy")
      expect(result.issues.find(i => i.code === "COMPLEX_ORDER")!.severity).toBe("warning")
    })
  })
})
