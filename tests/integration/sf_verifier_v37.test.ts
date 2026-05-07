/**
 * Integration tests for sf-verifier V3.7 execution
 *
 * Tests the full pipeline: generateVerificationReport → checkVerificationGate
 * Validates that the verifier's output is correctly consumed by the gate.
 *
 * Requirements: REQ-9 AC-12
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  generateVerificationReport,
  cleanupStaleReports,
  collectVerificationCommands,
  executeCommand,
} from "../../.opencode/tools/lib/sf_verifier_execution_core"
import { checkVerificationGate } from "../../.opencode/tools/lib/sf_verification_gate_core"
import type { VerificationReport } from "../../.opencode/tools/lib/sf_verification_types"

describe("sf-verifier V3.7 integration", () => {
  let baseDir: string
  let specDir: string
  const workItemId = "WI-INTEG-001"

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "sf-verifier-integ-"))
    specDir = join(baseDir, "specforge", "specs", workItemId)
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  // ============================================================
  // Typed task commands → report records have correct `type` field
  // ============================================================

  describe("typed task commands → report records have correct type field", () => {
    it("should include type field in report for typed verification_commands", async () => {
      const tasksContent = `# Tasks

## TASK-1 Typed verification

- **verification_commands**:
  - unit: \`echo unit_pass\`
  - integration: \`echo integration_pass\`
- **refs**: [REQ-1, CP-1]
`
      const report = await generateVerificationReport(workItemId, specDir, tasksContent)

      expect(report.commands).toHaveLength(2)
      expect(report.commands[0].type).toBe("unit")
      expect(report.commands[0].status).toBe("passed")
      expect(report.commands[1].type).toBe("integration")
      expect(report.commands[1].status).toBe("passed")
    })
  })

  // ============================================================
  // Legacy task commands → report records have no `type` field
  // ============================================================

  describe("legacy task commands → report records have no type field", () => {
    it("should omit type field in report for legacy verification_commands", async () => {
      const tasksContent = `# Tasks

## TASK-1 Legacy verification

- **verification_commands**:
  - \`echo legacy_pass\`
  - \`echo legacy_second\`
`
      const report = await generateVerificationReport(workItemId, specDir, tasksContent)

      expect(report.commands).toHaveLength(2)
      expect(report.commands[0]).not.toHaveProperty("type")
      expect(report.commands[0].command).toBe("echo legacy_pass")
      expect(report.commands[0].status).toBe("passed")
      expect(report.commands[1]).not.toHaveProperty("type")
    })
  })

  // ============================================================
  // manual_verification_checks entries → not in report
  // ============================================================

  describe("manual_verification_checks entries → not in report", () => {
    it("should not include manual_verification_checks in the report", async () => {
      const tasksContent = `# Tasks

## TASK-1 With manual checks

- **verification_commands**:
  - unit: \`echo unit_only\`
- **manual_verification_checks**:
  - \`确认 src/parser.ts 文件已创建\`
  - \`检查 README 更新\`
- **refs**: [REQ-1, CP-1]
`
      const report = await generateVerificationReport(workItemId, specDir, tasksContent)

      // Only the unit command should be in the report
      expect(report.commands).toHaveLength(1)
      expect(report.commands[0].command).toBe("echo unit_only")
      expect(report.commands[0].type).toBe("unit")

      // Manual checks should not appear anywhere in commands
      const allCommands = report.commands.map((c) => c.command)
      expect(allCommands).not.toContain("确认 src/parser.ts 文件已创建")
      expect(allCommands).not.toContain("检查 README 更新")
    })
  })

  // ============================================================
  // Mixed format tasks → typed have type, legacy don't, coexist
  // ============================================================

  describe("mixed format tasks → typed have type, legacy don't, coexist in commands array", () => {
    it("should produce mixed commands array with typed and legacy records", async () => {
      const tasksContent = `# Tasks

## TASK-1 Typed task

- **verification_commands**:
  - unit: \`echo typed_unit\`
  - property: \`echo typed_property\`
- **refs**: [REQ-1, CP-1]

## TASK-2 Legacy task

- **verification_commands**:
  - \`echo legacy_cmd\`
`
      const report = await generateVerificationReport(workItemId, specDir, tasksContent)

      expect(report.commands).toHaveLength(3)

      // Typed commands have type field
      const typedCmds = report.commands.filter((c) => "type" in c)
      expect(typedCmds).toHaveLength(2)
      expect(typedCmds[0].type).toBe("unit")
      expect(typedCmds[1].type).toBe("property")

      // Legacy commands don't have type field
      const legacyCmds = report.commands.filter((c) => !("type" in c))
      expect(legacyCmds).toHaveLength(1)
      expect(legacyCmds[0].command).toBe("echo legacy_cmd")
    })
  })

  // ============================================================
  // Command failure (exit_code != 0) → status="failed", subsequent commands still execute
  // ============================================================

  describe("command failure → status=failed, subsequent commands still execute (collect-all)", () => {
    it("should record failed status and continue executing remaining commands", async () => {
      const tasksContent = `# Tasks

## TASK-1 Failing then passing

- **verification_commands**:
  - unit: \`exit 1\`
  - integration: \`echo after_failure\`
- **refs**: [REQ-1, CP-1]
`
      const report = await generateVerificationReport(workItemId, specDir, tasksContent)

      expect(report.commands).toHaveLength(2)
      expect(report.commands[0].status).toBe("failed")
      expect(report.commands[0].exit_code).not.toBe(0)
      // Subsequent command still executed (collect-all strategy)
      expect(report.commands[1].status).toBe("passed")
      expect(report.commands[1].stdout).toContain("after_failure")
    })
  })

  // ============================================================
  // Command cannot start → status="skipped", stderr contains reason
  // ============================================================

  describe("command cannot start → status=skipped, stderr contains reason", () => {
    it("should record skipped status with stderr explanation for unlaunchable commands", async () => {
      const result = await executeCommand({
        command: "this_command_definitely_does_not_exist_xyz_abc_123",
        type: "e2e",
      })

      // On most systems, the shell will report an error (either "skipped" or "failed")
      // The key assertion is that the command is recorded and doesn't crash the process
      expect(["failed", "skipped"]).toContain(result.status)
      if (result.status === "skipped") {
        expect(result.exit_code).toBe(-1)
        expect(result.stderr).toBeDefined()
        expect(result.stderr!.length).toBeGreaterThan(0)
      } else {
        // On Windows/shells that report "not recognized" via stderr with non-zero exit
        expect(result.exit_code).not.toBe(0)
        expect(result.stderr).toBeDefined()
      }
    })
  })

  // ============================================================
  // Normal completion → status="completed", schema_version="1.0", work_item_id correct
  // ============================================================

  describe("normal completion → status=completed, schema_version=1.0, work_item_id correct", () => {
    it("should produce a completed report with correct metadata", async () => {
      const tasksContent = `# Tasks

## TASK-1 Simple passing

- **verification_commands**:
  - unit: \`echo pass\`
- **refs**: [REQ-1, CP-1]
`
      const report = await generateVerificationReport(workItemId, specDir, tasksContent)

      expect(report.status).toBe("completed")
      expect(report.schema_version).toBe("1.0")
      expect(report.work_item_id).toBe(workItemId)
    })
  })

  // ============================================================
  // Dual output: verification_report.json AND verification_report.md
  // ============================================================

  describe("dual output → generates both verification_report.json and verification_report.md", () => {
    it("should write both JSON and Markdown report files", async () => {
      const tasksContent = `# Tasks

## TASK-1 Dual output test

- **verification_commands**:
  - unit: \`echo dual_output\`
- **refs**: [REQ-1, CP-1]
`
      await generateVerificationReport(workItemId, specDir, tasksContent)

      // Verify JSON file exists and is valid
      const jsonContent = await readFile(join(specDir, "verification_report.json"), "utf-8")
      const parsed = JSON.parse(jsonContent) as VerificationReport
      expect(parsed.schema_version).toBe("1.0")
      expect(parsed.work_item_id).toBe(workItemId)
      expect(parsed.status).toBe("completed")
      expect(parsed.commands).toHaveLength(1)

      // Verify MD file exists and contains expected content
      const mdContent = await readFile(join(specDir, "verification_report.md"), "utf-8")
      expect(mdContent).toContain("# Verification Report")
      expect(mdContent).toContain(workItemId)
      expect(mdContent).toContain("[unit]")
      expect(mdContent).toContain("**passed**")
    })
  })

  // ============================================================
  // sf_verification_gate reads status != "completed" → fail, blocking_issue contains "incomplete"
  // ============================================================

  describe("sf_verification_gate reads status != completed → fail with incomplete", () => {
    it("should fail when verification_report.json has status=incomplete", async () => {
      // Write tasks.md with typed commands so gate doesn't fallback to V3.6
      await writeFile(
        join(specDir, "tasks.md"),
        `# Tasks

## TASK-1 Test

- **verification_commands**:
  - unit: \`echo test\`
- **refs**: [REQ-1, CP-1]
`,
        "utf-8"
      )

      // Write an incomplete report (simulating interrupted verifier)
      await writeFile(
        join(specDir, "verification_report.json"),
        JSON.stringify({
          schema_version: "1.0",
          work_item_id: workItemId,
          status: "incomplete",
          commands: [],
        }),
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, baseDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("incomplete")
    })
  })

  // ============================================================
  // Stale report cleanup: old reports deleted before execution
  // ============================================================

  describe("stale report cleanup → old reports deleted before execution", () => {
    it("should delete old reports before generating new ones", async () => {
      // Create stale reports with old data
      await writeFile(
        join(specDir, "verification_report.json"),
        JSON.stringify({ status: "old_stale_data", work_item_id: "OLD-WI" }),
        "utf-8"
      )
      await writeFile(
        join(specDir, "verification_report.md"),
        "# Old Stale Report\nThis should be replaced.",
        "utf-8"
      )

      const tasksContent = `# Tasks

## TASK-1 Fresh execution

- **verification_commands**:
  - unit: \`echo fresh\`
- **refs**: [REQ-1, CP-1]
`
      const report = await generateVerificationReport(workItemId, specDir, tasksContent)

      // New report should have fresh data
      expect(report.work_item_id).toBe(workItemId)
      expect(report.status).toBe("completed")

      // Verify the files on disk are the new ones
      const jsonContent = await readFile(join(specDir, "verification_report.json"), "utf-8")
      const parsed = JSON.parse(jsonContent)
      expect(parsed.work_item_id).toBe(workItemId)
      expect(parsed.status).toBe("completed")
      expect(parsed.work_item_id).not.toBe("OLD-WI")
    })
  })

  // ============================================================
  // Full pipeline: generateVerificationReport → checkVerificationGate
  // ============================================================

  describe("full pipeline: verifier generates report → gate reads and validates", () => {
    it("should pass gate when verifier produces a complete report with all types passing", async () => {
      const tasksContent = `# Tasks

## TASK-1 Full pipeline test

- **verification_commands**:
  - unit: \`echo unit_ok\`
  - integration: \`echo integration_ok\`
- **refs**: [REQ-1, CP-1]
`
      // Write tasks.md so the gate can read it
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      // Run the verifier
      await generateVerificationReport(workItemId, specDir, tasksContent)

      // Run the gate — it should read the report and pass
      const gateResult = await checkVerificationGate(workItemId, baseDir)

      expect(gateResult.status).toBe("pass")
      expect(gateResult.details).toBeDefined()
      const typeResults = (gateResult.details as any).type_results
      expect(typeResults.unit).toBe("passed")
      expect(typeResults.integration).toBe("passed")
    })

    it("should fail gate when verifier records a failed command", async () => {
      const tasksContent = `# Tasks

## TASK-1 Pipeline with failure

- **verification_commands**:
  - unit: \`echo unit_ok\`
  - integration: \`exit 1\`
- **refs**: [REQ-1, CP-1]
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      // Run the verifier (it will record the failure but continue)
      await generateVerificationReport(workItemId, specDir, tasksContent)

      // Run the gate — it should detect the failed integration type
      const gateResult = await checkVerificationGate(workItemId, baseDir)

      expect(gateResult.status).toBe("fail")
      const typeResults = (gateResult.details as any).type_results
      expect(typeResults.unit).toBe("passed")
      expect(typeResults.integration).toBe("failed")
    })
  })
})
