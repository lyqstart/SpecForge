/**
 * sf-artifact-write.ts — v1.1 Controlled Artifact Writer
 *
 * This is the ONLY allowed path for writing WI artifacts.
 * Integrates:
 * 1. hard_stop latch guard — blocked WI cannot write artifacts
 * 2. JSON schema validation — invalid JSON artifacts are rejected (never touch disk)
 * 3. WI directory scoping — only writes to the correct WI directory
 * 4. On validation failure: returns hard_stop=true and persists latch
 */
import path from 'path';
import { registerHandler } from '../ToolDispatcher';
import { writeArtifact } from '../lib/sf_artifact_write_core';
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';
import { validateArtifactJson } from '../lib/artifact-schema-validation';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import * as fs from 'node:fs';

/**
 * v1.1 WI artifact files that MUST go through this controlled writer.
 * bash/write/edit/shell tools are blocked from writing these files.
 */
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

/**
 * Map from v1.1 artifact filenames to the sf_artifact_write file_type parameter.
 * Used for direct WI artifact writing mode (v1.1 controlled writer).
 */
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

registerHandler('sf_artifact_write', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const fileType = args['file_type'] as string;
  const content = args['content'] as string;

  // ── WI ID Validation ──────────────────────────────────────────────────────
  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return { success: false, error: idError, hard_stop: true };
  }

  // ── Hard Stop Guard ───────────────────────────────────────────────────────
  const guardResult = guardHardStop(baseDir, workItemId, 'sf_artifact_write');
  if (!guardResult.allowed) {
    return {
      success: false,
      error: guardResult.error,
      hard_stop: true,
      hard_stop_record: guardResult.hard_stop_record,
    };
  }

  // ── v1.1 Controlled Writer Mode ──────────────────────────────────────────
  // Determine the target filename from file_type
  let targetFilename: string | null = null;

  // Check if file_type is a v1.1 artifact filename directly
  if (V11_WI_ARTIFACT_FILES.has(fileType)) {
    targetFilename = fileType;
  } else {
    // Check if file_type maps to a v1.1 artifact
    for (const [filename, ft] of Object.entries(V11_FILENAME_MAP)) {
      if (ft === fileType) {
        targetFilename = filename;
        break;
      }
    }
  }

  // ── JSON Schema Validation (for JSON artifacts) ───────────────────────────
  if (targetFilename && targetFilename.endsWith('.json')) {
    // Determine workflow_path from work_item.json if available
    let workflowPath: string | undefined;
    try {
      const wiJsonPath = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId, 'work_item.json');
      if (fs.existsSync(wiJsonPath)) {
        const wiContent = JSON.parse(fs.readFileSync(wiJsonPath, 'utf-8'));
        workflowPath = wiContent.workflow_path;
      }
    } catch { /* non-critical — validator will use workflow_path from content if available */ }

    const validation = validateArtifactJson(targetFilename, content, workItemId, workflowPath);
    if (validation && !validation.valid) {
      // Schema validation failed — DO NOT write to disk
      // Set hard_stop latch
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

  // ── v1.1 Direct WI Artifact Write (bypass legacy path logic) ──────────────
  if (targetFilename && V11_WI_ARTIFACT_FILES.has(targetFilename)) {
    const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId);

    // Ensure WI directory exists
    try {
      fs.mkdirSync(wiDir, { recursive: true });
    } catch { /* already exists */ }

    // Handle evidence subdirectory
    let targetPath: string;
    if (targetFilename === 'evidence_manifest.json') {
      const evidenceDir = path.join(wiDir, 'evidence');
      try { fs.mkdirSync(evidenceDir, { recursive: true }); } catch { /* exists */ }
      targetPath = path.join(evidenceDir, 'evidence_manifest.json');
    } else {
      targetPath = path.join(wiDir, targetFilename);
    }

    try {
      fs.writeFileSync(targetPath, content, 'utf-8');
      const size = Buffer.byteLength(content, 'utf-8');
      const relativePath = path.relative(baseDir, targetPath).replace(/\\/g, '/');
      return { success: true, path: relativePath, size };
    } catch (err: any) {
      // Write failure — set hard_stop
      setHardStop(baseDir, workItemId, `ARTIFACT_WRITE_FAILED: ${err.message}`, 'sf_artifact_write');
      return {
        success: false,
        error: `ARTIFACT_WRITE_FAILED: ${err.message}`,
        hard_stop: true,
      };
    }
  }

  // ── Legacy Mode (verification_report, work_log, etc.) ─────────────────────
  const result = await writeArtifact(
    {
      work_item_id: workItemId,
      file_type: fileType as any,
      content,
      run_id: args['run_id'] as string | undefined,
      template: args['template'] as any,
      agent_content: args['agent_content'] as string | undefined,
    },
    baseDir
  );

  return result;
});
