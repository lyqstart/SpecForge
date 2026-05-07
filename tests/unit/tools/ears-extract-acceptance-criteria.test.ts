/**
 * Unit tests for extractAcceptanceCriteria function
 *
 * Tests the AC extraction logic including:
 * - Basic extraction from #### Acceptance Criteria sections
 * - Fenced code block ignoring
 * - Section boundary detection (### Requirement or higher-level headings)
 * - Multi-line AC continuation
 * - CRLF and LF support
 * - Empty/missing AC section handling
 * - Distinguishing "no AC section" from "AC section with no items"
 *
 * Requirements: 2.1, 9.2
 */

import { describe, it, expect } from "vitest"
import { extractAcceptanceCriteria } from "../../../.opencode/tools/lib/sf_ears_parser.ts"

describe("extractAcceptanceCriteria", () => {
  describe("basic extraction", () => {
    it("should extract numbered AC items from a single requirement", () => {
      const content = `### Requirement 1: User Login

#### Acceptance Criteria

1. [Event-driven] WHEN the user submits credentials, THE system SHALL authenticate.
2. [Ubiquitous] THE system SHALL log all login attempts.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(2)
      expect(result.acs[0].requirementId).toBe("Requirement 1")
      expect(result.acs[0].index).toBe(1)
      expect(result.acs[0].raw).toBe("1. [Event-driven] WHEN the user submits credentials, THE system SHALL authenticate.")
      expect(result.acs[1].index).toBe(2)
      expect(result.acs[1].raw).toBe("2. [Ubiquitous] THE system SHALL log all login attempts.")

      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].requirementId).toBe("Requirement 1")
      expect(result.sections[0].acCount).toBe(2)
    })

    it("should extract AC from multiple requirements", () => {
      const content = `### Requirement 1: Login

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL validate input.

### Requirement 2: Logout

#### Acceptance Criteria

1. [Event-driven] WHEN the user clicks logout, THE system SHALL end the session.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(2)
      expect(result.acs[0].requirementId).toBe("Requirement 1")
      expect(result.acs[1].requirementId).toBe("Requirement 2")

      expect(result.sections).toHaveLength(2)
      expect(result.sections[0].requirementId).toBe("Requirement 1")
      expect(result.sections[0].acCount).toBe(1)
      expect(result.sections[1].requirementId).toBe("Requirement 2")
      expect(result.sections[1].acCount).toBe(1)
    })
  })

  describe("fenced code block handling", () => {
    it("should ignore numbered items inside fenced code blocks", () => {
      const content = `### Requirement 1: Example

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL process data.

\`\`\`markdown
2. [Event-driven] WHEN something happens, THE system SHALL respond.
3. [Ubiquitous] THE system SHALL do something.
\`\`\`

4. [State-driven] WHILE active, THE system SHALL monitor.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(2)
      expect(result.acs[0].raw).toBe("1. [Ubiquitous] THE system SHALL process data.")
      expect(result.acs[1].raw).toBe("4. [State-driven] WHILE active, THE system SHALL monitor.")
      expect(result.acs[1].index).toBe(2) // index is sequential within section
    })

    it("should handle nested code blocks correctly", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL work.

\`\`\`
This is code
\`\`\`

2. [Ubiquitous] THE system SHALL also work.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(2)
      expect(result.acs[0].index).toBe(1)
      expect(result.acs[1].index).toBe(2)
    })
  })

  describe("section boundary detection", () => {
    it("should stop extraction at next ### Requirement heading", () => {
      const content = `### Requirement 1: First

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL do A.

### Requirement 2: Second

Some description here.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(1)
      expect(result.acs[0].requirementId).toBe("Requirement 1")
      expect(result.sections).toHaveLength(1)
    })

    it("should stop extraction at higher-level headings", () => {
      const content = `### Requirement 1: First

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL do A.

## Another Section

Some content.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(1)
      expect(result.sections).toHaveLength(1)
    })

    it("should stop extraction at same-level headings (###)", () => {
      const content = `### Requirement 1: First

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL do A.

### Some Other Section

Content.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(1)
      expect(result.sections).toHaveLength(1)
    })
  })

  describe("multi-line AC continuation", () => {
    it("should merge continuation lines into the previous AC", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. [Complex] WHERE the feature is enabled, WHEN the user submits,
   THE system SHALL validate the input
   and return a response.
2. [Ubiquitous] THE system SHALL log.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(2)
      expect(result.acs[0].raw).toBe(
        "1. [Complex] WHERE the feature is enabled, WHEN the user submits,\n" +
        "   THE system SHALL validate the input\n" +
        "   and return a response."
      )
      expect(result.acs[0].lineStart).toBe(5)
      expect(result.acs[0].lineEnd).toBe(7)
      expect(result.acs[1].raw).toBe("2. [Ubiquitous] THE system SHALL log.")
    })

    it("should not treat empty lines as continuation", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL do A.

2. [Ubiquitous] THE system SHALL do B.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(2)
      expect(result.acs[0].raw).toBe("1. [Ubiquitous] THE system SHALL do A.")
      expect(result.acs[1].raw).toBe("2. [Ubiquitous] THE system SHALL do B.")
    })
  })

  describe("CRLF and LF support", () => {
    it("should handle CRLF line endings", () => {
      const content = "### Requirement 1: Test\r\n\r\n#### Acceptance Criteria\r\n\r\n1. [Ubiquitous] THE system SHALL work.\r\n2. [Event-driven] WHEN x, THE system SHALL y.\r\n"

      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(2)
      expect(result.acs[0].raw).toBe("1. [Ubiquitous] THE system SHALL work.")
      expect(result.acs[1].raw).toBe("2. [Event-driven] WHEN x, THE system SHALL y.")
    })

    it("should handle mixed CRLF and LF", () => {
      const content = "### Requirement 1: Test\r\n\n#### Acceptance Criteria\r\n\n1. [Ubiquitous] THE system SHALL work.\n"

      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(1)
      expect(result.acs[0].raw).toBe("1. [Ubiquitous] THE system SHALL work.")
    })
  })

  describe("empty/missing AC section handling", () => {
    it("should return empty arrays when no AC section exists", () => {
      const content = `### Requirement 1: Test

Some description without acceptance criteria.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(0)
      expect(result.sections).toHaveLength(0)
    })

    it("should distinguish 'no AC section' from 'AC section with no items'", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

### Requirement 2: Another
`
      const result = extractAcceptanceCriteria(content)

      // AC section exists but has no items
      expect(result.acs).toHaveLength(0)
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].requirementId).toBe("Requirement 1")
      expect(result.sections[0].acCount).toBe(0)
    })

    it("should handle empty document", () => {
      const result = extractAcceptanceCriteria("")

      expect(result.acs).toHaveLength(0)
      expect(result.sections).toHaveLength(0)
    })

    it("should handle document with only front-matter", () => {
      const content = `---
requirements_format: ears
---
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(0)
      expect(result.sections).toHaveLength(0)
    })
  })

  describe("line number tracking", () => {
    it("should correctly track line numbers (1-based)", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL do A.
2. [Ubiquitous] THE system SHALL do B.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs[0].lineStart).toBe(5)
      expect(result.acs[0].lineEnd).toBe(5)
      expect(result.acs[1].lineStart).toBe(6)
      expect(result.acs[1].lineEnd).toBe(6)
    })

    it("should track section lineStart correctly", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL work.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.sections[0].lineStart).toBe(3)
    })
  })

  describe("edge cases", () => {
    it("should handle AC section at end of file without trailing newline", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL work.`

      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(1)
      expect(result.acs[0].raw).toBe("1. [Ubiquitous] THE system SHALL work.")
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].acCount).toBe(1)
    })

    it("should handle requirement with dotted numbering (e.g., 1.1)", () => {
      const content = `### Requirement 1.1: Sub-requirement

#### Acceptance Criteria

1. [Ubiquitous] THE system SHALL work.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(1)
      expect(result.acs[0].requirementId).toBe("Requirement 1.1")
    })

    it("should not extract items that don't match numbered format", () => {
      const content = `### Requirement 1: Test

#### Acceptance Criteria

- Bullet item should be ignored
* Another bullet
1. [Ubiquitous] THE system SHALL work.
`
      const result = extractAcceptanceCriteria(content)

      expect(result.acs).toHaveLength(1)
      expect(result.acs[0].raw).toBe("1. [Ubiquitous] THE system SHALL work.")
    })
  })
})
