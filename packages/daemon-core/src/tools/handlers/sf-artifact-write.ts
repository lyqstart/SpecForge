/**
 * sf-artifact-write.ts — v1.1 Controlled Artifact Writer
 *
 * V11.2:
 * - Normalize core JSON artifact schemas before validation.
 * - Candidate paths are canonicalized for candidate_manifest.json.
 * - executor-like agents cannot write governed artifacts.
 */
import path from 'path';
import * as fs from 'node:fs';
import { registerHandler } from '../ToolDispatcher';
import { writeArtifact } from '../lib/sf_artifact_write_core';
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';
import { validateArtifactJson, findForbiddenWorkItemDecisionFields } from '../lib/artifact-schema-validation';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { inferManifestEntries } from '../lib/governance-invariants-v11';

const V11_WI_ARTIFACT_FILES = new Set([
  'work_item.json',
  'intake.md',
  'change_classification.md',
  'impact_analysis.md',
  'trigger_result.json',
  'requirements_delta.md',
  'design_delta.md',
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
  'requirements_delta.md': 'requirements_delta',
  'design_delta.md': 'design_delta',
  'tasks.md': 'tasks',
  'trace_delta.md': 'trace_delta',
  'candidate_manifest.json': 'candidate_manifest',
  'merge_report.md': 'merge_report',
  'verification_report.md': 'verification_report',
  'evidence_manifest.json': 'evidence_manifest',
};

const V11_FILETYPE_TO_FILENAME = new Map(
  Object.entries(V11_FILENAME_MAP).map(([filename, fileType]) => [fileType, filename]),
);

function mirrorSpecCandidateArtifacts(
  baseDir: string,
  workItemId: string,
  targetFilename: string,
  content: string,
  primaryTargetPath: string,
): void {
  const normalizedTargetFilename = targetFilename.replace(/\\/g, '/');
  const canonicalMirrors: Record<string, string[]> = {
    'requirements.md': ['candidates/project/modules/core/requirements.candidate.md'],
    'design.md': ['candidates/project/modules/core/design.candidate.md'],
    'tasks.md': ['candidates/tasks.md'],
    'trace_delta.md': ['candidates/trace_delta.md'],
    'candidates/project/modules/core/requirements.candidate.md': ['requirements.md'],
    'candidates/project/modules/core/design.candidate.md': ['design.md'],
    'candidates/tasks.md': ['tasks.md'],
    'candidates/trace_delta.md': ['trace_delta.md'],
  };

  const mirrors = canonicalMirrors[normalizedTargetFilename] ?? [];
  if (mirrors.length === 0) return;

  const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId);
  for (const relativeMirror of mirrors) {
    const mirrorPath = path.join(wiDir, relativeMirror);
    if (path.resolve(mirrorPath) === path.resolve(primaryTargetPath)) continue;
    fs.mkdirSync(path.dirname(mirrorPath), { recursive: true });
    fs.writeFileSync(mirrorPath, content, 'utf-8');
  }
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function stringifyArtifactContent(value: unknown, fallback?: unknown): string {
  const chosen = value ?? fallback ?? '';
  if (typeof chosen === 'string') return chosen;
  if (Buffer.isBuffer(chosen)) return chosen.toString('utf-8');
  if (typeof chosen === 'object') return JSON.stringify(chosen, null, 2);
  return String(chosen);
}

function inferCanonicalFileType(args: Record<string, unknown>): string | null {
  const fileType = String(args['file_type'] ?? '');
  const runId = normalizeToken(args['run_id']);
  const template = normalizeToken(args['template']);
  const content = stringifyArtifactContent(args['content'], args['agent_content']);
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
  if (fileType === 'requirements') return 'requirements.md';
  if (fileType === 'design') return 'design.md';
  if (fileType === 'requirements_delta') return 'requirements_delta.md';
  if (fileType === 'design_delta') return 'design_delta.md';
  if (fileType === 'candidate_requirements') return 'candidates/project/modules/core/requirements.candidate.md';
  if (fileType === 'candidate_design') return 'candidates/project/modules/core/design.candidate.md';
  if (fileType === 'candidate_tasks') return 'candidates/tasks.md';
  if (fileType === 'candidate_trace_delta') return 'candidates/trace_delta.md';
  if (V11_WI_ARTIFACT_FILES.has(fileType)) return fileType;
  return V11_FILETYPE_TO_FILENAME.get(fileType) ?? null;
}

function isJsonArtifact(filename: string): boolean {
  return filename.endsWith('.json');
}

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeWorkItemJsonArtifact(input: {
  parsed: Record<string, unknown>;
  workItemId: string;
  baseDir: string;
  workflowPath?: string;
  workflowType?: string;
}): Record<string, unknown> {
  const wiDir = path.join(input.baseDir, SPEC_DIR_NAME, 'work-items', input.workItemId);
  const existing = readJsonIfExists(path.join(wiDir, 'work_item.json')) ?? {};

  const normalized = {
    ...existing,
    ...input.parsed,
    schema_version:
      input.parsed.schema_version ?? existing.schema_version ?? '1.1',
    work_item_id:
      input.parsed.work_item_id ?? existing.work_item_id ?? input.workItemId,
    status:
      input.parsed.status ?? existing.status ?? 'created',
    workflow_type:
      input.parsed.workflow_type ??
      existing.workflow_type ??
      input.workflowType ??
      'quick_change',
    workflow_path:
      input.parsed.workflow_path ?? existing.workflow_path ?? input.workflowPath,
    updated_at: new Date().toISOString(),
  };

  const forbiddenDecisionFields = findForbiddenWorkItemDecisionFields(normalized);
  if (forbiddenDecisionFields.length > 0) {
    // Keep the forbidden fields in the returned JSON so schema validation rejects
    // the write. Do not silently strip governance pollution.
    return normalized;
  }

  return normalized;
}

function inferWorkflowFacts(
  baseDir: string,
  workItemId: string,
  contentJson?: Record<string, unknown>,
): { workflowPath?: string; workflowType?: string } {
  const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId);
  const candidates: Array<Record<string, unknown> | null> = [
    contentJson ?? null,
    readJsonIfExists(path.join(wiDir, 'work_item.json')),
    readJsonIfExists(path.join(wiDir, 'trigger_result.json')),
    readJsonIfExists(path.join(wiDir, 'candidate_manifest.json')),
  ];

  for (const json of candidates) {
    if (!json) continue;
    const workflowPath = typeof json.workflow_path === 'string' ? json.workflow_path : undefined;
    const workflowType = typeof json.workflow_type === 'string' ? json.workflow_type : undefined;
    if (workflowPath || workflowType) {
      return { workflowPath, workflowType };
    }
  }
  return {};
}

