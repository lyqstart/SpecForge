/**
 * Unit tests for validateAllACs function
 *
 * Tests batch validation of all ACs extracted from requirements.md content.
 * Requirements: 2.1, 2.2, 2.5, 9.2
 */

import { describe, it, expect } from "vitest"
import { validateAllACs } from "../../../.opencode/tools/lib/sf_ears_parser.ts"

describe("validateAllACs", () => {
  describe("Normal validation of multiple ACs", () => {
    it("should validate multiple ACs from a document", () => {
      const content = `---
requirements_format: ears
---

### Requirement 1: Test

#### Acceptance Criteria

1. [Event-driven] WHEN user clicks, THE system SHALL respond.
2. [Ubiquitous] THE system SHALL log all actions.
3. [State-driven] WHILE connected, THE system SHALL sync data.
`
      const result = validateAllACs(content, "strict")
      expect(result.results).toHaveLength(3)
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].requirementId).toBe("Requirement 1")
      expect(result.sections[0].acCount).toBe(3)
      expect(result.emptyAcSectionIssue).toBeUndefined()
    })

    it("should validate ACs from multiple requirements", () => {
      const content = `### Requirement 1: First

#### Acceptance Criteria

1. [Event-driven] WHEN user clicks, THE system SHALL respond.

### Requirement 2: Second

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL log all actions.
2. [State-driven] WHILE connected, THE system SHALL sync data.
`
      const result = validateAllACs(content, "strict")
      expect(result.results).toHaveLength(3)
      expect(result.sections).toHaveLength(2)
      expect(result.sections[0].requirementId).toBe("Requirement 1")
      expect(result.sections[0].acCount).toBe(1)
      expect(result.sections[1].requirementId).toBe("Requirement 2")
      expect(result.sections[1].acCount).toBe(2)
    })

    it("should return pass status for valid EARS ACs in strict mode", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. [Event-driven] WHEN user clicks, THE system SHALL respond.
`
      const result = validateAllACs(content, "strict")
      expect(result.results[0].status).toBe("pass")
      expect(result.results[0].detectedPattern).toBe("Event-driven")
    })
  })

  describe("Empty AC section detection", () => {
    it("should report blocking issue in strict mode when AC section exists but has no ACs", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

Some text but no numbered items.
`
      const result = validateAllACs(content, "strict")
      expect(result.emptyAcSectionIssue).toBeDefined()
      expect(result.emptyAcSectionIssue!.code).toBe("EMPTY_AC")
      expect(result.emptyAcSectionIssue!.severity).toBe("blocking")
      expect(result.emptyAcSectionIssue!.message).toContain("AC section")
    })

    it("should report warning in legacy mode when AC section exists but has no ACs", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

Some text but no numbered items.
`
      const result = validateAllACs(content, "legacy")
      expect(result.emptyAcSectionIssue).toBeDefined()
      expect(result.emptyAcSectionIssue!.code).toBe("EMPTY_AC")
      expect(result.emptyAcSectionIssue!.severity).toBe("warning")
      expect(result.emptyAcSectionIssue!.message).toContain("AC section")
    })

    it("should report issue when multiple AC sections exist but all are empty", () => {
      const content = `### Requirement 1: First

#### Acceptance Criteria

### Requirement 2: Second

#### Acceptance Criteria

`
      const result = validateAllACs(content, "strict")
      expect(result.emptyAcSectionIssue).toBeDefined()
      expect(result.emptyAcSectionIssue!.severity).toBe("blocking")
      expect(result.sections).toHaveLength(2)
      expect(result.sections.every(s => s.acCount === 0)).toBe(true)
    })
  })

  describe("No AC section → no emptyAcSectionIssue", () => {
    it("should not report emptyAcSectionIssue when there is no AC section at all", () => {
      const content = `### Requirement 1: Test

Some description without an Acceptance Criteria section.
`
      const result = validateAllACs(content, "strict")
      expect(result.emptyAcSectionIssue).toBeUndefined()
      expect(result.results).toHaveLength(0)
      expect(result.sections).toHaveLength(0)
    })

    it("should not report emptyAcSectionIssue for empty document", () => {
      const result = validateAllACs("", "strict")
      expect(result.emptyAcSectionIssue).toBeUndefined()
      expect(result.results).toHaveLength(0)
      expect(result.sections).toHaveLength(0)
    })
  })

  describe("Exception isolation", () => {
    it("should continue validating other ACs even if one has issues", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. random text without any EARS keywords
2. [Event-driven] WHEN user clicks, THE system SHALL respond.
3. another invalid AC text
`
      const result = validateAllACs(content, "strict")
      expect(result.results).toHaveLength(3)
      // First AC should fail
      expect(result.results[0].status).toBe("fail")
      // Second AC should pass
      expect(result.results[1].status).toBe("pass")
      // Third AC should fail
      expect(result.results[2].status).toBe("fail")
    })

    it("should not crash when processing ACs with special characters", () => {
      const content = [
        "### Requirement 1: Test",
        "",
        "#### Acceptance Criteria",
        "",
        "1. [Event-driven] WHEN user types .*+?^${}()|[], THE system SHALL respond.",
        "2. [Ubiquitous] THE system SHALL handle " + String.fromCharCode(0, 1) + " control chars.",
      ].join("\n")
      const result = validateAllACs(content, "strict")
      expect(result.results).toHaveLength(2)
      // Both should produce valid results (not crash)
      expect(result.results[0]).toBeDefined()
      expect(result.results[1]).toBeDefined()
    })
  })

  describe("Results include all ACs from all requirements", () => {
    it("should include results for every AC across all requirement sections", () => {
      const content = `### Requirement 1: Auth

#### Acceptance Criteria

1. [Event-driven] WHEN user logs in, THE system SHALL create session.
2. [Unwanted-behavior] IF login fails, THEN THE system SHALL show error.

### Requirement 2: Data

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL encrypt data at rest.

### Requirement 3: Performance

#### Acceptance Criteria

1. [State-driven] WHILE under load, THE system SHALL maintain response time.
2. [Optional-feature] WHERE caching is enabled, THE system SHALL use cache.
3. [Complex] WHERE caching is enabled, WHEN data changes, THE system SHALL invalidate cache.
`
      const result = validateAllACs(content, "strict")
      expect(result.results).toHaveLength(6)
      expect(result.sections).toHaveLength(3)

      // Verify patterns detected
      expect(result.results[0].detectedPattern).toBe("Event-driven")
      expect(result.results[1].detectedPattern).toBe("Unwanted-behavior")
      expect(result.results[2].detectedPattern).toBe("Ubiquitous")
      expect(result.results[3].detectedPattern).toBe("State-driven")
      expect(result.results[4].detectedPattern).toBe("Optional-feature")
      expect(result.results[5].detectedPattern).toBe("Complex")
    })
  })

  describe("Mode-dependent behavior", () => {
    it("should produce warning severity in legacy mode for invalid ACs", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. invalid text without EARS keywords
`
      const result = validateAllACs(content, "legacy")
      expect(result.results[0].status).toBe("warning")
      expect(result.results[0].issues.every(i => i.severity === "warning")).toBe(true)
    })

    it("should produce blocking severity in strict mode for invalid ACs", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. invalid text without EARS keywords
`
      const result = validateAllACs(content, "strict")
      expect(result.results[0].status).toBe("fail")
      expect(result.results[0].issues.some(i => i.severity === "blocking")).toBe(true)
    })
  })
})
