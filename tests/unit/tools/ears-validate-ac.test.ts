/**
 * Unit tests for validateAC function
 *
 * Tests the four-step pipeline: strip prefixes → detect pattern → compare labels → generate result
 * Requirements: 2.1, 2.2, 2.5, 2.6, 8.1-8.6
 */

import { describe, it, expect } from "vitest"
import { validateAC } from "../../../.opencode/tools/lib/sf_ears_parser.ts"

describe("validateAC", () => {
  describe("Empty AC detection", () => {
    it("should return EMPTY_AC for empty string", () => {
      const result = validateAC("", 1, "strict")
      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].code).toBe("EMPTY_AC")
      expect(result.issues[0].severity).toBe("blocking")
      expect(result.issues[0].message).toBe("AC 内容为空")
    })

    it("should return EMPTY_AC for whitespace-only string", () => {
      const result = validateAC("   \t  ", 1, "strict")
      expect(result.status).toBe("fail")
      expect(result.issues[0].code).toBe("EMPTY_AC")
    })

    it("should return warning for empty AC in legacy mode", () => {
      const result = validateAC("", 1, "legacy")
      expect(result.status).toBe("warning")
      expect(result.issues[0].severity).toBe("warning")
    })
  })

  describe("AC too long detection", () => {
    it("should return AC_TOO_LONG for AC exceeding 2000 characters", () => {
      const longAC = "WHEN " + "x".repeat(2001)
      const result = validateAC(longAC, 1, "strict")
      expect(result.status).toBe("fail")
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].code).toBe("AC_TOO_LONG")
      expect(result.issues[0].severity).toBe("blocking")
    })

    it("should return warning for too-long AC in legacy mode", () => {
      const longAC = "WHEN " + "x".repeat(2001)
      const result = validateAC(longAC, 1, "legacy")
      expect(result.status).toBe("warning")
      expect(result.issues[0].severity).toBe("warning")
    })

    it("should NOT flag AC at exactly 2000 characters", () => {
      const ac = "WHEN " + "x".repeat(1990) + ", THE system SHALL respond."
      // Ensure it's <= 2000 chars
      const trimmed = ac.slice(0, 2000)
      const result = validateAC(trimmed, 1, "strict")
      expect(result.issues.some(i => i.code === "AC_TOO_LONG")).toBe(false)
    })
  })

  describe("INVALID_LABEL detection", () => {
    it("should return INVALID_LABEL for non-standard pattern label", () => {
      const result = validateAC("1. [FooBar] THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "INVALID_LABEL")).toBe(true)
      expect(result.issues.find(i => i.code === "INVALID_LABEL")!.message).toContain("FooBar")
    })

    it("should NOT return INVALID_LABEL for valid pattern label", () => {
      const result = validateAC("1. [Event-driven] WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "INVALID_LABEL")).toBe(false)
    })

    it("should NOT return INVALID_LABEL when no label is present", () => {
      const result = validateAC("1. WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "INVALID_LABEL")).toBe(false)
    })
  })

  describe("Structural error: MISSING_SHALL", () => {
    it("should report MISSING_SHALL when body lacks SHALL", () => {
      const result = validateAC("WHEN user clicks, THE system will respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_SHALL")).toBe(true)
      expect(result.issues.find(i => i.code === "MISSING_SHALL")!.message).toBe("缺少 SHALL 关键词")
    })

    it("should NOT report MISSING_SHALL when body contains SHALL", () => {
      const result = validateAC("WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_SHALL")).toBe(false)
    })

    it("should detect lowercase 'shall' in legacy mode", () => {
      const result = validateAC("WHEN user clicks, THE system shall respond.", 1, "legacy")
      expect(result.issues.some(i => i.code === "MISSING_SHALL")).toBe(false)
    })
  })

  describe("Structural error: MISSING_THE", () => {
    it("should report MISSING_THE when body lacks THE", () => {
      const result = validateAC("WHEN user clicks, system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_THE")).toBe(true)
      expect(result.issues.find(i => i.code === "MISSING_THE")!.message).toBe("缺少 THE 关键词")
    })

    it("should NOT report MISSING_THE when body contains THE", () => {
      const result = validateAC("WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_THE")).toBe(false)
    })
  })

  describe("Structural error: MISSING_THEN", () => {
    it("should report MISSING_THEN for IF pattern without THEN", () => {
      const result = validateAC("IF error occurs, THE system SHALL log.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_THEN")).toBe(true)
      expect(result.issues.find(i => i.code === "MISSING_THEN")!.message).toBe("IF 模式缺少 THEN")
    })

    it("should NOT report MISSING_THEN for IF pattern with THEN", () => {
      const result = validateAC("IF error occurs, THEN THE system SHALL log.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_THEN")).toBe(false)
    })

    it("should NOT report MISSING_THEN for non-IF patterns", () => {
      const result = validateAC("WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_THEN")).toBe(false)
    })
  })

  describe("Structural error: MISSING_COMMA", () => {
    it("should report MISSING_COMMA when condition clause lacks comma before THE", () => {
      const result = validateAC("WHEN user clicks THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_COMMA")).toBe(true)
      expect(result.issues.find(i => i.code === "MISSING_COMMA")!.message).toBe("条件子句后缺少逗号")
    })

    it("should NOT report MISSING_COMMA when comma is present before THE", () => {
      const result = validateAC("WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_COMMA")).toBe(false)
    })

    it("should NOT report MISSING_COMMA for Ubiquitous pattern", () => {
      const result = validateAC("THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_COMMA")).toBe(false)
    })

    it("should report MISSING_COMMA for IF without comma before THEN", () => {
      const result = validateAC("IF error occurs THEN THE system SHALL log.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_COMMA")).toBe(true)
    })
  })

  describe("LABEL_MISMATCH detection", () => {
    it("should report LABEL_MISMATCH when declared and detected patterns differ", () => {
      const result = validateAC("[Event-driven] THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "LABEL_MISMATCH")).toBe(true)
      expect(result.issues.find(i => i.code === "LABEL_MISMATCH")!.message).toContain("Event-driven")
      expect(result.issues.find(i => i.code === "LABEL_MISMATCH")!.message).toContain("Ubiquitous")
    })

    it("should NOT report LABEL_MISMATCH when declared and detected patterns match", () => {
      const result = validateAC("[Event-driven] WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "LABEL_MISMATCH")).toBe(false)
    })

    it("should NOT report LABEL_MISMATCH when no declared pattern", () => {
      const result = validateAC("WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.issues.some(i => i.code === "LABEL_MISMATCH")).toBe(false)
    })
  })

  describe("Overall status determination", () => {
    it("should return 'pass' for valid AC in strict mode", () => {
      const result = validateAC("[Event-driven] WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should return 'fail' when any issue is blocking", () => {
      const result = validateAC("random text without keywords", 1, "strict")
      expect(result.status).toBe("fail")
    })

    it("should return 'warning' when issues are warnings only", () => {
      const result = validateAC("random text without keywords", 1, "legacy")
      expect(result.status).toBe("warning")
    })
  })

  describe("Mode-dependent severity", () => {
    it("strict mode: all issues should be blocking", () => {
      const result = validateAC("random text", 1, "strict")
      result.issues.forEach(issue => {
        expect(issue.severity).toBe("blocking")
      })
    })

    it("legacy mode: all issues should be warning", () => {
      const result = validateAC("random text", 1, "legacy")
      result.issues.forEach(issue => {
        expect(issue.severity).toBe("warning")
      })
    })
  })

  describe("Result structure", () => {
    it("should include index and raw in result", () => {
      const raw = "[Event-driven] WHEN user clicks, THE system SHALL respond."
      const result = validateAC(raw, 5, "strict")
      expect(result.index).toBe(5)
      expect(result.raw).toBe(raw)
    })

    it("should include declaredPattern when label is present", () => {
      const result = validateAC("[Event-driven] WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.declaredPattern).toBe("Event-driven")
    })

    it("should include detectedPattern from body analysis", () => {
      const result = validateAC("WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.detectedPattern).toBe("Event-driven")
    })

    it("should have undefined declaredPattern when no label", () => {
      const result = validateAC("WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.declaredPattern).toBeUndefined()
    })
  })

  describe("Special character safety", () => {
    it("should handle regex metacharacters in AC content without crashing", () => {
      const result = validateAC("WHEN user types .*+?^${}()|[], THE system SHALL respond.", 1, "strict")
      expect(result).toBeDefined()
      expect(result.index).toBe(1)
    })

    it("should handle unicode control characters without crashing", () => {
      const result = validateAC("WHEN user inputs \x00\x01\x02, THE system SHALL respond.", 1, "strict")
      expect(result).toBeDefined()
    })

    it("should handle backslashes in AC content", () => {
      const result = validateAC("WHEN path is C:\\Users\\test, THE system SHALL respond.", 1, "strict")
      expect(result).toBeDefined()
    })
  })

  describe("Integration: full pipeline with numbered AC", () => {
    it("should handle numbered AC with valid pattern label", () => {
      const result = validateAC("1. [Event-driven] WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.status).toBe("pass")
      expect(result.declaredPattern).toBe("Event-driven")
      expect(result.detectedPattern).toBe("Event-driven")
    })

    it("should handle numbered AC without pattern label", () => {
      const result = validateAC("1. WHEN user clicks, THE system SHALL respond.", 1, "strict")
      expect(result.status).toBe("pass")
      expect(result.declaredPattern).toBeUndefined()
      expect(result.detectedPattern).toBe("Event-driven")
    })

    it("should detect multiple issues simultaneously", () => {
      // IF without THEN, missing SHALL, missing comma
      const result = validateAC("IF error occurs THE system will log.", 1, "strict")
      expect(result.issues.some(i => i.code === "MISSING_SHALL")).toBe(true)
      expect(result.issues.some(i => i.code === "MISSING_THEN")).toBe(true)
      expect(result.issues.some(i => i.code === "MISSING_COMMA")).toBe(true)
    })
  })
})
