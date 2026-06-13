/**
 * sf-v11-close-gate — v1.1 Close Gate lifecycle handler
 *
 * Fix in this version:
 * - code_only_fast_path close_gate is allowed to close from real runtime states
 *   such as implementation_running / gates_running when all required evidence
 *   exists. Real OpenCode agents were otherwise stuck doing manual state jumps.
 * - Close remains strict on evidence: trigger_result, candidate_manifest,
 *   merge_report, verification_report, evidence_manifest, and changed_files_audit.
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
  closed_from_state?: string;
}

const CLOSE_ALLOWED_STATES = new Set([
  'implementation_running',
  'verification',
  'verification_done',
  'gates_running',
  'approval_required',
]);

registerHandler('sf_close_gate', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;

  if (!workItemId) return { success: false, error: 'work_item_id is required' };

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

  const hardStopGuard = guardHardStop(projectRoot, workItemId, 'sf_close_gate');
  if (!hardStopGuard.allowed) {
    return { ...result, error: hardStopGuard.error, hard_stop: true, hard_stop_record: hardStopGuard.hard_stop_record } as any;
  }

  try {
    const workItemJsonPath = path.join(workItemDir, 'work_item.json');
    let workItem: Record<string, any>;
    try {
      workItem = JSON.parse(await fs.readFile(workItemJsonPath, 'utf-8'));
    } catch {
      return { ...result, error: `work_item.json not found at ${workItemJsonPath}` };
    }

    const currentState = String(workItem.status ?? '');
    if (!CLOSE_ALLOWED_STATES.has(currentState)) {
      return { ...result, error: `Close gate requires one of ${Array.from(CLOSE_ALLOWED_STATES).join(', ')}, current: '${currentState}'` };
    }
    result.closed_from_state = currentState;

    // Required JSON artifacts.
    const triggerResultPath = path.join(workItemDir, 'trigger_result.json');
    try {
      const trContent = await fs.readFile(triggerResultPath, 'utf-8');
      const trValidation = validateTriggerResultJson(trContent, workItemId);
      if (!trValidation.valid) return { ...result, error: `trigger_result.json schema validation failed: ${trValidation.errors.join('; ')}` };
    } catch {
      return { ...result, error: 'trigger_result.json not found — required for close_gate' };
    }

    const candidateManifestPath = path.join(workItemDir, 'candidate_manifest.json');
    let candidateManifest: any;
    try {
      const cmContent = await fs.readFile(candidateManifestPath, 'utf-8');
      const cmValidation = validateCandidateManifestJson(cmContent, workItemId, workItem.workflow_path as string);
      if (!cmValidation.valid) return { ...result, error: `candidate_manifest.json schema validation failed: ${cmValidation.errors.join('; ')}` };
      candidateManifest = JSON.parse(cmContent);
    } catch (err: any) {
      if (String(err?.message ?? '').includes('schema validation')) throw err;
      return { ...result, error: 'candidate_manifest.json not found — required for close_gate' };
    }

    if (workItem.workflow_path === 'code_only_fast_path') {
      if (!Array.isArray(candidateManifest.entries) || candidateManifest.entries.length !== 0) {
        return { ...result, error: 'code_only_fast_path requires candidate_manifest.entries = []' };
      }
    }

    const mergePath = path.join(workItemDir, 'merge_report.md');
    try {
      const mergeReport = await fs.readFile(mergePath, 'utf-8');
      if (workItem.workflow_path === 'code_only_fast_path' && !mergeReport.toLowerCase().includes('not_applicable')) {
        return { ...result, error: 'code_only_fast_path requires merge_report.status = not_applicable' };
      }
    } catch {
      return { ...result, error: 'merge_report.md not found — required for close_gate' };
    }

    const verificationReportPath = path.join(workItemDir, 'verification_report.md');
    try {
      await fs.access(verificationReportPath);
    } catch {
      return { ...result, error: 'verification_report.md not found — required for close_gate' };
    }

    const evidenceManifestPath = path.join(workItemDir, 'evidence', 'evidence_manifest.json');
    try {
      const emContent = await fs.readFile(evidenceManifestPath, 'utf-8');
      const emValidation = validateEvidenceManifestJson(emContent, workItemId);
      if (!emValidation.valid) return { ...result, error: `evidence_manifest.json schema validation failed: ${emValidation.errors.join('; ')}` };
    } catch {
      return { ...result, error: 'evidence/evidence_manifest.json not found — required for close_gate' };
    }

    // Revoke code_permission before close, preserving the allowlist snapshot.
    const permState = await checkCodePermission(workItemDir);
    const allowedWriteFilesSnapshot = permState.allowed_write_files;
    if (permState.code_change_allowed || permState.allowed_write_files.length > 0) {
      await revokeCodePermission(workItemDir);
    }
    result.code_permission_revoked = true;

    // Generate changed_files_audit if missing.
    const changedFilesPath = path.join(workItemDir, 'changed_files_audit.md');
    let auditAlreadyExists = false;
    try {
      await fs.access(changedFilesPath);
      auditAlreadyExists = true;
    } catch {
      auditAlreadyExists = false;
    }

    if (!auditAlreadyExists) {
      const updatedWi = JSON.parse(await fs.readFile(workItemJsonPath, 'utf-8'));
      const factualFiles = getFactualChangedFiles(workItemDir);
      const writeGuardSummary = summarizeWriteGuardLog(workItemDir);
      let changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;
      let auditDataSource: string;

      if (factualFiles.length > 0) {
        changedFiles = factualFiles;
        auditDataSource = `write_guard_log.jsonl (${writeGuardSummary.totalEntries} entries, ${factualFiles.length} allowed writes)`;
      } else {
        changedFiles = (updatedWi.actual_changed_files as typeof changedFiles) ?? [];
        auditDataSource = changedFiles.length > 0 ? 'work_item.actual_changed_files' : 'none';
      }

      const allowedWriteFilesForAudit: Array<{ path: string; operation: string }> =
        (updatedWi.allowed_write_files_snapshot as Array<{ path: string; operation: string }>) ??
        allowedWriteFilesSnapshot.map((f) => ({ path: f.path, operation: f.operation }));

      const auditResult = runChangedFilesAudit(changedFiles, allowedWriteFilesForAudit, 'agent');
      result.changed_files_audit = auditResult;
      await fs.writeFile(changedFilesPath, generateChangedFilesAuditMd(workItemId, auditResult, auditDataSource), 'utf-8');
    } else {
      result.changed_files_audit = { passed: true } as ChangedFilesAuditResult;
    }

    const baseline = loadBaseline(workItemDir);
    if (baseline) {
      const writeGuardAllowed = getFactualChangedFiles(workItemDir).map((f) => f.path);
      result.filesystem_diff = computeFilesystemDiff(baseline, projectRoot, writeGuardAllowed);
    }

    const closeGateResult = await runCloseGate({ workItemId, workItemDir, projectRoot });
    result.close_gate = closeGateResult;

    const gatesDir = path.join(workItemDir, 'gates');
    await fs.mkdir(gatesDir, { recursive: true });
    await fs.writeFile(path.join(gatesDir, 'close_gate.json'), JSON.stringify(closeGateResult.report, null, 2) + '\n', 'utf-8');

    if (!closeGateResult.allChecksPassed) {
      const failedChecks = closeGateResult.report.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.check_id}: ${c.description}`)
        .join('; ');
      return { ...result, error: `Close gate failed: ${failedChecks}`, evidence_path: path.join(gatesDir, 'close_gate.json') };
    }

    await fs.writeFile(path.join(workItemDir, 'close_gate.md'), generateCloseGateEvidenceMd(workItemId, closeGateResult), 'utf-8');
    result.evidence_path = path.join(workItemDir, 'close_gate.md');

    const finalWi = JSON.parse(await fs.readFile(workItemJsonPath, 'utf-8'));
    finalWi.status = 'closed';
    finalWi.closed_at = new Date().toISOString();
    finalWi.updated_at = new Date().toISOString();
    await fs.writeFile(workItemJsonPath, JSON.stringify(finalWi, null, 2) + '\n', 'utf-8');

    result.state_advanced = true;
    result.success = true;
    return result;
  } catch (err: any) {
    return { ...result, error: err.message };
  }
});

function generateChangedFilesAuditMd(workItemId: string, audit: ChangedFilesAuditResult, dataSource?: string): string {
  const lines = [
    '# Changed Files Audit',
    '',
    `- Work Item: ${workItemId}`,
    `- Timestamp: ${new Date().toISOString()}`,
    `- Status: ${audit.passed ? 'PASSED' : 'FAILED'}`,
    `- Data Source: ${dataSource ?? 'pre-existing audit file'}`,
    '',
    '## Summary',
    '',
    `- Total files: ${audit.total_files}`,
    `- In scope: ${audit.in_scope}`,
    `- Out of scope: ${audit.out_of_scope}`,
    '',
  ];
  if (audit.violations.length > 0) {
    lines.push('## Violations', '', ...audit.violations.map((v) => `- ${v}`), '');
  }
  return lines.join('\n');
}

function generateCloseGateEvidenceMd(workItemId: string, closeGateResult: CloseGateResult): string {
  const report = closeGateResult.report;
  const lines: string[] = [
    '# Close Gate Evidence',
    '',
    `- Work Item: ${workItemId}`,
    `- Status: ${report.status}`,
    `- Runner: ${report.runner}`,
    `- Timestamp: ${report.finished_at}`,
    '',
    '## Checks',
    '',
    '| Check ID | Description | Passed |',
    '|----------|-------------|--------|',
  ];
  for (const check of report.checks) {
    lines.push(`| ${check.check_id} | ${check.description} | ${check.passed ? '✓' : '✗'} |`);
  }
  if (report.blocking_issues.length > 0) {
    lines.push('', '## Blocking Issues', '', ...report.blocking_issues.map((issue) => `- ${issue}`));
  }
  if (report.warnings.length > 0) {
    lines.push('', '## Warnings', '', ...report.warnings.map((w) => `- ${w}`));
  }
  return lines.join('\n');
}
