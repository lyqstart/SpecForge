/**
 * Property-based tests for sf_verification_gate V3.7 typed verification checks
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.7, 5.9**
 *
 * Property 11: Planned_Verification_Types derivation correctness
 * Property 12: per-type check invariant
 * Property 13: required_types parameter override
 * Property 14: details.type_results field position invariant
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import {
  derivePlannedVerificationTypes,
  checkTypedVerificationResults,
} from "../../.opencode/tools/lib/sf_verification_gate_core"
import {
  VALID_VERIFICATION_TYPES,
} from "../../.opencode/tools/lib/sf_verification_types"
import type {
  VerificationType,
  VerificationReport,
  VerificationCommandRecord,
} from "../../.opencode/tools/lib/sf_verification_types"
import type { GateResult } from "../../.opencode/tools/lib/sf_gate_types"

// ============================================================
// Generators
// ============================================================

/**
 * Generate a non-empty subset of valid verification types
 */
const arbNonEmptyTypeSet = fc
  .subarray([...VALID_VERIFICATION_TYPES], { minLength: 1 })
  .map((arr) => arr as VerificationType[])

/**
 * Generate an arbitrary (possibly empty) subset of valid verification types
 */
const arbTypeSubset = fc
  .subarray([...VALID_VERIFICATION_TYPES])
  .map((arr) => arr as VerificationType[])

/**
 * Generate a tasks.md content with typed verification_commands for given types
 */
function generateTypedTasksMd(types: VerificationType[]): string {
  let content = "# Tasks\n\n"
  content += "## TASK-1 Implementation\n\n"
  content += "**verification_commands**:\n"
  for (const t of types) {
    content += `- ${t}: \`bun test tests/${t}.test.ts\`\n`
  }
  content += "\n**refs**: [REQ-1]\n"
  return content
}

/**
 * Generate a tasks.md with multiple typed tasks, each with a subset of types
 */
function generateMultiTaskTypedMd(
  taskTypes: VerificationType[][]
): string {
  let content = "# Tasks\n\n"
  for (let i = 0; i < taskTypes.length; i++) {
    content += `## TASK-${i + 1} Implementation ${i + 1}\n\n`
    content += "**verification_commands**:\n"
    for (const t of taskTypes[i]) {
      content += `- ${t}: \`bun test tests/${t}_${i}.test.ts\`\n`
    }
    content += "\n**refs**: [REQ-1]\n\n"
  }
  return content
}

/**
 * Generate a legacy (all-legacy) tasks.md with no typed commands
 */
function generateLegacyTasksMd(commands: string[]): string {
  let content = "# Tasks\n\n"
  content += "## TASK-1 Legacy Task\n\n"
  content += "**verification_commands**:\n"
  for (const cmd of commands) {
    content += `- \`${cmd}\`\n`
  }
  content += "\n"
  return content
}

/**
 * Generate a VerificationReport with commands for specified types (all passing)
 */
function generatePassingReport(
  types: VerificationType[]
): VerificationReport {
  const commands: VerificationCommandRecord[] = types.map((t) => ({
    type: t,
    command: `bun test tests/${t}.test.ts`,
    status: "passed" as const,
    exit_code: 0,
    stdout: `✓ ${t} tests passed`,
  }))
  return {
    schema_version: "1.0",
    work_item_id: "WI-TEST",
    status: "completed",
    commands,
  }
}

/**
 * Generate a VerificationReport with commands for a subset of types (some missing)
 */
function generatePartialReport(
  presentTypes: VerificationType[],
  status: "passed" | "failed" = "passed"
): VerificationReport {
  const commands: VerificationCommandRecord[] = presentTypes.map((t) => ({
    type: t,
    command: `bun test tests/${t}.test.ts`,
    status,
    exit_code: status === "passed" ? 0 : 1,
    stdout: status === "passed" ? `✓ ${t} tests passed` : `✗ ${t} tests failed`,
  }))
  return {
    schema_version: "1.0",
    work_item_id: "WI-TEST",
    status: "completed",
    commands,
  }
}

// ============================================================
// Property 11: Planned_Verification_Types derivation correctness
// ============================================================

