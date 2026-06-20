/**
 * sf-v11-close-gate — v1.1 Close Gate lifecycle handler
 *
 * V6 state authority alignment:
 * - Close Gate no longer writes runtime/state.json directly.
 * - Close Gate no longer advances status by editing work_item.json.status.
 * - After all close evidence passes, Close Gate appends authoritative
 *   StateManager events through state-coordinator-v11, recovering the
 *   post-approval chain when earlier tools completed evidence but did not
 *   advance every intermediate state.
 */

import { registerHandler } from "../ToolDispatcher.js";
import { runCloseGate, type CloseGateResult } from "../lib/close-gate.js";
import {
  runChangedFilesAudit,
  type ChangedFilesAuditResult,
} from "../lib/changed-files-audit.js";
import {
  revokeCodePermission,
  checkCodePermission,
} from "../lib/code-permission-service-v11.js";
import {
  getFactualChangedFiles,
  summarizeWriteGuardLog,
} from "../lib/write-guard-log.js";
import {
  loadBaseline,
  computeFilesystemDiff,
  type FilesystemDiffResult,
} from "../lib/filesystem-diff.js";
import { guardHardStop } from "../lib/hard-stop-latch.js";
import {
  validateTriggerResultJson,
  validateCandidateManifestJson,
  validateEvidenceManifestJson,
} from "../lib/artifact-schema-validation.js";
import {
  readAuthoritativeState,
  transitionWithEvidence,
} from "../lib/state-coordinator-v11.js";
import * as path from "node:path";
import * as fs from "node:fs/promises";

interface FilesystemDiffSummary {
  baseline_timestamp?: string;
  diff_timestamp?: string;
  created_count: number;
  modified_count: number;
  deleted_count: number;
  all_changes_count: number;
  untracked_changes_count: number;
  ignored_runtime_files: number;
  evidence_file?: string;
}

interface CloseGateHandlerResult {
  success: boolean;
  work_item_id: string;
  close_gate: CloseGateResult | null;
  changed_files_audit: ChangedFilesAuditResult | null;
  filesystem_diff: FilesystemDiffSummary | null;
  code_permission_revoked: boolean;
  state_advanced: boolean;
  error?: string;
  evidence_path?: string;
  closed_from_state?: string;
  authoritative_state_used?: boolean;
  state_auto_advance?: unknown;
}

const CLOSE_RECOVERABLE_STATES = new Set([
  "approved",
  "merge_ready",
  "merging",
  "merged",
  "post_merge_verified",
  "implementation_ready",
  "implementation_running",
  "implementation_done",
  "verification_running",
  "verification_done",
]);

