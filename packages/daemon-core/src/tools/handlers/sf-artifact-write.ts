/**
 * sf-artifact-write.ts — v1.1 Controlled Artifact Writer
 *
 * This is the ONLY allowed path for writing WI artifacts.
 *
 * Fix in this version:
 * - Preserves object/array JSON content by JSON.stringify instead of String(...).
 * - Infers canonical v1.1 artifacts from work_log content, not run_id alone.
 * - Prevents task-planner run_id from making candidate_manifest overwrite tasks.md.
 * - For code_only_fast_path, creates controlled companion artifacts that close_gate requires.
 */
import path from 'path';
import { registerHandler } from '../ToolDispatcher';
import { writeArtifact } from '../lib/sf_artifact_write_core';
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';
import { validateArtifactJson } from '../lib/artifact-schema-validation';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import * as fs from 'node:fs';

const V11_WI_ARTIFACT_FILES = new Set([
  'work_item.json',
  'intake.md',
  'change_classification.md',
  'impact_analysis.md',
  'trigger_result.json',
  'tasks.md',
  'trace_delta.md',
  'candidate_manifest.json',
  'merge_report.md',
  'verification_report.md',
  'evidence_manifest.json',
]);

const V11_FILENAME_MAP: Record<string, string> = {
  'work_item.json': 'work_item',
  'intake.md': 'intake',
  'change_classification.md': 'change_classification',
  'impact_analysis.md': 'impact_analysis',
  'trigger_result.json': 'trigger_result',
  'tasks.md': 'tasks',
  'trace_delta.md': 'trace_delta',
  'candidate_manifest.json': 'candidate_manifest',
  'merge_report.md': 'merge_report',
  'verification_report.md': 'verification_report',
  'evidence_manifest.json': 'evidence_manifest',
};

const V11_FILETYPE_TO_FILENAME = new Map<string, string>(
  Object.entries(V11_FILENAME_MAP).map(([filename, fileType]) => [fileType, filename]),
);

function normalizeToken(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function getRawContent(args: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(args, 'content')) return args['content'];
  if (Object.prototype.hasOwnProperty.call(args, 'agent_content')) return args['agent_content'];
  return '';
}

function serializeArtifactContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonObject(rawContent: unknown, serializedContent: string): Record<string, any> | null {
  if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
    return rawContent as Record<string, any>;
  }
  if (typeof serializedContent !== 'string') return null;
  const trimmed = serializedContent.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
  } catch {
    return null;
  }
  return null;
}

function looksLikeTasksMarkdown(content: string, token: string): boolean {
  const trimmed = content.trimStart();
  return (
    /^#\s+Tasks\b/i.test(trimmed) ||
    token.includes('contract-fields') ||
    token.includes('task-1') ||
    token.includes('total-tasks') ||
    token.includes('expected-file-changes')
  );
}

