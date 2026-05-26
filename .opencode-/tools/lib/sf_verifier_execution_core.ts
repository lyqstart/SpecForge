/**
 * V3.7 sf-verifier Execution Core
 * 全量收集执行策略和结构化报告生成
 *
 * 模块边界说明：本模块实现 sf-verifier 的核心执行逻辑，
 * 包括 stale report 清理、命令收集、collect-all 执行、
 * 原子写入和 V3.6 兼容 Markdown 报告生成。
 *
 * Requirements: REQ-6 AC-1, REQ-6 AC-2, REQ-6 AC-3, REQ-6 AC-4,
 *              REQ-6 AC-5, REQ-6 AC-6, REQ-6 AC-7, REQ-6 AC-8, REQ-6 AC-9
 */

import { writeFile, rename, unlink } from "node:fs/promises"
import { join } from "node:path"
import { exec } from "node:child_process"
import { parseTaskVerification } from "./sf_markdown_verification_parser"
import { getTaskSections } from "./sf_doc_lint_core"
import { logErrorToFile } from "./utils"
import type {
  VerificationType,
  VerificationReport,
  VerificationCommandRecord,
  TypedCommandEntry,
} from "./sf_verification_types"

// ============================================================
// Types
// ============================================================

/**
 * A collected command ready for execution.
 * - typed commands include the `type` field
 * - legacy commands omit the `type` field
 */
export interface CollectedCommand {
  command: string
  type?: VerificationType
}

// ============================================================
// cleanupStaleReports
// ============================================================

/**
 * Clean up stale reports before execution.
 * Deletes existing verification_report.json and verification_report.md.
 * If a non-ENOENT error occurs, throws to stop execution.
 *
 * @param specDir - The spec directory containing the reports
 * @throws If deletion fails for reasons other than file-not-found
 */
export async function cleanupStaleReports(specDir: string): Promise<void> {
  try {
    const jsonPath = join(specDir, "verification_report.json")
    const mdPath = join(specDir, "verification_report.md")

    await removeIfExists(jsonPath)
    await removeIfExists(mdPath)
  } catch (err) {
    await logErrorToFile(specDir, "sf_verifier_execution_core", "cleanupStaleReports", err)
    throw err
  }
}

/**
 * Remove a file if it exists. Ignore ENOENT, throw on other errors.
 */
async function removeIfExists(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException
    if (e.code !== "ENOENT") {
      throw err
    }
  }
}

// ============================================================
// collectVerificationCommands
// ============================================================

/**
 * Collect all verification commands from tasks.md content.
 * - For typed format: returns commands with `type` field set
 * - For legacy format: returns commands without `type` field
 * - Completely skips `manual_verification_checks` entries
 *
 * @param tasksContent - The full content of tasks.md
 * @returns Array of collected commands ready for execution
 */
export function collectVerificationCommands(tasksContent: string): CollectedCommand[] {
  const commands: CollectedCommand[] = []
  const taskSections = getTaskSections(tasksContent)

  for (const section of taskSections) {
    const taskVerification = parseTaskVerification(section.content)

    if (taskVerification.format === "typed" && taskVerification.typedCommands) {
      // Typed format: extract commands with type field
      for (const [typeKey, entry] of Object.entries(taskVerification.typedCommands)) {
        const cmds = normalizeToArray(entry as TypedCommandEntry)
        for (const cmd of cmds) {
          commands.push({
            command: cmd,
            type: typeKey as VerificationType,
          })
        }
      }
    } else if (taskVerification.format === "legacy" && taskVerification.legacyCommands) {
      // Legacy format: extract commands without type field
      for (const cmd of taskVerification.legacyCommands) {
        commands.push({ command: cmd })
      }
    }
    // manual_verification_checks: completely skipped (not executed, not recorded)
  }

  return commands
}

/**
 * Normalize a TypedCommandEntry (string | string[]) to string[]
 */