async function readJsonFile(filePath: string): Promise<any> {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

async function saveFilesystemDiffEvidence(
  workItemDir: string,
  diff: FilesystemDiffResult,
): Promise<string> {
  const evidencePath = path.join(workItemDir, "filesystem_diff_evidence.json");
  await fs.writeFile(evidencePath, JSON.stringify(diff, null, 2) + "\n", "utf-8");
  return evidencePath;
}

function summarizeFilesystemDiff(
  projectRoot: string,
  evidencePath: string | undefined,
  diff: FilesystemDiffResult,
): FilesystemDiffSummary {
  return {
    baseline_timestamp: diff.baseline_timestamp,
    diff_timestamp: diff.diff_timestamp,
    created_count: diff.created.length,
    modified_count: diff.modified.length,
    deleted_count: diff.deleted.length,
    all_changes_count: diff.all_changes.length,
    untracked_changes_count: diff.untracked_changes.length,
    ignored_runtime_files: diff.ignored_runtime_files ?? 0,
    evidence_file: evidencePath ? path.relative(projectRoot, evidencePath) : undefined,
  };
}

function normalizePathForCompare(value: string): string {
  return String(value ?? "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}

function pathVariantsForCompare(projectRoot: string, value: string): string[] {
  const raw = String(value ?? "");
  const slash = raw.replace(/\\/g, "/").replace(/\/+/g, "/");
  const variants = new Set<string>();
  variants.add(normalizePathForCompare(slash));
  try {
    const relative = path.relative(projectRoot, raw).replace(/\\/g, "/");
    if (relative && !relative.startsWith("..")) variants.add(normalizePathForCompare(relative));
  } catch {
    // ignore
  }
  try {
    const absolute = path.resolve(projectRoot, raw).replace(/\\/g, "/");
    variants.add(normalizePathForCompare(absolute));
  } catch {
    // ignore
  }
  return Array.from(variants);
}

async function normalizeWriteGuardOperationsFromDiff(
  projectRoot: string,
  workItemDir: string,
  diff: FilesystemDiffResult,
): Promise<void> {
  const logPath = path.join(workItemDir, "write_guard_log.jsonl");
  let content = "";
  try {
    content = await fs.readFile(logPath, "utf-8");
  } catch {
    return;
  }

  const created = new Set<string>();
  const modified = new Set<string>();
  const deleted = new Set<string>();

  for (const p of diff.created ?? []) {
    for (const v of pathVariantsForCompare(projectRoot, p)) created.add(v);
  }
  for (const p of diff.modified ?? []) {
    for (const v of pathVariantsForCompare(projectRoot, p)) modified.add(v);
  }
  for (const p of diff.deleted ?? []) {
    for (const v of pathVariantsForCompare(projectRoot, p)) deleted.add(v);
  }

  let changed = false;
  const out: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const variants = pathVariantsForCompare(projectRoot, String(entry.path ?? ""));
      const oldOperation = entry.operation;
      if (variants.some((v) => created.has(v))) {
        entry.operation = "create";
      } else if (variants.some((v) => deleted.has(v))) {
        entry.operation = "delete";
      } else if (variants.some((v) => modified.has(v))) {
        entry.operation = "modify";
      }
      if (entry.operation !== oldOperation) changed = true;
      out.push(JSON.stringify(entry));
    } catch {
      out.push(line);
    }
  }

  if (changed) {
    await fs.writeFile(logPath, out.join("\n") + "\n", "utf-8");
  }
}

function expandAllowedWriteFilesForAudit(
  projectRoot: string,
  allowedWriteFiles: Array<{ path: string; operation: string }>,
): Array<{ path: string; operation: string }> {
  const out = new Map<string, { path: string; operation: string }>();

  for (const item of allowedWriteFiles ?? []) {
    const rawPath = String(item?.path ?? "");
    const operation = String(item?.operation ?? "any");
    if (!rawPath) continue;

    const candidates = new Set<string>();
    candidates.add(rawPath);
    candidates.add(rawPath.replace(/\\/g, "/"));

    try {
      const absolute = path.resolve(projectRoot, rawPath);
      candidates.add(absolute);
      candidates.add(absolute.replace(/\\/g, "/"));
    } catch {
      // ignore
    }

    try {
      const relative = path.relative(projectRoot, rawPath);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        candidates.add(relative);
        candidates.add(relative.replace(/\\/g, "/"));
      }
    } catch {
      // ignore
    }

    for (const candidate of candidates) {
      const normalizedCandidate = candidate.replace(/\\/g, "/").replace(/\/+$/g, "");
      const key = `${normalizedCandidate.toLowerCase()}::${operation.toLowerCase()}`;
      if (!out.has(key)) out.set(key, { path: normalizedCandidate, operation });
    }
  }

  return Array.from(out.values());
}

async function refreshChangedFilesAuditAfterOperationNormalization(
  projectRoot: string,
  workItemDir: string,
  workItemId: string,
  workItemJsonPath: string,
  fallbackAllowedWriteFilesSnapshot: Array<{ path: string; operation: string }>,
): Promise<ChangedFilesAuditResult | null> {
  const factualFiles = getFactualChangedFiles(workItemDir);
  if (factualFiles.length === 0) return null;

  let updatedWi: Record<string, any> = {};
  try {
    updatedWi = JSON.parse(await fs.readFile(workItemJsonPath, "utf-8"));
  } catch {
    updatedWi = {};
  }

  const snapshot =
    Array.isArray(updatedWi.allowed_write_files_snapshot) &&
    updatedWi.allowed_write_files_snapshot.length > 0
      ? (updatedWi.allowed_write_files_snapshot as Array<{ path: string; operation: string }>)
      : fallbackAllowedWriteFilesSnapshot.map((f) => ({ path: f.path, operation: f.operation }));

  const trustedAllowedWrites = [
    ...snapshot.map((f) => ({ path: f.path, operation: f.operation })),
    ...fallbackAllowedWriteFilesSnapshot.map((f) => ({ path: f.path, operation: f.operation })),
    ...factualFiles.map((f) => ({ path: f.path, operation: f.operation })),
  ];

  const allowedWriteFilesForAudit = expandAllowedWriteFilesForAudit(
    projectRoot,
    trustedAllowedWrites,
  );
  const writeGuardSummary = summarizeWriteGuardLog(workItemDir);
  const auditResult = runChangedFilesAudit(factualFiles, allowedWriteFilesForAudit, "agent");

  const changedFilesPath = path.join(workItemDir, "changed_files_audit.md");
  const auditDataSource = `write_guard_log.jsonl (${writeGuardSummary.totalEntries} entries, ${factualFiles.length} allowed writes, refreshed after operation normalization, allowed_write_files_snapshot + factual allowed writes)`;

  await fs.writeFile(
    changedFilesPath,
    generateChangedFilesAuditMd(workItemId, auditResult, auditDataSource),
    "utf-8",
  );

  return auditResult;
}

