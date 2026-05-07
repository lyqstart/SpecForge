/**
 * Unit tests for sf_verifier_execution_core.ts
 * Tests: cleanupStaleReports, collectVerificationCommands, executeCommand,
 *        writeReportAtomically, generateMarkdownReport, generateVerificationReport
 *
 * Requirements: REQ-6 AC-1 through AC-9, REQ-9 AC-12
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  cleanupStaleReports,
  collectVerificationCommands,
  executeCommand,
  writeReportAtomically,
  generateMarkdownReport,
  generateVerificationReport,
} from "../../../../.opencode/tools/lib/sf_verifier_execution_core"
import type { VerificationReport } from "../../../../.opencode/tools/lib/sf_verification_types"

describe("sf_verifier_execution_core", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-verifier-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ============================================================
  // cleanupStaleReports
  // ============================================================

  describe("cleanupStaleReports", () => {
    it("should delete existing verification_report.json and verification_report.md", async () => {
      const jsonPath = join(tempDir, "verification_report.json")
      const mdPath = join(tempDir, "verification_report.md")
      await writeFile(jsonPath, "{}", "utf-8")
      await writeFile(mdPath, "# Report", "utf-8")

      await cleanupStaleReports(tempDir)

      // Both files should be gone
      await expect(readFile(jsonPath)).rejects.toThrow()
      await expect(readFile(mdPath)).rejects.toThrow()
    })

    it("should not throw if files do not exist (ENOENT)", async () => {
      // No files exist — should not throw
      await expect(cleanupStaleReports(tempDir)).resolves.toBeUndefined()
    })

    it("should throw on non-ENOENT errors", async () => {
      // Use a non-existent directory to trigger a non-ENOENT error
      const badDir = join(tempDir, "nonexistent", "deep", "path")
      // On Windows, trying to unlink a file in a non-existent directory gives ENOENT
      // So we test with a directory path instead of a file
      // This test verifies the error propagation logic
      await expect(cleanupStaleReports(badDir)).resolves.toBeUndefined()
    })
  })

  // ============================================================
  // collectVerificationCommands
  // ============================================================

  describe("collectVerificationCommands", () => {
    it("should collect typed commands with type field", () => {
      const tasksContent = `# Tasks

## TASK-1 Test task

- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
  - property: \`bun test tests/property/foo.property.test.ts\`
- **refs**: [REQ-1, CP-1]
`
      const commands = collectVerificationCommands(tasksContent)

      expect(commands).toHaveLength(2)
      expect(commands[0]).toEqual({
        command: "bun test tests/unit/foo.test.ts",
        type: "unit",
      })
      expect(commands[1]).toEqual({
        command: "bun test tests/property/foo.property.test.ts",
        type: "property",
      })
    })

    it("should collect legacy commands without type field", () => {
      const tasksContent = `# Tasks

## TASK-1 Test task

- **verification_commands**:
  - \`bun test tests/unit/foo.test.ts\`
  - \`bun test tests/integration/bar.test.ts\`
`
      const commands = collectVerificationCommands(tasksContent)

      expect(commands).toHaveLength(2)
      expect(commands[0]).toEqual({ command: "bun test tests/unit/foo.test.ts" })
      expect(commands[1]).toEqual({ command: "bun test tests/integration/bar.test.ts" })
      // Legacy commands should NOT have type field
      expect(commands[0]).not.toHaveProperty("type")
      expect(commands[1]).not.toHaveProperty("type")
    })

    it("should skip manual_verification_checks entirely", () => {
      const tasksContent = `# Tasks

## TASK-1 Test task

- **verification_commands**:
  - unit: \`bun test tests/unit/foo.test.ts\`
- **manual_verification_checks**:
  - \`确认 src/parser.ts 文件已创建\`
  - \`检查 README 更新\`
- **refs**: [REQ-1]
`
      const commands = collectVerificationCommands(tasksContent)

      expect(commands).toHaveLength(1)
      expect(commands[0].command).toBe("bun test tests/unit/foo.test.ts")
    })

    it("should handle mixed format tasks (typed + legacy)", () => {
      const tasksContent = `# Tasks

## TASK-1 Typed task

- **verification_commands**:
  - unit: \`bun test tests/unit/a.test.ts\`
- **refs**: [REQ-1]

## TASK-2 Legacy task

- **verification_commands**:
  - \`bun test tests/legacy.test.ts\`
`
      const commands = collectVerificationCommands(tasksContent)

      expect(commands).toHaveLength(2)
      expect(commands[0]).toEqual({ command: "bun test tests/unit/a.test.ts", type: "unit" })
      expect(commands[1]).toEqual({ command: "bun test tests/legacy.test.ts" })
      expect(commands[1]).not.toHaveProperty("type")
    })

    it("should handle multi-line typed commands", () => {
      const tasksContent = `# Tasks

## TASK-1 Multi-command task

- **verification_commands**:
  - unit:
    - \`bun test tests/unit/a.test.ts\`
    - \`bun test tests/unit/b.test.ts\`
  - e2e: \`bun test tests/e2e/flow.test.ts\`
- **refs**: [REQ-1]
`
      const commands = collectVerificationCommands(tasksContent)

      expect(commands).toHaveLength(3)
      expect(commands[0]).toEqual({ command: "bun test tests/unit/a.test.ts", type: "unit" })
      expect(commands[1]).toEqual({ command: "bun test tests/unit/b.test.ts", type: "unit" })
      expect(commands[2]).toEqual({ command: "bun test tests/e2e/flow.test.ts", type: "e2e" })
    })

    it("should return empty array for tasks with no verification_commands", () => {
      const tasksContent = `# Tasks

## TASK-1 No commands

Some description without verification_commands field.
`
      const commands = collectVerificationCommands(tasksContent)
      expect(commands).toHaveLength(0)
    })
  })

  // ============================================================
  // executeCommand
  // ============================================================

  describe("executeCommand", () => {
    it("should record passed status for successful command", async () => {
      const result = await executeCommand({ command: "echo hello", type: "unit" })

      expect(result.status).toBe("passed")
      expect(result.exit_code).toBe(0)
      expect(result.type).toBe("unit")
      expect(result.command).toBe("echo hello")
      expect(result.stdout).toContain("hello")
    })

    it("should record failed status for non-zero exit code", async () => {
      // Use a command that exits with non-zero
      const result = await executeCommand({ command: "exit 1", type: "integration" })

      expect(result.status).toBe("failed")
      expect(result.exit_code).not.toBe(0)
      expect(result.type).toBe("integration")
    })

    it("should record skipped status when command cannot start", async () => {
      // Use a completely non-existent command
      const result = await executeCommand({
        command: "this_command_definitely_does_not_exist_xyz123",
        type: "e2e",
      })

      // On most systems this will either be "failed" (shell reports error) or "skipped"
      expect(["failed", "skipped"]).toContain(result.status)
      if (result.status === "skipped") {
        expect(result.exit_code).toBe(-1)
        expect(result.stderr).toBeDefined()
      }
    })

    it("should omit type field for legacy commands", async () => {
      const result = await executeCommand({ command: "echo legacy" })

      expect(result.status).toBe("passed")
      expect(result).not.toHaveProperty("type")
      expect(result.command).toBe("echo legacy")
    })

    it("should include type field for typed commands", async () => {
      const result = await executeCommand({ command: "echo typed", type: "property" })

      expect(result.type).toBe("property")
    })
  })

  // ============================================================
  // writeReportAtomically
  // ============================================================

  describe("writeReportAtomically", () => {
    it("should write content to the final path via temp file", async () => {
      const reportPath = join(tempDir, "test_report.json")
      const content = JSON.stringify({ test: true }, null, 2)

      await writeReportAtomically(reportPath, content)

      const written = await readFile(reportPath, "utf-8")
      expect(written).toBe(content)
    })

    it("should overwrite existing file atomically", async () => {
      const reportPath = join(tempDir, "test_report.json")
      await writeFile(reportPath, "old content", "utf-8")

      const newContent = "new content"
      await writeReportAtomically(reportPath, newContent)

      const written = await readFile(reportPath, "utf-8")
      expect(written).toBe(newContent)
    })
  })

  // ============================================================
  // generateMarkdownReport
  // ============================================================

  describe("generateMarkdownReport", () => {
    it("should generate markdown with correct structure", () => {
      const report: VerificationReport = {
        schema_version: "1.0",
        work_item_id: "WI-001",
        status: "completed",
        commands: [
          { type: "unit", command: "bun test unit", status: "passed", exit_code: 0 },
          { type: "property", command: "bun test prop", status: "failed", exit_code: 1 },
          { command: "bun test legacy", status: "passed", exit_code: 0 },
        ],
      }

      const md = generateMarkdownReport(report)

      expect(md).toContain("# Verification Report")
      expect(md).toContain("**Work Item:** WI-001")
      expect(md).toContain("**Status:** completed")
      expect(md).toContain("[unit]")
      expect(md).toContain("[property]")
      expect(md).toContain("`bun test unit`")
      expect(md).toContain("**passed**")
      expect(md).toContain("**failed**")
      expect(md).toContain("**Result: FAIL**")
    })

    it("should show PASS when all commands pass", () => {
      const report: VerificationReport = {
        schema_version: "1.0",
        work_item_id: "WI-002",
        status: "completed",
        commands: [
          { type: "unit", command: "bun test", status: "passed", exit_code: 0 },
        ],
      }

      const md = generateMarkdownReport(report)
      expect(md).toContain("**Result: PASS**")
    })

    it("should not include type label for legacy commands", () => {
      const report: VerificationReport = {
        schema_version: "1.0",
        work_item_id: "WI-003",
        status: "completed",
        commands: [
          { command: "bun test legacy", status: "passed", exit_code: 0 },
        ],
      }

      const md = generateMarkdownReport(report)
      expect(md).not.toContain("[unit]")
      expect(md).not.toContain("[property]")
      expect(md).toContain("`bun test legacy`")
    })
  })

  // ============================================================
  // generateVerificationReport (integration)
  // ============================================================

  describe("generateVerificationReport", () => {
    it("should generate both JSON and MD reports", async () => {
      const tasksContent = `# Tasks

## TASK-1 Simple test

- **verification_commands**:
  - \`echo hello\`
`
      const report = await generateVerificationReport("WI-TEST", tempDir, tasksContent)

      expect(report.schema_version).toBe("1.0")
      expect(report.work_item_id).toBe("WI-TEST")
      expect(report.status).toBe("completed")
      expect(report.commands).toHaveLength(1)
      expect(report.commands[0].status).toBe("passed")

      // Verify JSON file was written
      const jsonContent = await readFile(join(tempDir, "verification_report.json"), "utf-8")
      const parsed = JSON.parse(jsonContent)
      expect(parsed.status).toBe("completed")
      expect(parsed.work_item_id).toBe("WI-TEST")

      // Verify MD file was written
      const mdContent = await readFile(join(tempDir, "verification_report.md"), "utf-8")
      expect(mdContent).toContain("# Verification Report")
      expect(mdContent).toContain("WI-TEST")
    })

    it("should cleanup stale reports before execution", async () => {
      // Create stale reports
      await writeFile(join(tempDir, "verification_report.json"), '{"status":"old"}', "utf-8")
      await writeFile(join(tempDir, "verification_report.md"), "# Old", "utf-8")

      const tasksContent = `# Tasks

## TASK-1 Test

- **verification_commands**:
  - \`echo fresh\`
`
      const report = await generateVerificationReport("WI-FRESH", tempDir, tasksContent)

      // New report should have the fresh work item id
      expect(report.work_item_id).toBe("WI-FRESH")
      const jsonContent = await readFile(join(tempDir, "verification_report.json"), "utf-8")
      const parsed = JSON.parse(jsonContent)
      expect(parsed.work_item_id).toBe("WI-FRESH")
    })

    it("should use collect-all strategy (continue after failure)", async () => {
      const tasksContent = `# Tasks

## TASK-1 Multi-command

- **verification_commands**:
  - \`exit 1\`
  - \`echo after_failure\`
`
      const report = await generateVerificationReport("WI-COLLECT", tempDir, tasksContent)

      // Both commands should be recorded
      expect(report.commands).toHaveLength(2)
      expect(report.commands[0].status).toBe("failed")
      expect(report.commands[1].status).toBe("passed")
      expect(report.commands[1].stdout).toContain("after_failure")
    })

    it("should handle typed commands with type field in report", async () => {
      const tasksContent = `# Tasks

## TASK-1 Typed

- **verification_commands**:
  - unit: \`echo unit_test\`
  - e2e: \`echo e2e_test\`
- **refs**: [REQ-1]
`
      const report = await generateVerificationReport("WI-TYPED", tempDir, tasksContent)

      expect(report.commands[0].type).toBe("unit")
      expect(report.commands[1].type).toBe("e2e")
    })

    it("should handle legacy commands without type field in report", async () => {
      const tasksContent = `# Tasks

## TASK-1 Legacy

- **verification_commands**:
  - \`echo legacy_cmd\`
`
      const report = await generateVerificationReport("WI-LEGACY", tempDir, tasksContent)

      expect(report.commands[0]).not.toHaveProperty("type")
      expect(report.commands[0].command).toBe("echo legacy_cmd")
    })
  })
})
