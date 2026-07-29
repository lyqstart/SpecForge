/**
 * sf-artifact-write.ts — v1.1 Controlled Artifact Writer
 *
 * V11.2:
 * - Normalize core JSON artifact schemas before validation.
 * - Candidate paths are canonicalized for candidate_manifest.json.
 * - executor-like agents cannot write governed artifacts.
 * - Professional Candidate artifacts are writable only by their owning agent.
 */
import path from 'path';
import * as fs from 'node:fs';
import { registerHandler } from '../ToolDispatcher';
import { renderVerificationReport, writeArtifact } from '../lib/sf_artifact_write_core';
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';
import {
  validateArtifactJson,
  findForbiddenWorkItemDecisionFields,
} from '../lib/artifact-schema-validation';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import {
  SPEC_DIR_NAME,
  moduleDesign,
  moduleRequirements,
  projectSpecManifest,
  workItemCandidateDesign,
  workItemCandidateRequirements,
  workItemCandidateTasks,
  workItemCandidateTraceDelta,
  workItemRoot,
} from '@specforge/types/directory-layout';
import {
  moduleCodeFromProjectSpecPath,
  normalizeModuleCodeReference,
  resolveSpecModuleIdentity,
} from '@specforge/types';
import { inferManifestEntries } from '../lib/governance-invariants-v11';
import { readAuthoritativeState } from '../lib/state-coordinator-v11';
import { isCandidateFrozenState, isCandidateGovernancePath } from '../lib/candidate-freeze-v11';
import { validateTaskArtifactContract } from '../lib/sf_markdown_verification_parser';
import {
  readDeclaredDesignAnalysisScope,
  resolveSystemGovernanceRequirement,
} from '../lib/sf_design_governance_policy';
const V11_WI_ARTIFACT_FILES = new Set([
  'work_item.json',
  'intake.md',
  'change_classification.md',
  'impact_analysis.md',
  'trigger_result.json',
  'investigation_plan.md',
  'findings_report.md',
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
  'investigation_plan.md': 'investigation_plan',
  'findings_report.md': 'findings_report',
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
  Object.entries(V11_FILENAME_MAP).map(([filename, fileType]) => [fileType, filename])
);

function normalizeModuleId(value: unknown): string {
  return moduleCodeFromProjectSpecPath(value) ?? normalizeModuleCodeReference(value) ?? '';
}
function readFrontMatterField(content: string, names: string[]): string | undefined {
  const text = String(content ?? '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return undefined;
  const frontMatter = match[1];
  const lines = frontMatter.split(/\r?\n/);
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    if (!names.includes(key)) continue;
    const raw =
      line
        .slice(colon + 1)
        .split('#')[0]
        ?.trim() ?? '';
    const value = raw.replace(/^['"]|['"]$/g, '').trim();
    if (value) return value;
  }
  return undefined;
}
function readExplicitModuleReference(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as unknown;
    const identity = resolveSpecModuleIdentity(parsed);
    if (identity.valid && identity.moduleCode) return identity.moduleCode;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const ownerModule = normalizeModuleId((parsed as Record<string, unknown>).owner_module);
      if (ownerModule) return ownerModule;
    }
  } catch {
    // Markdown Candidates use front matter instead of JSON.
  }
  return readFrontMatterField(content, [
    'target_module_path',
    'module_id',
    'module_code',
    'module',
    'owner_module',
  ]);
}
type ModuleOwnership = { declared: string[]; defaultModule: string | null; errors: string[] };
function readModuleOwnership(baseDir: string): ModuleOwnership {
  const manifest = readJsonIfExists(projectSpecManifest(baseDir));
  const modules = Array.isArray(manifest?.modules) ? manifest.modules : [];
  const resolutions = modules.map(entry => resolveSpecModuleIdentity(entry));
  const declared = resolutions
    .filter(resolution => resolution.valid && resolution.moduleCode)
    .map(resolution => resolution.moduleCode as string);
  const errors = resolutions.flatMap(resolution => resolution.errors);
  const defaultModuleRaw = manifest?.default_module ?? manifest?.defaultModule;
  const defaultModule = defaultModuleRaw ? normalizeModuleId(defaultModuleRaw) : null;
  if (defaultModuleRaw && !defaultModule) {
    errors.push(`Invalid default_module: ${String(defaultModuleRaw)}`);
  }
  return { declared: Array.from(new Set(declared)), defaultModule, errors };
}
function isGovernedModuleAdmission(baseDir: string, workItemId: string): boolean {
  const wiDir = workItemRoot(baseDir, workItemId);
  const workItem = readJsonIfExists(path.join(wiDir, 'work_item.json'));
  const workflowPath = String(workItem?.workflow_path ?? '');
  if (workflowPath === 'architecture_change_path' || workflowPath === 'spec_migration_path') {
    return true;
  }
  if (workflowPath !== 'requirement_change_path') return false;
  const trigger = readJsonIfExists(path.join(wiDir, 'trigger_result.json'));
  return (
    trigger?.classification &&
    typeof trigger.classification === 'object' &&
    !Array.isArray(trigger.classification) &&
    (((trigger.classification as Record<string, unknown>).architecture_changed === true) ||
      ((trigger.classification as Record<string, unknown>).module_boundary_changed === true))
  );
}
export function resolveDeclaredCandidateModuleId(
  content: string,
  baseDir: string,
  workItemId: string,
  explicitModuleReference?: unknown
): {
  moduleId?: string;
  error?: string;
  declared: string[];
} {
  const ownership = readModuleOwnership(baseDir);
  if (ownership.errors.length > 0) {
    return {
      declared: ownership.declared,
      error: `MODULE_REGISTRY_INVALID: ${ownership.errors.join('; ')}`,
    };
  }
  const contentExplicit = readExplicitModuleReference(content);
  const argumentProvided =
    explicitModuleReference !== undefined &&
    explicitModuleReference !== null &&
    String(explicitModuleReference).trim().length > 0;
  const argumentExplicit = argumentProvided ? normalizeModuleId(explicitModuleReference) : '';
  if (argumentProvided && !argumentExplicit) {
    return {
      declared: ownership.declared,
      error: `MODULE_REFERENCE_INVALID: module_id "${String(explicitModuleReference)}" is invalid.`,
    };
  }
  const contentModule = contentExplicit ? normalizeModuleId(contentExplicit) : '';
  if (argumentExplicit && contentModule && argumentExplicit !== contentModule) {
    return {
      declared: ownership.declared,
      error: `MODULE_REFERENCE_CONFLICT: args.module_id=${argumentExplicit}, content=${contentModule}`,
    };
  }
  const explicit = argumentExplicit || contentModule;
  const requested = explicit
    ? explicit
    : (ownership.defaultModule ?? (ownership.declared.length === 1 ? ownership.declared[0] : ''));
  const governedModuleAdmission = isGovernedModuleAdmission(baseDir, workItemId);
  if (ownership.declared.length === 0) {
    if (governedModuleAdmission && explicit && requested) {
      return { moduleId: requested, declared: [] };
    }
    return {
      declared: [],
      error:
        'MODULE_OWNERSHIP_UNRESOLVED: spec_manifest.json declares no modules. ' +
        'Do not silently fall back to core. Initialize a new project with sf_project_init or establish module ownership through the governed Project Spec flow.',
    };
  }
  if (!requested) {
    return {
      declared: ownership.declared,
      error:
        'MODULE_OWNERSHIP_AMBIGUOUS: multiple modules are declared and the Candidate does not specify module_id/target_module_path.',
    };
  }
  if (!ownership.declared.includes(requested)) {
    if (governedModuleAdmission && explicit) {
      return { moduleId: requested, declared: ownership.declared };
    }
    return {
      declared: ownership.declared,
      error: `MODULE_NOT_DECLARED: module "${requested}" is not declared in spec_manifest.json. Declared modules: ${ownership.declared.join(', ')}`,
    };
  }
  return { moduleId: requested, declared: ownership.declared };
}
function inferCandidateModuleIdFromEntry(entry: any, candidatePath?: string): string {
  const explicit =
    entry?.module_id ??
    entry?.module ??
    entry?.target_module_path ??
    entry?.modulePath ??
    entry?.module_path;
  if (explicit) return normalizeModuleId(explicit);

  const candidates = [
    normalizeCandidatePath(entry?.target_path),
    normalizeCandidatePath(entry?.candidate_path),
    normalizeCandidatePath(entry?.path),
    normalizeCandidatePath(candidatePath),
  ];
  for (const candidate of candidates) {
    const projectMatch = /(?:^|\/)(?:\.specforge\/project\/)?modules\/([^/]+)\//.exec(candidate);
    if (projectMatch?.[1]) return normalizeModuleId(projectMatch[1]);
    const stagingMatch = /(?:^|\/)candidates\/project\/modules\/([^/]+)\//.exec(candidate);
    if (stagingMatch?.[1]) return normalizeModuleId(stagingMatch[1]);
  }

  return 'CORE';
}
function toWorkItemRelativePath(baseDir: string, workItemId: string, absolutePath: string): string {
  return path.relative(workItemRoot(baseDir, workItemId), absolutePath).replace(/\\/g, '/');
}
function candidateModuleRelativePath(
  baseDir: string,
  workItemId: string,
  moduleId: string,
  kind: 'requirements' | 'design'
): string {
  const absolutePath =
    kind === 'requirements'
      ? workItemCandidateRequirements(baseDir, workItemId, normalizeModuleId(moduleId))
      : workItemCandidateDesign(baseDir, workItemId, normalizeModuleId(moduleId));
  return toWorkItemRelativePath(baseDir, workItemId, absolutePath);
}
function projectModuleTargetPath(
  baseDir: string,
  moduleId: string,
  kind: 'requirements' | 'design'
): string {
  const manifest = readJsonIfExists(projectSpecManifest(baseDir));
  const modules = Array.isArray(manifest?.modules) ? manifest.modules : [];
  for (const entry of modules) {
    const identity = resolveSpecModuleIdentity(entry);
    if (!identity.valid || identity.moduleCode !== normalizeModuleId(moduleId)) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const configured =
      kind === 'requirements'
        ? (record.requirements ?? record.requirements_file)
        : (record.design ?? record.design_file);
    if (typeof configured === 'string' && configured.trim()) {
      const normalized = configured.trim().replace(/\\/g, '/').replace(/^\.\//, '');
      if (normalized.startsWith('.specforge/project/')) return normalized;
      if (normalized.startsWith('project/')) return `.specforge/${normalized}`;
    }
  }
  const absolutePath =
    kind === 'requirements'
      ? moduleRequirements(baseDir, normalizeModuleId(moduleId))
      : moduleDesign(baseDir, normalizeModuleId(moduleId));
  return path.relative(baseDir, absolutePath).replace(/\\/g, '/');
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
  if (probe.includes('trigger-result') || probe.includes('trigger-result-json'))
    return 'trigger_result';
  if (probe.includes('candidate-manifest') || probe.includes('candidate-manifest-json'))
    return 'candidate_manifest';
  if (probe.includes('trace-delta')) return 'trace_delta';
  if (probe.includes('impact-analysis')) return 'impact_analysis';
  if (probe.includes('change-classification') || probe.includes('intake-classification'))
    return 'change_classification';
  if (probe.includes('tasks-md') || probe.includes('task-plan') || probe.includes('task-planning'))
    return 'tasks';
  if (probe.includes('merge-report')) return 'merge_report';
  if (probe.includes('evidence-manifest')) return 'evidence_manifest';
  return null;
}
function resolveTargetFilename(
  fileType: string,
  content: string,
  baseDir: string,
  workItemId: string,
  candidateModuleId?: string
): string | null {
  const moduleId = candidateModuleId ?? 'CORE';
  if (fileType === 'candidate_architecture') {
    return 'candidates/project/architecture.candidate.md';
  }
  if (fileType === 'candidate_data_model') {
    return 'candidates/project/data_model.candidate.md';
  }
  if (fileType === 'requirements' || fileType === 'candidate_requirements') {
    return candidateModuleRelativePath(baseDir, workItemId, moduleId, 'requirements');
  }
  if (fileType === 'design' || fileType === 'candidate_design') {
    return candidateModuleRelativePath(baseDir, workItemId, moduleId, 'design');
  }
  if (fileType === 'candidate_module_definition') {
    return `candidates/project/modules/${moduleId}/module.candidate.json`;
  }
  if (fileType === 'candidate_module_contract') {
    return `candidates/project/modules/${moduleId}/contracts.candidate.json`;
  }
  if (fileType === 'candidate_module_trace') {
    return `candidates/project/modules/${moduleId}/trace.candidate.md`;
  }
  if (fileType === 'tasks' || fileType === 'candidate_tasks') {
    return toWorkItemRelativePath(baseDir, workItemId, workItemCandidateTasks(baseDir, workItemId));
  }
  if (fileType === 'trace_delta' || fileType === 'candidate_trace_delta') {
    return toWorkItemRelativePath(
      baseDir,
      workItemId,
      workItemCandidateTraceDelta(baseDir, workItemId)
    );
  }
  if (fileType === 'requirements_delta') return 'requirements_delta.md';
  if (fileType === 'design_delta') return 'design_delta.md';
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
  const existingMetadata = { ...existing };
  delete existingMetadata.status;
  delete existingMetadata.work_item_status_mutation_forbidden;
  const normalized = {
    ...existingMetadata,
    ...input.parsed,
    schema_version: input.parsed.schema_version ?? existing.schema_version ?? '1.1',
    work_item_id: input.parsed.work_item_id ?? existing.work_item_id ?? input.workItemId,
    workflow_type:
      input.parsed.workflow_type ?? existing.workflow_type ?? input.workflowType ?? 'quick_change',
    workflow_path: input.parsed.workflow_path ?? existing.workflow_path ?? input.workflowPath,
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
function normalizeTriggerResultUnknowns(parsed: Record<string, unknown>): Record<string, unknown> {
  const classification =
    typeof parsed.classification === 'object' &&
    parsed.classification !== null &&
    !Array.isArray(parsed.classification)
      ? { ...(parsed.classification as Record<string, unknown>) }
      : parsed.classification;
  const topLevelUnknowns = parsed.unknowns;
  const classificationUnknowns =
    classification && typeof classification === 'object' && !Array.isArray(classification)
      ? (classification as Record<string, unknown>).unknowns
      : undefined;
  if (topLevelUnknowns !== undefined && !Array.isArray(topLevelUnknowns)) {
    throw new Error('TRIGGER_RESULT_TOP_LEVEL_UNKNOWNS_MUST_BE_ARRAY');
  }
  if (classificationUnknowns !== undefined && !Array.isArray(classificationUnknowns)) {
    throw new Error('TRIGGER_RESULT_CLASSIFICATION_UNKNOWNS_MUST_BE_ARRAY');
  }
  if (
    Array.isArray(topLevelUnknowns) &&
    Array.isArray(classificationUnknowns) &&
    JSON.stringify(topLevelUnknowns) !== JSON.stringify(classificationUnknowns)
  ) {
    throw new Error('TRIGGER_RESULT_UNKNOWNS_CONFLICT');
  }
  const canonicalUnknowns = Array.isArray(classificationUnknowns)
    ? classificationUnknowns
    : Array.isArray(topLevelUnknowns)
      ? topLevelUnknowns
      : [];
  const withoutTopLevelUnknowns = { ...parsed };
  delete withoutTopLevelUnknowns.unknowns;
  return {
    ...withoutTopLevelUnknowns,
    classification:
      classification && typeof classification === 'object' && !Array.isArray(classification)
        ? {
            ...(classification as Record<string, unknown>),
            unknowns: canonicalUnknowns,
          }
        : classification,
  };
}
function inferWorkflowFacts(
  baseDir: string,
  workItemId: string,
  contentJson?: Record<string, unknown>
): { workflowPath?: string; workflowType?: string } {
  const wiDir = workItemRoot(baseDir, workItemId);
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
function canonicalCandidatePathByType(
  entry: any,
  candidatePath: string,
  baseDir: string,
  workItemId: string
): string | null {
  const candidateType = String(entry?.type ?? entry?.spec_type ?? '').toLowerCase();
  const targetPath = normalizeCandidatePath(entry?.target_path);
  const normalizedPath = normalizeCandidatePath(candidatePath);
  const moduleId = inferCandidateModuleIdFromEntry(entry, normalizedPath);
  if (
    candidateType === 'architecture' ||
    normalizedPath === 'candidates/project/architecture.candidate.md' ||
    normalizedPath.endsWith('/architecture.candidate.md') ||
    targetPath === '.specforge/project/architecture.md'
  ) {
    return 'candidates/project/architecture.candidate.md';
  }
  if (
    candidateType === 'data_model' ||
    normalizedPath === 'candidates/project/data_model.candidate.md' ||
    normalizedPath.endsWith('/data_model.candidate.md') ||
    targetPath === '.specforge/project/data_model.md'
  ) {
    return 'candidates/project/data_model.candidate.md';
  }
  if (
    candidateType === 'module_definition' ||
    normalizedPath.endsWith('/module.candidate.json') ||
    targetPath.endsWith('/module.json')
  ) {
    return `candidates/project/modules/${moduleId}/module.candidate.json`;
  }

  if (
    candidateType === 'module_contract' ||
    normalizedPath.endsWith('/contracts.candidate.json') ||
    targetPath.endsWith(`/modules/${moduleId}/contracts.json`)
  ) {
    return `candidates/project/modules/${moduleId}/contracts.candidate.json`;
  }

  if (
    candidateType === 'module_trace' ||
    normalizedPath.endsWith('/trace.candidate.md') ||
    targetPath.endsWith(`/modules/${moduleId}/trace.md`)
  ) {
    return `candidates/project/modules/${moduleId}/trace.candidate.md`;
  }
  if (
    candidateType === 'requirements' ||
    candidateType === 'requirement' ||
    normalizedPath === 'requirements.md' ||
    normalizedPath === 'candidates/requirements.md' ||
    normalizedPath.endsWith('/requirements.md') ||
    normalizedPath.endsWith('/requirements.candidate.md') ||
    targetPath.endsWith('/requirements.md')
  ) {
    return candidateModuleRelativePath(baseDir, workItemId, moduleId, 'requirements');
  }
  if (
    candidateType === 'design' ||
    normalizedPath === 'design.md' ||
    normalizedPath === 'candidates/design.md' ||
    normalizedPath.endsWith('/design.md') ||
    normalizedPath.endsWith('/design.candidate.md') ||
    targetPath.endsWith('/design.md')
  ) {
    return candidateModuleRelativePath(baseDir, workItemId, moduleId, 'design');
  }
  if (
    candidateType === 'tasks' ||
    candidateType === 'task' ||
    normalizedPath === 'tasks.md' ||
    normalizedPath.endsWith('/tasks.md') ||
    targetPath.endsWith('/tasks.md')
  ) {
    return toWorkItemRelativePath(baseDir, workItemId, workItemCandidateTasks(baseDir, workItemId));
  }
  if (
    candidateType === 'trace' ||
    candidateType === 'trace_delta' ||
    normalizedPath === 'trace_delta.md' ||
    normalizedPath.endsWith('/trace_delta.md') ||
    targetPath === '.specforge/project/trace_matrix.md' ||
    targetPath.endsWith('/trace_matrix.md')
  ) {
    return toWorkItemRelativePath(
      baseDir,
      workItemId,
      workItemCandidateTraceDelta(baseDir, workItemId)
    );
  }

  return null;
}
function validateCandidateManifestModuleOwnership(
  parsed: Record<string, unknown>,
  baseDir: string,
  workItemId: string
): void {
  const ownership = readModuleOwnership(baseDir);
  if (ownership.errors.length > 0) {
    throw new Error(`MODULE_REGISTRY_INVALID: ${ownership.errors.join('; ')}`);
  }
  const governedModuleAdmission = isGovernedModuleAdmission(baseDir, workItemId);
  const rawEntries = [
    ...(Array.isArray((parsed as any).entries) ? (parsed as any).entries : []),
    ...(Array.isArray((parsed as any).candidates) ? (parsed as any).candidates : []),
  ];
  for (const entry of rawEntries) {
    const candidatePath = normalizeCandidatePath(entry?.candidate_path ?? entry?.path);
    const targetPath = normalizeCandidatePath(entry?.target_path);
    const moduleMatch =
      /(?:^|\/)candidates\/project\/modules\/([^/]+)\/(?:module\.candidate\.json|requirements\.candidate\.md|design\.candidate\.md|contracts\.candidate\.json|trace\.candidate\.md)$/i.exec(
        candidatePath
      ) ??
      /(?:^|\/)\.specforge\/project\/modules\/([^/]+)\/(?:module\.json|requirements\.md|design\.md|contracts\.json|trace\.md)$/i.exec(
        targetPath
      );
    if (!moduleMatch?.[1]) continue;
    const moduleId = normalizeModuleId(moduleMatch[1]);
    if (ownership.declared.length === 0) {
      if (governedModuleAdmission && moduleId) continue;
      throw new Error(
        'MODULE_OWNERSHIP_UNRESOLVED: candidate_manifest references a module-scoped Candidate, but spec_manifest.json declares no modules.'
      );
    }
    if (!ownership.declared.includes(moduleId)) {
      if (governedModuleAdmission && moduleId) continue;
      throw new Error(
        `MODULE_NOT_DECLARED: candidate_manifest references module "${moduleId}", but declared modules are: ${ownership.declared.join(', ')}`
      );
    }
  }
}
function canonicalizeCandidateEntry(entry: any, baseDir: string, workItemId: string): any {
  if (!entry || typeof entry !== 'object') return entry;
  const candidatePath = normalizeCandidatePath(entry.candidate_path ?? entry.path);
  const canonicalPath = canonicalCandidatePathByType(entry, candidatePath, baseDir, workItemId);
  const normalizedEntry = { ...entry };
  // `path` is a legacy input alias only. Persist one canonical field so Writer,
  // Gate, approval and Merge compare the same object.
  normalizedEntry.candidate_path = canonicalPath ?? candidatePath;
  delete normalizedEntry.path;
  normalizedEntry.operation = normalizedEntry.operation ?? 'replace';

  if (!canonicalPath) return normalizedEntry;

  const moduleId = inferCandidateModuleIdFromEntry(entry, candidatePath);
  const candidateType = String(
    normalizedEntry.type ?? normalizedEntry.spec_type ?? ''
  ).toLowerCase();
  if (candidateType === 'architecture') {
    normalizedEntry.target_path = '.specforge/project/architecture.md';
  }
  if (candidateType === 'data_model') {
    normalizedEntry.target_path = '.specforge/project/data_model.md';
  }
  if (candidateType === 'module_definition') {
    normalizedEntry.target_path = `.specforge/project/modules/${moduleId}/module.json`;
  }
  if (candidateType === 'requirements' || candidateType === 'requirement') {
    normalizedEntry.target_path = projectModuleTargetPath(baseDir, moduleId, 'requirements');
  }
  if (candidateType === 'design') {
    normalizedEntry.target_path = projectModuleTargetPath(baseDir, moduleId, 'design');
  }
  if (candidateType === 'module_contract') {
    normalizedEntry.target_path = `.specforge/project/modules/${moduleId}/contracts.json`;
  }
  if (candidateType === 'module_trace') {
    normalizedEntry.target_path = `.specforge/project/modules/${moduleId}/trace.md`;
  }
  if (
    !normalizedEntry.module_id &&
    (candidateType === 'requirements' ||
      candidateType === 'requirement' ||
      candidateType === 'design' ||
      candidateType === 'module_definition' ||
      candidateType === 'module_contract' ||
      candidateType === 'module_trace')
  ) {
    normalizedEntry.module_id = moduleId;
  }
  return normalizedEntry;
}
function augmentGovernanceCandidateEntries(entries: any[], workItemDir: string): any[] {
  const augmented = [...entries];
  const seenCandidates = new Set(
    augmented.map(entry => normalizeCandidatePath(entry?.candidate_path ?? entry?.path)).filter(Boolean)
  );
  const seenTargets = new Set(
    augmented.map(entry => normalizeCandidatePath(entry?.target_path)).filter(Boolean)
  );
  const appendIfPresent = (
    candidatePath: string,
    targetPath: string,
    type: string,
    moduleId?: string
  ): void => {
    const absolutePath = path.join(workItemDir, candidatePath);
    if (!fs.existsSync(absolutePath)) return;
    if (seenCandidates.has(candidatePath) || seenTargets.has(targetPath)) return;
    const entry: Record<string, unknown> = {
      candidate_path: candidatePath,
      target_path: targetPath,
      operation: 'replace',
      type,
      inferred: true,
      normalized: true,
    };
    if (moduleId) entry.module_id = moduleId;
    augmented.push(entry);
    seenCandidates.add(candidatePath);
    seenTargets.add(targetPath);
  };

  appendIfPresent(
    'candidates/project/architecture.candidate.md',
    '.specforge/project/architecture.md',
    'architecture'
  );
  appendIfPresent(
    'candidates/project/data_model.candidate.md',
    '.specforge/project/data_model.md',
    'data_model'
  );

  const modulesRoot = path.join(workItemDir, 'candidates', 'project', 'modules');
  try {
    for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const moduleId = normalizeModuleId(entry.name);
      if (!moduleId) continue;
      const root = `candidates/project/modules/${moduleId}`;
      const targetRoot = `.specforge/project/modules/${moduleId}`;
      appendIfPresent(`${root}/module.candidate.json`, `${targetRoot}/module.json`, 'module_definition', moduleId);
      appendIfPresent(`${root}/requirements.candidate.md`, `${targetRoot}/requirements.md`, 'requirements', moduleId);
      appendIfPresent(`${root}/design.candidate.md`, `${targetRoot}/design.md`, 'design', moduleId);
      appendIfPresent(`${root}/contracts.candidate.json`, `${targetRoot}/contracts.json`, 'module_contract', moduleId);
      appendIfPresent(`${root}/trace.candidate.md`, `${targetRoot}/trace.md`, 'module_trace', moduleId);
    }
  } catch {
    // No module Candidates have been produced yet.
  }

  return augmented;
}

function isEvidenceOnlyNoProjectSpecChange(value: Record<string, unknown>): boolean {
  return (
    value.no_project_spec_change === true ||
    String(value.project_integration_effect ?? '')
      .trim()
      .toLowerCase() === 'evidence_only'
  );
}

function normalizeCoreJsonArtifact(
  filename: string,
  content: string,
  workItemId: string,
  baseDir: string
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
    const canonical = normalizeTriggerResultUnknowns(parsed as Record<string, unknown>);
    return JSON.stringify(
      {
        ...canonical,
        schema_version: canonical.schema_version ?? '1.1',
        work_item_id: canonical.work_item_id ?? workItemId,
        workflow_path: canonical.workflow_path ?? workflowPath,
        workflow_type: canonical.workflow_type ?? workflowType,
        status: canonical.status ?? 'triggered',
      },
      null,
      2
    );
  }
  if (filename === 'candidate_manifest.json') {
    validateCandidateManifestModuleOwnership(
      parsed as Record<string, unknown>,
      baseDir,
      workItemId
    );
    const wiDir = workItemRoot(baseDir, workItemId);
    const canonicalParsed: Record<string, unknown> = {
      ...(parsed as Record<string, unknown>),
    };
    if (Array.isArray(parsed.candidates)) {
      canonicalParsed.candidates = parsed.candidates.map((entry: any) =>
        canonicalizeCandidateEntry(entry, baseDir, workItemId)
      );
    }
    if (Array.isArray(parsed.entries)) {
      canonicalParsed.entries = parsed.entries.map((entry: any) =>
        canonicalizeCandidateEntry(entry, baseDir, workItemId)
      );
    }
    validateCandidateManifestModuleOwnership(canonicalParsed, baseDir, workItemId);
    const normalizedWorkflowPath = canonicalParsed.workflow_path ?? workflowPath;
    const evidenceOnly = isEvidenceOnlyNoProjectSpecChange(canonicalParsed);
    if (evidenceOnly || normalizedWorkflowPath === 'code_only_fast_path') {
      const normalized: Record<string, unknown> = {
        ...canonicalParsed,
        schema_version: canonicalParsed.schema_version ?? '1.1',
        work_item_id: canonicalParsed.work_item_id ?? workItemId,
        workflow_path: normalizedWorkflowPath,
        merge_applicable: false,
        merge_required: false,
        entries: [],
      };
      delete normalized.candidates;
      delete normalized.candidate_artifacts;
      if (evidenceOnly) {
        normalized.no_project_spec_change = true;
        normalized.project_integration_effect = 'evidence_only';
        normalized.reason =
          normalized.reason ??
          'evidence_only: Work Item artifacts remain evidence and are not merged into Project Spec';
      } else {
        normalized.reason =
          normalized.reason ?? 'code_only_fast_path: no spec-level candidate products';
      }

      return JSON.stringify(normalized, null, 2);
    }
    const preliminary = {
      ...canonicalParsed,
      workflow_path: normalizedWorkflowPath,
    };
    const rawEntries =
      Array.isArray(canonicalParsed.entries) && canonicalParsed.entries.length > 0
        ? canonicalParsed.entries
        : inferManifestEntries(preliminary, wiDir);
    const entries = Array.isArray(rawEntries)
      ? augmentGovernanceCandidateEntries(rawEntries, wiDir).map((entry: any) =>
          canonicalizeCandidateEntry(entry, baseDir, workItemId)
        )
      : rawEntries;
    const normalized: Record<string, unknown> = {
      ...canonicalParsed,
      schema_version: canonicalParsed.schema_version ?? '1.1',
      work_item_id: canonicalParsed.work_item_id ?? workItemId,
      workflow_path: normalizedWorkflowPath,
      entries,
    };

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

function normalizeAgentName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

function isExecutorLike(context: any): boolean {
  return normalizeAgentName(context?.agent).includes('executor');
}
const PROFESSIONAL_ARTIFACT_OWNERS = new Map<string, string>([
  ['requirements', 'sf-requirements'],
  ['candidate_requirements', 'sf-requirements'],
  ['requirements_delta', 'sf-requirements'],
  ['design', 'sf-design'],
  ['candidate_design', 'sf-design'],
  ['design_delta', 'sf-design'],
  ['candidate_architecture', 'sf-design'],
  ['candidate_data_model', 'sf-design'],
  ['candidate_module_definition', 'sf-design'],
  ['candidate_module_contract', 'sf-design'],
  ['tasks', 'sf-task-planner'],
  ['candidate_tasks', 'sf-task-planner'],
  ['trace_delta', 'sf-task-planner'],
  ['candidate_trace_delta', 'sf-task-planner'],
  ['candidate_module_trace', 'sf-task-planner'],
  ['investigation_plan', 'sf-investigator'],
  ['findings_report', 'sf-investigator'],
  ['verification_report', 'sf-verifier'],
  ['evidence_manifest', 'sf-verifier'],
]);
const VERIFICATION_INPUT_ARTIFACT_TYPES = new Set(['verification_report', 'evidence_manifest']);

function rejectProfessionalArtifactOwnership(fileType: string, context: any): any | null {
  const requiredAgent = PROFESSIONAL_ARTIFACT_OWNERS.get(String(fileType ?? ''));
  if (!requiredAgent) return null;

  const callerAgent = normalizeAgentName(context?.agent) || 'unknown';
  if (callerAgent === requiredAgent) return null;
  return {
    success: false,
    error: 'ARTIFACT_OWNER_MISMATCH',
    hard_stop: false,
    policy_violation: true,
    retry_allowed: true,
    file_type: fileType,
    caller_agent: callerAgent,
    required_agent: requiredAgent,
    message:
      `Artifact type "${fileType}" is owned by ${requiredAgent}. ` +
      'sf-orchestrator must re-dispatch the owning professional agent instead of writing the artifact itself.',
  };
}
const EXECUTOR_FORBIDDEN_ARTIFACT_TYPES = new Set([
  'work_item',
  'work_item.json',
  'intake',
  'change_classification',
  'impact_analysis',
  'trigger_result',
  'investigation_plan',
  'findings_report',
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
  'candidate_architecture',
  'candidate_data_model',
  'candidate_design',
  'candidate_module_definition',
  'candidate_module_contract',
  'candidate_tasks',
  'candidate_trace_delta',
  'candidate_module_trace',
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
registerHandler('sf_artifact_write', async (args, context, deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  let fileType = args['file_type'] as string;
  let content = stringifyArtifactContent(args['content'], args['agent_content']);

  const initialExecutorRejection = rejectExecutorGovernanceArtifact(fileType, context);
  if (initialExecutorRejection) return initialExecutorRejection;
  const initialOwnershipRejection = rejectProfessionalArtifactOwnership(fileType, context);
  if (initialOwnershipRejection) return initialOwnershipRejection;

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

  const inferred = inferCanonicalFileType(args);
  if (inferred) fileType = inferred;

  const inferredExecutorRejection = rejectExecutorGovernanceArtifact(fileType, context);
  if (inferredExecutorRejection) return inferredExecutorRejection;
  const inferredOwnershipRejection = rejectProfessionalArtifactOwnership(fileType, context);
  if (inferredOwnershipRejection) return inferredOwnershipRejection;
  if (VERIFICATION_INPUT_ARTIFACT_TYPES.has(fileType)) {
    const state = await readAuthoritativeState({
      deps,
      projectRoot: baseDir,
      workItemId,
    });
    if (
      ['verification_done', 'closed', 'rejected', 'superseded'].includes(
        String(state.current_state ?? '')
      )
    ) {
      return {
        success: false,
        error: 'VERIFICATION_INPUTS_FROZEN',
        hard_stop: false,
        retry_allowed: false,
        current_state: state.current_state,
        state_authority: state.source,
        message:
          'verification_report and evidence_manifest are frozen after verification_gate passes. ' +
          'Recover to implementation_ready before changing verification evidence, then regenerate semantic closure and rerun verification_gate.',
      };
    }
  }
  if (fileType === 'verification_report' && args['template'] !== 'verification_report') {
    return {
      success: false,
      error: 'VERIFICATION_REPORT_TEMPLATE_REQUIRED',
      hard_stop: false,
      retry_allowed: true,
      message:
        'verification_report must use template=verification_report with the structured Verification JSON contract.',
    };
  }
  if (fileType === 'verification_report' && args['template'] === 'verification_report') {
    const rendered = renderVerificationReport(content);
    if (rendered === null) {
      return {
        success: false,
        error: 'INVALID_VERIFICATION_REPORT_JSON',
        hard_stop: false,
        retry_allowed: true,
        message:
          'template=verification_report requires a JSON object with conclusion and structured verification fields.',
      };
    }
    content = rendered;
  }
  let candidateModuleId: string | undefined;
  if (
    fileType === 'requirements' ||
    fileType === 'candidate_requirements' ||
    fileType === 'design' ||
    fileType === 'candidate_design' ||
    fileType === 'candidate_module_definition' ||
    fileType === 'candidate_module_contract' ||
    fileType === 'candidate_module_trace'
  ) {
    const moduleResolution = resolveDeclaredCandidateModuleId(
      content,
      baseDir,
      workItemId,
      args['module_id']
    );
    if (!moduleResolution.moduleId) {
      return {
        success: false,
        error: moduleResolution.error,
        hard_stop: false,
        retry_allowed: true,
        declared_modules: moduleResolution.declared,
      };
    }
    candidateModuleId = moduleResolution.moduleId;
    if (fileType === 'candidate_module_definition') {
      try {
        const identity = resolveSpecModuleIdentity(JSON.parse(content));
        if (!identity.valid || identity.moduleCode !== candidateModuleId) {
          return {
            success: false,
            error: `MODULE_DEFINITION_INVALID: module.json Candidate must declare canonical module_code ${candidateModuleId}. ${identity.errors.join('; ')}`,
            hard_stop: false,
            retry_allowed: true,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `MODULE_DEFINITION_INVALID: ${(error as Error).message}`,
          hard_stop: false,
          retry_allowed: true,
        };
      }
    }
  }
  const targetFilename = resolveTargetFilename(
    fileType,
    content,
    baseDir,
    workItemId,
    candidateModuleId
  );
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
      baseDir
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
      baseDir
    );
  }
  if (targetFilename.replace(/\\/g, '/').endsWith('/tasks.md') || targetFilename === 'tasks.md') {
    const validation = validateTaskArtifactContract(content);
    if (!validation.valid) {
      return {
        success: false,
        error: 'INVALID_TASK_ARTIFACT_CONTRACT',
        hard_stop: false,
        retry_allowed: true,
        contract_version: validation.contract_version,
        validation_errors: validation.issues.filter(issue => issue.severity === 'error'),
        validation_warnings: validation.issues.filter(issue => issue.severity === 'warning'),
        message:
          `Artifact "${targetFilename}" failed task-document/v1 validation and was NOT written to disk. ` +
          'Use canonical IDs, refs, and typed verification_commands, then retry.',
      };
    }
  }
  if (fileType === 'design' || fileType === 'candidate_design' || fileType === 'design_delta') {
    const requirement = await resolveSystemGovernanceRequirement(workItemId, baseDir);
    if (requirement.blocking_issue) {
      return {
        success: false,
        error: 'DESIGN_SCOPE_AUTHORITY_UNAVAILABLE',
        hard_stop: false,
        retry_allowed: true,
        source_path: requirement.source_path,
        message:
          `${requirement.blocking_issue}. ` +
          'The design artifact was NOT written because Runtime cannot derive its required analysis_scope.',
      };
    }
    const requiredScope = requirement.required ? 'system_governance' : 'solution_design';
    const declaredScope = readDeclaredDesignAnalysisScope(content);
    const allowedScopes =
      requirement.required && fileType !== 'design_delta'
        ? ['system_governance', 'solution_design']
        : [requiredScope];
    if (!declaredScope || !allowedScopes.includes(declaredScope)) {
      return {
        success: false,
        error: 'DESIGN_SCOPE_CONTRACT_MISMATCH',
        hard_stop: false,
        retry_allowed: true,
        required_analysis_scope: requiredScope,
        allowed_analysis_scopes: allowedScopes,
        declared_analysis_scope: declaredScope,
        derivation_reasons: requirement.reasons,
        source_path: requirement.source_path,
        message:
          `Design artifact must declare one allowed analysis_scope: ${allowedScopes.join(', ')}. ` +
          'A governance-required WI must contain at least one system_governance design; module projections may use solution_design. The artifact was NOT written.',
      };
    }
  }
  if (isJsonArtifact(targetFilename)) {
    try {
      content = normalizeCoreJsonArtifact(targetFilename, content, workItemId, baseDir);
    } catch (error: any) {
      return {
        success: false,
        error: `ARTIFACT_NORMALIZATION_FAILED: ${error?.message ?? String(error)}`,
        hard_stop: false,
        retry_allowed: true,
      };
    }
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
  const wiDir = workItemRoot(baseDir, workItemId);
  if (isCandidateGovernancePath(targetFilename)) {
    const state = await readAuthoritativeState({
      deps,
      projectRoot: baseDir,
      workItemId,
    });
    if (!state.current_state) {
      return {
        success: false,
        error: 'CANDIDATE_FREEZE_STATE_UNAVAILABLE',
        hard_stop: false,
        retry_allowed: true,
        message:
          'Candidate write denied because the authoritative StateManager state could not be read.',
      };
    }
    if (isCandidateFrozenState(state.current_state)) {
      return {
        success: false,
        error: 'CANDIDATE_FROZEN',
        hard_stop: false,
        retry_allowed: false,
        current_state: state.current_state,
        state_authority: state.source,
        message:
          `Candidate artifacts are frozen while WI state is ${state.current_state}. ` +
          'Invalidate the approval and recover to candidate_preparing before editing.',
      };
    }
  }
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
