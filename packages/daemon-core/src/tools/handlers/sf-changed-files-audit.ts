/**
 * sf_changed_files_audit — v1.1 Changed Files Audit Tool Handler.
 *
 * Patch A:
 * - expected_write_files / actual_changed_files are compatibility inputs only.
 * - Prefer Runtime factual source: write_guard_log.jsonl.
 * - Fall back to work_item.actual_changed_files, then debug args.
 * - Persist Data Source in changed_files_audit.md.
 */

import { join } from 'node:path';
import * as fs from 'node:fs/promises';
import { registerHandler } from '../ToolDispatcher';
import { runChangedFilesAudit } from '../lib/changed-files-audit';
import { getFactualChangedFiles, summarizeWriteGuardLog } from '../lib/write-guard-log';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';

type ChangedFile = { path: string; operation: 'create' | 'modify' | 'delete' };
type AllowedFile = { path: string; operation: string };

function normalizeAllowedFiles(input: unknown): AllowedFile[] {
  if (!Array.isArray(input)) return [];
  return input.map((f: string | { path: string; operation?: string }) =>
    typeof f === 'string'
      ? { path: f, operation: 'modify' }
      : { path: f.path, operation: f.operation ?? 'modify' },
  );
}

function normalizeChangedFileArgs(input: unknown): ChangedFile[] {
  if (!Array.isArray(input)) return [];
  return input.map((f: string | { path: string; operation?: string }) =>
    typeof f === 'string'
      ? { path: f, operation: 'modify' }
      : { path: f.path, operation: (f.operation ?? 'modify') as ChangedFile['operation'] },
  );
}

registerHandler('sf_changed_files_audit', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  const command = args['command'] as string | undefined;
  const actualChangedFiles = args['actual_changed_files'];

  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return { success: false, error: idError };
  }

  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemDir = join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);

  const hardStopGuard = guardHardStop(projectRoot, workItemId, 'sf_changed_files_audit');
  if (!hardStopGuard.allowed) {
    return {
      success: false,
      error: hardStopGuard.error,
      hard_stop: true,
      hard_stop_record: hardStopGuard.hard_stop_record,
    };
  }

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

  const codePermWasEnabled =
    wiJson.code_change_allowed === true ||
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

  let allowedWriteFiles = normalizeAllowedFiles(wiJson.allowed_write_files);
  if (allowedWriteFiles.length === 0) {
    allowedWriteFiles = normalizeAllowedFiles(wiJson.allowed_write_files_snapshot);
  }

  if (allowedWriteFiles.length === 0) {
    setHardStop(projectRoot, workItemId, 'ALLOWED_WRITE_FILES_EMPTY', 'sf_changed_files_audit');
    return {
      success: false,
      error: 'ALLOWED_WRITE_FILES_EMPTY: allowed_write_files and allowed_write_files_snapshot are empty. Audit cannot proceed.',
      hard_stop: true,
    };
  }

  const writeGuardSummary = summarizeWriteGuardLog(workItemDir);
  const factualFiles = getFactualChangedFiles(workItemDir);
  let changedFiles: ChangedFile[];
  let dataSource: string;

  if (factualFiles.length > 0) {
    changedFiles = factualFiles.map((f) => ({
      path: f.path,
      operation: (f.operation ?? 'modify') as ChangedFile['operation'],
    }));
    dataSource = `write_guard_log.jsonl (${writeGuardSummary.totalEntries} entries, ${factualFiles.length} allowed writes)`;
  } else if (Array.isArray(wiJson.actual_changed_files) && wiJson.actual_changed_files.length > 0) {
    changedFiles = normalizeChangedFileArgs(wiJson.actual_changed_files);
    dataSource = 'work_item.actual_changed_files';
  } else if (Array.isArray(actualChangedFiles) && actualChangedFiles.length > 0) {
    changedFiles = normalizeChangedFileArgs(actualChangedFiles);
    dataSource = 'debug_hint.actual_changed_files (deprecated fallback; not a trusted Runtime source)';
  } else {
    changedFiles = [];
    dataSource = 'none';
  }

  const auditResult = runChangedFilesAudit(changedFiles, allowedWriteFiles, 'agent');

  const auditMd = [
    '# Changed Files Audit',
    '',
    `Work Item: ${workItemId}`,
    `Command: ${command ?? 'N/A'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Data Source: ${dataSource}`,
    '',
    `## Result: ${auditResult.passed ? 'PASS' : 'FAIL'}`,
    '',
    `- Total files: ${auditResult.total_files}`,
    `- In scope: ${auditResult.in_scope}`,
    `- Out of scope: ${auditResult.out_of_scope}`,
    `- Violations: ${auditResult.violations.length}`,
    '',
    ...(auditResult.violations.length > 0 ? ['## Violations', '', ...auditResult.violations.map((v) => `- ${v}`), ''] : []),
    ...(auditResult.entries.length > 0
      ? ['## Entries', '', ...auditResult.entries.map((e) => `- [${e.operation}] ${e.path} → ${e.in_allowed_write_files ? 'in_scope' : 'OUT_OF_SCOPE'}`), '']
      : ['## Entries', '', 'No file changes detected.', '']),
  ].join('\n');

  try {
    await fs.writeFile(join(workItemDir, 'changed_files_audit.md'), auditMd, 'utf-8');
  } catch {
    // Non-critical: audit result is returned even if file write fails.
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
    data_source: dataSource,
  };
});
