/**
 * sf-v11-close-gate — v1.1 Close Gate lifecycle handler
 *
 * Orchestrates the full WI closure lifecycle:
 * 1. Validate close preconditions (runCloseGate)
 * 2. Run changed_files_audit
 * 3. Enforce Write Guard freeze
 * 4. Revoke code_permission
 * 5. Advance state: verification_done → closed (seal transition)
 * 6. Write close_gate evidence file
 *
 * Only the `close_gate` actor may execute this handler.
 * Agent cannot directly invoke this — it must go through the daemon tool proxy.
 */
import { registerHandler } from '../ToolDispatcher.js';
import { runCloseGate, type CloseGateResult } from '../lib/close-gate.js';
import { runChangedFilesAudit, type ChangedFilesAuditResult } from '../lib/changed-files-audit.js';
import { revokeCodePermission, checkCodePermission } from '../lib/code-permission-service-v11.js';
import { getFactualChangedFiles, summarizeWriteGuardLog } from '../lib/write-guard-log.js';
import { loadBaseline, computeFilesystemDiff, type FilesystemDiffResult } from '../lib/filesystem-diff.js';
import { guardHardStop } from '../lib/hard-stop-latch.js';
import { validateTriggerResultJson, validateCandidateManifestJson, validateEvidenceManifestJson } from '../lib/artifact-schema-validation.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CloseGateHandlerResult {
  success: boolean;
  work_item_id: string;
  close_gate: CloseGateResult | null;
  changed_files_audit: ChangedFilesAuditResult | null;
  filesystem_diff: FilesystemDiffResult | null;
  code_permission_revoked: boolean;
  state_advanced: boolean;
  error?: string;
  evidence_path?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

