/**
 * Property-based tests for typed command validation (Properties 5–9)
 *
 * **Validates: Requirements 3.2, 3.7, 3.5, 3.9, 8.2, 9.2**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { parseTaskVerification } from "../../.opencode/tools/lib/sf_markdown_verification_parser"
import {
  VALID_VERIFICATION_TYPES,
  type VerificationType,
} from "../../.opencode/tools/lib/sf_verification_types"
import { crossValidateTask } from "../../.opencode/tools/lib/sf_tasks_gate_core"

// ============================================================
// Generators
// ============================================================

/** Generate a valid VerificationType */
const validTypeArb = fc.constantFrom(...VALID_VERIFICATION_TYPES)

/** Generate a non-empty subset of valid VerificationTypes (no duplicates) */
const validTypeSubsetArb = fc.uniqueArray(validTypeArb, { minLength: 1, maxLength: 5 })

/** Generate an invalid type key (not in VALID_VERIFICATION_TYPES) */
const invalidTypeArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => {
    const lower = s.toLowerCase().trim()
    return (
      lower.length > 0 &&
      !VALID_VERIFICATION_TYPES.includes(lower as VerificationType) &&
      /^[A-Za-z_][\w-]*$/.test(s) // must look like a key (no spaces, starts with letter/underscore)
    )
  })

/** Generate a simple shell command string */
const commandArb = fc.constantFrom(
  "bun test tests/unit/foo.test.ts",
  "bun test tests/property/bar.property.test.ts",
  "bun test tests/integration/baz.test.ts",
  "bun test tests/e2e/flow.test.ts",
  "bun test tests/regression/compat.test.ts",
  "vitest run tests/unit/x.test.ts"
)

/** Generate a task ID */
const taskIdArb = fc.integer({ min: 1, max: 99 }).map((n) => `TASK-${n}`)

/**
 * Generate a tasks.md task section with typed verification_commands using only valid type keys
 */
function genTypedTaskSection(
  types: VerificationType[],
  refs: string[] | null
): string {
  const lines: string[] = []
  lines.push("### TASK-1 Some task title")
  lines.push("")
  lines.push("- **verification_commands**:")
  for (const t of types) {
    lines.push(`  - ${t}: \`bun test tests/${t}/test.test.ts\``)
  }
  if (refs !== null) {
    lines.push(`- **refs**: [${refs.join(", ")}]`)
  }
  lines.push("")
  return lines.join("\n")
}

/**
 * Generate a tasks.md task section with some invalid type keys
 */
function genInvalidTypedTaskSection(
  validTypes: VerificationType[],
  invalidKeys: string[]
): string {
  const lines: string[] = []
  lines.push("### TASK-1 Some task title")
  lines.push("")
  lines.push("- **verification_commands**:")
  for (const t of validTypes) {
    lines.push(`  - ${t}: \`bun test tests/${t}/test.test.ts\``)
  }
  for (const k of invalidKeys) {
    lines.push(`  - ${k}: \`bun test tests/other/test.test.ts\``)
  }
  lines.push(`- **refs**: [REQ-1, CP-1]`)
  lines.push("")
  return lines.join("\n")
}

/**
 * Generate a legacy format tasks.md task section
 */
function genLegacyTaskSection(commands: string[]): string {
  const lines: string[] = []
  lines.push("### TASK-1 Some task title")
  lines.push("")
  lines.push("- **verification_commands**:")
  for (const cmd of commands) {
    lines.push(`  - \`${cmd}\``)
  }
  lines.push("")
  return lines.join("\n")
}

/**
 * Generate a requirements.md content with verification_strategy for given REQs
 */
function genRequirementsContent(
  reqs: Array<{ id: string; strategy: VerificationType[] | null }>
): string {
  const lines: string[] = []
  lines.push("# Requirements")
  lines.push("")
  for (const req of reqs) {
    lines.push(`### ${req.id} Some requirement`)
    lines.push("")
    lines.push("#### Acceptance Criteria")
    lines.push("")
    if (req.strategy !== null && req.strategy.length > 0) {
      lines.push(`- **verification_strategy**: [${req.strategy.join(", ")}]`)
    }
    lines.push("")
  }
  return lines.join("\n")
}

// ============================================================
// Property 5: typed verification_commands type key legality
// **Validates: Requirements 3.2, 3.7, 9.2**
// ============================================================

