/**
 * sf-artifact-write.ts — v1.1 Controlled Artifact Writer
 *
 * This is the ONLY allowed path for writing WI artifacts.
 * Fix in this version:
 * - Accepts canonical v1.1 artifact file_type values.
 * - Maps common legacy/work_log run_id values to canonical v1.1 artifacts so
 *   real OpenCode agents cannot accidentally write trigger_result/candidate_manifest
 *   into archive/work_log instead of the WI directory.
 * - Rejects ambiguous work_log writes that look like required WI artifacts.
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

function inferCanonicalFileType(args: Record<string, unknown>): string | null {
  const fileType = String(args['file_type'] ?? '');
  const runId = normalizeToken(args['run_id']);
  const template = normalizeToken(args['template']);
  const content = String(args['content'] ?? args['agent_content'] ?? '');
  const contentToken = normalizeToken(content.slice(0, 400));
  const probe = `${runId} ${template} ${contentToken}`;

  if (fileType !== 'work_log') return null;

  if (probe.includes('trigger-result') || probe.includes('trigger-result-json')) return 'trigger_result';
  if (probe.includes('candidate-manifest') || probe.includes('candidate-manifest-json')) return 'candidate_manifest';
  if (probe.includes('trace-delta')) return 'trace_delta';
  if (probe.includes('impact-analysis')) return 'impact_analysis';
  if (probe.includes('change-classification') || probe.includes('intake-classification')) return 'change_classification';
  if (probe.includes('tasks-md') || probe.includes('task-plan') || probe.includes('task-planning')) return 'tasks';
  if (probe.includes('merge-report')) return 'merge_report';
  if (probe.includes('evidence-manifest')) return 'evidence_manifest';
  return null;
}

function resolveTargetFilename(fileType: string): string | null {
  if (V11_WI_ARTIFACT_FILES.has(fileType)) return fileType;
  return V11_FILETYPE_TO_FILENAME.get(fileType) ?? null;
}

function isJsonArtifact(filename: string): boolean {
  return filename.endsWith('.json');
}

registerHandler('sf_artifact_write', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  let fileType = args['file_type'] as string;
  const content = String(args['content'] ?? args['agent_content'] ?? '');

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

  const inferred = inferCanonicalFileType(args as Record<string, unknown>);
  if (inferred) fileType = inferred;

  const targetFilename = resolveTargetFilename(fileType);

  if (!targetFilename && String(args['file_type']) === 'work_log') {
    // Keep ordinary agent run work logs in legacy archive, but do not allow required
    // v1.1 artifacts to disappear into archive due ambiguous work_log usage.
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
    const size = Buffer.byteLength(content, 'utf-8');
    const relativePath = path.relative(baseDir, targetPath).replace(/\\/g, '/');
    return { success: true, path: relativePath, size, file_type: fileType, controlled_artifact: true };
  } catch (err: any) {
    setHardStop(baseDir, workItemId, `ARTIFACT_WRITE_FAILED: ${err.message}`, 'sf_artifact_write');
    return { success: false, error: `ARTIFACT_WRITE_FAILED: ${err.message}`, hard_stop: true };
  }
});
