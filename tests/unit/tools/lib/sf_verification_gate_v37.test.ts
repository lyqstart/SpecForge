/**
 * Unit tests for sf_verification_gate V3.7 changes
 *
 * Tests derivePlannedVerificationTypes, checkTypedVerificationResults, mergeGateResults directly.
 * For full gate tests, uses checkVerificationGate(workItemId, baseDir, options) with mock filesystem.
 *
 * Requirements: REQ-9 AC-6, REQ-9 AC-11
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  derivePlannedVerificationTypes,
  checkTypedVerificationResults,
  mergeGateResults,
  checkVerificationGate,
} from "../../../../.opencode/tools/lib/sf_verification_gate_core"
import type { GateResult } from "../../../../.opencode/tools/lib/sf_gate_types"
import type {
  VerificationType,
  VerificationReport,
} from "../../../../.opencode/tools/lib/sf_verification_types"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ============================================================
// Helper: create a valid VerificationReport
// ============================================================

function makeReport(
  commands: Array<{ type?: VerificationType; command: string; status: "passed" | "failed" | "skipped"; exit_code?: number }>,
  overrides?: Partial<VerificationReport>
): VerificationReport {
  return {
    schema_version: "1.0",
    work_item_id: "WI-TEST",
    status: "completed",
    commands: commands.map((c) => ({
      type: c.type,
      command: c.command,
      status: c.status,
      exit_code: c.exit_code ?? (c.status === "passed" ? 0 : c.status === "failed" ? 1 : -1),
    })),
    ...overrides,
  }
}

// ============================================================
// Unit tests for derivePlannedVerificationTypes
// ============================================================

describe("derivePlannedVerificationTypes", () => {
  it("should return null when all tasks use legacy format", () => {
    const tasksContent = `# Tasks

## Task 1: Implement feature

- **verification_commands**:
  - \`bun test tests/unit/foo.test.ts\`
  - \`bun test tests/integration/bar.test.ts\`
`
    const result = derivePlannedVerificationTypes(tasksContent)
    expect(result).toBeNull()
  })

  it("should return typed keys when tasks use typed format", () => {
    const tasksContent = `# Tasks

## Task 1: Implement feature

- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
  - property: \`bun test tests/property/foo.property.test.ts\`
`
    const result = derivePlannedVerificationTypes(tasksContent)
    expect(result).not.toBeNull()
    expect(result!.has("unit")).toBe(true)
    expect(result!.has("property")).toBe(true)
    expect(result!.size).toBe(2)
  })

  it("should return union of all typed task keys", () => {
    const tasksContent = `# Tasks

## Task 1: Unit tests

- **verification_commands**:
  - unit: \`bun test tests/unit/a.test.ts\`

## Task 2: Integration tests

- **verification_commands**:
  - integration: \`bun test tests/integration/b.test.ts\`
  - e2e: \`bun test tests/e2e/c.test.ts\`
`
    const result = derivePlannedVerificationTypes(tasksContent)
    expect(result).not.toBeNull()
    expect(result!.has("unit")).toBe(true)
    expect(result!.has("integration")).toBe(true)
    expect(result!.has("e2e")).toBe(true)
    expect(result!.size).toBe(3)
  })

  it("should return non-null when at least one task is typed (mixed format)", () => {
    const tasksContent = `# Tasks

## Task 1: Legacy task

- **verification_commands**:
  - \`bun test tests/unit/foo.test.ts\`

## Task 2: Typed task

- **verification_commands**:
  - unit: \`bun test tests/unit/bar.test.ts\`
`
    const result = derivePlannedVerificationTypes(tasksContent)
    expect(result).not.toBeNull()
    expect(result!.has("unit")).toBe(true)
  })
})

// ============================================================
// Unit tests for checkTypedVerificationResults
// ============================================================

describe("checkTypedVerificationResults", () => {
  it("should pass when all required types have passing records", () => {
    const report = makeReport([
      { type: "unit", command: "bun test unit", status: "passed" },
      { type: "property", command: "bun test property", status: "passed" },
      { type: "integration", command: "bun test integration", status: "passed" },
    ])
    const requiredTypes = new Set<VerificationType>(["unit", "property", "integration"])

    const result = checkTypedVerificationResults(report, requiredTypes)

    expect(result.status).toBe("pass")
    expect(result.blocking_issues).toHaveLength(0)
    expect(result.next_action).toBe("continue")
    expect(result.details).toBeDefined()
    expect((result.details as any).type_results.unit).toBe("passed")
    expect((result.details as any).type_results.property).toBe("passed")
    expect((result.details as any).type_results.integration).toBe("passed")
  })

  it("should fail when some required types are missing from report", () => {
    const report = makeReport([
      { type: "unit", command: "bun test unit", status: "passed" },
    ])
    const requiredTypes = new Set<VerificationType>(["unit", "property", "integration"])

    const result = checkTypedVerificationResults(report, requiredTypes)

    expect(result.status).toBe("fail")
    expect(result.blocking_issues.length).toBeGreaterThan(0)
    expect(result.next_action).toBe("revise")
    const typeResults = (result.details as any).type_results
    expect(typeResults.unit).toBe("passed")
    expect(typeResults.property).toBe("missing")
    expect(typeResults.integration).toBe("missing")
  })

  it("should mark type as failed when commands have failed status", () => {
    const report = makeReport([
      { type: "unit", command: "bun test unit", status: "passed" },
      { type: "property", command: "bun test property", status: "failed" },
    ])
    const requiredTypes = new Set<VerificationType>(["unit", "property"])

    const result = checkTypedVerificationResults(report, requiredTypes)

    expect(result.status).toBe("fail")
    const typeResults = (result.details as any).type_results
    expect(typeResults.unit).toBe("passed")
    expect(typeResults.property).toBe("failed")
  })

  it("should mark type as skipped when all commands are skipped", () => {
    const report = makeReport([
      { type: "unit", command: "bun test unit", status: "passed" },
      { type: "e2e", command: "bun test e2e", status: "skipped" },
    ])
    const requiredTypes = new Set<VerificationType>(["unit", "e2e"])

    const result = checkTypedVerificationResults(report, requiredTypes)

    expect(result.status).toBe("fail")
    const typeResults = (result.details as any).type_results
    expect(typeResults.unit).toBe("passed")
    expect(typeResults.e2e).toBe("skipped")
  })

  it("should place type_results under details, not at top level", () => {
    const report = makeReport([
      { type: "unit", command: "bun test unit", status: "passed" },
    ])
    const requiredTypes = new Set<VerificationType>(["unit"])

    const result = checkTypedVerificationResults(report, requiredTypes)

    // type_results must be nested under details
    expect(result.details).toBeDefined()
    expect((result.details as any).type_results).toBeDefined()
    // Must NOT be at top level
    expect((result as any).type_results).toBeUndefined()
  })
})

// ============================================================
// Unit tests for mergeGateResults
// ============================================================

describe("mergeGateResults", () => {
  it("should pass when both typed and legacy pass", () => {
    const typedResult: GateResult = {
      status: "pass",
      blocking_issues: [],
      warnings: [],
      next_action: "continue",
      details: { type_results: { unit: "passed" } },
    }
    const legacyResult: GateResult = {
      status: "pass",
      blocking_issues: [],
      warnings: [],
      next_action: "continue",
    }

    const merged = mergeGateResults(typedResult, legacyResult)

    expect(merged.status).toBe("pass")
    expect(merged.blocking_issues).toHaveLength(0)
    expect(merged.next_action).toBe("continue")
  })

  it("should fail when typed passes but legacy fails", () => {
    const typedResult: GateResult = {
      status: "pass",
      blocking_issues: [],
      warnings: [],
      next_action: "continue",
      details: { type_results: { unit: "passed" } },
    }
    const legacyResult: GateResult = {
      status: "fail",
      blocking_issues: ["Legacy test failed"],
      warnings: [],
      next_action: "revise",
    }

    const merged = mergeGateResults(typedResult, legacyResult)

    expect(merged.status).toBe("fail")
    expect(merged.blocking_issues).toContain("Legacy test failed")
    expect(merged.next_action).toBe("revise")
  })

  it("should fail when typed fails but legacy passes", () => {
    const typedResult: GateResult = {
      status: "fail",
      blocking_issues: ["缺少 property 类型测试的通过记录"],
      warnings: [],
      next_action: "revise",
      details: { type_results: { unit: "passed", property: "missing" } },
    }
    const legacyResult: GateResult = {
      status: "pass",
      blocking_issues: [],
      warnings: [],
      next_action: "continue",
    }

    const merged = mergeGateResults(typedResult, legacyResult)

    expect(merged.status).toBe("fail")
    expect(merged.blocking_issues.length).toBeGreaterThan(0)
    expect(merged.next_action).toBe("revise")
  })

  it("should preserve details from typed result", () => {
    const typedResult: GateResult = {
      status: "pass",
      blocking_issues: [],
      warnings: [],
      next_action: "continue",
      details: { type_results: { unit: "passed", property: "passed" } },
    }
    const legacyResult: GateResult = {
      status: "pass",
      blocking_issues: [],
      warnings: [],
      next_action: "continue",
    }

    const merged = mergeGateResults(typedResult, legacyResult)

    expect(merged.details).toBeDefined()
    expect((merged.details as any).type_results.unit).toBe("passed")
    expect((merged.details as any).type_results.property).toBe("passed")
  })

  it("should return blocked when either result is blocked", () => {
    const typedResult: GateResult = {
      status: "blocked",
      blocking_issues: ["Blocked issue"],
      warnings: [],
      next_action: "ask_user",
    }
    const legacyResult: GateResult = {
      status: "pass",
      blocking_issues: [],
      warnings: [],
      next_action: "continue",
    }

    const merged = mergeGateResults(typedResult, legacyResult)

    expect(merged.status).toBe("blocked")
    expect(merged.next_action).toBe("ask_user")
  })
})

// ============================================================
// Integration tests for checkVerificationGate with mock filesystem
// ============================================================

describe("checkVerificationGate - V3.7 typed verification", () => {
  const testDir = join(tmpdir(), `specforge-vgate-v37-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = "WI-V37"
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

  // Helper to write tasks.md with typed format
  async function writeTypedTasksMd(types: VerificationType[]) {
    const commands = types.map((t) => `  - ${t}: \`bun test tests/${t}/test.ts\``).join("\n")
    const content = `# Tasks

## Task 1: Implementation

- **verification_commands**:
${commands}
- **refs**: [REQ-1, CP-1]
`
    await writeFile(join(specDir, "tasks.md"), content, "utf-8")
  }

  // Helper to write legacy tasks.md
  async function writeLegacyTasksMd() {
    const content = `# Tasks

## Task 1: Implementation

- **verification_commands**:
  - \`bun test tests/unit/foo.test.ts\`
  - \`bun test tests/integration/bar.test.ts\`
`
    await writeFile(join(specDir, "tasks.md"), content, "utf-8")
  }

  // Helper to write verification_report.json
  async function writeJsonReport(report: VerificationReport) {
    await writeFile(
      join(specDir, "verification_report.json"),
      JSON.stringify(report, null, 2),
      "utf-8"
    )
  }

  describe("all Planned_Verification_Types pass", () => {
    it("should pass when all typed verification types have passing records", async () => {
      await writeTypedTasksMd(["unit", "property"])
      await writeJsonReport(makeReport([
        { type: "unit", command: "bun test tests/unit/test.ts", status: "passed" },
        { type: "property", command: "bun test tests/property/test.ts", status: "passed" },
      ]))

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.details).toBeDefined()
      const typeResults = (result.details as any).type_results
      expect(typeResults.unit).toBe("passed")
      expect(typeResults.property).toBe("passed")
    })
  })

  describe("partial Planned_Verification_Types missing", () => {
    it("should fail with missing types reported in details.type_results", async () => {
      await writeTypedTasksMd(["unit", "property", "integration"])
      await writeJsonReport(makeReport([
        { type: "unit", command: "bun test tests/unit/test.ts", status: "passed" },
        // property and integration missing from report
      ]))

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(result.blocking_issues.some((i) => i.includes("property"))).toBe(true)
      expect(result.blocking_issues.some((i) => i.includes("integration"))).toBe(true)
      const typeResults = (result.details as any).type_results
      expect(typeResults.unit).toBe("passed")
      expect(typeResults.property).toBe("missing")
      expect(typeResults.integration).toBe("missing")
    })
  })

  describe("legacy format tasks.md fallback", () => {
    it("should fallback to V3.6 behavior when all tasks use legacy format", async () => {
      await writeLegacyTasksMd()
      // Write a V3.6-style verification_report.md with passing results and e2e evidence
      await writeFile(
        join(specDir, "verification_report.md"),
        `# Verification Report\n\nAll tests passed ✅\n\nE2E tests: 3 passed\n`,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      // Should NOT have details.type_results (V3.6 behavior)
      expect(result.details).toBeUndefined()
    })

    it("should fail in V3.6 mode when no verification files exist with legacy tasks", async () => {
      await writeLegacyTasksMd()
      // No verification_report.md or verification_report.json

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("未找到验证结果文件")
    })
  })

  describe("mixed format tasks.md", () => {
    async function writeMixedTasksMd() {
      const content = `# Tasks

## Task 1: Typed task

- **verification_commands**:
  - unit: \`bun test tests/unit/a.test.ts\`
  - property: \`bun test tests/property/a.property.test.ts\`
- **refs**: [REQ-1, CP-1]

## Task 2: Legacy task

- **verification_commands**:
  - \`bun test tests/integration/b.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")
    }

    it("should produce non-blocking warning for mixed format", async () => {
      await writeMixedTasksMd()
      await writeJsonReport(makeReport([
        { type: "unit", command: "bun test tests/unit/a.test.ts", status: "passed" },
        { type: "property", command: "bun test tests/property/a.property.test.ts", status: "passed" },
      ]))
      // Also need a verification_report.md for legacy part
      await writeFile(
        join(specDir, "verification_report.md"),
        `# Verification Report\n\nAll tests passed ✅\n\nE2E tests: 2 passed\n`,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.warnings.some((w) => w.includes("混合格式"))).toBe(true)
    })

    it("should fail when typed passes but legacy fails (mixed format)", async () => {
      await writeMixedTasksMd()
      await writeJsonReport(makeReport([
        { type: "unit", command: "bun test tests/unit/a.test.ts", status: "passed" },
        { type: "property", command: "bun test tests/property/a.property.test.ts", status: "passed" },
      ]))
      // Legacy verification file shows failure
      await writeFile(
        join(specDir, "verification_report.md"),
        `# Verification Report\n\nTests FAILED\nError: assertion failed\n`,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
    })

    it("should fail when typed fails but legacy passes (mixed format)", async () => {
      await writeMixedTasksMd()
      // Report missing property type
      await writeJsonReport(makeReport([
        { type: "unit", command: "bun test tests/unit/a.test.ts", status: "passed" },
        // property missing
      ]))
      // Legacy verification file passes
      await writeFile(
        join(specDir, "verification_report.md"),
        `# Verification Report\n\nAll tests passed ✅\n\nE2E tests: 2 passed\n`,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
    })
  })

  describe("required_types parameter", () => {
    it("should check by required_types regardless of tasks.md format", async () => {
      // Write legacy tasks.md
      await writeLegacyTasksMd()
      // But provide a structured report
      await writeJsonReport(makeReport([
        { type: "unit", command: "bun test unit", status: "passed" },
        { type: "property", command: "bun test property", status: "passed" },
      ]))

      const result = await checkVerificationGate(workItemId, testDir, {
        required_types: ["unit", "property"],
      })

      expect(result.status).toBe("pass")
      expect(result.details).toBeDefined()
      const typeResults = (result.details as any).type_results
      expect(typeResults.unit).toBe("passed")
      expect(typeResults.property).toBe("passed")
    })

    it("should fail when required_types specifies types not in report", async () => {
      await writeLegacyTasksMd()
      await writeJsonReport(makeReport([
        { type: "unit", command: "bun test unit", status: "passed" },
      ]))

      const result = await checkVerificationGate(workItemId, testDir, {
        required_types: ["unit", "e2e"],
      })

      expect(result.status).toBe("fail")
      const typeResults = (result.details as any).type_results
      expect(typeResults.unit).toBe("passed")
      expect(typeResults.e2e).toBe("missing")
    })

    it("should fail when required_types provided but no structured report exists", async () => {
      await writeLegacyTasksMd()
      // No verification_report.json

      const result = await checkVerificationGate(workItemId, testDir, {
        required_types: ["unit"],
      })

      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("missing, malformed, or incomplete")
    })
  })

  describe("malformed JSON report", () => {
    it("should fail and NOT fallback to V3.6 when JSON is malformed", async () => {
      await writeTypedTasksMd(["unit"])
      // Write invalid JSON
      await writeFile(
        join(specDir, "verification_report.json"),
        "{ this is not valid json !!!",
        "utf-8"
      )
      // Even if a valid verification_report.md exists, should NOT fallback
      await writeFile(
        join(specDir, "verification_report.md"),
        `# Verification Report\n\nAll tests passed ✅\n\nE2E tests: 2 passed\n`,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("missing, malformed, or incomplete")
    })

    it("should fail when JSON is valid but missing required fields", async () => {
      await writeTypedTasksMd(["unit"])
      // Write JSON missing required fields
      await writeFile(
        join(specDir, "verification_report.json"),
        JSON.stringify({ schema_version: "1.0" }),
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("missing, malformed, or incomplete")
    })
  })

  describe("report status != completed", () => {
    it("should fail with blocking_issue containing 'incomplete' when status is not completed", async () => {
      await writeTypedTasksMd(["unit"])
      await writeFile(
        join(specDir, "verification_report.json"),
        JSON.stringify({
          schema_version: "1.0",
          work_item_id: "WI-V37",
          status: "incomplete",
          commands: [],
        }),
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("incomplete")
    })
  })

  describe("details.type_results nesting", () => {
    it("should nest type_results under details, not at top level of GateResult", async () => {
      await writeTypedTasksMd(["unit", "property"])
      await writeJsonReport(makeReport([
        { type: "unit", command: "bun test unit", status: "passed" },
        { type: "property", command: "bun test property", status: "passed" },
      ]))

      const result = await checkVerificationGate(workItemId, testDir)

      // type_results must be nested under details
      expect(result.details).toBeDefined()
      expect((result.details as any).type_results).toBeDefined()
      expect((result.details as any).type_results.unit).toBe("passed")
      expect((result.details as any).type_results.property).toBe("passed")

      // Must NOT be at top level
      expect((result as any).type_results).toBeUndefined()

      // Existing callers that ignore details should still work
      const { details, ...withoutDetails } = result
      expect(withoutDetails.status).toBe("pass")
      expect(withoutDetails.blocking_issues).toHaveLength(0)
      expect(withoutDetails.next_action).toBe("continue")
    })
  })
})