function normalizeCandidatePath(value: unknown): string {
  const normalized = String(value ?? '').replace(/\\/g, '/');
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

function canonicalCandidatePathByType(entry: any, candidatePath: string): string | null {
  const candidateType = String(entry?.type ?? '').toLowerCase();
  const targetPath = normalizeCandidatePath(entry?.target_path);
  const normalizedPath = normalizeCandidatePath(candidatePath);

  if (
    candidateType === 'requirements' ||
    candidateType === 'requirement' ||
    normalizedPath === 'requirements.md' ||
    normalizedPath === '.specforge/work-items/wi-0001/requirements.md' ||
    normalizedPath === 'candidates/requirements.md' ||
    normalizedPath.endsWith('/requirements.md') ||
    targetPath.endsWith('/requirements.md')
  ) {
    return 'candidates/project/modules/core/requirements.candidate.md';
  }

  if (
    candidateType === 'design' ||
    normalizedPath === 'design.md' ||
    normalizedPath === 'candidates/design.md' ||
    normalizedPath.endsWith('/design.md') ||
    targetPath.endsWith('/design.md')
  ) {
    return 'candidates/project/modules/core/design.candidate.md';
  }

  if (
    candidateType === 'tasks' ||
    candidateType === 'task' ||
    normalizedPath === 'tasks.md' ||
    normalizedPath.endsWith('/tasks.md') ||
    targetPath.endsWith('/tasks.md')
  ) {
    return 'candidates/tasks.md';
  }

  if (
    candidateType === 'trace' ||
    candidateType === 'trace_delta' ||
    normalizedPath === 'trace_delta.md' ||
    normalizedPath.endsWith('/trace_delta.md') ||
    targetPath === '.specforge/project/trace_matrix.md' ||
    targetPath.endsWith('/trace_matrix.md')
  ) {
    return 'candidates/trace_delta.md';
  }

  return null;
}

function canonicalizeCandidateEntry(entry: any): any {
  if (!entry || typeof entry !== 'object') return entry;
  const candidatePath = normalizeCandidatePath(entry.candidate_path ?? entry.path);
  const canonicalPath = canonicalCandidatePathByType(entry, candidatePath);
  if (!canonicalPath) return entry;

  const normalizedEntry = { ...entry };
  if (Object.prototype.hasOwnProperty.call(normalizedEntry, 'candidate_path')) {
    normalizedEntry.candidate_path = canonicalPath;
  }
  if (Object.prototype.hasOwnProperty.call(normalizedEntry, 'path')) {
    normalizedEntry.path = canonicalPath;
  }
  if (
    !Object.prototype.hasOwnProperty.call(normalizedEntry, 'candidate_path') &&
    !Object.prototype.hasOwnProperty.call(normalizedEntry, 'path')
  ) {
    normalizedEntry.path = canonicalPath;
  }
  return normalizedEntry;
}

function normalizeCoreJsonArtifact(
  filename: string,
  content: string,
  workItemId: string,
  baseDir: string,
): string {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return content;

  const facts = inferWorkflowFacts(baseDir, workItemId, parsed);
  const workflowPath = parsed.workflow_path ?? facts.workflowPath;
  const workflowType = parsed.workflow_type ?? facts.workflowType;

  if (filename === 'work_item.json') {
    const normalized = normalizeWorkItemJsonArtifact({
      parsed,
      workItemId,
      baseDir,
      workflowPath,
      workflowType,
    });
    return JSON.stringify(normalized, null, 2);
  }

  if (filename === 'trigger_result.json') {
    return JSON.stringify(
      {
        ...parsed,
        schema_version: parsed.schema_version ?? '1.1',
        work_item_id: parsed.work_item_id ?? workItemId,
        workflow_path: parsed.workflow_path ?? workflowPath,
        workflow_type: parsed.workflow_type ?? workflowType,
        status: parsed.status ?? 'triggered',
        unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns : [],
      },
      null,
      2,
    );
  }

  if (filename === 'candidate_manifest.json') {
    const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId);
    const canonicalParsed = { ...parsed };

    if (Array.isArray(parsed.candidates)) {
      canonicalParsed.candidates = parsed.candidates.map(canonicalizeCandidateEntry);
    }
    if (Array.isArray(parsed.entries)) {
      canonicalParsed.entries = parsed.entries.map(canonicalizeCandidateEntry);
    }

    const preliminary = { ...canonicalParsed, workflow_path: canonicalParsed.workflow_path ?? workflowPath };
    const entries =
      Array.isArray(canonicalParsed.entries) && canonicalParsed.entries.length > 0
        ? canonicalParsed.entries
        : inferManifestEntries(preliminary, wiDir);

    const normalized = {
      ...canonicalParsed,
      schema_version: canonicalParsed.schema_version ?? '1.1',
      work_item_id: canonicalParsed.work_item_id ?? workItemId,
      workflow_path: canonicalParsed.workflow_path ?? workflowPath,
      entries,
    };

    if (normalized.workflow_path === 'code_only_fast_path') {
      normalized.merge_applicable = false;
      normalized.merge_required = false;
      normalized.reason = normalized.reason ?? 'code_only_fast_path: no spec-level candidate products';
    }

    return JSON.stringify(normalized, null, 2);
  }

  if (filename === 'evidence_manifest.json') {
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries
      : Array.isArray(parsed.evidence_items)
        ? parsed.evidence_items
        : Array.isArray(parsed.evidence)
          ? parsed.evidence
          : [];
    const normalized = {
      ...parsed,
      schema_version: parsed.schema_version ?? '1.1',
      work_item_id: parsed.work_item_id ?? workItemId,
      entries,
    };
    delete normalized.evidence_items;
    delete normalized.evidence;
    return JSON.stringify(normalized, null, 2);
  }

  return content;
}