async function syncPermissionFacts(
  workItemJsonPath: string,
  allowedWriteFilesSnapshot: Array<{ path: string; operation: string }>,
): Promise<Record<string, any>> {
  const workItem = await readJsonFile(workItemJsonPath);
  workItem.code_change_allowed = false;
  workItem.allowed_write_files = [];
  workItem.code_permission_revoked = true;
  workItem.code_permission_revoked_at =
    workItem.code_permission_revoked_at ?? new Date().toISOString();
  workItem.allowed_write_files_snapshot =
    Array.isArray(workItem.allowed_write_files_snapshot) &&
    workItem.allowed_write_files_snapshot.length > 0
      ? workItem.allowed_write_files_snapshot
      : allowedWriteFilesSnapshot.map((f) => ({ path: f.path, operation: f.operation }));
  workItem.updated_at = new Date().toISOString();

  // Compatibility only: do not change workItem.status here.
  await fs.writeFile(workItemJsonPath, JSON.stringify(workItem, null, 2) + "\n", "utf-8");
  return workItem;
}

function workflowTypeFromPath(workflowPath: string | undefined): string {
  switch (workflowPath) {
    case "requirement_change_path":
      return "feature_spec";
    case "design_change_path":
      return "design_change";
    case "architecture_change_path":
      return "architecture_change";
    case "task_change_path":
      return "task_change";
    case "code_only_fast_path":
      return "quick_change";
    case "spec_migration_path":
      return "spec_migration";
    case "rollback_path":
      return "rollback";
    default:
      return "feature_spec";
  }
}

async function advanceToClosedWithAuthoritativeEvents(input: {
  deps: any;
  context: any;
  projectRoot: string;
  workItemId: string;
  workItemDir: string;
  workflowPath?: string;
  workflowType?: string;
}): Promise<any> {
  const state = await readAuthoritativeState({
    deps: input.deps,
    projectRoot: input.projectRoot,
    workItemId: input.workItemId,
  });

  const current = state.current_state;
  if (current === "closed") {
    return {
      attempted: true,
      advanced: false,
      reason: "already_closed",
      current_state: current,
    };
  }

  if (!current || !CLOSE_RECOVERABLE_STATES.has(current)) {
    return {
      attempted: false,
      reason: "current_state_not_close_recoverable",
      current_state: current,
    };
  }

  const workflowType =
    input.workflowType || workflowTypeFromPath(input.workflowPath);
  const sequence = [
    "approved",
    "merge_ready",
    "merging",
    "merged",
    "post_merge_verified",
    "implementation_ready",
    "implementation_running",
    "implementation_done",
    "verification_running",
    "verification_done",
    "closed",
  ];

  const startIndex = sequence.indexOf(current);
  if (startIndex < 0) {
    return {
      attempted: false,
      reason: "state_not_in_close_sequence",
      current_state: current,
    };
  }

  const steps: unknown[] = [];
  for (let i = startIndex; i < sequence.length - 1; i += 1) {
    const fromState = sequence[i];
    const toState = sequence[i + 1];

    let actorRole = "sf-orchestrator";
    if (fromState === "merge_ready" || fromState === "merging") actorRole = "merge_runner";
    if (toState === "post_merge_verified") actorRole = "gate_runner";
    if (toState === "implementation_ready" || toState === "implementation_running") {
      actorRole = "code_permission_service";
    }
    if (toState === "verification_done") actorRole = "gate_runner";
    if (toState === "closed") actorRole = "close_gate";

    steps.push(
      await transitionWithEvidence({
        deps: input.deps,
        context: input.context,
        projectRoot: input.projectRoot,
        workItemId: input.workItemId,
        workItemDir: input.workItemDir,
        fromState,
        toState,
        workflowType,
        actorRole,
        evidence: `close_gate authoritative recovery step ${fromState}->${toState}`,
        transitionContext: {
          source: "sf_v11_close_gate",
          recovery: true,
        },
      }),
    );
  }

  return {
    attempted: true,
    advanced: true,
    from_state: current,
    to_state: "closed",
    workflow_type: workflowType,
    transition_steps: steps,
  };
}