registerHandler('sf_close_gate', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const notApplicable = (args['not_applicable'] as string[] | undefined) ?? [];

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  const result: CloseGateHandlerResult = {
    success: false,
    work_item_id: workItemId,
    close_gate: null,
    changed_files_audit: null,
    filesystem_diff: null,
    code_permission_revoked: false,
    state_advanced: false,
  };

  // ── v1.1 Hard Stop Guard ──────────────────────────────────────────────────
  const hardStopGuard = guardHardStop(projectRoot, workItemId, 'sf_close_gate');
  if (!hardStopGuard.allowed) {
    return {
      ...result,
      error: hardStopGuard.error,
      hard_stop: true,
      hard_stop_record: hardStopGuard.hard_stop_record,
    } as any;
  }

  try {
    // -----------------------------------------------------------------------
    // Step 0: Read work_item.json for current state
    // -----------------------------------------------------------------------
    const workItemJsonPath = path.join(workItemDir, 'work_item.json');
    let workItem: Record<string, unknown>;
    try {
      const raw = await fs.readFile(workItemJsonPath, 'utf-8');
      workItem = JSON.parse(raw);
    } catch {
      return { ...result, error: `work_item.json not found at ${workItemJsonPath}` };
    }

    const currentState = workItem['status'] as string;
    if (currentState !== 'verification_done') {
      return {
        ...result,
        error: `Close gate requires state 'verification_done', current: '${currentState}'`,
      };
    }

    // -----------------------------------------------------------------------
    // Step 0b: v1.1 Validate JSON artifacts (trigger_result, candidate_manifest, evidence_manifest)
    // These must exist AND be valid JSON with correct schema.
    // -----------------------------------------------------------------------
    const triggerResultPath = path.join(workItemDir, 'trigger_result.json');
    try {
      const trContent = await fs.readFile(triggerResultPath, 'utf-8');
      const trValidation = validateTriggerResultJson(trContent, workItemId);
      if (!trValidation.valid) {
        return {
          ...result,
          error: `trigger_result.json schema validation failed: ${trValidation.errors.join('; ')}`,
        };
      }
    } catch {
      return { ...result, error: 'trigger_result.json not found — required for close_gate' };
    }

    const candidateManifestPath = path.join(workItemDir, 'candidate_manifest.json');
    let candidateManifest: any;
    try {
      const cmContent = await fs.readFile(candidateManifestPath, 'utf-8');
      const cmValidation = validateCandidateManifestJson(cmContent, workItemId, workItem['workflow_path'] as string);
      if (!cmValidation.valid) {
        return {
          ...result,
          error: `candidate_manifest.json schema validation failed: ${cmValidation.errors.join('; ')}`,
        };
      }
      candidateManifest = JSON.parse(cmContent);
    } catch (err: any) {
      if (err.message?.includes('schema validation')) throw err;
      return { ...result, error: 'candidate_manifest.json not found — required for close_gate' };
    }

    // code_only_fast_path: entries must be []
    if (workItem['workflow_path'] === 'code_only_fast_path') {
      if (!Array.isArray(candidateManifest.entries) || candidateManifest.entries.length !== 0) {
        return {
          ...result,
          error: 'code_only_fast_path requires candidate_manifest.entries = []',
        };
      }
    }

    const evidenceManifestPath = path.join(workItemDir, 'evidence', 'evidence_manifest.json');
    let evidenceManifestValid = false;
    try {
      const emContent = await fs.readFile(evidenceManifestPath, 'utf-8');
      const emValidation = validateEvidenceManifestJson(emContent, workItemId);
      if (!emValidation.valid) {
        // Evidence manifest exists but is invalid — fail at close_gate checks (Step 3)
        // We don't return early here so the gate report can be written for diagnostics
      } else {
        evidenceManifestValid = true;
      }
    } catch (err: any) {
      // Evidence manifest missing — runCloseGate will catch this
    }

    // Verify changed_files_audit evidence exists or will be generated in Step 2
    // Note: The handler generates audit in Step 2 if missing, so we do not reject here.

    // Verify merge_report exists and is appropriate
    const mergePath = path.join(workItemDir, 'merge_report.md');
    try {
      const mr = await fs.readFile(mergePath, 'utf-8');
      if (workItem['workflow_path'] === 'code_only_fast_path') {
        if (!mr.toLowerCase().includes('not_applicable')) {
          return {
            ...result,
            error: 'code_only_fast_path requires merge_report.status = not_applicable',
          };
        }
      }
    } catch {
      return { ...result, error: 'merge_report.md not found — required for close_gate' };
    }

    // Verify code_permission was properly handled
    // For code_only_fast_path: code_change_allowed should have been enabled then revoked
    // Check that allowed_write_files was set at some point
    const wiPermState = workItem['code_change_allowed'];
    const allowedFiles = workItem['allowed_write_files'] as any[];
    const permSnapshot = workItem['allowed_write_files_snapshot'] as any[] | undefined;
    const hadPermission = wiPermState === true || (permSnapshot && permSnapshot.length > 0) ||
      (allowedFiles && allowedFiles.length > 0) ||
      workItem['permission_enabled_at'] !== undefined ||
      workItem['code_permission_released'] === true;

    // -----------------------------------------------------------------------
    // Step 1: Revoke code_permission FIRST (§12.4 — must revoke before close)
    // Save snapshot of allowed_write_files BEFORE revoking for audit comparison
    // Also ensure allowed_write_files is cleared regardless of code_change_allowed state
    // -----------------------------------------------------------------------
    const permState = await checkCodePermission(workItemDir);
    const allowedWriteFilesSnapshot = permState.allowed_write_files;
    if (permState.code_change_allowed || permState.allowed_write_files.length > 0) {
      await revokeCodePermission(workItemDir);
    }
    result.code_permission_revoked = true;

    // -----------------------------------------------------------------------
    // Step 2: Run changed_files_audit
    // -----------------------------------------------------------------------
    const changedFilesPath = path.join(workItemDir, 'changed_files_audit.md');
    let auditAlreadyExists = false;
    try {
      await fs.access(changedFilesPath);
      auditAlreadyExists = true;
    } catch {
      // Will generate audit
    }

    if (!auditAlreadyExists) {
      // Read work_item.json for actual_changed_files
      const updatedRaw = await fs.readFile(workItemJsonPath, 'utf-8');
      const updatedWi = JSON.parse(updatedRaw);

      // FACTUAL SOURCE PRIORITY:
      // 1. Write Guard log (append-only, written by HTTPServer on every check)
      // 2. work_item.actual_changed_files (caller-provided fallback)
      const factualFiles = getFactualChangedFiles(workItemDir);
      const writeGuardSummary = summarizeWriteGuardLog(workItemDir);

      let changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;
      let auditDataSource: string;

      if (factualFiles.length > 0) {
        // Use Write Guard log as factual source
        changedFiles = factualFiles;
        auditDataSource = `write_guard_log.jsonl (${writeGuardSummary.totalEntries} entries, ${factualFiles.length} allowed writes)`;
      } else {
        // Fallback to caller-provided data
        changedFiles = (updatedWi['actual_changed_files'] as typeof changedFiles) ?? [];
        auditDataSource = changedFiles.length > 0
          ? 'work_item.actual_changed_files (caller-provided fallback — no write_guard_log)'
          : 'none (empty — weak audit, no write_guard_log)';
      }

      // Use the pre-revoke snapshot for comparison (what WAS allowed during implementation)
      // Priority: allowed_write_files_snapshot (explicitly saved) > pre-revoke snapshot
      const allowedWriteFilesForAudit: Array<{ path: string; operation: string }> =
        (updatedWi['allowed_write_files_snapshot'] as Array<{ path: string; operation: string }>) ??
        allowedWriteFilesSnapshot.map(f => ({ path: f.path, operation: f.operation }));

      const auditResult = runChangedFilesAudit(changedFiles, allowedWriteFilesForAudit, 'agent');
      result.changed_files_audit = auditResult;

      // Include Write Guard violations in audit metadata
      const auditMd = generateChangedFilesAuditMd(
        workItemId,
        auditResult,
        auditDataSource,
        writeGuardSummary.blockedWrites.length > 0
          ? writeGuardSummary.blockedWrites.map(b => `${b.path} (${b.violations.join('; ')})`)
          : undefined,
      );
      await fs.writeFile(changedFilesPath, auditMd, 'utf-8');
    } else {
      // Audit file already exists — read and validate
      result.changed_files_audit = { passed: true } as ChangedFilesAuditResult;
    }

    // -----------------------------------------------------------------------
    // Step 2b: Filesystem diff (secondary factual source)
    // Compares baseline snapshot (taken at code_permission release) with current state.
    // Detects changes not tracked by Write Guard (direct filesystem writes).
    // -----------------------------------------------------------------------
    const baseline = loadBaseline(workItemDir);
    if (baseline) {
      const writeGuardAllowed = getFactualChangedFiles(workItemDir).map(f => f.path);
      const fsDiff = computeFilesystemDiff(baseline, projectRoot, writeGuardAllowed);
      result.filesystem_diff = fsDiff;

      // If there are untracked changes, append to audit
      if (fsDiff.untracked_changes.length > 0) {
        const untrackedNote = `\n## Filesystem Diff — Untracked Changes\n\n` +
          `Detected ${fsDiff.untracked_changes.length} file(s) changed outside Write Guard:\n\n` +
          fsDiff.untracked_changes.map(f => `- ${f}`).join('\n') + '\n';
        await fs.appendFile(
          path.join(workItemDir, 'changed_files_audit.md'),
          untrackedNote,
          'utf-8',
        );
      }
    }

    // -----------------------------------------------------------------------
    // Step 3: Run close gate checks
    // -----------------------------------------------------------------------
    const closeGateResult = await runCloseGate({
      workItemId,
      workItemDir,
      projectRoot,
    });
    result.close_gate = closeGateResult;

    if (!closeGateResult.allChecksPassed) {
      // Write close_gate report even on failure (for diagnostics)
      const gatesDir = path.join(workItemDir, 'gates');
      await fs.mkdir(gatesDir, { recursive: true });
      await fs.writeFile(
        path.join(gatesDir, 'close_gate.json'),
        JSON.stringify(closeGateResult.report, null, 2) + '\n',
        'utf-8',
      );

      const failedChecks = closeGateResult.report.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.check_id}: ${c.description}`)
        .join('; ');

      return {
        ...result,
        error: `Close gate failed: ${failedChecks}`,
        evidence_path: path.join(gatesDir, 'close_gate.json'),
      };
    }

    // -----------------------------------------------------------------------
    // Step 4: Write close gate evidence files
    // -----------------------------------------------------------------------
    const gatesDir = path.join(workItemDir, 'gates');
    await fs.mkdir(gatesDir, { recursive: true });
    await fs.writeFile(
      path.join(gatesDir, 'close_gate.json'),
      JSON.stringify(closeGateResult.report, null, 2) + '\n',
      'utf-8',
    );

    // Also write close_gate.md (for evidence requirements)
    const closeGateMd = generateCloseGateEvidenceMd(workItemId, closeGateResult);
    await fs.writeFile(path.join(workItemDir, 'close_gate.md'), closeGateMd, 'utf-8');
    result.evidence_path = path.join(workItemDir, 'close_gate.md');

    // -----------------------------------------------------------------------
    // Step 5: Advance state to closed
    // -----------------------------------------------------------------------
    // Re-read work_item.json and update status
    const finalRaw = await fs.readFile(workItemJsonPath, 'utf-8');
    const finalWi = JSON.parse(finalRaw);
    finalWi['status'] = 'closed';
    finalWi['closed_at'] = new Date().toISOString();
    finalWi['updated_at'] = new Date().toISOString();
    await fs.writeFile(workItemJsonPath, JSON.stringify(finalWi, null, 2) + '\n', 'utf-8');
    result.state_advanced = true;

    // -----------------------------------------------------------------------
    // Step 6: Success
    // -----------------------------------------------------------------------
    result.success = true;
    return result;
  } catch (err: any) {
    return { ...result, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateChangedFilesAuditMd(
  workItemId: string,
  audit: ChangedFilesAuditResult,
  dataSource?: string,
  writeGuardViolations?: string[],
): string {
  const lines: string[] = [
    `# Changed Files Audit`,
    ``,
    `- Work Item: ${workItemId}`,
    `- Timestamp: ${new Date().toISOString()}`,
    `- Status: ${audit.passed ? 'PASSED' : 'FAILED'}`,
    `- Data Source: ${dataSource ?? 'pre-existing audit file'}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Total files | ${audit.total_files} |`,
    `| In scope | ${audit.in_scope} |`,
    `| Out of scope | ${audit.out_of_scope} |`,
    `| Spec writes | ${audit.spec_writes} |`,
    `| Side effects | ${audit.side_effects} |`,
    ``,
  ];

  if (writeGuardViolations && writeGuardViolations.length > 0) {
    lines.push(`## Write Guard Violations (from write_guard_log.jsonl)`, ``);
    for (const v of writeGuardViolations) {
      lines.push(`- ${v}`);
    }
    lines.push(``);
  }

  if (audit.violations.length > 0) {
    lines.push(`## Violations`, ``);
    for (const v of audit.violations) {
      lines.push(`- ${v}`);
    }
    lines.push(``);
  }

  if (audit.entries.length > 0) {
    lines.push(`## File Entries`, ``);
    lines.push(`| Path | Operation | In Scope | Spec Write | Side Effect |`);
    lines.push(`|------|-----------|----------|------------|-------------|`);
    for (const e of audit.entries) {
      lines.push(
        `| ${e.path} | ${e.operation} | ${e.in_allowed_write_files ? '✓' : '✗'} | ${e.is_spec_write ? '✓' : '✗'} | ${e.is_side_effect ? '✓' : '✗'} |`,
      );
    }
    lines.push(``);
  }

  return lines.join('\n');
}

function generateCloseGateEvidenceMd(
  workItemId: string,
  closeGateResult: CloseGateResult,
): string {
  const report = closeGateResult.report;
  const lines: string[] = [
    `# Close Gate Evidence`,
    ``,
    `- Work Item: ${workItemId}`,
    `- Status: ${report.status}`,
    `- Runner: ${report.runner}`,
    `- Timestamp: ${report.finished_at}`,
    ``,
    `## Checks`,
    ``,
    `| Check ID | Description | Passed |`,
    `|----------|-------------|--------|`,
  ];

  for (const check of report.checks) {
    lines.push(`| ${check.check_id} | ${check.description} | ${check.passed ? '✓' : '✗'} |`);
  }

  lines.push(``);

  if (report.blocking_issues.length > 0) {
    lines.push(`## Blocking Issues`, ``);
    for (const issue of report.blocking_issues) {
      lines.push(`- ${issue}`);
    }
    lines.push(``);
  }

  if (report.warnings.length > 0) {
    lines.push(`## Warnings`, ``);
    for (const w of report.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}
