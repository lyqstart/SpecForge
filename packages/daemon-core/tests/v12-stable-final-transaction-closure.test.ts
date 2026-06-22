import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runChangedFilesAudit } from "../src/tools/lib/changed-files-audit";
import { appendWriteGuardLog, getFactualChangedFiles, summarizeWriteGuardLog } from "../src/tools/lib/write-guard-log";
import { parseChangedFilesAuditPass } from "../src/tools/lib/write-guard-runtime-v12";

function makeWorkItemDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sf-stable-final-transaction-"));
  const wiDir = path.join(root, ".specforge", "work-items", "WI-0001");
  fs.mkdirSync(wiDir, { recursive: true });
  return wiDir;
}

describe("v1.2 stable final transaction closure", () => {
  it("turns blocked write_guard_log entries into audit failure facts", () => {
    const wiDir = makeWorkItemDir();

    appendWriteGuardLog(wiDir, {
      timestamp: new Date().toISOString(),
      path: "src/todos/stable-allowed.md",
      operation: "create",
      actor: "agent",
      allowed: true,
      violations: [],
      tool: "write",
      command: "tool:write",
    });

    appendWriteGuardLog(wiDir, {
      timestamp: new Date().toISOString(),
      path: "src/todos/stable-out-of-scope.md",
      operation: "create",
      actor: "agent",
      allowed: false,
      violations: ["target_not_in_allowed_write_files"],
      tool: "write",
      command: "tool:write",
    });

    const summary = summarizeWriteGuardLog(wiDir);
    expect(summary.totalEntries).toBe(2);
    expect(summary.allowedWrites).toHaveLength(1);
    expect(summary.blockedWrites).toHaveLength(1);

    const factualChangedFiles = getFactualChangedFiles(wiDir);
    expect(factualChangedFiles).toEqual([
      { path: "src/todos/stable-allowed.md", operation: "create" },
    ]);

    const audit = runChangedFilesAudit(
      factualChangedFiles,
      [{ path: "src/todos/stable-allowed.md", operation: "create" }],
      "agent",
    );

    const blockedWriteViolations = summary.blockedWrites.map((entry) =>
      `BLOCKED_WRITE_ATTEMPT: [${entry.operation}] ${entry.path} via ${entry.tool ?? "unknown"}`,
    );
    const finalPassed = audit.passed && blockedWriteViolations.length === 0;
    const finalOutOfScope = audit.out_of_scope + blockedWriteViolations.length;

    expect(audit.passed).toBe(true);
    expect(blockedWriteViolations).toHaveLength(1);
    expect(finalPassed).toBe(false);
    expect(finalOutOfScope).toBe(1);
  });

  it("blocks implementation_done/close semantics when changed_files_audit records blocked writes", () => {
    const auditText = [
      "# Changed Files Audit",
      "",
      "## Result: FAIL",
      "",
      "- Out of scope: 1",
      "- Violations: 1",
      "- Blocked write attempts: 1",
      "",
      "## Violations",
      "",
      "- BLOCKED_WRITE_ATTEMPT: [create] src/todos/stable-out-of-scope.md via write violations=target_not_in_allowed_write_files",
      "",
    ].join("\n");

    const result = parseChangedFilesAuditPass(auditText);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/changed_files_audit result is FAIL/i);
  });

  it("keeps source-level transaction links present for native block -> log -> audit -> close", () => {
    const pluginSource = fs.readFileSync(
      path.resolve(__dirname, "../../../setup/userlevel-opencode/plugins/sf_specforge.ts"),
      "utf-8",
    );
    const auditHandlerSource = fs.readFileSync(
      path.resolve(__dirname, "../src/tools/handlers/sf-changed-files-audit.ts"),
      "utf-8",
    );
    const runtimeGuardSource = fs.readFileSync(
      path.resolve(__dirname, "../src/tools/lib/write-guard-runtime-v12.ts"),
      "utf-8",
    );

    expect(pluginSource).toContain("appendNativeBlockedWriteGuardLog");
    expect(pluginSource).toContain("write_guard_log.jsonl");
    expect(pluginSource).toContain("allowed: false");
    expect(pluginSource).toContain("target_not_in_allowed_write_files");

    expect(auditHandlerSource).toContain("summarizeWriteGuardLog");
    expect(auditHandlerSource).toContain("blocked_write_attempts");
    expect(auditHandlerSource).toContain("blockedWrites.length");
    expect(auditHandlerSource).toContain("finalPassed");

    expect(runtimeGuardSource).toContain("parseChangedFilesAuditPass");
    expect(runtimeGuardSource).toContain("Blocked write attempts");
  });
});
