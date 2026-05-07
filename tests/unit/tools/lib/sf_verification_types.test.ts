import { describe, it, expect } from "vitest"
import {
  isValidVerificationType,
  normalizeVerificationType,
  parseVerificationStrategyField,
  parseAllVerificationStrategies,
} from "../../../../.opencode/tools/lib/sf_verification_types"

describe("isValidVerificationType", () => {
  it("returns true for valid lowercase types", () => {
    expect(isValidVerificationType("unit")).toBe(true)
    expect(isValidVerificationType("property")).toBe(true)
    expect(isValidVerificationType("integration")).toBe(true)
    expect(isValidVerificationType("e2e")).toBe(true)
    expect(isValidVerificationType("regression")).toBe(true)
  })

  it("returns true for valid types with mixed case (case-insensitive)", () => {
    expect(isValidVerificationType("Unit")).toBe(true)
    expect(isValidVerificationType("PROPERTY")).toBe(true)
    expect(isValidVerificationType("E2E")).toBe(true)
  })

  it("returns false for invalid types", () => {
    expect(isValidVerificationType("fast-check")).toBe(false)
    expect(isValidVerificationType("smoke")).toBe(false)
    expect(isValidVerificationType("unknown")).toBe(false)
    expect(isValidVerificationType("")).toBe(false)
  })
})

describe("normalizeVerificationType", () => {
  it("normalizes valid types to lowercase", () => {
    expect(normalizeVerificationType("unit")).toBe("unit")
    expect(normalizeVerificationType("Unit")).toBe("unit")
    expect(normalizeVerificationType("PROPERTY")).toBe("property")
    expect(normalizeVerificationType("E2E")).toBe("e2e")
  })

  it("returns null for invalid types", () => {
    expect(normalizeVerificationType("fast-check")).toBeNull()
    expect(normalizeVerificationType("smoke")).toBeNull()
    expect(normalizeVerificationType("")).toBeNull()
  })
})

describe("parseVerificationStrategyField", () => {
  it("parses bracket format [unit, property]", () => {
    const content = `**verification_strategy**: [unit, property]`
    const result = parseVerificationStrategyField(content)
    expect(result).not.toBeNull()
    expect(result!.types).toEqual(["unit", "property"])
    expect(result!.errors).toHaveLength(0)
    expect(result!.warnings).toHaveLength(0)
  })

  it("parses comma-separated format without brackets", () => {
    const content = `**verification_strategy**: unit, property, integration`
    const result = parseVerificationStrategyField(content)
    expect(result).not.toBeNull()
    expect(result!.types).toEqual(["unit", "property", "integration"])
    expect(result!.errors).toHaveLength(0)
  })

  it("parses single value", () => {
    const content = `**verification_strategy**: unit`
    const result = parseVerificationStrategyField(content)
    expect(result).not.toBeNull()
    expect(result!.types).toEqual(["unit"])
    expect(result!.errors).toHaveLength(0)
  })

  it("returns error for empty list []", () => {
    const content = `**verification_strategy**: []`
    const result = parseVerificationStrategyField(content)
    expect(result).not.toBeNull()
    expect(result!.types).toEqual([])
    expect(result!.errors.length).toBeGreaterThan(0)
  })

  it("returns error for no separator between multiple values", () => {
    const content = `**verification_strategy**: unit property`
    const result = parseVerificationStrategyField(content)
    expect(result).not.toBeNull()
    expect(result!.errors.length).toBeGreaterThan(0)
  })

  it("deduplicates and warns on duplicate values", () => {
    const content = `**verification_strategy**: [unit, unit, property]`
    const result = parseVerificationStrategyField(content)
    expect(result).not.toBeNull()
    expect(result!.types).toEqual(["unit", "property"])
    expect(result!.warnings.length).toBeGreaterThan(0)
  })

  it("normalizes mixed case to lowercase", () => {
    const content = `**verification_strategy**: [Unit, PROPERTY]`
    const result = parseVerificationStrategyField(content)
    expect(result).not.toBeNull()
    expect(result!.types).toEqual(["unit", "property"])
    expect(result!.errors).toHaveLength(0)
  })

  it("returns error for invalid type value", () => {
    const content = `**verification_strategy**: [fast-check]`
    const result = parseVerificationStrategyField(content)
    expect(result).not.toBeNull()
    expect(result!.errors.length).toBeGreaterThan(0)
  })

  it("returns null when no verification_strategy field exists", () => {
    const content = `Some requirement text without the field`
    const result = parseVerificationStrategyField(content)
    expect(result).toBeNull()
  })
})

describe("parseAllVerificationStrategies", () => {
  it("parses multiple REQ sections with different strategies", () => {
    const content = `
## REQ-1 First requirement

Some description.

**verification_strategy**: [unit, property]

## REQ-2 Second requirement

Another description.

**verification_strategy**: [integration, e2e]

## REQ-3 Third requirement

Yet another description.

**verification_strategy**: regression
`
    const result = parseAllVerificationStrategies(content)
    expect(result.size).toBe(3)
    expect(result.get("REQ-1")!.types).toEqual(["unit", "property"])
    expect(result.get("REQ-2")!.types).toEqual(["integration", "e2e"])
    expect(result.get("REQ-3")!.types).toEqual(["regression"])
  })

  it("does not include REQ without verification_strategy (null, not error)", () => {
    const content = `
## REQ-1 Has strategy

**verification_strategy**: [unit]

## REQ-2 No strategy

Just a requirement without verification_strategy field.

## REQ-3 Also has strategy

**verification_strategy**: [e2e]
`
    const result = parseAllVerificationStrategies(content)
    expect(result.size).toBe(2)
    expect(result.has("REQ-1")).toBe(true)
    expect(result.has("REQ-2")).toBe(false)
    expect(result.has("REQ-3")).toBe(true)
  })

  it("ignores verification_strategy inside code blocks", () => {
    const content = `
## REQ-1 Real requirement

**verification_strategy**: [unit]

\`\`\`markdown
**verification_strategy**: [property, integration]
\`\`\`

## REQ-2 Another requirement

Some text only.
`
    const result = parseAllVerificationStrategies(content)
    expect(result.size).toBe(1)
    expect(result.get("REQ-1")!.types).toEqual(["unit"])
    expect(result.has("REQ-2")).toBe(false)
  })
})