function normalizeToArray(entry: TypedCommandEntry): string[] {
  if (Array.isArray(entry)) return entry
  return [entry]
}

// ============================================================
// executeCommand
// ============================================================

/**
 * Execute a single command and return the record.
 * Uses collect-all strategy: records failure but continues.
 *
 * - If command executes successfully (exit_code === 0): status = "passed"
 * - If command fails (exit_code !== 0): status = "failed"
 * - If command cannot be started (spawn error): status = "skipped", stderr explains reason
 *
 * @param cmd - The collected command to execute
 * @returns A VerificationCommandRecord with execution results
 */
export async function executeCommand(cmd: CollectedCommand): Promise<VerificationCommandRecord> {
  try {
    const record: VerificationCommandRecord = {
      command: cmd.command,
      status: "passed",
      exit_code: 0,
    }

    // Include type field for typed commands, omit for legacy
    if (cmd.type !== undefined) {
      record.type = cmd.type
    }

    try {
      const result = await execPromise(cmd.command)
      record.exit_code = result.exitCode
      record.stdout = result.stdout || undefined
      record.stderr = result.stderr || undefined

      if (result.exitCode !== 0) {
        record.status = "failed"
      }
    } catch (err: unknown) {
      // Command could not be started (e.g., command not found, permission denied)
      record.status = "skipped"
      record.exit_code = -1
      record.stderr = err instanceof Error ? err.message : String(err)
    }

    return record
  } catch (err) {
    await logErrorToFile(process.cwd(), "sf_verifier_execution_core", "executeCommand", err)
    throw err
  }
}

/**
 * Execute a shell command and return stdout, stderr, and exit code.
 * Resolves even on non-zero exit codes (collect-all strategy).
 * Rejects only when the command cannot be spawned at all.
 */
function execPromise(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = exec(command, { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        // Buffer overflow — treat as failed but still record
        resolve({
          stdout: stdout ?? "",
          stderr: (stderr ?? "") + "\n[output truncated: buffer overflow]",
          exitCode: 1,
        })
        return
      }

      if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        // Command not found — cannot start
        reject(new Error(`Command not found or cannot be started: ${command}`))
        return
      }

      if (error && error.killed) {
        // Timeout — treat as failed
        resolve({
          stdout: stdout ?? "",
          stderr: (stderr ?? "") + "\n[command timed out]",
          exitCode: 124,
        })
        return
      }

      // Normal completion (including non-zero exit codes)
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: error ? (error.code as number ?? 1) : 0,
      })
    })

    // Handle spawn errors (e.g., shell not available)
    child.on("error", (err) => {
      reject(err)
    })
  })
}

// ============================================================
// writeReportAtomically
// ============================================================

/**
 * Write report content atomically: write to temp file, then rename.
 * This ensures consumers only see complete files or no file at all.
 *
 * @param reportPath - The final path for the report file
 * @param content - The content to write
 */
export async function writeReportAtomically(
  reportPath: string,
  content: string
): Promise<void> {
  try {
    const tempPath = `${reportPath}.tmp.${Date.now()}`
    await writeFile(tempPath, content, "utf-8")
    await rename(tempPath, reportPath)
  } catch (err) {
    await logErrorToFile(process.cwd(), "sf_verifier_execution_core", "writeReportAtomically", err)
    throw err
  }
}

// ============================================================
// generateMarkdownReport
// ============================================================

/**
 * Generate V3.6-compatible markdown report from structured report.
 * This provides backward compatibility with existing tooling that
 * reads verification_report.md.
 *
 * @param report - The structured VerificationReport
 * @returns Markdown string for verification_report.md
 */
