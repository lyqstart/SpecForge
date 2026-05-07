/**
 * Unit tests for EARS Gate integration — checkEarsCompliance function
 *
 * Tests the integration point between the EARS parser and the Gate system.
 * Validates backward compatibility, strict/legacy mode behavior, file size limits,
 * and the EarsGateDetails return structure.
 *
 * Requirements: 2.3, 4.1, 4.2, 9.4, 10.4
 */

import { describe, it, expect } from "vitest"
import { checkEarsCompliance } from "../../../.opencode/tools/lib/sf_ears_parser.ts"

describe("checkEarsCompliance — Gate Integration", () => {
  describe("Backward compatibility", () => {
    it("should not produce blocking_issues for document without front-matter", () => {
      const content = `# Requirements

## Glossary

- **System**: The application under test

### Requirement 1: Basic Feature

**User Story:** As a user, I want to do something.

#### Acceptance Criteria

1. The system should do something when triggered.
2. Users can log in with valid credentials.
`
      const result = checkEarsCompliance(content)
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.details.mode).toBe("legacy")
    })

    it("should not produce blocking_issues for document with requirements_format: legacy", () => {
      const content = `---
requirements_format: legacy
---

### Requirement 1: Basic Feature

**User Story:** As a user, I want to do something.

#### Acceptance Criteria

1. The system should do something when triggered.
2. Users can log in with valid credentials.
`
      const result = checkEarsCompliance(content)
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.details.mode).toBe("legacy")
    })
  })

  describe("Strict mode blocking", () => {
    it("should produce blocking_issues for invalid ACs in strict mode", () => {
      const content = `---
requirements_format: ears
---

### Requirement 1: Auth

#### Acceptance Criteria

1. The system should do something without EARS keywords.
2. Users can log in with valid credentials.
`
      const result = checkEarsCompliance(content)
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(result.details.mode).toBe("strict")
      expect(result.details.failed).toBeGreaterThan(0)
    })

    it("should pass with no blocking_issues for valid EARS ACs in strict mode", () => {
      const content = `---
requirements_format: ears
---

### Requirement 1: Auth

#### Acceptance Criteria

1. [Event-driven] WHEN user submits login form, THE system SHALL authenticate credentials.
2. [Ubiquitous] THE system SHALL log all authentication attempts.
3. [Unwanted-behavior] IF authentication fails, THEN THE system SHALL display error message.
`
      const result = checkEarsCompliance(content)
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.details.mode).toBe("strict")
      expect(result.details.passed).toBe(3)
      expect(result.details.failed).toBe(0)
    })
  })

  describe("Legacy mode warnings only", () => {
    it("should produce only warnings (no blocking_issues) for invalid ACs in legacy mode", () => {
      const content = `---
requirements_format: legacy
---

### Requirement 1: Auth

#### Acceptance Criteria

1. The system should do something without proper EARS format.
2. Users can log in with valid credentials.
`
      const result = checkEarsCompliance(content)
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.details.mode).toBe("legacy")
    })
  })

  describe("Invalid format value", () => {
    it("should produce blocking_issues when requirements_format has invalid value", () => {
      const content = `---
requirements_format: foo
---

### Requirement 1: Test

#### Acceptance Criteria

1. [Event-driven] WHEN user clicks, THE system SHALL respond.
`
      const result = checkEarsCompliance(content)
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(result.blocking_issues[0]).toContain("foo")
      // When format is invalid, details should reflect strict mode with 0 ACs processed
      expect(result.details.mode).toBe("strict")
      expect(result.details.total_acs).toBe(0)
    })
  })

  describe("EarsGateDetails structure", () => {
    it("should return details with all required fields", () => {
      const content = `---
requirements_format: ears
---

### Requirement 1: Test

#### Acceptance Criteria

1. [Event-driven] WHEN user clicks, THE system SHALL respond.
2. [Ubiquitous] THE system SHALL log actions.
3. random text without EARS keywords
`
      const result = checkEarsCompliance(content)

      // Verify details structure
      expect(result.details).toBeDefined()
      expect(result.details).toHaveProperty("mode")
      expect(result.details).toHaveProperty("total_acs")
      expect(result.details).toHaveProperty("passed")
      expect(result.details).toHaveProperty("warnings")
      expect(result.details).toHaveProperty("failed")
      expect(result.details).toHaveProperty("results")

      // Verify types
      expect(typeof result.details.mode).toBe("string")
      expect(typeof result.details.total_acs).toBe("number")
      expect(typeof result.details.passed).toBe("number")
      expect(typeof result.details.warnings).toBe("number")
      expect(typeof result.details.failed).toBe("number")
      expect(Array.isArray(result.details.results)).toBe(true)

      // Verify counts add up
      expect(result.details.total_acs).toBe(3)
      expect(result.details.passed + result.details.warnings + result.details.failed).toBe(
        result.details.total_acs
      )
    })

    it("should include per-AC results in details.results", () => {
      const content = `---
requirements_format: ears
---

### Requirement 1: Test

#### Acceptance Criteria

1. [Event-driven] WHEN user clicks, THE system SHALL respond.
`
      const result = checkEarsCompliance(content)
      expect(result.details.results).toHaveLength(1)

      const acResult = result.details.results[0]
      expect(acResult).toHaveProperty("index")
      expect(acResult).toHaveProperty("raw")
      expect(acResult).toHaveProperty("status")
      expect(acResult).toHaveProperty("issues")
      expect(acResult.index).toBe(1)
      expect(acResult.status).toBe("pass")
      expect(acResult.detectedPattern).toBe("Event-driven")
    })
  })

  describe("Empty AC section in strict mode", () => {
    it("should produce blocking_issues when AC section exists but has no items", () => {
      const content = `---
requirements_format: ears
---

### Requirement 1: Test

#### Acceptance Criteria

Some descriptive text but no numbered AC items here.
`
      const result = checkEarsCompliance(content)
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      // The blocking issue should mention the empty AC section
      expect(result.blocking_issues.some(issue => issue.includes("AC section"))).toBe(true)
    })

    it("should produce blocking_issues when AC section is completely empty", () => {
      const content = `---
requirements_format: ears
---

### Requirement 1: Test

#### Acceptance Criteria

`
      const result = checkEarsCompliance(content)
      expect(result.blocking_issues.length).toBeGreaterThan(0)
    })
  })

  describe("Multiple requirements with mixed valid/invalid ACs", () => {
    it("should report correct counts in details for mixed valid/invalid ACs", () => {
      const content = `---
requirements_format: ears
---

### Requirement 1: Auth

#### Acceptance Criteria

1. [Event-driven] WHEN user logs in, THE system SHALL create session.
2. [Ubiquitous] THE system SHALL encrypt passwords.

### Requirement 2: Data

#### Acceptance Criteria

1. random invalid text without EARS structure
2. [State-driven] WHILE connected, THE system SHALL sync data.
3. another invalid AC without keywords
`
      const result = checkEarsCompliance(content)

      // Total ACs across both requirements
      expect(result.details.total_acs).toBe(5)

      // 3 valid ACs (Req1: 2 valid, Req2: 1 valid)
      expect(result.details.passed).toBe(3)

      // 2 invalid ACs (Req2: AC 1 and AC 3)
      expect(result.details.failed).toBe(2)

      // Should have blocking issues for the invalid ACs
      expect(result.blocking_issues.length).toBeGreaterThan(0)

      // Verify results array has entries for all ACs
      expect(result.details.results).toHaveLength(5)
    })
  })
})
