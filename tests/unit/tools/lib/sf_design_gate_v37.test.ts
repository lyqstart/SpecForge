/**
 * Unit tests for sf_design_gate V3.7 changes
 * Tests extractCPTestTypes() and checkDesignGate() behavior for Correctness Properties test_type validation
 *
 * Requirements: REQ-9 AC-8
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { extractCPTestTypes, checkDesignGate } from "../../../../.opencode/tools/lib/sf_design_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ============================================================
// extractCPTestTypes — direct unit tests
// ============================================================

describe("extractCPTestTypes", () => {
  describe("valid test_type values", () => {
    it("should extract 'unit' as valid test_type", () => {
      const content = `
## Correctness Properties

#### CP-1 Some property
- **test_type**: unit
- **property**: something
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ cpId: "CP-1", testType: "unit" })
    })

    it("should extract 'property' as valid test_type", () => {
      const content = `
#### CP-2 Round-trip consistency
- **test_type**: property
- **test_file**: tests/property/config.property.test.ts
- **property**: round-trip
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].cpId).toBe("CP-2")
      expect(result[0].testType).toBe("property")
      expect(result[0].testFile).toBe("tests/property/config.property.test.ts")
    })

    it("should extract 'integration' as valid test_type", () => {
      const content = `
#### CP-3 Integration flow
- **test_type**: integration
- **requirement_ref**: REQ-5
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].cpId).toBe("CP-3")
      expect(result[0].testType).toBe("integration")
      expect(result[0].requirementRef).toBe("REQ-5")
    })

    it("should extract 'e2e' as valid test_type", () => {
      const content = `
#### CP-4 End-to-end scenario
- **test_type**: e2e
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ cpId: "CP-4", testType: "e2e" })
    })

    it("should extract 'regression' as valid test_type", () => {
      const content = `
#### CP-5 Regression guard
- **test_type**: regression
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ cpId: "CP-5", testType: "regression" })
    })

    it("should extract multiple CPs with different valid test_types", () => {
      const content = `
## Correctness Properties

#### CP-1 Unit check
- **test_type**: unit

#### CP-2 Property check
- **test_type**: property
- **test_file**: tests/property/foo.property.test.ts

#### CP-3 Integration check
- **test_type**: integration
- **requirement_ref**: REQ-1
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(3)
      expect(result[0].testType).toBe("unit")
      expect(result[1].testType).toBe("property")
      expect(result[2].testType).toBe("integration")
    })
  })

  describe("invalid test_type values", () => {
    it("should extract invalid test_type 'fast-check' (gate will reject it)", () => {
      const content = `
#### CP-1 Bad type
- **test_type**: fast-check
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].testType).toBe("fast-check")
    })

    it("should extract invalid test_type 'smoke' (gate will reject it)", () => {
      const content = `
#### CP-1 Smoke test
- **test_type**: smoke
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].testType).toBe("smoke")
    })
  })

  describe("test_file optional field", () => {
    it("should return undefined testFile when not declared", () => {
      const content = `
#### CP-1 No test file
- **test_type**: unit
- **property**: something
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].testFile).toBeUndefined()
    })

    it("should extract test_file when declared", () => {
      const content = `
#### CP-1 With test file
- **test_type**: property
- **test_file**: tests/property/my_test.property.test.ts
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].testFile).toBe("tests/property/my_test.property.test.ts")
    })
  })

  describe("requirement_ref field", () => {
    it("should return undefined requirementRef when not declared", () => {
      const content = `
#### CP-1 No ref
- **test_type**: unit
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].requirementRef).toBeUndefined()
    })

    it("should extract requirement_ref when declared", () => {
      const content = `
#### CP-1 With ref
- **test_type**: unit
- **requirement_ref**: REQ-3
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].requirementRef).toBe("REQ-3")
    })
  })

  describe("no CP sections", () => {
    it("should return empty array when no CP headings exist", () => {
      const content = `
## Design Document

### Architecture

Some architecture description.

### Data Model

Some data model.
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(0)
    })

    it("should return empty array for empty content", () => {
      const result = extractCPTestTypes("")
      expect(result).toHaveLength(0)
    })
  })

  describe("CP without test_type", () => {
    it("should skip CPs that have no test_type field", () => {
      const content = `
#### CP-1 Has test_type
- **test_type**: unit

#### CP-2 No test_type
- **property**: some invariant
`
      const result = extractCPTestTypes(content)
      expect(result).toHaveLength(1)
      expect(result[0].cpId).toBe("CP-1")
    })
  })
})

// ============================================================
// checkDesignGate — integration tests with mock files (V3.7 behavior)
// ============================================================

describe("checkDesignGate - V3.7 test_type validation", () => {
  const testDir = join(tmpdir(), `specforge-design-gate-v37-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = "WI-V37-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)
  const configDir = join(testDir, "specforge", "config")

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
    await mkdir(configDir, { recursive: true })
    // Disable KG to simplify tests
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ knowledge_graph_enabled: false }),
      "utf-8"
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("valid test_type values → pass", () => {
    it("should pass when all CP test_type values are valid", async () => {
      const designContent = `# Design

## Overview

Based on 需求 1 requirements.

## Correctness Properties

#### CP-1 Round-trip
- **test_type**: property
- **test_file**: tests/property/roundtrip.property.test.ts
- **requirement_ref**: REQ-1

#### CP-2 Unit validation
- **test_type**: unit
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })

    it("should pass with all 5 valid test_type values", async () => {
      const designContent = `# Design

Based on 需求 1.

#### CP-1 Unit
- **test_type**: unit

#### CP-2 Property
- **test_type**: property

#### CP-3 Integration
- **test_type**: integration

#### CP-4 E2E
- **test_type**: e2e

#### CP-5 Regression
- **test_type**: regression
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })

  describe("invalid test_type values → fail", () => {
    it("should fail when test_type is 'fast-check'", async () => {
      const designContent = `# Design

Based on 需求 1.

#### CP-1 Bad type
- **test_type**: fast-check
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(result.blocking_issues[0]).toContain("CP-1")
      expect(result.blocking_issues[0]).toContain("fast-check")
    })

    it("should fail when test_type is 'smoke'", async () => {
      const designContent = `# Design

Based on 需求 1.

#### CP-1 Smoke
- **test_type**: smoke
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("CP-1")
      expect(result.blocking_issues[0]).toContain("smoke")
    })

    it("should fail when one of multiple CPs has invalid test_type", async () => {
      const designContent = `# Design

Based on 需求 1.

#### CP-1 Valid
- **test_type**: unit

#### CP-2 Invalid
- **test_type**: acceptance
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      expect(result.status).toBe("fail")
      expect(result.blocking_issues.some(i => i.includes("CP-2"))).toBe(true)
      expect(result.blocking_issues.some(i => i.includes("acceptance"))).toBe(true)
    })
  })

  describe("test_file missing (optional) → pass", () => {
    it("should pass when CP has test_type but no test_file", async () => {
      const designContent = `# Design

Based on 需求 1.

#### CP-1 No test file
- **test_type**: unit
- **property**: some invariant
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      expect(result.status).toBe("pass")
    })
  })

  describe("requirement_ref referencing non-existent REQ-N → warning (not fail)", () => {
    it("should pass (not fail) when requirement_ref references a REQ that does not exist in requirements.md", async () => {
      // The design gate does NOT cross-file validate requirement_ref.
      // It only does local syntax checks. So any requirement_ref value is accepted.
      const designContent = `# Design

Based on 需求 1.

#### CP-1 With non-existent ref
- **test_type**: unit
- **requirement_ref**: REQ-999
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      // Per REQ-2 AC-7: sf_design_gate only does local syntax check, does not cross-file validate
      // So referencing a non-existent REQ-N should NOT cause fail
      expect(result.status).toBe("pass")
    })
  })

  describe("no CP sections → pass (no new checks triggered)", () => {
    it("should pass when design.md has no CP sections at all", async () => {
      const designContent = `# Design Document

## Overview

Based on 需求 1 and 需求 2.

## Architecture

System uses layered architecture.

## Data Model

Core data structures defined here.
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      expect(result.status).toBe("pass")
    })

    it("should pass when design.md has CP sections but none declare test_type", async () => {
      const designContent = `# Design

Based on 需求 1.

#### CP-1 Some property without test_type
- **property**: WHEN x THEN y
`
      await writeFile(join(specDir, "design.md"), designContent, "utf-8")

      const result = await checkDesignGate(workItemId, testDir)
      expect(result.status).toBe("pass")
    })
  })
})