function isExecutorLike(context: any): boolean {
  const agent = String(context?.agent ?? '').toLowerCase();
  return agent.includes('executor');
}

const EXECUTOR_FORBIDDEN_ARTIFACT_TYPES = new Set([
  'work_item',
  'work_item.json',
  'intake',
  'change_classification',
  'impact_analysis',
  'trigger_result',
  'requirements',
  'design',
  'requirements_delta',
  'design_delta',
  'tasks',
  'trace_delta',
  'candidate_manifest',
  'merge_report',
  'verification_report',
  'evidence_manifest',
  'candidate_requirements',
  'candidate_design',
  'candidate_tasks',
  'candidate_trace_delta',
]);

function rejectExecutorGovernanceArtifact(fileType: string, context: any): any | null {
  if (!isExecutorLike(context)) return null;
  if (!EXECUTOR_FORBIDDEN_ARTIFACT_TYPES.has(String(fileType ?? ''))) return null;
  return {
    success: false,
    error: 'EXECUTOR_CANNOT_WRITE_GOVERNANCE_ARTIFACTS',
    hard_stop: false,
    policy_violation: true,
    retry_allowed: true,
    file_type: fileType,
    message:
      'sf-executor must return a task report to the orchestrator. Governance artifacts under .specforge/work-items must be written by orchestrator/verifier/planner through controlled tools.',
  };
}

