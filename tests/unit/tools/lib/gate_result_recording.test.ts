import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { recordGateResult, type GateResultEntry } from "../../../../.opencode/tools/lib/utils"
import { readFile, rm, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as fc from "fast-check"

describe("recordGateResult", () => {
  const testDir = join(tmpdir(), `specforge-gate-result-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  beforeEach(async () => {
    await mkdir(join(testDir, "specforge", "runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge", "logs"), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should write gate_result entry to events.jsonl", async () => {
    const result = {
      status: "pass",
      blocking_issues: [] as string[],
      warnings: ["minor warning"],
    }

    await recordGateResult("WI-001", "sf_design_gate", result, testDir)

    const content = await readFile(
      join(testDir, "specforge", "runtime", "events.jsonl"),
      "utf-8"
    )
    const entry = JSON.parse(content.trim()) as GateResultEntry

    expect(entry.type).toBe("gate_result")
    expect(entry.work_item_id).toBe("WI-001")
    expect(entry.gate).toBe("sf_design_gate")
    expect(entry.status).toBe("pass")
    expect(entry.blocking_issues).toEqual([])
    expect(entry.warnings).toEqual(["minor warning"])
    expect(entry.timestamp).toBeDefined()
    // Verify timestamp is valid ISO string
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)
  })

  it("should have non-empty blocking_issues when status is fail", async () => {
    const result = {
      status: "fail",
      blocking_issues: ["design.md not found"],
      warnings: [],
    }

    await recordGateResult("WI-002", "sf_requirements_gate", result, testDir)

    const content = await readFile(
      join(testDir, "specforge", "runtime", "events.jsonl"),
      "utf-8"
    )
    const entry = JSON.parse(content.trim()) as GateResultEntry

    expect(entry.status).toBe("fail")
    expect(entry.blocking_issues.length).toBeGreaterThan(0)
    expect(entry.blocking_issues).toContain("design.md not found")
  })

  it("should have empty blocking_issues when status is pass", async () => {
    const result = {
      status: "pass",
      blocking_issues: [] as string[],
      warnings: [],
    }

    await recordGateResult("WI-003", "sf_tasks_gate", result, testDir)

    const content = await readFile(
      join(testDir, "specforge", "runtime", "events.jsonl"),
      "utf-8"
    )
    const entry = JSON.parse(content.trim()) as GateResultEntry

    expect(entry.status).toBe("pass")
    expect(entry.blocking_issues).toEqual([])
  })

  it("should fallback to error.log when events.jsonl write fails", async () => {
    // Remove the runtime directory to cause write failure
    await rm(join(testDir, "specforge", "runtime"), { recursive: true, force: true })
    // Create a file where the directory should be to cause mkdir to fail
    await writeFile(join(testDir, "specforge", "runtime"), "block", "utf-8")

    const result = {
      status: "pass",
      blocking_issues: [] as string[],
      warnings: [],
    }

    // Should not throw
    await recordGateResult("WI-004", "sf_verification_gate", result, testDir)

    const errorContent = await readFile(
      join(testDir, "specforge", "logs", "error.log"),
      "utf-8"
    )
    const errorEntry = JSON.parse(errorContent.trim())

    expect(errorEntry.level).toBe("ERROR")
    expect(errorEntry.component).toBe("sf_verification_gate")
    expect(errorEntry.event).toBe("gate_result_write_failed")
    expect(errorEntry.payload.work_item_id).toBe("WI-004")
  })

  it("should include all required fields in the entry", async () => {
    const result = {
      status: "blocked",
      blocking_issues: ["cannot read file"],
      warnings: ["timeout warning"],
    }

    await recordGateResult("WI-005", "sf_design_gate", result, testDir)

    const content = await readFile(
      join(testDir, "specforge", "runtime", "events.jsonl"),
      "utf-8"
    )
    const entry = JSON.parse(content.trim())

    // Verify all required fields exist
    expect(entry).toHaveProperty("type")
    expect(entry).toHaveProperty("timestamp")
    expect(entry).toHaveProperty("work_item_id")
    expect(entry).toHaveProperty("gate")
    expect(entry).toHaveProperty("status")
    expect(entry).toHaveProperty("blocking_issues")
    expect(entry).toHaveProperty("warnings")
  })

  // Property 8: Gate result logging consistency
  describe("Feature: specforge-v2-efficiency, Property 8: gate result logging consistency", () => {
    it("should maintain consistency between status and blocking_issues", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            gateName: fc.constantFrom(
              "sf_requirements_gate",
              "sf_design_gate",
              "sf_tasks_gate",
              "sf_verification_gate"
            ),
            status: fc.constantFrom("pass", "fail", "blocked"),
            blockingIssues: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
            warnings: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 }),
            workItemId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          }),
          async ({ gateName, status, blockingIssues, warnings, workItemId }) => {
            // Ensure consistency: fail/blocked must have blocking_issues, pass must have empty
            const consistentBlockingIssues =
              status === "pass" ? [] : (blockingIssues.length === 0 ? ["issue"] : blockingIssues)

            const result = {
              status,
              blocking_issues: consistentBlockingIssues,
              warnings,
            }

            const localDir = join(
              tmpdir(),
              `specforge-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`
            )
            await mkdir(join(localDir, "specforge", "runtime"), { recursive: true })
            await mkdir(join(localDir, "specforge", "logs"), { recursive: true })

            try {
              await recordGateResult(workItemId, gateName, result, localDir)

              const content = await readFile(
                join(localDir, "specforge", "runtime", "events.jsonl"),
                "utf-8"
              )
              const entry = JSON.parse(content.trim()) as GateResultEntry

              // Verify structure
              expect(entry.type).toBe("gate_result")
              expect(entry.work_item_id).toBe(workItemId)
              expect(entry.gate).toBe(gateName)
              expect(entry.status).toBe(status)
              expect(entry.blocking_issues).toEqual(consistentBlockingIssues)
              expect(entry.warnings).toEqual(warnings)
              expect(typeof entry.timestamp).toBe("string")

              // Verify consistency: pass → empty blocking_issues
              if (entry.status === "pass") {
                expect(entry.blocking_issues).toEqual([])
              }
              // Verify consistency: fail/blocked → non-empty blocking_issues
              if (entry.status === "fail" || entry.status === "blocked") {
                expect(entry.blocking_issues.length).toBeGreaterThan(0)
              }
            } finally {
              await rm(localDir, { recursive: true, force: true })
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