export function generateMarkdownReport(report: VerificationReport): string {
  const lines: string[] = []

  lines.push("# Verification Report")
  lines.push("")
  lines.push(`**Work Item:** ${report.work_item_id}`)
  lines.push(`**Status:** ${report.status}`)
  lines.push(`**Schema Version:** ${report.schema_version}`)
  lines.push("")

  // Section 1: Verification Command Results
  lines.push("## 验证命令结果")
  lines.push("")

  if (report.commands.length === 0) {
    lines.push("_No verification commands executed._")
  } else {
    for (const cmd of report.commands) {
      const statusIcon = cmd.status === "passed" ? "✅" : cmd.status === "failed" ? "❌" : "⏭️"
      const typeLabel = cmd.type ? ` [${cmd.type}]` : ""
      lines.push(`- ${statusIcon}${typeLabel} \`${cmd.command}\` — **${cmd.status}** (exit_code: ${cmd.exit_code})`)
    }
  }
  lines.push("")

  // Section 2: Summary statistics
  lines.push("## Summary")
  lines.push("")
  const passed = report.commands.filter((c) => c.status === "passed").length
  const failed = report.commands.filter((c) => c.status === "failed").length
  const skipped = report.commands.filter((c) => c.status === "skipped").length
  lines.push(`| Metric | Count |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Total | ${report.commands.length} |`)
  lines.push(`| Passed | ${passed} |`)
  lines.push(`| Failed | ${failed} |`)
  lines.push(`| Skipped | ${skipped} |`)
  lines.push("")

  // Section 3: Conclusion
  lines.push("## 最终结论")
  lines.push("")
  if (failed > 0) {
    lines.push("**Result: FAIL**")
    lines.push("")
    lines.push("Some verification commands failed. See details above.")
  } else if (skipped > 0 && passed === 0) {
    lines.push("**Result: BLOCKED**")
    lines.push("")
    lines.push("All commands were skipped. Verification could not be completed.")
  } else {
    lines.push("**Result: PASS**")
    lines.push("")
    lines.push("All verification commands passed successfully.")
  }
  lines.push("")

  return lines.join("\n")
}

// ============================================================
// generateVerificationReport
// ============================================================

/**
 * Generate the full verification report.
 * Orchestrates the complete flow:
 * 1. Cleanup stale reports
 * 2. Collect verification commands from tasks.md
 * 3. Execute all commands (collect-all strategy)
 * 4. Atomic write verification_report.json
 * 5. Generate and write verification_report.md (V3.6 compatible)
 *
 * Only sets status="completed" after atomic rename succeeds.
 *
 * @param workItemId - The work item identifier
 * @param specDir - The spec directory path
 * @param tasksContent - The full content of tasks.md
 * @returns The completed VerificationReport
 */
export async function generateVerificationReport(
  workItemId: string,
  specDir: string,
  tasksContent: string
): Promise<VerificationReport> {
  try {
    // Step 0: Cleanup stale reports
    await cleanupStaleReports(specDir)

    // Step 1: Collect verification commands
    const collectedCommands = collectVerificationCommands(tasksContent)

    // Step 2: Execute all commands (collect-all strategy)
    const commandRecords: VerificationCommandRecord[] = []
    for (const cmd of collectedCommands) {
      const record = await executeCommand(cmd)
      commandRecords.push(record)
    }

    // Step 3: Build report (status will be set to "completed" only after atomic write)
    const report: VerificationReport = {
      schema_version: "1.0",
      work_item_id: workItemId,
      status: "completed",
      commands: commandRecords,
    }

    // Step 4: Atomic write verification_report.json
    const jsonPath = join(specDir, "verification_report.json")
    await writeReportAtomically(jsonPath, JSON.stringify(report, null, 2))

    // Step 5: Generate and write verification_report.md (V3.6 compatible)
    const mdContent = generateMarkdownReport(report)
    const mdPath = join(specDir, "verification_report.md")
    await writeReportAtomically(mdPath, mdContent)

    return report
  } catch (err) {
    await logErrorToFile(specDir, "sf_verifier_execution_core", "generateVerificationReport", err)
    throw err
  }
}