describe("Property 5: typed verification_commands type key legality", () => {
  it("valid type keys → parseTaskVerification returns no invalidTypedKeys", () => {
    fc.assert(
      fc.property(validTypeSubsetArb, (types) => {
        const content = genTypedTaskSection(types, ["REQ-1", "CP-1"])
        const result = parseTaskVerification(content)

        expect(result.format).toBe("typed")
        expect(result.invalidTypedKeys ?? []).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  it("invalid type keys → invalidTypedKeys is non-empty", () => {
    fc.assert(
      fc.property(
        invalidTypeArb,
        validTypeSubsetArb,
        (invalidKey, validTypes) => {
          const content = genInvalidTypedTaskSection(validTypes, [invalidKey])
          const result = parseTaskVerification(content)

          expect(result.format).toBe("typed")
          expect(result.invalidTypedKeys).toBeDefined()
          expect(result.invalidTypedKeys!.length).toBeGreaterThan(0)
          expect(result.invalidTypedKeys).toContain(invalidKey)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 6: legacy format backward compatibility
// **Validates: Requirements 3.6, 8.2**
// ============================================================

describe("Property 6: legacy format backward compatibility", () => {
  it("legacy format tasks.md → parseTaskVerification returns format 'legacy'", () => {
    fc.assert(
      fc.property(
        fc.array(commandArb, { minLength: 1, maxLength: 5 }),
        (commands) => {
          const content = genLegacyTaskSection(commands)
          const result = parseTaskVerification(content)

          expect(result.format).toBe("legacy")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("legacy commands are preserved in legacyCommands array", () => {
    fc.assert(
      fc.property(
        fc.array(commandArb, { minLength: 1, maxLength: 5 }),
        (commands) => {
          const content = genLegacyTaskSection(commands)
          const result = parseTaskVerification(content)

          expect(result.format).toBe("legacy")
          expect(result.legacyCommands).toBeDefined()
          expect(result.legacyCommands).toEqual(commands)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 7: typed task refs enforcement
// **Validates: Requirements 3.5, 3.9 Scenario A**
// ============================================================

describe("Property 7: typed task refs enforcement", () => {
  it("typed task without refs → crossValidateTask returns blocking issues", () => {
    fc.assert(
      fc.property(
        validTypeSubsetArb,
        taskIdArb,
        (types, taskId) => {
          // Build a ParsedTaskVerification with no refs
          const taskVerification = parseTaskVerification(
            genTypedTaskSection(types, null)
          )

          const requirementsContent = genRequirementsContent([
            { id: "REQ-1", strategy: types },
          ])

          const result = crossValidateTask(
            taskId,
            taskVerification,
            requirementsContent,
            null
          )

          expect(result.blockingIssues.length).toBeGreaterThan(0)
          // The blocking issue should mention the task ID
          expect(result.blockingIssues.some((issue) => issue.includes(taskId))).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("typed task with empty refs → crossValidateTask returns blocking issues", () => {
    fc.assert(
      fc.property(
        validTypeSubsetArb,
        taskIdArb,
        (types, taskId) => {
          // Build a ParsedTaskVerification with empty refs
          const taskVerification = parseTaskVerification(
            genTypedTaskSection(types, [])
          )

          const requirementsContent = genRequirementsContent([
            { id: "REQ-1", strategy: types },
          ])

          const result = crossValidateTask(
            taskId,
            taskVerification,
            requirementsContent,
            null
          )

          expect(result.blockingIssues.length).toBeGreaterThan(0)
          expect(result.blockingIssues.some((issue) => issue.includes(taskId))).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 8: cross-validation coverage
// **Validates: Requirements 3.9 Scenario B/C/D**
// ============================================================

describe("Property 8: cross-validation coverage", () => {
  it("task type keys not covering REQ strategy union → crossValidateTask fails", () => {
    fc.assert(
      fc.property(
        // Generate a subset of types for the task (what the task plans)
        fc.uniqueArray(validTypeArb, { minLength: 1, maxLength: 3 }),
        // Generate additional types that the REQ requires but task doesn't have
        fc.uniqueArray(validTypeArb, { minLength: 1, maxLength: 2 }),
        taskIdArb,
        (taskTypes, extraReqTypes, taskId) => {
          // Ensure extraReqTypes contains at least one type NOT in taskTypes
          const missingTypes = extraReqTypes.filter((t) => !taskTypes.includes(t))
          if (missingTypes.length === 0) return // skip if no missing types (precondition)

          // The REQ declares the union of taskTypes + missingTypes
          const reqStrategy = [...new Set([...taskTypes, ...missingTypes])]

          // Build task content with only taskTypes
          const taskContent = genTypedTaskSection(taskTypes, ["REQ-1", "CP-1"])
          const taskVerification = parseTaskVerification(taskContent)

          const requirementsContent = genRequirementsContent([
            { id: "REQ-1", strategy: reqStrategy },
          ])

          const result = crossValidateTask(
            taskId,
            taskVerification,
            requirementsContent,
            null
          )

          // Should fail because task doesn't cover all required types
          expect(result.blockingIssues.length).toBeGreaterThan(0)
          // Should mention missing types
          const allIssues = result.blockingIssues.join(" ")
          expect(allIssues).toContain("missing verification type")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("task type keys covering REQ strategy union → crossValidateTask passes (no coverage issue)", () => {
    fc.assert(
      fc.property(
        validTypeSubsetArb,
        taskIdArb,
        (types, taskId) => {
          // Task has all types that REQ requires, plus includes CP ref for property if needed
          const hasProperty = types.includes("property")
          const refs = hasProperty ? ["REQ-1", "CP-1"] : ["REQ-1"]

          const taskContent = genTypedTaskSection(types, refs)
          const taskVerification = parseTaskVerification(taskContent)

          const requirementsContent = genRequirementsContent([
            { id: "REQ-1", strategy: types },
          ])

          const result = crossValidateTask(
            taskId,
            taskVerification,
            requirementsContent,
            null
          )

          // Should not have coverage-related blocking issues
          const coverageIssues = result.blockingIssues.filter((i) =>
            i.includes("missing verification type")
          )
          expect(coverageIssues).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("refs pointing to REQ without verification_strategy → ignored (no fail)", () => {
    fc.assert(
      fc.property(
        validTypeSubsetArb,
        taskIdArb,
        (types, taskId) => {
          // Task has types, REQ has no strategy → should not fail on coverage
          const hasProperty = types.includes("property")
          const refs = hasProperty ? ["REQ-1", "CP-1"] : ["REQ-1"]

          const taskContent = genTypedTaskSection(types, refs)
          const taskVerification = parseTaskVerification(taskContent)

          // REQ-1 has no verification_strategy
          const requirementsContent = genRequirementsContent([
            { id: "REQ-1", strategy: null },
          ])

          const result = crossValidateTask(
            taskId,
            taskVerification,
            requirementsContent,
            null
          )

          // No coverage-related blocking issues (Scenario B: ignored)
          const coverageIssues = result.blockingIssues.filter((i) =>
            i.includes("missing verification type")
          )
          expect(coverageIssues).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 9: property command CP-N traceability
// **Validates: Requirements 3.9 Scenario E**
// ============================================================

describe("Property 9: property command CP-N traceability", () => {
  it("typed task with property commands but no CP-N in refs → crossValidateTask fails", () => {
    fc.assert(
      fc.property(
        // Generate types that always include "property"
        fc.uniqueArray(validTypeArb, { minLength: 1, maxLength: 4 }).map((types) => {
          if (!types.includes("property")) {
            types.push("property")
          }
          return types as VerificationType[]
        }),
        taskIdArb,
        (types, taskId) => {
          // refs has REQ-N but NO CP-N
          const taskContent = genTypedTaskSection(types, ["REQ-1"])
          const taskVerification = parseTaskVerification(taskContent)

          // REQ-1 declares the same strategy so coverage passes
          const requirementsContent = genRequirementsContent([
            { id: "REQ-1", strategy: types },
          ])

          const result = crossValidateTask(
            taskId,
            taskVerification,
            requirementsContent,
            null
          )

          // Should fail because property commands exist but no CP-N ref
          expect(result.blockingIssues.length).toBeGreaterThan(0)
          const cpIssues = result.blockingIssues.filter((i) =>
            i.includes("property verification_commands but no CP-N ref")
          )
          expect(cpIssues.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("typed task with property commands AND CP-N in refs → no CP traceability issue", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(validTypeArb, { minLength: 1, maxLength: 4 }).map((types) => {
          if (!types.includes("property")) {
            types.push("property")
          }
          return types as VerificationType[]
        }),
        taskIdArb,
        (types, taskId) => {
          // refs has both REQ-N and CP-N
          const taskContent = genTypedTaskSection(types, ["REQ-1", "CP-1"])
          const taskVerification = parseTaskVerification(taskContent)

          const requirementsContent = genRequirementsContent([
            { id: "REQ-1", strategy: types },
          ])

          const result = crossValidateTask(
            taskId,
            taskVerification,
            requirementsContent,
            null
          )

          // Should not have CP traceability issues
          const cpIssues = result.blockingIssues.filter((i) =>
            i.includes("property verification_commands but no CP-N ref")
          )
          expect(cpIssues).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})