function inferCanonicalFileType(args: Record<string, unknown>, rawContent: unknown, content: string): string | null {
  const fileType = String(args['file_type'] ?? '');
  if (fileType !== 'work_log') return null;

  const json = parseJsonObject(rawContent, content);
  if (json) {
    // Content beats run_id. This prevents a task-planner run_id from forcing
    // every subsequent JSON artifact into tasks.md.
    if (
      json.work_item_id &&
      json.workflow_path &&
      (json.trigger_reason || json.classification || json.files_affected || Array.isArray(json.unknowns)) &&
      !Array.isArray(json.entries)
    ) {
      return 'trigger_result';
    }

    if (
      json.work_item_id &&
      Array.isArray(json.entries) &&
      (json.workflow_path || 'merge_required' in json || 'merge_status' in json || 'note' in json)
    ) {
      return 'candidate_manifest';
    }

    if (json.work_item_id && Array.isArray(json.entries) && ('generated_at' in json || 'evidence_version' in json)) {
      return 'evidence_manifest';
    }

    if (json.conclusion && (json.verification_commands || json.acceptance_criteria || json.test_matrix)) {
      return 'verification_report';
    }
  }

  const contentToken = normalizeToken(content.slice(0, 1200));
  const runId = normalizeToken(args['run_id']);
  const template = normalizeToken(args['template']);
  const probe = `${template} ${contentToken}`;

  if (probe.includes('trace-delta') || /^#\s+Trace\s+Delta\b/i.test(content.trimStart())) return 'trace_delta';
  if (probe.includes('impact-analysis') || /^#\s+Impact\s+Analysis\b/i.test(content.trimStart())) return 'impact_analysis';
  if (probe.includes('change-classification') || /^#\s+Change\s+Classification\b/i.test(content.trimStart())) return 'change_classification';
  if (looksLikeTasksMarkdown(content, contentToken)) return 'tasks';
  if (probe.includes('merge-report') || /^#\s+Merge\s+Report\b/i.test(content.trimStart())) return 'merge_report';

  // Run-id is only a weak fallback. Use it only when the content itself is
  // clearly the same artifact type. Do not infer JSON artifacts from labels in
  // invalid text such as "trigger_result\n{...}"; that must stay a work_log,
  // not poison the WI with INVALID_ARTIFACT_JSON.
  if ((runId.includes('task-plan') || runId.includes('task-planner')) && looksLikeTasksMarkdown(content, contentToken)) {
    return 'tasks';
  }
  if (runId.includes('trace-delta')) return 'trace_delta';
  if (runId.includes('impact-analysis')) return 'impact_analysis';
  if (runId.includes('change-classification') || runId.includes('intake-classification')) return 'change_classification';
  if (runId.includes('merge-report')) return 'merge_report';
  if (runId.includes('evidence-manifest')) return 'evidence_manifest';

  return null;
}

function resolveTargetFilename(fileType: string): string | null {
  if (V11_WI_ARTIFACT_FILES.has(fileType)) return fileType;
  return V11_FILETYPE_TO_FILENAME.get(fileType) ?? null;
}

function isJsonArtifact(filename: string): boolean {
  return filename.endsWith('.json');
}

function safeReadJson(filePath: string): Record<string, any> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
  } catch {
    return null;
  }
  return null;
}

function writeIfMissing(filePath: string, content: string): void {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function patchWorkItemWorkflowPath(baseDir: string, workItemId: string, json: Record<string, any>): void {
  const workflowPath = typeof json.workflow_path === 'string' ? json.workflow_path : undefined;
  if (!workflowPath) return;

  const wiJsonPath = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId, 'work_item.json');
  const workItem = safeReadJson(wiJsonPath);
  if (!workItem) return;

  let changed = false;
  if (!workItem.workflow_path) {
    workItem.workflow_path = workflowPath;
    changed = true;
  }
  if (json.workflow_type && !workItem.workflow_type) {
    workItem.workflow_type = json.workflow_type;
    changed = true;
  }
  if (changed) {
    workItem.updated_at = new Date().toISOString();
    fs.writeFileSync(wiJsonPath, JSON.stringify(workItem, null, 2) + '\n', 'utf-8');
  }
}

function maybeWriteCodeOnlyCompanionArtifacts(
  baseDir: string,
  workItemId: string,
  targetFilename: string,
  rawContent: unknown,
  content: string,
): void {
  const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId);
  const parsed = parseJsonObject(rawContent, content);

  if (targetFilename === 'trigger_result.json' && parsed) {
    patchWorkItemWorkflowPath(baseDir, workItemId, parsed);
  }

  const workflowPath =
    typeof parsed?.workflow_path === 'string'
      ? parsed.workflow_path
      : safeReadJson(path.join(wiDir, 'trigger_result.json'))?.workflow_path ??
        safeReadJson(path.join(wiDir, 'work_item.json'))?.workflow_path;

  if (workflowPath !== 'code_only_fast_path') return;

  if (targetFilename === 'candidate_manifest.json') {
    const mergeReport = [
      '# Merge Report',
      '',
      `- Work Item: ${workItemId}`,
      '- workflow_path: code_only_fast_path',
      '- status: not_applicable',
      '- reason: code_only_fast_path has no formal spec candidate artifacts to merge.',
      '',
    ].join('\n');
    writeIfMissing(path.join(wiDir, 'merge_report.md'), mergeReport);
  }

  if (targetFilename === 'verification_report.md') {
    const evidenceManifestPath = path.join(wiDir, 'evidence', 'evidence_manifest.json');
    const evidenceManifest = {
      work_item_id: workItemId,
      generated_at: new Date().toISOString(),
      entries: [
        { id: 'trigger_result', type: 'artifact', path: `.specforge/work-items/${workItemId}/trigger_result.json` },
        { id: 'candidate_manifest', type: 'artifact', path: `.specforge/work-items/${workItemId}/candidate_manifest.json` },
        { id: 'tasks', type: 'artifact', path: `.specforge/work-items/${workItemId}/tasks.md` },
        { id: 'verification_report', type: 'verification', path: `.specforge/work-items/${workItemId}/verification_report.md` },
        { id: 'changed_files_audit', type: 'audit', path: `.specforge/work-items/${workItemId}/changed_files_audit.md` },
      ],
    };
    writeIfMissing(evidenceManifestPath, JSON.stringify(evidenceManifest, null, 2) + '\n');
  }
}

registerHandler('sf_artifact_write', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  let fileType = String(args['file_type'] ?? '');
  const rawContent = getRawContent(args as Record<string, unknown>);
  const content = serializeArtifactContent(rawContent);

  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return { success: false, error: idError, hard_stop: false, retry_allowed: true };
  }

  const guardResult = guardHardStop(baseDir, workItemId, 'sf_artifact_write');
  if (!guardResult.allowed) {
    return {
      success: false,
      error: guardResult.error,
      hard_stop: true,
      hard_stop_record: guardResult.hard_stop_record,
    };
  }

  const inferred = inferCanonicalFileType(args as Record<string, unknown>, rawContent, content);
  if (inferred) fileType = inferred;

  const targetFilename = resolveTargetFilename(fileType);

  if (!targetFilename && String(args['file_type']) === 'work_log') {
    return await writeArtifact(
      {
        work_item_id: workItemId,
        file_type: 'work_log' as any,
        content,
        run_id: args['run_id'] as string | undefined,
        template: args['template'] as any,
        agent_content: args['agent_content'] as string | undefined,
      },
      baseDir,
    );
  }

  if (!targetFilename) {
    return await writeArtifact(
      {
        work_item_id: workItemId,
        file_type: fileType as any,
        content,
        run_id: args['run_id'] as string | undefined,
        template: args['template'] as any,
        agent_content: args['agent_content'] as string | undefined,
      },
      baseDir,
    );
  }

  if (isJsonArtifact(targetFilename)) {
    let workflowPath: string | undefined;
    try {
      const wiJsonPath = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId, 'work_item.json');
      const wiContent = safeReadJson(wiJsonPath);
      workflowPath = wiContent?.workflow_path;
    } catch {
      // non-critical; validator can use artifact content.
    }

    const validation = validateArtifactJson(targetFilename, content, workItemId, workflowPath);
    if (validation && !validation.valid) {
      // Direct canonical JSON artifact writes are contract violations. Inferred
      // work_log text is intentionally not mapped to JSON unless it already parses.
      setHardStop(baseDir, workItemId, `INVALID_ARTIFACT_JSON: ${validation.errors.join('; ')}`, 'sf_artifact_write');
      return {
        success: false,
        error: 'INVALID_ARTIFACT_JSON',
        hard_stop: true,
        validation_errors: validation.errors,
        message: `Artifact "${targetFilename}" failed schema validation and was NOT written to disk.`,
      };
    }
  }

  const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId);
  fs.mkdirSync(wiDir, { recursive: true });

  let targetPath: string;
  if (targetFilename === 'evidence_manifest.json') {
    const evidenceDir = path.join(wiDir, 'evidence');
    fs.mkdirSync(evidenceDir, { recursive: true });
    targetPath = path.join(evidenceDir, 'evidence_manifest.json');
  } else {
    targetPath = path.join(wiDir, targetFilename);
  }

  try {
    fs.writeFileSync(targetPath, content, 'utf-8');
    maybeWriteCodeOnlyCompanionArtifacts(baseDir, workItemId, targetFilename, rawContent, content);
    const size = Buffer.byteLength(content, 'utf-8');
    const relativePath = path.relative(baseDir, targetPath).replace(/\\/g, '/');
    return { success: true, path: relativePath, size, file_type: fileType, controlled_artifact: true };
  } catch (err: any) {
    setHardStop(baseDir, workItemId, `ARTIFACT_WRITE_FAILED: ${err.message}`, 'sf_artifact_write');
    return { success: false, error: `ARTIFACT_WRITE_FAILED: ${err.message}`, hard_stop: true };
  }
});