describe("Property 11: Planned_Verification_Types derivation correctness", () => {
  it("derivePlannedVerificationTypes returns the union of all type keys from typed tasks", () => {
    fc.assert(
      fc.property(
        fc.array(arbNonEmptyTypeSet, { minLength: 1, maxLength: 4 }),
        (taskTypeArrays) => {
          const tasksContent = generateMultiTaskTypedMd(taskTypeArrays)
          const result = derivePlannedVerificationTypes(tasksContent)

          // Should not be null (has typed tasks)
          expect(result).not.toBeNull()

          // The result should be the union of all type keys
          const expectedUnion = new Set<VerificationType>()
          for (const types of taskTypeArrays) {
            for (const t of types) {
              expectedUnion.add(t)
            }
          }

          expect(result!.size).toBe(expectedUnion.size)
          for (const t of expectedUnion) {
            expect(result!.has(t)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("derivePlannedVerificationTypes returns null for all-legacy tasks.md", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 5, maxLength: 30 }).filter(
            (s) => !s.includes("`") && !s.includes("\n") && !s.includes(":")
          ),
          { minLength: 1, maxLength: 5 }
        ),
        (commands) => {
          const tasksContent = generateLegacyTasksMd(commands)
          const result = derivePlannedVerificationTypes(tasksContent)

          // All legacy → null (V3.6 fallback)
          expect(result).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("single typed task returns exactly its type keys", () => {
    fc.assert(
      fc.property(arbNonEmptyTypeSet, (types) => {
        const tasksContent = generateTypedTasksMd(types)
        const result = derivePlannedVerificationTypes(tasksContent)

        expect(result).not.toBeNull()
        expect(result!.size).toBe(types.length)
        for (const t of types) {
          expect(result!.has(t)).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 12: per-type check invariant
// ============================================================

describe("Property 12: per-type check invariant", () => {
  it("all types have passing records → checkTypedVerificationResults returns pass", () => {
    fc.assert(
      fc.property(arbNonEmptyTypeSet, (types) => {
        const requiredTypes = new Set(types)
        const report = generatePassingReport(types)

        const result = checkTypedVerificationResults(report, requiredTypes)

        expect(result.status).toBe("pass")
        expect(result.blocking_issues).toHaveLength(0)

        // type_results should show all as "passed"
        const typeResults = (result.details as { type_results: Record<string, string> })
          .type_results
        for (const t of types) {
          expect(typeResults[t]).toBe("passed")
        }
      }),
      { numRuns: 100 }
    )
  })

  it("any type missing from report → checkTypedVerificationResults returns fail with correct type_results", () => {
    fc.assert(
      fc.property(
        arbNonEmptyTypeSet,
        fc.nat(),
        (allTypes, seed) => {
          // Ensure we have at least 2 types so we can remove one
          if (allTypes.length < 2) return

          const requiredTypes = new Set(allTypes)

          // Remove one type from the report
          const removeIdx = seed % allTypes.length
          const presentTypes = allTypes.filter((_, i) => i !== removeIdx)
          const missingType = allTypes[removeIdx]

          const report = generatePassingReport(presentTypes)
          const result = checkTypedVerificationResults(report, requiredTypes)

          expect(result.status).toBe("fail")
          expect(result.blocking_issues.length).toBeGreaterThan(0)

          // type_results should show the missing type as "missing"
          const typeResults = (result.details as { type_results: Record<string, string> })
            .type_results
          expect(typeResults[missingType]).toBe("missing")

          // Present types should be "passed"
          for (const t of presentTypes) {
            expect(typeResults[t]).toBe("passed")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("type with failed commands → type_results shows 'failed'", () => {
    fc.assert(
      fc.property(arbNonEmptyTypeSet, (types) => {
        const requiredTypes = new Set(types)
        // All commands present but with "failed" status
        const report = generatePartialReport(types, "failed")

        const result = checkTypedVerificationResults(report, requiredTypes)

        expect(result.status).toBe("fail")

        const typeResults = (result.details as { type_results: Record<string, string> })
          .type_results
        for (const t of types) {
          expect(typeResults[t]).toBe("failed")
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 13: required_types parameter override
// ============================================================

describe("Property 13: required_types parameter override", () => {
  it("checkTypedVerificationResults uses required_types regardless of what tasks.md says", () => {
    fc.assert(
      fc.property(
        arbNonEmptyTypeSet,
        arbNonEmptyTypeSet,
        (requiredTypes, reportTypes) => {
          const required = new Set(requiredTypes)
          const report = generatePassingReport(reportTypes)

          const result = checkTypedVerificationResults(report, required)

          // Check if all required types are covered by report
          const allCovered = requiredTypes.every((t) =>
            reportTypes.includes(t)
          )

          if (allCovered) {
            expect(result.status).toBe("pass")
          } else {
            expect(result.status).toBe("fail")
            // Missing types should be reported
            const typeResults = (result.details as { type_results: Record<string, string> })
              .type_results
            for (const t of requiredTypes) {
              if (!reportTypes.includes(t)) {
                expect(typeResults[t]).toBe("missing")
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("required_types with empty report → all types missing → fail", () => {
    fc.assert(
      fc.property(arbNonEmptyTypeSet, (requiredTypes) => {
        const required = new Set(requiredTypes)
        const emptyReport: VerificationReport = {
          schema_version: "1.0",
          work_item_id: "WI-TEST",
          status: "completed",
          commands: [],
        }

        const result = checkTypedVerificationResults(emptyReport, required)

        expect(result.status).toBe("fail")
        expect(result.blocking_issues.length).toBe(requiredTypes.length)

        const typeResults = (result.details as { type_results: Record<string, string> })
          .type_results
        for (const t of requiredTypes) {
          expect(typeResults[t]).toBe("missing")
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 14: details.type_results field position invariant
// ============================================================

describe("Property 14: details.type_results field position invariant", () => {
  it("type_results is nested under details, never at top level", () => {
    fc.assert(
      fc.property(
        arbNonEmptyTypeSet,
        arbNonEmptyTypeSet,
        (requiredTypes, reportTypes) => {
          const required = new Set(requiredTypes)
          const report = generatePassingReport(reportTypes)

          const result: GateResult = checkTypedVerificationResults(report, required)

          // type_results MUST be nested under details
          expect(result.details).toBeDefined()
          expect((result.details as Record<string, unknown>).type_results).toBeDefined()

          // type_results MUST NOT be at top level
          expect((result as unknown as Record<string, unknown>).type_results).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("ignoring details does not affect existing GateResult fields", () => {
    fc.assert(
      fc.property(
        arbNonEmptyTypeSet,
        arbNonEmptyTypeSet,
        (requiredTypes, reportTypes) => {
          const required = new Set(requiredTypes)
          const report = generatePassingReport(reportTypes)

          const result = checkTypedVerificationResults(report, required)

          // Core GateResult fields are always present
          expect(result.status).toMatch(/^(pass|fail|blocked)$/)
          expect(Array.isArray(result.blocking_issues)).toBe(true)
          expect(Array.isArray(result.warnings)).toBe(true)
          expect(result.next_action).toMatch(/^(continue|revise|ask_user)$/)

          // Destructuring without details still gives valid GateResult
          const { details, ...coreResult } = result
          expect(coreResult.status).toMatch(/^(pass|fail|blocked)$/)
          expect(Array.isArray(coreResult.blocking_issues)).toBe(true)
          expect(Array.isArray(coreResult.warnings)).toBe(true)
          expect(coreResult.next_action).toMatch(/^(continue|revise|ask_user)$/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("details.type_results contains only valid TypeResultStatus values", () => {
    fc.assert(
      fc.property(
        arbNonEmptyTypeSet,
        arbTypeSubset,
        (requiredTypes, reportTypes) => {
          const required = new Set(requiredTypes)
          const report = generatePassingReport(reportTypes as VerificationType[])

          const result = checkTypedVerificationResults(report, required)

          const typeResults = (result.details as { type_results: Record<string, string> })
            .type_results

          const validStatuses = ["passed", "missing", "failed", "skipped"]
          for (const [_type, status] of Object.entries(typeResults)) {
            expect(validStatuses).toContain(status)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


// ============================================================
// Additional imports for Properties 15–20
// ============================================================

import {
  collectVerificationCommands,
  cleanupStaleReports,
} from "../../.opencode/tools/lib/sf_verifier_execution_core"
import {
  mergeGateResults,
  checkVerificationGate,
} from "../../.opencode/tools/lib/sf_verification_gate_core"
import { writeFile, mkdir, access } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"

// ============================================================
// Additional Generators for Properties 15–20
// ============================================================

/**
 * Generate a tasks.md with mixed format: some typed tasks, some legacy tasks,
 * and some manual_verification_checks
 */
function generateMixedTasksMd(opts: {
  typedTypes: VerificationType[]
  legacyCommands: string[]
  manualChecks: string[]
}): string {
  let content = "# Tasks\n\n"

  // Typed task
  if (opts.typedTypes.length > 0) {
    content += "## TASK-1 Typed Task\n\n"
    content += "**verification_commands**:\n"
    for (const t of opts.typedTypes) {
      content += `- ${t}: \`echo test_${t}\`\n`
    }
    content += "\n**refs**: [REQ-1, CP-1]\n\n"
  }

  // Legacy task
  if (opts.legacyCommands.length > 0) {
    content += "## TASK-2 Legacy Task\n\n"
    content += "**verification_commands**:\n"
    for (const cmd of opts.legacyCommands) {
      content += `- \`${cmd}\`\n`
    }
    content += "\n"
  }

  // Task with manual checks only
  if (opts.manualChecks.length > 0) {
    content += "## TASK-3 Manual Check Task\n\n"
    content += "**verification_commands**:\n"
    content += `- unit: \`echo unit_check\`\n`
    content += "\n**manual_verification_checks**:\n"
    for (const check of opts.manualChecks) {
      content += `- \`${check}\`\n`
    }
    content += "\n**refs**: [REQ-1]\n\n"
  }

  return content
}

/**
 * Generate a tasks.md with only typed tasks that have commands which will "fail"
 * (for testing collect-all strategy)
 */
function generateTasksMdWithFailingCommands(
  commands: Array<{ type?: VerificationType; command: string }>
): string {
  let content = "# Tasks\n\n"
  content += "## TASK-1 Test Task\n\n"
  content += "**verification_commands**:\n"

  // Group by type
  const typed = commands.filter((c) => c.type !== undefined)
  const legacy = commands.filter((c) => c.type === undefined)

  if (typed.length > 0) {
    for (const cmd of typed) {
      content += `- ${cmd.type}: \`${cmd.command}\`\n`
    }
    content += "\n**refs**: [REQ-1, CP-1]\n\n"
  } else if (legacy.length > 0) {
    for (const cmd of legacy) {
      content += `- \`${cmd.command}\`\n`
    }
    content += "\n"
  }

  return content
}

/**
 * Arbitrary for generating a safe command string (no backticks or newlines)
 */
const arbSafeCommand = fc
  .string({ minLength: 3, maxLength: 20 })
  .filter((s) => !s.includes("`") && !s.includes("\n") && !s.includes(":") && !s.includes("*"))
  .map((s) => `echo_${s.replace(/[^a-zA-Z0-9_]/g, "x")}`)

/**
 * Arbitrary for generating a safe manual check string
 */
const arbManualCheck = fc
  .string({ minLength: 3, maxLength: 30 })
  .filter((s) => !s.includes("`") && !s.includes("\n"))
  .map((s) => `Check ${s.replace(/[^a-zA-Z0-9_ ]/g, "x")}`)

// ============================================================
// Property 15: Verification_Report type fidelity
// ============================================================

describe("Property 15: Verification_Report type fidelity", () => {
  /**
   * **Validates: Requirements 6.2, 6.3, 6.4**
   */
  it("collectVerificationCommands: typed commands have type field, legacy commands do not, manual_checks are excluded", () => {
    fc.assert(
      fc.property(
        arbNonEmptyTypeSet,
        fc.array(arbSafeCommand, { minLength: 1, maxLength: 3 }),
        fc.array(arbManualCheck, { minLength: 0, maxLength: 3 }),
        (typedTypes, legacyCommands, manualChecks) => {
          const tasksContent = generateMixedTasksMd({
            typedTypes,
            legacyCommands,
            manualChecks,
          })

          const commands = collectVerificationCommands(tasksContent)

          // Typed commands should have type field set
          const typedCommands = commands.filter((c) => c.type !== undefined)
          for (const cmd of typedCommands) {
            expect(VALID_VERIFICATION_TYPES).toContain(cmd.type)
          }

          // Legacy commands should NOT have type field
          const legacyCmds = commands.filter((c) => c.type === undefined)
          for (const cmd of legacyCmds) {
            expect(cmd.type).toBeUndefined()
          }

          // Manual checks should NOT appear in collected commands
          for (const check of manualChecks) {
            const found = commands.some((c) => c.command === check)
            expect(found).toBe(false)
          }

          // All typed types should be represented
          const collectedTypes = new Set(typedCommands.map((c) => c.type))
          for (const t of typedTypes) {
            expect(collectedTypes.has(t)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("collectVerificationCommands: typed commands preserve correct type value", () => {
    fc.assert(
      fc.property(arbNonEmptyTypeSet, (types) => {
        const tasksContent = generateTypedTasksMd(types)
        const commands = collectVerificationCommands(tasksContent)

        // Every collected command should have a type from the input types
        for (const cmd of commands) {
          expect(cmd.type).toBeDefined()
          expect(types).toContain(cmd.type)
        }

        // Number of commands should equal number of types
        expect(commands.length).toBe(types.length)
      }),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 16: Collect-all execution strategy
// ============================================================

describe("Property 16: Collect-all execution strategy", () => {
  /**
   * **Validates: Requirements 6.8**
   */
  it("collectVerificationCommands collects ALL commands regardless of content (no early termination)", () => {
    fc.assert(
      fc.property(
        fc.array(arbNonEmptyTypeSet, { minLength: 1, maxLength: 3 }),
        (taskTypeArrays) => {
          const tasksContent = generateMultiTaskTypedMd(taskTypeArrays)
          const commands = collectVerificationCommands(tasksContent)

          // Total commands should equal sum of all types across all tasks
          const expectedCount = taskTypeArrays.reduce((sum, types) => sum + types.length, 0)
          expect(commands.length).toBe(expectedCount)

          // Every command should be recorded (no skipping)
          for (const cmd of commands) {
            expect(cmd.command).toBeDefined()
            expect(cmd.command.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("collectVerificationCommands records every command from mixed format tasks", () => {
    fc.assert(
      fc.property(
        arbNonEmptyTypeSet,
        fc.array(arbSafeCommand, { minLength: 1, maxLength: 3 }),
        (typedTypes, legacyCommands) => {
          const tasksContent = generateMixedTasksMd({
            typedTypes,
            legacyCommands,
            manualChecks: [],
          })

          const commands = collectVerificationCommands(tasksContent)

          // Total should be typed count + legacy count (no early termination)
          expect(commands.length).toBe(typedTypes.length + legacyCommands.length)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 17: Legacy sf_verification_gate fallback
// ============================================================

describe("Property 17: Legacy sf_verification_gate fallback", () => {
  /**
   * **Validates: Requirements 5.5, 8.3**
   */
  it("derivePlannedVerificationTypes returns null for all-legacy tasks.md (triggers V3.6 fallback)", () => {
    fc.assert(
      fc.property(
        fc.array(arbSafeCommand, { minLength: 1, maxLength: 5 }),
        (commands) => {
          const tasksContent = generateLegacyTasksMd(commands)
          const result = derivePlannedVerificationTypes(tasksContent)

          // All legacy → null → V3.6 fallback
          expect(result).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("derivePlannedVerificationTypes returns non-null for any tasks.md with at least one typed task", () => {
    fc.assert(
      fc.property(
        arbNonEmptyTypeSet,
        fc.array(arbSafeCommand, { minLength: 0, maxLength: 3 }),
        (typedTypes, legacyCommands) => {
          const tasksContent = generateMixedTasksMd({
            typedTypes,
            legacyCommands,
            manualChecks: [],
          })

          const result = derivePlannedVerificationTypes(tasksContent)

          // Has at least one typed task → non-null (no V3.6 fallback)
          expect(result).not.toBeNull()
          // Should contain all typed types
          for (const t of typedTypes) {
            expect(result!.has(t)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 18: Malformed JSON does not fallback
// ============================================================

describe("Property 18: Malformed JSON does not fallback to V3.6", () => {
  /**
   * **Validates: Requirements 6 (report completeness handling)**
   */
  it("checkVerificationGate fails with malformed verification_report.json and does not fallback", async () => {
    // Generate various malformed JSON strings
    const malformedJsons = [
      "{ invalid json",
      '{"schema_version": "1.0"}',  // missing required fields
      '{"schema_version": "1.0", "work_item_id": "WI-1", "status": "incomplete", "commands": []}',  // status != completed
      '{"schema_version": "1.0", "work_item_id": "WI-1", "status": "completed"}',  // missing commands array
      "null",
      "",
      "undefined",
      "[1, 2, 3]",
    ]

    for (const malformedJson of malformedJsons) {
      const tempDir = join(tmpdir(), `sf-test-p18-${randomUUID()}`)
      const specDir = join(tempDir, "specforge", "specs", "WI-MALFORMED")

      try {
        await mkdir(specDir, { recursive: true })

        // Write malformed verification_report.json
        await writeFile(join(specDir, "verification_report.json"), malformedJson, "utf-8")

        // Write a valid tasks.md with typed commands
        const tasksContent = generateTypedTasksMd(["unit"])
        await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

        // Also write a valid verification_report.md that would pass V3.6 checks
        // This ensures we're testing that it does NOT fallback to V3.6
        await writeFile(
          join(specDir, "verification_report.md"),
          "# Verification Report\n\n## 测试结果\n\nAll tests passed ✅\n\n## 端到端\n\ne2e tests passed\n",
          "utf-8"
        )

        const result = await checkVerificationGate("WI-MALFORMED", tempDir)

        // Should fail, NOT fallback to V3.6 (which would pass due to valid .md)
        expect(result.status).toBe("fail")
        expect(result.blocking_issues.some(
          (issue) => issue.includes("missing") || issue.includes("malformed") || issue.includes("incomplete")
        )).toBe(true)
      } finally {
        // Cleanup
        const { rm } = await import("node:fs/promises")
        await rm(tempDir, { recursive: true, force: true }).catch(() => {})
      }
    }
  })

  it("checkVerificationGate with malformed JSON always produces fail status (property)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => {
            // Ensure it's not valid JSON that would pass schema validation
            try {
              const parsed = JSON.parse(s)
              return !(
                parsed &&
                typeof parsed === "object" &&
                parsed.schema_version &&
                parsed.work_item_id &&
                parsed.status === "completed" &&
                Array.isArray(parsed.commands)
              )
            } catch {
              return true // parse error = malformed = good for test
            }
          }
        ),
        async (malformedContent) => {
          const tempDir = join(tmpdir(), `sf-test-p18b-${randomUUID()}`)
          const specDir = join(tempDir, "specforge", "specs", "WI-MAL")

          try {
            await mkdir(specDir, { recursive: true })
            await writeFile(join(specDir, "verification_report.json"), malformedContent, "utf-8")
            await writeFile(join(specDir, "tasks.md"), generateTypedTasksMd(["unit"]), "utf-8")

            const result = await checkVerificationGate("WI-MAL", tempDir)

            // Must fail — never fallback to V3.6
            expect(result.status).toBe("fail")
          } finally {
            const { rm } = await import("node:fs/promises")
            await rm(tempDir, { recursive: true, force: true }).catch(() => {})
          }
        }
      ),
      { numRuns: 20 }  // Reduced runs due to filesystem I/O
    )
  })
})

// ============================================================
// Property 19: Mixed format result merging
// ============================================================

describe("Property 19: Mixed format result merging", () => {
  /**
   * **Validates: Requirements 5.6**
   */
  it("typed pass + legacy fail → final fail", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
        (typedWarnings, legacyWarnings) => {
          const typedResult: GateResult = {
            status: "pass",
            blocking_issues: [],
            warnings: typedWarnings,
            next_action: "continue",
            details: { type_results: { unit: "passed" } },
          }

          const legacyResult: GateResult = {
            status: "fail",
            blocking_issues: ["Legacy test failed"],
            warnings: legacyWarnings,
            next_action: "revise",
          }

          const merged = mergeGateResults(typedResult, legacyResult)

          expect(merged.status).toBe("fail")
          expect(merged.next_action).toBe("revise")
          expect(merged.blocking_issues.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("typed fail + legacy pass → final fail", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
        (typedWarnings, legacyWarnings) => {
          const typedResult: GateResult = {
            status: "fail",
            blocking_issues: ["Typed test failed"],
            warnings: typedWarnings,
            next_action: "revise",
            details: { type_results: { unit: "failed" } },
          }

          const legacyResult: GateResult = {
            status: "pass",
            blocking_issues: [],
            warnings: legacyWarnings,
            next_action: "continue",
          }

          const merged = mergeGateResults(typedResult, legacyResult)

          expect(merged.status).toBe("fail")
          expect(merged.next_action).toBe("revise")
          expect(merged.blocking_issues.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("blocked > fail > pass priority ordering", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<"pass" | "fail" | "blocked">("pass", "fail", "blocked"),
        fc.constantFrom<"pass" | "fail" | "blocked">("pass", "fail", "blocked"),
        (typedStatus, legacyStatus) => {
          const typedResult: GateResult = {
            status: typedStatus,
            blocking_issues: typedStatus !== "pass" ? ["typed issue"] : [],
            warnings: [],
            next_action: typedStatus === "pass" ? "continue" : typedStatus === "fail" ? "revise" : "ask_user",
            details: { type_results: {} },
          }

          const legacyResult: GateResult = {
            status: legacyStatus,
            blocking_issues: legacyStatus !== "pass" ? ["legacy issue"] : [],
            warnings: [],
            next_action: legacyStatus === "pass" ? "continue" : legacyStatus === "fail" ? "revise" : "ask_user",
          }

          const merged = mergeGateResults(typedResult, legacyResult)

          // Priority: blocked > fail > pass
          if (typedStatus === "blocked" || legacyStatus === "blocked") {
            expect(merged.status).toBe("blocked")
            expect(merged.next_action).toBe("ask_user")
          } else if (typedStatus === "fail" || legacyStatus === "fail") {
            expect(merged.status).toBe("fail")
            expect(merged.next_action).toBe("revise")
          } else {
            expect(merged.status).toBe("pass")
            expect(merged.next_action).toBe("continue")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("mergeGateResults combines all blocking_issues and warnings from both results", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
        (typedIssues, legacyIssues, typedWarnings, legacyWarnings) => {
          const typedResult: GateResult = {
            status: typedIssues.length > 0 ? "fail" : "pass",
            blocking_issues: typedIssues,
            warnings: typedWarnings,
            next_action: typedIssues.length > 0 ? "revise" : "continue",
            details: { type_results: {} },
          }

          const legacyResult: GateResult = {
            status: legacyIssues.length > 0 ? "fail" : "pass",
            blocking_issues: legacyIssues,
            warnings: legacyWarnings,
            next_action: legacyIssues.length > 0 ? "revise" : "continue",
          }

          const merged = mergeGateResults(typedResult, legacyResult)

          // All issues and warnings should be combined
          expect(merged.blocking_issues.length).toBe(typedIssues.length + legacyIssues.length)
          expect(merged.warnings.length).toBe(typedWarnings.length + legacyWarnings.length)

          // All original issues should be present
          for (const issue of typedIssues) {
            expect(merged.blocking_issues).toContain(issue)
          }
          for (const issue of legacyIssues) {
            expect(merged.blocking_issues).toContain(issue)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 20a: cleanupStaleReports deletion guarantee
// ============================================================

describe("Property 20a: cleanupStaleReports deletion guarantee", () => {
  /**
   * **Validates: Requirements 6.9**
   */
  it("after successful cleanup, both report files do not exist", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        async (hasJson, hasMd) => {
          const tempDir = join(tmpdir(), `sf-test-p20a-${randomUUID()}`)

          try {
            await mkdir(tempDir, { recursive: true })

            // Conditionally create stale report files
            if (hasJson) {
              await writeFile(
                join(tempDir, "verification_report.json"),
                '{"old": "report"}',
                "utf-8"
              )
            }
            if (hasMd) {
              await writeFile(
                join(tempDir, "verification_report.md"),
                "# Old Report\n",
                "utf-8"
              )
            }

            // Run cleanup
            await cleanupStaleReports(tempDir)

            // Both files should not exist after cleanup
            const jsonExists = await access(join(tempDir, "verification_report.json"))
              .then(() => true)
              .catch(() => false)
            const mdExists = await access(join(tempDir, "verification_report.md"))
              .then(() => true)
              .catch(() => false)

            expect(jsonExists).toBe(false)
            expect(mdExists).toBe(false)
          } finally {
            const { rm } = await import("node:fs/promises")
            await rm(tempDir, { recursive: true, force: true }).catch(() => {})
          }
        }
      ),
      { numRuns: 20 }  // Reduced runs due to filesystem I/O
    )
  })

  it("cleanup succeeds even when files do not exist (ENOENT is ignored)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 100 }), async (_seed) => {
        const tempDir = join(tmpdir(), `sf-test-p20a-empty-${randomUUID()}`)

        try {
          await mkdir(tempDir, { recursive: true })

          // No files exist — cleanup should not throw
          await expect(cleanupStaleReports(tempDir)).resolves.toBeUndefined()
        } finally {
          const { rm } = await import("node:fs/promises")
          await rm(tempDir, { recursive: true, force: true }).catch(() => {})
        }
      }),
      { numRuns: 10 }
    )
  })
})

// ============================================================
// Property 20b: Cleanup failure blocks verification
// ============================================================

describe("Property 20b: Cleanup failure blocks verification", () => {
  /**
   * **Validates: Requirements 6.9**
   */
  it("cleanupStaleReports throws on non-ENOENT unlink errors (blocking verification)", async () => {
    // We test this by attempting to unlink a directory (which gives EPERM/EISDIR, not ENOENT)
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 50 }), async (_seed) => {
        const tempDir = join(tmpdir(), `sf-test-p20b-${randomUUID()}`)
        const jsonPath = join(tempDir, "verification_report.json")

        try {
          await mkdir(tempDir, { recursive: true })

          // Create a directory where the file should be — unlink will fail with EPERM/EISDIR
          await mkdir(jsonPath, { recursive: true })

          // cleanupStaleReports should throw (non-ENOENT error)
          await expect(cleanupStaleReports(tempDir)).rejects.toThrow()
        } finally {
          const { rm } = await import("node:fs/promises")
          await rm(tempDir, { recursive: true, force: true }).catch(() => {})
        }
      }),
      { numRuns: 10 }
    )
  })

  it("non-ENOENT errors propagate and prevent further execution", async () => {
    // Simulate: if cleanupStaleReports throws, the caller should not proceed
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 50 }), async (_seed) => {
        const tempDir = join(tmpdir(), `sf-test-p20b2-${randomUUID()}`)
        const jsonPath = join(tempDir, "verification_report.json")

        try {
          await mkdir(tempDir, { recursive: true })
          // Create directory at json path to cause non-ENOENT error
          await mkdir(jsonPath, { recursive: true })

          let executionProceeded = false

          try {
            await cleanupStaleReports(tempDir)
            // If we get here, cleanup didn't throw (shouldn't happen)
            executionProceeded = true
          } catch {
            // Expected: cleanup threw, execution should NOT proceed
            executionProceeded = false
          }

          // Verification: execution must NOT have proceeded
          expect(executionProceeded).toBe(false)
        } finally {
          const { rm } = await import("node:fs/promises")
          await rm(tempDir, { recursive: true, force: true }).catch(() => {})
        }
      }),
      { numRuns: 10 }
    )
  })
})
