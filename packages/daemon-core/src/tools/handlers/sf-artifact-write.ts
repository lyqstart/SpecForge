/**
 * sf-artifact-write.ts — v1.1 Controlled Artifact Writer
 *
 * This is the ONLY allowed path for writing WI artifacts.
 *
 * Real OpenCode agents are not perfectly consistent about file_type/run_id.  This
 * handler therefore normalizes common legacy tool calls into canonical v1.1 WI
 * artifacts, while still keeping ambiguous logs in the archive.  JSON artifacts
 * are only treated as JSON artifacts when the payload is valid JSON/object data;
 * a prefixed text block such as `trigger_result\n{...}` is archived as a log and
 * must not hard-stop the WI.
 */
import path from 'path';
import { registerHandler } from '../ToolDispatcher';
import { writeArtifact } from '../lib/sf_artifact_write_core';
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';
import { validateArtifactJson } from '../lib/artifact-schema-validation';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import * as fs from 'node:fs';

const LEGACY_LOG_TYPES = new Set([
  'work_log',
  'agent_run_result',
  'agent-run-result',
  'run_result',
  'run-result',
  'review_report',
  'review-report',
]);

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

function normalizeRawContent(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function isLegacyLogType(fileType: string): boolean {
  return LEGACY_LOG_TYPES.has(fileType) || LEGACY_LOG_TYPES.has(normalizeToken(fileType));
}

function inferJsonArtifactFromObject(json: Record<string, unknown>): string | null {
  if (Array.isArray(json.entries) || json.merge_status !== undefined) return 'candidate_manifest';
  if (json.conclusion !== undefined || json.test_matrix !== undefined || json.verification_commands !== undefined) {
    return 'verification_report';
  }
  if (Array.isArray(json.evidence) || Array.isArray(json.artifacts)) return 'evidence_manifest';

  const hasWorkflowPath = typeof json.workflow_path === 'string';
  const looksLikeTriggerResult =
    hasWorkflowPath &&
    (json.trigger_reason !== undefined ||
      json.reason !== undefined ||
      json.classification !== undefined ||
      json.unknowns !== undefined ||
      json.files_affected !== undefined ||
      json.verification_mode !== undefined ||
      json.merge_required !== undefined);
  if (looksLikeTriggerResult) return 'trigger_result';

  return null;
}

function inferMarkdownArtifact(content: string): string | null {
  const trimmed = content.trimStart();
  const token = normalizeToken(trimmed.slice(0, 1200));
  if (/^#\s*tasks\b/i.test(trimmed) || token.includes('contract-fields') || token.includes('task-1')) return 'tasks';
  if (/^#\s*trace\s+delta\b/i.test(trimmed) || token.includes('trace-delta')) return 'trace_delta';
  if (/^#\s*impact\s+analysis\b/i.test(trimmed) || token.includes('impact-analysis')) return 'impact_analysis';
  if (/^#\s*change\s+classification\b/i.test(trimmed) || token.includes('change-classification')) {
    return 'change_classification';
  }
  if (/^#\s*intake\b/i.test(trimmed)) return 'intake';
  if (/verification\s+report/i.test(trimmed) || /^#\s*验证报告\b/i.test(trimmed)) return 'verification_report';
  if (/merge\s+report/i.test(trimmed)) return 'merge_report';
  return null;
}

function inferCanonicalFileType(args: Record<string, unknown>, content: string): string | null {
  const fileType = String(args['file_type'] ?? '');
  const runId = normalizeToken(args['run_id']);
  const template = normalizeToken(args['template']);
  const contentToken = normalizeToken(content.slice(0, 400));
  const probe = `${runId} ${template} ${contentToken}`;

  const json = parseJsonObject(content);
  if (json) {
    const jsonArtifact = inferJsonArtifactFromObject(json);
    if (jsonArtifact) return jsonArtifact;
  }

  const markdownArtifact = inferMarkdownArtifact(content);
  if (markdownArtifact && isLegacyLogType(fileType)) return markdownArtifact;

  if (!isLegacyLogType(fileType)) return null;

  if (probe.includes('trigger-result') || /^trigger-wi-/.test(runId)) {
    // Only infer trigger_result from run_id when content is valid JSON.  This avoids
    // hard-stopping on strings such as `trigger_result\n{...}`.
    return json ? 'trigger_result' : null;
  }
  if (probe.includes('candidate-manifest') || probe.includes('candidate-manifest-json')) return json ? 'candidate_manifest' : null;
  if (probe.includes('trace-delta')) return 'trace_delta';
  if (probe.includes('impact-analysis')) return 'impact_analysis';
  if (probe.includes('change-classification') || probe.includes('intake-classification')) return 'change_classification';
  if (probe.includes('tasks-md') || probe.includes('task-plan') || probe.includes('task-planning')) {
    // Avoid mapping arbitrary JSON emitted by task-planner to tasks.md.  The content
    // must look like a task document; otherwise it may be candidate_manifest.json.
    return markdownArtifact === 'tasks' ? 'tasks' : null;
  }
  if (probe.includes('merge-report')) return 'merge_report';
  if (probe.includes('evidence-manifest')) return json ? 'evidence_manifest' : null;
  return null;
}

function resolveTargetFilename(fileType: string): string | null {
  if (V11_WI_ARTIFACT_FILES.has(fileType)) return fileType;
  const normalized = normalizeToken(fileType).replace(/-/g, '_');
  return V11_FILETYPE_TO_FILENAME.get(fileType) ?? V11_FILETYPE_TO_FILENAME.get(normalized) ?? null;
}

function isJsonArtifact(filename: string): boolean {
  return filename.endsWith('.json');
}

function normalizeJsonArtifactContent(filename: string, content: string, workItemId: string): string {
  const json = parseJsonObject(content);
  if (!json) return content;

  if (!json.work_item_id) json.work_item_id = workItemId;

  if (filename === 'candidate_manifest.json') {
    if (!Array.isArray(json.entries)) json.entries = [];
    if (json.merge_required === undefined) json.merge_required = false;
    if (json.merge_status === undefined) json.merge_status = 'not_applicable';
  }

  if (filename === 'evidence_manifest.json') {
    if (!Array.isArray(json.entries)) json.entries = [];
  }

  return JSON.stringify(json, null, 2) + '\n';
}

function patchWorkItemWorkflowPath(baseDir: string, workItemId: string, triggerResultContent: string): void {
  const triggerJson = parseJsonObject(triggerResultContent);
  const workflowPath = triggerJson?.workflow_path;
  if (typeof workflowPath !== 'string' || workflowPath.length === 0) return;

  const wiJsonPath = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId, 'work_item.json');
  if (!fs.existsSync(wiJsonPath)) return;

  try {
    const wiJson = JSON.parse(fs.readFileSync(wiJsonPath, 'utf-8')) as Record<string, unknown>;
    wiJson.workflow_path = workflowPath;
    wiJson.updated_at = new Date().toISOString();
    fs.writeFileSync(wiJsonPath, JSON.stringify(wiJson, null, 2) + '\n', 'utf-8');
  } catch {
    // Non-critical; close_gate can still validate trigger_result.json directly.
  }
}

function ensureMergeReportForCodeOnly(wiDir: string, candidateManifestContent: string): void {
  const json = parseJsonObject(candidateManifestContent);
  if (json?.workflow_path !== 'code_only_fast_path') return;
  const mergeReportPath = path.join(wiDir, 'merge_report.md');
  if (fs.existsSync(mergeReportPath)) return;
  fs.writeFileSync(
    mergeReportPath,
    [
      '# Merge Report',
      '',
      'status: not_applicable',
      'reason: code_only_fast_path has no candidate spec artifacts to merge.',
      '',
    ].join('\n'),
    'utf-8',
  );
}

function ensureEvidenceManifestForCodeOnly(wiDir: string, workItemId: string): void {
  const evidenceDir = path.join(wiDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, 'evidence_manifest.json');
  if (fs.existsSync(evidencePath)) return;
  const evidenceManifest = {
    work_item_id: workItemId,
    entries: [
      { type: 'verification_report', path: 'verification_report.md' },
      { type: 'changed_files_audit', path: 'changed_files_audit.json' },
    ],
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidenceManifest, null, 2) + '\n', 'utf-8');
}

async function writeLegacyLog(args: Record<string, unknown>, workItemId: string, content: string, baseDir: string): Promise<unknown> {
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

registerHandler('sf_artifact_write', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  let fileType = String(args['file_type'] ?? '');
  let content = normalizeRawContent(args['content'] ?? args['agent_content']);

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

  const inferred = inferCanonicalFileType(args as Record<string, unknown>, content);
  if (inferred) fileType = inferred;

  const targetFilename = resolveTargetFilename(fileType);

  if (!targetFilename && isLegacyLogType(String(args['file_type'] ?? ''))) {
    return await writeLegacyLog(args as Record<string, unknown>, workItemId, content, baseDir);
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
    const originalContent = content;
    content = normalizeJsonArtifactContent(targetFilename, content, workItemId);

    // A canonical JSON artifact must be valid JSON.  A legacy log that only
    // resembles JSON was already routed to writeLegacyLog above and must not
    // hard-stop the WI.
    let workflowPath: string | undefined;
    try {
      const wiJsonPath = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId, 'work_item.json');
      if (fs.existsSync(wiJsonPath)) {
        const wiContent = JSON.parse(fs.readFileSync(wiJsonPath, 'utf-8'));
        workflowPath = wiContent.workflow_path;
      }
    } catch {
      // non-critical; validator can use artifact content.
    }

    const validation = validateArtifactJson(targetFilename, content, workItemId, workflowPath);
    if (validation && !validation.valid) {
      setHardStop(baseDir, workItemId, `INVALID_ARTIFACT_JSON: ${validation.errors.join('; ')}`, 'sf_artifact_write');
      return {
        success: false,
        error: 'INVALID_ARTIFACT_JSON',
        hard_stop: true,
        validation_errors: validation.errors,
        message: `Artifact "${targetFilename}" failed schema validation and was NOT written to disk.`,
        original_content_preview: originalContent.slice(0, 120),
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

    if (targetFilename === 'trigger_result.json') {
      patchWorkItemWorkflowPath(baseDir, workItemId, content);
    }
    if (targetFilename === 'candidate_manifest.json') {
      ensureMergeReportForCodeOnly(wiDir, content);
    }
    if (targetFilename === 'verification_report.md') {
      ensureEvidenceManifestForCodeOnly(wiDir, workItemId);
    }

    const size = Buffer.byteLength(content, 'utf-8');
    const relativePath = path.relative(baseDir, targetPath).replace(/\\/g, '/');
    return { success: true, path: relativePath, size, file_type: fileType, controlled_artifact: true };
  } catch (err: any) {
    setHardStop(baseDir, workItemId, `ARTIFACT_WRITE_FAILED: ${err.message}`, 'sf_artifact_write');
    return { success: false, error: `ARTIFACT_WRITE_FAILED: ${err.message}`, hard_stop: true };
  }
});
