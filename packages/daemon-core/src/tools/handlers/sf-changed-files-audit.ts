/**
 * sf_changed_files_audit — v1.1 Changed Files Audit Tool Handler
 *
 * Performs audit of actual file changes vs allowed_write_files.
 * Called by sf-orchestrator after implementation phase to validate
 * that no unauthorized writes occurred.
 *
 * v1.1 Prerequisites (MUST check before running audit):
 * 1. work_item.json exists
 * 2. WI is NOT hard_stop blocked
 * 3. code_permission was previously enabled (code_change_allowed=true or permission_record exists)
 * 4. allowed_write_files is non-empty
 * 5. Actual changed files do not exceed allowed_write_files
 */
import { join } from 'node:path';
import * as fs from 'node:fs/promises';
import { registerHandler } from '../ToolDispatcher';
import { runChangedFilesAudit } from '../lib/changed-files-audit';
import { getFactualChangedFiles } from '../lib/write-guard-log';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';

registerHandler('sf_changed_files_audit', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  const command = args['command'] as string | undefined;
  const expectedWriteFiles = args['expected_write_files'] as string[] | undefined;
  const actualChangedFiles = args['actual_changed_files'] as string[] | undefined;

  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return { success: false, error: idError };
  }

  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemDir = join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);

  // ── v1.1 Hard Stop Guard ──────────────────────────────────────────────────
  const hardStopGuard = guardHardStop(projectRoot, workItemId, 'sf_changed_files_audit');
  if (!hardStopGuard.allowed) {
    return {
      success: false,
      error: hardStopGuard.error,
      hard_stop: true,
      hard_stop_record: hardStopGuard.hard_stop_record,
    };
  }

  // ── v1.1 Prerequisite: work_item.json must exist ──────────────────────────
  let wiJson: any;
  try {
    wiJson = JSON.parse(await fs.readFile(join(workItemDir, 'work_item.json'), 'utf-8'));
  } catch {
    setHardStop(projectRoot, workItemId, 'WORK_ITEM_JSON_NOT_FOUND', 'sf_changed_files_audit');
    return {
      success: false,
      error: 'WORK_ITEM_JSON_NOT_FOUND: work_item.json does not exist — cannot perform audit without it',
      hard_stop: true,
    };
  }

  // ── v1.1 Prerequisite: code_permission must have been enabled ─────────────
  // Check code_change_allowed OR permission_enabled_at (evidence of prior enable)
  const codePermWasEnabled = wiJson.code_change_allowed === true ||
    wiJson.permission_enabled_at !== undefined ||
    wiJson.code_permission_released === true;
  if (!codePermWasEnabled) {
    setHardStop(projectRoot, workItemId, 'CODE_PERMISSION_NOT_ENABLED', 'sf_changed_files_audit');
    return {
      success: false,
      error: 'CODE_PERMISSION_NOT_ENABLED: code_permission was never enabled for this WI. Cannot audit without prior permission grant.',
      hard_stop: true,
    };
  }

  // ── v1.1 Prerequisite: allowed_write_files must be non-empty ──────────────
  // Read allowed_write_files from work_item.json
  let allowedWriteFiles: Array<{ path: string; operation: string }> = [];
  if (Array.isArray(wiJson.allowed_write_files)) {
    allowedWriteFiles = wiJson.allowed_write_files.map((f: string | { path: string; operation?: string }) =>
      typeof f === 'string' ? { path: f, operation: 'modify' } : { path: f.path, operation: f.operation ?? 'modify' }
    );
  }

  // Also check allowed_write_files_snapshot (saved before revoke)
  if (allowedWriteFiles.length === 0 && Array.isArray(wiJson.allowed_write_files_snapshot)) {
    allowedWriteFiles = wiJson.allowed_write_files_snapshot.map((f: string | { path: string; operation?: string }) =>
      typeof f === 'string' ? { path: f, operation: 'modify' } : { path: f.path, operation: f.operation ?? 'modify' }
    );
  }

  if (allowedWriteFiles.length === 0) {
    setHardStop(projectRoot, workItemId, 'ALLOWED_WRITE_FILES_EMPTY', 'sf_changed_files_audit');
    return {
      success: false,
      error: 'ALLOWED_WRITE_FILES_EMPTY: allowed_write_files is empty — nothing was permitted to be written. Audit cannot proceed.',
      hard_stop: true,
    };
  }

  // Get actual changed files: prefer factual Write Guard log, then args, then empty
  let changedFiles: Array<{ path: string; operation: 'create' | 'modify' | 'delete' }>;

  if (actualChangedFiles && actualChangedFiles.length > 0) {
    changedFiles = actualChangedFiles.map(f => ({ path: f, operation: 'modify' as const }));
  } else {
    // Try to read from Write Guard log (factual source)
    const factual = getFactualChangedFiles(workItemDir);
    if (factual.length > 0) {
      changedFiles = factual.map(f => ({
        path: f.path,
        operation: (f.operation ?? 'modify') as 'create' | 'modify' | 'delete',
      }));
    } else {
      changedFiles = [];
    }
  }

  // Run the audit
  const auditResult = runChangedFilesAudit(changedFiles, allowedWriteFiles, 'agent');

  // Write audit report to WI directory
  const auditMd = [
    `# Changed Files Audit`,
    '',
    `Work Item: ${workItemId}`,
    `Command: ${command ?? 'N/A'}`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    `## Result: ${auditResult.passed ? 'PASS' : 'FAIL'}`,
    '',
    `- Total files: ${auditResult.total_files}`,
    `- In scope: ${auditResult.in_scope}`,
    `- Out of scope: ${auditResult.out_of_scope}`,
    `- Violations: ${auditResult.violations.length}`,
    '',
    ...(auditResult.violations.length > 0
      ? ['## Violations', '', ...auditResult.violations.map(v => `- ${v}`), '']
      : []),
    ...(auditResult.entries.length > 0
      ? ['## Entries', '', ...auditResult.entries.map(e => `- [${e.operation}] ${e.path} → ${e.in_allowed_write_files ? 'in_scope' : 'OUT_OF_SCOPE'}`), '']
      : ['## Entries', '', 'No file changes detected.', '']),
  ].join('\n');

  try {
    await fs.writeFile(join(workItemDir, 'changed_files_audit.md'), auditMd, 'utf-8');
  } catch {
    // Non-critical: audit result is returned even if file write fails
  }

  return {
    success: true,
    passed: auditResult.passed,
    total_files: auditResult.total_files,
    in_scope: auditResult.in_scope,
    out_of_scope: auditResult.out_of_scope,
    violations: auditResult.violations,
    side_effects: auditResult.side_effects,
    work_item_id: workItemId,
  };
});