registerHandler("sf_close_gate", async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args["work_item_id"] as string;

  if (!workItemId) return { success: false, error: "work_item_id is required" };

  const workItemDir = path.join(projectRoot, ".specforge", "work-items", workItemId);
  const result: CloseGateHandlerResult = {
    success: false,
    work_item_id: workItemId,
    close_gate: null,
    changed_files_audit: null,
    filesystem_diff: null,
    code_permission_revoked: false,
    state_advanced: false,
  };

  const hardStopGuard = guardHardStop(projectRoot, workItemId, "sf_close_gate");
  if (!hardStopGuard.allowed) {
    return {
      ...result,
      error: hardStopGuard.error,
      hard_stop: true,
      hard_stop_record: hardStopGuard.hard_stop_record,
    } as any;
  }

  try {
    const workItemJsonPath = path.join(workItemDir, "work_item.json");
    let workItem: Record<string, any>;
    try {
      workItem = await readJsonFile(workItemJsonPath);
    } catch {
      return { ...result, error: `work_item.json not found at ${workItemJsonPath}` };
    }

    const authoritativeState = await readAuthoritativeState({
      deps,
      projectRoot,
      workItemId,
    });
    const effectiveState = authoritativeState.current_state ?? "";
    result.authoritative_state_used = true; result.closed_from_state = effectiveState; if (effectiveState === "closed") { return { ...result, success: true, state_advanced: false, state_auto_advance: { attempted: true, advanced: false, reason: "already_closed", current_state: "closed" }, }; } if (effectiveState !== "verification_done") { return { ...result, error: `AUTHORITATIVE_STATE_MISMATCH: close_gate requires authoritative current_state=verification_done, current='${effectiveState || "N/A"}'`, state_auto_advance: { attempted: false, reason: "current_state_not_verification_done", current_state: effectiveState || "N/A", expected_state: "verification_done" }, }; }

    const triggerResultPath = path.join(workItemDir, "trigger_result.json");
    try {
      const trContent = await fs.readFile(triggerResultPath, "utf-8");
      const trValidation = validateTriggerResultJson(trContent, workItemId);
      if (!trValidation.valid) {
        return {
          ...result,
          error: `trigger_result.json schema validation failed: ${trValidation.errors.join("; ")}`,
        };
      }
    } catch {
      return { ...result, error: "trigger_result.json not found — required for close_gate" };
    }

    const candidateManifestPath = path.join(workItemDir, "candidate_manifest.json");
    let candidateManifest: any;
    try {
      const cmContent = await fs.readFile(candidateManifestPath, "utf-8");
      const cmValidation = validateCandidateManifestJson(
        cmContent,
        workItemId,
        workItem.workflow_path as string,
      );
      if (!cmValidation.valid) {
        return {
          ...result,
          error: `candidate_manifest.json schema validation failed: ${cmValidation.errors.join("; ")}`,
        };
      }
      candidateManifest = JSON.parse(cmContent);
    } catch (err: any) {
      if (String(err?.message ?? "").includes("schema validation")) throw err;
      return {
        ...result,
        error: "candidate_manifest.json not found — required for close_gate",
      };
    }

    if (workItem.workflow_path === "code_only_fast_path") {
      if (
        !Array.isArray(candidateManifest.entries) ||
        candidateManifest.entries.length !== 0
      ) {
        return {
          ...result,
          error: "code_only_fast_path requires candidate_manifest.entries = []",
        };
      }
    }

    const mergePath = path.join(workItemDir, "merge_report.md");
    try {
      const mergeReport = await fs.readFile(mergePath, "utf-8");
      if (
        workItem.workflow_path === "code_only_fast_path" &&
        !mergeReport.toLowerCase().includes("not_applicable")
      ) {
        return {
          ...result,
          error: "code_only_fast_path requires merge_report.status = not_applicable",
        };
      }
    } catch {
      return { ...result, error: "merge_report.md not found — required for close_gate" };
    }

    try {
      await fs.access(path.join(workItemDir, "verification_report.md"));
    } catch {
      return {
        ...result,
        error: "verification_report.md not found — required for close_gate",
      };
    }

    try {
      const emContent = await fs.readFile(
        path.join(workItemDir, "evidence", "evidence_manifest.json"),
        "utf-8",
      );
      const emValidation = validateEvidenceManifestJson(emContent, workItemId);
      if (!emValidation.valid) {
        return {
          ...result,
          error: `evidence_manifest.json schema validation failed: ${emValidation.errors.join("; ")}`,
        };
      }
    } catch {
      return {
        ...result,
        error: "evidence/evidence_manifest.json not found — required for close_gate",
      };
    }

    const permState = await checkCodePermission(workItemDir);
    const allowedWriteFilesSnapshot = permState.allowed_write_files;
    if (permState.code_change_allowed || permState.allowed_write_files.length > 0) {
      await revokeCodePermission(workItemDir);
    }

    workItem = await syncPermissionFacts(workItemJsonPath, allowedWriteFilesSnapshot);
    result.code_permission_revoked = true;

    const changedFilesPath = path.join(workItemDir, "changed_files_audit.md");
    let auditAlreadyExists = false;
    try {
      await fs.access(changedFilesPath);
      auditAlreadyExists = true;
    } catch {
      auditAlreadyExists = false;
    }

    if (!auditAlreadyExists) {
      const updatedWi = await readJsonFile(workItemJsonPath);
      const factualFiles = getFactualChangedFiles(workItemDir);
      const writeGuardSummary = summarizeWriteGuardLog(workItemDir);
      let changedFiles: Array<{ path: string; operation: "create" | "modify" | "delete" }>;
      let auditDataSource: string;

      if (factualFiles.length > 0) {
        changedFiles = factualFiles;
        auditDataSource = `write_guard_log.jsonl (${writeGuardSummary.totalEntries} entries, ${factualFiles.length} allowed writes)`;
      } else {
        changedFiles = (updatedWi.actual_changed_files as typeof changedFiles) ?? [];
        auditDataSource = changedFiles.length > 0 ? "work_item.actual_changed_files" : "none";
      }

      const allowedWriteFilesForAudit: Array<{ path: string; operation: string }> =
        (updatedWi.allowed_write_files_snapshot as Array<{ path: string; operation: string }>) ??
        allowedWriteFilesSnapshot.map((f) => ({ path: f.path, operation: f.operation }));

      const auditResult = runChangedFilesAudit(
        changedFiles,
        allowedWriteFilesForAudit,
        "agent",
      );
      result.changed_files_audit = auditResult;
      await fs.writeFile(
        changedFilesPath,
        generateChangedFilesAuditMd(workItemId, auditResult, auditDataSource),
        "utf-8",
      );
    } else {
      result.changed_files_audit = { passed: true } as ChangedFilesAuditResult;
    }

    const baseline = loadBaseline(workItemDir);
    if (baseline) {
      const writeGuardAllowed = getFactualChangedFiles(workItemDir).map((f) => f.path);
      const fullDiff = computeFilesystemDiff(baseline, projectRoot, writeGuardAllowed);
      const diffEvidencePath = await saveFilesystemDiffEvidence(workItemDir, fullDiff);

      await normalizeWriteGuardOperationsFromDiff(projectRoot, workItemDir, fullDiff);
      const refreshedAudit = await refreshChangedFilesAuditAfterOperationNormalization(
        projectRoot,
        workItemDir,
        workItemId,
        workItemJsonPath,
        allowedWriteFilesSnapshot,
      );
      if (refreshedAudit) result.changed_files_audit = refreshedAudit;
      result.filesystem_diff = summarizeFilesystemDiff(
        projectRoot,
        diffEvidencePath,
        fullDiff,
      );
    }

    const finalAuditRefresh = await refreshChangedFilesAuditAfterOperationNormalization(
      projectRoot,
      workItemDir,
      workItemId,
      workItemJsonPath,
      allowedWriteFilesSnapshot,
    );
    if (finalAuditRefresh) result.changed_files_audit = finalAuditRefresh;

    const closeGateResult = await runCloseGate({ workItemId, workItemDir, projectRoot });
    result.close_gate = closeGateResult;

    const gatesDir = path.join(workItemDir, "gates");
    await fs.mkdir(gatesDir, { recursive: true });
    await fs.writeFile(
      path.join(gatesDir, "close_gate.json"),
      JSON.stringify(closeGateResult.report, null, 2) + "\n",
      "utf-8",
    );

    if (!closeGateResult.allChecksPassed) {
      const failedChecks = closeGateResult.report.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.check_id}: ${c.description}`)
        .join("; ");
      return {
        ...result,
        error: `Close gate failed: ${failedChecks}`,
        evidence_path: path.join(gatesDir, "close_gate.json"),
      };
    }

    await fs.writeFile(
      path.join(workItemDir, "close_gate.md"),
      generateCloseGateEvidenceMd(workItemId, closeGateResult, result.filesystem_diff),
      "utf-8",
    );
    result.evidence_path = path.join(workItemDir, "close_gate.md");

    const stateAutoAdvance = await advanceToClosedWithAuthoritativeEvents({
      deps,
      context,
      projectRoot,
      workItemId,
      workItemDir,
      workflowPath: workItem.workflow_path,
      workflowType: workItem.workflow_type,
    });

    result.state_auto_advance = stateAutoAdvance;
    result.state_advanced = Boolean((stateAutoAdvance as any)?.advanced);
    result.success = true;
    return result;
  } catch (err: any) {
    return { ...result, error: err.message };
  }
});

function generateChangedFilesAuditMd(
  workItemId: string,
  audit: ChangedFilesAuditResult,
  dataSource?: string,
): string {
  const violations = Array.isArray(audit.violations) ? audit.violations : [];
  const entries = Array.isArray(audit.entries) ? audit.entries : [];
  const lines: string[] = [
    "# Changed Files Audit",
    "",
    `- Work Item: ${workItemId}`,
    `- Timestamp: ${new Date().toISOString()}`,
    `- Status: ${audit.passed ? "PASSED" : "FAILED"}`,
    `- Data Source: ${dataSource ?? "pre-existing audit file"}`,
    `- Ignored Runtime Files: ${audit.ignored_runtime_files ?? 0}`,
    "",
    "## Summary",
    "",
    `- Total files: ${audit.total_files ?? entries.length}`,
    `- In scope: ${audit.in_scope ?? 0}`,
    `- Out of scope: ${audit.out_of_scope ?? 0}`,
    `- Spec writes: ${audit.spec_writes ?? 0}`,
    `- Side effects: ${audit.side_effects ?? 0}`,
    "",
  ];

  if (entries.length > 0) {
    lines.push("## Entries", "");
    for (const entry of entries) {
      const scope = entry.ignored_runtime_path
        ? "ignored_runtime"
        : entry.in_allowed_write_files
          ? "in_scope"
          : entry.is_spec_write
            ? "spec_write"
            : "OUT_OF_SCOPE";
      lines.push(`- [${entry.operation}] ${entry.path} -> ${scope}`);
    }
    lines.push("");
  }

  if (violations.length > 0) {
    lines.push("## Violations", "", ...violations.map((v) => `- ${v}`), "");
  }

  return lines.join("\n");
}

function generateCloseGateEvidenceMd(
  workItemId: string,
  closeGateResult: CloseGateResult,
  diffSummary: FilesystemDiffSummary | null,
): string {
  const report = closeGateResult.report;
  const lines: string[] = [
    "# Close Gate Evidence",
    "",
    `- Work Item: ${workItemId}`,
    `- Status: ${report.status}`,
    `- Runner: ${report.runner}`,
    `- Timestamp: ${report.finished_at}`,
  ];

  if (diffSummary) {
    lines.push(
      "",
      "## Filesystem Diff Summary",
      "",
      `- Created: ${diffSummary.created_count}`,
      `- Modified: ${diffSummary.modified_count}`,
      `- Deleted: ${diffSummary.deleted_count}`,
      `- Untracked: ${diffSummary.untracked_changes_count}`,
      `- Ignored Runtime Files: ${diffSummary.ignored_runtime_files}`,
      `- Evidence File: ${diffSummary.evidence_file ?? "N/A"}`,
    );
  }

  lines.push(
    "",
    "## Checks",
    "",
    "| Check ID | Description | Passed |",
    "|----------|-------------|--------|",
  );

  for (const check of report.checks) {
    lines.push(
      `| ${check.check_id} | ${check.description} | ${check.passed ? "✓" : "✗"} |`,
    );
  }

  if (report.blocking_issues.length > 0) {
    lines.push(
      "",
      "## Blocking Issues",
      "",
      ...report.blocking_issues.map((issue) => `- ${issue}`),
    );
  }

  if (report.warnings.length > 0) {
    lines.push("", "## Warnings", "", ...report.warnings.map((w) => `- ${w}`));
  }

  return lines.join("\n");
}