registerHandler('sf_artifact_write', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  let fileType = args['file_type'] as string;
  let content = stringifyArtifactContent(args['content'], args['agent_content']);

  const initialExecutorRejection = rejectExecutorGovernanceArtifact(fileType, context);
  if (initialExecutorRejection) return initialExecutorRejection;

  const idError = validateWorkItemId(workItemId);
  if (idError) return { success: false, error: idError, hard_stop: false, retry_allowed: true };

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

  const inferredExecutorRejection = rejectExecutorGovernanceArtifact(fileType, context);
  if (inferredExecutorRejection) return inferredExecutorRejection;

  const targetFilename = resolveTargetFilename(fileType);

  if (!targetFilename && String(args['file_type']) === 'work_log') {
    return writeArtifact(
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
    return writeArtifact(
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
    content = normalizeCoreJsonArtifact(targetFilename, content, workItemId, baseDir);
    let workflowPath: string | undefined;
    try {
      const facts = inferWorkflowFacts(baseDir, workItemId, JSON.parse(content));
      workflowPath = facts.workflowPath;
    } catch {
      // non-critical; validator can still validate with artifact content.
    }

    const validation = validateArtifactJson(targetFilename, content, workItemId, workflowPath);
    if (validation && !validation.valid) {
      return {
        success: false,
        error: 'INVALID_ARTIFACT_JSON',
        hard_stop: false,
        retry_allowed: true,
        validation_errors: validation.errors,
        message: `Artifact "${targetFilename}" failed schema validation and was NOT written to disk.\nCorrect the JSON and retry.`,
        normalized_content_preview: content.slice(0, 2000),
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
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  try {
    fs.writeFileSync(targetPath, content, 'utf-8');
    mirrorSpecCandidateArtifacts(baseDir, workItemId, targetFilename, content, targetPath);
    const size = Buffer.byteLength(content, 'utf-8');
    const relativePath = path.relative(baseDir, targetPath).replace(/\\/g, '/');
    return {
      success: true,
      path: relativePath,
      size,
      file_type: fileType,
      controlled_artifact: true,
      normalized: isJsonArtifact(targetFilename),
    };
  } catch (err: any) {
    setHardStop(baseDir, workItemId, `ARTIFACT_WRITE_FAILED: ${err.message}`, 'sf_artifact_write');
    return { success: false, error: `ARTIFACT_WRITE_FAILED: ${err.message}`, hard_stop: true };
  }
});
